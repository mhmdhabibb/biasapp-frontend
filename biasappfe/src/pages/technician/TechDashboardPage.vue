<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import PageHeader from '@/components/ui/PageHeader.vue'

const router = useRouter()
const { currentUser } = useAuth()
const {
  jobOrders,
  findCustomer,
  findUnit,
  refresh
} = useMasterStore()

let intervalId: any = null

onMounted(() => {
  // Auto-reload data every 30 seconds
  intervalId = setInterval(() => {
    refresh(true)
  }, 30000)
})

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
})

const myJobs = computed(() => {
  return jobOrders.value.filter(j => j.technician_id === currentUser.value?.id)
})

const isToday = (dateStr: string) => {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const today = new Date()
  return d.getDate() === today.getDate() &&
         d.getMonth() === today.getMonth() &&
         d.getFullYear() === today.getFullYear()
}

const getSlaHours = (createdStr: string) => {
  if (!createdStr) return 0
  const created = new Date(createdStr).getTime()
  const now = new Date().getTime()
  return (now - created) / (1000 * 60 * 60)
}

const newJobs = computed(() => myJobs.value.filter(j => j.status === 'scheduled' || j.status === 'assigned').length)
const inProgressJobs = computed(() => myJobs.value.filter(j => j.status === 'in_progress').length)
const completedToday = computed(() => myJobs.value.filter(j => j.status === 'completed' && isToday(j.updated_at)).length)
const slaBreached = computed(() => myJobs.value.filter(j => j.status !== 'completed' && j.status !== 'cancelled' && getSlaHours(j.created_at) > 2).length)

const activeJobs = computed(() => myJobs.value.filter(j => j.status !== 'completed' && j.status !== 'cancelled'))

const formatSla = (createdStr: string) => {
  if (!createdStr) return '-'
  const hours = getSlaHours(createdStr)
  if (hours > 2) return `Breached (${hours.toFixed(1)}h)`
  return `${hours.toFixed(1)}h / 2.0h`
}

function getCustomerName(id: number | null) {
  return findCustomer(id as any)?.company_name || '-'
}

function getUnitName(unitId: string | null) {
  if (!unitId) return '-'
  const u = findUnit(unitId as any)
  return u ? u.model : '-'
}

function goToDetail(id: number) {
  router.push(`/technician/call-services/${id}`)
}
</script>

<template>
  <div class="tech-dashboard">
    <PageHeader title="Technician Dashboard" />

    <div class="summary-cards">
      <div class="card stat-card">
        <div class="stat-icon new">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
        <div class="stat-info">
          <span class="stat-label">Pekerjaan Baru</span>
          <span class="stat-value">{{ newJobs }}</span>
        </div>
      </div>
      <div class="card stat-card">
        <div class="stat-icon progress">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div class="stat-info">
          <span class="stat-label">Sedang Dikerjakan</span>
          <span class="stat-value">{{ inProgressJobs }}</span>
        </div>
      </div>
      <div class="card stat-card">
        <div class="stat-icon completed">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
        <div class="stat-info">
          <span class="stat-label">Selesai Hari Ini</span>
          <span class="stat-value">{{ completedToday }}</span>
        </div>
      </div>
      <div class="card stat-card">
        <div class="stat-icon danger">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <div class="stat-info">
          <span class="stat-label">SLA Terancam</span>
          <span class="stat-value">{{ slaBreached }}</span>
        </div>
      </div>
    </div>

    <div class="card mt-lg">
      <div class="card-header">
        <h2 class="card-title">Pekerjaan Saya (Aktif)</h2>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Service No</th>
              <th>Customer</th>
              <th>Unit</th>
              <th>Problem</th>
              <th>Status</th>
              <th>SLA</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="job in activeJobs" :key="job.id">
              <td>{{ job.job_order_no }}</td>
              <td>{{ getCustomerName(job.service_request?.customer_id || null) }}</td>
              <td>{{ findUnit(job.service_request?.unit_id || null)?.model || '-' }}</td>
              <td class="text-truncate" style="max-width: 200px;">{{ job.instructions || job.service_request?.problem_description || '-' }}</td>
              <td>
                <span class="badge" :class="'badge-' + (job.status === 'in_progress' ? 'info' : job.status === 'scheduled' || job.status === 'assigned' ? 'warning' : 'danger')">
                  {{ job.status.toUpperCase().replace('_', ' ') }}
                </span>
              </td>
              <td>
                <span :class="{'text-danger font-bold': getSlaHours(job.created_at) > 2}">
                  {{ formatSla(job.created_at) }}
                </span>
              </td>
              <td>
                <button class="btn btn-sm btn-primary" @click="goToDetail(job.id)">Detail</button>
              </td>
            </tr>
            <tr v-if="activeJobs.length === 0">
              <td colspan="7" class="text-center py-lg text-muted">Tidak ada pekerjaan aktif saat ini.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tech-dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}
.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-md);
}
.stat-card {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-lg);
}
.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.stat-icon.new { background: var(--color-primary-surface); color: var(--color-primary); }
.stat-icon.progress { background: rgba(14, 165, 233, 0.1); color: rgb(14, 165, 233); }
.stat-icon.completed { background: rgba(34, 197, 94, 0.1); color: rgb(34, 197, 94); }
.stat-icon.danger { background: rgba(239, 68, 68, 0.1); color: rgb(239, 68, 68); }

.stat-info {
  display: flex;
  flex-direction: column;
}
.stat-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
.stat-value {
  font-size: 24px;
  font-weight: var(--font-weight-bold);
  line-height: 1.2;
}
.text-truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
