// 格式化工具单元测试
import { describe, expect, it } from 'vitest'
import { fmtBytes, fmtDuration, fmtExposure, fmtDate, fileUrl, thumbUrl, rgbCss } from '../src/renderer/src/util/format'

describe('fmtBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [2048, '2.0 KB'],
    [1024 * 1024, '1.0 MB'],
    [1024 * 1024 * 1024, '1.00 GB']
  ])('%i → %s', (input, expected) => {
    expect(fmtBytes(input)).toBe(expected)
  })
})

describe('fmtDuration', () => {
  it.each([
    [0, '0:00'],
    [59_000, '0:59'],
    [61_000, '1:01'],
    [3_600_000 + 5_000, '1:00:05']
  ])('%ims → %s', (input, expected) => {
    expect(fmtDuration(input)).toBe(expected)
  })
  it('负数按 0 处理', () => {
    expect(fmtDuration(-5)).toBe('0:00')
  })
})

describe('fmtExposure', () => {
  it('快门分数取整', () => {
    expect(fmtExposure(0.004)).toBe('1/250s')
    expect(fmtExposure(2)).toBe('2s')
    expect(fmtExposure(null)).toBe('-')
  })
})

describe('fmtDate', () => {
  it('空时间戳显示占位符', () => {
    expect(fmtDate(0)).toBe('-')
  })
  it('两位补零', () => {
    const s = fmtDate(new Date(2026, 0, 5, 3, 7).getTime())
    expect(s).toBe('2026-01-05 03:07')
  })
})

describe('fileUrl / thumbUrl', () => {
  it('路径编码并支持版本参数', () => {
    expect(fileUrl('C:/a b/图.png')).toBe('mvfile://f/C%3A%2Fa%20b%2F%E5%9B%BE.png')
    expect(fileUrl('C:/a.png', 7)).toContain('?v=7')
  })
  it('缩略图就绪后用文件修改时间做缓存版本,未就绪时固定 0', () => {
    const base = { thumbPath: 'C:/t.webp', fileModifiedAt: 123 }
    expect(thumbUrl({ ...base, thumbDone: 1 })).toContain('?v=123')
    expect(thumbUrl({ ...base, thumbDone: 0 })).toContain('?v=0')
  })
})

describe('rgbCss', () => {
  it('输出 rgb() 字符串', () => {
    expect(rgbCss({ r: 1, g: 2, b: 3 })).toBe('rgb(1, 2, 3)')
  })
})
