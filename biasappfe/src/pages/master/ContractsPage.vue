<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import type { Contract, TableColumn } from '@/types'
import { reactive, ref } from 'vue'
import { useContracts } from '@/composables/useContracts'
import { useToast } from '@/composables/useToast'

const toast = useToast()

const columns: TableColumn[] = [
  { key: 'contract_no', label: 'Contract No' },
  { key: 'status', label: 'Status' },
  { key: 'terms_notes', label: 'Free Quota Terms' },
]

const { contracts: data, fetchAll, create, update, remove, error } = useContracts()
fetchAll()
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Contract | null>(null)
const deletingItem = ref<Contract | null>(null)
const form = reactive<any>({})

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

async function handleSubmit() {
  if (editingItem.value) {
    await update(String(editingItem.value.id), form)
  } else {
    await create(form)
  }
  showModal.value = false
  toast.success(editingItem.value ? 'Contract updated successfully!' : 'Contract saved successfully!')
}

function openDelete(item: Contract) { deletingItem.value = item; showConfirm.value = true }
async function handleDelete() {
  if (deletingItem.value) await remove(String(deletingItem.value.id))
  showConfirm.value = false
  toast.success('Contract deleted successfully!')
}
</script>

<template>
  <div>
    <PageHeader title="Contracts" button-label="Add Contract" permission="contract:create" @add="openAdd" />
    <div v-if="error" class="page-error" role="alert">{{ error }}</div>
    <DataTable :columns="columns" :data="data" search-placeholder="Search..." permission="contract" @edit="openEdit" @delete="openDelete" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit Contract' : 'Add Contract'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group" v-for="col in columns.filter((c) => c.key !== 'terms_notes')" :key="col.key">
        <label class="form-label">{{ col.label }}</label>
        <input v-model="form[col.key]" type="text" class="form-input">
      </div>
      <div class="form-group">
        <label class="form-label">Free Quota Terms (e.g. Free 200 lembar, selebihnya kena charge)</label>
        <textarea v-model="form.terms_notes" class="form-input" rows="3" placeholder="Free 200 lembar/bulan khusus cetak Warna; selebihnya dikenakan charge sesuai rate."></textarea>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Contract" message="Are you sure you want to delete this item?" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
