<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import type { Brand, TableColumn } from '@/types'
import { reactive, ref } from 'vue'

import { useBrands } from '@/composables/useBrands'
import { useToast } from '@/composables/useToast'

const toast = useToast()

const columns: TableColumn[] = [
  { key: 'name', label: 'Brand Name' },
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
  toast.success(editingItem.value ? 'Brand updated successfully!' : 'Brand saved successfully!')
}

function openDelete(item: Brand) { deletingItem.value = item; showConfirm.value = true }
async function handleDelete() {
  if (deletingItem.value) await remove(String(deletingItem.value.id))
  showConfirm.value = false
  toast.success('Brand deleted successfully!')
}
</script>

<template>
  <div>
    <PageHeader title="Brands" button-label="Add Brand" permission="brand:create" @add="openAdd" />
    <div v-if="error" class="page-error" role="alert">{{ error }}</div>
    <DataTable :columns="columns" :data="data" search-placeholder="Search brands..." permission="brand" @edit="openEdit" @delete="openDelete" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit Brand' : 'Add Brand'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="brand-name" class="form-label">Brand Name</label>
        <input id="brand-name" v-model="form.name" type="text" class="form-input" placeholder="Example: Canon, HP, Epson">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Brand" :message="`Are you sure you want to delete brand '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
