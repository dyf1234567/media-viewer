// pHash 指纹单元测试:一致性 / 相似不变性 / 区分性
import { describe, expect, it, beforeAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import sharp from 'sharp'
import { computePhash, hammingHex } from '../src/main/services/phashCore'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phash-test-'))
const gradients = [
  // 带明暗结构差异的图(pHash 对平滑渐变区分度弱,用结构化素材测)
  Buffer.from(
    `<svg width="200" height="200"><rect width="200" height="200" fill="#2a2a3a"/><circle cx="70" cy="70" r="55" fill="#e8e8f0"/><rect x="110" y="110" width="70" height="70" fill="#7a5a2a"/></svg>`
  ),
  Buffer.from(
    `<svg width="200" height="200"><rect width="200" height="200" fill="#202020"/><circle cx="140" cy="60" r="38" fill="#d0d0d0"/><rect x="20" y="120" width="160" height="18" fill="#909090"/></svg>`
  )
]

const files: Record<string, string> = {}

beforeAll(async () => {
  // 图 A:结构图原图;A':A 的缩放+重压缩(应相似);B:结构不同的图
  files.a = path.join(dir, 'a.png')
  files.aVariant = path.join(dir, 'a-variant.jpg')
  files.b = path.join(dir, 'b.png')
  await sharp(gradients[0]).png().toFile(files.a)
  await sharp(gradients[0]).resize(120).jpeg({ quality: 60 }).toFile(files.aVariant)
  await sharp(gradients[1]).png().toFile(files.b)
})

describe('computePhash', () => {
  it('返回 16 位 hex', async () => {
    const h = await computePhash(files.a)
    expect(h).toMatch(/^[0-9a-f]{16}$/)
  })
  it('同一文件结果稳定', async () => {
    expect(await computePhash(files.a)).toBe(await computePhash(files.a))
  })
  it('坏文件返回 null 而不是抛错', async () => {
    const bad = path.join(dir, 'bad.png')
    fs.writeFileSync(bad, 'not an image')
    expect(await computePhash(bad)).toBeNull()
  })
})

describe('hammingHex', () => {
  it('相同指纹距离 0', () => {
    const h = '0123456789abcdef'
    expect(hammingHex(h, h)).toBe(0)
  })
  it('已知差异位数', () => {
    // 0x00 → 0x01 差 1 位;0xff → 0x00 差 8 位
    expect(hammingHex('0000000000000000', '0100000000000000')).toBe(1)
    expect(hammingHex('ff00000000000000', '0000000000000000')).toBe(8)
  })
  it('非法输入按最大距离处理', () => {
    expect(hammingHex('zzz', '0000000000000000')).toBe(64)
  })
})

describe('相似不变性与区分性', () => {
  it('缩放+重压缩后距离很小(≤14/64)', async () => {
    const d = hammingHex((await computePhash(files.a))!, (await computePhash(files.aVariant))!)
    expect(d).toBeLessThanOrEqual(14)
  })
  it('相似对的距离显著小于不同图之间的距离', async () => {
    const similar = hammingHex((await computePhash(files.a))!, (await computePhash(files.aVariant))!)
    const diff = hammingHex((await computePhash(files.a))!, (await computePhash(files.b))!)
    expect(diff - similar).toBeGreaterThanOrEqual(8)
  })
})
