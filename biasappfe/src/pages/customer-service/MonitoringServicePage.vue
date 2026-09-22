<script setup lang="ts">
import { ref, computed } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn, ServiceReport } from '@/types'

const {
  serviceReports,
  findCustomer,
  findContractItem,
  findUnit,
  findTechnician,
} = useMasterStore()

const columns: TableColumn[] = [
  { key: 'service_report_no', label: 'Service No' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'unit', label: 'Unit' },
  { key: 'machine_problem', label: 'Problem' },
  { key: 'technician_id', label: 'Technician' },
  { key: 'status', label: 'Status' },
  { key: 'sla', label: 'SLA' },
]

// Real-time SLA update logic (simple interval for display)
const now = ref(Date.now())
setInterval(() => { now.value = Date.now() }, 60000)

function getCustomerName(id: number | null) {
  const c = findCustomer(id)
  return c ? c.company_name || c.name : '-'
}

function getUnitName(contractItemId: number | null) {
  const ci = findContractItem(contractItemId)
  if (ci && ci.unit_id) {
    const u = findUnit(ci.unit_id)
    return u ? `${u.model} (${u.serial_no})` : '-'
  }
  return '-'
}

function getTechnicianName(id: number | null) {
  const t = findTechnician(id)
  return t ? t.name : '-'
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
    
    <DataTable :columns="columns" :data="serviceReports" search-placeholder="Search services...">
      <template #cell-customer_id="{ value }">
        {{ getCustomerName(value) }}
      </template>
      <template #cell-unit="{ item }">
        {{ getUnitName(item.contract_item_id) }}
      </template>
      <template #cell-machine_problem="{ value }">
        <span class="truncate-text" :title="value">{{ value }}</span>
      </template>
      <template #cell-technician_id="{ value }">
        {{ getTechnicianName(value) }}
      </template>
      
      <template #cell-status="{ value }">
        <span class="badge" 
          :class="{
            'badge-info': value === 'assigned' || value === 'open',
            'badge-warning': value === 'in_progress' || value === 'waiting_sparepart',
            'badge-success': value === 'completed',
            'badge-danger': value === 'cancelled'
          }">
          {{ value.toUpperCase().replace('_', ' ') }}
        </span>
      </template>
      
      <template #cell-sla="{ item }">
        <div class="sla-indicator" :class="`sla-${getSlaStatus(item)}`">
          <span class="sla-dot"></span>
          {{ formatSlaTime(item) }}
          <small v-if="item.status === 'completed'">(Final)</small>
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
