<script setup lang="ts">
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import type { TableColumn, PaperType } from '@/types'

const columns: TableColumn[] = [
  { key: 'name', label: 'Tipe Kertas' },
]

const data = ref<PaperType[]>([])
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<PaperType | null>(null)
const deletingItem = ref<PaperType | null>(null)
const form = reactive({ name: '' })

function openAdd() {
  editingItem.value = null
  form.name = ''
  showModal.value = true
}

function openEdit(item: PaperType) {
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

function openDelete(item: PaperType) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}
</script>

<template>
  <div>
    <PageHeader title="Paper Type" button-label="Add Paper Type" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari tipe kertas..." @edit="openEdit" @delete="openDelete" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit Tipe Kertas' : 'Tambah Tipe Kertas'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="pt-name" class="form-label">Nama Tipe Kertas</label>
        <input id="pt-name" v-model="form.name" type="text" class="form-input" placeholder="Contoh: HVS, Art Paper, Glossy">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Tipe Kertas" :message="`Yakin ingin menghapus tipe '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
