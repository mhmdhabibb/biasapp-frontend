<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import type { Contract, TableColumn } from '@/types'
import { reactive, ref } from 'vue'
import { useContracts } from '@/composables/useContracts'
import { useToast } from '@/composables/useToast'
import { useHardDelete } from '@/composables/useHardDelete'

const toast = useToast()

const columns: TableColumn[] = [
  { key: 'contract_no', label: 'Contract No' },
  { key: 'status', label: 'Status' },
  { key: 'terms_notes', label: 'Free Quota Terms' },
]

const { contracts: data, fetchAll, create, update, remove, hardRemove, renew, error } = useContracts()
fetchAll()
const showModal = ref(false)
const showConfirm = ref(false)
const showRenewModal = ref(false)
const editingItem = ref<Contract | null>(null)
const deletingItem = ref<Contract | null>(null)
const renewingItem = ref<Contract | null>(null)
const form = reactive<any>({})
const renewForm = reactive({
  end_date: '',
})

function openAdd() {
  editingItem.value = null
  for (let k in form) form[k] = ''
  showModal.value = true
}

function openEdit(item: Contract) {
  editingItem.value = item
  Object.assign(form, item)
  showModal.value = true
}

function openRenew(item: Contract) {
  renewingItem.value = item
  renewForm.end_date = item.end_date ? String(item.end_date).slice(0, 10) : ''
  showRenewModal.value = true
}

async function handleSubmit() {
  if (editingItem.value) {
    await update(String(editingItem.value.id), form)
  } else {
    await create(form)
  }
  showModal.value = false
  toast.success(editingItem.value ? 'Contract updated successfully!' : 'Contract saved successfully!')
}

async function handleRenew() {
  if (!renewingItem.value || !renewForm.end_date) return
  await renew(String(renewingItem.value.id), { end_date: renewForm.end_date })
  await fetchAll()
  showRenewModal.value = false
  toast.success('Contract renewed successfully!')
}

const hardDelete = useHardDelete(hardRemove, fetchAll)

function openDelete(item: Contract) { deletingItem.value = item; showConfirm.value = true }
async function handleDelete() {
  if (deletingItem.value) await remove(String(deletingItem.value.id))
  showConfirm.value = false
  toast.success('Contract deleted successfully!')
}
</script>

<template>
  <div>
    <PageHeader title="Contracts"/>
    <div v-if="error" class="page-error" role="alert">{{ error }}</div>
    <DataTable :columns="columns" :data="data" search-placeholder="Search..." permission="contract" :show-hard-delete="hardDelete.isSuperadmin" @hard-delete="hardDelete.open">
      <template #actions="{ row }">
        <button class="action-btn action-btn--edit" title="Edit" @click="openEdit(row)">Edit</button>
        <button class="action-btn" title="Perpanjang" @click="openRenew(row)">Perpanjang</button>
        <button class="action-btn action-btn--delete" title="Delete" @click="openDelete(row)">Delete</button>
        <button v-if="hardDelete.isSuperadmin" class="action-btn action-btn--hard" title="Hapus permanen dari database (superadmin)" @click="hardDelete.open(row)">Hard Delete</button>
      </template>
    </DataTable>
 
    <FormModal :open="showRenewModal" title="Perpanjang Contract" @close="showRenewModal = false" @submit="handleRenew">
      <div class="form-group">
        <label class="form-label">End Date</label>
        <input v-model="renewForm.end_date" type="date" class="form-input" required>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Contract" message="Are you sure you want to delete this item?" @close="showConfirm = false" @confirm="handleDelete" />
    <HardDeleteDialog :open="hardDelete.show" title="Hapus Permanen Contract" :item-label="hardDelete.expected"
      :expected="hardDelete.expected" :confirm-valid="hardDelete.confirmed" @close="hardDelete.close"
      @confirm="hardDelete.confirm" @update:input="hardDelete.input = $event" />
  </div>
</template>
