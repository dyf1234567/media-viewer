import Database from 'better-sqlite3'
import * as path from 'path'
import type { Asset, AssetFull, Album, Tag } from '../../shared/types'

let db: Database.Database | null = null
let libRoot = ''

export function initDb(root: string): void {
  libRoot = root
  db = new Database(path.join(root, 'library.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate()
}

export function getDb(): Database.Database {
  if (!db) throw new Error('数据库尚未初始化')
  return db
}

export function closeDb(): void {
  if (db) {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)')
      db.close()
    } catch {
      /* 忽略关闭异常 */
    }
    db = null
  }
}

function migrate(): void {
  const d = getDb()
  let v = d.pragma('user_version', { simple: true }) as number
  if (v < 1) {
    d.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_hash TEXT NOT NULL,
      file_path TEXT NOT NULL,
      original_path TEXT,
      storage_mode TEXT NOT NULL DEFAULT 'reference',
      file_name TEXT NOT NULL,
      ext TEXT NOT NULL,
      kind TEXT NOT NULL,
      width INTEGER DEFAULT 0,
      height INTEGER DEFAULT 0,
      file_size INTEGER DEFAULT 0,
      duration_ms INTEGER,
      imported_at INTEGER NOT NULL,
      file_modified_at INTEGER DEFAULT 0,
      rating INTEGER DEFAULT 0,
      favorite INTEGER DEFAULT 0,
      note TEXT DEFAULT '',
      missing INTEGER DEFAULT 0,
      color_family TEXT,
      colors TEXT,
      exif TEXT,
      ai_meta TEXT,
      histogram TEXT,
      video_info TEXT,
      thumb_done INTEGER DEFAULT 0,
      phash TEXT,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_assets_hash ON assets(content_hash);
    CREATE INDEX IF NOT EXISTS idx_assets_deleted ON assets(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_assets_path ON assets(file_path);

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asset_tags (
      asset_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      UNIQUE(asset_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source_path TEXT UNIQUE,
      cover_asset_id INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS album_assets (
      album_id INTEGER NOT NULL,
      asset_id INTEGER NOT NULL,
      UNIQUE(album_id, asset_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      k TEXT PRIMARY KEY,
      v TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS compare_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash_a TEXT NOT NULL,
      hash_b TEXT NOT NULL,
      winner TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_votes_pair ON compare_votes(hash_a, hash_b);
  `)
    v = 1
  }
  if (v < 2) {
    // v2:assets 增加 pHash 感知指纹列(相似查重用)
    const cols = d.pragma('table_info(assets)') as { name: string }[]
    if (!cols.some((c) => c.name === 'phash')) {
      d.exec('ALTER TABLE assets ADD COLUMN phash TEXT')
    }
    d.pragma('user_version = 2')
  }
}

/** 数据库中的原始行 */
export interface AssetRow {
  id: number
  content_hash: string
  file_path: string
  original_path: string | null
  storage_mode: string
  file_name: string
  ext: string
  kind: string
  width: number
  height: number
  file_size: number
  duration_ms: number | null
  imported_at: number
  file_modified_at: number
  rating: number
  favorite: number
  note: string
  missing: number
  color_family: string | null
  colors: string | null
  exif: string | null
  ai_meta: string | null
  histogram: string | null
  video_info: string | null
  thumb_done: number
  phash: string | null
  deleted_at: number | null
  tag_ids: string | null
  album_ids: string | null
}

const SELECT_ASSET = `
  SELECT a.*,
    (SELECT GROUP_CONCAT(at.tag_id) FROM asset_tags at WHERE at.asset_id = a.id) AS tag_ids,
    (SELECT GROUP_CONCAT(aa.album_id) FROM album_assets aa WHERE aa.asset_id = a.id) AS album_ids
  FROM assets a`

function parseIds(s: string | null): number[] {
  if (!s) return []
  return s.split(',').map(Number).filter((n) => !isNaN(n))
}

export function thumbPathOf(hash: string): string {
  return path.join(libRoot, 'thumbs', `${hash}.webp`)
}

export function rowToAsset(r: AssetRow): Asset {
  return {
    id: r.id,
    contentHash: r.content_hash,
    filePath: r.file_path,
    thumbPath: thumbPathOf(r.content_hash),
    storageMode: (r.storage_mode as 'reference' | 'managed') ?? 'reference',
    fileName: r.file_name,
    ext: r.ext,
    kind: (r.kind as 'image' | 'video') ?? 'image',
    width: r.width,
    height: r.height,
    fileSize: r.file_size,
    durationMs: r.duration_ms,
    importedAt: r.imported_at,
    fileModifiedAt: r.file_modified_at,
    rating: r.rating,
    favorite: !!r.favorite,
    note: r.note ?? '',
    missing: !!r.missing,
    colorFamily: r.color_family,
    colors: r.colors ? (JSON.parse(r.colors) as Asset['colors']) : null,
    thumbDone: r.thumb_done,
    deletedAt: r.deleted_at,
    tagIds: parseIds(r.tag_ids),
    albumIds: parseIds(r.album_ids)
  }
}

export function rowToFull(r: AssetRow): AssetFull {
  const a = rowToAsset(r)
  return {
    ...a,
    exif: r.exif ? JSON.parse(r.exif) : null,
    aiMeta: r.ai_meta ? JSON.parse(r.ai_meta) : null,
    videoInfo: r.video_info ? JSON.parse(r.video_info) : null
  }
}

export function getAssetRow(id: number): AssetRow | undefined {
  return getDb().prepare(`${SELECT_ASSET} WHERE a.id = ?`).get(id) as AssetRow | undefined
}

export function getAsset(id: number): Asset | undefined {
  const r = getAssetRow(id)
  return r ? rowToAsset(r) : undefined
}

export function listAssets(): Asset[] {
  const rows = getDb().prepare(`${SELECT_ASSET}`).all() as AssetRow[]
  return rows.map(rowToAsset)
}

export function listTags(): Tag[] {
  const rows = getDb()
    .prepare(
      `SELECT t.id, t.name, COUNT(at.asset_id) AS usage FROM tags t
       LEFT JOIN asset_tags at ON at.tag_id = t.id
       LEFT JOIN assets a ON a.id = at.asset_id AND a.deleted_at IS NULL
       GROUP BY t.id ORDER BY usage DESC, t.name`
    )
    .all() as { id: number; name: string; usage: number }[]
  return rows.map((r) => ({ id: r.id, name: r.name, usage: r.usage || 0 }))
}

export function listAlbums(): Album[] {
  const rows = getDb()
    .prepare(
      `SELECT al.id, al.name, al.source_path, al.cover_asset_id,
        (SELECT COUNT(*) FROM album_assets aa JOIN assets a ON a.id = aa.asset_id
          WHERE aa.album_id = al.id AND a.deleted_at IS NULL) AS count
       FROM albums al ORDER BY al.created_at DESC`
    )
    .all() as {
    id: number
    name: string
    source_path: string | null
    cover_asset_id: number | null
    count: number
  }[]
  return rows.map((r) => {
    let coverThumb: string | null = null
    if (r.cover_asset_id) {
      const a = getAssetRow(r.cover_asset_id)
      if (a) coverThumb = thumbPathOf(a.content_hash)
    }
    return {
      id: r.id,
      name: r.name,
      sourcePath: r.source_path,
      coverAssetId: r.cover_asset_id,
      coverThumbPath: coverThumb,
      count: r.count || 0
    }
  })
}
