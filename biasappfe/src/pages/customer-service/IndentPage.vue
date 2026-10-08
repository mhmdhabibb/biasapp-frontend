<script setup lang="ts">
import DataTable from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import type { TableColumn } from '@/types'

const { canApprove } = usePermission()

const { indents, findProduct, sparepartRequests } = useMasterStore()

const columns: TableColumn[] = [
  { key: 'indent_no', label: 'Indent No' },
  { key: 'sparepart_request_id', label: 'Request Ref' },
  { key: 'product_id', label: 'Sparepart' },
  { key: 'qty', label: 'Qty' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Date' },
]

function getProduct(row: any) {
  const id = row?.product_id ?? row
  return (
    (row as any)?.product?.name ||
    findProduct(id as any)?.name ||
    '-'
  )
}

function getRequestRef(row: any) {
  const nested = (row as any)?.sparepart_request
  if (nested?.request_no) return nested.request_no
  const req = (sparepartRequests.value as any[]).find(
    (r: any) => String(r.id) === String(row?.sparepart_request_id),
  )
  return req?.request_no || '-'
}
</script>

<template>
  <div>
    <PageHeader title="Indents (Backorders)" />
    <DataTable :columns="columns" :data="indents" permission="service_sparepart" search-placeholder="Search indents...">
      <template #cell-product_id="{ row }">{{ getProduct(row) }}</template>
      <template #cell-sparepart_request_id="{ row }">{{ getRequestRef(row) }}</template>
      <template #cell-status="{ value }">
        <span class="badge" :class="value === 'arrived' ? 'badge-success' : 'badge-warning'">
          {{ value.toUpperCase() }}
        </span>
      </template>
      <template #cell-created_at="{ value }">
        {{ new Date(value).toLocaleDateString() }}
      </template>
    </DataTable>
  </div>
</template>
