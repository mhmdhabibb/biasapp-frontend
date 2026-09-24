<script setup lang="ts">
import { computed } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useMasterStore } from '@/composables/useMasterStore'

const {
  serviceReports,
  serviceRequests,
  jobOrders,
  contractItems,
  sparepartRequests,
  indents,
} = useMasterStore()

// Derived metrics
const newCalls = computed(() => serviceRequests.value.filter(s => s.status === 'open' || s.status === 'pending').length)
const assignedJobs = computed(() => jobOrders.value.filter(j => j.status === 'scheduled' || j.status === 'assigned').length)
const inProgressJobs = computed(() => jobOrders.value.filter(j => j.status === 'in_progress').length)
const waitingSparepartJobs = computed(() => serviceReports.value.filter(s => s.status === 'waiting_sparepart').length)
const completedJobs = computed(() => serviceReports.value.filter(s => s.status === 'completed' || s.status === 'closed').length)

// SLA logic (using created_at and completed_at if available, else compare with current time)
const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const approachingSlaJobs = computed(() => {
  const now = new Date().getTime()
  return serviceReports.value.filter(s => {
    if (s.status === 'completed') return false
    const start = new Date(s.created_at).getTime()
    const elapsed = now - start
    // Between 1.5h and 2h
    return elapsed >= (1.5 * 60 * 60 * 1000) && elapsed < TWO_HOURS_MS
  }).length
})

const breachedSlaJobs = computed(() => {
  const now = new Date().getTime()
  return serviceReports.value.filter(s => {
    if (s.status === 'completed') {
      const start = new Date(s.created_at).getTime()
      const end = new Date(s.updated_at).getTime()
      return (end - start) > TWO_HOURS_MS
    } else {
      const start = new Date(s.created_at).getTime()
      return (now - start) > TWO_HOURS_MS
    }
  }).length
})

const activeContracts = computed(() => contractItems.value.filter(c => c.status === 'active').length)
const expiringContracts = computed(() => contractItems.value.filter(c => c.status === 'expiring').length)

const pendingSparepartRequests = computed(() => sparepartRequests.value.filter(r => r.status === 'pending').length)
const pendingIndents = computed(() => indents.value.filter(i => i.status === 'pending').length)

</script>

<template>
  <div>
    <PageHeader title="Customer Service Dashboard" />

    <div class="dashboard-grid">
      <!-- Call Service Statuses -->
      <div class="stat-card">
        <div class="stat-title">New Call Services</div>
        <div class="stat-value text-primary">{{ newCalls }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Assigned Jobs</div>
        <div class="stat-value text-info">{{ assignedJobs }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">In Progress</div>
        <div class="stat-value text-warning">{{ inProgressJobs }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Waiting Sparepart</div>
        <div class="stat-value text-warning">{{ waitingSparepartJobs }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Completed Jobs</div>
        <div class="stat-value text-success">{{ completedJobs }}</div>
      </div>

      <!-- SLA Statuses -->
      <div class="stat-card">
        <div class="stat-title">SLA Approaching (< 30m)</div>
        <div class="stat-value text-warning">{{ approachingSlaJobs }}</div>
      </div>
      <div class="stat-card bg-danger-light">
        <div class="stat-title">SLA Breached (> 2h)</div>
        <div class="stat-value text-danger">{{ breachedSlaJobs }}</div>
      </div>

      <!-- Contracts -->
      <div class="stat-card">
        <div class="stat-title">Active Contracts</div>
        <div class="stat-value">{{ activeContracts }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Expiring Contracts</div>
        <div class="stat-value text-warning">{{ expiringContracts }}</div>
      </div>

      <!-- Inventory & Requests -->
      <div class="stat-card">
        <div class="stat-title">Pending Sparepart Requests</div>
        <div class="stat-value text-info">{{ pendingSparepartRequests }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Pending Indents</div>
        <div class="stat-value text-warning">{{ pendingIndents }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-lg);
  margin-top: var(--space-lg);
}

.stat-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.stat-title {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  font-weight: var(--font-weight-medium);
  margin-bottom: var(--space-sm);
}

.stat-value {
  font-size: 2.5rem;
  font-weight: var(--font-weight-bold);
  line-height: 1;
}

.text-primary { color: var(--color-primary); }
.text-info { color: #0ea5e9; }
.text-warning { color: #f59e0b; }
.text-success { color: #10b981; }
.text-danger { color: #ef4444; }

.bg-danger-light {
  background-color: #fef2f2;
  border-color: #fecaca;
}
</style>
