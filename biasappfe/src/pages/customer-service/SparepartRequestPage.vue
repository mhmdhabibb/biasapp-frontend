<script setup lang="ts">
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn } from '@/types'

const { sparepartRequests, findProduct, findServiceReport } = useMasterStore()

const columns: TableColumn[] = [
  { key: 'request_no', label: 'Request No' },
  { key: 'service_report_id', label: 'Service No' },
  { key: 'product_id', label: 'Sparepart' },
  { key: 'qty', label: 'Qty' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Date' },
]

function getProduct(id: number | null) {
  const p = findProduct(id)
  return p ? p.name : '-'
}

function getSR(id: number | null) {
  const sr = findServiceReport(id)
  return sr ? sr.service_report_no : '-'
}
</script>

<template>
  <div>
    <PageHeader title="Sparepart Requests" button-label="New Request" />
    <DataTable :columns="columns" :data="sparepartRequests" search-placeholder="Search requests...">
      <template #cell-product_id="{ value }">{{ getProduct(value) }}</template>
      <template #cell-service_report_id="{ value }">{{ getSR(value) }}</template>
      <template #cell-status="{ value }">
        <span class="badge" :class="value === 'approved' ? 'badge-success' : value === 'rejected' ? 'badge-danger' : 'badge-warning'">
          {{ value.toUpperCase() }}
        </span>
      </template>
      <template #cell-created_at="{ value }">
        {{ new Date(value).toLocaleDateString() }}
      </template>
    </DataTable>
  </div>
</template>
