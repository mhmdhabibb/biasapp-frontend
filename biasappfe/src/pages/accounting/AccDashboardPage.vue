<script setup lang="ts">
import PageHeader from '@/components/ui/PageHeader.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { computed, onMounted, onUnmounted } from 'vue'

const store = useMasterStore()
let intervalId: any = null

onMounted(() => {
  // Auto-reload data every 30 seconds
  intervalId = setInterval(() => {
    store.refresh(true)
  }, 30000)
})

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
})

const stats = computed(() => [
  {
    label: 'Pending Requests',
    value: store.sparepartRequests.value.filter(r => r.status === 'pending').length,
    icon: 'box',
    color: 'var(--color-warning)',
  },
  {
    label: 'Active POs',
    value: store.purchaseOrders.value.filter(po => po.status !== 'completed' && po.status !== 'cancelled').length,
    icon: 'clipboard',
    color: 'var(--color-primary)',
  },
  {
    label: 'Pending Deliveries',
    value: store.procurementDeliveryOrders.value.filter(d => d.status === 'draft' || d.status === 'issued').length,
    icon: 'truck',
    color: 'var(--color-info)',
  },
])
</script>

<template>
  <div class="dashboard-page">
    <PageHeader title="Accounting Dashboard" />

    <div class="stats-grid">
      <div v-for="stat in stats" :key="stat.label" class="stat-card">
        <div class="stat-icon" :style="{ color: stat.color, backgroundColor: `${stat.color}15` }">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path v-if="stat.icon === 'box'" d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12" />
            <path v-if="stat.icon === 'clipboard'" d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2 M9 2h6a1 1 0 011 1v1a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1z" />
            <path v-if="stat.icon === 'truck'" d="M1 3h15v13H1z M16 8h4l3 3v5h-7z M5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z M18.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
          </svg>
        </div>
        <div class="stat-info">
          <p class="stat-value">{{ stat.value }}</p>
          <p class="stat-label">{{ stat.label }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-lg);
  margin-bottom: var(--space-2xl);
}

.stat-card {
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  box-shadow: var(--shadow-sm);
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 2rem;
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  line-height: 1;
  margin-bottom: var(--space-xs);
}

.stat-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  font-weight: var(--font-weight-medium);
}
</style>
