import type { Asset } from '@sh/types'
import type { Filters, SortKey } from '../stores/ui'

/** 当前范围的素材(侧栏导航 + 随机模式) */
export function scopeFilter(assets: Asset[], scope: string, albumId: number | null, randomIds: number[] | null): Asset[] {
  if (scope === 'trash') return assets.filter((a) => a.deletedAt !== null)
  const active = assets.filter((a) => a.deletedAt === null)
  switch (scope) {
    case 'favorites':
      return active.filter((a) => a.favorite)
    case 'unclassified':
      return active.filter((a) => a.albumIds.length === 0)
    case 'untagged':
      return active.filter((a) => a.tagIds.length === 0)
    case 'album':
      return albumId === null ? active : active.filter((a) => a.albumIds.includes(albumId))
    case 'random': {
      if (!randomIds?.length) return []
      const order = new Map(randomIds.map((id, i) => [id, i]))
      return active.filter((a) => order.has(a.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!)
    }
    default:
      return active
  }
}

function inShape(a: Asset, shape: string): boolean {
  if (!a.width || !a.height) return false
  const ar = a.width / a.height
  if (shape === 'h') return ar > 1.15
  if (shape === 'v') return ar < 0.87
  return ar >= 0.87 && ar <= 1.15
}

function inDate(ts: number, days: number): boolean {
  if (!ts) return false
  return Date.now() - ts <= days * 24 * 3600 * 1000
}

function inDimension(a: Asset, d: string): boolean {
  const m = Math.max(a.width, a.height)
  switch (d) {
    case '4k':
      return m >= 3840
    case '1080':
      return m >= 1920
    case '720':
      return m >= 1280
    case 'small':
      return m > 0 && m < 1280
    default:
      return true
  }
}

function inSize(a: Asset, s: string): boolean {
  const b = a.fileSize
  switch (s) {
    case '>10mb':
      return b > 10 * 1024 * 1024
    case '>1mb':
      return b > 1024 * 1024
    case '>100kb':
      return b > 100 * 1024
    case '<100kb':
      return b < 100 * 1024
    case '<1mb':
      return b < 1024 * 1024
    default:
      return true
  }
}

/** 多条件组合筛选(全部同时生效) */
export function applyFilters(assets: Asset[], f: Filters, search: string): Asset[] {
  const q = search.trim().toLowerCase()
  return assets.filter((a) => {
    if (q && !a.fileName.toLowerCase().includes(q)) return false
    if (f.formats.length && !f.formats.includes(a.ext)) return false
    if (f.shape && !inShape(a, f.shape)) return false
    if (f.tags.length && !f.tags.every((t) => a.tagIds.includes(t))) return false
    if (f.albums.length && !f.albums.some((al) => a.albumIds.includes(al))) return false
    if (f.colors.length && (!a.colorFamily || !f.colors.includes(a.colorFamily))) return false
    if (f.rating >= 0 && a.rating !== f.rating) return false
    if (f.dateAdded && !inDate(a.importedAt, f.dateAdded)) return false
    if (f.dateModified && !inDate(a.fileModifiedAt, f.dateModified)) return false
    if (f.note === 'yes' && !a.note) return false
    if (f.note === 'no' && a.note) return false
    if (f.dimension && !inDimension(a, f.dimension)) return false
    if (f.size && !inSize(a, f.size)) return false
    return true
  })
}

export function applySort(assets: Asset[], key: SortKey, random: boolean): Asset[] {
  if (random) return assets
  const arr = [...assets]
  switch (key) {
    case 'name-asc':
      return arr.sort((a, b) => a.fileName.localeCompare(b.fileName, 'zh-CN'))
    case 'name-desc':
      return arr.sort((a, b) => b.fileName.localeCompare(a.fileName, 'zh-CN'))
    case 'size-desc':
      return arr.sort((a, b) => b.fileSize - a.fileSize)
    case 'rating-desc':
      return arr.sort((a, b) => b.rating - a.rating || b.id - a.id)
    case 'modified':
      return arr.sort((a, b) => b.fileModifiedAt - a.fileModifiedAt)
    default:
      // 导入顺序:最新导入在前
      return arr.sort((a, b) => b.id - a.id)
  }
}

/** 已启用筛选条件的标签化描述(筛选行展示用) */
export function activeFilterChips(
  f: Filters,
  tagName: (id: number) => string,
  albumName: (id: number) => string
): { key: string; label: string; clear: () => void }[] {
  const chips: { key: string; label: string; clear: () => void }[] = []
  const dim = (key: string, label: string, v: string): void => {
    if (v) chips.push({ key, label, clear: () => ((f as unknown as Record<string, unknown>)[key] = '') })
  }
  if (f.formats.length)
    chips.push({
      key: 'formats',
      label: `格式: ${f.formats.map((s) => s.toUpperCase()).join(' / ')}`,
      clear: () => (f.formats = [])
    })
  dim('shape', `形状: ${f.shape === 'h' ? '横图' : f.shape === 'v' ? '竖图' : '方形'}`, f.shape)
  for (const t of f.tags)
    chips.push({
      key: `tag-${t}`,
      label: `标签: ${tagName(t)}`,
      clear: () => (f.tags = f.tags.filter((x) => x !== t))
    })
  for (const al of f.albums)
    chips.push({
      key: `album-${al}`,
      label: `文件夹: ${albumName(al)}`,
      clear: () => (f.albums = f.albums.filter((x) => x !== al))
    })
  if (f.colors.length)
    chips.push({
      key: 'colors',
      label: `颜色: ${f.colors.map(colorLabel).join(' / ')}`,
      clear: () => (f.colors = [])
    })
  if (f.rating >= 0)
    chips.push({
      key: 'rating',
      label: f.rating === 0 ? '评分: 尚未评分' : `评分: ${'★'.repeat(f.rating)}`,
      clear: () => (f.rating = -1)
    })
  if (f.dateAdded)
    chips.push({
      key: 'dateAdded',
      label: `添加日期: ${f.dateAdded === 1 ? '今天' : `${daysLabel(f.dateAdded)}内`}`,
      clear: () => (f.dateAdded = 0)
    })
  if (f.dateModified)
    chips.push({
      key: 'dateModified',
      label: `修改日期: ${f.dateModified === 1 ? '今天' : `${daysLabel(f.dateModified)}内`}`,
      clear: () => (f.dateModified = 0)
    })
  dim('note', `注释: ${f.note === 'yes' ? '有注释' : '无注释'}`, f.note)
  dim('dimension', `尺寸: ${dimensionLabel(f.dimension)}`, f.dimension)
  dim('size', `大小: ${sizeLabel(f.size)}`, f.size)
  return chips
}

function colorLabel(c: string): string {
  return { red: '红色系', green: '绿色系', blue: '蓝色系', warm: '暖色调', cool: '冷色调' }[c] ?? c
}
function daysLabel(d: number): string {
  return d >= 365 ? '1 年' : d >= 90 ? '3 个月' : d >= 30 ? '30 天' : d >= 7 ? '7 天' : '今天'
}
function dimensionLabel(d: string): string {
  return { '4k': '4K 及以上', '1080': '1080P 及以上', '720': '720P 及以上', small: '小图 (<720P)' }[d] ?? d
}
function sizeLabel(s: string): string {
  return {
    '>10mb': '>10MB',
    '>1mb': '>1MB',
    '>100kb': '>100KB',
    '<100kb': '<100KB',
    '<1mb': '<1MB'
  }[s] ?? s
}

export function countFilters(f: Filters): number {
  return activeFilterChips(f, () => '', () => '').length
}
