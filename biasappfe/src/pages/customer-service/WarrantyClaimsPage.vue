<script setup lang="ts">
// @ts-nocheck
import { computed, ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import type { TableColumn, WarrantyClaim } from '@/types'

const { can, canApprove } = usePermission()

const {
  warrantyClaims: data,
  warranties,
  serviceReports,
  findWarranty,
  findServiceReport,
} = useMasterStore()

const columns: TableColumn[] = [
  { key: 'id', label: 'ID' },
  { key: 'warranty_id', label: 'Warranty' },
  { key: 'service_report_id', label: 'Service Report' },
  { key: 'claim_date', label: 'Claim Date' },
  { key: 'issue_description', label: 'Issue Description' },
  { key: 'status', label: 'Status' },
]

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<WarrantyClaim | null>(null)
const deletingItem = ref<WarrantyClaim | null>(null)
const form = reactive({
  warranty_id: null as any,
  service_report_id: null as any,
  claim_date: '',
  issue_description: '',
  status: 'pending',
})

const defaultForm = { ...form }

const warrantyOptions = computed(() =>
  (warranties.value as any[]).map((w: any) => ({
    value: w.id,
    label: `${w.warranty_type} — ${w.status === 'active' ? 'Active' : w.status}`,
  })),
)

const serviceReportOptions = computed(() =>
  (serviceReports.value as any[]).map((sr: any) => ({
    value: sr.id,
    label: sr.service_report_no,
  })),
)

const statusOptions = computed(() => {
  const opts = [
    { value: 'pending', label: 'Pending' },
    { value: 'in_review', label: 'In Review' },
  ]
  if (canApprove('warranty_claim')) {
    opts.push({ value: 'approved', label: 'Approved' })
    opts.push({ value: 'rejected', label: 'Rejected' })
  }
  return opts
})

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
    if (idx >= 0) data.value[idx] = { ...data.value[idx]!, ...form, updated_at: new Date().toISOString() }
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

function warrantyLabel(id: any): string {
  const w = findWarranty(id)
  return w ? `${w.warranty_type} (${w.status})` : '-'
}

function srLabel(id: any): string {
  const sr = findServiceReport(id as any)
  return sr ? sr.service_report_no : '-'
}
</script>

<template>
  <div>
    <PageHeader title="Warranty Claims" button-label="Add Warranty Claim" permission="warranty_claim:create" @add="openAdd" />
    <DataTable :columns="columns" :data="data" permission="warranty_claim" search-placeholder="Search warranty claims..." @edit="openEdit" @delete="openDelete">
      <template #cell-warranty_id="{ value }">{{ warrantyLabel(value) }}</template>
      <template #cell-service_report_id="{ value }">{{ srLabel(value) }}</template>
      <template #cell-status="{ value }">
        <span :class="value === 'approved' ? 'badge badge-success' : value === 'rejected' ? 'badge badge-danger' : value === 'in_review' ? 'badge badge-info' : 'badge badge-warning'">
          {{ value === 'approved' ? 'Approved' : value === 'rejected' ? 'Rejected' : value === 'in_review' ? 'In Review' : 'Pending' }}
        </span>
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Warranty Claim' : 'Add Warranty Claim'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="wc-warranty" class="form-label">Warranty</label>
        <CustomSelect id="wc-warranty" v-model="form.warranty_id" :options="warrantyOptions" placeholder="-- Select Warranty --" class="form-select" />
      </div>
      <div class="form-group">
        <label for="wc-sr" class="form-label">Related Service Report</label>
        <CustomSelect id="wc-sr" v-model="form.service_report_id" :options="serviceReportOptions" placeholder="-- Select Report --" class="form-select" />
      </div>
      <div class="form-group">
        <label for="wc-date" class="form-label">Claim Date</label>
        <input id="wc-date" v-model="form.claim_date" type="date" class="form-input">
      </div>
      <div class="form-group">
        <label for="wc-desc" class="form-label">Issue Description</label>
        <textarea id="wc-desc" v-model="form.issue_description" class="form-textarea" placeholder="Explain the issue" rows="4"></textarea>
      </div>
      <div class="form-group">
        <label for="wc-status" class="form-label">Status</label>
        <CustomSelect id="wc-status" v-model="form.status" :options="statusOptions" class="form-select" />
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Warranty Claim" :message="`Are you sure you want to delete claim ID ${deletingItem?.id}?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
