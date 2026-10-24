<script setup lang="ts">
import DataTable from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import type { ServiceReport, TableColumn } from '@/types'
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const { canApprove } = usePermission()
const route = useRoute()
const { ensureResourcesLoaded } = useMasterStore()
const isLoading = ref(true)

onMounted(async () => {
  try {
    await ensureResourcesLoaded(route.path)
  } finally {
    isLoading.value = false
  }
})

const {
  serviceReports,
  findCustomer,
  findContractItem,
  findUnit,
  findProduct,
  findTechnician,
} = useMasterStore()

const columns: TableColumn[] = [
  { key: 'service_report_no', label: 'Service No' },
  { key: 'customer_id', label: 'Company' },
  { key: 'unit', label: 'Unit' },
  { key: 'serial_no', label: 'Serial Number' },
  { key: 'machine_problem', label: 'Problem' },
  { key: 'technician_id', label: 'Technician' },
  { key: 'status', label: 'Status' },
  { key: 'sla', label: 'SLA' },
]

// Real-time SLA update logic (simple interval for display)
const now = ref(Date.now())
setInterval(() => { now.value = Date.now() }, 60000)

function getCustomerName(row: any) {
  if (row?.customer?.company_name || row?.customer?.name) {
    return row.customer.company_name || row.customer.name
  }
  const c = findCustomer(row?.customer_id)
  return c ? c.company_name || c.name || '-' : '-'
}

function getUnitName(row: any) {
  if (row?.unit) {
    const brand = row.unit.brand?.name || row.unit.brand || ''
    const model = row.unit.model || row.unit.name || row.unit.unit_name || ''
    return `${brand} ${model}`.trim() || '-'
  }
  const unitId =
    row?.unit_id ||
    row?.contract_item?.unit_id ||
    findContractItem(row?.contract_item_id)?.unit_id ||
    row?.job_order?.unit_id ||
    row?.job_order?.service_request?.unit_id
  if (unitId) {
    const u = findUnit(unitId)
    if (u) {
      const brand = (u as any).brand?.name || (u as any).brand || ''
      const model = u.model || u.name || ''
      return `${brand} ${model}`.trim() || '-'
    }
    const p = findProduct(unitId)
    if (p) {
      return `[Consumable/Sparepart] ${p.name}`
    }
  }
  const prodId =
    row?.product_id ||
    row?.job_order?.product_id ||
    row?.job_order?.service_request?.product_id
  if (prodId) {
    const p = findProduct(prodId)
    if (p) return `[Consumable/Sparepart] ${p.name}`
  }
  const sr = row?.job_order?.service_request
  if (sr?.is_external) {
    return `${sr.external_brand || ''} ${sr.external_model || ''} (Eksternal)`.trim() || '-'
  }
  return '-'
}

function getUnitSerialNo(row: any) {
  if (row?.unit?.serial_no) return row.unit.serial_no
  const unitId =
    row?.unit_id ||
    row?.contract_item?.unit_id ||
    findContractItem(row?.contract_item_id)?.unit_id ||
    row?.job_order?.unit_id ||
    row?.job_order?.service_request?.unit_id
  if (unitId) {
    const u = findUnit(unitId)
    if (u?.serial_no) return u.serial_no
    const p = findProduct(unitId)
    if (p?.sku) return p.sku
  }
  const prodId =
    row?.product_id ||
    row?.job_order?.product_id
  if (prodId) {
    const p = findProduct(prodId)
    if (p?.sku) return p.sku
  }
  const sr = row?.job_order?.service_request
  if (sr?.external_serial_no) return sr.external_serial_no
  return '-'
}

function getTechnicianName(row: any) {
  if (row?.technician?.name) return row.technician.name
  if (row?.technician?.user?.name) return row.technician.user.name
  if (row?.technician_name) return row.technician_name
  if (row?.technician_id) {
    const t = findTechnician(row.technician_id)
    if (t?.name) return t.name
    if ((t as any)?.user?.name) return (t as any).user.name
  }
  if (row?.job_order?.technician?.name) return row.job_order.technician.name
  return '-'
}

function getSlaStatus(report: ServiceReport) {
  const start = new Date(report.created_at).getTime()
  const end = report.status === 'completed' ? new Date(report.updated_at).getTime() : now.value
  const elapsedMs = end - start
  const elapsedHours = elapsedMs / (1000 * 60 * 60)
  
  if (elapsedHours > 2) return 'breached'
  if (elapsedHours > 1.5) return 'warning'
  return 'safe'
}

function formatSlaTime(report: ServiceReport) {
  const start = new Date(report.created_at).getTime()
  const end = report.status === 'completed' ? new Date(report.updated_at).getTime() : now.value
  const elapsedMs = end - start
  
  const h = Math.floor(elapsedMs / 3600000)
  const m = Math.floor((elapsedMs % 3600000) / 60000)
  return `${h}h ${m}m`
}
</script>

<template>
  <div>
    <PageHeader title="Monitoring Service" />
    
    <DataTable :columns="columns" :data="serviceReports" :loading="isLoading" permission="service_report" search-placeholder="Search services...">
      <template #cell-service_report_no="{ row, value }">
        <span style="font-weight: 600; color: var(--color-primary);">
          {{ value || row.report_no || row.job_order?.job_order_no || (row.id ? 'SR-' + String(row.id).slice(0, 8).toUpperCase() : '-') }}
        </span>
      </template>

      <template #cell-customer_id="{ row }">
        {{ getCustomerName(row) }}
      </template>

      <template #cell-unit="{ row }">
        {{ getUnitName(row) }}
      </template>

      <template #cell-serial_no="{ row }">
        {{ getUnitSerialNo(row) }}
      </template>

      <template #cell-machine_problem="{ value }">
        <span class="truncate-text" :title="value">{{ value || '-' }}</span>
      </template>

      <template #cell-technician_id="{ row }">
        {{ getTechnicianName(row) }}
      </template>
      
      <template #cell-status="{ value }">
        <span class="badge" 
          :class="{
            'badge-info': value === 'assigned' || value === 'open',
            'badge-warning': value === 'in_progress' || value === 'waiting_sparepart',
            'badge-success': value === 'completed',
            'badge-danger': value === 'cancelled'
          }">
          {{ (value || 'PENDING').toUpperCase().replace('_', ' ') }}
        </span>
      </template>
      
      <template #cell-sla="{ row }">
        <div class="sla-indicator" :class="`sla-${getSlaStatus(row)}`">
          <span class="sla-dot"></span>
          {{ formatSlaTime(row) }}
          <small v-if="row.status === 'completed'">(Final)</small>
        </div>
      </template>
    </DataTable>
  </div>
</template>

<style scoped>
.truncate-text {
  display: inline-block;
  max-width: 150px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
}

.sla-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.sla-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.sla-safe { color: var(--color-success); }
.sla-safe .sla-dot { background-color: var(--color-success); }

.sla-warning { color: #f59e0b; }
.sla-warning .sla-dot { background-color: #f59e0b; }

.sla-breached { color: var(--color-danger); font-weight: bold; }
.sla-breached .sla-dot { background-color: var(--color-danger); }

small {
  color: var(--color-text-muted);
  font-weight: normal;
  font-size: 0.75rem;
}
</style>
