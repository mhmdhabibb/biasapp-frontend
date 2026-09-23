<script setup lang="ts">
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn, MonthlyMeterReading } from '@/types'

const {
  monthlyMeterReadings: data,
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
  service_report_id: null as number | null,
  contract_item_id: null as number | null,
  period: '',
  counter_mono_start: 0,
  counter_mono_end: 0,
  counter_color_start: 0,
  counter_color_end: 0,
  color_mode: 'mono',
  total_usage: 0,
  total_amount: 0,
})

const defaultForm = { ...form }

function openAdd() {
  editingItem.value = null
  Object.assign(form, defaultForm)
  showModal.value = true
}

function openEdit(item: MonthlyMeterReading) {
  editingItem.value = item
  Object.assign(form, {
    service_report_id: item.service_report_id,
    contract_item_id: item.contract_item_id,
    period: item.period,
    counter_mono_start: item.counter_mono_start,
    counter_mono_end: item.counter_mono_end,
    counter_color_start: item.counter_color_start,
    counter_color_end: item.counter_color_end,
    color_mode: item.color_mode,
    total_usage: item.total_usage,
    total_amount: item.total_amount,
  })
  showModal.value = true
}

function handleSubmit() {
  if (!form.period.trim()) return
  const monoUsage = Math.max(0, form.counter_mono_end - form.counter_mono_start)
  const colorUsage = Math.max(0, form.counter_color_end - form.counter_color_start)
  form.total_usage = monoUsage + colorUsage

  const ci = findContractItem(form.contract_item_id)
  if (ci) {
    form.total_amount = (monoUsage * ci.rate_per_page_mono) + (colorUsage * ci.rate_per_page_color)
  }

  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx]!, ...form, updated_at: new Date().toISOString() }
  } else {
    data.value.push({ id: Date.now(), ...form, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })
  }
  showModal.value = false
}

function openDelete(item: MonthlyMeterReading) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}

function contractNo(id: number | null): string {
  const ci = findContractItem(id)
  return ci ? ci.contract_no : '-'
}

function srNo(id: number | null): string {
  const sr = findServiceReport(id)
  return sr ? sr.service_report_no : '-'
}

function formatRupiah(val: number): string {
  return 'Rp ' + val.toLocaleString('id-ID')
}
</script>

<template>
  <div>
    <PageHeader title="Monthly Meter Readings" button-label="Add Meter Reading" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari pembacaan meter..." @edit="openEdit" @delete="openDelete">
      <template #cell-contract_item_id="{ value }">{{ contractNo(value) }}</template>
      <template #cell-service_report_id="{ value }">{{ srNo(value) }}</template>
      <template #cell-total_amount="{ value }">{{ formatRupiah(value || 0) }}</template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Meter Reading' : 'Add Meter Reading'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="mm-period" class="form-label">Period</label>
        <input id="mm-period" v-model="form.period" type="month" class="form-input">
      </div>
      <div class="form-group">
        <label for="mm-contract" class="form-label">Contract</label>
        <select id="mm-contract" v-model="form.contract_item_id" class="form-select">
          <option :value="null">-- Select Contract --</option>
          <option v-for="ci in contractItems" :key="ci.id" :value="ci.id">{{ ci.contract_no }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="mm-sr" class="form-label">Service Report</label>
        <select id="mm-sr" v-model="form.service_report_id" class="form-select">
          <option :value="null">-- Select Report --</option>
          <option v-for="sr in serviceReports" :key="sr.id" :value="sr.id">{{ sr.service_report_no }}</option>
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="mm-mono-start" class="form-label">Initial Mono Counter</label>
          <input id="mm-mono-start" v-model.number="form.counter_mono_start" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="mm-mono-end" class="form-label">Final Mono Counter</label>
          <input id="mm-mono-end" v-model.number="form.counter_mono_end" type="number" class="form-input" min="0">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="mm-color-start" class="form-label">Initial Color Counter</label>
          <input id="mm-color-start" v-model.number="form.counter_color_start" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="mm-color-end" class="form-label">Final Color Counter</label>
          <input id="mm-color-end" v-model.number="form.counter_color_end" type="number" class="form-input" min="0">
        </div>
      </div>
      <div class="form-group">
        <label for="mm-mode" class="form-label">Color Mode</label>
        <select id="mm-mode" v-model="form.color_mode" class="form-select">
          <option value="mono">Mono</option>
          <option value="color">Color</option>
          <option value="both">Mono + Color</option>
        </select>
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
