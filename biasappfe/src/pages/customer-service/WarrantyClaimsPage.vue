<script setup lang="ts">
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn, WarrantyClaim } from '@/types'

const {
  warrantyClaims: data,
  warranties,
  serviceReports,
  findWarranty,
  findServiceReport,
} = useMasterStore()

const columns: TableColumn[] = [
  { key: 'id', label: 'ID' },
  { key: 'warranty_id', label: 'Garansi' },
  { key: 'service_report_id', label: 'Laporan Servis' },
  { key: 'claim_date', label: 'Tanggal Klaim' },
  { key: 'issue_description', label: 'Deskripsi Masalah' },
  { key: 'status', label: 'Status' },
]

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<WarrantyClaim | null>(null)
const deletingItem = ref<WarrantyClaim | null>(null)
const form = reactive({
  warranty_id: null as number | null,
  service_report_id: null as number | null,
  claim_date: '',
  issue_description: '',
  status: 'pending',
})

const defaultForm = { ...form }

function openAdd() {
  editingItem.value = null
  Object.assign(form, { ...defaultForm, claim_date: new Date().toISOString().slice(0, 10) })
  showModal.value = true
}

function openEdit(item: WarrantyClaim) {
  editingItem.value = item
  Object.assign(form, {
    warranty_id: item.warranty_id,
    service_report_id: item.service_report_id,
    claim_date: item.claim_date,
    issue_description: item.issue_description,
    status: item.status,
  })
  showModal.value = true
}

function handleSubmit() {
  if (!form.issue_description.trim()) return
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx], ...form, updated_at: new Date().toISOString() }
  } else {
    data.value.push({ id: Date.now(), ...form, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })
  }
  showModal.value = false
}

function openDelete(item: WarrantyClaim) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}

function warrantyLabel(id: number | null): string {
  const w = findWarranty(id)
  return w ? `${w.warranty_type} (${w.status})` : '-'
}

function srLabel(id: number | null): string {
  const sr = findServiceReport(id)
  return sr ? sr.service_report_no : '-'
}
</script>

<template>
  <div>
    <PageHeader title="Warranty Claims" button-label="Ajukan Klaim" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari klaim garansi..." @edit="openEdit" @delete="openDelete">
      <template #cell-warranty_id="{ value }">{{ warrantyLabel(value) }}</template>
      <template #cell-service_report_id="{ value }">{{ srLabel(value) }}</template>
      <template #cell-status="{ value }">
        <span :class="value === 'approved' ? 'badge badge-success' : value === 'rejected' ? 'badge badge-danger' : value === 'in_review' ? 'badge badge-info' : 'badge badge-warning'">
          {{ value === 'approved' ? 'Disetujui' : value === 'rejected' ? 'Ditolak' : value === 'in_review' ? 'Dalam Review' : 'Pending' }}
        </span>
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Klaim Garansi' : 'Ajukan Klaim Garansi'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="wc-warranty" class="form-label">Garansi</label>
        <select id="wc-warranty" v-model="form.warranty_id" class="form-select">
          <option :value="null">-- Pilih Garansi --</option>
          <option v-for="w in warranties" :key="w.id" :value="w.id">{{ w.warranty_type }} — {{ w.status === 'active' ? 'Aktif' : w.status }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="wc-sr" class="form-label">Laporan Servis Terkait</label>
        <select id="wc-sr" v-model="form.service_report_id" class="form-select">
          <option :value="null">-- Pilih Laporan --</option>
          <option v-for="sr in serviceReports" :key="sr.id" :value="sr.id">{{ sr.service_report_no }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="wc-date" class="form-label">Tanggal Klaim</label>
        <input id="wc-date" v-model="form.claim_date" type="date" class="form-input">
      </div>
      <div class="form-group">
        <label for="wc-desc" class="form-label">Deskripsi Masalah</label>
        <textarea id="wc-desc" v-model="form.issue_description" class="form-textarea" placeholder="Jelaskan masalah yang terjadi" rows="4"></textarea>
      </div>
      <div class="form-group">
        <label for="wc-status" class="form-label">Status</label>
        <select id="wc-status" v-model="form.status" class="form-select">
          <option value="pending">Pending</option>
          <option value="in_review">Dalam Review</option>
          <option value="approved">Disetujui</option>
          <option value="rejected">Ditolak</option>
        </select>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Klaim Garansi" :message="`Yakin ingin menghapus klaim ID ${deletingItem?.id}?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
