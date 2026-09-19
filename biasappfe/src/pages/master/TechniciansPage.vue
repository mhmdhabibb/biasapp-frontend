<script setup lang="ts">
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import type { TableColumn, Technician } from '@/types'

const columns: TableColumn[] = [
  { key: 'name', label: 'Technician Name' },
  { key: 'phone', label: 'Phone' },
]

const data = ref<Technician[]>([])
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Technician | null>(null)
const deletingItem = ref<Technician | null>(null)
const form = reactive({ name: '', phone: '' })

function openAdd() {
  editingItem.value = null
  Object.assign(form, { name: '', phone: '' })
  showModal.value = true
}

function openEdit(item: Technician) {
  editingItem.value = item
  Object.assign(form, { name: item.name, phone: item.phone })
  showModal.value = true
}

function handleSubmit() {
  if (!form.name.trim()) return
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx], ...form }
  } else {
    data.value.push({ id: Date.now(), ...form, created_at: new Date().toISOString(), deleted_at: null })
  }
  showModal.value = false
}

function openDelete(item: Technician) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}
</script>

<template>
  <div>
    <PageHeader title="Technicians" button-label="Add Technician" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Search technician..." @edit="openEdit" @delete="openDelete" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit Technician' : 'Add Technician'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="tech-name" class="form-label">Name</label>
        <input id="tech-name" v-model="form.name" type="text" class="form-input" placeholder="Technician name">
      </div>
      <div class="form-group">
        <label for="tech-phone" class="form-label">Phone</label>
        <input id="tech-phone" v-model="form.phone" type="tel" inputmode="numeric" pattern="[0-9]*" class="form-input" placeholder="08xxxxxxxxxx" @input="form.phone = form.phone.replace(/[^0-9]/g, '')">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Technician" :message="`Are you sure you want to delete technician '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
