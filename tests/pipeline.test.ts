// 排序 / 筛选 / 范围管道单元测试
import { describe, expect, it } from 'vitest'
import { scopeFilter, applyFilters, applySort, countFilters, activeFilterChips } from '../src/renderer/src/util/pipeline'
import type { Filters } from '../src/renderer/src/stores/ui'
import type { Asset } from '../src/shared/types'

let nextId = 1
function asset(p: Partial<Asset> = {}): Asset {
  return {
    id: nextId++,
    contentHash: 'h' + nextId,
    filePath: 'C:/x/' + (p.fileName ?? 'a.png'),
    thumbPath: 'C:/t.webp',
    storageMode: 'reference',
    fileName: 'a.png',
    ext: 'png',
    kind: 'image',
    width: 1000,
    height: 1000,
    fileSize: 5000,
    durationMs: null,
    importedAt: Date.now(),
    fileModifiedAt: Date.now(),
    rating: 0,
    favorite: false,
    note: '',
    missing: false,
    colorFamily: null,
    colors: null,
    thumbDone: 1,
    deletedAt: null,
    tagIds: [],
    albumIds: [],
    ...p
  }
}

function emptyFilters(): Filters {
  return {
    formats: [],
    shape: '',
    tags: [],
    albums: [],
    colors: [],
    rating: -1,
    dateAdded: 0,
    dateModified: 0,
    note: '',
    dimension: '',
    size: ''
  }
}

describe('scopeFilter', () => {
  it('回收站只保留已删除项', () => {
    const list = [asset(), asset({ deletedAt: Date.now() }), asset({ deletedAt: Date.now() })]
    expect(scopeFilter(list, 'trash', null, null)).toHaveLength(2)
  })
  it('收藏只保留 favorite', () => {
    const list = [asset({ favorite: true }), asset()]
    expect(scopeFilter(list, 'favorites', null, null)).toHaveLength(1)
  })
  it('未分类 = 不在任何相册', () => {
    const list = [asset({ albumIds: [3] }), asset()]
    expect(scopeFilter(list, 'unclassified', null, null)).toHaveLength(1)
  })
  it('未标签 = 无标签', () => {
    const list = [asset({ tagIds: [1] }), asset()]
    expect(scopeFilter(list, 'untagged', null, null)).toHaveLength(1)
  })
  it('相册范围按 albumId 过滤', () => {
    const list = [asset({ albumIds: [7, 8] }), asset({ albumIds: [9] })]
    expect(scopeFilter(list, 'album', 7, null)).toHaveLength(1)
  })
  it('随机范围按给定顺序重排', () => {
    const a = asset()
    const b = asset()
    const c = asset()
    const out = scopeFilter([a, b, c], 'random', null, [c.id, a.id, b.id])
    expect(out.map((x) => x.id)).toEqual([c.id, a.id, b.id])
  })
})

describe('applyFilters', () => {
  it('无条件的空过滤保留全部', () => {
    const list = [asset(), asset()]
    expect(applyFilters(list, emptyFilters(), '')).toHaveLength(2)
  })
  it('文件名模糊搜索(大小写不敏感)', () => {
    const list = [asset({ fileName: 'Holiday-Photo.PNG' }), asset({ fileName: 'b.jpg' })]
    expect(applyFilters(list, emptyFilters(), 'holiday')).toHaveLength(1)
  })
  it('格式多选', () => {
    const list = [asset({ ext: 'png' }), asset({ ext: 'jpg' }), asset({ ext: 'gif' })]
    const f = emptyFilters()
    f.formats = ['png', 'gif']
    expect(applyFilters(list, f, '')).toHaveLength(2)
  })
  it('形状:横/竖/方按宽高比判定', () => {
    const list = [
      asset({ fileName: 'h.png', width: 1920, height: 1080 }),
      asset({ fileName: 'v.png', width: 800, height: 1280 }),
      asset({ fileName: 's.png', width: 900, height: 900 })
    ]
    const f = emptyFilters()
    f.shape = 'h'
    expect(applyFilters(list, f, '').map((a) => a.fileName)).toEqual(['h.png'])
    f.shape = 'v'
    expect(applyFilters(list, f, '').map((a) => a.fileName)).toEqual(['v.png'])
    f.shape = 's'
    expect(applyFilters(list, f, '').map((a) => a.fileName)).toEqual(['s.png'])
  })
  it('标签为「同时包含」语义(every)', () => {
    const list = [asset({ tagIds: [1, 2] }), asset({ tagIds: [1] })]
    const f = emptyFilters()
    f.tags = [1, 2]
    expect(applyFilters(list, f, '')).toHaveLength(1)
  })
  it('评分精确匹配,0 表示尚未评分', () => {
    const list = [asset({ rating: 5 }), asset({ rating: 0 })]
    const f = emptyFilters()
    f.rating = 5
    expect(applyFilters(list, f, '')).toHaveLength(1)
    f.rating = 0
    expect(applyFilters(list, f, '')).toHaveLength(1)
  })
  it('尺寸分档按长边', () => {
    const list = [
      asset({ fileName: '4k.png', width: 3840, height: 2160 }),
      asset({ fileName: '1080.png', width: 1920, height: 1080 }),
      asset({ fileName: 'small.png', width: 640, height: 480 })
    ]
    const f = emptyFilters()
    f.dimension = '4k'
    expect(applyFilters(list, f, '').map((a) => a.fileName)).toEqual(['4k.png'])
    f.dimension = '1080'
    expect(applyFilters(list, f, '')).toHaveLength(2)
    f.dimension = 'small'
    expect(applyFilters(list, f, '').map((a) => a.fileName)).toEqual(['small.png'])
  })
  it('大小区间', () => {
    const list = [
      asset({ fileName: 'big.png', fileSize: 20 * 1024 * 1024 }),
      asset({ fileName: 'mid.png', fileSize: 500 * 1024 }),
      asset({ fileName: 'tiny.png', fileSize: 10 * 1024 })
    ]
    const f = emptyFilters()
    f.size = '>10mb'
    expect(applyFilters(list, f, '').map((a) => a.fileName)).toEqual(['big.png'])
    f.size = '<100kb'
    expect(applyFilters(list, f, '').map((a) => a.fileName)).toEqual(['tiny.png'])
  })
  it('注释有无', () => {
    const list = [asset({ note: 'x' }), asset()]
    const f = emptyFilters()
    f.note = 'yes'
    expect(applyFilters(list, f, '')).toHaveLength(1)
    f.note = 'no'
    expect(applyFilters(list, f, '')).toHaveLength(1)
  })
  it('多条件同时生效(交集)', () => {
    const list = [
      asset({ fileName: 'a.png', ext: 'png', rating: 5 }),
      asset({ fileName: 'b.png', ext: 'png', rating: 3 }),
      asset({ fileName: 'c.jpg', ext: 'jpg', rating: 5 })
    ]
    const f = emptyFilters()
    f.formats = ['png']
    f.rating = 5
    expect(applyFilters(list, f, '').map((a) => a.fileName)).toEqual(['a.png'])
  })
})

describe('applySort', () => {
  it('默认按导入顺序倒序(最新在前)', () => {
    const a = asset()
    const b = asset()
    expect(applySort([a, b], 'imported', false)[0].id).toBe(b.id)
  })
  it('名称排序(英文字母序)', () => {
    const list = [asset({ fileName: 'b.png' }), asset({ fileName: 'a.png' }), asset({ fileName: 'c.png' })]
    const out = applySort(list, 'name-asc', false)
    expect(out.map((a) => a.fileName)).toEqual(['a.png', 'b.png', 'c.png'])
  })
  it('名称降序与升序互逆', () => {
    const list = [asset({ fileName: 'x.png' }), asset({ fileName: 'a.png' }), asset({ fileName: 'm.png' })]
    const asc = applySort(list, 'name-asc', false).map((a) => a.fileName)
    const desc = applySort(list, 'name-desc', false).map((a) => a.fileName)
    expect(desc).toEqual([...asc].reverse())
  })
  it('评分同分时按 id 稳定', () => {
    const a = asset({ rating: 5 })
    const b = asset({ rating: 5 })
    const c = asset({ rating: 3 })
    const out = applySort([c, a, b], 'rating-desc', false)
    expect(out[2].id).toBe(c.id)
    expect(out[0].id).toBe(b.id)
  })
  it('随机模式不排序', () => {
    const list = [asset(), asset(), asset()]
    expect(applySort(list, 'name-asc', true)).toEqual(list)
  })
  it('不修改原数组', () => {
    const list = [asset({ fileName: 'b.png' }), asset({ fileName: 'a.png' })]
    const snapshot = [...list]
    applySort(list, 'name-asc', false)
    expect(list.map((a) => a.fileName)).toEqual(snapshot.map((a) => a.fileName))
  })
})

describe('activeFilterChips / countFilters', () => {
  it('空条件不产生标签', () => {
    expect(activeFilterChips(emptyFilters(), () => '', () => '')).toHaveLength(0)
    expect(countFilters(emptyFilters())).toBe(0)
  })
  it('每个启用维度各一个标签,清除后计数归零', () => {
    const f = emptyFilters()
    f.formats = ['png']
    f.shape = 'h'
    f.rating = 4
    expect(countFilters(f)).toBe(3)
    const chips = activeFilterChips(f, () => '', () => '')
    chips.forEach((c) => c.clear())
    expect(countFilters(f)).toBe(0)
  })
})
