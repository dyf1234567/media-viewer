import * as path from 'path'
import { promises as fsp } from 'fs'
import sharp from 'sharp'
import { getDb, getAssetRow } from './db'
import { thumbsDir } from './library'
import { execBuffer, formatError } from './util'
import { ffmpegBinary } from './video'
import { getVideoInfoOf } from './video'
import { emitAsset } from './emitter'

const THUMB_SIZE = 800

/** 缩略图缓存策略版本:格式/尺寸等生成策略变化时递增,启动时与库内记录比对,不一致则清空重建 */
const THUMB_POLICY_VERSION = 2

/**
 * 缓存策略升级检查:记录的版本与当前不一致时,清空全部旧缩略图并标记重建。
 * 缩略图可再生,清理无数据风险;重建走既有的分批补建队列。
 */
export async function checkThumbPolicy(): Promise<boolean> {
  const db = getDb()
  const row = db.prepare('SELECT v FROM settings WHERE k = ?').get('thumb_policy') as
    | { v: string }
    | undefined
  const stored = row?.v
  if (stored === String(THUMB_POLICY_VERSION)) return false

  // 清空 thumbs 目录
  let names: string[] = []
  try {
    names = await fsp.readdir(thumbsDir())
  } catch {
    names = []
  }
  for (const n of names) {
    await fsp.rm(path.join(thumbsDir(), n), { force: true }).catch(() => {})
  }
  // 全部标记为缺缩略图,交给补建队列分批重建
  db.prepare('UPDATE assets SET thumb_done = 0 WHERE thumb_done != 0').run()
  db.prepare(
    'INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'
  ).run('thumb_policy', String(THUMB_POLICY_VERSION))
  return true
}

class ThumbQueue {
  private pending: number[] = []
  private active = 0
  private max = Math.max(2, Math.min(4, Math.floor(require('os').cpus().length / 2)))

  push(assetId: number): void {
    if (this.pending.includes(assetId)) return
    this.pending.push(assetId)
    this.pump()
  }

  private pump(): void {
    while (this.active < this.max && this.pending.length) {
      const id = this.pending.shift()!
      this.active++
      generateThumb(id)
        .catch(() => {
          // 失败标记为 -1,下次启动不再反复尝试(手动操作可重置)
          try {
            getDb().prepare('UPDATE assets SET thumb_done = -1 WHERE id = ? AND thumb_done = 0').run(id)
          } catch {
            /* 忽略 */
          }
        })
        .finally(() => {
          this.active--
          this.pump()
        })
    }
  }
}

const queue = new ThumbQueue()

export function enqueueThumb(assetId: number): void {
  queue.push(assetId)
}

function thumbTarget(hash: string): string {
  return path.join(thumbsDir(), `${hash}.webp`)
}

async function generateThumb(assetId: number): Promise<void> {
  const row = getAssetRow(assetId)
  if (!row || row.missing) return
  const target = thumbTarget(row.content_hash)
  try {
    await fsp.access(target)
    if (row.thumb_done !== 1) {
      getDb().prepare('UPDATE assets SET thumb_done = 1 WHERE id = ?').run(assetId)
      emitAsset(assetId)
    }
    return
  } catch {
    /* 需要生成 */
  }

  if (row.kind === 'image') {
    if (row.ext === 'ico') {
      await thumbFromIco(row.file_path, target)
    } else {
      const meta = await sharp(row.file_path, { failOn: 'none' }).metadata()
      await sharp(row.file_path, { failOn: 'none' })
        .rotate()
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(target)
      // rotate() 后的显示尺寸(带 EXIF 方向)
      if (meta.orientation && meta.orientation >= 5) {
        getDb()
          .prepare('UPDATE assets SET width = ?, height = ? WHERE id = ?')
          .run(meta.height ?? 0, meta.width ?? 0, assetId)
      }
    }
  } else {
    const info = await getVideoInfoOf(assetId)
    const seek = info && info.durationMs > 1500 ? 1 : 0
    const png = await execBuffer(
      ffmpegBinary(),
      [
        '-ss',
        String(seek),
        '-i',
        row.file_path,
        '-frames:v',
        '1',
        '-f',
        'image2',
        '-vcodec',
        'png',
        'pipe:1'
      ],
      60000
    )
    await sharp(png, { failOn: 'none' })
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(target)
  }

  getDb().prepare('UPDATE assets SET thumb_done = 1 WHERE id = ?').run(assetId)
  emitAsset(assetId)
}

/** ICO:提取最大的一帧(PNG 压缩帧直接抽出,否则用 sharp 解位图) */
async function thumbFromIco(file: string, target: string): Promise<void> {
  const buf = await fsp.readFile(file)
  const count = buf.readUInt16LE(4)
  let best = -1
  let bestSize = 0
  for (let i = 0; i < count; i++) {
    const off = 6 + i * 16
    let w = buf[off]
    if (w === 0) w = 256
    if (w > bestSize) {
      bestSize = w
      best = i
    }
  }
  if (best < 0) throw new Error('ICO 内无帧')
  const off = 6 + best * 16
  const size = buf.readUInt32LE(off + 8)
  const start = buf.readUInt32LE(off + 12)
  const frame = buf.subarray(start, start + size)
  let input: Buffer
  if (frame[0] === 0x89 && frame[1] === 0x50) {
    input = frame // PNG 帧
  } else {
    // BMP 帧:去掉 14 字节 BITMAPFILEHEADER 后是从下往上的像素数据,交给 sharp 处理不了,直接解析尺寸并放大绘制
    const width = buf[off] === 0 ? 256 : buf[off]
    const height = buf[off + 1] === 0 ? 256 : buf[off + 1]
    const bpp = buf.readUInt16LE(off + 6) || 32
    input = await renderIcoBmp(frame, width, height, bpp)
  }
  await sharp(input, { failOn: 'none' })
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(target)
  // 记录 ICO 的真实尺寸(按文件路径回写,调用时该素材刚导入)
  const meta = await sharp(input, { failOn: 'none' }).metadata()
  getDb()
    .prepare(
      'UPDATE assets SET width = ?, height = ? WHERE id = (SELECT id FROM assets WHERE file_path = ?)'
    )
    .run(meta.width ?? 32, meta.height ?? 32, file)
}

/** 将 ICO 内的 BMP 帧转为 PNG buffer(32/24bpp) */
async function renderIcoBmp(frame: Buffer, width: number, height: number, bpp: number): Promise<Buffer> {
  const headerSize = frame.readUInt32LE(0)
  if (headerSize < 40 || (bpp !== 32 && bpp !== 24)) {
    throw new Error(`不支持的 ICO 位图格式 (${bpp}bpp)`)
  }
  const data = frame.subarray(headerSize)
  const bytes = bpp / 8
  const rowSize = Math.ceil((width * bpp) / 32) * 4
  const out = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y
    for (let x = 0; x < width; x++) {
      const si = srcY * rowSize + x * bytes
      const di = (y * width + x) * 4
      out[di] = data[si + 2]
      out[di + 1] = data[si + 1]
      out[di + 2] = data[si]
      out[di + 3] = bytes === 4 ? data[si + 3] : 255
    }
  }
  return await sharp(out, {
    raw: { width, height, channels: 4 }
  })
    .png()
    .toBuffer()
}

/** 启动时补建缺失缩略图 */
export async function backfillThumbs(limit = 400): Promise<void> {
  const rows = getDb()
    .prepare(
      `SELECT id FROM assets WHERE thumb_done = 0 AND missing = 0 AND deleted_at IS NULL LIMIT ?`
    )
    .all(limit) as { id: number }[]
  for (const r of rows) enqueueThumb(r.id)
}

/** 强制重建 */
export async function rebuildThumb(assetId: number): Promise<void> {
  const row = getAssetRow(assetId)
  if (!row) return
  try {
    await fsp.rm(thumbTarget(row.content_hash), { force: true })
  } catch (e) {
    throw new Error(`清理旧缩略图失败: ${formatError(e)}`)
  }
  getDb().prepare('UPDATE assets SET thumb_done = 0 WHERE id = ?').run(assetId)
  enqueueThumb(assetId)
}

/** 缩略图缓存 LRU 清理 */
export async function trimThumbCache(capMB: number): Promise<void> {
  const dir = thumbsDir()
  let entries: { p: string; size: number; mtime: number }[]
  try {
    const names = await fsp.readdir(dir)
    entries = []
    for (const n of names) {
      const p = path.join(dir, n)
      const st = await fsp.stat(p)
      entries.push({ p, size: st.size, mtime: st.mtimeMs })
    }
  } catch {
    return
  }
  const cap = capMB * 1024 * 1024
  let total = entries.reduce((s, e) => s + e.size, 0)
  if (total <= cap) return
  entries.sort((a, b) => a.mtime - b.mtime)
  for (const e of entries) {
    if (total <= cap) break
    try {
      await fsp.rm(e.p, { force: true })
      total -= e.size
      // 顺带把对应素材标记为缺缩略图,下次启动补建
      const hash = path.basename(e.p, '.webp')
      getDb().prepare('UPDATE assets SET thumb_done = 0 WHERE content_hash = ?').run(hash)
    } catch {
      /* 跳过 */
    }
  }
}
