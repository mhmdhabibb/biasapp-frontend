<script setup lang="ts">
// @ts-nocheck
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn, MonthlyMeterReading } from '@/types'

const {
  monthlyMeterReadings: data,
  rentalInvoices,
  serviceReports,
  contractItems,
  findServiceReport,
  findContractItem,
} = useMasterStore()

const columns: TableColumn[] = [
  { key: 'period', label: 'Periode' },
  { key: 'contract_item_id', label: 'Kontrak' },
  { key: 'service_report_id', label: 'Laporan Servis' },
  { key: 'counter_mono_start', label: 'Mono Awal' },
  { key: 'counter_mono_end', label: 'Mono Akhir' },
  { key: 'counter_color_start', label: 'Color Awal' },
  { key: 'counter_color_end', label: 'Color Akhir' },
  { key: 'total_usage', label: 'Total Pemakaian' },
  { key: 'total_amount', label: 'Total Biaya' },
]

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<MonthlyMeterReading | null>(null)
const deletingItem = ref<MonthlyMeterReading | null>(null)
const form = reactive({
  service_report_id: null as string | null,
  contract_item_id: null as string | null,
  unit_id: null as string | null,
  paper_size_id: null as string | null,
  color_mode: 'mono',
  start_meter: 0,
  end_meter: 0,
  total_usage: 0,
})

const defaultForm = { ...form }

function openAdd() {
  editingItem.value = null
  Object.assign(form, defaultForm)
  showModal.value = true
}

function openEdit(item: any) {
  editingItem.value = item
  Object.assign(form, {
    service_report_id: item.service_report_id,
    contract_item_id: item.contract_item_id,
    unit_id: item.unit_id,
    paper_size_id: item.paper_size_id,
    color_mode: item.color_mode,
    start_meter: item.start_meter,
    end_meter: item.end_meter,
    total_usage: item.total_usage,
  })
  showModal.value = true
}

function handleSubmit() {
  if (form.start_meter < 0 || form.end_meter < 0) return
  form.total_usage = Math.max(0, form.end_meter - form.start_meter)

  const ci = findContractItem(form.contract_item_id)
  const baseRent = ci?.monthly_rent_fee || ci?.total_value || 0
  const freeQuota = ci?.free_quota_color || ci?.free_copy_quota || 0
  const bwRate = ci?.rates?.[0]?.rate_per_page_bw || ci?.rate_per_page_bw || 150
  const colorRate = ci?.rates?.[0]?.rate_per_page_color || ci?.rate_per_page_color || 1300
  
  const excessUsage = Math.max(0, form.total_usage - freeQuota)
  const excessAmount = excessUsage * (form.color_mode === 'color' ? colorRate : bwRate)
  const subtotal = baseRent + excessAmount

  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx]!, ...form, updated_at: new Date().toISOString() }
  } else {
    data.value.push({ id: Date.now(), ...form, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })

    // Auto-generate Rental Invoice
    const invNo = `INV-R-${Date.now().toString().slice(-6)}`
    const now = new Date()
    const dueDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    rentalInvoices.value.push({
      id: Date.now() + 1,
      invoice_no: invNo,
      customer_id: ci?.customer_id,
      contract_item_id: form.contract_item_id,
      period_start: `${new Date().toISOString().slice(0, 7)}-01`,
      period_end: `${new Date().toISOString().slice(0, 7)}-30`,
      monthly_date: now.toISOString().slice(0, 10),
      due_date: dueDate,
      basis_rental_fee: baseRent,
      excess_amount: excessAmount,
      subtotal: subtotal,
      tax: 0,
      total_pay: subtotal,
      status: 'unpaid',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null
    })
  }
  showModal.value = false
}

function openDelete(item: any) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}

function contractNo(id: string | number | null): string {
  const ci = findContractItem(id as any)
  return ci ? ci.contract_no : '-'
}

function srNo(id: string | number | null): string {
  const sr = findServiceReport(id as any)
  return sr ? sr.service_report_no || sr.report_no : '-'
}

function formatRupiah(val: number): string {
  return 'Rp ' + val.toLocaleString('id-ID')
}
</script>

<template>
  <div>
    <PageHeader title="Monthly Meter Readings" button-label="Add Meter Reading" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari pembacaan meter..." @edit="openEdit" @delete="openDelete">
      <template #cell-contract_item_id="{ value }">{{ contractNo(value as any) }}</template>
      <template #cell-service_report_id="{ value }">{{ srNo(value as any) }}</template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Meter Reading' : 'Add Meter Reading'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="mm-contract" class="form-label">Contract</label>
        <select id="mm-contract" v-model="form.contract_item_id" class="form-select">
          <option :value="null">-- Select Contract --</option>
          <option v-for="ci in contractItems" :key="ci.id" :value="ci.id">{{ ci.contract_no }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="mm-sr" class="form-label">Service Report (Optional)</label>
        <select id="mm-sr" v-model="form.service_report_id" class="form-select">
          <option :value="null">-- Select Report --</option>
          <option v-for="sr in serviceReports" :key="sr.id" :value="sr.id">{{ sr.service_report_no || (sr as any).report_no }}</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Unit</label>
        <select v-model="form.unit_id" class="form-select">
          <option :value="null">-- Select Unit --</option>
          <option v-for="u in (useMasterStore().units as any)" :key="u.id" :value="u.id">{{ u.model }}</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Paper Size</label>
        <input v-model="form.paper_size_id" type="text" class="form-input" placeholder="e.g. A4 UUID">
      </div>
      <div class="form-group">
        <label for="mm-mode" class="form-label">Color Mode</label>
        <select id="mm-mode" v-model="form.color_mode" class="form-select">
          <option value="mono">Mono</option>
          <option value="color">Color</option>
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="mm-mono-start" class="form-label">Start Meter</label>
          <input id="mm-mono-start" v-model.number="form.start_meter" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="mm-mono-end" class="form-label">End Meter</label>
          <input id="mm-mono-end" v-model.number="form.end_meter" type="number" class="form-input" min="0">
        </div>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Pembacaan Meter" :message="`Yakin ingin menghapus pembacaan periode '${deletingItem?.period}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-base);
}
</style>
