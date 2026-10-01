import sharp from 'sharp'
import type { RGB } from '../../shared/types'
import { classifyColor } from '../../shared/colors'

/** 从缩小的像素中提取最多 6 个主题色与色系分类 */
export async function extractColors(
  file: string
): Promise<{ colors: RGB[]; family: string | null }> {
  const { data, info } = await sharp(file, { failOn: 'none' })
    .resize(64, 64, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>()
  let sr = 0
  let sg = 0
  let sb = 0
  let n = 0
  const ch = info.channels
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    sr += r
    sg += g
    sb += b
    n++
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const cur = buckets.get(key)
    if (cur) {
      cur.count++
      cur.r += r
      cur.g += g
      cur.b += b
    } else {
      buckets.set(key, { count: 1, r, g, b })
    }
  }

  const sorted = [...buckets.values()].sort((a, b) => b.count - a.count)
  const picked: RGB[] = []
  for (const bkt of sorted) {
    if (picked.length >= 6) break
    const c: RGB = {
      r: Math.round(bkt.r / bkt.count),
      g: Math.round(bkt.g / bkt.count),
      b: Math.round(bkt.b / bkt.count)
    }
    const far = picked.every((p) => dist(p, c) > 90)
    if (far) picked.push(c)
  }
  // 数量不足时补充平均色
  if (picked.length < 6 && n > 0) {
    const avg: RGB = { r: Math.round(sr / n), g: Math.round(sg / n), b: Math.round(sb / n) }
    if (picked.every((p) => dist(p, avg) > 40)) picked.push(avg)
  }

  const family = n > 0 ? classifyColor(Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)) : null
  return { colors: picked, family }
}

function dist(a: RGB, b: RGB): number {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/** 色系分类由共享模块提供(渲染端取色面板用同一算法) */
export { classifyColor as classify } from '../../shared/colors'
