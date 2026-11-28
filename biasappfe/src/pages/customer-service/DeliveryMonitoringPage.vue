<script setup lang="ts">
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import AssignTechnicianModal, { type AssignSubmitPayload } from '@/components/ui/AssignTechnicianModal.vue'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import { getAssignedTeamDisplay, getJobMemberTechIds } from '@/utils/jobTechnician'
import { hasDeliveryHistory, printDeliveryServiceHistory } from '@/utils/printDeliveryHistory'
import FormModal from '@/components/ui/FormModal.vue'
import SignaturePad from '@/components/ui/SignaturePad.vue'
import { useResourcesStore } from '@/stores/resources.store'
import { onMounted, ref, reactive, watch } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps<{ embedded?: boolean }>()
const emit = defineEmits<{ (e: 'count', count: number): void }>()

const toast = useToast()
const { can } = usePermission()
const { currentUser } = useAuth()
const route = useRoute()
const { ensureResourcesLoaded } = useMasterStore()

onMounted(() => {
  ensureResourcesLoaded(route.path)
})

const { deliveryOrders, jobOrders, technicians, findCustomer, findTechnician, refreshInBackground } = useMasterStore()

watch(() => (deliveryOrders.value as any[]).length, (n) => emit('count', n), { immediate: true })

const columns: TableColumn[] = [
  { key: 'delivery_no', label: 'DO No', width: '170px' },
  { key: 'customer_id', label: 'Customer', minWidth: '180px', wrap: true },
  { key: 'contract_item_id', label: 'Ref', width: '130px' },
  { key: 'assigned_to', label: 'Teknisi', width: '170px' },
  { key: 'delivery_date', label: 'Date', width: '110px' },
  { key: 'status', label: 'Status', width: '110px' },
]

function getCustomer(id: number | null) {
  const c = findCustomer(id as any)
  return c ? c.company_name || c.name || '-' : '-'
}

function getTechnician(id: number | null) {
  const t = findTechnician(id)
  return t ? t.name : '-'
}

function printServiceHistory(item: any) {
  printDeliveryServiceHistory(item)
}

function findJobOrderForDO(doId: string | number) {
  return (jobOrders.value as any[]).find(
    (j: any) => String(j.delivery_order_id || '') === String(doId),
  ) || null
}

function getDoTeam(row: any) {
  const jo = findJobOrderForDO(row.id)
  const target = jo ? { ...row, technician_id: row.technician_id || jo.technician_id, member_technician_ids: jo.member_technician_ids, job_order_technicians: jo.job_order_technicians } : row
  return getAssignedTeamDisplay(target, findTechnician)
}

function isDoCompleted(row: any) {
  const s = String(row?.status || '').toLowerCase()
  return s === 'delivered' || s === 'completed' || s === 'cancelled' || !!row?.is_completed
}

const showAssignModal = ref(false)
const assigningRow = ref<any>(null)
const isAssigning = ref(false)
const assignInitial = ref({
  technician_id: '',
  member_technician_ids: [] as string[],
  scheduled_date: '',
  instructions: '',
})

function openAssign(row: any) {
  assigningRow.value = row
  const jo = findJobOrderForDO(row.id)
  assignInitial.value = {
    technician_id: (row.technician_id || jo?.technician_id) ? String(row.technician_id || jo?.technician_id) : '',
    member_technician_ids: jo ? getJobMemberTechIds(jo) : [],
    scheduled_date: jo?.scheduled_date || row.delivery_date || '',
    instructions: jo?.instructions || row.notes || row.project_name || '',
  }
  showAssignModal.value = true
}

async function handleAssignSubmit(payload: AssignSubmitPayload) {
  if (!assigningRow.value) return
  isAssigning.value = true
  try {
    const row = assigningRow.value
    const existingJO = findJobOrderForDO(row.id)
    if (existingJO) {
      await api.patch(`/job-orders/${existingJO.id}`, {
        technician_id: payload.technician_id,
        member_technician_ids: payload.member_technician_ids,
        scheduled_date: payload.scheduled_date,
        instructions: payload.instructions,
        assigner_name: currentUser.value?.name || undefined,
      })
      toast.success('Teknisi delivery berhasil diperbarui.')
    } else {
      await api.post('/job-orders', {
        job_order_no: `JO-${Date.now().toString().slice(-6)}`,
        delivery_order_id: row.id,
        technician_id: payload.technician_id,
        member_technician_ids: payload.member_technician_ids,
        job_type: 'delivery',
        scheduled_date: payload.scheduled_date,
        instructions: payload.instructions || 'Delivery & Installation',
        assigner_name: currentUser.value?.name || undefined,
      })
      toast.success('Teknisi delivery berhasil di-assign.')
    }
    showAssignModal.value = false
    window.dispatchEvent(new CustomEvent('bias:data-mutated'))
    await refreshInBackground()
  } catch (err: any) {
    toast.error(err?.message || 'Gagal meng-assign teknisi delivery.')
  } finally {
    isAssigning.value = false
  }
}

const showModal = ref(false)
const editingItem = ref<any>(null)
const form = reactive({
  problem: '',
  notes: '',
  is_tested: false,
  is_completed: false,
  time_in: '',
  time_out: '',
  customer_signature: '',
  technician_signature: '',
  customer_name: '',
  technician_name: ''
})

function openEdit(item: any) {
  editingItem.value = item
  Object.assign(form, {
    problem: item.problem || '',
    notes: item.notes || '',
    is_tested: !!item.is_tested,
    is_completed: !!item.is_completed,
    time_in: item.time_in || '',
    time_out: item.time_out || '',
    customer_signature: item.customer_signature || '',
    technician_signature: item.technician_signature || '',
    customer_name: item.customer_name || '',
    technician_name: item.technician_name || ''
  })
  showModal.value = true
}

async function handleSubmit() {
  try {
    if (editingItem.value) {
      await useResourcesStore().update('deliveryOrders', String(editingItem.value.id), form)
      await useMasterStore().refreshInBackground()
    }
    showModal.value = false
  } catch (err) {
    console.error(err)
    toast.error('Gagal mengupdate delivery order. Silakan coba lagi.')
  }
}

async function markDelivered(row: any) {
  if (String(row.status || '').toLowerCase() === 'delivered') return
  if (!window.confirm(`Tandai DO ${row.do_number || row.id} sebagai DELIVERED?\n\nSetelah delivered, customer bisa mengajukan service request untuk barang ini.`)) return
  try {
    await useResourcesStore().update('deliveryOrders', String(row.id), { status: 'delivered' })
    await useMasterStore().refreshInBackground()
    toast.success('Delivery order marked as delivered.')
  } catch (err) {
    console.error(err)
    toast.error('Gagal mengubah status menjadi delivered. Silakan coba lagi.')
  }
}
</script>

<template>
  <div>
    <PageHeader v-if="!embedded" title="Delivery & Installation Monitoring" />
    <DataTable :columns="columns" :data="deliveryOrders" search-placeholder="Search delivery..." :scrollable="false" class="dm-table">
      <template #cell-delivery_no="{ row }">
        <span class="do-no-cell">{{ row.delivery_no || row.do_number || '-' }}</span>
      </template>
      <template #cell-customer_id="{ value }"><span class="customer-cell">{{ getCustomer(value) }}</span></template>
      <template #cell-assigned_to="{ row }">
        <template v-if="getDoTeam(row).leadName">
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-weight: 600; font-size: 12px;">Kepala: {{ getDoTeam(row).leadName }}</span>
            <span v-if="getDoTeam(row).memberNames.length > 0" style="font-size: 11px; color: var(--color-text-muted);">
              Anggota: {{ getDoTeam(row).memberNames.join(', ') }}
            </span>
          </div>
        </template>
        <span v-else class="text-muted" style="font-size: 12px; font-style: italic;">Belum ditugaskan</span>
      </template>
      <template #cell-status="{ value }">
        <span class="badge" :class="value === 'delivered' ? 'badge-success' : value === 'in_transit' ? 'badge-info' : 'badge-warning'">
          {{ value.toUpperCase().replace('_', ' ') }}
        </span>
      </template>
      <template #cell-delivery_date="{ value }">
        {{ value ? new Date(value).toLocaleDateString() : '-' }}
      </template>
      <template #actions="{ row }">
        <div class="dm-actions">
          <button
            v-if="(can('job_order:create') || can('delivery_order:update')) && !isDoCompleted(row) && String(row.do_type || '').toLowerCase() !== 'inbound'"
            class="action-btn"
            style="color: var(--color-primary); border-color: transparent;"
            :title="findJobOrderForDO(row.id)?.technician_id || row.technician_id ? 'Re-assign' : 'Assign'"
            @click="openAssign(row)"
          >
            <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
          </button>
          <button v-if="can('delivery_order:update')" class="action-btn" title="Edit Report" @click="openEdit(row)">
            <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button v-if="can('delivery_order:update') && String(row.status || '').toLowerCase() !== 'delivered'" class="action-btn" title="Mark Delivered" @click="markDelivered(row)">
            <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
          <button v-if="can('delivery_order:read') && hasDeliveryHistory(row) && String(row.do_type || '').toLowerCase() !== 'inbound'" class="action-btn" title="Print Service History" @click="printServiceHistory(row)">
            <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          </button>
        </div>
      </template>
    </DataTable>

    <FormModal :open="showModal" title="Edit Service Report (Delivery)" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label class="form-label">Problem</label>
        <textarea v-model="form.problem" class="form-textarea" placeholder="Describe the problem..."></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Remarks</label>
        <textarea v-model="form.notes" class="form-textarea" placeholder="Remarks / Actions taken..."></textarea>
      </div>
      <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
        <div class="form-group">
          <label class="form-label">Time In</label>
          <input v-model="form.time_in" type="time" class="form-input">
        </div>
        <div class="form-group">
          <label class="form-label">Time Out</label>
          <input v-model="form.time_out" type="time" class="form-input">
        </div>
      </div>
      <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem;">
        <label style="display: flex; align-items: center; gap: 0.5rem;">
          <input type="checkbox" v-model="form.is_tested"> Is Tested?
        </label>
        <label style="display: flex; align-items: center; gap: 0.5rem;">
          <input type="checkbox" v-model="form.is_completed"> Is Completed?
        </label>
      </div>
      
      <div style="display: flex; gap: 1rem; margin-top: 1rem;">
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Technician Name</label>
          <input v-model="form.technician_name" type="text" class="form-input" placeholder="Technician name">
          <label class="form-label mt-sm">Technician Signature</label>
          <SignaturePad v-model="form.technician_signature" height="150px" />
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Customer / PIC Name</label>
          <input v-model="form.customer_name" type="text" class="form-input" placeholder="Customer PIC name">
          <label class="form-label mt-sm">Customer Signature</label>
          <SignaturePad v-model="form.customer_signature" height="150px" />
        </div>
      </div>
    </FormModal>

    <AssignTechnicianModal
      :open="showAssignModal"
      :title="findJobOrderForDO(assigningRow?.id)?.technician_id || assigningRow?.technician_id ? 'Re-assign Teknisi Delivery' : 'Assign Teknisi Delivery'"
      :summary-lines="assigningRow ? [
        { label: 'DO No', value: assigningRow.do_number || assigningRow.delivery_no || '-' },
        { label: 'Customer', value: getCustomer(assigningRow.customer_id) },
      ] : []"
      :technicians="technicians"
      :initial-lead-id="assignInitial.technician_id"
      :initial-member-ids="assignInitial.member_technician_ids"
      :initial-scheduled-date="assignInitial.scheduled_date"
      :initial-instructions="assignInitial.instructions"
      :loading="isAssigning"
      @close="showAssignModal = false"
      @submit="handleAssignSubmit"
    />
  </div>
</template>

<style scoped>
.do-no-cell { font-size: 12px; font-weight: 600; white-space: nowrap; display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.customer-cell { font-size: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.dm-actions { display: inline-flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.dm-actions .action-btn { flex-shrink: 0; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--color-border-light, #e2e8f0); border-radius: 6px; background: #fff; cursor: pointer; }
.dm-actions .action-btn:hover { background: var(--color-surface-sunken, #f8fafc); }
:deep(.dm-table .data-table) { table-layout: fixed; width: 100%; }
:deep(.dm-table th), :deep(.dm-table td) { padding: 10px 8px; font-size: 12px; vertical-align: middle; }
:deep(.dm-table td:nth-child(1)) { overflow: hidden; }
@media (max-width: 900px) {
  :deep(.dm-table .data-table) { table-layout: auto; min-width: 760px; }
  :deep(.dm-table .table-wrap), :deep(.dm-table .table-container) { overflow-x: auto; }
}
</style>
