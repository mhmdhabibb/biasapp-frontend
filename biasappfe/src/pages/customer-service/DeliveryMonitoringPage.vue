<script setup lang="ts">
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { hasDeliveryHistory, printDeliveryServiceHistory } from '@/utils/printDeliveryHistory'
import type { TableColumn } from '@/types'

const toast = useToast()
const { can } = usePermission()
const { deliveryOrders, findCustomer, findTechnician } = useMasterStore()

const columns: TableColumn[] = [
  { key: 'delivery_no', label: 'Delivery No' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'contract_item_id', label: 'Contract Ref' },
  { key: 'assigned_to', label: 'Assigned Technician' },
  { key: 'delivery_date', label: 'Delivery Date' },
  { key: 'status', label: 'Status' },
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

import { ref, reactive } from 'vue'
import FormModal from '@/components/ui/FormModal.vue'
import SignaturePad from '@/components/ui/SignaturePad.vue'
import { useResourcesStore } from '@/stores/resources.store'

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
    toast.error('Failed to update')
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
    toast.error('Failed to update status')
  }
}
</script>

<template>
  <div>
    <PageHeader title="Delivery & Installation Monitoring" />
    <DataTable :columns="columns" :data="deliveryOrders" search-placeholder="Search delivery...">
      <template #cell-customer_id="{ value }">{{ getCustomer(value) }}</template>
      <template #cell-assigned_to="{ value }">{{ getTechnician(value) }}</template>
      <template #cell-status="{ value }">
        <span class="badge" :class="value === 'delivered' ? 'badge-success' : value === 'in_transit' ? 'badge-info' : 'badge-warning'">
          {{ value.toUpperCase().replace('_', ' ') }}
        </span>
      </template>
      <template #cell-delivery_date="{ value }">
        {{ value ? new Date(value).toLocaleDateString() : '-' }}
      </template>
      <template #actions="{ row }">
        <button v-if="can('delivery_order:update')" class="btn btn-sm btn-outline" @click="openEdit(row)">Edit Report</button>
        <button v-if="can('delivery_order:update') && String(row.status || '').toLowerCase() !== 'delivered'" class="btn btn-sm btn-outline" style="margin-left: 0.5rem;" @click="markDelivered(row)">Mark Delivered</button>
        <button v-if="can('delivery_order:read') && hasDeliveryHistory(row) && String(row.do_type || '').toLowerCase() !== 'inbound'" class="btn btn-sm btn-outline" style="margin-left: 0.5rem;" @click="printServiceHistory(row)">Print Service History</button>
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
  </div>
</template>
