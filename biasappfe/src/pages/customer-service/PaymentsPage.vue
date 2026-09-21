<script setup lang="ts">
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn, Payment } from '@/types'

const {
  payments: data,
  rentalInvoices,
  customers,
  findRentalInvoice,
  findCustomer,
} = useMasterStore()

const columns: TableColumn[] = [
  { key: 'payment_no', label: 'No. Pembayaran' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'rental_invoice_id', label: 'Invoice Sewa' },
  { key: 'payment_date', label: 'Tanggal Bayar' },
  { key: 'amount', label: 'Jumlah' },
  { key: 'tax_deduction', label: 'Potongan Pajak' },
  { key: 'balance', label: 'Saldo' },
  { key: 'reference_no', label: 'No. Referensi' },
]

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Payment | null>(null)
const deletingItem = ref<Payment | null>(null)
const form = reactive({
  payment_no: '',
  rental_invoice_id: null as number | null,
  customer_id: null as number | null,
  payment_date: '',
  amount: 0,
  tax_deduction: 0,
  balance: 0,
  reference_no: '',
})

const defaultForm = { ...form }

function onInvoiceChange() {
  const inv = findRentalInvoice(form.rental_invoice_id)
  if (inv) {
    form.customer_id = inv.customer_id
    form.amount = inv.total_pay
  }
}

function openAdd() {
  editingItem.value = null
  Object.assign(form, { ...defaultForm, payment_no: `PAY-${Date.now().toString().slice(-6)}`, payment_date: new Date().toISOString().slice(0, 10) })
  showModal.value = true
}

function openEdit(item: Payment) {
  editingItem.value = item
  Object.assign(form, {
    payment_no: item.payment_no,
    rental_invoice_id: item.rental_invoice_id,
    customer_id: item.customer_id,
    payment_date: item.payment_date,
    amount: item.amount,
    tax_deduction: item.tax_deduction,
    balance: item.balance,
    reference_no: item.reference_no,
  })
  showModal.value = true
}

function handleSubmit() {
  if (!form.payment_no.trim()) return
  form.balance = form.amount - form.tax_deduction
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx], ...form, updated_at: new Date().toISOString() }
  } else {
    data.value.push({ id: Date.now(), ...form, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  }
  showModal.value = false
}

function openDelete(item: Payment) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}

function customerName(id: number | null): string {
  const c = findCustomer(id)
  return c ? c.company_name || c.name : '-'
}

function invoiceNo(id: number | null): string {
  const inv = findRentalInvoice(id)
  return inv ? inv.invoice_no : '-'
}

function formatRupiah(val: number): string {
  return 'Rp ' + val.toLocaleString('id-ID')
}
</script>

<template>
  <div>
    <PageHeader title="Payments" button-label="Tambah Pembayaran" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari pembayaran..." @edit="openEdit" @delete="openDelete">
      <template #cell-customer_id="{ value }">{{ customerName(value) }}</template>
      <template #cell-rental_invoice_id="{ value }">{{ invoiceNo(value) }}</template>
      <template #cell-amount="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-tax_deduction="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-balance="{ value }">{{ formatRupiah(value || 0) }}</template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Pembayaran' : 'Tambah Pembayaran'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="pay-no" class="form-label">No. Pembayaran</label>
        <input id="pay-no" v-model="form.payment_no" type="text" class="form-input" placeholder="PAY-XXXXXX">
      </div>
      <div class="form-group">
        <label for="pay-invoice" class="form-label">Invoice Sewa</label>
        <select id="pay-invoice" v-model="form.rental_invoice_id" class="form-select" @change="onInvoiceChange">
          <option :value="null">-- Pilih Invoice --</option>
          <option v-for="inv in rentalInvoices" :key="inv.id" :value="inv.id">{{ inv.invoice_no }} — {{ formatRupiah(inv.total_pay) }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="pay-customer" class="form-label">Customer</label>
        <select id="pay-customer" v-model="form.customer_id" class="form-select">
          <option :value="null">-- Pilih Customer --</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.company_name || c.name }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="pay-date" class="form-label">Tanggal Pembayaran</label>
        <input id="pay-date" v-model="form.payment_date" type="date" class="form-input">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="pay-amount" class="form-label">Jumlah (Rp)</label>
          <input id="pay-amount" v-model.number="form.amount" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="pay-tax" class="form-label">Potongan Pajak (Rp)</label>
          <input id="pay-tax" v-model.number="form.tax_deduction" type="number" class="form-input" min="0">
        </div>
      </div>
      <div class="form-group">
        <label for="pay-ref" class="form-label">No. Referensi</label>
        <input id="pay-ref" v-model="form.reference_no" type="text" class="form-input" placeholder="No. transfer / kwitansi">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Pembayaran" :message="`Yakin ingin menghapus pembayaran '${deletingItem?.payment_no}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-base);
}
</style>
