<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn, Sale, SaleItem } from '@/types'

const {
  sales: data,
  customers,
  products,
  findCustomer,
  findProduct,
} = useMasterStore()

const columns: TableColumn[] = [
  { key: 'id', label: 'ID' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'sale_date', label: 'Tanggal' },
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'service_charge', label: 'Biaya Jasa' },
  { key: 'tax', label: 'Pajak' },
  { key: 'total', label: 'Total' },
]

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Sale | null>(null)
const deletingItem = ref<Sale | null>(null)

const saleItems = ref<{ product_id: number | null; qty: number; unit_price: number }[]>([])

const form = reactive({
  customer_id: null as number | null,
  sale_date: '',
  service_charge: 0,
  tax: 0,
})

const calcSubtotal = computed(() => saleItems.value.reduce((sum, item) => sum + (item.qty * item.unit_price), 0))
const calcTotal = computed(() => calcSubtotal.value + form.service_charge + form.tax)

function addSaleItem() {
  saleItems.value.push({ product_id: null, qty: 1, unit_price: 0 })
}

function removeSaleItem(idx: number) {
  saleItems.value.splice(idx, 1)
}

function onProductChange(idx: number) {
  const item = saleItems.value[idx]
  const prod = findProduct(item.product_id)
  if (prod) {
    item.unit_price = prod.price
  }
}

function openAdd() {
  editingItem.value = null
  Object.assign(form, { customer_id: null, sale_date: new Date().toISOString().slice(0, 10), service_charge: 0, tax: 0 })
  saleItems.value = [{ product_id: null, qty: 1, unit_price: 0 }]
  showModal.value = true
}

function openEdit(item: Sale) {
  editingItem.value = item
  Object.assign(form, {
    customer_id: item.customer_id,
    sale_date: item.sale_date,
    service_charge: item.service_charge,
    tax: item.tax,
  })
  saleItems.value = [{ product_id: null, qty: 1, unit_price: 0 }]
  showModal.value = true
}

function handleSubmit() {
  if (!form.customer_id) return
  const saleData = {
    ...form,
    subtotal: calcSubtotal.value,
    total: calcTotal.value,
  }
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx], ...saleData, updated_at: new Date().toISOString() }
  } else {
    data.value.push({ id: Date.now(), ...saleData, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })
  }
  showModal.value = false
}

function openDelete(item: Sale) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}

function customerName(id: number | null): string {
  const c = findCustomer(id)
  return c ? c.company_name || c.name : '-'
}

function formatRupiah(val: number): string {
  return 'Rp ' + val.toLocaleString('id-ID')
}
</script>

<template>
  <div>
    <PageHeader title="Sales" button-label="Buat Penjualan" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari penjualan..." @edit="openEdit" @delete="openDelete">
      <template #cell-customer_id="{ value }">{{ customerName(value) }}</template>
      <template #cell-subtotal="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-service_charge="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-tax="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-total="{ value }">{{ formatRupiah(value || 0) }}</template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Penjualan' : 'Buat Penjualan'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="sale-customer" class="form-label">Customer</label>
        <select id="sale-customer" v-model="form.customer_id" class="form-select">
          <option :value="null">-- Pilih Customer --</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.company_name || c.name }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="sale-date" class="form-label">Tanggal</label>
        <input id="sale-date" v-model="form.sale_date" type="date" class="form-input">
      </div>

      <div class="form-section-title">Item Penjualan</div>
      <div v-for="(item, idx) in saleItems" :key="idx" class="sale-item-row">
        <div class="form-group sale-item-product">
          <select v-model="item.product_id" class="form-select" @change="onProductChange(idx)">
            <option :value="null">-- Produk --</option>
            <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <div class="form-group sale-item-qty">
          <input v-model.number="item.qty" type="number" class="form-input" min="1" placeholder="Qty">
        </div>
        <div class="form-group sale-item-price">
          <input v-model.number="item.unit_price" type="number" class="form-input" min="0" placeholder="Harga">
        </div>
        <button type="button" class="btn-remove-item" title="Hapus item" @click="removeSaleItem(idx)">✕</button>
      </div>
      <button type="button" class="btn btn-outline btn-sm" @click="addSaleItem">+ Tambah Item</button>

      <div class="form-row">
        <div class="form-group">
          <label for="sale-svc" class="form-label">Biaya Jasa (Rp)</label>
          <input id="sale-svc" v-model.number="form.service_charge" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="sale-tax" class="form-label">Pajak (Rp)</label>
          <input id="sale-tax" v-model.number="form.tax" type="number" class="form-input" min="0">
        </div>
      </div>

      <div class="sale-summary">
        <div class="summary-row"><span>Subtotal</span><span>{{ formatRupiah(calcSubtotal) }}</span></div>
        <div class="summary-row"><span>Biaya Jasa</span><span>{{ formatRupiah(form.service_charge) }}</span></div>
        <div class="summary-row"><span>Pajak</span><span>{{ formatRupiah(form.tax) }}</span></div>
        <div class="summary-row summary-total"><span>Total</span><span>{{ formatRupiah(calcTotal) }}</span></div>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Penjualan" :message="`Yakin ingin menghapus penjualan ID ${deletingItem?.id}?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-base);
}
.form-section-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
  padding-top: var(--space-sm);
  border-top: 1px solid var(--color-border-light);
}
.sale-item-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr auto;
  gap: var(--space-sm);
  align-items: end;
}
.btn-remove-item {
  width: 32px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  margin-bottom: 2px;
}
.btn-remove-item:hover {
  background: var(--color-danger-surface);
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
