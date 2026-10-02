<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import type { Supplier, TableColumn } from '@/types'
import { reactive, ref } from 'vue'
import { useSuppliers } from '@/composables/useSuppliers'
import { useToast } from '@/composables/useToast'
import { useHardDelete } from '@/composables/useHardDelete'

const toast = useToast()

const columns: TableColumn[] = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
]

const { suppliers: data, fetchAll, create, update, remove, hardRemove, error } = useSuppliers()
fetchAll()
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Supplier | null>(null)
const deletingItem = ref<Supplier | null>(null)
const form = reactive<any>({})

function openAdd() {
  editingItem.value = null
  for (let k in form) form[k] = ''
  showModal.value = true
}

function openEdit(item: Supplier) {
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
  toast.success(editingItem.value ? 'Supplier updated successfully!' : 'Supplier saved successfully!')
}

const hardDelete = useHardDelete(hardRemove, fetchAll)

function openDelete(item: Supplier) { deletingItem.value = item; showConfirm.value = true }
async function handleDelete() {
  if (deletingItem.value) await remove(String(deletingItem.value.id))
  showConfirm.value = false
  toast.success('Supplier deleted successfully!')
}
</script>

<template>
  <div>
    <PageHeader title="Suppliers" button-label="Add Supplier" permission="supplier:create" @add="openAdd" />
    <div v-if="error" class="page-error" role="alert">{{ error }}</div>
    <DataTable :columns="columns" :data="data" search-placeholder="Search..." permission="supplier" @edit="openEdit" @delete="openDelete" :show-hard-delete="hardDelete.isSuperadmin" @hard-delete="hardDelete.open" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit Supplier' : 'Add Supplier'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group" v-for="col in columns" :key="col.key">
        <label class="form-label">{{ col.label }}</label>
        <input v-model="form[col.key]" type="text" class="form-input">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Supplier" message="Are you sure you want to delete this item?" @close="showConfirm = false" @confirm="handleDelete" />
    <HardDeleteDialog :open="hardDelete.show" title="Hapus Permanen Supplier" :item-label="hardDelete.expected"
      :expected="hardDelete.expected" :confirm-valid="hardDelete.confirmed" @close="hardDelete.close"
      @confirm="hardDelete.confirm" @update:input="hardDelete.input = $event" />
  </div>
</template>
