import { getDb } from './db'
import { getSettings } from './settings'
import { purgeExpired } from './trash'
import { trimThumbCache, backfillThumbs, checkThumbPolicy } from './thumbs'
import { trimVideoCache } from './video'
import { extractColors } from './colors'
import { backfillPhashes } from './phash'
import { readAiMeta } from './meta'
import { emitAsset } from './emitter'

/** 应用启动时自动执行:策略版本检查、缓存压回上限、预览缓存清理、回收区到期清理、缩略图补建 */
export async function runStartupMaintenance(): Promise<void> {
  const s = getSettings()
  try {
    // 缩略图缓存策略升级:旧缩略图自动清理并重建
    const rebuilt = await checkThumbPolicy()
    if (rebuilt) {
      await backfillThumbs(100000)
    }
  } catch {
    /* 清理失败不影响启动 */
  }
  try {
    await purgeExpired(s.retentionDays)
  } catch {
    /* 同上 */
  }
  try {
    await trimThumbCache(s.thumbCacheMB)
  } catch {
    /* 同上 */
  }
  try {
    await trimVideoCache(s.videoCacheMB)
  } catch {
    /* 同上 */
  }
  try {
    await backfillThumbs(400)
  } catch {
    /* 同上 */
  }
  void backfillColors()
  void backfillPhashes(2000)
  void upgradeAiMeta()
}

/** AI 元数据解析策略升级(v2:支持 Qwen 等新文本编码节点;v3:修正空负向兜底):清空旧解析并重读 */
const AI_META_POLICY = 3
async function upgradeAiMeta(): Promise<void> {
  const db = getDb()
  try {
    const row = db.prepare('SELECT v FROM settings WHERE k = ?').get('aimeta_policy') as { v: string } | undefined
    if (row?.v === String(AI_META_POLICY)) return
    db.prepare("UPDATE assets SET ai_meta = NULL WHERE kind = 'image' AND ai_meta IS NOT NULL").run()
    db.prepare('INSERT OR REPLACE INTO settings (k, v) VALUES (?, ?)').run('aimeta_policy', String(AI_META_POLICY))
  } catch {
    return
  }
  // 重读(限流,后台跑)
  const rows = db
    .prepare(
      `SELECT id, file_path, ext FROM assets
       WHERE kind = 'image' AND ai_meta IS NULL AND missing = 0 AND deleted_at IS NULL
       LIMIT 1000`
    )
    .all() as { id: number; file_path: string; ext: string }[]
  for (const r of rows) {
    try {
      const meta = await readAiMeta(r.file_path, r.ext)
      db.prepare('UPDATE assets SET ai_meta = ? WHERE id = ?').run(meta ? JSON.stringify(meta) : '', r.id)
      emitAsset(r.id)
    } catch {
      db.prepare("UPDATE assets SET ai_meta = '' WHERE id = ?").run(r.id)
    }
    await new Promise((r2) => setTimeout(r2, 30))
  }
}

/** 旧素材缺主题色时后台自动补齐(限流,避免启动卡顿) */
async function backfillColors(): Promise<void> {
  const rows = getDb()
    .prepare(
      `SELECT id, file_path FROM assets
       WHERE colors IS NULL AND missing = 0 AND deleted_at IS NULL AND kind = 'image'
       LIMIT 200`
    )
    .all() as { id: number; file_path: string }[]
  for (const r of rows) {
    try {
      const c = await extractColors(r.file_path)
      getDb()
        .prepare('UPDATE assets SET colors = ?, color_family = ? WHERE id = ?')
        .run(JSON.stringify(c.colors), c.family, r.id)
      emitAsset(r.id)
    } catch {
      getDb().prepare('UPDATE assets SET colors = ? WHERE id = ?').run('[]', r.id)
    }
    // 让出主进程
    await new Promise((r2) => setTimeout(r2, 50))
  }
}
