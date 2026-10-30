<script setup lang="ts">
// @ts-nocheck
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { isCopierReport } from '@/utils/copierReport'
import { printServiceReport, type ReportType } from '@/utils/printReport'
import PageHeader from '@/components/ui/PageHeader.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import FormModal from '@/components/ui/FormModal.vue'
import { useToast } from '@/composables/useToast'
import html2pdf from 'html2pdf.js'
import * as XLSX from 'xlsx'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const { currentUser } = useAuth()
const { ensureResourcesLoaded } = useMasterStore()
const showDetailModal = ref(false)
const selectedHistory = ref<any>(null)

const printModalOpen = ref(false)
const printType = ref<ReportType>('technical')
const printTarget = ref<any | null>(null)

const printTypeOptions = [
  {
    value: 'technical' as ReportType,
    title: 'Technical Report Form',
    desc: 'Laporan teknis servis lengkap (detail masalah unit, tindakan perbaikan, pergantian sparepart & tanda tangan).',
    badge: 'Standard',
    icon: 'technical'
  },
  {
    value: 'history' as ReportType,
    title: 'Service History Form',
    desc: 'Ringkasan riwayat pengerjaan servis unit & verifikasi pengujian mesin (Tested & Completed status).',
    badge: 'Summary',
    icon: 'history'
  },
  {
    value: 'copier' as ReportType,
    title: 'Copier Service Report',
    desc: 'Format khusus mesin fotokopi dengan pencatatan counter meter (Black/White & Color).',
    badge: 'Mesin Copier',
    icon: 'copier'
  },
]

function openPrintModal(job: any) {
  printTarget.value = job
  if (job && isCopierReport(job)) {
    printType.value = 'copier'
  } else {
    printType.value = 'technical'
  }
  printModalOpen.value = true
}

function handleConfirmPrint() {
  if (printTarget.value) {
    printServiceReport(printTarget.value, printType.value)
  }
  printModalOpen.value = false
}

const currentPage = ref(1)
const perPage = 10
const totalPages = computed(() => Math.max(1, Math.ceil(filteredHistory.value.length / perPage)))
const paginatedHistory = computed(() => {
  const start = (currentPage.value - 1) * perPage
  return filteredHistory.value.slice(start, start + perPage)
})

function openDetail(job: any) {
  selectedHistory.value = job
  showDetailModal.value = true
}
const {
  serviceReports,
  findCustomer,
  findUnit,
  findTechnician,
  getTechnicianIdByUser,
} = useMasterStore()

let techHistoryTimer: any = null

function silentRefresh() {
  if (showDetailModal.value) return
  if (document.visibilityState !== 'visible') return
  void useMasterStore().refreshOnly(['serviceReports', 'deliveryOrders'], true)
}

function onFocusOrVisible() {
  if (document.visibilityState === 'visible') {
    silentRefresh()
  }
}

onMounted(() => {
  ensureResourcesLoaded(route.path)
  techHistoryTimer = setInterval(silentRefresh, 10000)
  window.addEventListener('focus', onFocusOrVisible)
  window.addEventListener('bias:data-mutated', silentRefresh)
  document.addEventListener('visibilitychange', onFocusOrVisible)
})

onUnmounted(() => {
  if (techHistoryTimer) {
    clearInterval(techHistoryTimer)
    techHistoryTimer = null
  }
  window.removeEventListener('focus', onFocusOrVisible)
  window.removeEventListener('bias:data-mutated', silentRefresh)
  document.removeEventListener('visibilitychange', onFocusOrVisible)
})

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
  }).sort((a, b) => new Date(b.service_date || b.updated_at || 0).getTime() - new Date(a.service_date || a.updated_at || 0).getTime())
})

function formatCompletionDate(job: any): string {
  if (!job) return '-'
  const dateStr = job.service_date || job.updated_at || job.created_at
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '-'
  const formattedDate = d.toLocaleDateString('en-GB')
  return job.time_out ? `${formattedDate}, ${job.time_out}` : formattedDate
}

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
    html += `<td>${formatCompletionDate(job)}</td>`
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
    'Completion Date': formatCompletionDate(job),
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
              <th>Photos</th>
              <th>Technician</th>
              <th style="text-align: center;">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="job in paginatedHistory" :key="job.id">
              <td>{{ formatCompletionDate(job) }}</td>
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
              <td>
                <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                  <a v-if="job.photo_before" :href="job.photo_before" target="_blank" class="btn btn-sm btn-outline" style="padding: 4px 8px; font-size: 11px;">Before</a>
                  <a v-if="job.photo_progress" :href="job.photo_progress" target="_blank" class="btn btn-sm btn-outline" style="padding: 4px 8px; font-size: 11px;">Progress</a>
                  <a v-if="job.photo_after" :href="job.photo_after" target="_blank" class="btn btn-sm btn-outline" style="padding: 4px 8px; font-size: 11px;">After</a>
                  <span v-if="!job.photo_before && !job.photo_progress && !job.photo_after" class="text-muted" style="font-size: 11px;">-</span>
                </div>
              </td>
              <td>{{ getTechName(job.technician_id) }}</td>
              <td style="text-align: center;">
                <div style="display: flex; gap: 6px; justify-content: center;">
                  <button type="button" class="btn btn-sm btn-outline" @click="openDetail(job)" title="Lihat Detail Service History">
                    Detail
                  </button>
                  <button type="button" class="btn btn-sm btn-primary" @click="openPrintModal(job)" title="Print Laporan Servis Transaksi Ini" style="display: inline-flex; align-items: center; gap: 4px;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="6 9 6 2 18 2 18 9"></polyline>
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                      <rect x="6" y="14" width="12" height="8"></rect>
                    </svg>
                    Print
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="filteredHistory.length === 0">
              <td colspan="8" class="text-center py-lg text-muted">No service history matching the filter.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile History Card List View -->
      <div class="mobile-history-list">
        <div v-for="job in paginatedHistory" :key="job.id" class="mobile-history-card">
          <div class="m-history-header">
            <span class="m-history-date font-bold">{{ formatCompletionDate(job) }}</span>
            <span class="badge" :class="job.service_type === 'maintenance' ? 'badge-info' : job.service_type === 'meter_reading' ? 'badge-secondary' : 'badge-primary'">
              {{ getServiceTypeLabel(job.service_type) }}
            </span>
          </div>

          <div class="m-history-body">
            <div class="m-row">
              <span class="m-label">Customer</span>
              <span class="m-val font-semibold">{{ getCustomerName(job.customer_id) }}</span>
            </div>
            <div class="m-row">
              <span class="m-label">Unit</span>
              <span class="m-val">{{ getUnitName(job.unit_id) }}</span>
            </div>
            <div class="m-problem-box" v-if="job.machine_problem || job.repair_action">
              <div v-if="job.machine_problem"><strong>Problem:</strong> {{ job.machine_problem }}</div>
              <div v-if="job.repair_action" style="margin-top: 2px;"><strong>Action:</strong> {{ job.repair_action }}</div>
            </div>
          </div>

          <div class="m-history-footer">
            <div class="m-photo-links">
              <a v-if="job.photo_before" :href="job.photo_before" target="_blank" class="btn btn-xs btn-outline">Before</a>
              <a v-if="job.photo_progress" :href="job.photo_progress" target="_blank" class="btn btn-xs btn-outline">Progress</a>
              <a v-if="job.photo_after" :href="job.photo_after" target="_blank" class="btn btn-xs btn-outline">After</a>
            </div>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="btn btn-sm btn-outline" @click="openDetail(job)">Detail</button>
              <button type="button" class="btn btn-sm btn-primary" @click="openPrintModal(job)">Print</button>
            </div>
          </div>
        </div>
        <div v-if="filteredHistory.length === 0" class="text-center py-lg text-muted">
          No service history found.
        </div>
      </div>

      <div v-if="totalPages > 1" class="pagination" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-top: 1px solid var(--color-border-light);">
        <div class="pagination-info" style="font-size: 13px; color: var(--color-text-muted);">
          Menampilkan {{ (currentPage - 1) * perPage + 1 }}-{{ Math.min(currentPage * perPage, filteredHistory.length) }} dari {{ filteredHistory.length }} data
        </div>
        <div class="pagination-buttons" style="display: flex; gap: 6px;">
          <button class="btn btn-outline btn-sm" :disabled="currentPage === 1" @click="currentPage--">Prev</button>
          <button v-for="p in totalPages" :key="p" class="btn btn-sm" :class="p === currentPage ? 'btn-primary' : 'btn-outline'" @click="currentPage = p">{{ p }}</button>
          <button class="btn btn-outline btn-sm" :disabled="currentPage === totalPages" @click="currentPage++">Next</button>
        </div>
      </div>
    </div>

    <!-- Modal Detail Service History -->
    <FormModal
      :open="showDetailModal"
      :title="selectedHistory ? `Service History — ${selectedHistory.report_no || 'Detail'}` : 'Service History Detail'"
      max-width="600px"
      @close="showDetailModal = false"
    >
      <div v-if="selectedHistory" style="display: flex; flex-direction: column; gap: 14px; font-size: 13px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: var(--color-surface-raised, #f8fafc); padding: 12px; border-radius: 8px;">
          <div>
            <div style="color: var(--color-text-muted); font-size: 11px;">Customer</div>
            <div style="font-weight: 600;">{{ getCustomerName(selectedHistory.customer_id) }}</div>
          </div>
          <div>
            <div style="color: var(--color-text-muted); font-size: 11px;">Unit & Serial No</div>
            <div style="font-weight: 600;">{{ getUnitName(selectedHistory.unit_id) }}</div>
          </div>
          <div>
            <div style="color: var(--color-text-muted); font-size: 11px;">Completion Date</div>
            <div>{{ formatCompletionDate(selectedHistory) }}</div>
          </div>
          <div>
            <div style="color: var(--color-text-muted); font-size: 11px;">Service Type</div>
            <div>{{ getServiceTypeLabel(selectedHistory.service_type) }}</div>
          </div>
          <div>
            <div style="color: var(--color-text-muted); font-size: 11px;">Technician</div>
            <div>{{ getTechName(selectedHistory.technician_id) }}</div>
          </div>
          <div>
            <div style="color: var(--color-text-muted); font-size: 11px;">Status</div>
            <span class="badge badge-success">{{ String(selectedHistory.status || 'COMPLETED').toUpperCase() }}</span>
          </div>
        </div>

        <div>
          <label style="font-weight: 600; display: block; margin-bottom: 4px;">Machine Problem / Issue:</label>
          <div style="background: var(--color-surface-sunken, #f1f5f9); padding: 10px 12px; border-radius: 6px; white-space: pre-wrap;">
            {{ selectedHistory.machine_problem || '-' }}
          </div>
        </div>

        <div>
          <label style="font-weight: 600; display: block; margin-bottom: 4px;">Action / Repair Performed:</label>
          <div style="background: var(--color-surface-sunken, #f1f5f9); padding: 10px 12px; border-radius: 6px; white-space: pre-wrap;">
            {{ selectedHistory.repair_action || '-' }}
          </div>
        </div>

        <div v-if="selectedHistory.photo_before || selectedHistory.photo_progress || selectedHistory.photo_after" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px;">
          <div>
            <label style="font-weight: 600; font-size: 12px; display: block; margin-bottom: 4px;">Before Photo:</label>
            <img v-if="selectedHistory.photo_before" :src="selectedHistory.photo_before" alt="Before Photo" style="max-height: 140px; border-radius: 6px; object-fit: contain; width: 100%; border: 1px solid var(--color-border-light);" />
            <span v-else class="text-muted text-xs">No photo</span>
          </div>
          <div>
            <label style="font-weight: 600; font-size: 12px; display: block; margin-bottom: 4px;">Progress Photo:</label>
            <img v-if="selectedHistory.photo_progress" :src="selectedHistory.photo_progress" alt="Progress Photo" style="max-height: 140px; border-radius: 6px; object-fit: contain; width: 100%; border: 1px solid var(--color-border-light);" />
            <span v-else class="text-muted text-xs">No photo</span>
          </div>
          <div>
            <label style="font-weight: 600; font-size: 12px; display: block; margin-bottom: 4px;">After Photo:</label>
            <img v-if="selectedHistory.photo_after" :src="selectedHistory.photo_after" alt="After Photo" style="max-height: 140px; border-radius: 6px; object-fit: contain; width: 100%; border: 1px solid var(--color-border-light);" />
            <span v-else class="text-muted text-xs">No photo</span>
          </div>
        </div>
      </div>
      <template #footer>
        <div style="display: flex; gap: 8px; width: 100%;">
          <button type="button" class="btn btn-primary" style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;" @click="openPrintModal(selectedHistory)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 6 2 18 2 18 9"></polyline>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
              <rect x="6" y="14" width="12" height="8"></rect>
            </svg>
            Print Report
          </button>
          <button type="button" class="btn btn-outline" style="flex: 1;" @click="showDetailModal = false">Close</button>
        </div>
      </template>
    </FormModal>

    <!-- Print Modal -->
    <FormModal :open="printModalOpen" title="Print Service Report" max-width="560px" @close="printModalOpen = false" @submit="handleConfirmPrint">
      <div v-if="printTarget" class="print-modal-target">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
        </svg>
        <div style="line-height: 1.4; flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <strong style="color: var(--color-text);">{{ printTarget?.report_no || 'Laporan Servis' }}</strong>
            <span class="badge badge-sm badge-info">{{ getServiceTypeLabel(printTarget?.service_type) }}</span>
          </div>
          <div style="font-size: 11px; color: var(--color-text-muted); margin-top: 2px;">
            {{ getCustomerName(printTarget?.customer_id) }} &bull; {{ getUnitName(printTarget?.unit_id) }}
          </div>
        </div>
      </div>

      <div style="font-weight: 600; font-size: 12px; margin-bottom: 8px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
        Pilih Format Laporan:
      </div>

      <div class="print-options-grid">
        <div
          v-for="opt in printTypeOptions"
          :key="opt.value"
          class="print-option-card"
          :class="{ 'is-selected': printType === opt.value }"
          @click="printType = opt.value"
        >
          <div class="print-option-icon">
            <svg v-if="opt.icon === 'technical'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
            </svg>
            <svg v-else-if="opt.icon === 'history'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"></polyline>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
              <rect x="6" y="14" width="12" height="8"></rect>
            </svg>
          </div>

          <div class="print-option-info">
            <div class="print-option-header">
              <span class="print-option-title">{{ opt.title }}</span>
              <span v-if="opt.badge" class="print-option-badge">{{ opt.badge }}</span>
            </div>
            <div class="print-option-desc">{{ opt.desc }}</div>
          </div>

          <div class="print-option-radio">
            <div class="radio-circle" :class="{ 'checked': printType === opt.value }">
              <div v-if="printType === opt.value" class="radio-inner"></div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <button type="button" class="btn btn-outline" @click="printModalOpen = false">Cancel</button>
        <button type="button" class="btn btn-primary" @click="handleConfirmPrint">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; vertical-align: -2px;">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
          Print / Download
        </button>
      </template>
    </FormModal>
  </div>
</template>

<style scoped>
.filters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-md);
  align-items: end;
}

/* Print Modal Styles */
.print-modal-target {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--color-surface-sunken, #f8fafc);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--color-text, #1e293b);
}
.print-modal-target svg {
  color: var(--color-primary, #2563eb);
  flex-shrink: 0;
}
.print-options-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.print-option-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 16px;
  border: 1.5px solid var(--color-border, #e2e8f0);
  border-radius: 10px;
  background: var(--color-surface, #ffffff);
  cursor: pointer;
  transition: all 0.18s ease;
  user-select: none;
}
.print-option-card:hover {
  border-color: var(--color-primary-light, #93c5fd);
  background: var(--color-surface-sunken, #f8fafc);
  transform: translateY(-1px);
}
.print-option-card.is-selected {
  border-color: var(--color-primary, #2563eb);
  background: #f0f7ff;
  box-shadow: 0 0 0 1px var(--color-primary, #2563eb);
}
.print-option-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
  color: #475569;
  flex-shrink: 0;
  transition: all 0.18s ease;
}
.print-option-card.is-selected .print-option-icon {
  background: #e0edff;
  color: #2563eb;
}
.print-option-info {
  flex: 1;
  min-width: 0;
}
.print-option-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
}
.print-option-title {
  font-weight: 600;
  font-size: 13.5px;
  color: var(--color-text, #0f172a);
}
.print-option-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 9999px;
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid #bfdbfe;
}
.print-option-desc {
  font-size: 11.5px;
  color: var(--color-text-muted, #64748b);
  line-height: 1.4;
}
.print-option-radio {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.radio-circle {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--color-border, #cbd5e1);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s ease;
}
.radio-circle.checked {
  border-color: var(--color-primary, #2563eb);
}
.radio-inner {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-primary, #2563eb);
}

.mobile-history-list {
  display: none;
}

@media (max-width: 768px) {
  .table-responsive {
    display: none;
  }

  .mobile-history-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
  }

  .mobile-history-card {
    background: var(--color-surface, #ffffff);
    border: 1px solid var(--color-border-light, #e2e8f0);
    border-radius: var(--radius-md, 10px);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04));
  }

  .m-history-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .m-history-date {
    font-size: 13.5px;
    color: var(--color-text, #0f172a);
  }

  .m-history-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }

  .m-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .m-label {
    color: var(--color-text-muted, #64748b);
  }

  .m-val {
    text-align: right;
  }

  .m-problem-box {
    margin-top: 6px;
    padding: 8px 10px;
    background: var(--color-surface-raised, #f8fafc);
    border-radius: 6px;
    font-size: 12px;
    color: var(--color-text, #334155);
  }

  .m-history-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px dashed var(--color-border-light, #e2e8f0);
    padding-top: 10px;
    gap: 8px;
  }

  .m-photo-links {
    display: flex;
    gap: 4px;
  }
}
</style>
