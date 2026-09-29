<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import type { Brand, TableColumn } from '@/types'
import { reactive, ref } from 'vue'

import { useBrands } from '@/composables/useBrands'

const columns: TableColumn[] = [
  { key: 'name', label: 'Nama Brand' },
]

const { brands: data, fetchAll, create, update, remove, error } = useBrands()
fetchAll()
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Brand | null>(null)
const deletingItem = ref<Brand | null>(null)
const form = reactive({ name: '' })

function openAdd() {
  editingItem.value = null
  form.name = ''
  showModal.value = true
}

function openEdit(item: Brand) {
  editingItem.value = item
  form.name = item.name
  showModal.value = true
}

async function handleSubmit() {
  if (!form.name.trim()) return
  if (editingItem.value) {
    await update(String(editingItem.value.id), form.name)
  } else {
    await create(form.name)
  }
  showModal.value = false
}

function openDelete(item: Brand) { deletingItem.value = item; showConfirm.value = true }
async function handleDelete() {
  if (deletingItem.value) await remove(String(deletingItem.value.id))
  showConfirm.value = false
}
</script>

<template>
  <div>
    <PageHeader title="Brands" button-label="Add Brand" @add="openAdd" />
    <div v-if="error" class="page-error" role="alert">{{ error }}</div>
    <DataTable :columns="columns" :data="data" search-placeholder="Cari brand..." @edit="openEdit" @delete="openDelete" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit Brand' : 'Add Brand'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="brand-name" class="form-label">Nama Brand</label>
        <input id="brand-name" v-model="form.name" type="text" class="form-input" placeholder="Contoh: Canon, HP, Epson">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Brand" :message="`Yakin ingin menghapus brand '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
