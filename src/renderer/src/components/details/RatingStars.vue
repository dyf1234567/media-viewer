<script setup lang="ts">
const props = withDefaults(
  defineProps<{ modelValue: number; size?: 'sm' | 'md'; readonly?: boolean }>(),
  { size: 'md', readonly: false }
)
const emit = defineEmits<{ (e: 'set', v: number): void }>()

function clickStar(n: number): void {
  if (props.readonly) return
  // 再点同一颗星 → 清除评分
  emit('set', props.modelValue === n ? 0 : n)
}
</script>

<template>
  <div class="stars" :class="[size, { readonly }]" role="radiogroup" aria-label="评分">
    <button
      v-for="n in 5"
      :key="n"
      class="star"
      :class="{ on: n <= modelValue }"
      :title="readonly ? `评分 ${modelValue}` : `${n} 星`"
      tabindex="-1"
      @click.stop="clickStar(n)"
    >
      <svg viewBox="0 0 24 24" :fill="n <= modelValue ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.6">
        <path d="M12 3l2.7 5.6 6.3.9-4.5 4.4 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3 9.5l6.3-.9z" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.stars {
  display: inline-flex;
  gap: 1px;
}
.star {
  color: rgba(255, 255, 255, 0.32);
  display: flex;
  padding: 1px;
}
.star.on {
  color: var(--star);
}
.stars.sm .star svg {
  width: 12px;
  height: 12px;
}
.stars.md .star svg {
  width: 17px;
  height: 17px;
}
.stars:not(.readonly) .star:hover {
  transform: scale(1.15);
}
.star {
  transition: transform 0.1s;
}
</style>
