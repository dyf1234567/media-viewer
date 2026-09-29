import * as path from 'path'
import { promises as fsp } from 'fs'
import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import type { PlayInfo, VideoInfo } from '../../shared/types'
import { execText, execOk, extOf } from './util'
import { getDb, getAssetRow } from './db'
import { videoCacheDir } from './library'
import { broadcast } from './emitter'

/** 打包后二进制位于 app.asar.unpacked,这里做路径重定向 */
function unpacked(p: string | undefined | null, fallback: string): string {
  if (!p) return fallback
  return p.includes('app.asar') ? p.replace('app.asar', 'app.asar.unpacked') : p
}

const FFMPEG = unpacked(ffmpegPath as unknown as string, 'ffmpeg')
const FFPROBE = unpacked(ffprobeStatic?.path, 'ffprobe')

/** Chromium 可直接解码的视频编码 */
const PLAYABLE_CODECS = ['h264', 'vp8', 'vp9', 'av1']
/** Chromium 可直接播放的容器 */
const DIRECT_CONTAINERS = ['mp4', 'm4v', 'webm', 'mov']
/** 需要转封装的容器(编码可播) */
const REMUX_CONTAINERS = ['mkv', 'avi']
const PLAYABLE_AUDIO = ['aac', 'mp3', 'opus', 'vorbis', 'flac']

interface ProbeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  duration?: string
}

interface ProbeResult {
  streams: ProbeStream[]
  format: { duration?: string; bit_rate?: string }
}

async function probe(file: string): Promise<ProbeResult> {
  const out = await execText(
    FFPROBE,
    ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', file],
    30000
  )
  return JSON.parse(out) as ProbeResult
}

export async function readVideoInfo(file: string): Promise<VideoInfo> {
  const j = await probe(file)
  const v = j.streams.find((s) => s.codec_type === 'video')
  const a = j.streams.find((s) => s.codec_type === 'audio')
  if (!v) throw new Error('未找到视频流')
  const fps = parseFps(v.avg_frame_rate)
  const durationSec = parseFloat(j.format.duration ?? v.duration ?? '0') || 0
  const bitrate = parseInt(j.format.bit_rate ?? '0', 10) || 0
  return {
    width: v.width ?? 0,
    height: v.height ?? 0,
    durationMs: Math.round(durationSec * 1000),
    bitrate,
    fps,
    videoCodec: v.codec_name ?? '',
    audioCodec: a?.codec_name ?? null,
    hasAudio: !!a,
    container: extOf(file)
  }
}

function parseFps(rate?: string): number {
  if (!rate) return 0
  const [num, den] = rate.split('/')
  const n = parseFloat(num)
  const d = parseFloat(den ?? '1')
  if (!n || !d) return 0
  return Math.round((n / d) * 100) / 100
}

/** 读取(并缓存)素材的视频信息 */
export async function getVideoInfoOf(assetId: number): Promise<VideoInfo | null> {
  const row = getAssetRow(assetId)
  if (!row || row.kind !== 'video') return null
  if (row.video_info) return JSON.parse(row.video_info) as VideoInfo
  try {
    const info = await readVideoInfo(row.file_path)
    getDb()
      .prepare('UPDATE assets SET video_info = ?, width = ?, height = ?, duration_ms = ? WHERE id = ?')
      .run(JSON.stringify(info), info.width, info.height, info.durationMs, assetId)
    return info
  } catch (e) {
    throw new Error(`读取视频信息失败: ${(e as Error).message}`)
  }
}

/** 正在播放/暂停中的文件(缓存清理时保护) */
const playing = new Map<string, number>()

export function setPlaying(file: string, on: boolean): void {
  const cur = playing.get(file) ?? 0
  const next = on ? cur + 1 : Math.max(0, cur - 1)
  if (next <= 0) playing.delete(file)
  else playing.set(file, next)
}

export function isPlaying(file: string): boolean {
  return playing.has(file)
}

function remuxTarget(hash: string, codec: string): string {
  const ext = codec === 'vp8' || codec === 'vp9' ? 'webm' : 'mp4'
  return path.join(videoCacheDir(), `${hash}.${ext}`)
}

/** 播放信息分档:direct 直连 / remux 转封装 / unsupported 不支持 */
export async function getPlayInfo(assetId: number, fileUrl: (p: string) => string): Promise<PlayInfo> {
  const row = getAssetRow(assetId)
  if (!row || row.kind !== 'video') throw new Error('不是视频素材')
  const info = await getVideoInfoOf(assetId)
  if (!info) throw new Error('无法读取视频信息')

  if (!PLAYABLE_CODECS.includes(info.videoCodec)) {
    return {
      tier: 'unsupported',
      reason: `视频编码 ${info.videoCodec.toUpperCase()} 无法在应用内播放,应用不会在后台偷偷重编码`
    }
  }
  const audioOk = !info.hasAudio || PLAYABLE_AUDIO.includes(info.audioCodec ?? '')
  if (DIRECT_CONTAINERS.includes(info.container) && audioOk) {
    return { tier: 'direct', url: fileUrl(row.file_path) }
  }
  // 其余情况:容器不兼容(mkv/avi)或音频编码不可播 → 转封装(可播编码流复制,不重编码)
  const target = remuxTarget(row.content_hash, info.videoCodec)
  try {
    await fsp.access(target)
    // 命中缓存视为一次使用,续期缓存文件的 mtime(LRU 只看自家缓存目录,不碰源文件)
    fsp.utimes(target, new Date(), new Date()).catch(() => {})
    return { tier: 'remux', url: fileUrl(target) }
  } catch {
    /* 缓存不存在,执行转封装 */
  }
  const tmp = target + '.tmp' + path.extname(target)
  const args = ['-y', '-i', row.file_path, '-c', 'copy']
  if (!audioOk) args.push('-an')
  if (path.extname(target) === '.mp4') args.push('-movflags', '+faststart')
  args.push(tmp)
  await execOk(FFMPEG, args, 180000)
  await fsp.rename(tmp, target)
  return { tier: 'remux', url: fileUrl(target) }
}

/** 视频预览缓存 LRU 清理(不碰播放中的文件) */
export async function trimVideoCache(capMB: number): Promise<void> {
  const dir = videoCacheDir()
  let entries: { p: string; size: number; mtime: number }[]
  try {
    const names = await fsp.readdir(dir)
    entries = []
    for (const n of names) {
      if (n.includes('.tmp')) continue
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
  // 最久未用(mtime 最旧)的先清
  entries.sort((a, b) => a.mtime - b.mtime)
  for (const e of entries) {
    if (total <= cap) break
    if (isPlaying(e.p)) continue
    try {
      await fsp.rm(e.p, { force: true })
      total -= e.size
    } catch {
      /* 单个文件清理失败跳过 */
    }
  }
}

/** 供播放通知 */
export function notifyPlaying(file: string, on: boolean): void {
  setPlaying(file, on)
}

export function ffmpegBinary(): string {
  return FFMPEG
}

export function broadcastPlaying(): void {
  broadcast('video:playing-state', { files: [...playing.keys()] })
}
