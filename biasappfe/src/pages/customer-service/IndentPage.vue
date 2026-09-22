<script setup lang="ts">
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn } from '@/types'

const { indents, findProduct } = useMasterStore()

const columns: TableColumn[] = [
  { key: 'indent_no', label: 'Indent No' },
  { key: 'sparepart_request_id', label: 'Request Ref' },
  { key: 'product_id', label: 'Sparepart' },
  { key: 'qty', label: 'Qty' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Date' },
]

function getProduct(id: number | null) {
  const p = findProduct(id)
  return p ? p.name : '-'
}
</script>

<template>
  <div>
    <PageHeader title="Indents (Backorders)" />
    <DataTable :columns="columns" :data="indents" search-placeholder="Search indents...">
      <template #cell-product_id="{ value }">{{ getProduct(value) }}</template>
      <template #cell-sparepart_request_id="{ item }">REQ-{{ item.sparepart_request_id || '-' }}</template>
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
