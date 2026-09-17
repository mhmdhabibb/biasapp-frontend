<script setup lang="ts">
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import type { TableColumn, Unit } from '@/types'

const columns: TableColumn[] = [
  { key: 'name', label: 'Nama Unit' },
  { key: 'model', label: 'Model' },
  { key: 'serial_no', label: 'Serial Number' },
]

const data = ref<Unit[]>([])
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Unit | null>(null)
const deletingItem = ref<Unit | null>(null)
const form = reactive({ name: '', brand_id: null as number | null, unit_type_id: null as number | null, model: '', serial_no: '' })

function openAdd() {
  editingItem.value = null
  Object.assign(form, { name: '', brand_id: null, unit_type_id: null, model: '', serial_no: '' })
  showModal.value = true
}

function openEdit(item: Unit) {
  editingItem.value = item
  Object.assign(form, { name: item.name, brand_id: item.brand_id, unit_type_id: item.unit_type_id, model: item.model, serial_no: item.serial_no })
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

function openDelete(item: Unit) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}
</script>

<template>
  <div>
    <PageHeader title="Units" button-label="Tambah Unit" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari unit..." @edit="openEdit" @delete="openDelete" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit Unit' : 'Tambah Unit'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="unit-name" class="form-label">Nama Unit</label>
        <input id="unit-name" v-model="form.name" type="text" class="form-input" placeholder="Nama unit">
      </div>
      <div class="form-group">
        <label for="unit-model" class="form-label">Model</label>
        <input id="unit-model" v-model="form.model" type="text" class="form-input" placeholder="Model unit">
      </div>
      <div class="form-group">
        <label for="unit-serial" class="form-label">Serial Number</label>
        <input id="unit-serial" v-model="form.serial_no" type="text" class="form-input" placeholder="Nomor seri unit">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Unit" :message="`Yakin ingin menghapus unit '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
