import type { Directive } from 'vue'

/**
 * 缩略图接近可视区才加载:
 * 进入视口(rootMargin 提前 400px)前保持透明并露出底层骨架,接近时才设置 src;
 * 加载完成后淡入,失败时保持骨架占位。
 */
export const vLazyImg: Directive<HTMLImageElement, string> = {
  mounted(el, binding) {
    el.dataset.lazySrc = binding.value
    el.style.opacity = '0'
    el.addEventListener('load', onLazyLoad, { once: false })
    el.addEventListener('error', onLazyError, { once: false })
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            el.src = el.dataset.lazySrc ?? ''
            io.disconnect()
          }
        }
      },
      { rootMargin: '400px 0px' }
    )
    io.observe(el)
    ;(el as unknown as { __io: IntersectionObserver }).__io = io
  },
  updated(el, binding) {
    if (binding.value !== binding.oldValue) {
      el.dataset.lazySrc = binding.value
      // 已进入过加载范围的元素直接换图;未进入的等接近时再加载
      if (el.src || el.style.opacity === '1') el.src = binding.value
    }
  },
  unmounted(el) {
    ;(el as unknown as { __io?: IntersectionObserver }).__io?.disconnect()
  }
}

function onLazyLoad(e: Event): void {
  const el = e.target as HTMLImageElement
  el.style.opacity = '1'
  el.classList.remove('lazy-broken')
}

function onLazyError(e: Event): void {
  const el = e.target as HTMLImageElement
  el.style.opacity = '0'
  el.classList.add('lazy-broken')
}
