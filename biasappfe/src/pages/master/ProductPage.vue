<script setup lang="ts">
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn, Product } from '@/types'

const { products: data } = useMasterStore()

const columns: TableColumn[] = [
  { key: 'name', label: 'Nama Produk' },
  { key: 'sku', label: 'SKU' },
  { key: 'price', label: 'Harga' },
  { key: 'stock', label: 'Stok' },
]
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Product | null>(null)
const deletingItem = ref<Product | null>(null)
const form = reactive({ name: '', sku: '', category_id: null as number | null, brand_id: null as number | null, price: 0, stock: 0 })

function generateSKU(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = 'PRD-'
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

function openAdd() {
  editingItem.value = null
  Object.assign(form, { name: '', sku: generateSKU(), category_id: null, brand_id: null, price: 0, stock: 0 })
  showModal.value = true
}

function openEdit(item: Product) {
  editingItem.value = item
  Object.assign(form, { name: item.name, sku: item.sku, category_id: item.category_id, brand_id: item.brand_id, price: item.price, stock: item.stock })
  showModal.value = true
}

function handleSubmit() {
  if (!form.name.trim()) return
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx], ...form, updated_at: new Date().toISOString() }
  } else {
    data.value.push({ id: Date.now(), ...form, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })
  }
  showModal.value = false
}

function openDelete(item: Product) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}

function formatRupiah(val: number): string {
  return 'Rp ' + val.toLocaleString('id-ID')
}
</script>

<template>
  <div>
    <PageHeader title="Products" button-label="Add Product" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari produk..." @edit="openEdit" @delete="openDelete">
      <template #cell-price="{ value }">{{ formatRupiah(value || 0) }}</template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Product' : 'Add Product'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="prod-name" class="form-label">Nama Produk</label>
        <input id="prod-name" v-model="form.name" type="text" class="form-input" placeholder="Nama produk">
      </div>
      <div class="form-group">
        <label for="prod-sku" class="form-label">SKU</label>
        <input id="prod-sku" v-model="form.sku" type="text" class="form-input" disabled placeholder="Auto-generated SKU">
      </div>
      <div class="form-group">
        <label for="prod-price" class="form-label">Harga (Rp)</label>
        <input id="prod-price" v-model.number="form.price" type="number" class="form-input" placeholder="0" min="0">
      </div>
      <div class="form-group">
        <label for="prod-stock" class="form-label">Stok</label>
        <input id="prod-stock" v-model.number="form.stock" type="number" class="form-input" placeholder="0" min="0">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Produk" :message="`Yakin ingin menghapus produk '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
