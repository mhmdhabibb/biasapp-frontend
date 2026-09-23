<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { resources } from '@/services/resource.service'
import type { TableColumn, Product } from '@/types'

const columns: TableColumn[] = [
  { key: 'name', label: 'Nama Produk' },
  { key: 'sku', label: 'SKU' },
  { key: 'price', label: 'Harga' },
  { key: 'stock', label: 'Stok' },
]

const data = ref<Product[]>([])

async function fetchData() {
  try {
    const res = await resources.products.list()
    data.value = res.data as any
  } catch (error) {
    console.error('Failed to fetch products:', error)
  }
}

onMounted(fetchData)

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

async function handleSubmit() {
  if (!form.name.trim()) return
  try {
    if (editingItem.value) {
      await resources.products.update(String(editingItem.value.id), form)
    } else {
      await resources.products.create(form)
    }
    await fetchData()
    showModal.value = false
  } catch (error) {
    console.error('Failed to save product:', error)
  }
}

function openDelete(item: Product) { deletingItem.value = item; showConfirm.value = true }

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.products.remove(String(deletingItem.value.id))
      await fetchData()
    } catch (error) {
      console.error('Failed to delete product:', error)
    }
  }
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
