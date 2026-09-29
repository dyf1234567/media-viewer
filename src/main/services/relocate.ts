import * as path from 'path'
import { promises as fsp } from 'fs'
import { getDb, getAssetRow } from './db'
import { sha256File, ALL_EXTS, extOf } from './util'
import { emitAsset } from './emitter'
import { enqueueThumb } from './thumbs'

const SKIP_DIRS = new Set(
  [
    'node_modules',
    '$recycle.bin',
    'system volume information',
    'appdata',
    'windows',
    'program files',
    'program files (x86)',
    'programdata',
    '$windows.~bt',
    'intel',
    'nvidia',
    'perflogs'
  ].map((s) => s)
)

/** 按文件内容在指定目录中重新定位缺失素材(大小一致 + 哈希一致才确认) */
export async function relocateAsset(assetId: number, searchRoot: string): Promise<boolean> {
  const row = getAssetRow(assetId)
  if (!row) throw new Error('素材不存在')
  const targetSize = row.file_size
  const targetHash = row.content_hash

  let visited = 0
  const found = await walk(searchRoot, async (file) => {
    visited++
    if (visited > 30000) return true // 超过上限停止
    if (extOf(file) !== row.ext) return false
    const st = await fsp.stat(file).catch(() => null)
    if (!st || st.size !== targetSize) return false
    const hash = await sha256File(file).catch(() => null)
    return hash === targetHash
  })

  if (!found) return false
  getDb()
    .prepare('UPDATE assets SET file_path = ?, original_path = NULL, missing = 0 WHERE id = ?')
    .run(found, assetId)
  if (!row.thumb_done) enqueueThumb(assetId)
  emitAsset(assetId)
  return true
}

/** 深度优先遍历,matcher 返回 true 时停止并返回该文件路径 */
async function walk(root: string, matcher: (f: string) => Promise<boolean>): Promise<string | null> {
  let entries: import('fs').Dirent[]
  try {
    entries = await fsp.readdir(root, { withFileTypes: true })
  } catch {
    return null
  }
  const files: string[] = []
  for (const e of entries) {
    const p = path.join(root, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name.toLowerCase()) || e.name.startsWith('.') || e.name.startsWith('$')) {
        continue
      }
      const hit = await walk(p, matcher)
      if (hit) return hit
    } else if (e.isFile() && ALL_EXTS.includes(extOf(e.name))) {
      files.push(p)
    }
  }
  for (const f of files) {
    if (await matcher(f)) return f
  }
  return null
}
