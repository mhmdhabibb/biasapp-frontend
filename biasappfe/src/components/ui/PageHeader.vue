<script setup lang="ts">
defineProps<{
  title: string
  buttonLabel?: string
}>()
defineEmits<{ (e: 'add'): void }>()
</script>

<template>
  <div class="page-header">
    <h2 class="page-header-title">{{ title }}</h2>
    <button
      v-if="buttonLabel"
      class="btn btn-accent"
      @click="$emit('add')"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      {{ buttonLabel }}
    </button>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-base);
  margin-bottom: var(--space-lg);
  flex-wrap: wrap;
}

.page-header-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
}
</style>
