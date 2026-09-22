<script setup lang="ts">
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import type { TableColumn, Role } from '@/types'

const columns: TableColumn[] = [
  { key: 'name', label: 'Nama Role' },
  { key: 'created_at', label: 'Dibuat' },
]

const data = ref<Role[]>([])
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Role | null>(null)
const deletingItem = ref<Role | null>(null)
const form = reactive({ name: '' })

function openAdd() {
  editingItem.value = null
  form.name = ''
  showModal.value = true
}

function openEdit(item: Role) {
  editingItem.value = item
  form.name = item.name
  showModal.value = true
}

function handleSubmit() {
  if (!form.name.trim()) return
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx], name: form.name }
  } else {
    data.value.push({ id: Date.now(), name: form.name, created_at: new Date().toISOString(), deleted_at: null })
  }
  showModal.value = false
}

function openDelete(item: Role) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}
</script>

<template>
  <div>
    <PageHeader title="Roles" button-label="Add Role" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari role..." @edit="openEdit" @delete="openDelete" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit Role' : 'Add Role'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="role-name" class="form-label">Nama Role</label>
        <input id="role-name" v-model="form.name" type="text" class="form-input" placeholder="Contoh: Admin, Operator">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Role" :message="`Yakin ingin menghapus role '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
