<script setup lang="ts">
// @ts-nocheck
import PageHeader from '@/components/ui/PageHeader.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAutoRefresh } from '@/composables/useAutoRefresh'

const router = useRouter()
const { currentUser } = useAuth()
const {
  jobOrders,
  getTechnicianIdByUser,
  findCustomer,
  findUnit } = useMasterStore()

useAutoRefresh(5000, ["jobOrders", "serviceReports", "technicians", "customers", "units"])

// service_report.technician_id references technicians.id, not users.id
const myTechId = computed(() => getTechnicianIdByUser(currentUser.value?.id || null))

// Backend service_type enum: regular, repair, maintenance, installation,
// emergency, meter_reading. Call service = anything that is not a scheduled
// maintenance or meter-reading job.
const myJobs = computed(() => {
  return jobOrders.value.filter(j => String(j.technician_id) === String(myTechId.value) && j.job_type !== 'maintenance' && j.job_type !== 'meter_reading')
})

const filterStatus = ref('')
const filterDate = ref('')
const filterCustomer = ref('')
const filterServiceNo = ref('')

function isDeliveryJob(job: any): boolean {
  if (!job) return false
  if (job.delivery_order_id) return true
  const d = job.delivery_order
  return !!d && (!!d.id || !!d.do_number)
}

function jobCustomerId(job: any) {
  return job.customer_id || job.service_request?.customer_id || job.delivery_order?.customer_id || job.delivery_order?.customer?.id || null
}

function jobUnitId(job: any) {
  return job.unit_id || job.service_request?.unit_id || null
}

function jobRefNo(job: any): string {
  return job.service_request?.request_no || job.delivery_order?.do_number || job.job_order_no || '-'
}

function jobDate(job: any): string {
  return job.scheduled_date || job.delivery_order?.delivery_date || job.created_at || ''
}

const filteredJobs = computed(() => {
  return myJobs.value.filter(job => {
    if (filterStatus.value && job.status !== filterStatus.value) return false
    if (filterDate.value && !(jobDate(job) || '').startsWith(filterDate.value)) return false
    if (filterCustomer.value) {
      const cust = findCustomer(jobCustomerId(job))
      if (!cust || !(cust.company_name || '').toLowerCase().includes(filterCustomer.value.toLowerCase())) return false
    }
    if (filterServiceNo.value) {
      const hay = `${job.job_order_no || ''} ${jobRefNo(job)}`.toLowerCase()
      if (!hay.includes(filterServiceNo.value.toLowerCase())) return false
    }
    return true
  }).sort((a, b) => new Date(jobDate(b)).getTime() - new Date(jobDate(a)).getTime())
})

function getCustomerName(id: number | null) {
  return findCustomer(id as any)?.company_name || '-'
}

function getUnitName(unitId: number | null) {
  const u = findUnit(unitId as any)
  return u ? u.model : '-'
}

const filterStatusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

function goToDetail(id: number) {
  router.push(`/technician/call-services/${id}`)
}
</script>

<template>
  <div class="tech-call-services">
    <PageHeader title="Call Service (My Jobs)" />

    <div class="card mb-lg p-lg">
      <div class="filters-grid">
        <div class="form-group mb-0">
          <label class="form-label">Service No</label>
          <input v-model="filterServiceNo" type="text" class="form-input" placeholder="Search service no...">
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Customer</label>
          <input v-model="filterCustomer" type="text" class="form-input" placeholder="Search customer...">
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Date</label>
          <input v-model="filterDate" type="date" class="form-input">
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Status</label>
          <CustomSelect v-model="filterStatus" class="form-select" :options="filterStatusOptions" />
        </div>
      </div>
    </div>

    <div class="card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Service No</th>
              <th>Type</th>
              <th>Customer</th>
              <th>Unit</th>
              <th>Scheduled / Delivery</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="job in filteredJobs" :key="job.id">
              <td>{{ jobRefNo(job) }}</td>
              <td>
                <span class="badge" :class="isDeliveryJob(job) ? 'badge-info' : 'badge-primary'">
                  {{ isDeliveryJob(job) ? 'DELIVERY' : 'SERVICE' }}
                </span>
              </td>
              <td>{{ getCustomerName(jobCustomerId(job)) }}</td>
              <td>{{ isDeliveryJob(job) ? '-' : getUnitName(jobUnitId(job)) }}</td>
              <td>{{ jobDate(job) ? new Date(jobDate(job)).toLocaleString('en-GB') : '-' }}</td>
              <td>
                <span class="badge" :class="'badge-' + (job.status === 'in_progress' ? 'info' : job.status === 'pending' || job.status === 'assigned' ? 'warning' : job.status === 'completed' ? 'success' : 'secondary')">
                  {{ job.status.toUpperCase().replace('_', ' ') }}
                </span>
              </td>
              <td>
                <button class="btn btn-sm btn-primary" @click="goToDetail(job.id)">Detail</button>
              </td>
            </tr>
            <tr v-if="filteredJobs.length === 0">
              <td colspan="7" class="text-center py-lg text-muted">No call service found.</td>
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
