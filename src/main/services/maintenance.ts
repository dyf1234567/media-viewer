import { getDb } from './db'
import { getSettings } from './settings'
import { purgeExpired } from './trash'
import { trimThumbCache, backfillThumbs, checkThumbPolicy } from './thumbs'
import { trimVideoCache } from './video'
import { extractColors } from './colors'
import { backfillPhashes } from './phash'
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
