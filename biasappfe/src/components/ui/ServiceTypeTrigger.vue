<script setup lang="ts">
import { computed } from 'vue'
import { formatServiceTypeLabel, getServiceTypeBadgeClass } from '@/utils/serviceType'

const props = withDefaults(
  defineProps<{
    serviceType?: string | null
    isExternal?: boolean
    loading?: boolean
    disabled?: boolean
    compact?: boolean
  }>(),
  {
    serviceType: 'preventif',
    isExternal: false,
    loading: false,
    disabled: false,
    compact: false,
  },
)

const emit = defineEmits<{
  (e: 'select', nextType: 'preventif' | 'korektif' | 'troubleshooting'): void
}>()

const currentType = computed(() => {
  const val = String(props.serviceType || 'preventif').trim().toLowerCase()
  return val || 'preventif'
})

function handleClick(target: 'korektif' | 'troubleshooting') {
  if (props.loading || props.disabled) return
  const next = currentType.value === target ? 'preventif' : target
  emit('select', next)
}
</script>

<template>
  <div class="svc-type-trigger" :class="{ 'svc-type-trigger--compact': compact }">
    <div class="svc-type-trigger__header">
      <span class="svc-type-trigger__label">Service Type</span>
      <span :class="getServiceTypeBadgeClass(currentType)">
        {{ formatServiceTypeLabel(currentType) }}
      </span>
    </div>

    <div v-if="!disabled" class="svc-type-trigger__actions">
      <button
        v-if="!isExternal"
        type="button"
        class="btn btn-sm"
        :class="currentType === 'korektif' ? 'btn-warning' : 'btn-outline'"
        :disabled="loading"
        @click="handleClick('korektif')"
      >
        {{ currentType === 'korektif' ? '✓ Korektif (Aktif)' : 'Korektif' }}
      </button>
      <button
        type="button"
        class="btn btn-sm"
        :class="currentType === 'troubleshooting' ? 'btn-danger' : 'btn-outline'"
        :disabled="loading"
        @click="handleClick('troubleshooting')"
      >
        {{ currentType === 'troubleshooting' ? '✓ Troubleshooting (Aktif)' : 'Troubleshooting' }}
      </button>
    </div>

    <p v-if="!compact && !disabled" class="svc-type-trigger__hint">
      Default: <strong>Preventif</strong>.
      <template v-if="!isExternal">
        Klik <strong>Korektif</strong> atau <strong>Troubleshooting</strong> jika diperlukan (klik ulang untuk kembali ke Preventif).
      </template>
      <template v-else>
        Untuk service external hanya tersedia tombol <strong>Troubleshooting</strong> (klik ulang untuk kembali ke Preventif).
      </template>
    </p>
  </div>
</template>

<style scoped>
.svc-type-trigger {
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-sunken);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.svc-type-trigger--compact {
  padding: 10px 12px;
  gap: 6px;
}

.svc-type-trigger__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.svc-type-trigger__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.svc-type-trigger__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.svc-type-trigger__hint {
  margin: 0;
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.4;
}
</style>
