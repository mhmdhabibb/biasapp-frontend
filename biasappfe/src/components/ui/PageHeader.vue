<script setup lang="ts">
import { computed } from 'vue'
import { usePermission } from '@/composables/usePermission'

const props = defineProps<{
  title: string
  buttonLabel?: string
  /** Full permission key required to show the Add button, e.g. "customer:create" */
  permission?: string
  /** Show a back button on the left of the title */
  backButton?: boolean
}>()
defineEmits<{
  (e: 'add'): void
  (e: 'back'): void
}>()

const { can } = usePermission()

const showAddButton = computed(() => {
  if (!props.buttonLabel) return false
  if (!props.permission) return true
  return can(props.permission)
})
</script>

<template>
  <div class="page-header">
    <div class="page-header-leading">
      <button
        v-if="backButton"
        type="button"
        class="page-header-back"
        aria-label="Back"
        @click="$emit('back')"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/>
          <polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <h2 class="page-header-title">{{ title }}</h2>
    </div>
    <div style="display: flex; gap: 8px; align-items: center;">
      <slot name="actions"></slot>
      <button
        v-if="showAddButton"
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

.page-header-leading {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.page-header-back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-full, 999px);
  background: var(--color-surface, #fff);
  color: var(--color-text-secondary, #475569);
  cursor: pointer;
  transition: background var(--transition-fast, 0.15s), color var(--transition-fast, 0.15s);
}
.page-header-back:hover {
  background: var(--color-surface-sunken, #f1f5f9);
  color: var(--color-text, #0f172a);
}

.page-header-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
}
</style>
