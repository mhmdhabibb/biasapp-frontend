<script setup lang="ts">
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn, RentalInvoice } from '@/types'

const {
  rentalInvoices: data,
  contractItems,
  customers,
  findContractItem,
  findCustomer,
} = useMasterStore()

const columns: TableColumn[] = [
  { key: 'invoice_no', label: 'No. Invoice' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'contract_item_id', label: 'Kontrak' },
  { key: 'period_start', label: 'Periode Mulai' },
  { key: 'period_end', label: 'Periode Akhir' },
  { key: 'due_date', label: 'Jatuh Tempo' },
  { key: 'total_pay', label: 'Total' },
  { key: 'status', label: 'Status' },
]

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<RentalInvoice | null>(null)
const deletingItem = ref<RentalInvoice | null>(null)
const form = reactive({
  invoice_no: '',
  contract_item_id: null as number | null,
  customer_id: null as number | null,
  period_start: '',
  period_end: '',
  monthly_date: '',
  due_date: '',
  basis_rental_fee: 0,
  excess_amount: 0,
  subtotal: 0,
  tax: 0,
  total_pay: 0,
  status: 'unpaid',
})

const defaultForm = { ...form }

function onContractChange() {
  const ci = findContractItem(form.contract_item_id)
  if (ci) {
    form.customer_id = ci.customer_id
    form.basis_rental_fee = ci.monthly_rent_fee
    recalculate()
  }
}

function recalculate() {
  form.subtotal = form.basis_rental_fee + form.excess_amount
  form.total_pay = form.subtotal + form.tax
}

function openAdd() {
  editingItem.value = null
  Object.assign(form, { ...defaultForm, invoice_no: `INV-R-${Date.now().toString().slice(-6)}` })
  showModal.value = true
}

function openEdit(item: RentalInvoice) {
  editingItem.value = item
  Object.assign(form, {
    invoice_no: item.invoice_no,
    contract_item_id: item.contract_item_id,
    customer_id: item.customer_id,
    period_start: item.period_start,
    period_end: item.period_end,
    monthly_date: item.monthly_date,
    due_date: item.due_date,
    basis_rental_fee: item.basis_rental_fee,
    excess_amount: item.excess_amount,
    subtotal: item.subtotal,
    tax: item.tax,
    total_pay: item.total_pay,
    status: item.status,
  })
  showModal.value = true
}

function handleSubmit() {
  if (!form.invoice_no.trim()) return
  recalculate()
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx], ...form, updated_at: new Date().toISOString() }
  } else {
    data.value.push({ id: Date.now(), ...form, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })
  }
  showModal.value = false
}

function openDelete(item: RentalInvoice) { deletingItem.value = item; showConfirm.value = true }
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

function formatRupiah(val: number): string {
  return 'Rp ' + val.toLocaleString('id-ID')
}
</script>

<template>
  <div>
    <PageHeader title="Rental Invoices" button-label="Buat Invoice Sewa" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari invoice sewa..." @edit="openEdit" @delete="openDelete">
      <template #cell-customer_id="{ value }">{{ customerName(value) }}</template>
      <template #cell-contract_item_id="{ value }">{{ contractNo(value) }}</template>
      <template #cell-total_pay="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-status="{ value }">
        <span :class="value === 'paid' ? 'badge badge-success' : value === 'overdue' ? 'badge badge-danger' : 'badge badge-warning'">
          {{ value === 'paid' ? 'Lunas' : value === 'overdue' ? 'Lewat Jatuh Tempo' : 'Belum Bayar' }}
        </span>
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Invoice Sewa' : 'Buat Invoice Sewa'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="ri-no" class="form-label">No. Invoice</label>
        <input id="ri-no" v-model="form.invoice_no" type="text" class="form-input" placeholder="INV-R-XXXXXX">
      </div>
      <div class="form-group">
        <label for="ri-contract" class="form-label">Kontrak</label>
        <select id="ri-contract" v-model="form.contract_item_id" class="form-select" @change="onContractChange">
          <option :value="null">-- Pilih Kontrak --</option>
          <option v-for="ci in contractItems" :key="ci.id" :value="ci.id">{{ ci.contract_no }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="ri-customer" class="form-label">Customer</label>
        <select id="ri-customer" v-model="form.customer_id" class="form-select">
          <option :value="null">-- Pilih Customer --</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.company_name || c.name }}</option>
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="ri-period-start" class="form-label">Periode Mulai</label>
          <input id="ri-period-start" v-model="form.period_start" type="date" class="form-input">
        </div>
        <div class="form-group">
          <label for="ri-period-end" class="form-label">Periode Akhir</label>
          <input id="ri-period-end" v-model="form.period_end" type="date" class="form-input">
        </div>
      </div>
      <div class="form-group">
        <label for="ri-due" class="form-label">Jatuh Tempo</label>
        <input id="ri-due" v-model="form.due_date" type="date" class="form-input">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="ri-basis" class="form-label">Biaya Sewa Dasar (Rp)</label>
          <input id="ri-basis" v-model.number="form.basis_rental_fee" type="number" class="form-input" min="0" @input="recalculate">
        </div>
        <div class="form-group">
          <label for="ri-excess" class="form-label">Biaya Excess (Rp)</label>
          <input id="ri-excess" v-model.number="form.excess_amount" type="number" class="form-input" min="0" @input="recalculate">
        </div>
      </div>
      <div class="form-group">
        <label for="ri-tax" class="form-label">Pajak (Rp)</label>
        <input id="ri-tax" v-model.number="form.tax" type="number" class="form-input" min="0" @input="recalculate">
      </div>
      <div class="sale-summary">
        <div class="summary-row"><span>Subtotal</span><span>{{ formatRupiah(form.subtotal) }}</span></div>
        <div class="summary-row summary-total"><span>Total Bayar</span><span>{{ formatRupiah(form.total_pay) }}</span></div>
      </div>
      <div class="form-group">
        <label for="ri-status" class="form-label">Status</label>
        <select id="ri-status" v-model="form.status" class="form-select">
          <option value="unpaid">Belum Bayar</option>
          <option value="paid">Lunas</option>
          <option value="overdue">Lewat Jatuh Tempo</option>
        </select>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Invoice Sewa" :message="`Yakin ingin menghapus invoice '${deletingItem?.invoice_no}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-base);
}
.sale-summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-md);
  border-radius: var(--radius-base);
  background: var(--color-surface-raised);
}
.summary-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
.summary-total {
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-xs);
}
</style>
