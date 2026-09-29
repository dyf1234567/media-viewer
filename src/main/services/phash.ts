// 感知哈希库层封装:指纹计算与全库比对(纯函数在 phashCore,便于单测)
import { getDb } from './db'
import { computePhash, hammingHex } from './phashCore'

export { computePhash, hammingHex }

export interface SimilarPair {
  aId: number
  bId: number
  aName: string
  bName: string
  dist: number
}

/** 全库两两比对图片指纹,返回距离 ≤ threshold 的相似对(按距离升序) */
export function findSimilarPairs(threshold: number): SimilarPair[] {
  const rows = getDb()
    .prepare(
      `SELECT id, file_name, phash FROM assets
       WHERE kind = 'image' AND deleted_at IS NULL AND missing = 0 AND phash IS NOT NULL`
    )
    .all() as { id: number; file_name: string; phash: string }[]
  const out: SimilarPair[] = []
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const d = hammingHex(rows[i].phash, rows[j].phash)
      if (d <= threshold) {
        out.push({ aId: rows[i].id, bId: rows[j].id, aName: rows[i].file_name, bName: rows[j].file_name, dist: d })
      }
    }
  }
  out.sort((x, y) => x.dist - y.dist)
  return out
}

/** 给存量图片补算指纹(启动维护调用) */
export async function backfillPhashes(limit: number): Promise<number> {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT id, file_path FROM assets
       WHERE kind = 'image' AND deleted_at IS NULL AND missing = 0 AND phash IS NULL
       LIMIT ?`
    )
    .all(limit) as { id: number; file_path: string }[]
  let done = 0
  for (const r of rows) {
    const h = await computePhash(r.file_path)
    if (h) {
      db.prepare('UPDATE assets SET phash = ? WHERE id = ?').run(h, r.id)
      done++
    } else {
      // 失败也标记(空串),避免每次启动反复尝试坏文件
      db.prepare("UPDATE assets SET phash = '' WHERE id = ?").run(r.id)
    }
  }
  return done
}
