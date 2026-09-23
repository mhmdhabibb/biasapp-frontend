<script setup lang="ts">
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useRouter } from 'vue-router'
import type { TableColumn, PurchaseOrder } from '@/types'
import { computed } from 'vue'

const store = useMasterStore()
const router = useRouter()

const columns: TableColumn[] = [
  { key: 'po_no', label: 'PO Number' },
  { key: 'po_date', label: 'Date' },
  { key: 'sparepart_request_id', label: 'Request Ref' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Action' }
]

function getRequestNo(id: number | null) {
  const req = store.sparepartRequests.value.find(r => r.id === id)
  return req ? req.request_no : '-'
}

function handleGenerateDO(po: PurchaseOrder) {
  // Mock logic to create a Delivery Order from the PO
  const newDo = {
    id: Date.now(),
    do_number: `DO-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`,
    purchase_order_id: po.id,
    do_date: new Date().toISOString(),
    status: 'draft',
    receiver_name: '',
    notes: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  store.procurementDeliveryOrders.value.push(newDo)
  
  // Update PO status
  const poIdx = store.purchaseOrders.value.findIndex(p => p.id === po.id)
  if (poIdx !== -1) {
    store.purchaseOrders.value[poIdx].status = 'do_created'
  }

  // Navigate to DO page
  router.push('/accounting/delivery-orders')
}

function updateStatus(po: PurchaseOrder, newStatus: string) {
  const idx = store.purchaseOrders.value.findIndex(p => p.id === po.id)
  if (idx !== -1) {
    store.purchaseOrders.value[idx].status = newStatus
  }
}
</script>

<template>
  <div>
    <PageHeader title="Purchase Orders" />
    
    <div class="info-alert mb-4">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span>Manage Purchase Orders generated from Sparepart Requests. Approved POs can be converted to Delivery Orders for receiving.</span>
    </div>

    <DataTable :columns="columns" :data="store.purchaseOrders.value" search-placeholder="Search purchase orders...">
      <template #cell-po_date="{ value }">
        {{ new Date(value).toLocaleDateString() }}
      </template>
      <template #cell-sparepart_request_id="{ value }">
        <span class="font-mono text-sm">{{ getRequestNo(value) }}</span>
      </template>
      <template #cell-status="{ value }">
        <span class="badge" 
              :class="{
                'badge-warning': value === 'draft' || value === 'submitted',
                'badge-success': value === 'approved' || value === 'do_created' || value === 'completed',
                'badge-danger': value === 'cancelled'
              }">
          {{ value.toUpperCase() }}
        </span>
      </template>
      <template #cell-actions="{ row }">
        <div class="action-group">
          <button 
            v-if="row.status === 'draft'"
            class="btn btn-sm btn-outline"
            @click="updateStatus(row, 'submitted')"
          >
            Submit
          </button>
          <button 
            v-if="row.status === 'submitted'"
            class="btn btn-sm btn-primary"
            @click="updateStatus(row, 'approved')"
          >
            Approve
          </button>
          <button 
            v-if="row.status === 'approved'"
            class="btn btn-sm btn-accent"
            @click="handleGenerateDO(row)"
          >
            Generate DO
          </button>
          <span v-if="['do_created', 'completed'].includes(row.status)" class="text-muted text-sm">
            DO Generated
          </span>
        </div>
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

.action-group {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
}

.font-mono {
  font-family: monospace;
}

.text-muted {
  color: var(--color-text-muted);
}
.text-sm {
  font-size: var(--font-size-xs);
}
</style>
