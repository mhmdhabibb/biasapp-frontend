<script setup lang="ts">
// @ts-nocheck
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { isCopierReport } from '@/utils/copierReport'
import PageHeader from '@/components/ui/PageHeader.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useToast } from '@/composables/useToast'
import html2pdf from 'html2pdf.js'
import * as XLSX from 'xlsx'

const router = useRouter()
const toast = useToast()
const { currentUser } = useAuth()
const {
  serviceReports,
  findCustomer,
  findUnit,
  findTechnician,
  getTechnicianIdByUser,
} = useMasterStore()

// Draft copier yang di-assign ke teknisi login saja — teknisi lain tidak
// bisa melihat. Yang belum di-assign hanya terlihat di CS/superadmin.
const copierDrafts = computed(() => {
  const myTechId = getTechnicianIdByUser(currentUser.value?.id || null)
  if (!myTechId) return []
  return serviceReports.value.filter((r: any) =>
    isCopierReport(r) &&
    String(r.status || '').toLowerCase() !== 'completed' &&
    String(r.technician_id || '') === String(myTechId),
  ).sort((a: any, b: any) =>
    String(b.service_date || b.created_at || '').localeCompare(
      String(a.service_date || a.created_at || ''),
    ),
  )
})

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

const serviceTypeOptions = [
  { value: '', label: 'All Types' },
  { value: 'regular', label: 'Regular' },
  { value: 'repair', label: 'Repair' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'installation', label: 'Installation' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'meter_reading', label: 'Meter Reading' },
]

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

function exportToPdf() {
  if (!filteredHistory.value.length) {
    toast.error('No data to export')
    return
  }

  let html = '<h2 style="font-family: sans-serif;">Service History Report</h2><table border="1" cellpadding="8" cellspacing="0" style="width:100%; border-collapse: collapse; font-family: sans-serif; font-size: 12px;">'
  html += '<thead><tr>'
  const keys = ['Completion Date', 'Customer', 'Unit & SN', 'Service Type', 'Problem', 'Repair Action', 'Technician']
  keys.forEach(k => html += `<th style="background-color: #f4f4f4; text-align: left;">${k}</th>`)
  html += '</tr></thead><tbody>'
  
  filteredHistory.value.forEach((job: any) => {
    html += '<tr>'
    html += `<td>${job.time_out ? new Date(job.time_out).toLocaleString('en-GB') : '-'}</td>`
    html += `<td>${getCustomerName(job.customer_id)}</td>`
    html += `<td>${getUnitName(job.unit_id)}</td>`
    html += `<td>${getServiceTypeLabel(job.service_type)}</td>`
    html += `<td>${job.machine_problem || '-'}</td>`
    html += `<td>${job.repair_action || '-'}</td>`
    html += `<td>${getTechName(job.technician_id)}</td>`
    html += '</tr>'
  })
  html += '</tbody></table>'

  const wrapper = document.createElement('div')
  wrapper.innerHTML = html

  const opt = {
    margin: 0.5,
    filename: `Service_History_Report_${Date.now()}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'landscape' }
  }
  html2pdf().set(opt).from(wrapper).save()
}

function exportToExcel() {
  if (!filteredHistory.value.length) {
    toast.error('No data to export')
    return
  }

  const data = filteredHistory.value.map((job: any) => ({
    'Completion Date': job.time_out ? new Date(job.time_out).toLocaleString('en-GB') : '-',
    'Customer': getCustomerName(job.customer_id),
    'Unit & SN': getUnitName(job.unit_id),
    'Service Type': getServiceTypeLabel(job.service_type),
    'Problem': job.machine_problem || '-',
    'Repair Action': job.repair_action || '-',
    'Technician': getTechName(job.technician_id)
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Service History")
  XLSX.writeFile(wb, `Service_History_Report_${Date.now()}.xlsx`)
}
</script>

<template>
  <div class="tech-history">
    <PageHeader title="Service History">
      <template #actions>
        <button class="btn btn-outline" @click="exportToPdf" style="display: flex; align-items: center; gap: 6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Export PDF
        </button>
        <button class="btn btn-outline" @click="exportToExcel" style="display: flex; align-items: center; gap: 6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="17"></line><line x1="16" y1="13" x2="8" y2="17"></line></svg>
          Export Excel
        </button>
      </template>
    </PageHeader>

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
          <CustomSelect v-model="filterType" class="form-select" :options="serviceTypeOptions" />
        </div>
      </div>
    </div>

    <div v-if="copierDrafts.length > 0" class="card mb-lg p-lg">
      <h3 style="margin: 0 0 12px 0; font-size: 15px;">Draft Copier Bulan Ini ({{ copierDrafts.length }})</h3>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Report No.</th>
              <th>Customer</th>
              <th>Unit & SN</th>
              <th>Before Meter</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in copierDrafts" :key="d.id">
              <td>{{ d.report_no || '-' }}</td>
              <td>{{ getCustomerName(d.customer_id) }}</td>
              <td>{{ getUnitName(d.unit_id) }}</td>
              <td>{{ d.meter_reading_before ?? '-' }}</td>
              <td>
                <button
                  type="button"
                  class="btn btn-sm btn-primary"
                  @click="router.push(`/technician/call-services/${d.id}/copier-report`)"
                >
                  Isi Form
                </button>
              </td>
            </tr>
          </tbody>
        </table>
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
