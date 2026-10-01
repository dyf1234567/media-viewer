import { getDb } from './db'
import { getSettings } from './settings'
import { purgeExpired } from './trash'
import { trimThumbCache, backfillThumbs, checkThumbPolicy } from './thumbs'
import { trimVideoCache } from './video'
import { extractColors, classify } from './colors'
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
  void upgradeColorFamily()
}

/** 色系分类策略升级(v2:5 档粗分改为 9 档色板,灰阶也参与筛选):按已存主题色重算 color_family,无需重读文件 */
const COLOR_FAMILY_POLICY = 2
async function upgradeColorFamily(): Promise<void> {
  const db = getDb()
  try {
    const row = db.prepare('SELECT v FROM settings WHERE k = ?').get('colorfamily_policy') as { v: string } | undefined
    if (row?.v === String(COLOR_FAMILY_POLICY)) return
    const rows = db
      .prepare("SELECT id, colors FROM assets WHERE colors IS NOT NULL AND colors != '[]'")
      .all() as { id: number; colors: string }[]
    const upd = db.prepare('UPDATE assets SET color_family = ? WHERE id = ?')
    for (const r of rows) {
      let family: string | null = null
      try {
        const list = JSON.parse(r.colors) as { r: number; g: number; b: number }[]
        // 以占比最高的主题色判定色系,比全图平均色更贴近观感
        if (Array.isArray(list) && list.length) family = classify(list[0].r, list[0].g, list[0].b)
      } catch {
        /* 解析失败保持 null */
      }
      upd.run(family, r.id)
    }
    db.prepare('INSERT OR REPLACE INTO settings (k, v) VALUES (?, ?)').run('colorfamily_policy', String(COLOR_FAMILY_POLICY))
  } catch {
    /* 失败下次启动再试 */
  }
}

/** AI 元数据解析策略升级(…v6:重读覆盖回收站;v7:ShowText 运行时文本优先+保存前缀锁定多采样器分支):清空旧解析并重读 */
const AI_META_POLICY = 7
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
  // 等渲染端完成初始加载并绑定事件,重读产生的更新才能实时推到界面
  await new Promise((r2) => setTimeout(r2, 2500))
  // 重读(限流,后台跑;含回收站中的素材,恢复后信息完整)
  const rows = db
    .prepare(
      `SELECT id, file_path, ext FROM assets
       WHERE kind = 'image' AND ai_meta IS NULL AND missing = 0
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

/** 旧素材缺主题色时后台自动补齐(限流,避免启动卡顿;'[]' 为历史失败标记,同样重试) */
async function backfillColors(): Promise<void> {
  const rows = getDb()
    .prepare(
      `SELECT id, file_path FROM assets
       WHERE (colors IS NULL OR colors = '[]') AND missing = 0 AND deleted_at IS NULL AND kind = 'image'
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
