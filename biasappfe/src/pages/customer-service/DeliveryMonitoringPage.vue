<script setup lang="ts">
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn } from '@/types'

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
    </DataTable>
  </div>
</template>
