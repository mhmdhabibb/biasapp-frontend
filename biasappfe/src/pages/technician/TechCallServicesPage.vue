<script setup lang="ts">
// @ts-nocheck
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import PageHeader from '@/components/ui/PageHeader.vue'

const router = useRouter()
const { currentUser } = useAuth()
const {
  jobOrders,
  getTechnicianIdByUser,
  findCustomer,
  findUnit
} = useMasterStore()

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

const filteredJobs = computed(() => {
  return myJobs.value.filter(job => {
    if (filterStatus.value && job.status !== filterStatus.value) return false
    if (filterDate.value && !job.created_at.startsWith(filterDate.value)) return false
    if (filterCustomer.value) {
      const custId = job.customer_id || job.service_request?.customer_id
      const cust = findCustomer(custId)
      if (!cust || !cust.company_name.toLowerCase().includes(filterCustomer.value.toLowerCase())) return false
    }
    if (filterServiceNo.value && !(job.job_order_no || '').toLowerCase().includes(filterServiceNo.value.toLowerCase())) return false
    return true
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
})

function getCustomerName(id: number | null) {
  return findCustomer(id as any)?.company_name || '-'
}

function getUnitName(unitId: number | null) {
  const u = findUnit(unitId as any)
  return u ? u.model : '-'
}

function goToDetail(id: number) {
  router.push(`/technician/call-services/${id}`)
}
</script>

<template>
  <div class="tech-call-services">
    <PageHeader title="Call Service (Pekerjaan Saya)" />

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
          <label class="form-label">Tanggal</label>
          <input v-model="filterDate" type="date" class="form-input">
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Status</label>
          <select v-model="filterStatus" class="form-select">
            <option value="">Semua Status</option>
            <option value="pending">Pending</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Service No</th>
              <th>Customer</th>
              <th>Unit</th>
              <th>Tanggal</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="job in filteredJobs" :key="job.id">
              <td>{{ job.job_order_no }}</td>
              <td>{{ getCustomerName(job.customer_id || job.service_request?.customer_id) }}</td>
              <td>{{ getUnitName(job.unit_id || job.service_request?.unit_id) }}</td>
              <td>{{ new Date(job.created_at).toLocaleString('id-ID') }}</td>
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
              <td colspan="6" class="text-center py-lg text-muted">Tidak ada call service yang ditemukan.</td>
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
