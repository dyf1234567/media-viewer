/** 文件大小格式化 */
export function fmtBytes(n: number): string {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/** 视频时长 时:分:秒 */
export function fmtDuration(ms: number): string {
  if (!ms || ms < 0) return '0:00'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function fmtDate(ts: number): string {
  if (!ts) return '-'
  const d = new Date(ts)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fmtExposure(t: number | null): string {
  if (!t) return '-'
  if (t >= 1) return `${t}s`
  return `1/${Math.round(1 / t)}s`
}

/** 本地文件协议 URL(带版本参数用于缓存失效) */
export function fileUrl(p: string, version?: number | string): string {
  const u = `mvfile://f/${encodeURIComponent(p)}`
  return version !== undefined ? `${u}?v=${version}` : u
}

export function thumbUrl(asset: { thumbPath: string; thumbDone: number; fileModifiedAt: number }): string {
  return fileUrl(asset.thumbPath, asset.thumbDone === 1 ? asset.fileModifiedAt : 0)
}

export function sourceUrl(asset: { filePath: string; fileModifiedAt: number }): string {
  return fileUrl(asset.filePath, asset.fileModifiedAt)
}

export function rgbCss(c: { r: number; g: number; b: number }): string {
  return `rgb(${c.r}, ${c.g}, ${c.b})`
}
