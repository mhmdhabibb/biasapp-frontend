<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import type { Notification, TableColumn } from '@/types'
import { reactive, ref } from 'vue'
import { useNotifications } from '@/composables/useNotifications'
import { useToast } from '@/composables/useToast'
import { useHardDelete } from '@/composables/useHardDelete'

const toast = useToast()

const columns: TableColumn[] = [
  { key: 'title', label: 'Title' },
  { key: 'message', label: 'Message' },
]

const { notifications: data, fetchAll, create, update, remove, hardRemove, error } = useNotifications()
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
  toast.success(editingItem.value ? 'Notification updated successfully!' : 'Notification saved successfully!')
}

const hardDelete = useHardDelete(hardRemove, fetchAll)

function openDelete(item: Notification) { deletingItem.value = item; showConfirm.value = true }
async function handleDelete() {
  if (deletingItem.value) await remove(String(deletingItem.value.id))
  showConfirm.value = false
  toast.success('Notification deleted successfully!')
}
</script>

<template>
  <div>
    <PageHeader title="Notifications" button-label="Add Notification" permission="notification:create" @add="openAdd" />
    <div v-if="error" class="page-error" role="alert">{{ error }}</div>
    <DataTable :columns="columns" :data="data" search-placeholder="Search..." permission="notification" @edit="openEdit" @delete="openDelete" :show-hard-delete="hardDelete.isSuperadmin" @hard-delete="hardDelete.open" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit Notification' : 'Add Notification'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group" v-for="col in columns" :key="col.key">
        <label class="form-label">{{ col.label }}</label>
        <input v-model="form[col.key]" type="text" class="form-input">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Notification" message="Are you sure you want to delete this item?" @close="showConfirm = false" @confirm="handleDelete" />
    <HardDeleteDialog :open="hardDelete.show" title="Hapus Permanen Notification" :item-label="hardDelete.expected"
      :expected="hardDelete.expected" :confirm-valid="hardDelete.confirmed" @close="hardDelete.close"
      @confirm="hardDelete.confirm" @update:input="hardDelete.input = $event" />
  </div>
</template>
