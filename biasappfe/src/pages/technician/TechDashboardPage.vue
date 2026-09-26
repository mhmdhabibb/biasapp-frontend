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
    <div class="welcome-header">
      <div class="user-greeting">
        <h1 class="greeting-title">Halo, {{ currentUser?.name || 'Teknisi' }}! 👋</h1>
        <p class="greeting-subtitle">Berikut adalah ringkasan pekerjaan Anda hari ini.</p>
      </div>
    </div>

    <!-- Summary Grid -->
    <div class="stats-grid">
      <div class="stat-box primary">
        <div class="stat-icon-wrapper">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ newJobs }}</span>
          <span class="stat-label">Baru</span>
        </div>
      </div>
      
      <div class="stat-box info">
        <div class="stat-icon-wrapper">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ inProgressJobs }}</span>
          <span class="stat-label">Berjalan</span>
        </div>
      </div>

      <div class="stat-box success">
        <div class="stat-icon-wrapper">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ completedToday }}</span>
          <span class="stat-label">Selesai</span>
        </div>
      </div>

      <div class="stat-box danger">
        <div class="stat-icon-wrapper">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ slaBreached }}</span>
          <span class="stat-label">SLA Lewat</span>
        </div>
      </div>
    </div>

    <!-- Active Jobs Section -->
    <div class="jobs-section">
      <div class="section-header">
        <h2 class="section-title">Pekerjaan Aktif</h2>
        <span class="badge badge-primary">{{ activeJobs.length }} Total</span>
      </div>

      <div class="jobs-list" v-if="activeJobs.length > 0">
        <div v-for="job in activeJobs" :key="job.id" class="job-card" @click="goToDetail(job.id)">
          <div class="job-card-header">
            <span class="job-number">{{ job.job_order_no }}</span>
            <span class="badge" :class="'badge-' + (job.status === 'in_progress' ? 'info' : job.status === 'scheduled' || job.status === 'assigned' ? 'warning' : 'danger')">
              {{ job.status.toUpperCase().replace('_', ' ') }}
            </span>
          </div>
          
          <div class="job-details">
            <div class="detail-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
              <span>{{ getCustomerName(job.service_request?.customer_id || null) }}</span>
            </div>
            <div class="detail-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>
              <span>{{ findUnit(job.service_request?.unit_id || null)?.model || '-' }}</span>
            </div>
            <div class="detail-row problem-desc">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              <span class="truncate">{{ job.instructions || job.service_request?.problem_description || 'Tanpa deskripsi' }}</span>
            </div>
          </div>
          
          <div class="job-card-footer">
            <div class="sla-indicator" :class="{ 'breached': getSlaHours(job.created_at) > 2 }">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span>SLA: {{ formatSla(job.created_at) }}</span>
            </div>
            <div class="action-arrow">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </div>
          </div>
        </div>
      </div>
      
      <div v-else class="empty-state">
        <div class="empty-icon">🎉</div>
        <h3>Semua Beres!</h3>
        <p>Tidak ada pekerjaan aktif untuk Anda saat ini.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tech-dashboard {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-bottom: 32px;
}

.welcome-header {
  padding: 8px 4px 0;
}

.greeting-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 4px 0;
}

.greeting-subtitle {
  font-size: 14px;
  color: var(--color-text-muted);
  margin: 0;
}

/* 2x2 Grid for Mobile */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.stat-box {
  background: var(--color-surface, #fff);
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0,0,0,0.04);
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-box:active {
  transform: scale(0.98);
}

.stat-icon-wrapper {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.primary .stat-icon-wrapper { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.info .stat-icon-wrapper { background: rgba(14, 165, 233, 0.1); color: #0ea5e9; }
.success .stat-icon-wrapper { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
.danger .stat-icon-wrapper { background: rgba(239, 68, 68, 0.1); color: #ef4444; }

.stat-content {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 28px;
  font-weight: 800;
  line-height: 1.1;
  color: var(--color-text);
  margin-bottom: 2px;
}

.stat-label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

/* Jobs Section */
.jobs-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
}

.section-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: var(--color-text);
}

.jobs-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Mobile App Job Card */
.job-card {
  background: var(--color-surface, #fff);
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0,0,0,0.03);
  display: flex;
  flex-direction: column;
  gap: 14px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.2s;
}

.job-card:active {
  background: var(--color-surface-sunken, #f8fafc);
}

.job-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px dashed var(--color-border-light, #e2e8f0);
  padding-bottom: 12px;
}

.job-number {
  font-weight: 700;
  font-size: 14.5px;
  color: var(--color-primary);
  letter-spacing: 0.5px;
}

.job-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 13.5px;
  color: var(--color-text-secondary);
}

.detail-row svg {
  margin-top: 2px;
  flex-shrink: 0;
  opacity: 0.7;
}

.problem-desc {
  color: var(--color-text);
  font-weight: 500;
}

.truncate {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.job-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--color-background, #f1f5f9);
  margin: 2px -16px -16px;
  padding: 12px 16px;
  border-radius: 0 0 16px 16px;
}

.sla-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.sla-indicator.breached {
  color: var(--color-danger, #ef4444);
}

.action-arrow {
  color: var(--color-primary);
  background: rgba(59, 130, 246, 0.1);
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 20px;
  background: var(--color-surface, #fff);
  border-radius: 16px;
  border: 1px dashed var(--color-border, #cbd5e1);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-state h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  color: var(--color-text);
}

.empty-state p {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-muted);
}
</style>
