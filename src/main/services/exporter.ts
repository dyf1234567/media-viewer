// 批量导出:选中素材复制到指定目录,可选转换格式(复用编辑器同款 sharp 管线)
import sharp from 'sharp'
import * as path from 'path'
import { promises as fsp } from 'fs'
import { getAssetRow } from './db'
import { collisionFreePath } from './util'

export interface ExportOptions {
  dir: string
  mode: 'copy' | 'convert'
  format?: 'png' | 'jpg' | 'webp'
  quality?: number
}

export interface ExportReport {
  ok: number
  total: number
  files: string[]
  errors: string[]
}

export async function exportAssets(ids: number[], opts: ExportOptions): Promise<ExportReport> {
  const report: ExportReport = { ok: 0, total: ids.length, files: [], errors: [] }
  for (const id of ids) {
    const row = getAssetRow(id)
    if (!row || row.missing) {
      report.errors.push(`${row?.file_name ?? id}: 文件缺失或已删除`)
      continue
    }
    try {
      const srcBase = path.basename(row.file_name, path.extname(row.file_name))
      const destName =
        opts.mode === 'convert' ? `${srcBase}.${opts.format ?? 'png'}` : path.basename(row.file_path)
      const dest = await collisionFreePath(opts.dir, destName)
      if (opts.mode === 'copy') {
        await fsp.copyFile(row.file_path, dest)
      } else {
        if (row.kind !== 'image') throw new Error('仅图片支持转换格式')
        const q = Math.max(1, Math.min(100, Math.round(opts.quality ?? 90)))
        let img = sharp(row.file_path, { failOn: 'none' })
        if (opts.format === 'jpg') img = img.flatten({ background: '#ffffff' }).jpeg({ quality: q })
        else if (opts.format === 'webp') img = img.webp({ quality: q })
        else img = img.png()
        await img.toFile(dest)
      }
      report.ok++
      report.files.push(path.basename(dest))
    } catch (e) {
      report.errors.push(`${row.file_name}: ${(e as Error).message}`)
    }
  }
  return report
}
