<script setup lang="ts">
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import type { TableColumn, Warranty } from '@/types'

const columns: TableColumn[] = [
  { key: 'warranty_type', label: 'Tipe Garansi' },
  { key: 'duration', label: 'Durasi (bulan)' },
  { key: 'start_date', label: 'Mulai' },
  { key: 'end_date', label: 'Berakhir' },
  { key: 'status', label: 'Status' },
]

const data = ref<Warranty[]>([])
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
    <DataTable :columns="columns" :data="data" search-placeholder="Cari garansi..." @edit="openEdit" @delete="openDelete">
      <template #cell-status="{ value }">
        <span :class="value === 'active' ? 'badge badge-success' : value === 'expired' ? 'badge badge-danger' : 'badge badge-neutral'">
          {{ value === 'active' ? 'Aktif' : value === 'expired' ? 'Kadaluarsa' : value || '-' }}
        </span>
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Garansi' : 'Tambah Garansi'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="war-type" class="form-label">Tipe Garansi</label>
        <input id="war-type" v-model="form.warranty_type" type="text" class="form-input" placeholder="Contoh: Full Service, Spare Part Only">
      </div>
      <div class="form-group">
        <label for="war-duration" class="form-label">Durasi (bulan)</label>
        <input id="war-duration" v-model.number="form.duration" type="number" class="form-input" placeholder="12" min="1">
      </div>
      <div class="form-group">
        <label for="war-start" class="form-label">Tanggal Mulai</label>
        <input id="war-start" v-model="form.start_date" type="date" class="form-input">
      </div>
      <div class="form-group">
        <label for="war-end" class="form-label">Tanggal Berakhir</label>
        <input id="war-end" v-model="form.end_date" type="date" class="form-input">
      </div>
      <div class="form-group">
        <label for="war-status" class="form-label">Status</label>
        <select id="war-status" v-model="form.status" class="form-select">
          <option value="active">Aktif</option>
          <option value="expired">Kadaluarsa</option>
          <option value="claimed">Diklaim</option>
        </select>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Garansi" :message="`Yakin ingin menghapus garansi '${deletingItem?.warranty_type}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
