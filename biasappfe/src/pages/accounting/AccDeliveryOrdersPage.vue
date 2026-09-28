<script setup lang="ts">
// @ts-nocheck
import { ref } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useResourcesStore } from '@/stores/resources.store'
import { useToast } from '@/composables/useToast'
import { usePermission } from '@/composables/usePermission'
import type { TableColumn, ProcurementDeliveryOrder } from '@/types'

const toast = useToast()
const { can } = usePermission()
const store = useMasterStore()
const resources = useResourcesStore()

const busyId = ref<string | number | null>(null)

const columns: TableColumn[] = [
  { key: 'do_number', label: 'DO Number' },
  { key: 'delivery_date', label: 'Date' },
  { key: 'purchase_order_id', label: 'PO Ref' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Action' }
]

function getPONo(id: number | null) {
  const po = store.purchaseOrders.value.find(p => p.id === id)
  return po ? po.po_no : '-'
}

async function updateStatus(doItem: ProcurementDeliveryOrder, newStatus: string) {
  if (busyId.value !== null) return
  busyId.value = doItem.id
  try {
    await resources.update('deliveryOrders', String(doItem.id), { status: newStatus })
    await store.refresh(true)
    if (newStatus === 'received') {
      toast.success(`DO ${doItem.do_number} diterima. Stok inventori telah diperbarui.`)
    }
  } catch (err) {
    toast.error(toast.fromError(err, 'Gagal memperbarui delivery order'))
  } finally {
    busyId.value = null
  }
}

// Receiving books the delivered quantities into inventory (server side).
function handleReceiveDO(doItem: ProcurementDeliveryOrder) {
  return updateStatus(doItem, 'received')
}
</script>

<template>
  <div>
    <PageHeader title="Delivery Orders (Inbound)" />

    <div class="info-alert mb-4">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span>Track inbound shipments for sparepart procurement. Marking a DO as "Received" will automatically update inventory stock.</span>
    </div>

    <DataTable :columns="columns" :data="store.procurementDeliveryOrders.value" permission="delivery_order" search-placeholder="Search delivery orders...">
      <template #cell-delivery_date="{ value }">
        {{ value ? new Date(value).toLocaleDateString() : '-' }}
      </template>
      <template #cell-purchase_order_id="{ value }">
        <span class="font-mono text-sm">{{ getPONo(value) }}</span>
      </template>
      <template #cell-status="{ value }">
        <span class="badge"
              :class="{
                'badge-warning': value === 'draft' || value === 'pending',
                'badge-info': value === 'issued',
                'badge-success': value === 'received',
                'badge-danger': value === 'cancelled'
              }">
          {{ (value || '').toUpperCase() }}
        </span>
      </template>
      <template #cell-actions="{ row }">
        <div class="action-group">
          <button
            v-if="row.status === 'draft' && can('delivery_order:update')"
            class="btn btn-sm btn-outline"
            :disabled="busyId === row.id"
            @click="updateStatus(row, 'issued')"
          >
            Issue
          </button>
          <button
            v-if="row.status === 'issued' && can('delivery_order:update')"
            class="btn btn-sm btn-success"
            :disabled="busyId === row.id"
            @click="handleReceiveDO(row)"
          >
            {{ busyId === row.id ? 'Saving...' : 'Mark Received' }}
          </button>
          <span v-if="row.status === 'received'" class="text-success font-medium text-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline; margin-bottom:2px;">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Stock Updated
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
.text-success {
  color: var(--color-success);
}
.font-medium {
  font-weight: var(--font-weight-medium);
}
.btn-success {
  background: var(--color-success);
  color: white;
  border-color: var(--color-success);
}
.btn-success:hover {
  background: var(--color-success-hover, #15803d);
}
</style>
