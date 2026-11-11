<script setup lang="ts">
// @ts-nocheck
import PageHeader from '@/components/ui/PageHeader.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import FormModal from '@/components/ui/FormModal.vue'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { useToast } from '@/composables/useToast'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { printJobOrder, downloadJobOrderPdf } from '@/utils/printJobOrder'
import { printDeliveryOrder, downloadDeliveryOrderPdf } from '@/utils/printDeliveryOrder'
import { printServiceReport, downloadServiceReportPdf, type ReportType } from '@/utils/printReport'
import * as XLSX from 'xlsx'

const router = useRouter()
const { currentUser } = useAuth()
const route = useRoute()
const toast = useToast()
const { ensureResourcesLoaded } = useMasterStore()
const {
  jobOrders,
  deliveryOrders,
  serviceReports,
  getTechnicianIdByUser,
  findCustomer,
  findUnit } = useMasterStore()

onMounted(() => {
  ensureResourcesLoaded(route.path)
})

useAutoRefresh(15000, ["jobOrders", "serviceReports", "technicians", "customers", "units"])

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

function isSurveyJob(job: any): boolean {
  if (!job) return false
  return job.job_type === 'survey' || !!job.survey_id || !!job.survey
}

function jobCustomerId(job: any) {
  return job.customer_id || job.survey?.customer_id || job.service_request?.customer_id || job.delivery_order?.customer_id || job.delivery_order?.customer?.id || job.service_report?.customer_id || null
}

function jobUnitId(job: any) {
  return job.unit_id || job.survey?.unit_id || job.service_request?.unit_id || job.service_report?.unit_id || null
}

function jobRefNo(job: any): string {
  const isVisit =
    job.job_type === "visit" ||
    job.taskType === "visit" ||
    job.service_report?.service_type === "copier" ||
    String(job.job_order_no || "").startsWith("JOV") ||
    String(job.instructions || "").toLowerCase().includes("copier");

  if (isVisit) {
    if (job.service_report?.report_no) {
      return job.service_report.report_no;
    }
    if (job.job_order_no) {
      return job.job_order_no.replace(/^JOV/, "CPR");
    }
    return "CPR";
  }

  const raw =
    job.survey?.survey_no ||
    job.service_request?.request_no ||
    job.delivery_order?.do_number ||
    job.job_order_no ||
    job.service_report?.report_no ||
    "-";
  return raw.replace(/^JOV/, "CPR");
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

const currentPage = ref(1)
const perPage = 10
const totalPages = computed(() => Math.max(1, Math.ceil(filteredJobs.value.length / perPage)))
const paginatedJobs = computed(() => {
  const start = (currentPage.value - 1) * perPage
  return filteredJobs.value.slice(start, start + perPage)
})

watch([filterStatus, filterDate, filterCustomer, filterServiceNo], () => {
  currentPage.value = 1
})

// ── Export Recap List (PDF & Excel) ──
async function exportToPdf() {
  if (!filteredJobs.value.length) {
    toast.error('Tidak ada data untuk diexport')
    return
  }
  const { default: html2pdf } = await import('html2pdf.js')
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2 style="margin-bottom: 4px; color: #0066cc;">Call Service (My Jobs) Report</h2>
      <p style="color: #64748b; margin-top: 0; font-size: 13px;">
        Teknisi: <strong>${currentUser.value?.name || 'Teknisi'}</strong> | Tanggal Export: ${new Date().toLocaleDateString('id-ID')} | Total: ${filteredJobs.value.length} Pekerjaan
      </p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px;">
        <thead>
          <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
            <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">No</th>
            <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">Service No</th>
            <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">Tipe</th>
            <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">Customer</th>
            <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">Unit / Mesin</th>
            <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">Jadwal / Pengantaran</th>
            <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${filteredJobs.value.map((job: any, idx: number) => `
            <tr>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center;">${idx + 1}</td>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: bold;">${jobRefNo(job)}</td>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${isSurveyJob(job) ? 'SURVEY' : isDeliveryJob(job) ? 'DELIVERY' : 'SERVICE'}</td>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${job.survey?.customer?.company_name || job.service_report?.customer?.company_name || job.service_request?.customer?.company_name || job.delivery_order?.customer?.company_name || getCustomerName(jobCustomerId(job))}</td>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${isSurveyJob(job) ? (job.survey?.recommended_model || job.survey?.unit?.model || 'Survey Lokasi') : isDeliveryJob(job) ? '-' : (job.service_report?.unit?.model || job.service_request?.unit?.model || getUnitName(jobUnitId(job)))}</td>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${jobDate(job) ? new Date(jobDate(job)).toLocaleString('id-ID') : '-'}</td>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${(job.status || '').toUpperCase().replace('_', ' ')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `
  const opt = {
    margin: [6, 6, 6, 6],
    filename: `Call_Services_${Date.now()}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
  }
  html2pdf().set(opt).from(html).save()
}

function exportToExcel() {
  if (!filteredJobs.value.length) {
    toast.error('Tidak ada data untuk diexport')
    return
  }
  const data = filteredJobs.value.map((job: any, idx: number) => ({
    'No': idx + 1,
    'Service No': jobRefNo(job),
    'SPK No': job.job_order_no || '-',
    'Tipe': isSurveyJob(job) ? 'SURVEY' : isDeliveryJob(job) ? 'DELIVERY' : 'SERVICE',
    'Customer': job.survey?.customer?.company_name || job.service_report?.customer?.company_name || job.service_request?.customer?.company_name || job.delivery_order?.customer?.company_name || getCustomerName(jobCustomerId(job)),
    'Unit / Mesin': isSurveyJob(job) ? (job.survey?.recommended_model || job.survey?.unit?.model || 'Survey Lokasi') : isDeliveryJob(job) ? '-' : (job.service_report?.unit?.model || job.service_request?.unit?.model || getUnitName(jobUnitId(job))),
    'Jadwal / Pengantaran': jobDate(job) ? new Date(jobDate(job)).toLocaleString('id-ID') : '-',
    'Status': (job.status || '').toUpperCase().replace('_', ' ')
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Call Services")
  XLSX.writeFile(wb, `Call_Services_${Date.now()}.xlsx`)
}

// ── Print & Download Modal & Row Handlers ──
const printModalOpen = ref(false)
const printTarget = ref<any | null>(null)
const srPrintType = ref<'technical' | 'copier' | 'all'>('technical')
const downloadingJobId = ref<number | null>(null)
const isModalActionLoading = ref(false)

function getLinkedServiceReport(job: any) {
  if (!job) return null
  if (job.service_report) return job.service_report
  const srs = (serviceReports?.value || []) as any[]
  return srs.find(sr => String(sr.job_order_id) === String(job.id)) || null
}

function openPrintModal(job: any) {
  printTarget.value = job
  const unit = findUnit(jobUnitId(job))
  if (unit?.is_copier) {
    srPrintType.value = 'all'
  } else {
    srPrintType.value = 'technical'
  }
  printModalOpen.value = true
}

async function handlePrintSPK(job: any) {
  toast.info('Membuka dialog cetak SPK...')
  await printJobOrder(job)
}

async function handleDownloadSPK(job: any) {
  isModalActionLoading.value = true
  toast.info('Menyiapkan SPK Job Order PDF...')
  const ok = await downloadJobOrderPdf(job)
  isModalActionLoading.value = false
  if (ok) toast.success('SPK PDF berhasil didownload')
  else toast.error('Gagal mendownload SPK PDF')
}

async function handlePrintDO(job: any) {
  toast.info('Membuka dialog cetak Surat Jalan...')
  await printDeliveryOrder(job.delivery_order || { id: job.delivery_order_id })
}

async function handleDownloadDO(job: any) {
  isModalActionLoading.value = true
  toast.info('Menyiapkan Surat Jalan PDF...')
  const ok = await downloadDeliveryOrderPdf(job.delivery_order || { id: job.delivery_order_id })
  isModalActionLoading.value = false
  if (ok) toast.success('Surat Jalan PDF berhasil didownload')
  else toast.error('Gagal mendownload Surat Jalan PDF')
}

async function handlePrintSR(job: any) {
  const sr = getLinkedServiceReport(job)
  if (!sr) {
    toast.error('Laporan servis belum dibuat untuk pekerjaan ini')
    return
  }
  toast.info('Membuka dialog cetak Laporan Servis...')
  printServiceReport(sr, srPrintType.value === 'all' ? undefined : (srPrintType.value as ReportType))
}

async function handleDownloadSR(job: any) {
  const sr = getLinkedServiceReport(job)
  if (!sr) {
    toast.error('Laporan servis belum dibuat untuk pekerjaan ini')
    return
  }
  isModalActionLoading.value = true
  toast.info('Menyiapkan Laporan Servis PDF...')
  const ok = await downloadServiceReportPdf(sr, srPrintType.value === 'all' ? undefined : (srPrintType.value as ReportType))
  isModalActionLoading.value = false
  if (ok) toast.success('Laporan Servis PDF berhasil didownload')
  else toast.error('Gagal mendownload Laporan Servis PDF')
}

async function handleDownloadRowJob(job: any) {
  if (downloadingJobId.value) return
  downloadingJobId.value = job.id
  try {
    if (isDeliveryJob(job)) {
      toast.info('Menyiapkan Surat Jalan PDF...')
      const ok = await downloadDeliveryOrderPdf(job.delivery_order || { id: job.delivery_order_id })
      if (ok) toast.success('Surat Jalan PDF berhasil didownload')
      else toast.error('Gagal mendownload Surat Jalan PDF')
    } else {
      const sr = getLinkedServiceReport(job)
      if (sr && job.status === 'completed') {
        toast.info('Menyiapkan Laporan Servis PDF...')
        const ok = await downloadServiceReportPdf(sr)
        if (ok) toast.success('Laporan Servis PDF berhasil didownload')
        else toast.error('Gagal mendownload Laporan Servis PDF')
      } else {
        toast.info('Menyiapkan SPK Job Order PDF...')
        const ok = await downloadJobOrderPdf(job)
        if (ok) toast.success('SPK Job Order PDF berhasil didownload')
        else toast.error('Gagal mendownload SPK Job Order PDF')
      }
    }
  } catch (e) {
    console.error('Download row job error:', e)
    toast.error('Terjadi kesalahan saat download PDF')
  } finally {
    downloadingJobId.value = null
  }
}
</script>

<template>
  <div class="tech-call-services">
    <PageHeader title="Call Service (My Jobs)">
      <template #actions>
        <button class="btn btn-outline btn-sm" @click="exportToPdf" style="display: flex; align-items: center; gap: 6px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          Export PDF
        </button>
        <button class="btn btn-outline btn-sm" @click="exportToExcel" style="display: flex; align-items: center; gap: 6px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="8" y1="13" x2="16" y2="17"></line>
            <line x1="16" y1="13" x2="8" y2="17"></line>
          </svg>
          Export Excel
        </button>
      </template>
    </PageHeader>

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
              <th style="width: 195px; text-align: center;">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="job in paginatedJobs" :key="job.id">
              <td><strong>{{ jobRefNo(job) }}</strong></td>
              <td>
                <span class="badge" :class="isSurveyJob(job) ? 'badge-warning' : isDeliveryJob(job) ? 'badge-info' : 'badge-primary'">
                  {{ isSurveyJob(job) ? 'SURVEY' : isDeliveryJob(job) ? 'DELIVERY' : 'SERVICE' }}
                </span>
              </td>
              <td>{{ job.survey?.customer?.company_name || job.service_report?.customer?.company_name || job.service_request?.customer?.company_name || job.delivery_order?.customer?.company_name || getCustomerName(jobCustomerId(job)) }}</td>
              <td>{{ isSurveyJob(job) ? (job.survey?.recommended_model || job.survey?.unit?.model || 'Survey Lokasi') : isDeliveryJob(job) ? '-' : (job.service_report?.unit?.model || job.service_request?.unit?.model || getUnitName(jobUnitId(job))) }}</td>
              <td>{{ jobDate(job) ? new Date(jobDate(job)).toLocaleString('en-GB') : '-' }}</td>
              <td>
                <span class="badge" :class="'badge-' + (job.status === 'in_progress' ? 'info' : job.status === 'pending' || job.status === 'assigned' ? 'warning' : job.status === 'completed' ? 'success' : 'secondary')">
                  {{ job.status.toUpperCase().replace('_', ' ') }}
                </span>
              </td>
              <td style="text-align: center;">
                <div class="action-buttons-group">
                  <button class="btn btn-sm btn-primary" @click="goToDetail(job.id)" title="Detail & Kerjakan">
                    Detail
                  </button>
                  <button
                    class="btn btn-sm btn-outline-primary"
                    @click="openPrintModal(job)"
                    title="Print Dokumen Pekerjaan"
                    style="display: inline-flex; align-items: center; gap: 4px;"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="6 9 6 2 18 2 18 9"></polyline>
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                      <rect x="6" y="14" width="12" height="8"></rect>
                    </svg>
                    Print
                  </button>
                  <button
                    class="btn btn-sm btn-outline"
                    @click="handleDownloadRowJob(job)"
                    :disabled="downloadingJobId === job.id"
                    title="Download PDF Dokumen"
                    style="display: inline-flex; align-items: center; gap: 4px;"
                  >
                    <span v-if="downloadingJobId === job.id" class="spinner-border spinner-border-sm" style="width: 12px; height: 12px;"></span>
                    <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    PDF
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="filteredJobs.length === 0">
              <td colspan="7" class="text-center py-lg text-muted">No call service found.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile Card List View -->
      <div class="mobile-jobs-list">
        <div
          v-for="job in paginatedJobs"
          :key="job.id"
          class="mobile-job-card"
          @click="goToDetail(job.id)"
        >
          <div class="mobile-job-header">
            <span class="mobile-job-no">{{ jobRefNo(job) }}</span>
            <span class="badge" :class="'badge-' + (job.status === 'in_progress' ? 'info' : job.status === 'pending' || job.status === 'assigned' ? 'warning' : job.status === 'completed' ? 'success' : 'secondary')">
              {{ job.status.toUpperCase().replace('_', ' ') }}
            </span>
          </div>

          <div class="mobile-job-body">
            <div class="m-row">
              <span class="m-label">Customer</span>
              <span class="m-val font-semibold">{{ getCustomerName(jobCustomerId(job)) }}</span>
            </div>
            <div class="m-row" v-if="!isDeliveryJob(job)">
              <span class="m-label">Unit</span>
              <span class="m-val">{{ getUnitName(jobUnitId(job)) }}</span>
            </div>
            <div class="m-row">
              <span class="m-label">Schedule</span>
              <span class="m-val">{{ jobDate(job) ? new Date(jobDate(job)).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '-' }}</span>
            </div>
          </div>

          <div class="mobile-job-footer">
            <span class="badge" :class="isSurveyJob(job) ? 'badge-warning' : isDeliveryJob(job) ? 'badge-info' : 'badge-primary'">
              {{ isSurveyJob(job) ? 'SURVEY' : isDeliveryJob(job) ? 'DELIVERY' : 'SERVICE' }}
            </span>
            <div class="mobile-actions">
              <button class="btn btn-sm btn-outline-primary" @click.stop="openPrintModal(job)">
                🖨️ Print
              </button>
              <button class="btn btn-sm btn-outline" @click.stop="handleDownloadRowJob(job)" :disabled="downloadingJobId === job.id">
                📥 PDF
              </button>
              <button class="btn btn-sm btn-primary" @click.stop="goToDetail(job.id)">
                Detail →
              </button>
            </div>
          </div>
        </div>
        <div v-if="filteredJobs.length === 0" class="text-center py-lg text-muted">
          No call service found.
        </div>
      </div>

      <div v-if="totalPages > 1" class="pagination" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-top: 1px solid var(--color-border-light);">
        <div class="pagination-info" style="font-size: 13px; color: var(--color-text-muted);">
          Menampilkan {{ (currentPage - 1) * perPage + 1 }}-{{ Math.min(currentPage * perPage, filteredJobs.length) }} dari {{ filteredJobs.length }} data
        </div>
        <div class="pagination-buttons" style="display: flex; gap: 6px;">
          <button class="btn btn-outline btn-sm" :disabled="currentPage === 1" @click="currentPage--">Prev</button>
          <button v-for="p in totalPages" :key="p" class="btn btn-sm" :class="p === currentPage ? 'btn-primary' : 'btn-outline'" @click="currentPage = p">{{ p }}</button>
          <button class="btn btn-outline btn-sm" :disabled="currentPage === totalPages" @click="currentPage++">Next</button>
        </div>
      </div>
    </div>

    <!-- Print & Download Modal -->
    <FormModal
      :open="printModalOpen"
      :title="printTarget ? `Print & Download Dokumen — ${jobRefNo(printTarget)}` : 'Print Dokumen'"
      max-width="640px"
      @close="printModalOpen = false"
    >
      <div v-if="printTarget" class="print-modal-container">
        <!-- Target Info Header Card -->
        <div class="target-info-card">
          <div class="target-info-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div class="target-info-details">
            <div class="target-info-title-row">
              <span class="target-info-no">{{ jobRefNo(printTarget) }}</span>
              <span class="badge" :class="isSurveyJob(printTarget) ? 'badge-warning' : isDeliveryJob(printTarget) ? 'badge-info' : 'badge-primary'">
                {{ isSurveyJob(printTarget) ? 'SURVEY' : isDeliveryJob(printTarget) ? 'DELIVERY' : 'SERVICE' }}
              </span>
            </div>
            <div class="target-info-sub">
              <strong>{{ printTarget.survey?.customer?.company_name || printTarget.service_report?.customer?.company_name || printTarget.service_request?.customer?.company_name || printTarget.delivery_order?.customer?.company_name || getCustomerName(jobCustomerId(printTarget)) }}</strong>
              &bull;
              {{ isSurveyJob(printTarget) ? (printTarget.survey?.recommended_model || 'Survey Lokasi') : isDeliveryJob(printTarget) ? 'Delivery Unit / Barang' : (getUnitName(jobUnitId(printTarget))) }}
            </div>
          </div>
        </div>

        <div class="doc-options-title">Pilih Dokumen yang Ingin Dicetak atau Didownload:</div>

        <div class="doc-options-list">
          <!-- 1. Surat Perintah Kerja (Job Order / SPK) -->
          <div class="doc-option-card">
            <div class="doc-option-left">
              <div class="doc-badge-spk">SPK</div>
              <div>
                <div class="doc-title">Surat Perintah Kerja (Job Order)</div>
                <div class="doc-desc">
                  Surat penugasan teknisi resmi, jadwal, detail unit/mesin, uraian tugas, dan blok tanda tangan.
                </div>
              </div>
            </div>
            <div class="doc-option-actions">
              <button class="btn btn-sm btn-primary" @click="handlePrintSPK(printTarget)" :disabled="isModalActionLoading">
                🖨️ Print
              </button>
              <button class="btn btn-sm btn-outline" @click="handleDownloadSPK(printTarget)" :disabled="isModalActionLoading">
                📥 PDF
              </button>
            </div>
          </div>

          <!-- 2. Surat Jalan (Delivery Order) - If Delivery Job -->
          <div v-if="isDeliveryJob(printTarget)" class="doc-option-card">
            <div class="doc-option-left">
              <div class="doc-badge-do">DO</div>
              <div>
                <div class="doc-title">Surat Jalan (Delivery Order)</div>
                <div class="doc-desc">
                  Surat bukti serah terima unit / barang resmi PT. BIAS SURYA TEKNOLOGI dengan tanda tangan penerima.
                </div>
              </div>
            </div>
            <div class="doc-option-actions">
              <button class="btn btn-sm btn-primary" @click="handlePrintDO(printTarget)" :disabled="isModalActionLoading">
                🖨️ Print
              </button>
              <button class="btn btn-sm btn-outline" @click="handleDownloadDO(printTarget)" :disabled="isModalActionLoading">
                📥 PDF
              </button>
            </div>
          </div>

          <!-- 3. Laporan Servis (Service Report) - If Service Report Linked -->
          <div v-if="getLinkedServiceReport(printTarget)" class="doc-option-card">
            <div class="doc-option-left">
              <div class="doc-badge-sr">SR</div>
              <div>
                <div class="doc-title">Laporan Servis (Service Report)</div>
                <div class="doc-desc">
                  Formulir hasil perbaikan mesin, counter meter, sparepart, dan checklist teknikal.
                </div>
                <div style="margin-top: 8px; display: flex; gap: 8px; align-items: center; font-size: 12px;">
                  <label><input type="radio" value="technical" v-model="srPrintType" /> Technical</label>
                  <label><input type="radio" value="copier" v-model="srPrintType" /> Copier</label>
                  <label><input type="radio" value="all" v-model="srPrintType" /> All Forms</label>
                </div>
              </div>
            </div>
            <div class="doc-option-actions">
              <button class="btn btn-sm btn-primary" @click="handlePrintSR(printTarget)" :disabled="isModalActionLoading">
                🖨️ Print
              </button>
              <button class="btn btn-sm btn-outline" @click="handleDownloadSR(printTarget)" :disabled="isModalActionLoading">
                📥 PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <button type="button" class="btn btn-outline" @click="printModalOpen = false">
          Tutup
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

.action-buttons-group {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn-outline-primary {
  background: transparent;
  color: var(--color-primary, #0066cc);
  border: 1px solid var(--color-primary, #0066cc);
  font-weight: 500;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: all 0.15s ease-in-out;
}

.btn-outline-primary:hover {
  background: var(--color-primary, #0066cc);
  color: #ffffff;
}

.mobile-jobs-list {
  display: none;
}

/* Modal styling */
.print-modal-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.target-info-card {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--color-surface-raised, #f8fafc);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 8px;
  padding: 12px 16px;
}

.target-info-icon {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: #eff6ff;
  color: #0066cc;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.target-info-details {
  flex: 1;
}

.target-info-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.target-info-no {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text, #0f172a);
}

.target-info-sub {
  font-size: 12.5px;
  color: var(--color-text-muted, #64748b);
}

.doc-options-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #0f172a);
}

.doc-options-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.doc-option-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 8px;
  transition: border-color 0.15s ease;
}

.doc-option-card:hover {
  border-color: #cbd5e1;
}

.doc-option-left {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
}

.doc-badge-spk, .doc-badge-do, .doc-badge-sr {
  padding: 4px 8px;
  border-radius: 6px;
  font-weight: 700;
  font-size: 11px;
  flex-shrink: 0;
  letter-spacing: 0.5px;
}

.doc-badge-spk {
  background: #e0e7ff;
  color: #3730a3;
}

.doc-badge-do {
  background: #dbeafe;
  color: #1e40af;
}

.doc-badge-sr {
  background: #dcfce7;
  color: #166534;
}

.doc-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-text, #0f172a);
  margin-bottom: 2px;
}

.doc-desc {
  font-size: 12px;
  color: var(--color-text-muted, #64748b);
  line-height: 1.35;
}

.doc-option-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .table-responsive {
    display: none;
  }

  .mobile-jobs-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
  }

  .mobile-job-card {
    background: var(--color-surface, #ffffff);
    border: 1px solid var(--color-border-light, #e2e8f0);
    border-radius: var(--radius-md, 10px);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04));
    cursor: pointer;
  }

  .mobile-job-card:active {
    background: var(--color-surface-raised, #f8fafc);
  }

  .mobile-job-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .mobile-job-no {
    font-weight: 700;
    font-size: 14px;
    color: var(--color-text, #0f172a);
  }

  .mobile-job-body {
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

  .mobile-job-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px dashed var(--color-border-light, #e2e8f0);
    padding-top: 10px;
    gap: 8px;
    flex-wrap: wrap;
  }

  .mobile-actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .doc-option-card {
    flex-direction: column;
    align-items: flex-start;
  }

  .doc-option-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
