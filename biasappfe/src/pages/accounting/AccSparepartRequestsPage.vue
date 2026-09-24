<script setup lang="ts">
// @ts-nocheck
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useRouter } from 'vue-router'
import type { TableColumn, SparepartRequest } from '@/types'

const store = useMasterStore()
const router = useRouter()

const columns: TableColumn[] = [
  { key: 'request_no', label: 'Request No' },
  { key: 'service_report_id', label: 'Service No' },
  { key: 'product_id', label: 'Sparepart' },
  { key: 'qty', label: 'Qty' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Date' },
  { key: 'actions', label: 'Action' }
]

function getProduct(id: number | null) {
  const p = store.findProduct(id as any)
  return p ? p.name : '-'
}

function getSR(id: number | null) {
  const sr = store.findServiceReport(id as any)
  return sr ? sr.service_report_no : '-'
}

function handleCreatePO(request: SparepartRequest) {
  // Mock logic to create a PO from the request
  const newPo = {
    id: Date.now(),
    po_no: `PO-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`,
    sparepart_request_id: request.id,
    po_date: new Date().toISOString(),
    status: 'draft',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
  
  // Also create a PO item
  const newPoItem = {
    id: Date.now(),
    purchase_order_id: newPo.id,
    product_id: request.product_id,
    qty: request.qty,
    unit_price: 150000, // Mock price
    total_price: 150000 * request.qty,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  store.purchaseOrders.value.push(newPo)
  
  // Update request status to po_created
  const reqIdx = store.sparepartRequests.value.findIndex(r => r.id === request.id)
  if (reqIdx !== -1) {
    store.sparepartRequests.value[reqIdx].status = 'po_created'
  }

  // Navigate to the PO page
  router.push('/accounting/purchase-orders')
}
</script>

<template>
  <div>
    <PageHeader title="Sparepart Requests (Procurement)" />
    
    <div class="info-alert mb-4">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span>These requests come from Customer Service. You can generate Purchase Orders (PO) for pending requests.</span>
    </div>

    <DataTable :columns="columns" :data="store.sparepartRequests.value" search-placeholder="Search requests...">
      <template #cell-product_id="{ value }">{{ getProduct(value) }}</template>
      <template #cell-service_report_id="{ value }">{{ getSR(value) }}</template>
      <template #cell-status="{ value }">
        <span class="badge" 
              :class="{
                'badge-warning': value === 'pending',
                'badge-success': value === 'po_created' || value === 'completed',
                'badge-danger': value === 'rejected'
              }">
          {{ value.toUpperCase() }}
        </span>
      </template>
      <template #cell-created_at="{ value }">
        {{ new Date(value).toLocaleDateString() }}
      </template>
      <template #cell-actions="{ row }">
        <button 
          v-if="row.status === 'pending'"
          class="btn btn-sm btn-primary"
          @click="handleCreatePO(row)"
        >
          Create PO
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
