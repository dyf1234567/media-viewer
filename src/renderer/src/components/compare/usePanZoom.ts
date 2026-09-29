import { reactive } from 'vue'

export interface PanZoom {
  scale: number
  tx: number
  ty: number
}

export interface PaneGeom {
  natW: number
  natH: number
}

/** 创建一个平移缩放状态(0.1~max 倍,光标锚点缩放) */
export function usePanZoom(minScale = 0.1, maxScale = 32) {
  const pz = reactive<PanZoom>({ scale: 1, tx: 0, ty: 0 })

  function clampScale(s: number): number {
    return Math.max(minScale, Math.min(maxScale, s))
  }

  /** 光标锚点缩放:px/py 为相对 pane 左上角的坐标 */
  function zoomAt(paneW: number, paneH: number, px: number, py: number, factor: number): void {
    const s1 = pz.scale
    const s2 = clampScale(s1 * factor)
    if (s1 === s2) return
    const ix = (px - paneW / 2 - pz.tx) / s1
    const iy = (py - paneH / 2 - pz.ty) / s1
    pz.tx = px - paneW / 2 - ix * s2
    pz.ty = py - paneH / 2 - iy * s2
    pz.scale = s2
  }

  /** 屏幕坐标 → 图像坐标(0..natW/natH) */
  function toImage(paneW: number, paneH: number, px: number, py: number, natW: number, natH: number): { ix: number; iy: number } {
    return {
      ix: (px - paneW / 2 - pz.tx) / pz.scale + natW / 2,
      iy: (py - paneH / 2 - pz.ty) / pz.scale + natH / 2
    }
  }

  /** 图像坐标 → pane 坐标 */
  function toPane(paneW: number, paneH: number, ix: number, iy: number, natW: number, natH: number): { px: number; py: number } {
    return {
      px: paneW / 2 + pz.tx + (ix - natW / 2) * pz.scale,
      py: paneH / 2 + pz.ty + (iy - natH / 2) * pz.scale
    }
  }

  /** 适应窗口(包含,不放大超过 fitMax) */
  function fit(paneW: number, paneH: number, natW: number, natH: number, fitMax = 2): void {
    if (!natW || !natH) return
    pz.scale = clampScale(Math.min(paneW / natW, paneH / natH, fitMax))
    pz.tx = 0
    pz.ty = 0
  }

  /** 框选区域放大:让图像坐标矩形充满 pane 居中显示,限制最大倍数 */
  function zoomToRect(paneW: number, paneH: number, rect: { x: number; y: number; w: number; h: number }, natW: number, natH: number): void {
    if (rect.w < 2 || rect.h < 2) return
    const s = clampScale(Math.min(paneW / rect.w, paneH / rect.h))
    const cx = rect.x + rect.w / 2
    const cy = rect.y + rect.h / 2
    pz.scale = s
    pz.tx = (natW / 2 - cx) * s
    pz.ty = (natH / 2 - cy) * s
  }

  return { pz, zoomAt, toImage, toPane, fit, zoomToRect, clampScale }
}

export function pzStyle(p: PanZoom): Record<string, string> {
  return {
    left: '50%',
    top: '50%',
    transform: `translate(-50%, -50%) translate(${p.tx}px, ${p.ty}px) scale(${p.scale})`
  }
}
