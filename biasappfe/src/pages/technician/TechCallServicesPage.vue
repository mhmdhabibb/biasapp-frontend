<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import PageHeader from '@/components/ui/PageHeader.vue'

const router = useRouter()
const { currentUser } = useAuth()
const {
  getServiceReportsByTechnician,
  findCustomer,
  findContractItem,
  findUnit
} = useMasterStore()

const myJobs = computed(() => {
  return getServiceReportsByTechnician(currentUser.value?.id || null).filter(j => j.service_type === 'call_service')
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
      const cust = findCustomer(job.customer_id)
      if (!cust || !cust.company_name.toLowerCase().includes(filterCustomer.value.toLowerCase())) return false
    }
    if (filterServiceNo.value && !job.service_report_no.toLowerCase().includes(filterServiceNo.value.toLowerCase())) return false
    return true
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
})

function getCustomerName(id: number | null) {
  return findCustomer(id)?.company_name || '-'
}

function getUnitName(contractItemId: number | null) {
  const ci = findContractItem(contractItemId)
  if (!ci) return '-'
  const u = findUnit(ci.unit_id)
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
            <option value="assigned">Assigned</option>
            <option value="on_progress">On Progress</option>
            <option value="waiting_sparepart">Waiting Sparepart</option>
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
              <td>{{ job.service_report_no }}</td>
              <td>{{ getCustomerName(job.customer_id) }}</td>
              <td>{{ getUnitName(job.contract_item_id) }}</td>
              <td>{{ new Date(job.created_at).toLocaleString('id-ID') }}</td>
              <td>
                <span class="badge" :class="'badge-' + (job.status === 'on_progress' ? 'info' : job.status === 'assigned' ? 'warning' : job.status === 'completed' ? 'success' : 'secondary')">
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
