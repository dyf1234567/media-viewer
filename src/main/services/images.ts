import * as path from 'path'
import { promises as fsp } from 'fs'
import sharp from 'sharp'
import { getDb, getAssetRow } from './db'
import { sha256File, collisionFreeName, sanitizeFileName } from './util'
import { enqueueThumb } from './thumbs'
import { extractColors } from './colors'
import { emitAsset } from './emitter'
import { suppressWatch } from './watcher'

export interface TransformSpec {
  crop?: { x: number; y: number; w: number; h: number }
  rotate?: number // 90 的倍数,顺时针
  flipH?: boolean
  adjust?: { brightness: number; contrast: number; saturation: number } // -100~100
}

function buildPipeline(src: sharp.Sharp, spec: TransformSpec): sharp.Sharp {
  let img = src
  if (spec.crop) {
    img = img.extract({
      left: Math.max(0, Math.round(spec.crop.x)),
      top: Math.max(0, Math.round(spec.crop.y)),
      width: Math.max(1, Math.round(spec.crop.w)),
      height: Math.max(1, Math.round(spec.crop.h))
    })
  }
  if (spec.rotate) {
    img = img.rotate(spec.rotate)
  }
  if (spec.flipH) {
    img = img.flop()
  }
  if (spec.adjust) {
    const { brightness, contrast, saturation } = spec.adjust
    if (contrast !== 0) {
      const c = Math.max(-100, Math.min(100, contrast))
      const factor = (259 * (c + 255)) / (255 * (259 - c))
      const offset = 128 * (1 - factor)
      img = img.linear(factor, offset)
    }
    const mod: { brightness?: number; saturation?: number } = {}
    if (brightness !== 0) mod.brightness = Math.max(0.1, 1 + brightness / 100)
    if (saturation !== 0) mod.saturation = Math.max(0, 1 + saturation / 100)
    if (mod.brightness !== undefined || mod.saturation !== undefined) {
      img = img.modulate(mod)
    }
  }
  return img
}

/** 应用变换并原子写回原文件,随后同步刷新记录(尺寸/大小/哈希/缩略图/主色) */
export async function applyTransform(assetId: number, spec: TransformSpec): Promise<void> {
  const row = getAssetRow(assetId)
  if (!row) throw new Error('素材不存在')
  if (row.kind !== 'image') throw new Error('仅支持图片素材')
  if (row.missing) throw new Error('文件缺失,无法编辑')

  const dir = path.dirname(row.file_path)
  const ext = row.ext
  // 临时文件保持原扩展名,sharp 按扩展名推断输出格式
  const tmp = path.join(dir, `.${row.file_name}.mvtmp.${ext}`)
  suppressWatch(row.file_path)
  try {
    await buildPipeline(sharp(row.file_path, { failOn: 'none' }), spec).toFile(tmp)
    await fsp.rename(tmp, row.file_path)
  } catch (e) {
    await fsp.rm(tmp, { force: true }).catch(() => {})
    throw new Error(`保存失败: ${(e as Error).message}`)
  }

  await refreshAfterEdit(assetId)
  emitAsset(assetId)
}

/** 编辑写盘后刷新记录(内容哈希、尺寸、大小、缩略图、主色、直方图失效) */
async function refreshAfterEdit(assetId: number): Promise<void> {
  const row = getAssetRow(assetId)
  if (!row) return
  const db = getDb()
  const hash = await sha256File(row.file_path).catch(() => row.content_hash)
  const st = await fsp.stat(row.file_path)
  const meta = await sharp(row.file_path, { failOn: 'none' }).metadata()
  db.prepare(
    `UPDATE assets SET content_hash = ?, file_size = ?, width = ?, height = ?,
       file_modified_at = ?, histogram = NULL, thumb_done = 0 WHERE id = ?`
  ).run(
    hash,
    st.size,
    meta.width ?? row.width,
    meta.height ?? row.height,
    Math.round(st.mtimeMs),
    assetId
  )
  enqueueThumb(assetId)
  // 主色重算
  const colors = await extractColors(row.file_path).catch(() => null)
  if (colors) {
    db.prepare('UPDATE assets SET colors = ?, color_family = ? WHERE id = ?').run(
      JSON.stringify(colors.colors),
      colors.family,
      assetId
    )
  }
}

/** 重命名:同时修改磁盘文件,重名自动加序号 */
export async function renameAsset(assetId: number, newNameRaw: string): Promise<string> {
  const row = getAssetRow(assetId)
  if (!row) throw new Error('素材不存在')
  if (row.deleted_at) throw new Error('回收站内的素材不可重命名')
  const newName = sanitizeFileName(newNameRaw)
  const finalName = `${newName}.${row.ext}`
  if (finalName === row.file_name) return row.file_name
  const dir = path.dirname(row.file_path)
  const actual = await collisionFreeName(dir, finalName)
  const dest = path.join(dir, actual)
  suppressWatch(row.file_path)
  suppressWatch(dest)
  try {
    await fsp.rename(row.file_path, dest)
  } catch (e) {
    throw new Error(`重命名失败: ${(e as Error).message}`)
  }
  getDb().prepare('UPDATE assets SET file_path = ?, file_name = ? WHERE id = ?').run(
    dest,
    actual,
    assetId
  )
  emitAsset(assetId)
  return actual
}

export type ExportFormat = 'png' | 'jpg' | 'webp' | 'bmp' | 'gif'

/** 另存为副本,不改动原图;JPG 透明区合成白底;BMP 为自编码 24 位位图 */
export async function saveAssetAs(
  assetId: number,
  format: ExportFormat,
  destPath: string
): Promise<void> {
  const row = getAssetRow(assetId)
  if (!row || row.kind !== 'image') throw new Error('仅支持导出图片素材')
  let img = sharp(row.file_path, { failOn: 'none' })
  if (format === 'jpg') {
    img = img.flatten({ background: '#ffffff' }).jpeg({ quality: 95 })
  } else if (format === 'png') {
    img = img.png()
  } else if (format === 'webp') {
    img = img.webp({ quality: 95 })
  } else if (format === 'gif') {
    img = img.gif()
  }
  if (format === 'bmp') {
    const buf = await encodeBmp(sharp(row.file_path, { failOn: 'none' }))
    await fsp.writeFile(destPath, buf)
    return
  }
  await img.toFile(destPath)
}

/** 无损 BMP(24bpp,行 4 字节对齐,自底向上) */
async function encodeBmp(img: sharp.Sharp): Promise<Buffer> {
  const { data, info } = await img
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const pixelSize = rowSize * height
  const buf = Buffer.alloc(54 + pixelSize)
  buf.write('BM', 0, 'ascii')
  buf.writeUInt32LE(54 + pixelSize, 2)
  buf.writeUInt32LE(54, 10)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(height, 22)
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(0, 30)
  buf.writeUInt32LE(pixelSize, 34)
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * channels
    const dstRow = 54 + y * rowSize
    for (let x = 0; x < width; x++) {
      const si = srcRow + x * channels
      const di = dstRow + x * 3
      // sharp raw 为 RGB,BMP 需要 BGR
      buf[di] = data[si + 2]
      buf[di + 1] = data[si + 1]
      buf[di + 2] = data[si]
    }
  }
  return buf
}
