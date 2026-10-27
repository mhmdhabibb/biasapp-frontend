<script setup lang="ts">
// @ts-nocheck
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useResourcesStore } from '@/stores/resources.store'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import type { TableColumn, MonthlyMeterReading } from '@/types'

const toast = useToast()
const router = useRouter()
const { can } = usePermission()
const master = useMasterStore()
const resources = useResourcesStore()
const route = useRoute()
const { ensureResourcesLoaded } = master

onMounted(() => {
  ensureResourcesLoaded(route.path)
})

const {
  monthlyMeterReadings: data,
  contractItems,
  serviceReports,
  units,
  customers,
  findServiceReport,
  findContractItem,
  findUnit,
  findCustomer,
  findBrand,
  findUnitType,
  formatUnitDisplayName,
} = master

const columns: TableColumn[] = [
  { key: 'period', label: 'Period' },
  { key: 'customer', label: 'Customer' },
  { key: 'unit', label: 'Unit' },
  { key: 'contract_no', label: 'Contract' },
  { key: 'service_report_id', label: 'Service Report' },
  { key: 'sizes', label: 'Ukuran' },
  { key: 'total_usage', label: 'Total Usage' },
]

const paperSizes = ref<any[]>([])
onMounted(async () => {
  try {
    paperSizes.value = (await resources.paperSizes.list()).data || []
  } catch {
    paperSizes.value = []
  }
})

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<MonthlyMeterReading | null>(null)
const deletingItem = ref<MonthlyMeterReading | null>(null)
const form = reactive({
  service_report_id: null as string | null,
  contract_item_id: null as string | null,
  unit_id: null as string | null,
  paper_size_id: null as string | null,
  color_mode: 'bw',
  start_meter: 0,
  end_meter: 0,
  reading_date: new Date().toISOString().slice(0, 10),
})

const defaultForm = { ...form }

const contractOptions = computed(() =>
  (contractItems.value as any[]).map((ci: any) => {
    const u = findUnit(ci.unit_id)
    const unitName = u ? ` - ${formatUnitDisplayName(u, { findBrand, findUnitType })}` : ''
    const no = (ci as any).contract?.contract_no || (ci as any).contract_no || (ci as any).id
    return {
      value: ci.id,
      label: `${no}${unitName}`,
    }
  }),
)
const serviceReportOptions = computed(() =>
  (serviceReports.value as any[]).map((sr: any) => ({
    value: sr.id,
    label: (sr as any).report_no || (sr as any).service_report_no,
  })),
)
const unitOptions = computed(() =>
  ((units.value as any) as any[]).map((u: any) => ({
    value: u.id,
    label: `${formatUnitDisplayName(u, { findBrand, findUnitType })}${u.serial_no ? ` (${u.serial_no})` : ''}`,
  })),
)
const paperSizeOptions = computed(() =>
  (paperSizes.value as any[]).map((p: any) => ({
    value: p.id,
    label: p.name,
  })),
)
const colorModeOptions = [
  { value: 'bw', label: 'B/W' },
  { value: 'color', label: 'Colour' },
]

// Extract Month (1-12) & Year (YYYY) reliably from any date string
function extractMonthAndYear(dateStr: any): { month: number; year: number } | null {
  if (!dateStr) return null
  const str = String(dateStr).trim()
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})/)
  if (isoMatch) {
    return {
      year: parseInt(isoMatch[1], 10),
      month: parseInt(isoMatch[2], 10),
    }
  }
  const d = new Date(str)
  if (!isNaN(d.getTime())) {
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
    }
  }
  return null
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

// Filter states
const filterMonth = ref<string | null>(null)
const filterYear = ref<string | null>(null)
const filterCustomer = ref<string | null>(null)

const monthFilterOptions = [
  { value: '', label: '-- All Months --' },
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
]

// ---- Pengelompokan: readings dengan service report yang sama digabung
// jadi satu baris; tanpa service report dikelompokkan per kontrak + bulan.
function groupKey(r: any): string {
  if (r.service_report_id) return `sr:${r.service_report_id}`
  const d = String(r.reading_date || r.created_at || '').slice(0, 7)
  return `no-sr:${r.contract_item_id || '-'}:${d}`
}

const grouped = computed(() => {
  const map = new Map<string, any[]>()
  for (const r of (data.value as any[])) {
    const key = groupKey(r)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }
  const rows = [...map.values()].map((readings) => {
    const first = readings[0]
    const latest = readings.reduce((a: any, b: any) =>
      String(a.reading_date || a.created_at || '') >= String(b.reading_date || b.created_at || '') ? a : b,
    )
    const periodDate = latest.reading_date || latest.created_at

    const sr = (findServiceReport(first.service_report_id) || first.service_report) as any
    const ci = (findContractItem(first.contract_item_id) || first.contract_item) as any
    const unitId = first.unit_id || sr?.unit_id || ci?.unit_id
    const u = (findUnit(unitId) || first.unit || sr?.unit || ci?.unit) as any

    const custId = sr?.customer_id || ci?.contract?.customer_id || ci?.customer_id
    const cust = (findCustomer(custId) || sr?.customer || ci?.contract?.customer) as any

    const customerNameStr = cust ? (cust.company_name || cust.name || '-') : '-'
    const unitDisplayName = u ? formatUnitDisplayName(u, { findBrand, findUnitType }) : '-'
    const unitNameStr = u ? `${unitDisplayName}${u.serial_no ? ` (${u.serial_no})` : ''}` : '-'
    const contractNoStr = ci?.contract?.contract_no || ci?.contract_no || sr?.project_name || '-'

    const parsedPeriod = extractMonthAndYear(periodDate)
    const monthNum = parsedPeriod?.month || 0
    const yearNum = parsedPeriod?.year || 0
    const periodDisplay = (monthNum >= 1 && monthNum <= 12 && yearNum > 0)
      ? `${MONTH_NAMES[monthNum - 1]} ${yearNum}`
      : (periodDate ? new Date(periodDate).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '-')

    return {
      id: groupKey(first),
      period: periodDisplay,
      periodSort: String(latest.reading_date || latest.created_at || ''),
      periodMonth: monthNum,
      periodYear: yearNum,
      customer: customerNameStr,
      unit: unitNameStr,
      contract_no: contractNoStr,
      contract_item_id: first.contract_item_id,
      service_report_id: first.service_report_id || null,
      unit_id: unitId,
      customer_id: custId,
      placement_location: ci?.placement_location || '',
      sizes: readings.length,
      total_usage: readings.reduce(
        (sum: number, x: any) => sum + (Number(x.total_usage) || 0),
        0,
      ),
      readings,
    }
  })
  rows.sort((a, b) => String(b.periodSort).localeCompare(String(a.periodSort)))
  return rows
})

const yearFilterOptions = computed(() => {
  const yearsSet = new Set<number>()
  const currentYear = new Date().getFullYear()
  yearsSet.add(currentYear)

  for (const row of grouped.value) {
    if (row.periodYear && row.periodYear > 1900) {
      yearsSet.add(row.periodYear)
    }
  }

  const sortedYears = Array.from(yearsSet).sort((a, b) => b - a)
  return [
    { value: '', label: '-- All Years --' },
    ...sortedYears.map((y) => ({ value: String(y), label: String(y) })),
  ]
})

const customerFilterOptions = computed(() => {
  const custs = (customers.value || []) as any[]
  const options = custs.map((c: any) => ({
    value: String(c.id),
    label: c.company_name || c.name || `Customer #${c.id}`,
  }))
  options.sort((a, b) => a.label.localeCompare(b.label))
  return [
    { value: '', label: '-- All Customers --' },
    ...options,
  ]
})

const hasActiveFilter = computed(() => !!filterMonth.value || !!filterYear.value || !!filterCustomer.value)

function clearFilters() {
  filterMonth.value = null
  filterYear.value = null
  filterCustomer.value = null
}

const filteredGrouped = computed(() => {
  return grouped.value.filter((row: any) => {
    if (filterMonth.value && String(row.periodMonth) !== String(filterMonth.value)) {
      return false
    }
    if (filterYear.value && String(row.periodYear) !== String(filterYear.value)) {
      return false
    }
    if (filterCustomer.value && String(row.customer_id) !== String(filterCustomer.value)) {
      return false
    }
    return true
  })
})

// ---- Detail per grup (live dari store agar ikut ter-refresh) ----
const showDetail = ref(false)
const detailKey = ref<string | null>(null)
const detailRow = computed(
  () => grouped.value.find((g: any) => g.id === detailKey.value) || null,
)
const detailItems = computed(() => {
  if (!detailKey.value) return []
  return (data.value as any[]).filter((r: any) => groupKey(r) === detailKey.value)
})

function openDetail(row: any) {
  detailKey.value = row.id
  showDetail.value = true
}

function openAdd() {
  editingItem.value = null
  Object.assign(form, {
    ...defaultForm,
    reading_date: new Date().toISOString().slice(0, 10),
  })
  showModal.value = true
}

const lastDetailKey = ref<string | null>(null)

function openEdit(item: any) {
  editingItem.value = item
  lastDetailKey.value = detailKey.value
  showDetail.value = false
  Object.assign(form, {
    service_report_id: item.service_report_id || null,
    contract_item_id: item.contract_item_id || null,
    unit_id: item.unit_id || null,
    paper_size_id: item.paper_size_id || null,
    color_mode: item.color_mode === 'color' ? 'color' : 'bw',
    start_meter: item.start_meter ?? 0,
    end_meter: item.end_meter ?? 0,
    reading_date: String(item.reading_date || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
  })
  showModal.value = true
}

function handleCloseModal() {
  showModal.value = false
  if (lastDetailKey.value) {
    detailKey.value = lastDetailKey.value
    showDetail.value = true
  }
}

async function handleSubmit() {
  if (!form.contract_item_id) {
    toast.warning('Select a contract!')
    return
  }
  if (!form.unit_id) {
    toast.warning('Select a unit!')
    return
  }
  if (Number(form.end_meter) < Number(form.start_meter)) {
    toast.warning('End Meter must not be smaller than Start Meter!')
    return
  }
  const payload = {
    service_report_id: form.service_report_id || null,
    contract_item_id: form.contract_item_id,
    unit_id: form.unit_id,
    paper_size_id: form.paper_size_id || null,
    color_mode: form.color_mode,
    start_meter: Number(form.start_meter),
    end_meter: Number(form.end_meter),
    total_usage: Math.max(0, Number(form.end_meter) - Number(form.start_meter)),
    reading_date: form.reading_date
      ? new Date(`${form.reading_date}T00:00:00`).toISOString()
      : new Date().toISOString(),
  }
  try {
    if (editingItem.value) {
      await resources.update('monthlyMeterReadings', editingItem.value.id as any, payload)
      toast.success('Meter reading updated successfully!')
    } else {
      await resources.create('monthlyMeterReadings', payload)
      toast.success('Meter reading saved successfully!')
    }
    await master.refreshInBackground()
    showModal.value = false
    if (lastDetailKey.value) {
      detailKey.value = lastDetailKey.value
      showDetail.value = true
    }
  } catch (err: any) {
    toast.error(err?.message || 'Failed to save meter reading!')
  }
}

function openDelete(item: any) {
  deletingItem.value = item
  showConfirm.value = true
}

async function handleDelete() {
  if (!deletingItem.value) {
    showConfirm.value = false
    return
  }
  try {
    await resources.remove('monthlyMeterReadings', deletingItem.value.id as any)
    await master.refreshInBackground()
    toast.success('Meter reading deleted successfully!')
    if (detailKey.value && detailItems.value.length === 0) {
      showDetail.value = false
      detailKey.value = null
    }
  } catch (err: any) {
    toast.error(err?.message || 'Failed to delete meter reading!')
  } finally {
    showConfirm.value = false
  }
}

function contractNo(id: string | number | null): string {
  const ci = findContractItem(id as any) as any
  return ci ? (ci.contract?.contract_no || ci.contract_no || '-') : '-'
}

function srNo(id: string | number | null): string {
  if (!id) return 'Tanpa Service Report'
  const sr = findServiceReport(id as any) as any
  return sr ? sr.report_no || sr.service_report_no || '-' : '-'
}

function unitName(id: string | number | null): string {
  const u = findUnit(id as any) as any
  if (!u) return '-'
  const displayName = formatUnitDisplayName(u, { findBrand, findUnitType })
  return `${displayName}${u.serial_no ? ` (${u.serial_no})` : ''}`
}

function sizeName(id: string | number | null, fallback?: any): string {
  if (fallback?.name) return fallback.name
  const found = (paperSizes.value as any[]).find((p: any) => String(p.id) === String(id))
  if (found) return found.name
  return id ? `Ukuran ${String(id).slice(0, 8)}` : '-'
}

function modeLabel(mode: string | null): string {
  return String(mode || '').toLowerCase() === 'color' ? 'Colour' : 'B/W'
}

function recordedBy(row: any): string {
  return row?.user?.name || row?.user?.username || '-'
}

function viewServiceReport(id: string | null) {
  if (!id) return
  router.push(`/shared/service-reports/${id}`)
}

function viewContract() {
  router.push('/customer-service/contract-items')
}
</script>

<template>
  <div>
    <PageHeader title="Monthly Meter Readings" permission="monthly_meter_reading:create"  />

    <!-- Filter Bar: Month, Year, and Customer -->
    <div class="filter-bar-card">
      <div class="filter-group">
        <label class="filter-label">Filter Month:</label>
        <div style="min-width: 170px;">
          <CustomSelect
            v-model="filterMonth"
            :options="monthFilterOptions"
            placeholder="-- All Months --"
          />
        </div>
      </div>

      <div class="filter-group">
        <label class="filter-label">Filter Year:</label>
        <div style="min-width: 140px;">
          <CustomSelect
            v-model="filterYear"
            :options="yearFilterOptions"
            placeholder="-- All Years --"
          />
        </div>
      </div>

      <div class="filter-group">
        <label class="filter-label">Filter Customer:</label>
        <div style="min-width: 220px;">
          <CustomSelect
            v-model="filterCustomer"
            :options="customerFilterOptions"
            placeholder="-- All Customers --"
          />
        </div>
      </div>

      <div v-if="hasActiveFilter" style="display: flex; align-items: flex-end;">
        <button
          type="button"
          class="btn btn-outline reset-filter-btn"
          title="Reset semua filter"
          @click="clearFilters"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
          Reset Filter
        </button>
      </div>
    </div>

    <DataTable :columns="columns" :data="filteredGrouped" search-placeholder="Search meter readings...">
      <template #cell-customer="{ row }">
        <span style="font-weight: 500;">{{ row.customer }}</span>
      </template>
      <template #cell-unit="{ row }">
        <div style="font-weight: 500;">{{ row.unit }}</div>
        <small v-if="row.placement_location" style="color: var(--color-text-muted); font-size: 11px; display: block;">
          Lokasi: {{ row.placement_location }}
        </small>
      </template>
      <template #cell-contract_no="{ row }">
        <button
          v-if="row.contract_no && row.contract_no !== '-'"
          type="button"
          class="ref-link-btn"
          title="Buka Contract Items"
          @click.stop="viewContract"
        >
          {{ row.contract_no }}
        </button>
        <span v-else style="color: var(--color-text-muted);">-</span>
      </template>
      <template #cell-service_report_id="{ row }">
        <button
          v-if="row.service_report_id"
          type="button"
          class="ref-link-btn"
          title="Buka Service Report"
          @click.stop="viewServiceReport(row.service_report_id)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; flex-shrink: 0;">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
          {{ srNo(row.service_report_id) }}
        </button>
        <span v-else style="color: var(--color-text-muted);">Tanpa Service Report</span>
      </template>
      <template #cell-sizes="{ value }">{{ value }} ukuran</template>
      <template #actions="{ row }">
        <button class="action-btn action-btn--edit" title="Detail" @click="openDetail(row)" style="width: 36px; height: 36px;">
          <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
      </template>
    </DataTable>

    <!-- Detail per grup: rincian tiap ukuran kertas -->
    <FormModal :open="showDetail" :title="detailRow ? `Detail — ${srNo(detailRow.service_report_id)}` : 'Detail'" @close="showDetail = false">
      <template v-if="detailRow">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
          <div class="form-group">
            <label class="form-label">Customer</label>
            <div style="font-weight: 600;">{{ detailRow.customer }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Unit / Mesin</label>
            <div style="font-weight: 600;">{{ detailRow.unit }}</div>
            <div v-if="detailRow.placement_location" style="font-size: 12px; color: var(--color-text-muted);">
              Lokasi: {{ detailRow.placement_location }}
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Periode</label>
            <div>{{ detailRow.period }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Contract</label>
            <div>
              <button
                v-if="detailRow.contract_no && detailRow.contract_no !== '-'"
                type="button"
                class="ref-link-btn"
                title="Buka Contract Items"
                @click="viewContract"
              >
                {{ detailRow.contract_no }} &rarr;
              </button>
              <span v-else>-</span>
            </div>
          </div>
          <div class="form-group" style="grid-column: span 2;">
            <label class="form-label">Service Report Visit</label>
            <div>
              <button
                v-if="detailRow.service_report_id"
                type="button"
                class="ref-link-btn"
                title="Buka Service Report"
                @click="viewServiceReport(detailRow.service_report_id)"
              >
                {{ srNo(detailRow.service_report_id) }} (Klik untuk buka laporan visit) &rarr;
              </button>
              <span v-else style="color: var(--color-text-muted);">Tanpa Service Report</span>
            </div>
          </div>
        </div>
        <div style="border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: var(--font-size-sm);">
            <thead style="background: var(--color-surface-raised); border-bottom: 1px solid var(--color-border);">
              <tr>
                <th style="padding: 12px;">Ukuran</th>
                <th style="padding: 12px;">Mode</th>
                <th style="padding: 12px; text-align: right;">Start</th>
                <th style="padding: 12px; text-align: right;">End</th>
                <th style="padding: 12px; text-align: right;">Usage</th>
                <th style="padding: 12px;">Dicatat Oleh</th>
                <th style="padding: 12px;"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in detailItems" :key="r.id" style="border-bottom: 1px solid var(--color-border-light);">
                <td style="padding: 12px;">{{ sizeName(r.paper_size_id, r.paper_size) }}</td>
                <td style="padding: 12px;">{{ modeLabel(r.color_mode) }}</td>
                <td style="padding: 12px; text-align: right;">{{ Number(r.start_meter || 0).toLocaleString('id-ID') }}</td>
                <td style="padding: 12px; text-align: right;">{{ Number(r.end_meter || 0).toLocaleString('id-ID') }}</td>
                <td style="padding: 12px; text-align: right;">{{ Number(r.total_usage || 0).toLocaleString('id-ID') }}</td>
                <td style="padding: 12px;">{{ recordedBy(r) }}</td>
                <td style="padding: 12px; text-align: right; white-space: nowrap;">
                  <button v-if="can('monthly_meter_reading:update')" class="action-btn action-btn--edit" title="Edit" @click="openEdit(r)" style="width: 32px; height: 32px;">
                    <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                  <button v-if="can('monthly_meter_reading:delete')" class="action-btn action-btn--delete" title="Delete" @click="openDelete(r)" style="width: 32px; height: 32px;">
                    <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
                      <line x1="10" y1="11" x2="10" y2="17"></line>
                      <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                  </button>
                </td>
              </tr>
              <tr v-if="detailItems.length === 0">
                <td colspan="7" style="padding: 16px; text-align: center; color: var(--color-text-muted);">Tidak ada rincian.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <template #footer>
        <button class="btn btn-outline" @click="showDetail = false">Close</button>
      </template>
    </FormModal>

    <!-- Modal Edit / Add Meter Reading -->
    <FormModal
      :open="showModal"
      :title="editingItem ? 'Edit Meter Reading' : 'Add Meter Reading'"
      max-width="560px"
      @close="handleCloseModal"
      @submit="handleSubmit"
    >
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <div v-if="editingItem" style="padding: 10px 14px; background: var(--color-surface-raised, #f8fafc); border-radius: var(--radius-sm); font-size: var(--font-size-sm); border: 1px solid var(--color-border-light);">
          <div style="color: var(--color-text-muted); font-size: var(--font-size-xs); margin-bottom: 2px;">Target Unit / Contract:</div>
          <div style="font-weight: 600;">{{ unitName(form.unit_id) }} &bull; {{ contractNo(form.contract_item_id) }}</div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" style="font-weight: 500; font-size: 13px; margin-bottom: 4px; display: block;">
              Start Meter <span style="color: var(--color-danger, #ef4444);">*</span>
            </label>
            <input
              v-model.number="form.start_meter"
              type="number"
              min="0"
              class="form-input"
              required
              placeholder="0"
              style="width: 100%; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm);"
            />
          </div>
          <div class="form-group">
            <label class="form-label" style="font-weight: 500; font-size: 13px; margin-bottom: 4px; display: block;">
              End Meter <span style="color: var(--color-danger, #ef4444);">*</span>
            </label>
            <input
              v-model.number="form.end_meter"
              type="number"
              min="0"
              class="form-input"
              required
              placeholder="0"
              style="width: 100%; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm);"
            />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" style="font-weight: 500; font-size: 13px; margin-bottom: 4px; display: block;">
              Total Usage (Kalkulasi)
            </label>
            <input
              :value="Math.max(0, Number(form.end_meter || 0) - Number(form.start_meter || 0))"
              type="number"
              class="form-input"
              disabled
              style="width: 100%; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface-raised, #f1f5f9);"
            />
          </div>
          <div class="form-group">
            <label class="form-label" style="font-weight: 500; font-size: 13px; margin-bottom: 4px; display: block;">
              Reading Date <span style="color: var(--color-danger, #ef4444);">*</span>
            </label>
            <input
              v-model="form.reading_date"
              type="date"
              class="form-input"
              required
              style="width: 100%; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm);"
            />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" style="font-weight: 500; font-size: 13px; margin-bottom: 4px; display: block;">
              Ukuran Kertas
            </label>
            <select
              v-model="form.paper_size_id"
              class="form-input"
              style="width: 100%; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm);"
            >
              <option :value="null">Pilih Ukuran Kertas</option>
              <option v-for="opt in paperSizeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" style="font-weight: 500; font-size: 13px; margin-bottom: 4px; display: block;">
              Color Mode
            </label>
            <select
              v-model="form.color_mode"
              class="form-input"
              style="width: 100%; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm);"
            >
              <option v-for="opt in colorModeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
        </div>
      </div>
    </FormModal>

    <ConfirmDialog :open="showConfirm" title="Delete Meter Reading" :message="`Are you sure you want to delete this meter reading?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-base);
}

/* Filter Bar Card */
.filter-bar-card {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 16px;
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  padding: 14px 16px;
  margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
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

.reset-filter-btn {
  font-size: 12px;
  padding: 7px 12px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: all 0.15s ease;
}

.ref-link-btn {
  display: inline-flex;
  align-items: center;
  background: transparent;
  border: none;
  padding: 0;
  color: var(--color-primary, #0ea5e9);
  font-weight: 500;
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-align: left;
  transition: opacity 0.2s;
}

.ref-link-btn:hover {
  opacity: 0.8;
}
</style>
