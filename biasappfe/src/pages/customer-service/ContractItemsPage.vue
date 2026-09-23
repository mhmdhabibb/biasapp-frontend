<script setup lang="ts">
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn, ContractItem } from '@/types'

const {
  contractItems: data,
  customers,
  units,
  findCustomer,
  findUnit,
} = useMasterStore()

const columns: TableColumn[] = [
  { key: 'contract_no', label: 'Contract No.' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'unit_id', label: 'Unit' },
  { key: 'placement_location', label: 'Location' },
  { key: 'monthly_rent_fee', label: 'Monthly Rent Fee' },
  { key: 'start_date', label: 'Start Date' },
  { key: 'end_date', label: 'End Date' },
  { key: 'status', label: 'Status' },
]

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<ContractItem | null>(null)
const deletingItem = ref<ContractItem | null>(null)
const form = reactive({
  contract_no: '',
  unit_id: null as number | null,
  customer_id: null as number | null,
  start_date: '',
  end_date: '',
  placement_location: '',
  monthly_rent_fee: 0,
  free_copy_quota: 0,
  start_mono_value: 0,
  start_color_value: 0,
  rate_per_page_mono: 0,
  rate_per_page_color: 0,
  is_complete: false,
  status: 'active',
})

const defaultForm = { ...form }

function openAdd() {
  editingItem.value = null
  Object.assign(form, { ...defaultForm, contract_no: `CNT-${Date.now().toString().slice(-6)}` })
  showModal.value = true
}

function openEdit(item: ContractItem) {
  editingItem.value = item
  Object.assign(form, {
    contract_no: item.contract_no,
    unit_id: item.unit_id,
    customer_id: item.customer_id,
    start_date: item.start_date,
    end_date: item.end_date,
    placement_location: item.placement_location,
    monthly_rent_fee: item.monthly_rent_fee,
    free_copy_quota: item.free_copy_quota,
    start_mono_value: item.start_mono_value,
    start_color_value: item.start_color_value,
    rate_per_page_mono: item.rate_per_page_mono,
    rate_per_page_color: item.rate_per_page_color,
    is_complete: item.is_complete,
    status: item.status,
  })
  showModal.value = true
}

function handleSubmit() {
  if (!form.contract_no.trim()) return
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx]!, ...form, updated_at: new Date().toISOString() }
  } else {
    data.value.push({ id: Date.now(), ...form, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })
  }
  showModal.value = false
}

function openDelete(item: ContractItem) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}

function formatRupiah(val: number): string {
  return 'Rp ' + val.toLocaleString('id-ID')
}

function customerName(id: number | null): string {
  const c = findCustomer(id)
  return c ? c.company_name || c.name : '-'
}

function unitName(id: number | null): string {
  const u = findUnit(id)
  return u ? `${u.name} (${u.serial_no})` : '-'
}
</script>

<template>
  <div>
    <PageHeader title="Contract Items" button-label="Add Contract" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Search contracts..." @edit="openEdit" @delete="openDelete">
      <template #cell-customer_id="{ value }">{{ customerName(value) }}</template>
      <template #cell-unit_id="{ value }">{{ unitName(value) }}</template>
      <template #cell-monthly_rent_fee="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-status="{ value }">
        <span :class="value === 'active' ? 'badge badge-success' : value === 'expired' ? 'badge badge-danger' : 'badge badge-neutral'">
          {{ value === 'active' ? 'Active' : value === 'expired' ? 'Expired' : value || '-' }}
        </span>
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Contract' : 'Add Contract'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="ci-no" class="form-label">Contract No.</label>
        <input id="ci-no" v-model="form.contract_no" type="text" class="form-input" placeholder="CNT-XXXXXX">
      </div>
      <div class="form-group">
        <label for="ci-customer" class="form-label">Customer</label>
        <select id="ci-customer" v-model="form.customer_id" class="form-select">
          <option :value="null">-- Select Customer --</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.company_name || c.name }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="ci-unit" class="form-label">Unit</label>
        <select id="ci-unit" v-model="form.unit_id" class="form-select">
          <option :value="null">-- Select Unit --</option>
          <option v-for="u in units" :key="u.id" :value="u.id">{{ u.name }} ({{ u.serial_no }})</option>
        </select>
      </div>
      <div class="form-group">
        <label for="ci-location" class="form-label">Placement Location</label>
        <input id="ci-location" v-model="form.placement_location" type="text" class="form-input" placeholder="Unit location address">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="ci-start" class="form-label">Start Date</label>
          <input id="ci-start" v-model="form.start_date" type="date" class="form-input">
        </div>
        <div class="form-group">
          <label for="ci-end" class="form-label">End Date</label>
          <input id="ci-end" v-model="form.end_date" type="date" class="form-input">
        </div>
      </div>
      <div class="form-group">
        <label for="ci-rent" class="form-label">Monthly Rent Fee (Rp)</label>
        <input id="ci-rent" v-model.number="form.monthly_rent_fee" type="number" class="form-input" min="0">
      </div>
      <div class="form-group">
        <label for="ci-freecopy" class="form-label">Free Copy Quota</label>
        <input id="ci-freecopy" v-model.number="form.free_copy_quota" type="number" class="form-input" min="0">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="ci-mono-rate" class="form-label">Mono Rate/page</label>
          <input id="ci-mono-rate" v-model.number="form.rate_per_page_mono" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="ci-color-rate" class="form-label">Color Rate/page</label>
          <input id="ci-color-rate" v-model.number="form.rate_per_page_color" type="number" class="form-input" min="0">
        </div>
      </div>
      <div class="form-group">
        <label for="ci-status" class="form-label">Status</label>
        <select id="ci-status" v-model="form.status" class="form-select">
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="terminated">Terminated</option>
        </select>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Contract" :message="`Are you sure you want to delete contract '${deletingItem?.contract_no}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-base);
}
</style>
