<script setup lang="ts">
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import type { TableColumn, ProductCategory } from '@/types'

const columns: TableColumn[] = [
  { key: 'name', label: 'Nama Kategori' },
  { key: 'slug', label: 'Slug' },
]

const data = ref<ProductCategory[]>([])
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<ProductCategory | null>(null)
const deletingItem = ref<ProductCategory | null>(null)
const form = reactive({ name: '', slug: '' })

function openAdd() {
  editingItem.value = null
  Object.assign(form, { name: '', slug: '' })
  showModal.value = true
}

function openEdit(item: ProductCategory) {
  editingItem.value = item
  Object.assign(form, { name: item.name, slug: item.slug })
  showModal.value = true
}

function handleSubmit() {
  if (!form.name.trim()) return
  if (!form.slug.trim()) form.slug = form.name.toLowerCase().replace(/\s+/g, '-')
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx], ...form, updated_at: new Date().toISOString() }
  } else {
    data.value.push({ id: Date.now(), ...form, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })
  }
  showModal.value = false
}

function openDelete(item: ProductCategory) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}
</script>

<template>
  <div>
    <PageHeader title="Product Categories" button-label="Add Category" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari kategori..." @edit="openEdit" @delete="openDelete" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit Category' : 'Add Category'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="cat-name" class="form-label">Nama Kategori</label>
        <input id="cat-name" v-model="form.name" type="text" class="form-input" placeholder="Contoh: Toner, Drum, Spare Part">
      </div>
      <div class="form-group">
        <label for="cat-slug" class="form-label">Slug</label>
        <input id="cat-slug" v-model="form.slug" type="text" class="form-input" placeholder="Otomatis dari nama jika kosong">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Kategori" :message="`Yakin ingin menghapus kategori '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
