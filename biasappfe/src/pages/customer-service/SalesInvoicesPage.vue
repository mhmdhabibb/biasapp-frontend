<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn, SalesInvoice } from '@/types'

const {
  salesInvoices: data,
  sales,
  customers,
  products,
  findCustomer,
  findSale,
  findProduct,
} = useMasterStore()

const columns: TableColumn[] = [
  { key: 'invoice_no', label: 'No. Invoice' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'sale_id', label: 'Ref. Penjualan' },
  { key: 'due_date', label: 'Jatuh Tempo' },
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'total', label: 'Total' },
  { key: 'status', label: 'Status' },
]

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<SalesInvoice | null>(null)
const deletingItem = ref<SalesInvoice | null>(null)
const form = reactive({
  invoice_no: '',
  customer_id: null as number | null,
  sale_id: null as number | null,
  due_date: '',
  subtotal: 0,
  service_charge: 0,
  tax: 0,
  total: 0,
  status: 'unpaid',
})

const defaultForm = { ...form }

const calcTotal = computed(() => form.subtotal + form.service_charge + form.tax)

function onSaleChange() {
  const s = findSale(form.sale_id)
  if (s) {
    form.customer_id = s.customer_id
    form.subtotal = s.subtotal
    form.service_charge = s.service_charge
    form.tax = s.tax
    form.total = s.total
  }
}

function openAdd() {
  editingItem.value = null
  Object.assign(form, { ...defaultForm, invoice_no: `INV-S-${Date.now().toString().slice(-6)}` })
  showModal.value = true
}

function openEdit(item: SalesInvoice) {
  editingItem.value = item
  Object.assign(form, {
    invoice_no: item.invoice_no,
    customer_id: item.customer_id,
    sale_id: item.sale_id,
    due_date: item.due_date,
    subtotal: item.subtotal,
    service_charge: item.service_charge,
    tax: item.tax,
    total: item.total,
    status: item.status,
  })
  showModal.value = true
}

function handleSubmit() {
  if (!form.invoice_no.trim()) return
  form.total = calcTotal.value
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx], ...form, updated_at: new Date().toISOString() }
  } else {
    data.value.push({ id: Date.now(), ...form, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })
  }
  showModal.value = false
}

function openDelete(item: SalesInvoice) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}

function customerName(id: number | null): string {
  const c = findCustomer(id)
  return c ? c.company_name || c.name : '-'
}

function saleRef(id: number | null): string {
  return id ? `SALE-${id}` : '-'
}

function formatRupiah(val: number): string {
  return 'Rp ' + val.toLocaleString('id-ID')
}
</script>

<template>
  <div>
    <PageHeader title="Sales Invoices" button-label="Buat Invoice Penjualan" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari invoice penjualan..." @edit="openEdit" @delete="openDelete">
      <template #cell-customer_id="{ value }">{{ customerName(value) }}</template>
      <template #cell-sale_id="{ value }">{{ saleRef(value) }}</template>
      <template #cell-subtotal="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-total="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-status="{ value }">
        <span :class="value === 'paid' ? 'badge badge-success' : value === 'overdue' ? 'badge badge-danger' : 'badge badge-warning'">
          {{ value === 'paid' ? 'Lunas' : value === 'overdue' ? 'Lewat Jatuh Tempo' : 'Belum Bayar' }}
        </span>
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Invoice Penjualan' : 'Buat Invoice Penjualan'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="si-no" class="form-label">No. Invoice</label>
        <input id="si-no" v-model="form.invoice_no" type="text" class="form-input" placeholder="INV-S-XXXXXX">
      </div>
      <div class="form-group">
        <label for="si-sale" class="form-label">Referensi Penjualan</label>
        <select id="si-sale" v-model="form.sale_id" class="form-select" @change="onSaleChange">
          <option :value="null">-- Pilih Penjualan --</option>
          <option v-for="s in sales" :key="s.id" :value="s.id">SALE-{{ s.id }} — {{ formatRupiah(s.total) }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="si-customer" class="form-label">Customer</label>
        <select id="si-customer" v-model="form.customer_id" class="form-select">
          <option :value="null">-- Pilih Customer --</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.company_name || c.name }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="si-due" class="form-label">Jatuh Tempo</label>
        <input id="si-due" v-model="form.due_date" type="date" class="form-input">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="si-subtotal" class="form-label">Subtotal (Rp)</label>
          <input id="si-subtotal" v-model.number="form.subtotal" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="si-svc" class="form-label">Biaya Jasa (Rp)</label>
          <input id="si-svc" v-model.number="form.service_charge" type="number" class="form-input" min="0">
        </div>
      </div>
      <div class="form-group">
        <label for="si-tax" class="form-label">Pajak (Rp)</label>
        <input id="si-tax" v-model.number="form.tax" type="number" class="form-input" min="0">
      </div>
      <div class="sale-summary">
        <div class="summary-row summary-total"><span>Total</span><span>{{ formatRupiah(calcTotal) }}</span></div>
      </div>
      <div class="form-group">
        <label for="si-status" class="form-label">Status</label>
        <select id="si-status" v-model="form.status" class="form-select">
          <option value="unpaid">Belum Bayar</option>
          <option value="paid">Lunas</option>
          <option value="overdue">Lewat Jatuh Tempo</option>
        </select>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Invoice Penjualan" :message="`Yakin ingin menghapus invoice '${deletingItem?.invoice_no}'?`" @close="showConfirm = false" @confirm="handleDelete" />
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
}
</style>
