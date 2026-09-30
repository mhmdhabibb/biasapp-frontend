<script setup lang="ts">
import PageHeader from '@/components/ui/PageHeader.vue'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
const router = useRouter()
const { currentUser } = useAuth()
const { canAny } = usePermission()
const {
  jobOrders,
  serviceReports,
  technicians,
  findCustomer,
  findUnit,
  refresh
} = useMasterStore()

let intervalId: any = null

onMounted(async () => {
  await refresh(true)
  // Auto-reload data every 30 seconds
  intervalId = setInterval(() => {
    refresh(true)
  }, 30000)
})

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
})

// Find the technician record that belongs to the current logged-in user
const myTechnician = computed(() => {
  if (!currentUser.value?.id) return null
  return technicians.value.find((t: any) => t.user_id === currentUser.value?.id || t.user_id == currentUser.value?.id)
})

const myJobs = computed(() => {
  const techId = myTechnician.value?.id
  if (!techId) return []
  return jobOrders.value.filter(j => j.technician_id === techId)
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
  <div class="dashboard-container">
    <PageHeader title="Dashboard" />
    <p class="subtitle">Ringkasan pekerjaan Anda hari ini.</p>

    <!-- Top Cards -->
    <div class="top-cards">
      <div class="card card-primary">
        <div class="card-header">
          <span>Baru</span>
          <span class="icon-wrapper">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          </span>
        </div>
        <div class="card-value">{{ newJobs }}</div>
        <div class="card-footer">
          <span class="icon-up"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg></span>
          Menunggu dikerjakan
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span>Berjalan</span>
          <span class="icon-wrapper">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </span>
        </div>
        <div class="card-value">{{ inProgressJobs }}</div>
        <div class="card-footer">
          <span class="icon-up text-success-color"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg></span>
          Sedang dikerjakan
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span>Selesai</span>
          <span class="icon-wrapper">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          </span>
        </div>
        <div class="card-value">{{ completedToday }}</div>
        <div class="card-footer">
          <span class="icon-up text-success-color"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg></span>
          Selesai hari ini
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span>SLA Lewat</span>
          <span class="icon-wrapper">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          </span>
        </div>
        <div class="card-value text-danger-color">{{ slaBreached }}</div>
        <div class="card-footer">
          <span class="icon-up text-danger-color" style="background: rgba(239, 68, 68, 0.1);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span>
          Perlu segera ditangani
        </div>
      </div>
    </div>

    <!-- Bottom Section: Pekerjaan Aktif -->
    <div class="secondary-grid">
      <div class="card section-card">
        <div class="section-header">
          <h3 class="section-title">Pekerjaan Aktif</h3>
          <span class="badge badge-primary">{{ activeJobs.length }} Total</span>
        </div>

        <template v-if="activeJobs.length > 0">
          <div v-for="job in activeJobs" :key="job.id" class="list-item clickable" @click="goToDetail(job.id)">
            <div class="list-icon" :style="{
              background: job.status === 'in_progress' ? 'rgba(14, 165, 233, 0.1)' : 'rgba(245, 158, 11, 0.1)',
              color: job.status === 'in_progress' ? '#0ea5e9' : '#f59e0b'
            }">
              <svg v-if="job.status === 'in_progress'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            </div>
            <div class="list-content">
              <div class="list-title">{{ job.job_order_no }}</div>
              <div class="list-desc">{{ getCustomerName(job.service_request?.customer_id || null) }} · SLA: {{ formatSla(job.created_at) }}</div>
            </div>
            <div class="list-arrow">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </div>
          </div>
        </template>

        <div v-else class="empty-state-inline">
          <span>🎉</span>
          <p>Semua Beres! Tidak ada pekerjaan aktif saat ini.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.subtitle {
  color: var(--color-text-muted);
  margin-top: -10px;
  margin-bottom: 24px;
}

.top-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}

.card {
  background: var(--color-surface, #fff);
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.03);
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid var(--color-border);
}

.card-primary {
  background: var(--color-primary);
  color: white;
  border: none;
}

.card-primary .icon-wrapper {
  color: rgba(255, 255, 255, 0.8);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 500;
  font-size: 15px;
}

.card:not(.card-primary) .card-header {
  color: var(--color-text);
}

.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid currentColor;
  opacity: 0.6;
}

.card-value {
  font-size: 42px;
  font-weight: 700;
  line-height: 1;
  margin: 8px 0;
}

.card-footer {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.card:not(.card-primary) .card-footer {
  color: var(--color-text-muted);
}

.icon-up {
  width: 20px;
  height: 20px;
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-primary .icon-up {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.text-success-color { color: #10b981; }
.text-danger-color { color: #ef4444; }

/* Secondary Grid */
.secondary-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
}

.section-card {
  padding: 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--color-text);
}

/* List Items */
.list-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px dashed var(--color-border);
}
.list-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.list-item.clickable {
  cursor: pointer;
  border-radius: 8px;
  padding: 12px;
  margin: 0 -12px;
  transition: background 0.15s;
}
.list-item.clickable:hover {
  background: var(--color-surface-sunken, #f8fafc);
}

.list-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--color-surface-sunken);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--color-primary);
}

.list-content {
  flex: 1;
  min-width: 0;
}

.list-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text);
}
.list-desc {
  font-size: 13px;
  color: var(--color-text-muted);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.list-arrow {
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.empty-state-inline {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 32px 20px;
  gap: 8px;
}
.empty-state-inline span {
  font-size: 40px;
}
.empty-state-inline p {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-muted);
}
</style>
