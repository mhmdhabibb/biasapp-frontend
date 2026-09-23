<script setup lang="ts">
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn, ServiceReport } from '@/types'

const {
  serviceReports: data,
  contractItems,
  customers,
  technicians,
  findContractItem,
  findCustomer,
  findTechnician,
} = useMasterStore()

const columns: TableColumn[] = [
  { key: 'service_report_no', label: 'No. Laporan' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'contract_item_id', label: 'Kontrak' },
  { key: 'service_type', label: 'Tipe Servis' },
  { key: 'technician_id', label: 'Teknisi' },
  { key: 'visit_date', label: 'Tanggal Kunjungan' },
  { key: 'status', label: 'Status' },
]

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<ServiceReport | null>(null)
const deletingItem = ref<ServiceReport | null>(null)
const form = reactive({
  service_report_no: '',
  contract_item_id: null as number | null,
  customer_id: null as number | null,
  service_type: 'corrective',
  technician_id: null as number | null,
  visit_date: '',
  time_in: '',
  time_out: '',
  machine_problem: '',
  repair_action: '',
  status: 'open',
  project_name: '',
  is_chargeable: false,
  reading_counter: 0,
  is_complete: false,
})

const defaultForm = { ...form }

function openAdd() {
  editingItem.value = null
  Object.assign(form, { ...defaultForm, service_report_no: `SR-${Date.now().toString().slice(-6)}` })
  showModal.value = true
}

function openEdit(item: ServiceReport) {
  editingItem.value = item
  Object.assign(form, {
    service_report_no: item.service_report_no,
    contract_item_id: item.contract_item_id,
    customer_id: item.customer_id,
    service_type: item.service_type,
    technician_id: item.technician_id,
    visit_date: item.visit_date,
    time_in: item.time_in,
    time_out: item.time_out,
    machine_problem: item.machine_problem,
    repair_action: item.repair_action,
    status: item.status,
    project_name: item.project_name,
    is_chargeable: item.is_chargeable,
    reading_counter: item.reading_counter,
    is_complete: item.is_complete,
  })
  showModal.value = true
}

function handleSubmit() {
  if (!form.service_report_no.trim()) return
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx]!, ...form, updated_at: new Date().toISOString() }
  } else {
    data.value.push({ id: Date.now(), ...form, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })
  }
  showModal.value = false
}

function openDelete(item: ServiceReport) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}

function customerName(id: number | null): string {
  const c = findCustomer(id)
  return c ? c.company_name || c.name : '-'
}

function contractNo(id: number | null): string {
  const ci = findContractItem(id)
  return ci ? ci.contract_no : '-'
}

function technicianName(id: number | null): string {
  const t = findTechnician(id)
  return t ? t.name : '-'
}
</script>

<template>
  <div>
    <PageHeader title="Service Reports" button-label="Add Service Report" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari laporan servis..." @edit="openEdit" @delete="openDelete">
      <template #cell-customer_id="{ value }">{{ customerName(value) }}</template>
      <template #cell-contract_item_id="{ value }">{{ contractNo(value) }}</template>
      <template #cell-technician_id="{ value }">{{ technicianName(value) }}</template>
      <template #cell-status="{ value }">
        <span :class="value === 'open' ? 'badge badge-warning' : value === 'in_progress' ? 'badge badge-info' : value === 'completed' ? 'badge badge-success' : 'badge badge-neutral'">
          {{ value === 'open' ? 'Open' : value === 'in_progress' ? 'Proses' : value === 'completed' ? 'Selesai' : value || '-' }}
        </span>
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Service Report' : 'Add Service Report'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="sr-no" class="form-label">Report No.</label>
        <input id="sr-no" v-model="form.service_report_no" type="text" class="form-input" placeholder="SR-XXXXXX">
      </div>
      <div class="form-group">
        <label for="sr-customer" class="form-label">Customer</label>
        <select id="sr-customer" v-model="form.customer_id" class="form-select">
          <option :value="null">-- Select Customer --</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.company_name || c.name }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="sr-contract" class="form-label">Contract</label>
        <select id="sr-contract" v-model="form.contract_item_id" class="form-select">
          <option :value="null">-- Select Contract --</option>
          <option v-for="ci in contractItems" :key="ci.id" :value="ci.id">{{ ci.contract_no }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="sr-type" class="form-label">Service Type</label>
        <select id="sr-type" v-model="form.service_type" class="form-select">
          <option value="corrective">Corrective</option>
          <option value="preventive">Preventive</option>
          <option value="installation">Installation</option>
          <option value="relocation">Relocation</option>
        </select>
      </div>
      <div class="form-group">
        <label for="sr-tech" class="form-label">Technician</label>
        <select id="sr-tech" v-model="form.technician_id" class="form-select">
          <option :value="null">-- Select Technician --</option>
          <option v-for="t in technicians" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="sr-visit" class="form-label">Visit Date</label>
        <input id="sr-visit" v-model="form.visit_date" type="date" class="form-input">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="sr-timein" class="form-label">Time In</label>
          <input id="sr-timein" v-model="form.time_in" type="time" class="form-input">
        </div>
        <div class="form-group">
          <label for="sr-timeout" class="form-label">Time Out</label>
          <input id="sr-timeout" v-model="form.time_out" type="time" class="form-input">
        </div>
      </div>
      <div class="form-group">
        <label for="sr-problem" class="form-label">Machine Problem</label>
        <textarea id="sr-problem" v-model="form.machine_problem" class="form-textarea" placeholder="Problem description"></textarea>
      </div>
      <div class="form-group">
        <label for="sr-action" class="form-label">Repair Action</label>
        <textarea id="sr-action" v-model="form.repair_action" class="form-textarea" placeholder="Action description"></textarea>
      </div>
      <div class="form-group">
        <label for="sr-counter" class="form-label">Reading Counter</label>
        <input id="sr-counter" v-model.number="form.reading_counter" type="number" class="form-input" min="0">
      </div>
      <div class="form-group">
        <label for="sr-status" class="form-label">Status</label>
        <select id="sr-status" v-model="form.status" class="form-select">
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <div class="form-group form-check-group">
        <label class="form-check-label">
          <input v-model="form.is_chargeable" type="checkbox" class="form-checkbox"> Chargeable
        </label>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Laporan Servis" :message="`Yakin ingin menghapus laporan '${deletingItem?.service_report_no}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-base);
}
.form-check-group {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.form-check-label {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-size-sm);
  cursor: pointer;
}
.form-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--color-primary);
}
</style>
