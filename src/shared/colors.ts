/** 色系分类(9 档):红/橙/黄/绿/青/蓝/紫/粉/灰;主进程入库与渲染端取色面板共用 */
export function classifyColor(r: number, g: number, b: number): string | null {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const sat = mx === 0 ? 0 : (mx - mn) / mx
  if (sat < 0.16) return 'gray'
  let h: number
  if (mx === r) h = 60 * (((g - b) / (mx - mn) + 6) % 6)
  else if (mx === g) h = 60 * ((b - r) / (mx - mn) + 2)
  else h = 60 * ((r - g) / (mx - mn) + 4)
  if (h >= 348 || h < 14) return 'red'
  if (h < 42) return 'orange'
  if (h < 70) return 'yellow'
  if (h < 155) return 'green'
  if (h < 200) return 'cyan'
  if (h < 252) return 'blue'
  if (h < 290) return 'purple'
  return 'pink'
}

export function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let rp = 0
  let gp = 0
  let bp = 0
  if (h < 60) [rp, gp, bp] = [c, x, 0]
  else if (h < 120) [rp, gp, bp] = [x, c, 0]
  else if (h < 180) [rp, gp, bp] = [0, c, x]
  else if (h < 240) [rp, gp, bp] = [0, x, c]
  else if (h < 300) [rp, gp, bp] = [x, 0, c]
  else [rp, gp, bp] = [c, 0, x]
  return { r: Math.round((rp + m) * 255), g: Math.round((gp + m) * 255), b: Math.round((bp + m) * 255) }
}

export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rr = r / 255
  const gg = g / 255
  const bb = b / 255
  const mx = Math.max(rr, gg, bb)
  const mn = Math.min(rr, gg, bb)
  const d = mx - mn
  let h = 0
  if (d > 0) {
    if (mx === rr) h = 60 * (((gg - bb) / d + 6) % 6)
    else if (mx === gg) h = 60 * ((bb - rr) / d + 2)
    else h = 60 * ((rr - gg) / d + 4)
  }
  return { h, s: mx === 0 ? 0 : d / mx, v: mx }
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function parseHex(text: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(text.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
