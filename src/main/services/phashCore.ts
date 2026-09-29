// pHash 纯函数部分:不依赖数据库,可被单元测试直接覆盖
import sharp from 'sharp'

const SIZE = 32
const COEF = 8

// cos 表:cos((2x+1)uπ/(2*SIZE))
const COS: number[][] = []
for (let u = 0; u < COEF; u++) {
  COS[u] = []
  for (let x = 0; x < SIZE; x++) {
    COS[u][x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * SIZE))
  }
}

/** 计算单张图片的 pHash(16 位 hex);失败返回 null */
export async function computePhash(filePath: string): Promise<string | null> {
  try {
    const buf: Buffer = await sharp(filePath)
      .grayscale()
      .resize(SIZE, SIZE, { fit: 'fill' })
      .raw()
      .toBuffer()
    if (buf.length < SIZE * SIZE) return null

    // 2D DCT,只取左上 8x8 低频块
    const coefs: number[] = []
    for (let u = 0; u < COEF; u++) {
      for (let v = 0; v < COEF; v++) {
        let sum = 0
        for (let x = 0; x < SIZE; x++) {
          const cu = COS[u][x]
          const row = x * SIZE
          for (let y = 0; y < SIZE; y++) {
            sum += buf[row + y] * cu * COS[v][y]
          }
        }
        coefs.push(sum)
      }
    }
    // 去掉 DC(左上角),用其余 63 个系数对中值取阈值 → 63bit,DC 位补 0 成 64bit
    const ac = coefs.slice(1).map(Math.abs)
    const median = [...ac].sort((a, b) => a - b)[Math.floor(ac.length / 2)]
    let bits = '0'
    for (const c of ac) bits += c > median ? '1' : '0'
    // 64bit → 16 hex
    let hex = ''
    for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4).padEnd(4, '0'), 2).toString(16)
    return hex
  } catch {
    return null
  }
}

// 256 项 popcount 查表
const POP = new Uint8Array(256)
for (let i = 0; i < 256; i++) {
  POP[i] = (i & 1) + POP[i >> 1]
}

function hexBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{16}$/.test(hex)) return null
  const out = new Uint8Array(8)
  for (let i = 0; i < 8; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/** 两个 16 位 hex 指纹的汉明距离(0-64,越小越像) */
export function hammingHex(a: string, b: string): number {
  const ba = hexBytes(a)
  const bb = hexBytes(b)
  if (!ba || !bb) return 64
  let d = 0
  for (let i = 0; i < 8; i++) d += POP[ba[i] ^ bb[i]]
  return d
}
