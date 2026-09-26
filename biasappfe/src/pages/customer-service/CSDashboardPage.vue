<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useMasterStore } from '@/composables/useMasterStore'

const {
  serviceReports,
  serviceRequests,
  jobOrders,
  contractItems,
  sparepartRequests,
  warrantyClaims,
  refresh
} = useMasterStore()

let intervalId: any = null

onMounted(() => {
  intervalId = setInterval(() => {
    refresh(true)
  }, 30000)
})

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
})

// Derived metrics
const newCalls = computed(() => serviceRequests.value.filter(s => s.status === 'open' || s.status === 'pending').length)
const assignedJobs = computed(() => jobOrders.value.filter(j => j.status === 'scheduled' || j.status === 'assigned').length)
const inProgressJobs = computed(() => jobOrders.value.filter(j => j.status === 'in_progress').length)
const waitingSparepartJobs = computed(() => serviceReports.value.filter(s => s.status === 'waiting_sparepart').length)
const completedJobs = computed(() => serviceReports.value.filter(s => s.status === 'completed' || s.status === 'closed').length)

const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const approachingSlaJobs = computed(() => {
  const now = new Date().getTime()
  return serviceReports.value.filter(s => {
    if (s.status === 'completed') return false
    const start = new Date(s.created_at).getTime()
    const elapsed = now - start
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

const maxJobs = computed(() => Math.max(assignedJobs.value, inProgressJobs.value, waitingSparepartJobs.value, approachingSlaJobs.value, breachedSlaJobs.value, 1))

const activeContracts = computed(() => contractItems.value.filter(c => c.status === 'active').length)
const expiringContracts = computed(() => contractItems.value.filter(c => c.status === 'expiring').length)

const pendingSparepartRequests = computed(() => sparepartRequests.value.filter(r => r.status === 'pending').length)
const pendingWarrantyClaims = computed(() => warrantyClaims.value.filter(c => c.status === 'pending' || c.status === 'open').length)

const totalJobsAll = computed(() => newCalls.value + assignedJobs.value + inProgressJobs.value + waitingSparepartJobs.value + completedJobs.value)
const completionPercentage = computed(() => totalJobsAll.value === 0 ? 0 : Math.round((completedJobs.value / totalJobsAll.value) * 100))
</script>

<template>
  <div class="dashboard-container">
    <PageHeader title="Dashboard" />
    <p class="subtitle">Monitor and manage your customer service operations.</p>

    <!-- Top Cards -->
    <div class="top-cards">
      <div class="card card-primary">
        <div class="card-header">
          <span>Service Requests</span>
          <span class="icon-wrapper">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
          </span>
        </div>
        <div class="card-value">{{ newCalls }}</div>
        <div class="card-footer">
          <span class="icon-up"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg></span>
          Waiting for assignment
        </div>
      </div>
      
      <div class="card">
        <div class="card-header">
          <span>In Progress</span>
          <span class="icon-wrapper">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
          </span>
        </div>
        <div class="card-value">{{ inProgressJobs + assignedJobs }}</div>
        <div class="card-footer">
          <span class="icon-up text-success-color"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg></span>
          Assigned and working
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span>Completed</span>
          <span class="icon-wrapper">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
          </span>
        </div>
        <div class="card-value">{{ completedJobs }}</div>
        <div class="card-footer">
          <span class="icon-up text-success-color"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg></span>
          Successfully resolved
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span>Breached SLA</span>
          <span class="icon-wrapper">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
          </span>
        </div>
        <div class="card-value text-danger-color">{{ breachedSlaJobs }}</div>
        <div class="card-footer">
          <span class="icon-up text-danger-color" style="background: rgba(239, 68, 68, 0.1);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span>
          Action required immediately
        </div>
      </div>
    </div>

    <!-- Main Grid -->
    <div class="secondary-grid">
      <!-- Left Column -->
      <div class="card section-card">
        <div class="section-header">
          <h3 class="section-title">Job Analytics</h3>
        </div>
        <div class="bars-container">
          <div class="bar-group">
            <div class="bar-bg">
              <div class="bar-fill" :style="{ height: `${(assignedJobs / maxJobs) * 100}%`, background: 'var(--color-primary)' }"></div>
            </div>
            <span>Asg.</span>
          </div>
          <div class="bar-group">
            <div class="bar-bg">
              <div class="bar-fill" :style="{ height: `${(inProgressJobs / maxJobs) * 100}%`, background: 'var(--color-primary)' }"></div>
            </div>
            <span>InPrg.</span>
          </div>
          <div class="bar-group">
            <div class="bar-bg">
              <div class="bar-fill" :style="{ height: `${(waitingSparepartJobs / maxJobs) * 100}%`, background: '#f59e0b' }"></div>
            </div>
            <span>Wait.Sp</span>
          </div>
          <div class="bar-group">
            <div class="bar-bg">
              <div class="bar-fill" :style="{ height: `${(approachingSlaJobs / maxJobs) * 100}%`, background: '#f59e0b' }"></div>
            </div>
            <span>Appr.SLA</span>
          </div>
          <div class="bar-group">
            <div class="bar-bg">
              <div class="bar-fill" :style="{ height: `${(breachedSlaJobs / maxJobs) * 100}%`, background: '#ef4444' }"></div>
            </div>
            <span>Brch.SLA</span>
          </div>
        </div>
      </div>
      
      <!-- Right Column -->
      <div class="card section-card">
        <div class="section-header">
          <h3 class="section-title">Contracts</h3>
        </div>
        
        <div class="list-item">
          <div class="list-icon" style="background: rgba(16, 185, 129, 0.1); color: #10b981;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          </div>
          <div class="list-content">
            <div class="list-title">Active Contracts</div>
            <div class="list-desc">{{ activeContracts }} customers currently active</div>
          </div>
        </div>

        <div class="list-item">
          <div class="list-icon" style="background: rgba(245, 158, 11, 0.1); color: #f59e0b;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </div>
          <div class="list-content">
            <div class="list-title">Expiring Contracts</div>
            <div class="list-desc">{{ expiringContracts }} need renewal</div>
          </div>
        </div>
      </div>
    </div>

    <div class="secondary-grid mt-4">
      <div class="card section-card">
        <div class="section-header">
          <h3 class="section-title">Pending Requests</h3>
        </div>
        <div class="list-item">
          <div class="list-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          </div>
          <div class="list-content">
            <div class="list-title">Sparepart Requests</div>
            <div class="list-desc">{{ pendingSparepartRequests }} pending approval</div>
          </div>
        </div>
        <div class="list-item">
          <div class="list-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
          </div>
          <div class="list-content">
            <div class="list-title">Warranty Claims</div>
            <div class="list-desc">{{ pendingWarrantyClaims }} pending processing</div>
          </div>
        </div>
      </div>

      <div class="card section-card">
        <div class="section-header">
          <h3 class="section-title">Project Progress</h3>
        </div>
        <div class="donut-chart-wrapper">
          <div class="donut-chart" :style="{ '--completion-deg': `${completionPercentage * 3.6}deg` }">
             <div class="donut-inner">
               <div class="donut-percentage">{{ completionPercentage }}%</div>
               <div class="donut-label">Completed</div>
             </div>
          </div>
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

.card-primary .card-subtitle,
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
  grid-template-columns: 2fr 1fr;
  gap: 20px;
}
.mt-4 {
  margin-top: 20px;
}

@media (max-width: 900px) {
  .secondary-grid {
    grid-template-columns: 1fr;
  }
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

.list-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--color-surface-sunken);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
}

.list-content {
  flex: 1;
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
}

/* Bars */
.bars-container {
  display: flex;
  justify-content: space-around;
  align-items: flex-end;
  height: 180px;
  padding: 10px 0;
}
.bar-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  flex: 1;
}
.bar-bg {
  width: 44px;
  height: 130px;
  background: repeating-linear-gradient(
    -45deg,
    var(--color-border),
    var(--color-border) 2px,
    transparent 2px,
    transparent 8px
  );
  border-radius: 24px;
  position: relative;
}
.bar-fill {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  border-radius: 24px;
  transition: height 1s ease;
}
.bar-group span {
  font-size: 13px;
  color: var(--color-text-muted);
  font-weight: 500;
}

/* Donut Chart */
.donut-chart-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
  min-height: 200px;
}
.donut-chart {
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: conic-gradient(var(--color-primary) var(--completion-deg, 0deg), var(--color-surface-sunken) 0deg);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.donut-inner {
  width: 130px;
  height: 130px;
  background: var(--color-surface, #fff);
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.donut-percentage {
  font-size: 36px;
  font-weight: 700;
  line-height: 1;
  color: var(--color-text);
}
.donut-label {
  font-size: 13px;
  color: var(--color-text-muted);
  margin-top: 6px;
  font-weight: 500;
}
</style>
