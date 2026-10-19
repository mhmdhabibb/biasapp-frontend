<script setup lang="ts">
// @ts-nocheck
import DataTable from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { useResourcesStore } from '@/stores/resources.store'
import type { SparepartRequest, TableColumn } from '@/types'
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import FormModal from '@/components/ui/FormModal.vue'

const { can } = usePermission()
const store = useMasterStore()
const resources = useResourcesStore()
const toast = useToast()
const router = useRouter()

const creatingId = ref<string | number | null>(null)
const showCreatePOModal = ref(false)
const poTarget = ref<SparepartRequest | null>(null)
const poForm = reactive({ reason: '', installation_date: '' })

function openCreatePOModal(request: SparepartRequest) {
  poTarget.value = request
  poForm.reason = ''
  poForm.installation_date = ''
  showCreatePOModal.value = true
}

function closeCreatePOModal() {
  if (creatingId.value !== null) return
  showCreatePOModal.value = false
  poTarget.value = null
}

const columns: TableColumn[] = [
  { key: 'request_no', label: 'Request No' },
  { key: 'service_report_id', label: 'Service No' },
  { key: 'technician_id', label: 'Requested By' },
  { key: 'product_id', label: 'Sparepart' },
  { key: 'qty', label: 'Qty' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Date' },
  { key: 'actions', label: 'Action' }
]

function getProduct(row: any) {
  const id = row?.product_id ?? row
  return (
    (row as any)?.product?.name ||
    store.findProduct(id as any)?.name ||
    '-'
  )
}

function getSR(row: any) {
  const id = row?.service_report_id ?? row
  const sr = (row as any)?.service_report || store.findServiceReport(id as any)
  return sr ? sr.report_no || (sr as any).service_report_no || '-' : '-'
}

function techNameOf(tech: any): string {
  if (!tech) return ''
  return tech.user?.name || tech.user?.username || tech.name || ''
}

function getTechnician(row: any) {
  const direct =
    row?.technician ||
    (row?.technician_id ? store.findTechnician(row.technician_id as any) : null)
  const directName = techNameOf(direct)
  if (directName) return directName
  // Fallback: teknisi dari service report terkait.
  const srTechId = row?.service_report?.technician_id
  const srTech =
    row?.service_report?.technician ||
    (srTechId ? store.findTechnician(srTechId as any) : null)
  return techNameOf(srTech) || '-'
}

async function handleCreatePO() {
  const request = poTarget.value
  if (!request || creatingId.value !== null) return
  const reason = poForm.reason.trim()
  if (!reason || !poForm.installation_date) {
    toast.error('Reason and installation date are required')
    return
  }
  creatingId.value = request.id
  try {
    const sr = (store.serviceReports.value as any[]).find((s: any) => String(s.id) === String(request.service_report_id))
      || request.service_report
    const customerId = sr?.customer_id || null
    const unitId = sr?.unit_id || null
    const serviceReportId = request.service_report_id || sr?.id || null
    const prod = request.product || store.findProduct(request.product_id)
    const unitPrice = request.unit_price || prod?.price || 0
    const qty = request.qty || 1

    await resources.create('purchaseOrders', {
      sparepart_request_id: request.id,
      service_report_id: serviceReportId,
      customer_id: customerId,
      unit_id: unitId,
      order_date: new Date().toISOString(),
      status: 'draft',
      reason,
      installation_date: `${poForm.installation_date}T00:00:00+07:00`,
      purchase_order_items: [
        {
          item_name: request.item_name || prod?.name || 'Sparepart',
          product_id: request.product_id,
          qty,
          unit_price: unitPrice,
          total_price: qty * unitPrice,
        }
      ]
    })
    await store.refreshInBackground()
    toast.success(`Request form created for ${request.request_no}`)
    showCreatePOModal.value = false
    poTarget.value = null
    router.push('/accounting/purchase-orders')
  } catch (err) {
    toast.error(toast.fromError(err, 'Failed to create request form'))
  } finally {
    creatingId.value = null
  }
}
</script>

<template>
  <div>
    <PageHeader title="Sparepart Requests (Procurement)" />

    <DataTable :columns="columns" :data="store.sparepartRequests.value" permission="service_sparepart"
      search-placeholder="Search requests...">
      <template #cell-product_id="{ row }">{{ getProduct(row) }}</template>
      <template #cell-service_report_id="{ row }">{{ getSR(row) }}</template>
      <template #cell-technician_id="{ row }">{{ getTechnician(row) }}</template>
      <template #cell-status="{ value }">
        <span class="badge" :class="{
          'badge-warning': value === 'pending',
          'badge-success': value === 'po_created' || value === 'completed',
          'badge-danger': value === 'rejected'
        }">
          {{ value || 'pending' }}
        </span>
      </template>
      <template #cell-created_at="{ value }">
        {{ new Date(value).toLocaleDateString() }}
      </template>
      <template #cell-actions="{ row }">
        <button v-if="row.status === 'pending' && can('purchase_order:create')" class="btn btn-sm btn-primary"
          :disabled="creatingId !== null" @click="openCreatePOModal(row)">
          {{ creatingId === row.id ? 'Creating...' : 'Create Request Form' }}
        </button>
        <span v-else class="text-muted text-sm">Processed</span>
      </template>
    </DataTable>

    <!-- Create Request Form Modal -->
    <FormModal :open="showCreatePOModal" title="Create Request Form" @close="closeCreatePOModal" @submit="handleCreatePO">
      <div class="form-group" style="margin-bottom: var(--space-md);">
        <label class="form-label" style="display: block; font-size: var(--font-size-sm); font-weight: 500; margin-bottom: 6px;">
          Reason <span style="color: var(--color-danger, #ef4444);">*</span>
        </label>
        <textarea
          v-model="poForm.reason"
          class="form-input"
          rows="3"
          required
          placeholder="Alasan pembuatan Request Form (misal: penggantian drum rusak sesuai rekomendasi teknisi)"
          style="width: 100%; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-family: inherit; font-size: var(--font-size-sm);"
        ></textarea>
      </div>
      <div class="form-group">
        <label class="form-label" style="display: block; font-size: var(--font-size-sm); font-weight: 500; margin-bottom: 6px;">
          Target Installation Date <span style="color: var(--color-danger, #ef4444);">*</span>
        </label>
        <input
          v-model="poForm.installation_date"
          type="date"
          class="form-input"
          required
          style="width: 100%; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-family: inherit; font-size: var(--font-size-sm);"
        />
      </div>
    </FormModal>
  </div>
</template>

<style scoped>
.mb-4 {
  margin-bottom: var(--space-lg);
}

.info-alert {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: var(--color-info-surface, #e0f2fe);
  color: var(--color-info, #0284c7);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

.info-alert svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.text-muted {
  color: var(--color-text-muted);
}

.text-sm {
  font-size: var(--font-size-xs);
}
</style>
