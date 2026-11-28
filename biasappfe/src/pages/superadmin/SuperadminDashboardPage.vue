<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/services/api'
import DashboardSkeleton from '@/components/ui/DashboardSkeleton.vue'
import type { SuperadminDashboardStats } from '@/types'
import { getCached } from '@/utils/requestCache'

let lastSuperadminStats: SuperadminDashboardStats | null = null

const router = useRouter()
const initialCached =
  lastSuperadminStats ??
  ((getCached<any>('GET:/dashboard/superadmin')?.data ?? null) as SuperadminDashboardStats | null)

const isLoading = ref(!initialCached)
const isRefreshing = ref(false)
const errorMessage = ref('')
const stats = ref<SuperadminDashboardStats | null>(initialCached)

async function fetchStats(silent = false) {
  if (!silent && !stats.value) isLoading.value = true
  else isRefreshing.value = true
  errorMessage.value = ''
  try {
    const res = await api.get<{ data: SuperadminDashboardStats }>(
      '/dashboard/superadmin',
      !silent && !stats.value,
      !silent,
    )
    const next = (res as any)?.data ?? (res as any) ?? null
    if (next) {
      stats.value = next
      lastSuperadminStats = next
    }
  } catch (err: any) {
    if (!stats.value) {
      errorMessage.value = err?.message || 'Gagal memuat statistik dashboard superadmin.'
    }
  } finally {
    isLoading.value = false
    isRefreshing.value = false
  }
}

let refreshTimer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  void fetchStats(Boolean(stats.value))
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void fetchStats(true)
  }, 30000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

const md = computed(() => stats.value?.master_data)
const svc = computed(() => stats.value?.service)

const serviceCompletionRate = computed(() => {
  const sr = svc.value?.service_reports
  if (!sr || sr.total === 0) return 0
  return Math.round((sr.completed / sr.total) * 100)
})

const joCompletionRate = computed(() => {
  const jo = svc.value?.job_orders
  if (!jo || jo.total === 0) return 0
  return Math.round((jo.completed / jo.total) * 100)
})

const maxTrendValue = computed(() => {
  const trend = svc.value?.monthly_trend || []
  let max = 1
  for (const m of trend) {
    max = Math.max(max, m.service_requests, m.job_orders, m.service_reports, m.completed_reports)
  }
  return max
})

function trendHeight(val: number): string {
  return `${Math.max(4, Math.round((val / maxTrendValue.value) * 100))}%`
}

function pct(part: number, total: number): number {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

const unitStatusBars = computed(() => {
  const u = md.value?.units
  if (!u) return []
  return [
    { label: 'Available', value: u.available, color: '#10b981' },
    { label: 'Rented', value: u.rented, color: '#3b82f6' },
    { label: 'Sold', value: u.sold, color: '#6366f1' },
    { label: 'Maintenance', value: u.maintenance, color: '#f59e0b' },
    { label: 'Broken', value: u.broken, color: '#ef4444' },
    { label: 'Lock', value: u.lock, color: '#64748b' },
  ]
})

const jobTypeBars = computed(() => {
  const bt = svc.value?.job_orders?.by_type
  if (!bt) return []
  return [
    { label: 'Service', value: bt.service, color: '#3b82f6' },
    { label: 'Delivery', value: bt.delivery, color: '#10b981' },
    { label: 'Copier Visit', value: bt.visit, color: '#8b5cf6' },
    { label: 'Maintenance', value: bt.maintenance, color: '#f59e0b' },
    { label: 'Survey', value: bt.survey, color: '#06b6d4' },
  ]
})

const maxJobTypeValue = computed(() => {
  return Math.max(1, ...jobTypeBars.value.map(b => b.value))
})

const reportTypeItems = computed(() => {
  const bt = svc.value?.service_reports?.by_type
  if (!bt) return []
  return [
    { label: 'Regular', value: bt.regular },
    { label: 'Repair', value: bt.repair },
    { label: 'Maintenance', value: bt.maintenance },
    { label: 'Installation', value: bt.installation },
    { label: 'Emergency', value: bt.emergency },
    { label: 'Meter Reading', value: bt.meter_reading },
    { label: 'Copier Visit', value: bt.copier },
    { label: 'Delivery', value: bt.delivery },
  ]
})

const referenceMasterCards = computed(() => {
  const r = md.value?.reference
  if (!r) return []
  return [
    { label: 'Brands', count: r.brands, route: '/master/brands' },
    { label: 'Unit Types', count: r.unit_types, route: '/master/unit-types' },
    { label: 'Product Categories', count: r.product_categories, route: '/master/product-categories' },
    { label: 'UOM', count: r.uoms, route: '/master/uoms' },
    { label: 'Paper Sizes', count: r.paper_sizes, route: '/master/paper-sizes' },
    { label: 'Paper Types', count: r.paper_types, route: '/master/paper-types' },
    { label: 'Suppliers', count: r.suppliers, route: '/master/suppliers' },
    { label: 'Users', count: r.users, route: '/master/users' },
    { label: 'Roles', count: r.roles, route: '/master/roles' },
  ]
})

const formattedGeneratedAt = computed(() => {
  if (!stats.value?.generated_at) return ''
  return new Date(stats.value.generated_at).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
})
</script>

<template>
  <DashboardSkeleton v-if="isLoading" variant="superadmin" />

  <div v-else class="dashboard-page sa-dashboard">
    <div class="sa-header">
      <div>
        <div class="sa-badge-row">
          <span class="sa-role-pill">SUPERADMIN EXCLUSIVE</span>
          <span v-if="formattedGeneratedAt" class="sa-timestamp">
            Update: {{ formattedGeneratedAt }}
          </span>
        </div>
        <h1 class="page-title" style="margin-bottom: 4px;">Superadmin Executive Dashboard</h1>
        <p class="subtitle" style="margin: 0;">
          Ringkasan statistik menyeluruh Master Data dan operasional Service.
        </p>
      </div>
      <button
        type="button"
        class="btn btn-outline btn-sm"
        :disabled="isRefreshing"
        @click="fetchStats(true)"
      >
        {{ isRefreshing ? 'Memuat...' : '↻ Refresh Statistik' }}
      </button>
    </div>

    <div v-if="errorMessage" class="sa-error-banner">
      <span>{{ errorMessage }}</span>
      <button type="button" class="btn btn-sm btn-outline" @click="fetchStats(false)">Coba Lagi</button>
    </div>

    <template v-else-if="stats">
      <!-- Top Summary KPIs -->
      <div class="top-cards">
        <div class="card card-primary card-clickable" @click="router.push('/master/customers')">
          <div class="card-header">
            <span>Total Customers</span>
            <span class="icon-badge">👥</span>
          </div>
          <div class="card-value">{{ md?.customers.total ?? 0 }}</div>
          <div class="card-footer">
            Corporate: <strong>{{ md?.customers.corporate ?? 0 }}</strong> &bull;
            Government: <strong>{{ md?.customers.government ?? 0 }}</strong>
          </div>
        </div>

        <div class="card card-clickable" @click="router.push('/master/units')">
          <div class="card-header">
            <span>Total Master Units</span>
            <span class="icon-badge">🖨️</span>
          </div>
          <div class="card-value">{{ md?.units.total ?? 0 }}</div>
          <div class="card-footer">
            Available: <strong>{{ md?.units.available ?? 0 }}</strong> &bull;
            Rented: <strong>{{ md?.units.rented ?? 0 }}</strong> &bull;
            Copier: <strong>{{ md?.units.copier ?? 0 }}</strong>
          </div>
        </div>

        <div class="card card-clickable" @click="router.push('/customer-service/service-requests')">
          <div class="card-header">
            <span>Service Requests</span>
            <span class="icon-badge">📩</span>
          </div>
          <div class="card-value">{{ svc?.service_requests.total ?? 0 }}</div>
          <div class="card-footer">
            Pending: <strong class="text-warning-color">{{ svc?.service_requests.pending ?? 0 }}</strong> &bull;
            In Progress: <strong>{{ svc?.service_requests.in_progress ?? 0 }}</strong> &bull;
            External: <strong>{{ svc?.service_requests.external ?? 0 }}</strong>
          </div>
        </div>

        <div class="card card-clickable" @click="router.push('/customer-service/job-orders')">
          <div class="card-header">
            <span>Job Orders &amp; SLA</span>
            <span class="icon-badge">🛠️</span>
          </div>
          <div class="card-value">{{ svc?.job_orders.total ?? 0 }}</div>
          <div class="card-footer">
            SLA Breached: <strong class="text-danger-color">{{ svc?.job_orders.sla_breached ?? 0 }}</strong> &bull;
            Unassigned: <strong>{{ svc?.job_orders.unassigned ?? 0 }}</strong>
          </div>
        </div>
      </div>

      <!-- Section 1: Master Data Statistics -->
      <div class="sa-section-heading">
        <h2>Statistik Master Data</h2>
        <span class="text-muted text-xs">Klik kartu untuk membuka modul terkait</span>
      </div>

      <div class="sa-grid-3">
        <!-- Unit Status Distribution -->
        <div class="card section-card card-clickable" @click="router.push('/master/units')">
          <div class="section-header">
            <h3 class="section-title">Distribusi Status Unit ({{ md?.units.total ?? 0 }})</h3>
            <span class="tag-pill">Master Units</span>
          </div>
          <div class="stat-bars-list">
            <div v-for="bar in unitStatusBars" :key="bar.label" class="stat-bar-row">
              <div class="stat-bar-meta">
                <span>{{ bar.label }}</span>
                <strong>{{ bar.value }} ({{ pct(bar.value, md?.units.total || 0) }}%)</strong>
              </div>
              <div class="stat-bar-track">
                <div
                  class="stat-bar-fill"
                  :style="{ width: `${pct(bar.value, md?.units.total || 0)}%`, background: bar.color }"
                />
              </div>
            </div>
          </div>
          <div class="mini-pills-row">
            <span class="mini-pill">Copier: {{ md?.units.copier ?? 0 }}</span>
            <span class="mini-pill">Komputer: {{ md?.units.computer ?? 0 }}</span>
            <span class="mini-pill">Eksternal: {{ md?.units.external ?? 0 }}</span>
          </div>
        </div>

        <!-- Products, Technicians, Contracts & Warranties -->
        <div class="card section-card">
          <div class="section-header">
            <h3 class="section-title">Inventaris, Teknisi &amp; Kontrak</h3>
            <span class="tag-pill">Operasional Master</span>
          </div>

          <div class="list-item item-clickable" @click="router.push('/master/products')">
            <div class="list-icon" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6;">📦</div>
            <div class="list-content">
              <div class="list-title">Products &amp; Spareparts ({{ md?.products.total ?? 0 }})</div>
              <div class="list-desc">
                Sparepart: {{ md?.products.spareparts ?? 0 }} &bull;
                In Stock: {{ md?.products.in_stock ?? 0 }} &bull;
                <span :class="{ 'text-danger-color font-semibold': (md?.products.low_or_out_of_stock || 0) > 0 }">
                  Low/Habis: {{ md?.products.low_or_out_of_stock ?? 0 }}
                </span>
              </div>
            </div>
          </div>

          <div class="list-item item-clickable" @click="router.push('/master/technicians')">
            <div class="list-icon" style="background: rgba(16, 185, 129, 0.1); color: #10b981;">👷</div>
            <div class="list-content">
              <div class="list-title">Technicians ({{ md?.technicians.total ?? 0 }})</div>
              <div class="list-desc">
                Available: {{ md?.technicians.available ?? 0 }} &bull;
                Inactive / Non-Active: {{ md?.technicians.inactive ?? 0 }}
              </div>
            </div>
          </div>

          <div class="list-item item-clickable" @click="router.push('/master/contracts')">
            <div class="list-icon" style="background: rgba(139, 92, 246, 0.1); color: #8b5cf6;">📄</div>
            <div class="list-content">
              <div class="list-title">Contracts ({{ md?.contracts.total ?? 0 }})</div>
              <div class="list-desc">
                Active: {{ md?.contracts.active ?? 0 }} &bull;
                Draft: {{ md?.contracts.draft ?? 0 }} &bull;
                Expired: {{ md?.contracts.expired ?? 0 }}
              </div>
            </div>
          </div>

          <div class="list-item item-clickable" @click="router.push('/master/warranties')">
            <div class="list-icon" style="background: rgba(245, 158, 11, 0.1); color: #f59e0b;">🛡️</div>
            <div class="list-content">
              <div class="list-title">Warranties ({{ md?.warranties.total ?? 0 }})</div>
              <div class="list-desc">
                Active: {{ md?.warranties.active ?? 0 }} &bull;
                Claimed: {{ md?.warranties.claimed ?? 0 }} &bull;
                Expired: {{ md?.warranties.expired ?? 0 }}
              </div>
            </div>
          </div>
        </div>

        <!-- Reference Masters Grid -->
        <div class="card section-card">
          <div class="section-header">
            <h3 class="section-title">Master Referensi &amp; Akses</h3>
            <span class="tag-pill">Setup Data</span>
          </div>
          <div class="ref-mini-grid">
            <button
              v-for="refCard in referenceMasterCards"
              :key="refCard.label"
              type="button"
              class="ref-mini-tile"
              @click="router.push(refCard.route)"
            >
              <span class="ref-mini-value">{{ refCard.count }}</span>
              <span class="ref-mini-label">{{ refCard.label }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Section 2: Service Statistics -->
      <div class="sa-section-heading" style="margin-top: 28px;">
        <h2>Statistik Service &amp; Operasional Lapangan</h2>
        <span class="text-muted text-xs">Monitoring SR, Job Order, Service Report, Survey &amp; Klaim</span>
      </div>

      <div class="sa-grid-3">
        <!-- Service Reports Completion + Segment -->
        <div class="card section-card card-clickable" @click="router.push('/customer-service/service-reports')">
          <div class="section-header">
            <h3 class="section-title">Service Reports ({{ svc?.service_reports.total ?? 0 }})</h3>
            <span class="tag-pill">{{ serviceCompletionRate }}% Selesai</span>
          </div>
          <div class="donut-row">
            <div
              class="donut-chart"
              :style="{ '--completion-deg': `${serviceCompletionRate * 3.6}deg` }"
            >
              <div class="donut-inner">
                <div class="donut-percentage">{{ serviceCompletionRate }}%</div>
                <div class="donut-label">Completed</div>
              </div>
            </div>
            <div class="donut-legend">
              <div><span>Draft:</span> <strong>{{ svc?.service_reports.draft ?? 0 }}</strong></div>
              <div><span>Pending:</span> <strong>{{ svc?.service_reports.pending ?? 0 }}</strong></div>
              <div><span>Assigned:</span> <strong>{{ svc?.service_reports.assigned ?? 0 }}</strong></div>
              <div><span>In Progress:</span> <strong>{{ svc?.service_reports.in_progress ?? 0 }}</strong></div>
              <div><span>Completed:</span> <strong class="text-success-color">{{ svc?.service_reports.completed ?? 0 }}</strong></div>
              <div><span>Cancelled:</span> <strong class="text-danger-color">{{ svc?.service_reports.cancelled ?? 0 }}</strong></div>
            </div>
          </div>
          <div class="mini-pills-row" style="margin-top: 10px;">
            <span class="mini-pill">Corporate: {{ svc?.service_reports.corporate ?? 0 }}</span>
            <span class="mini-pill">Government: {{ svc?.service_reports.government ?? 0 }}</span>
          </div>
        </div>

        <!-- Job Orders by Type & Status -->
        <div class="card section-card card-clickable" @click="router.push('/customer-service/job-orders')">
          <div class="section-header">
            <h3 class="section-title">Job Orders by Type ({{ svc?.job_orders.total ?? 0 }})</h3>
            <span class="tag-pill">{{ joCompletionRate }}% Completed</span>
          </div>
          <div class="stat-bars-list">
            <div v-for="jb in jobTypeBars" :key="jb.label" class="stat-bar-row">
              <div class="stat-bar-meta">
                <span>{{ jb.label }}</span>
                <strong>{{ jb.value }}</strong>
              </div>
              <div class="stat-bar-track">
                <div
                  class="stat-bar-fill"
                  :style="{ width: `${Math.round((jb.value / maxJobTypeValue) * 100)}%`, background: jb.color }"
                />
              </div>
            </div>
          </div>
          <div class="mini-pills-row">
            <span class="mini-pill">Scheduled: {{ svc?.job_orders.scheduled ?? 0 }}</span>
            <span class="mini-pill">In Progress: {{ svc?.job_orders.in_progress ?? 0 }}</span>
            <span class="mini-pill">Completed: {{ svc?.job_orders.completed ?? 0 }}</span>
          </div>
        </div>

        <!-- Survey, Sparepart Requests, Warranty Claims, DO & Rentals -->
        <div class="card section-card">
          <div class="section-header">
            <h3 class="section-title">Pipeline Service Terkait</h3>
            <span class="tag-pill">Transaksi</span>
          </div>

          <div class="list-item item-clickable" @click="router.push('/customer-service/surveys')">
            <div class="list-icon" style="background: rgba(6, 182, 212, 0.1); color: #06b6d4;">📍</div>
            <div class="list-content">
              <div class="list-title">Surveys ({{ svc?.surveys.total ?? 0 }})</div>
              <div class="list-desc">
                Pending: {{ svc?.surveys.pending ?? 0 }} &bull;
                In Progress: {{ svc?.surveys.in_progress ?? 0 }} &bull;
                Completed: {{ svc?.surveys.completed ?? 0 }}
              </div>
            </div>
          </div>

          <div class="list-item item-clickable" @click="router.push('/customer-service/sparepart-request')">
            <div class="list-icon" style="background: rgba(245, 158, 11, 0.1); color: #f59e0b;">🧩</div>
            <div class="list-content">
              <div class="list-title">Sparepart Requests ({{ svc?.sparepart_requests.total ?? 0 }})</div>
              <div class="list-desc">
                Pending: {{ svc?.sparepart_requests.pending ?? 0 }} &bull;
                PO Created: {{ svc?.sparepart_requests.po_created ?? 0 }} &bull;
                Completed: {{ svc?.sparepart_requests.completed ?? 0 }}
              </div>
            </div>
          </div>

          <div class="list-item item-clickable" @click="router.push('/customer-service/warranty-claims')">
            <div class="list-icon" style="background: rgba(239, 68, 68, 0.1); color: #ef4444;">🛠️</div>
            <div class="list-content">
              <div class="list-title">Warranty Claims ({{ svc?.warranty_claims.total ?? 0 }})</div>
              <div class="list-desc">
                Pending: {{ svc?.warranty_claims.pending ?? 0 }} &bull;
                Approved: {{ svc?.warranty_claims.approved ?? 0 }} &bull;
                Completed: {{ svc?.warranty_claims.completed ?? 0 }}
              </div>
            </div>
          </div>

          <div class="list-item item-clickable" @click="router.push('/customer-service/delivery-monitoring')">
            <div class="list-icon" style="background: rgba(16, 185, 129, 0.1); color: #10b981;">🚚</div>
            <div class="list-content">
              <div class="list-title">Delivery Orders ({{ svc?.delivery_orders.total ?? 0 }}) &amp; Rentals ({{ svc?.rentals.total ?? 0 }})</div>
              <div class="list-desc">
                DO Pending: {{ svc?.delivery_orders.pending ?? 0 }} &bull;
                DO Delivered/Done: {{ (svc?.delivery_orders.delivered || 0) + (svc?.delivery_orders.completed || 0) }} &bull;
                Rental Active: {{ svc?.rentals.active ?? 0 }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Row: Monthly Service Trend + Service Report Breakdown by Service Type -->
      <div class="sa-grid-2" style="margin-top: 20px;">
        <div class="card section-card">
          <div class="section-header">
            <h3 class="section-title">Tren Bulanan Service (6 Bulan Terakhir)</h3>
            <div class="trend-legend">
              <span><i class="dot" style="background:#3b82f6" />SR</span>
              <span><i class="dot" style="background:#8b5cf6" />JO</span>
              <span><i class="dot" style="background:#10b981" />Report Completed</span>
            </div>
          </div>
          <div class="trend-chart">
            <div v-for="m in svc?.monthly_trend || []" :key="m.month" class="trend-col">
              <div class="trend-bars">
                <div
                  class="trend-bar"
                  style="background:#3b82f6"
                  :style="{ height: trendHeight(m.service_requests) }"
                  :title="`Service Requests: ${m.service_requests}`"
                />
                <div
                  class="trend-bar"
                  style="background:#8b5cf6"
                  :style="{ height: trendHeight(m.job_orders) }"
                  :title="`Job Orders: ${m.job_orders}`"
                />
                <div
                  class="trend-bar"
                  style="background:#10b981"
                  :style="{ height: trendHeight(m.completed_reports) }"
                  :title="`Report Completed: ${m.completed_reports} / Total Report: ${m.service_reports}`"
                />
              </div>
              <div class="trend-counts">{{ m.service_requests }}/{{ m.job_orders }}/{{ m.completed_reports }}</div>
              <div class="trend-label">{{ m.label }}</div>
            </div>
          </div>
        </div>

        <div class="card section-card">
          <div class="section-header">
            <h3 class="section-title">Rincian Service Report Berdasarkan Jenis Service</h3>
            <span class="tag-pill">Total {{ svc?.service_reports.total ?? 0 }}</span>
          </div>
          <div class="report-type-grid">
            <div v-for="rt in reportTypeItems" :key="rt.label" class="report-type-item">
              <span class="report-type-label">{{ rt.label }}</span>
              <strong class="report-type-value">{{ rt.value }}</strong>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sa-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.sa-badge-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.sa-role-pill {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(var(--color-primary-rgb, 37, 99, 235), 0.12);
  color: var(--color-primary);
}

.sa-timestamp {
  font-size: 12px;
  color: var(--color-text-muted);
}

.sa-error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: #dc2626;
  margin-bottom: 20px;
}

.sa-section-heading {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 14px;
  gap: 12px;
  flex-wrap: wrap;
}

.sa-section-heading h2 {
  font-size: 17px;
  font-weight: 700;
  margin: 0;
  color: var(--color-text);
}

.top-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.sa-grid-3 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(310px, 1fr));
  gap: 18px;
}

.sa-grid-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 18px;
}

.card {
  background: var(--color-surface, #fff);
  border-radius: 18px;
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--color-border);
}

.card-clickable {
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.card-clickable:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.07);
}

.card-primary {
  background: var(--color-primary);
  color: #fff;
  border: none;
}

.card-primary .card-header,
.card-primary .card-footer {
  color: rgba(255, 255, 255, 0.9);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text);
}

.icon-badge {
  font-size: 18px;
}

.card-value {
  font-size: 36px;
  font-weight: 700;
  line-height: 1.05;
}

.card-footer {
  font-size: 12.5px;
  color: var(--color-text-muted);
}

.section-card {
  padding: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  color: var(--color-text);
}

.tag-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
}

.stat-bars-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stat-bar-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-bar-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12.5px;
  color: var(--color-text);
}

.stat-bar-track {
  height: 8px;
  background: var(--color-surface-sunken);
  border-radius: 999px;
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.5s ease;
}

.mini-pills-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}

.mini-pill {
  font-size: 11.5px;
  padding: 4px 10px;
  border-radius: 8px;
  background: var(--color-surface-sunken);
  color: var(--color-text-secondary);
  font-weight: 500;
}

.list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  border-bottom: 1px dashed var(--color-border);
}

.list-item:last-child {
  border-bottom: none;
}

.item-clickable {
  cursor: pointer;
  border-radius: 10px;
  transition: background 0.15s ease;
}

.item-clickable:hover {
  background: var(--color-surface-sunken);
}

.list-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  flex-shrink: 0;
}

.list-content {
  flex: 1;
  min-width: 0;
}

.list-title {
  font-weight: 600;
  font-size: 13.5px;
  color: var(--color-text);
}

.list-desc {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 2px;
}

.ref-mini-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.ref-mini-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-sunken);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, transform 0.15s ease;
}

.ref-mini-tile:hover {
  border-color: var(--color-primary);
  transform: translateY(-1px);
}

.ref-mini-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-primary);
  line-height: 1.1;
}

.ref-mini-label {
  font-size: 11.5px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.donut-row {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.donut-chart {
  width: 132px;
  height: 132px;
  border-radius: 50%;
  background: conic-gradient(
    var(--color-primary) var(--completion-deg, 0deg),
    var(--color-surface-sunken) 0deg
  );
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.donut-inner {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: var(--color-surface, #fff);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.donut-percentage {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1;
}

.donut-label {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 4px;
}

.donut-legend {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
  font-size: 12.5px;
}

.donut-legend > div {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  color: var(--color-text-secondary);
}

.trend-legend {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.trend-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.trend-legend .dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}

.trend-chart {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  align-items: end;
  padding-top: 12px;
}

.trend-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.trend-bars {
  height: 130px;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 4px;
  padding: 6px 4px 0;
  background: var(--color-surface-sunken);
  border-radius: 10px;
}

.trend-bar {
  width: 12px;
  border-radius: 6px 6px 2px 2px;
  transition: height 0.4s ease;
}

.trend-counts {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.trend-label {
  font-size: 11.5px;
  color: var(--color-text-muted);
}

.report-type-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
  gap: 10px;
}

.report-type-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-sunken);
}

.report-type-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.report-type-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
}

.text-success-color {
  color: #10b981;
}
.text-warning-color {
  color: #d97706;
}
.text-danger-color {
  color: #ef4444;
}
</style>
