<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import type { SystemSetting, TableColumn } from '@/types'
import { reactive, ref } from 'vue'
import { useSystemSettings } from '@/composables/useSystemSettings'
import { useToast } from '@/composables/useToast'

const toast = useToast()

const columns: TableColumn[] = [
  { key: 'key', label: 'Key' },
  { key: 'value', label: 'Value' },
]

const { systemSettings: data, fetchAll, create, update, remove, error } = useSystemSettings()
fetchAll()
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<SystemSetting | null>(null)
const deletingItem = ref<SystemSetting | null>(null)
const form = reactive<any>({})

function openAdd() {
  editingItem.value = null
  for (let k in form) form[k] = ''
  showModal.value = true
}

function openEdit(item: SystemSetting) {
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
  toast.success(editingItem.value ? 'System setting updated successfully!' : 'System setting saved successfully!')
}

function openDelete(item: SystemSetting) { deletingItem.value = item; showConfirm.value = true }
async function handleDelete() {
  if (deletingItem.value) await remove(String(deletingItem.value.id))
  showConfirm.value = false
  toast.success('System setting deleted successfully!')
}
</script>

<template>
  <div>
    <PageHeader title="System Settings" button-label="Add System Setting" permission="system_setting:create" @add="openAdd" />
    <div v-if="error" class="page-error" role="alert">{{ error }}</div>
    <DataTable :columns="columns" :data="data" search-placeholder="Search..." permission="system_setting" @edit="openEdit" @delete="openDelete" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit System Setting' : 'Add System Setting'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group" v-for="col in columns" :key="col.key">
        <label class="form-label">{{ col.label }}</label>
        <input v-model="form[col.key]" type="text" class="form-input">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete System Setting" message="Are you sure you want to delete this item?" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
