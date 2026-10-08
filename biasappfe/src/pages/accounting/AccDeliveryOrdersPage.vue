<script setup lang="ts">
// @ts-nocheck
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { useResourcesStore } from '@/stores/resources.store'
import type { ProcurementDeliveryOrder, TableColumn } from '@/types'
import { reactive, ref } from 'vue'

const toast = useToast()
const { can } = usePermission()
const store = useMasterStore()
const resources = useResourcesStore()

const busyId = ref<string | number | null>(null)
const detailItem = ref<ProcurementDeliveryOrder | null>(null)
const editingItem = ref<ProcurementDeliveryOrder | null>(null)
const deletingItem = ref<ProcurementDeliveryOrder | null>(null)
const showDetail = ref(false)
const showEdit = ref(false)
const showDelete = ref(false)
const editForm = reactive({
  delivery_date: '',
  recipient_name: '',
  recipient_phone: '',
  delivery_address: '',
  notes: '',
})

const columns: TableColumn[] = [
  { key: 'do_number', label: 'DO Number' },
  { key: 'do_type', label: 'Type' },
  { key: 'delivery_date', label: 'Date' },
  { key: 'purchase_order_id', label: 'PO Ref' },
  { key: 'status', label: 'Status' }
]

function getPONo(id: number | null) {
  const po = store.purchaseOrders.value.find(p => p.id === id)
  return po ? po.po_no : '-'
}

function getReference(item: ProcurementDeliveryOrder) {
  if (item.rental?.rental_no) return item.rental.rental_no
  if (item.purchase_order_id) return getPONo(item.purchase_order_id)
  return '-'
}

function getDeliveryItemName(item: NonNullable<ProcurementDeliveryOrder['delivery_order_items']>[number]) {
  if (item.product?.name) return item.product.name
  if (item.product_id) return store.findProduct(item.product_id)?.name || `Product ${item.product_id}`
  if (item.unit) return `${item.unit.model || 'Unit'}${item.unit.serial_no ? ` (${item.unit.serial_no})` : ''}`
  if (item.unit_id) {
    const unit = store.findUnit(item.unit_id)
    return unit ? `${unit.model}${unit.serial_no ? ` (${unit.serial_no})` : ''}` : `Unit ${item.unit_id}`
  }
  return '-'
}

function openDetail(item: ProcurementDeliveryOrder) {
  detailItem.value = item
  showDetail.value = true
}

function openEdit(item: ProcurementDeliveryOrder) {
  editingItem.value = item
  Object.assign(editForm, {
    delivery_date: item.delivery_date ? new Date(item.delivery_date).toISOString().slice(0, 10) : '',
    recipient_name: item.recipient_name || '',
    recipient_phone: item.recipient_phone || '',
    delivery_address: item.delivery_address || '',
    notes: item.notes || '',
  })
  showEdit.value = true
}

async function saveDeliveryOrder() {
  if (!editingItem.value || busyId.value !== null) return
  busyId.value = editingItem.value.id
  try {
    await resources.update('deliveryOrders', String(editingItem.value.id), {
      delivery_date: editForm.delivery_date ? `${editForm.delivery_date}T00:00:00Z` : undefined,
      recipient_name: editForm.recipient_name,
      recipient_phone: editForm.recipient_phone,
      delivery_address: editForm.delivery_address,
      notes: editForm.notes,
    })
    await store.refreshInBackground()
    showEdit.value = false
    toast.success(`DO ${editingItem.value.do_number} updated successfully.`)
  } catch (err) {
    toast.error(toast.fromError(err, 'Failed to update delivery order'))
  } finally {
    busyId.value = null
  }
}

function openDelete(item: ProcurementDeliveryOrder) {
  deletingItem.value = item
  showDelete.value = true
}

async function deleteDeliveryOrder() {
  if (!deletingItem.value || busyId.value !== null) return
  busyId.value = deletingItem.value.id
  try {
    await resources.remove('deliveryOrders', String(deletingItem.value.id))
    await store.refreshInBackground()
    toast.success(`DO ${deletingItem.value.do_number} deleted successfully.`)
  } catch (err) {
    toast.error(toast.fromError(err, 'Failed to delete delivery order'))
  } finally {
    busyId.value = null
    showDelete.value = false
    deletingItem.value = null
  }
}

async function updateStatus(doItem: ProcurementDeliveryOrder, newStatus: string) {
  if (busyId.value !== null) return
  busyId.value = doItem.id
  try {
    await resources.update('deliveryOrders', String(doItem.id), { status: newStatus })
    await store.refreshInBackground()
    if (newStatus === 'received') {
      toast.success(`DO ${doItem.do_number} received. Inventory stock has been updated.`)
    } else if (newStatus === 'delivered' || newStatus === 'completed') {
      toast.success(`DO ${doItem.do_number} completed successfully.`)
    }
  } catch (err) {
    toast.error(toast.fromError(err, 'Failed to update delivery order'))
  } finally {
    busyId.value = null
  }
}

// Receiving books the delivered quantities into inventory (server side).
function handleReceiveDO(doItem: ProcurementDeliveryOrder) {
  const newStatus = doItem.do_type === 'inbound' ? 'received' : 'delivered'
  return updateStatus(doItem, newStatus)
}
</script>

<template>
  <div>
    <PageHeader title="Delivery Orders" />

    <div class="info-alert mb-4">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span>Manage all Delivery Orders (Inbound and Outbound).</span>
    </div>

    <DataTable :columns="columns" :data="store.deliveryOrders.value" permission="delivery_order" search-placeholder="Search delivery orders..." @row-click="openDetail">
      <template #cell-do_type="{ value }">
        <span class="badge badge-info">{{ (value || '').toUpperCase() }}</span>
      </template>
      <template #cell-delivery_date="{ value }">
        {{ (value && new Date(value).getFullYear() > 2000) ? new Date(value).toLocaleDateString() : '-' }}
      </template>
      <template #cell-purchase_order_id="{ value }">
        <span class="font-mono text-sm">{{ getPONo(value) }}</span>
      </template>
      <template #cell-status="{ value }">
        <span class="badge"
              :class="{
                'badge-warning': value === 'draft' || value === 'pending',
                'badge-info': value === 'issued' || value === 'shipped',
                'badge-success': value === 'received' || value === 'delivered' || value === 'completed',
                'badge-danger': value === 'cancelled'
              }">
          {{ (value || '').toUpperCase() }}
        </span>
      </template>
      <template #actions="{ row }">
        <div class="action-group">
          <button
            v-if="can('delivery_order:update')"
            class="action-btn action-btn--edit"
            title="Update"
            aria-label="Update delivery order"
            :disabled="busyId === row.id"
            @click="openEdit(row)"
          >
            <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
            </svg>
          </button>
          <button
            v-if="can('delivery_order:delete')"
            class="action-btn action-btn--delete"
            title="Delete"
            aria-label="Delete delivery order"
            :disabled="busyId === row.id"
            @click="openDelete(row)"
          >
            <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="m19 6-1 14H6L5 6" />
              <path d="M10 11v5M14 11v5" />
            </svg>
          </button>
          <button
            v-if="row.status === 'draft' && can('delivery_order:update')"
            class="btn btn-sm btn-outline"
            :disabled="busyId === row.id"
            @click="updateStatus(row, 'issued')"
          >
            Issue
          </button>
          <button
            v-if="(row.status === 'issued' || row.status === 'shipped') && can('delivery_order:update')"
            class="btn btn-sm btn-success"
            :disabled="busyId === row.id"
            @click="handleReceiveDO(row)"
          >
            {{ busyId === row.id ? 'Saving...' : (row.do_type === 'inbound' ? 'Mark Received' : 'Mark Delivered') }}
          </button>
          <span v-if="row.status === 'received' || row.status === 'delivered' || row.status === 'completed'" class="text-success font-medium text-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline; margin-bottom:2px;">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            {{ row.do_type === 'inbound' ? 'Stock Updated' : 'Completed' }}
          </span>
        </div>
      </template>
    </DataTable>

    <FormModal :open="showDetail" :title="detailItem ? `Delivery Order ${detailItem.do_number}` : 'Delivery Order Detail'" max-width="640px" @close="showDetail = false">
      <template v-if="detailItem">
        <div class="detail-grid">
          <div class="detail-field"><span>DO Number</span><strong>{{ detailItem.do_number }}</strong></div>
          <div class="detail-field"><span>Type</span><strong>{{ (detailItem.do_type || '-').toUpperCase() }}</strong></div>
          <div class="detail-field"><span>Date</span><strong>{{ detailItem.delivery_date ? new Date(detailItem.delivery_date).toLocaleDateString() : '-' }}</strong></div>
          <div class="detail-field"><span>{{ detailItem.rental_id ? 'Rental Reference' : 'PO Reference' }}</span><strong>{{ getReference(detailItem) }}</strong></div>
          <div class="detail-field"><span>Status</span><strong>{{ (detailItem.status || '-').toUpperCase() }}</strong></div>
          <div class="detail-field"><span>Recipient</span><strong>{{ detailItem.recipient_name || '-' }}</strong></div>
          <div class="detail-field"><span>Phone</span><strong>{{ detailItem.recipient_phone || '-' }}</strong></div>
          <div class="detail-field detail-field--wide"><span>Delivery Address</span><strong>{{ detailItem.delivery_address || '-' }}</strong></div>
          <div class="detail-field detail-field--wide"><span>Notes</span><strong>{{ detailItem.notes || '-' }}</strong></div>
        </div>
        <section class="detail-items">
          <h4>Delivery Items</h4>
          <div class="detail-items-table-wrap">
            <table class="detail-items-table">
              <thead>
                <tr><th>Item</th><th>Qty</th><th>Remarks</th></tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in detailItem.delivery_order_items || []" :key="item.id || index">
                  <td>{{ getDeliveryItemName(item) }}</td>
                  <td>{{ item.qty || 1 }}</td>
                  <td>{{ item.remarks || '-' }}</td>
                </tr>
                <tr v-if="!detailItem.delivery_order_items?.length">
                  <td colspan="3" class="detail-items-empty">No delivery items</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
      <template #footer>
        <button type="button" class="btn btn-outline" @click="showDetail = false">Close</button>
      </template>
    </FormModal>

    <FormModal :open="showEdit" :title="editingItem ? `Update ${editingItem.do_number}` : 'Update Delivery Order'" max-width="560px" @close="showEdit = false" @submit="saveDeliveryOrder">
      <div class="form-group">
        <label class="form-label" for="do-delivery-date">Delivery Date</label>
        <input id="do-delivery-date" v-model="editForm.delivery_date" type="date" class="form-input">
      </div>
      <div class="form-group">
        <label class="form-label" for="do-recipient">Recipient</label>
        <input id="do-recipient" v-model="editForm.recipient_name" type="text" class="form-input">
      </div>
      <div class="form-group">
        <label class="form-label" for="do-phone">Recipient Phone</label>
        <input id="do-phone" v-model="editForm.recipient_phone" type="tel" class="form-input">
      </div>
      <div class="form-group">
        <label class="form-label" for="do-address">Delivery Address</label>
        <textarea id="do-address" v-model="editForm.delivery_address" class="form-textarea" rows="3"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label" for="do-notes">Notes</label>
        <textarea id="do-notes" v-model="editForm.notes" class="form-textarea" rows="3"></textarea>
      </div>
    </FormModal>

    <ConfirmDialog
      :open="showDelete"
      title="Delete Delivery Order"
      :message="`Delete delivery order ${deletingItem?.do_number || ''}?`"
      @close="showDelete = false"
      @confirm="deleteDeliveryOrder"
    />
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

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.detail-field {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
}

.detail-field span {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.detail-field strong {
  overflow-wrap: anywhere;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.detail-field--wide {
  grid-column: 1 / -1;
}

.detail-items {
  margin-top: 8px;
}

.detail-items h4 {
  margin: 0 0 10px;
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.detail-items-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
}

.detail-items-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

.detail-items-table th,
.detail-items-table td {
  padding: 9px 11px;
  border-bottom: 1px solid var(--color-border-light);
  text-align: left;
}

.detail-items-table th {
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  font-weight: var(--font-weight-medium);
}

.detail-items-table tr:last-child td {
  border-bottom: 0;
}

.detail-items-empty {
  color: var(--color-text-muted);
  text-align: center !important;
}

@media (max-width: 520px) {
  .detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }
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
