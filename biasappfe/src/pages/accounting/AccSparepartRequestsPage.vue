<script setup lang="ts">
// @ts-nocheck
import DataTable from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { useResourcesStore } from '@/stores/resources.store'
import type { SparepartRequest, TableColumn } from '@/types'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const { can } = usePermission()
const store = useMasterStore()
const resources = useResourcesStore()
const toast = useToast()
const router = useRouter()

const creatingId = ref<string | number | null>(null)

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

async function handleCreatePO(request: SparepartRequest) {
  if (creatingId.value !== null) return
  creatingId.value = request.id
  try {
    // The API derives the PO number, line item (product + qty + price) and
    // flips this request to `po_created`.
    await resources.create('purchaseOrders', {
      sparepart_request_id: request.id,
      order_date: new Date().toISOString(),
      status: 'draft'
    })
    await store.refreshInBackground()
    toast.success(`Purchase order created for ${request.request_no}`)
    router.push('/accounting/purchase-orders')
  } catch (err) {
    toast.error(toast.fromError(err, 'Failed to create purchase order'))
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
          :disabled="creatingId !== null" @click="handleCreatePO(row)">
          {{ creatingId === row.id ? 'Creating...' : 'Create PO' }}
        </button>
        <span v-else class="text-muted text-sm">Processed</span>
      </template>
    </DataTable>
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
