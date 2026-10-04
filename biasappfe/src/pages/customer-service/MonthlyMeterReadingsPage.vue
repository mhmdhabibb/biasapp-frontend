<script setup lang="ts">
// @ts-nocheck
import { computed, onMounted, reactive, ref } from 'vue'
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
const { can } = usePermission()
const master = useMasterStore()
const resources = useResourcesStore()

const {
  monthlyMeterReadings: data,
  contractItems,
  serviceReports,
  units,
  findServiceReport,
  findContractItem,
  findUnit,
} = master

const columns: TableColumn[] = [
  { key: 'period', label: 'Period' },
  { key: 'contract_item_id', label: 'Contract' },
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
  (contractItems.value as any[]).map((ci: any) => ({
    value: ci.id,
    label: (ci as any).contract_no,
  })),
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
    label: `${u.model}${u.serial_no ? ` (${u.serial_no})` : ''}`,
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
    return {
      id: groupKey(first),
      period: periodDate
        ? new Date(periodDate).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        : '-',
      periodSort: String(latest.reading_date || latest.created_at || ''),
      contract_item_id: first.contract_item_id,
      service_report_id: first.service_report_id || null,
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

function openEdit(item: any) {
  editingItem.value = item
  showDetail.value = false
  detailKey.value = null
  Object.assign(form, {
    service_report_id: item.service_report_id || null,
    contract_item_id: item.contract_item_id || null,
    unit_id: item.unit_id || null,
    paper_size_id: item.paper_size_id || null,
    color_mode: item.color_mode === 'color' ? 'color' : 'bw',
    start_meter: item.start_meter || 0,
    end_meter: item.end_meter || 0,
    reading_date: String(item.reading_date || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
  })
  showModal.value = true
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
  return ci ? ci.contract_no || '-' : '-'
}

function srNo(id: string | number | null): string {
  if (!id) return 'Tanpa Service Report'
  const sr = findServiceReport(id as any) as any
  return sr ? sr.report_no || sr.service_report_no || '-' : '-'
}

function unitName(id: string | number | null): string {
  const u = findUnit(id as any) as any
  if (!u) return '-'
  return `${u.model || 'Unit'}${u.serial_no ? ` (${u.serial_no})` : ''}`
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
</script>

<template>
  <div>
    <PageHeader title="Monthly Meter Readings" button-label="Add Reading" permission="monthly_meter_reading:create" @add="openAdd" />
    <DataTable :columns="columns" :data="grouped" search-placeholder="Search meter readings...">
      <template #cell-contract_item_id="{ value }">{{ contractNo(value as any) }}</template>
      <template #cell-service_report_id="{ value }">{{ srNo(value as any) }}</template>
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
            <label class="form-label">Periode</label>
            <div>{{ detailRow.period }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Contract</label>
            <div>{{ contractNo(detailRow.contract_item_id) }}</div>
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

    <FormModal :open="showModal" :title="editingItem ? 'Edit Meter Reading' : 'Add Meter Reading'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="mm-contract" class="form-label">Contract</label>
        <CustomSelect id="mm-contract" v-model="form.contract_item_id" :options="contractOptions" placeholder="-- Select Contract --" class="form-select" />
      </div>
      <div class="form-group">
        <label for="mm-sr" class="form-label">Service Report (Optional)</label>
        <CustomSelect id="mm-sr" v-model="form.service_report_id" :options="serviceReportOptions" placeholder="-- Select Report --" class="form-select" />
      </div>
      <div class="form-group">
        <label class="form-label">Unit</label>
        <CustomSelect v-model="form.unit_id" :options="unitOptions" placeholder="-- Select Unit --" class="form-select" />
      </div>
      <div class="form-group">
        <label class="form-label">Paper Size</label>
        <CustomSelect v-model="form.paper_size_id" :options="paperSizeOptions" placeholder="-- Tanpa ukuran --" class="form-select" />
      </div>
      <div class="form-group">
        <label for="mm-mode" class="form-label">Color Mode</label>
        <CustomSelect id="mm-mode" v-model="form.color_mode" :options="colorModeOptions" class="form-select" />
      </div>
      <div class="form-group">
        <label for="mm-date" class="form-label">Reading Date</label>
        <input id="mm-date" v-model="form.reading_date" type="date" class="form-input">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="mm-start" class="form-label">Start Meter</label>
          <input id="mm-start" v-model.number="form.start_meter" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="mm-end" class="form-label">End Meter</label>
          <input id="mm-end" v-model.number="form.end_meter" type="number" class="form-input" min="0">
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
</style>
