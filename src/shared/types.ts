// 主进程与渲染进程共享的类型定义
export type AssetKind = 'image' | 'video'
export type StorageMode = 'reference' | 'managed'

export interface RGB {
  r: number
  g: number
  b: number
}

/** 紧凑素材记录:列表与增量事件中使用 */
export interface Asset {
  id: number
  contentHash: string
  filePath: string
  thumbPath: string
  storageMode: StorageMode
  fileName: string
  ext: string
  kind: AssetKind
  width: number
  height: number
  fileSize: number
  durationMs: number | null
  importedAt: number
  fileModifiedAt: number
  rating: number
  favorite: boolean
  note: string
  missing: boolean
  colorFamily: string | null
  colors: RGB[] | null
  thumbDone: number
  deletedAt: number | null
  tagIds: number[]
  albumIds: number[]
}

export interface AssetFull extends Asset {
  exif: ExifInfo | null
  aiMeta: AiMeta | null
  videoInfo: VideoInfo | null
}

export interface ExifInfo {
  make: string | null
  model: string | null
  fNumber: number | null
  exposureTime: number | null
  iso: number | null
  focalLength: number | null
  dateTimeOriginal: string | null
}

export interface AiMeta {
  source: 'a1111' | 'comfyui' | 'other'
  prompt: string | null
  negative: string | null
  params: Record<string, string>
  models: string[]
  workflow: string | null
  raw: string | null
}

export interface VideoInfo {
  width: number
  height: number
  durationMs: number
  bitrate: number
  fps: number
  videoCodec: string
  audioCodec: string | null
  hasAudio: boolean
  container: string
}

export interface ChannelStat {
  mean: number
  median: number
  mode: number
  modeCount: number
  std: number
  count: number
  levels: number
  percentiles: Record<string, number>
}

export interface HistogramData {
  channels: {
    r: number[]
    g: number[]
    b: number[]
    l: number[]
  }
  stats: Record<'r' | 'g' | 'b' | 'l', ChannelStat>
}

export interface Tag {
  id: number
  name: string
  usage: number
}

export interface Album {
  id: number
  name: string
  sourcePath: string | null
  coverAssetId: number | null
  coverThumbPath: string | null
  count: number
}

export interface ImportReport {
  total: number
  imported: number
  reused: number
  skipped: { file: string; reason: string }[]
  failed: { file: string; reason: string }[]
  cancelled: boolean
  albumsCreated: string[]
}

export interface BatchResult {
  id: number
  ok: boolean
  error?: string
}

export interface Settings {
  retentionDays: number
  thumbCacheMB: number
  videoCacheMB: number
}

export interface Appearance {
  /** 界面明暗主题(查看器另有独立的 viewerBg 体系) */
  uiTheme: 'dark' | 'light'
  uiBg: 'aurora' | 'midnight' | 'graphite' | 'basalt' | 'custom'
  uiBgCustom: string
  /** follow = 跟随界面背景底色,保证查看/对比与主界面观感一致 */
  viewerBg: 'follow' | 'v-dark1' | 'v-dark2' | 'v-light1' | 'v-light2' | 'custom'
  viewerBgCustom: string
}

export interface PlayInfo {
  tier: 'direct' | 'remux' | 'unsupported'
  url?: string
  reason?: string
}

export interface WindowState {
  maximized: boolean
  pinned: boolean
}

// ===== 对比工作台 =====

export interface DiffResult {
  base64: string
  width: number
  height: number
  aligned: boolean
  note: string | null
}

export interface QualityFrame {
  n: number
  psnr: number
  ssim: number
}

export interface QualityReport {
  frames: QualityFrame[]
  avgPsnr: number
  avgSsim: number
  worstFrame: number
  worstPsnr: number
  worstSsim: number
  fps: number
  durationMismatch: boolean
  note: string | null
}

export interface PairScore {
  rounds: number
  aWins: number
  bWins: number
}

export type ExportCompareType = 'side' | 'wipe' | 'diff' | 'flicker'
