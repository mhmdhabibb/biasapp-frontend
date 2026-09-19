<script setup lang="ts">
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import type { TableColumn, Brand } from '@/types'

const columns: TableColumn[] = [
  { key: 'name', label: 'Nama Brand' },
]

const data = ref<Brand[]>([])
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

function handleSubmit() {
  if (!form.name.trim()) return
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx], name: form.name, updated_at: new Date().toISOString() }
  } else {
    data.value.push({ id: Date.now(), name: form.name, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })
  }
  showModal.value = false
}

function openDelete(item: Brand) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}
</script>

<template>
  <div>
    <PageHeader title="Brands" button-label="Add Brand" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari brand..." @edit="openEdit" @delete="openDelete" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit Brand' : 'Tambah Brand'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="brand-name" class="form-label">Nama Brand</label>
        <input id="brand-name" v-model="form.name" type="text" class="form-input" placeholder="Contoh: Canon, HP, Epson">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Brand" :message="`Yakin ingin menghapus brand '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
