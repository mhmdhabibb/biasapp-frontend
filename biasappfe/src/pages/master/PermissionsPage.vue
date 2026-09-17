<script setup lang="ts">
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import type { TableColumn, Permission } from '@/types'

const columns: TableColumn[] = [
  { key: 'name', label: 'Nama Permission' },
  { key: 'module_id', label: 'Module ID' },
]

const data = ref<Permission[]>([])
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Permission | null>(null)
const deletingItem = ref<Permission | null>(null)
const form = reactive({ name: '', module_id: null as number | null })

function openAdd() {
  editingItem.value = null
  Object.assign(form, { name: '', module_id: null })
  showModal.value = true
}

function openEdit(item: Permission) {
  editingItem.value = item
  Object.assign(form, { name: item.name, module_id: item.module_id })
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

function openDelete(item: Permission) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}
</script>

<template>
  <div>
    <PageHeader title="Permissions" button-label="Tambah Permission" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari permission..." @edit="openEdit" @delete="openDelete" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit Permission' : 'Tambah Permission'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="perm-name" class="form-label">Nama Permission</label>
        <input id="perm-name" v-model="form.name" type="text" class="form-input" placeholder="Contoh: create_user, delete_report">
      </div>
      <div class="form-group">
        <label for="perm-module" class="form-label">Module ID</label>
        <input id="perm-module" v-model.number="form.module_id" type="number" class="form-input" placeholder="ID modul terkait">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Permission" :message="`Yakin ingin menghapus permission '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
