<script setup lang="ts">
import CustomSelect from '@/components/ui/CustomSelect.vue'
import DataTable from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import type { TableColumn } from '@/types'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const router = useRouter()
const route = useRoute()
const { can } = usePermission()
const masterStore = useMasterStore()
const { ensureResourcesLoaded } = masterStore
const isLoading = ref(true)

const {
  serviceRequests,
  jobOrders,
  serviceReports,
  deliveryOrders,
  customers,
  units,
  products,
  technicians,
  findCustomer,
  findContractItem,
  findUnit,
  findProduct,
  findTechnician,
  formatUnitDisplayName,
} = masterStore

async function loadData(force = false) {
  isLoading.value = true
  try {
    if (force) {
      const needed = ['serviceRequests', 'jobOrders', 'serviceReports', 'deliveryOrders', 'technicians', 'customers', 'units', 'products']
      await masterStore.refreshOnly(needed, true)
    } else {
      await ensureResourcesLoaded(route.path)
    }
  } finally {
    isLoading.value = false
  }
}

function handleDataMutated() {
  void loadData(true)
}

let timer: any = null
onMounted(async () => {
  await loadData()
  timer = setInterval(() => { now.value = Date.now() }, 30000)
  window.addEventListener('bias:data-mutated', handleDataMutated)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('bias:data-mutated', handleDataMutated)
})

// Active tab filter
type ServiceCategory = 'all' | 'standalone' | 'request' | 'job_order' | 'report' | 'copier'
const activeCategory = ref<ServiceCategory>('all')

// Filters per Customer & per Teknisi
const selectedCustomerId = ref<any>(null)
const selectedTechnicianId = ref<any>(null)

const customerFilterOptions = computed(() => {
  const list = (customers.value || []) as any[]
  const opts = [{ value: null as any, label: 'All Customers' }]
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    opts.push({
      value: c.id,
      label: c.company_name || c.name || `Customer ${c.id}`
    })
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label))
})

const technicianFilterOptions = computed(() => {
  const list = (technicians.value || []) as any[]
  const opts = [
    { value: null as any, label: 'All Technicians' },
    { value: 'unassigned', label: 'Unassigned / No Technician' }
  ]
  for (let i = 0; i < list.length; i++) {
    const t = list[i]
    opts.push({
      value: t.id,
      label: t.user?.name || t.name || `Technician ${t.id}`
    })
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label))
})

const hasActiveFilter = computed(() => !!selectedCustomerId.value || !!selectedTechnicianId.value)

function clearFilters() {
  selectedCustomerId.value = null
  selectedTechnicianId.value = null
}

const columns: TableColumn[] = [
  { key: 'service_no', label: 'Service No' },
  { key: 'category_label', label: 'Service Type' },
  { key: 'customer_name', label: 'Company / Customer' },
  { key: 'unit_name', label: 'Unit / Machine' },
  { key: 'serial_no', label: 'Serial Number' },
  { key: 'problem', label: 'Problem / Remarks' },
  { key: 'technician_name', label: 'Technician' },
  { key: 'status', label: 'Status' },
  { key: 'sla', label: 'SLA' },
]

// Real-time SLA update logic
const now = ref(Date.now())

// Resolvers
function resolveCustomerName(cId?: string, custObj?: any): string {
  if (custObj?.company_name || custObj?.name) return custObj.company_name || custObj.name
  if (!cId) return '-'
  const c = findCustomer(cId)
  return c ? (c.company_name || c.name || '-') : '-'
}

function resolveUnitDisplay(uId?: string, unitObj?: any, extBrand?: string, extModel?: string, isExt?: boolean): { name: string; serial: string } {
  if (isExt) {
    return {
      name: `${extBrand || ''} ${extModel || ''} (External)`.trim() || 'External Unit',
      serial: '-'
    }
  }
  if (unitObj) {
    const brand = unitObj.brand?.name || unitObj.brand || ''
    const model = unitObj.model || unitObj.name || ''
    return {
      name: `${brand} ${model}`.trim() || 'Machine Unit',
      serial: unitObj.serial_no || '-'
    }
  }
  if (uId) {
    const u = findUnit(uId)
    if (u) {
      const brand = (u as any).brand?.name || (u as any).brand || ''
      const model = u.model || u.name || ''
      return {
        name: `${brand} ${model}`.trim() || 'Machine Unit',
        serial: u.serial_no || '-'
      }
    }
    const p = findProduct(uId)
    if (p) {
      return {
        name: `[Part] ${p.name}`,
        serial: p.sku || '-'
      }
    }
  }
  return { name: '-', serial: '-' }
}

function resolveStandaloneItems(row: any): { name: string; serial: string } {
  const items = row?.delivery_order_items || []
  if (!items.length) {
    if (row.unit_id) {
      const u: any = findUnit(row.unit_id)
      return {
        name: u ? `${u.brand?.name || ''} ${u.model || ''}`.trim() : 'Machine Unit',
        serial: u?.serial_no || '-'
      }
    }
    return { name: '-', serial: '-' }
  }
  const first = items[0]
  if (first.unit_id) {
    const u: any = findUnit(first.unit_id)
    return {
      name: u ? `${(u.brand?.name || u.brand || '')} ${u.model || u.name}`.trim() : 'Machine Unit',
      serial: u?.serial_no || first.serial_no || '-'
    }
  }
  if (first.product_id) {
    const p: any = findProduct(first.product_id)
    return {
      name: p ? `[Part] ${p.name}` : 'Product',
      serial: p?.sku || first.serial_no || '-'
    }
  }
  if (first.model) {
    return { name: first.model, serial: first.serial_no || '-' }
  }
  return { name: 'Standalone Service Item', serial: first.serial_no || '-' }
}

function resolveTechnicianName(tId?: string, techObj?: any): string {
  if (techObj?.name) return techObj.name
  if (techObj?.user?.name) return techObj.user.name
  if (tId) {
    const t = findTechnician(tId)
    if (t?.name) return t.name
    if ((t as any)?.user?.name) return (t as any).user.name
  }
  return 'Unassigned'
}

export interface MonitoredService {
  id: string
  category: 'standalone' | 'request' | 'job_order' | 'report' | 'copier'
  category_label: string
  service_no: string
  customer_id?: string | null
  customer_name: string
  unit_name: string
  serial_no: string
  problem: string
  technician_id?: string | null
  technician_name: string
  status: string
  created_at: string
  updated_at: string
  createdAtMs: number
  updatedAtMs: number
  is_completed: boolean
  target_route: string
}

// Transform all services into a unified list
const allMonitoredServices = computed<MonitoredService[]>(() => {
  const result: MonitoredService[] = []

  // 1. Service Reports (Teknis & Copier Visits)
  for (const r of (serviceReports.value || [])) {
    const isCopier = (r.report_no || '').startsWith('CPR') || String(r.service_type || '').toLowerCase() === 'copier'
    const unitInfo = resolveUnitDisplay(r.unit_id, r.unit)
    
    let catLabel = 'Service Report'
    if (isCopier) {
      catLabel = 'Copier Visit (Routine)'
    } else if (r.service_type === 'corrective') {
      catLabel = 'Repair (Corrective)'
    } else if (r.service_type === 'preventive') {
      catLabel = 'Preventive Maintenance'
    } else if (r.service_type === 'maintenance') {
      catLabel = 'Maintenance'
    } else if (r.service_type === 'installation') {
      catLabel = 'Installation'
    } else if (r.service_type === 'delivery') {
      catLabel = 'Delivery'
    } else if (r.service_type) {
      catLabel = String(r.service_type).charAt(0).toUpperCase() + String(r.service_type).slice(1)
    }

    const cAt = r.created_at || (r as any).service_date || new Date().toISOString()
    const uAt = r.updated_at || r.created_at || cAt
    const isComp = r.status === 'completed' || !!r.is_completed

    result.push({
      id: r.id,
      category: isCopier ? 'copier' : 'report',
      category_label: catLabel,
      service_no: r.report_no || (r as any).service_report_no || ('SR-' + String(r.id).slice(0, 8).toUpperCase()),
      customer_id: r.customer_id,
      customer_name: resolveCustomerName(r.customer_id, r.customer),
      unit_name: unitInfo.name,
      serial_no: unitInfo.serial,
      problem: r.machine_problem || (r as any).repair_action || (isCopier ? 'Routine monthly meter reading' : '-'),
      technician_id: r.technician_id,
      technician_name: resolveTechnicianName(r.technician_id, r.technician),
      status: r.status || (isCopier ? 'draft' : 'open'),
      created_at: cAt,
      updated_at: uAt,
      createdAtMs: new Date(cAt).getTime() || Date.now(),
      updatedAtMs: new Date(uAt).getTime() || Date.now(),
      is_completed: isComp,
      target_route: `/shared/service-reports/${r.id}`
    })
  }

  // 2. Standalone Service History (DO bertipe service)
  for (const d of (deliveryOrders.value || [])) {
    if (String(d.do_type || '').toLowerCase() !== 'service') continue

    const custName = resolveCustomerName(d.customer_id, d.customer)
    const unitInfo = resolveStandaloneItems(d)
    const cAt = d.created_at || d.delivery_date || new Date().toISOString()
    const uAt = d.updated_at || d.created_at || cAt
    const isComp = ['completed', 'delivered', 'done'].includes(String(d.status || '').toLowerCase())

    result.push({
      id: d.id,
      category: 'standalone',
      category_label: 'Stand Alone',
      service_no: d.do_number || ('DOS-' + String(d.id).slice(0, 8).toUpperCase()),
      customer_id: d.customer_id,
      customer_name: custName,
      unit_name: unitInfo.name,
      serial_no: unitInfo.serial,
      problem: d.remarks || d.action || (d.delivery_order_items?.[0]?.description) || 'Standalone Service',
      technician_id: d.technician_id,
      technician_name: resolveTechnicianName(d.technician_id, d.technician),
      status: d.status || 'open',
      created_at: cAt,
      updated_at: uAt,
      createdAtMs: new Date(cAt).getTime() || Date.now(),
      updatedAtMs: new Date(uAt).getTime() || Date.now(),
      is_completed: isComp,
      target_route: `/customer-service/standalone-service-history`
    })
  }

  // 3. Job Orders (Penugasan Teknisi)
  for (const j of (jobOrders.value || [])) {
    const custId = j.customer_id || j.service_request?.customer_id || j.delivery_order?.customer_id
    const custObj = j.customer || j.service_request?.customer || j.delivery_order?.customer
    
    const unitId = j.unit_id || j.service_request?.unit_id
    const unitObj = j.unit || j.service_request?.unit
    const isExt = !!j.service_request?.is_external
    const extBrand = j.service_request?.external_brand
    const extModel = j.service_request?.external_model
    const unitInfo = resolveUnitDisplay(unitId, unitObj, extBrand, extModel, isExt)
    if (isExt && j.service_request?.external_serial_no) {
      unitInfo.serial = j.service_request.external_serial_no
    }

    let joLabel = 'Job Order (SPK)'
    if (j.job_type === 'visit') joLabel = 'Job Order (Visit)'
    else if (j.job_type === 'delivery') joLabel = 'Job Order (Delivery)'

    const cAt = j.created_at || j.scheduled_date || new Date().toISOString()
    const uAt = j.updated_at || j.created_at || cAt
    const isComp = ['completed', 'done'].includes(String(j.status || '').toLowerCase())

    result.push({
      id: j.id,
      category: 'job_order',
      category_label: joLabel,
      service_no: j.job_order_no || ('JO-' + String(j.id).slice(0, 8).toUpperCase()),
      customer_id: custId,
      customer_name: resolveCustomerName(custId, custObj),
      unit_name: unitInfo.name,
      serial_no: unitInfo.serial,
      problem: j.instructions || j.service_request?.problem_description || 'Technician job assignment instructions',
      technician_id: j.technician_id,
      technician_name: resolveTechnicianName(j.technician_id, j.technician),
      status: j.status || 'scheduled',
      created_at: cAt,
      updated_at: uAt,
      createdAtMs: new Date(cAt).getTime() || Date.now(),
      updatedAtMs: new Date(uAt).getTime() || Date.now(),
      is_completed: isComp,
      target_route: `/customer-service/job-orders`
    })
  }

  // 4. Service Requests / Call Service (Tiket Keluhan Masuk)
  for (const sr of (serviceRequests.value || [])) {
    const isExt = !!sr.is_external
    const unitInfo = resolveUnitDisplay(sr.unit_id, sr.unit, sr.external_brand, sr.external_model, isExt)
    if (isExt && sr.external_serial_no) {
      unitInfo.serial = sr.external_serial_no
    }

    const cAt = sr.created_at || sr.request_date || new Date().toISOString()
    const uAt = sr.updated_at || sr.created_at || cAt
    const isComp = ['completed', 'resolved', 'closed'].includes(String(sr.status || '').toLowerCase())

    result.push({
      id: sr.id,
      category: 'request',
      category_label: isExt ? 'Call Service (External Unit)' : 'Call Service (Request)',
      service_no: sr.request_no || ('REQ-' + String(sr.id).slice(0, 8).toUpperCase()),
      customer_id: sr.customer_id,
      customer_name: resolveCustomerName(sr.customer_id, sr.customer),
      unit_name: unitInfo.name,
      serial_no: unitInfo.serial,
      problem: sr.problem_description || '-',
      technician_id: sr.technician_id,
      technician_name: resolveTechnicianName(sr.technician_id),
      status: sr.status || 'pending',
      created_at: cAt,
      updated_at: uAt,
      createdAtMs: new Date(cAt).getTime() || Date.now(),
      updatedAtMs: new Date(uAt).getTime() || Date.now(),
      is_completed: isComp,
      target_route: `/customer-service/service-requests`
    })
  }

  // Fast integer sort by timestamp descending
  return result.sort((a, b) => b.createdAtMs - a.createdAtMs)
})

// Base filtered by Customer and Technician dropdowns
const baseFilteredServices = computed(() => {
  let list = allMonitoredServices.value

  if (selectedCustomerId.value) {
    const cIdStr = String(selectedCustomerId.value)
    list = list.filter(s => String(s.customer_id) === cIdStr)
  }

  if (selectedTechnicianId.value) {
    if (selectedTechnicianId.value === 'unassigned') {
      list = list.filter(s => !s.technician_id || s.technician_name === 'Unassigned' || s.technician_name === 'Belum Ditugaskan')
    } else {
      const tIdStr = String(selectedTechnicianId.value)
      list = list.filter(s => String(s.technician_id) === tIdStr)
    }
  }

  return list
})

// Final displayed data filtered by category tab
const displayedServices = computed(() => {
  if (activeCategory.value === 'all') {
    return baseFilteredServices.value
  }
  return baseFilteredServices.value.filter(s => s.category === activeCategory.value)
})

// Single-pass computation for all metrics (ultra fast O(N), no garbage arrays)
const serviceMetrics = computed(() => {
  const list = baseFilteredServices.value
  let standalone = 0
  let request = 0
  let jobOrder = 0
  let report = 0
  let copier = 0
  let pending = 0
  let inProgress = 0
  let completed = 0

  for (let i = 0; i < list.length; i++) {
    const s = list[i]
    if (s.category === 'standalone') standalone++
    else if (s.category === 'request') request++
    else if (s.category === 'job_order') jobOrder++
    else if (s.category === 'report') report++
    else if (s.category === 'copier') copier++

    if (s.is_completed) {
      completed++
    } else {
      const st = String(s.status || '').toLowerCase()
      if (['pending', 'draft', 'open'].includes(st)) {
        pending++
      } else if (['in_progress', 'scheduled', 'assigned', 'waiting_sparepart'].includes(st)) {
        inProgress++
      }
    }
  }

  return {
    total: list.length,
    standalone,
    request,
    jobOrder,
    report,
    copier,
    pending,
    inProgress,
    completed
  }
})

const totalAllCount = computed(() => serviceMetrics.value.total)
const totalStandaloneCount = computed(() => serviceMetrics.value.standalone)
const totalRequestCount = computed(() => serviceMetrics.value.request)
const totalJobOrderCount = computed(() => serviceMetrics.value.jobOrder)
const totalReportCount = computed(() => serviceMetrics.value.report)
const totalCopierCount = computed(() => serviceMetrics.value.copier)
const pendingCount = computed(() => serviceMetrics.value.pending)
const inProgressCount = computed(() => serviceMetrics.value.inProgress)
const completedCount = computed(() => serviceMetrics.value.completed)

function getSlaStatus(item: MonitoredService) {
  if (item.category === 'copier') {
    return item.is_completed ? 'safe' : 'scheduled'
  }
  const start = item.createdAtMs
  const end = item.is_completed ? item.updatedAtMs : now.value
  const elapsedHours = Math.max(0, end - start) / 3600000
  
  if (item.is_completed) {
    return elapsedHours > 24 ? 'breached' : 'safe'
  }
  if (elapsedHours > 24) return 'breached'
  if (elapsedHours > 4) return 'warning'
  return 'safe'
}

function formatSlaTime(item: MonitoredService) {
  if (item.category === 'copier') {
    return item.is_completed ? 'Completed' : 'Routine Visit'
  }
  const start = item.createdAtMs
  const end = item.is_completed ? item.updatedAtMs : now.value
  const elapsedMs = Math.max(0, end - start)
  
  const h = Math.floor(elapsedMs / 3600000)
  const m = Math.floor((elapsedMs % 3600000) / 60000)
  return `${h}h ${m}m`
}

function getCategoryBadgeClass(category: string): string {
  switch (category) {
    case 'standalone':
      return 'badge-category-standalone'
    case 'request':
      return 'badge-category-request'
    case 'job_order':
      return 'badge-category-job'
    case 'report':
      return 'badge-category-report'
    case 'copier':
      return 'badge-category-copier'
    default:
      return 'badge-neutral'
  }
}

function getStatusBadgeClass(status: string): string {
  const s = (status || '').toLowerCase()
  if (['completed', 'resolved', 'closed', 'done', 'delivered'].includes(s)) return 'badge-success'
  if (['in_progress', 'continue'].includes(s)) return 'badge-warning'
  if (['waiting_sparepart'].includes(s)) return 'badge-warning'
  if (['assigned', 'scheduled', 'open'].includes(s)) return 'badge-info'
  if (['pending', 'draft'].includes(s)) return 'badge-neutral'
  if (['cancelled', 'canceled'].includes(s)) return 'badge-danger'
  return 'badge-neutral'
}

function navigateToDetail(item: MonitoredService) {
  if (item.target_route) {
    router.push(item.target_route)
  }
}
</script>

<template>
  <div>
    <PageHeader title="Monitoring Service" subtitle="Track all service activities: Stand Alone, Call Service (Requests), Job Orders (SPK), Technical Reports, and Routine Copier Visits.">
      <template #actions>
        <button class="btn btn-outline" @click="loadData(true)" style="display: flex; align-items: center; gap: 6px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19"/></svg>
          Refresh Data
        </button>
        <router-link to="/customer-service/call-service" class="btn btn-primary" style="display: flex; align-items: center; gap: 6px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          New Call Service
        </router-link>
      </template>
    </PageHeader>

    <!-- KPI Summary Cards -->
    <div class="kpi-grid">
      <div class="kpi-card" @click="activeCategory = 'all'" :class="{ 'kpi-card--active': activeCategory === 'all' }">
        <div class="kpi-label">Total Services</div>
        <div class="kpi-value text-primary">{{ totalAllCount }}</div>
        <div class="kpi-sub">{{ pendingCount }} Pending &bull; {{ inProgressCount }} In Progress</div>
      </div>
      <div class="kpi-card" @click="activeCategory = 'standalone'" :class="{ 'kpi-card--active': activeCategory === 'standalone' }">
        <div class="kpi-label">Stand Alone</div>
        <div class="kpi-value text-standalone">{{ totalStandaloneCount }}</div>
        <div class="kpi-sub">Standalone DO Service</div>
      </div>
      <div class="kpi-card" @click="activeCategory = 'request'" :class="{ 'kpi-card--active': activeCategory === 'request' }">
        <div class="kpi-label">Call Service / Request</div>
        <div class="kpi-value text-blue">{{ totalRequestCount }}</div>
        <div class="kpi-sub">Incoming Ticket Requests</div>
      </div>
      <div class="kpi-card" @click="activeCategory = 'job_order'" :class="{ 'kpi-card--active': activeCategory === 'job_order' }">
        <div class="kpi-label">Job Order (SPK)</div>
        <div class="kpi-value text-purple">{{ totalJobOrderCount }}</div>
        <div class="kpi-sub">Field Job Assignments</div>
      </div>
      <div class="kpi-card" @click="activeCategory = 'report'" :class="{ 'kpi-card--active': activeCategory === 'report' }">
        <div class="kpi-label">Technical Report (SR)</div>
        <div class="kpi-value text-emerald">{{ totalReportCount }}</div>
        <div class="kpi-sub">Repair & Maintenance</div>
      </div>
      <div class="kpi-card" @click="activeCategory = 'copier'" :class="{ 'kpi-card--active': activeCategory === 'copier' }">
        <div class="kpi-label">Copier Visit (CPR)</div>
        <div class="kpi-value text-amber">{{ totalCopierCount }}</div>
        <div class="kpi-sub">Monthly Routine Meter Reading</div>
      </div>
    </div>

    <!-- Filter Bar: Customer & Technician Dropdowns -->
    <div class="filter-bar-card">
      <div class="filter-group">
        <label class="filter-label">Filter Customer:</label>
        <div style="min-width: 240px;">
          <CustomSelect
            v-model="selectedCustomerId"
            :options="customerFilterOptions"
            placeholder="-- All Customers --"
          />
        </div>
      </div>

      <div class="filter-group">
        <label class="filter-label">Filter Technician:</label>
        <div style="min-width: 240px;">
          <CustomSelect
            v-model="selectedTechnicianId"
            :options="technicianFilterOptions"
            placeholder="-- All Technicians --"
          />
        </div>
      </div>

      <div v-if="hasActiveFilter" style="display: flex; align-items: flex-end;">
        <button type="button" class="btn btn-outline" style="font-size: 12px; padding: 6px 12px; height: 38px; display: flex; align-items: center; gap: 4px;" @click="clearFilters">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          Reset Filter
        </button>
      </div>
    </div>

    <!-- Category Filter Tabs -->
    <div class="service-tabs" role="tablist" aria-label="Filter Service Type">
      <button
        type="button"
        role="tab"
        class="tab-btn"
        :class="{ 'tab-btn--active': activeCategory === 'all' }"
        @click="activeCategory = 'all'"
      >
        <span>All Services</span>
        <span class="tab-count">{{ totalAllCount }}</span>
      </button>
      <button
        type="button"
        role="tab"
        class="tab-btn"
        :class="{ 'tab-btn--active': activeCategory === 'standalone' }"
        @click="activeCategory = 'standalone'"
      >
        <span>Stand Alone</span>
        <span class="tab-count">{{ totalStandaloneCount }}</span>
      </button>
      <button
        type="button"
        role="tab"
        class="tab-btn"
        :class="{ 'tab-btn--active': activeCategory === 'request' }"
        @click="activeCategory = 'request'"
      >
        <span>Call Service / Request</span>
        <span class="tab-count">{{ totalRequestCount }}</span>
      </button>
      <button
        type="button"
        role="tab"
        class="tab-btn"
        :class="{ 'tab-btn--active': activeCategory === 'job_order' }"
        @click="activeCategory = 'job_order'"
      >
        <span>Job Order (SPK)</span>
        <span class="tab-count">{{ totalJobOrderCount }}</span>
      </button>
      <button
        type="button"
        role="tab"
        class="tab-btn"
        :class="{ 'tab-btn--active': activeCategory === 'report' }"
        @click="activeCategory = 'report'"
      >
        <span>Technical Report (SR)</span>
        <span class="tab-count">{{ totalReportCount }}</span>
      </button>
      <button
        type="button"
        role="tab"
        class="tab-btn"
        :class="{ 'tab-btn--active': activeCategory === 'copier' }"
        @click="activeCategory = 'copier'"
      >
        <span>Copier Visit (CPR)</span>
        <span class="tab-count">{{ totalCopierCount }}</span>
      </button>
    </div>

    <!-- Main Data Table -->
    <DataTable :columns="columns" :data="displayedServices" :loading="isLoading" permission="service_report" search-placeholder="Search all services, customer, unit, problem...">
      <template #cell-service_no="{ row, value }">
        <div style="display: flex; align-items: center; gap: 8px;">
          <button
            type="button"
            class="ref-link-btn"
            :title="`Click to view details of ${value}`"
            @click="navigateToDetail(row)"
          >
            {{ value }}
          </button>
        </div>
      </template>

      <template #cell-category_label="{ row, value }">
        <span class="badge" :class="getCategoryBadgeClass(row.category)">
          {{ value }}
        </span>
      </template>

      <template #cell-customer_name="{ value }">
        <span style="font-weight: 500;">{{ value }}</span>
      </template>

      <template #cell-unit_name="{ value }">
        <span>{{ value }}</span>
      </template>

      <template #cell-serial_no="{ value }">
        <span style="font-family: monospace; font-size: 12px; font-weight: 600;">{{ value }}</span>
      </template>

      <template #cell-problem="{ value }">
        <span class="truncate-text" :title="value">{{ value || '-' }}</span>
      </template>

      <template #cell-technician_name="{ value }">
        <span v-if="value === 'Unassigned' || value === 'Belum Ditugaskan'" class="badge badge-neutral" style="font-size: 11px; padding: 2px 6px;">
          {{ value }}
        </span>
        <span v-else style="font-weight: 500; color: var(--color-text);">
          {{ value }}
        </span>
      </template>
      
      <template #cell-status="{ value }">
        <span class="badge" :class="getStatusBadgeClass(value)">
          {{ (value || 'PENDING').toUpperCase().replace('_', ' ') }}
        </span>
      </template>
      
      <template #cell-sla="{ row }">
        <div class="sla-indicator" :class="`sla-${getSlaStatus(row)}`">
          <span class="sla-dot"></span>
          <span>{{ formatSlaTime(row) }}</span>
          <small v-if="row.is_completed">(Done)</small>
        </div>
      </template>
    </DataTable>
  </div>
</template>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.kpi-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 8px;
  padding: 14px 16px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.kpi-card:hover {
  border-color: var(--color-primary, #003366);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.kpi-card--active {
  border-color: var(--color-primary, #003366);
  background: var(--color-surface-hover, #f8fafc);
  box-shadow: 0 0 0 2px rgba(0, 51, 102, 0.15);
}

.kpi-label {
  font-size: 11px;
  color: var(--color-text-muted, #64748b);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.kpi-value {
  font-size: 24px;
  font-weight: 800;
  margin-top: 4px;
  line-height: 1.2;
}

.kpi-sub {
  font-size: 11px;
  color: var(--color-text-muted, #94a3b8);
  margin-top: 4px;
}

.text-primary { color: var(--color-primary, #003366); }
.text-standalone { color: #6d28d9; }
.text-blue { color: #0284c7; }
.text-purple { color: #7c3aed; }
.text-emerald { color: #059669; }
.text-amber { color: #d97706; }

/* Filter Bar Card */
.filter-bar-card {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 16px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 18px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text, #334155);
}

/* Tabs */
.service-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  overflow-x: auto;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--color-border-light, #e2e8f0);
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text-muted, #64748b);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.tab-btn:hover {
  color: var(--color-text, #1e293b);
  background: rgba(0, 0, 0, 0.04);
}

.tab-btn--active {
  color: var(--color-primary, #003366);
  background: #eff6ff;
  border-color: #bfdbfe;
}

.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.07);
  color: inherit;
}

.tab-btn--active .tab-count {
  background: #dbeafe;
  color: #1e40af;
}

/* Category Badges */
.badge-category-standalone {
  background-color: #ede9fe;
  color: #5b21b6;
  border: 1px solid #c4b5fd;
  font-weight: 700;
}

.badge-category-request {
  background-color: #e0f2fe;
  color: #0369a1;
  font-weight: 600;
}

.badge-category-job {
  background-color: #f3e8ff;
  color: #6b21a8;
  font-weight: 600;
}

.badge-category-report {
  background-color: #d1fae5;
  color: #065f46;
  font-weight: 600;
}

.badge-category-copier {
  background-color: #fef3c7;
  color: #92400e;
  font-weight: 600;
}

/* Link Button */
.ref-link-btn {
  background: none;
  border: none;
  padding: 0;
  color: var(--color-primary, #003366);
  font-weight: 600;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
  transition: color 0.15s ease;
}

.ref-link-btn:hover {
  color: #0284c7;
}

.truncate-text {
  display: inline-block;
  max-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
}

.sla-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  font-size: 12px;
}

.sla-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sla-safe { color: var(--color-success, #16a34a); }
.sla-safe .sla-dot { background-color: var(--color-success, #16a34a); }

.sla-warning { color: #f59e0b; }
.sla-warning .sla-dot { background-color: #f59e0b; }

.sla-breached { color: var(--color-danger, #dc2626); font-weight: bold; }
.sla-breached .sla-dot { background-color: var(--color-danger, #dc2626); }

.sla-scheduled { color: var(--color-text-muted, #64748b); }
.sla-scheduled .sla-dot { background-color: #94a3b8; }

small {
  color: var(--color-text-muted, #94a3b8);
  font-weight: normal;
  font-size: 0.75rem;
}
</style>
