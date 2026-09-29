<script setup lang="ts">
// @ts-nocheck
import { ref, computed } from 'vue'
import { useMasterStore } from '@/composables/useMasterStore'
import PageHeader from '@/components/ui/PageHeader.vue'

const {
  serviceReports,
  findCustomer,
  findContractItem,
  findUnit,
  findTechnician
} = useMasterStore()

// Service History shows all COMPLETED service reports, maybe filtered by this tech or all history
// The prompt says: "Tujuannya agar Teknisi dapat mengetahui histori masalah unit sebelum melakukan service."
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
      const ci = findContractItem(job.contract_item_id)
      const u = ci ? findUnit(ci.unit_id) : null
      const sn = u?.serial_no || ''
      const mdl = u?.model || ''
      if (!sn.toLowerCase().includes(filterUnit.value.toLowerCase()) && !mdl.toLowerCase().includes(filterUnit.value.toLowerCase())) {
        return false
      }
    }
    return true
  }).sort((a, b) => new Date(b.time_out || b.updated_at).getTime() - new Date(a.time_out || a.updated_at).getTime())
})

function getCustomerName(id: number | null) {
  return findCustomer(id as any)?.company_name || '-'
}

function getUnitName(contractItemId: number | null) {
  const ci = findContractItem(contractItemId)
  if (!ci) return '-'
  const u = findUnit(ci.unit_id)
  return u ? `${u.model} (${u.serial_no})` : '-'
}

function getTechName(id: number | null) {
  return findTechnician(id)?.name || '-'
}
</script>

<template>
  <div class="tech-history">
    <PageHeader title="Riwayat Service" />

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
          <label class="form-label">Jenis Service</label>
          <select v-model="filterType" class="form-select">
            <option value="">Semua Jenis</option>
            <option value="call_service">Call Service</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Tanggal Selesai</th>
              <th>Customer</th>
              <th>Unit & SN</th>
              <th>Jenis Service</th>
              <th>Tindakan / Hasil</th>
              <th>Teknisi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="job in filteredHistory" :key="job.id">
              <td>{{ job.time_out ? new Date(job.time_out).toLocaleString('id-ID') : '-' }}</td>
              <td>{{ getCustomerName(job.customer_id) }}</td>
              <td>{{ getUnitName(job.contract_item_id) }}</td>
              <td>
                <span class="badge" :class="job.service_type === 'maintenance' ? 'badge-info' : 'badge-primary'">
                  {{ job.service_type === 'maintenance' ? 'Maintenance' : 'Call Service' }}
                </span>
              </td>
              <td>
                <div class="text-sm">
                  <strong>Problem:</strong> {{ job.machine_problem || '-' }}<br>
                  <strong>Perbaikan:</strong> {{ job.repair_action || '-' }}
                </div>
              </td>
              <td>{{ getTechName(job.technician_id) }}</td>
            </tr>
            <tr v-if="filteredHistory.length === 0">
              <td colspan="6" class="text-center py-lg text-muted">Tidak ada histori service yang sesuai filter.</td>
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
