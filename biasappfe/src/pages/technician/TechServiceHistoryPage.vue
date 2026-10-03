<script setup lang="ts">
// @ts-nocheck
import { ref, computed } from 'vue'
import { useMasterStore } from '@/composables/useMasterStore'
import PageHeader from '@/components/ui/PageHeader.vue'

const {
  serviceReports,
  findCustomer,
  findUnit,
  findTechnician
} = useMasterStore()

// Service History shows all COMPLETED service reports, maybe filtered by this tech or all history
// The goal: so Technicians can see unit problem history before servicing.
// So we should show ALL history, regardless of which tech did it.
const completedJobs = computed(() => {
  return serviceReports.value.filter(j => j.status === 'completed')
})

const filterCustomer = ref('')
const filterUnit = ref('')
const filterType = ref('')

const filteredHistory = computed(() => {
  return completedJobs.value.filter(job => {
    if (filterType.value && job.service_type !== filterType.value) return false
    
    if (filterCustomer.value) {
      const cust = findCustomer(job.customer_id)
      if (!cust || !cust.company_name.toLowerCase().includes(filterCustomer.value.toLowerCase())) return false
    }
    
    if (filterUnit.value) {
      const u = findUnit(job.unit_id as any)
      const sn = u?.serial_no || ''
      const mdl = u?.model || ''
      if (!sn.toLowerCase().includes(filterUnit.value.toLowerCase()) && !mdl.toLowerCase().includes(filterUnit.value.toLowerCase())) {
        return false
      }
    }
    return true
  }).sort((a, b) => new Date(b.time_out || b.updated_at).getTime() - new Date(a.time_out || a.updated_at).getTime())
})

const SERVICE_TYPE_LABELS: Record<string, string> = {
  regular: 'Regular',
  repair: 'Repair',
  maintenance: 'Maintenance',
  installation: 'Installation',
  emergency: 'Emergency',
  meter_reading: 'Meter Reading'
}

function getServiceTypeLabel(type: string) {
  return SERVICE_TYPE_LABELS[type] || type || '-'
}

function getCustomerName(id: number | null) {
  return findCustomer(id as any)?.company_name || '-'
}

function getUnitName(unitId: number | null) {
  const u = findUnit(unitId as any)
  return u ? `${u.model} (${u.serial_no})` : '-'
}

function getTechName(id: number | null) {
  const t: any = findTechnician(id)
  return t?.user?.name || t?.name || '-'
}
</script>

<template>
  <div class="tech-history">
    <PageHeader title="Service History" />

    <div class="card mb-lg p-lg">
      <div class="filters-grid">
        <div class="form-group mb-0">
          <label class="form-label">Customer</label>
          <input v-model="filterCustomer" type="text" class="form-input" placeholder="Search customer...">
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Unit / Serial No</label>
          <input v-model="filterUnit" type="text" class="form-input" placeholder="Search model or SN...">
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Service Type</label>
          <select v-model="filterType" class="form-select">
            <option value="">All Types</option>
            <option value="regular">Regular</option>
            <option value="repair">Repair</option>
            <option value="maintenance">Maintenance</option>
            <option value="installation">Installation</option>
            <option value="emergency">Emergency</option>
            <option value="meter_reading">Meter Reading</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Completion Date</th>
              <th>Customer</th>
              <th>Unit & SN</th>
              <th>Service Type</th>
              <th>Action / Result</th>
              <th>Technician</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="job in filteredHistory" :key="job.id">
              <td>{{ job.time_out ? new Date(job.time_out).toLocaleString('en-GB') : '-' }}</td>
              <td>{{ getCustomerName(job.customer_id) }}</td>
              <td>{{ getUnitName(job.unit_id) }}</td>
              <td>
                <span class="badge" :class="job.service_type === 'maintenance' ? 'badge-info' : job.service_type === 'meter_reading' ? 'badge-secondary' : 'badge-primary'">
                  {{ getServiceTypeLabel(job.service_type) }}
                </span>
              </td>
              <td>
                <div class="text-sm">
                  <strong>Problem:</strong> {{ job.machine_problem || '-' }}<br>
                  <strong>Repair:</strong> {{ job.repair_action || '-' }}
                </div>
              </td>
              <td>{{ getTechName(job.technician_id) }}</td>
            </tr>
            <tr v-if="filteredHistory.length === 0">
              <td colspan="6" class="text-center py-lg text-muted">No service history matching the filter.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-md);
  align-items: end;
}
</style>
