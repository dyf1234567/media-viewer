import { spawn } from 'child_process'
import { promises as fsp } from 'fs'
import { dialog, BrowserWindow } from 'electron'
import sharp from 'sharp'
import { getDb, getAssetRow } from './db'
import { ffmpegBinary, getVideoInfoOf } from './video'

const DIFF_PREVIEW_MAX = 2048
const DIFF_EXPORT_MAX = 8192

export interface DiffResult {
  base64: string
  width: number
  height: number
  aligned: boolean
  note: string | null
}

function requireImageAsset(id: number): { path: string; name: string; w: number; h: number } {
  const row = getAssetRow(id)
  if (!row || row.kind !== 'image') throw new Error('对比差值仅支持图片素材')
  if (row.missing) throw new Error(`「${row.file_name}」文件缺失`)
  return { path: row.file_path, name: row.file_name, w: row.width, h: row.height }
}

async function loadRaw(file: string, w: number, h: number): Promise<Buffer> {
  const { data } = await sharp(file, { failOn: 'none' })
    .resize(w, h, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return data
}

/** 逐像素差值图:两图尺寸不同时按左图对齐并提示;超大图自动降采样 */
export async function computeDiff(idA: number, idB: number, forExport: boolean): Promise<DiffResult> {
  const a = requireImageAsset(idA)
  const b = requireImageAsset(idB)
  const aligned = a.w === b.w && a.h === b.h
  const cap = forExport ? DIFF_EXPORT_MAX : DIFF_PREVIEW_MAX
  let w = a.w
  let h = a.h
  if (Math.max(w, h) > cap) {
    const r = cap / Math.max(w, h)
    w = Math.max(1, Math.round(w * r))
    h = Math.max(1, Math.round(h * r))
  }
  const [ra, rb] = await Promise.all([loadRaw(a.path, w, h), loadRaw(b.path, w, h)])
  const out = Buffer.alloc(w * h * 3)
  for (let i = 0; i < out.length; i++) {
    // 差异放大 4 倍便于观察
    out[i] = Math.min(255, Math.abs(ra[i] - rb[i]) * 4)
  }
  const png = await sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer()
  const note = !aligned
    ? `两图尺寸不同(${a.w}×${a.h} vs ${b.w}×${b.h}),已按左图对齐`
    : Math.max(a.w, a.h) > cap
      ? `超大图已降采样至 ${w}×${h} 计算差值`
      : null
  return { base64: png.toString('base64'), width: w, height: h, aligned, note }
}

/** 合成导出:并排 / 擦除(含分割线) / 差值 / 闪烁当前帧 */
export async function exportComposite(args: {
  aId: number
  bId: number
  type: 'side' | 'wipe' | 'diff' | 'flicker'
  wipePct: number
  flickerSide: 'a' | 'b'
}): Promise<string | null> {
  const win = BrowserWindow.getAllWindows()[0]
  const r = await dialog.showSaveDialog(win, {
    title: '导出对比结果',
    defaultPath: `对比结果-${Date.now()}.png`,
    filters: [{ name: 'PNG 图片', extensions: ['png'] }]
  })
  if (r.canceled || !r.filePath) return null

  const a = requireImageAsset(args.aId)
  const b = requireImageAsset(args.bId)

  if (args.type === 'diff') {
    const d = await computeDiff(args.aId, args.bId, true)
    await fsp.writeFile(r.filePath, Buffer.from(d.base64, 'base64'))
    return r.filePath
  }

  const imgA = sharp(a.path, { failOn: 'none' }).flatten({ background: '#000' })
  const imgB = sharp(b.path, { failOn: 'none' }).flatten({ background: '#000' })

  if (args.type === 'flicker') {
    await (args.flickerSide === 'a' ? imgA : imgB).clone().png().toFile(r.filePath)
    return r.filePath
  }

  if (args.type === 'side') {
    const H = Math.max(a.h, b.h)
    const bufA = await imgA.clone().resize({ height: H, fit: 'inside' }).png().toBuffer()
    const bufB = await imgB.clone().resize({ height: H, fit: 'inside' }).png().toBuffer()
    const mA = await sharp(bufA).metadata()
    const mB = await sharp(bufB).metadata()
    await sharp({
      create: {
        width: (mA.width ?? 0) + (mB.width ?? 0) + 8,
        height: H,
        channels: 3,
        background: '#000'
      }
    })
      .composite([
        { input: bufA, left: 0, top: 0 },
        { input: bufB, left: (mA.width ?? 0) + 8, top: 0 }
      ])
      .png()
      .toFile(r.filePath)
    return r.filePath
  }

  // wipe:以左图为底,右图按分割位置覆盖,画分割线
  const W = a.w
  const H = a.h
  const cutX = Math.max(0, Math.min(W, Math.round((args.wipePct / 100) * W)))
  const bufB = await imgB.clone().resize(W, H, { fit: 'fill' }).extract({ left: 0, top: 0, width: Math.max(1, W - cutX), height: H }).png().toBuffer()
  const line = Buffer.from(
    `<svg width="${W}" height="${H}"><rect x="${cutX - 2}" y="0" width="4" height="${H}" fill="#ff5d5d"/></svg>`
  )
  await sharp({ create: { width: W, height: H, channels: 3, background: '#000' } })
    .composite([
      { input: await imgA.clone().resize(W, H, { fit: 'fill' }).png().toBuffer(), left: 0, top: 0 },
      { input: bufB, left: cutX, top: 0 },
      { input: line, left: 0, top: 0 }
    ])
    .png()
    .toFile(r.filePath)
  return r.filePath
}

// ---------- PSNR / SSIM 逐帧质量指标 ----------

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

let qualityRunning = false

/** 逐帧 PSNR/SSIM:参考片为左,被测片缩放到参考片尺寸 */
export async function computeQuality(refId: number, testId: number): Promise<QualityReport> {
  if (qualityRunning) throw new Error('已有质量分析正在进行,请稍候')
  qualityRunning = true
  try {
    const [refInfo, testInfo] = await Promise.all([getVideoInfoOf(refId), getVideoInfoOf(testId)])
    if (!refInfo || !testInfo) throw new Error('无法读取视频信息')
    const rows = [getAssetRow(refId), getAssetRow(testId)]
    if (!rows[0] || !rows[1]) throw new Error('素材不存在')
    if (rows[0]!.kind !== 'video' || rows[1]!.kind !== 'video') throw new Error('质量分析仅支持视频')
    const ref = refInfo
    const test = testInfo
    const mismatch = Math.abs(ref.durationMs - test.durationMs) > Math.max(500, ref.durationMs * 0.02)
    const W = ref.width
    const H = ref.height
    const scaled = test.width !== W || test.height !== H
    const baseArgs = ['-i', rows[0]!.file_path, '-i', rows[1]!.file_path]
    // stats_file=- :逐帧指标输出到 stdout(此 ffmpeg 版本不再向 stderr 打逐帧行)
    const testChain = scaled
      ? `[1:v]scale=${W}:${H}:flags=bicubic,format=yuv420p[t]`
      : '[1:v]format=yuv420p[t]'
    const buildFilter = (metric: string): string =>
      `${testChain};[0:v]format=yuv420p[r];[r][t]${metric}=stats_file=-`

    const psnrOut = await runFfmpegCollect([
      ...baseArgs,
      '-lavfi',
      buildFilter('psnr'),
      '-f',
      'null',
      '-'
    ])
    const ssimOut = await runFfmpegCollect([
      ...baseArgs,
      '-lavfi',
      buildFilter('ssim'),
      '-f',
      'null',
      '-'
    ])

    const psnrMap = new Map<number, number>()
    for (const m of psnrOut.matchAll(/n:(\d+)\s+mse_avg:[\d.]+.*?psnr_avg:(inf|[\d.]+)/g)) {
      psnrMap.set(Number(m[1]), m[2] === 'inf' ? 100 : Number(m[2]))
    }
    const ssimMap = new Map<number, number>()
    for (const m of ssimOut.matchAll(/n:(\d+).*?All:([\d.]+)/g)) {
      ssimMap.set(Number(m[1]), Number(m[2]))
    }
    const total = Math.max(psnrMap.size, ssimMap.size)
    const frames: QualityFrame[] = []
    for (let i = 1; i <= total; i++) {
      frames.push({
        n: i,
        psnr: psnrMap.get(i) ?? NaN,
        ssim: ssimMap.get(i) ?? NaN
      })
    }
    if (!frames.length) throw new Error('未能解析出逐帧指标(编码可能不受支持)')

    const validPsnr = frames.filter((f) => !isNaN(f.psnr))
    const validSsim = frames.filter((f) => !isNaN(f.ssim))
    const avgPsnr = validPsnr.reduce((s, f) => s + f.psnr, 0) / (validPsnr.length || 1)
    const avgSsim = validSsim.reduce((s, f) => s + f.ssim, 0) / (validSsim.length || 1)
    let worstFrame = 1
    let worstPsnr = Infinity
    for (const f of validPsnr) {
      if (f.psnr < worstPsnr) {
        worstPsnr = f.psnr
        worstFrame = f.n
      }
    }
    const worstSsim = validSsim.reduce((m, f) => Math.min(m, f.ssim), 1)

    const noteParts: string[] = []
    if (test.width !== W || test.height !== H) {
      noteParts.push(`被测片已缩放至参考片 ${W}×${H} 后计算`)
    }
    if (mismatch) {
      noteParts.push('两段视频时长不匹配,指标以较短一方为准')
    }
    return {
      frames,
      avgPsnr: Math.round(avgPsnr * 100) / 100,
      avgSsim: Math.round(avgSsim * 10000) / 10000,
      worstFrame,
      worstPsnr: Math.round(worstPsnr * 100) / 100,
      worstSsim: Math.round(worstSsim * 10000) / 10000,
      fps: ref.fps || 25,
      durationMismatch: mismatch,
      note: noteParts.join(';') || null
    }
  } finally {
    qualityRunning = false
  }
}

function runFfmpegCollect(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBinary(), args, { windowsHide: true })
    // 逐帧指标行在 stdout(stats_file=-);stderr 只有进度与汇总
    let stdout = ''
    let stderr = ''
    let done = false
    const timer = setTimeout(() => {
      if (!done) {
        proc.kill()
        reject(new Error('质量分析超时(视频过长)'))
      }
    }, 600000)
    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
      if (stdout.length > 4 * 1024 * 1024) stdout = stdout.slice(-2 * 1024 * 1024)
    })
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
      if (stderr.length > 1024 * 1024) stderr = stderr.slice(-512 * 1024)
    })
    proc.on('error', (e) => {
      done = true
      clearTimeout(timer)
      reject(e)
    })
    proc.on('close', (code) => {
      done = true
      clearTimeout(timer)
      if (code !== 0 && !stdout) {
        reject(new Error(`ffmpeg 退出码 ${code}:${stderr.slice(-300)}`))
        return
      }
      resolve(stdout)
    })
  })
}

// ---------- 盲测投票战绩(按文件内容长期保存) ----------

function normalizePair(aHash: string, bHash: string): { lo: string; hi: string } {
  return aHash <= bHash ? { lo: aHash, hi: bHash } : { lo: bHash, hi: aHash }
}

function toAssetPair(aId: number, bId: number): { lo: string; hi: string; aIsLo: boolean } {
  const ra = getAssetRow(aId)
  const rb = getAssetRow(bId)
  if (!ra || !rb) throw new Error('素材不存在')
  const p = normalizePair(ra.content_hash, rb.content_hash)
  return { ...p, aIsLo: ra.content_hash === p.lo }
}

export function recordVote(aId: number, bId: number, winnerIsA: boolean): PairScore {
  const db = getDb()
  const { lo, hi, aIsLo } = toAssetPair(aId, bId)
  const winner = winnerIsA === aIsLo ? 'a' : 'b' // a/b 指存储序(lo=a)
  db.prepare('INSERT INTO compare_votes (hash_a, hash_b, winner, created_at) VALUES (?, ?, ?, ?)').run(
    lo,
    hi,
    winner,
    Date.now()
  )
  return getPairScore(aId, bId)
}

export interface PairScore {
  rounds: number
  aWins: number
  bWins: number
}

export function getPairScore(aId: number, bId: number): PairScore {
  const db = getDb()
  const { lo, hi, aIsLo } = toAssetPair(aId, bId)
  const rows = db
    .prepare("SELECT winner FROM compare_votes WHERE hash_a = ? AND hash_b = ?")
    .all(lo, hi) as { winner: string }[]
  let loWins = 0
  let hiWins = 0
  for (const r of rows) {
    if (r.winner === 'a') loWins++
    else hiWins++
  }
  return {
    rounds: rows.length,
    aWins: aIsLo ? loWins : hiWins,
    bWins: aIsLo ? hiWins : loWins
  }
}
