<script setup lang="ts">
const props = withDefaults(
  defineProps<{ name: string; size?: number; filled?: boolean }>(),
  { size: 16, filled: false }
)

// 简洁线条图标(24x24 viewBox)
const PATHS: Record<string, string> = {
  pin: 'M12 3l4 4-1.5 1.5L17 11l-5 5-2.5-2.5L8 15l-3-8 4-4zM12 16v5',
  minimize: 'M5 12h14',
  maximize: 'M6 6h12v12H6z',
  restore: 'M8 8h10v10H8zM6 16V6h10',
  close: 'M6 6l12 12M18 6L6 18',
  star: 'M12 3l2.7 5.6 6.3.9-4.5 4.4 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3 9.5l6.3-.9z',
  heart: 'M12 20s-7-4.5-9-9c-1.3-3 1-7 4.5-7 2 0 3.5 1 4.5 2.7C13 5 14.5 4 16.5 4 20 4 22.3 8 21 11c-2 4.5-9 9-9 9z',
  video: 'M3 6h13v12H3zM16 10l5-3v10l-5-3z',
  image: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5',
  search: 'M10.5 4a6.5 6.5 0 105.3 10.3L21 20M10.5 4a6.5 6.5 0 015.3 10.3',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-left': 'M15 6l-6 6 6 6',
  folder: 'M3 6h6l2 2h10v11H3z',
  tag: 'M4 4h7l9 9-7 7-9-9zM8 8h.01',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6',
  settings: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19 12l2-1.5-1-3-2.5.5-2-2 .5-2.5-3-1L12 5l-1.5-2-3 1 .5 2.5-2 2L3.5 8l-1 3L5 12l-2.5 1.5 1 3 2.5-.5 2 2-.5 2.5 3 1L12 19l1.5 2 3-1-.5-2.5 2-2 2.5.5 1-3z',
  palette: 'M12 3a9 9 0 000 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 004-4c0-4-4-8-9-8zM7.5 10.5h.01M10 7h.01M15 7.5h.01',
  shuffle: 'M3 6h4l10 12h4M3 18h4l3-3.5M14 8.5L17 6M17 6h4m0 0l-2-2m2 2l-2 2M17 18h4m0 0l-2-2m2 2l-2 2',
  compare: 'M12 3v18M7 7L3 12l4 5M17 7l4 5-4 5',
  edit: 'M4 20h4L20 8l-4-4L4 16v4zM13 7l4 4',
  crop: 'M7 3v14h14M3 7h14v14',
  'rotate-r': 'M20 8a8 8 0 10-2 8M20 3v5h-5',
  'rotate-l': 'M4 8a8 8 0 112 8M4 3v5h5',
  flip: 'M12 3v18M8 7L4 12l4 5V7zM16 7l4 5-4 5V7z',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  'fullscreen-exit': 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
  volume: 'M4 9v6h4l5 4V5L8 9H4zM16 9a4 4 0 010 6',
  mute: 'M4 9v6h4l5 4V5L8 9H4zM16 9l5 6M21 9l-5 6',
  refresh: 'M20 11a8 8 0 10-2.5 6M20 5v6h-6',
  check: 'M4 12l5 5L20 7',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  'folder-plus': 'M3 6h6l2 2h10v11H3zM12 11v6M9 14h6',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M4 6h16M4 12h16M4 18h16',
  info: 'M12 8h.01M11 12h1v5h1M12 3a9 9 0 100 18 9 9 0 000-18z',
  eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6zM12 9a3 3 0 100 6 3 3 0 000-6z',
  warning: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  film: 'M3 4h18v16H3zM7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 3',
  hash: 'M6 9h13M5 15h13M10 4L8 20M16 4l-2 16',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z',
  scan: 'M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4M4 12h16',
  arrowsOut: 'M9 4H4v5M15 20h5v-5M4 4l6 6M20 20l-6-6',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  home: 'M4 11l8-7 8 7v9h-5v-6h-6v6H4z',
  filter: 'M4 5h16l-6 7v6l-4 2v-8z',
  save: 'M5 3h11l5 5v13H5zM8 3v6h8V3M8 21v-8h8v8',
  'arrow-left': 'M19 12H5M11 6l-6 6 6 6',
  'arrow-right': 'M5 12h14M13 6l6 6-6 6',
  relocate: 'M12 21s-7-6.5-7-11a7 7 0 1114 0c0 4.5-7 11-7 11zM12 8h.01',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5'
}
</script>

<template>
<svg
  class="icon"
  :class="{ filled: props.filled }"
  :width="props.size"
  :height="props.size"
  viewBox="0 0 24 24"
  :fill="props.filled ? 'currentColor' : 'none'"
  aria-hidden="true"
  focusable="false"
>
    <path :d="PATHS[props.name] ?? ''" />
  </svg>
</template>
