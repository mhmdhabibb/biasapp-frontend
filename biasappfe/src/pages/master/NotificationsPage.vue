<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import type { Notification, TableColumn } from '@/types'
import { reactive, ref } from 'vue'
import { useNotifications } from '@/composables/useNotifications'

const columns: TableColumn[] = [
  { key: 'title', label: 'Title' },
  { key: 'message', label: 'Message' },
]

const { notifications: data, fetchAll, create, update, remove, error } = useNotifications()
fetchAll()
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Notification | null>(null)
const deletingItem = ref<Notification | null>(null)
const form = reactive<any>({})

function openAdd() {
  editingItem.value = null
  for (let k in form) form[k] = ''
  showModal.value = true
}

function openEdit(item: Notification) {
  editingItem.value = item
  Object.assign(form, item)
  showModal.value = true
}

async function handleSubmit() {
  if (editingItem.value) {
    await update(String(editingItem.value.id), form)
  } else {
    await create(form)
  }
  showModal.value = false
}

function openDelete(item: Notification) { deletingItem.value = item; showConfirm.value = true }
async function handleDelete() {
  if (deletingItem.value) await remove(String(deletingItem.value.id))
  showConfirm.value = false
}
</script>

<template>
  <div>
    <PageHeader title="Notifications" button-label="Add Notification" @add="openAdd" />
    <div v-if="error" class="page-error" role="alert">{{ error }}</div>
    <DataTable :columns="columns" :data="data" search-placeholder="Cari..." @edit="openEdit" @delete="openDelete" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit Notification' : 'Add Notification'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group" v-for="col in columns" :key="col.key">
        <label class="form-label">{{ col.label }}</label>
        <input v-model="form[col.key]" type="text" class="form-input">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Notification" message="Yakin ingin menghapus item ini?" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
