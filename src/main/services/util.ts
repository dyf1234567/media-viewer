import { createReadStream } from 'fs'
import { createHash } from 'crypto'
import { promises as fsp } from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'

export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'ico', 'svg']
export const VIDEO_EXTS = ['mp4', 'm4v', 'mov', 'mkv', 'webm', 'avi']
export const ALL_EXTS = [...IMAGE_EXTS, ...VIDEO_EXTS]

export function extOf(p: string): string {
  return path.extname(p).slice(1).toLowerCase()
}

export function kindOfExt(ext: string): 'image' | 'video' {
  return VIDEO_EXTS.includes(ext) ? 'video' : 'image'
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  avi: 'video/x-msvideo'
}

export function mimeOf(ext: string): string {
  return MIME[ext] ?? 'application/octet-stream'
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fsp.stat(p)
    return true
  } catch {
    return false
  }
}

export async function sha256File(p: string): Promise<string> {
  const h = createHash('sha256')
  for await (const chunk of createReadStream(p, { highWaterMark: 1 << 20 })) {
    h.update(chunk as Buffer)
  }
  return h.digest('hex')
}

/** 非法字符清理(Windows) */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[\x00-\x1f]/g, '')
    .trim()
  return cleaned || '未命名'
}

/** 在 dir 下找一个不与现有文件冲突的 name.ext(冲突时追加 " (n)") */
export async function collisionFreePath(dir: string, fileName: string): Promise<string> {
  const ext = path.extname(fileName)
  const base = path.basename(fileName, ext)
  let candidate = path.join(dir, fileName)
  let n = 1
  while (await exists(candidate)) {
    candidate = path.join(dir, `${base} (${n})${ext}`)
    n++
  }
  return candidate
}

/** 目录内同名文件冲突时返回改名后的文件名 name (1).ext */
export async function collisionFreeName(dir: string, fileName: string): Promise<string> {
  return path.basename(await collisionFreePath(dir, fileName))
}

export function isSubPath(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child))
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/** 执行命令并收集 stdout 为 Buffer(用于 ffmpeg 出图) */
export function execBuffer(cmd: string, args: string[], timeoutMs = 60000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { windowsHide: true })
    const chunks: Buffer[] = []
    let stderr = ''
    const timer = setTimeout(() => {
      proc.kill()
      reject(new Error('执行超时'))
    }, timeoutMs)
    proc.stdout.on('data', (d: Buffer) => chunks.push(d))
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    proc.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(Buffer.concat(chunks))
      else reject(new Error(stderr.trim() || `进程退出码 ${code}`))
    })
  })
}

/** 执行命令,成功时无返回值,失败抛错 */
export function execOk(cmd: string, args: string[], timeoutMs = 120000): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { windowsHide: true })
    let stderr = ''
    const timer = setTimeout(() => {
      proc.kill()
      reject(new Error('执行超时'))
    }, timeoutMs)
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    proc.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `进程退出码 ${code}`))
    })
  })
}

/** 执行命令并收集 stdout 为文本 */
export function execText(cmd: string, args: string[], timeoutMs = 60000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { windowsHide: true })
    const chunks: Buffer[] = []
    let stderr = ''
    const timer = setTimeout(() => {
      proc.kill()
      reject(new Error('执行超时'))
    }, timeoutMs)
    proc.stdout.on('data', (d: Buffer) => chunks.push(d))
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    proc.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(Buffer.concat(chunks).toString('utf8'))
      else reject(new Error(stderr.trim() || `进程退出码 ${code}`))
    })
  })
}

export function formatError(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
