<script setup lang="ts">
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import type { TableColumn, Warranty } from '@/types'

const { warranties: data } = useMasterStore()

const columns: TableColumn[] = [
  { key: 'warranty_type', label: 'Warranty Type' },
  { key: 'duration', label: 'Duration (months)' },
  { key: 'start_date', label: 'Start Date' },
  { key: 'end_date', label: 'End Date' },
  { key: 'status', label: 'Status' },
]
const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'claimed', label: 'Claimed' },
]
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Warranty | null>(null)
const deletingItem = ref<Warranty | null>(null)
const form = reactive({ warranty_type: '', duration: 12, start_date: '', end_date: '', status: 'active' })

function openAdd() {
  editingItem.value = null
  Object.assign(form, { warranty_type: '', duration: 12, start_date: '', end_date: '', status: 'active' })
  showModal.value = true
}

function openEdit(item: Warranty) {
  editingItem.value = item
  Object.assign(form, { warranty_type: item.warranty_type, duration: item.duration, start_date: item.start_date, end_date: item.end_date, status: item.status })
  showModal.value = true
}

function handleSubmit() {
  if (!form.warranty_type.trim()) return
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx], ...form, updated_at: new Date().toISOString() }
  } else {
    data.value.push({ id: Date.now(), ...form, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })
  }
  showModal.value = false
}

function openDelete(item: Warranty) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}
</script>

<template>
  <div>
    <PageHeader title="Warranties" button-label="Add Warranty" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Search warranties..." @edit="openEdit" @delete="openDelete">
      <template #cell-status="{ value }">
        <span :class="value === 'active' ? 'badge badge-success' : value === 'expired' ? 'badge badge-danger' : 'badge badge-neutral'">
          {{ value === 'active' ? 'Active' : value === 'expired' ? 'Expired' : value === 'claimed' ? 'Claimed' : value || '-' }}
        </span>
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Warranty' : 'Add Warranty'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="war-type" class="form-label">Warranty Type</label>
        <input id="war-type" v-model="form.warranty_type" type="text" class="form-input" placeholder="e.g., Full Service, Spare Part Only">
      </div>
      <div class="form-group">
        <label for="war-duration" class="form-label">Duration (months)</label>
        <input id="war-duration" v-model.number="form.duration" type="number" class="form-input" placeholder="12" min="1">
      </div>
      <div class="form-group">
        <label for="war-start" class="form-label">Start Date</label>
        <input id="war-start" v-model="form.start_date" type="date" class="form-input">
      </div>
      <div class="form-group">
        <label for="war-end" class="form-label">End Date</label>
        <input id="war-end" v-model="form.end_date" type="date" class="form-input">
      </div>
      <div class="form-group" style="position: relative;">
        <label for="war-status" class="form-label">Status</label>
        <CustomSelect
          id="war-status"
          v-model="form.status"
          :options="statusOptions"
          placeholder="Select status"
          :searchable="false"
        />
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Warranty" :message="`Are you sure you want to delete warranty '${deletingItem?.warranty_type}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
