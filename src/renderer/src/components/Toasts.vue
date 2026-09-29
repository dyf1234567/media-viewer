<script setup lang="ts">
import { useToastStore } from '../stores/toast'
import Icon from './Icon.vue'

const toast = useToastStore()
</script>

<template>
  <div class="toast-wrap">
    <div
      v-for="t in toast.list"
      :key="t.id"
      class="toast"
      :class="t.type"
      :title="t.msg"
      @click="toast.dismiss(t.id)"
    >
      <Icon :name="t.type === 'error' ? 'warning' : t.type === 'success' ? 'check' : 'info'" :size="14" />
      <span class="t-msg">{{ t.msg }}</span>
    </div>
  </div>
</template>

<style scoped>
.t-msg {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60vw;
}
</style>
