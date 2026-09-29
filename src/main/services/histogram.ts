import sharp from 'sharp'
import type { HistogramData, ChannelStat } from '../../shared/types'

/** 计算四通道直方图与统计值(降采样至最长边 1024,防大图卡死) */
export async function computeHistogram(file: string): Promise<HistogramData | null> {
  let data: Buffer
  let info: sharp.OutputInfo
  try {
    ;({ data, info } = await sharp(file, { failOn: 'none' })
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }))
  } catch {
    return null
  }

  const r = new Array<number>(256).fill(0)
  const g = new Array<number>(256).fill(0)
  const b = new Array<number>(256).fill(0)
  const l = new Array<number>(256).fill(0)
  const ch = info.channels
  for (let i = 0; i < data.length; i += ch) {
    const rv = data[i]
    const gv = data[i + 1]
    const bv = data[i + 2]
    r[rv]++
    g[gv]++
    b[bv]++
    l[Math.round(0.299 * rv + 0.587 * gv + 0.114 * bv)]++
  }

  return {
    channels: { r, g, b, l },
    stats: {
      r: statOf(r),
      g: statOf(g),
      b: statOf(b),
      l: statOf(l)
    }
  }
}

function statOf(h: number[]): ChannelStat {
  const total = h.reduce((s, v) => s + v, 0)
  if (!total) {
    return {
      mean: 0,
      median: 0,
      mode: 0,
      modeCount: 0,
      std: 0,
      count: 0,
      levels: 0,
      percentiles: {}
    }
  }
  let sum = 0
  let mode = 0
  let modeCount = 0
  let levels = 0
  for (let v = 0; v < 256; v++) {
    const c = h[v]
    if (!c) continue
    sum += v * c
    levels++
    if (c > modeCount) {
      modeCount = c
      mode = v
    }
  }
  const mean = sum / total
  let varSum = 0
  for (let v = 0; v < 256; v++) {
    if (!h[v]) continue
    varSum += (v - mean) ** 2 * h[v]
  }
  const std = Math.sqrt(varSum / total)

  // 中位数与百分位(1,5,10,25,50,75,90,95,99)
  const percentiles: Record<string, number> = {}
  const wanted = [1, 5, 10, 25, 50, 75, 90, 95, 99]
  let acc = 0
  let wi = 0
  for (let v = 0; v < 256 && wi < wanted.length; v++) {
    acc += h[v]
    while (wi < wanted.length && acc / total >= wanted[wi] / 100) {
      percentiles[String(wanted[wi])] = v
      wi++
    }
  }
  return {
    mean: Math.round(mean * 100) / 100,
    median: percentiles['50'] ?? 0,
    mode,
    modeCount,
    std: Math.round(std * 100) / 100,
    count: total,
    levels,
    percentiles
  }
}
