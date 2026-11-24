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
import { printServiceReport, downloadServiceReportPdf, type ReportType } from '@/utils/printReport'
import { isCopierReport } from '@/utils/copierReport'
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

useAutoRefresh(15000, ["jobOrders", "deliveryOrders", "serviceReports", "technicians", "customers", "units", "products"])

// service_report.technician_id references technicians.id, not users.id
const myTechId = computed(() => getTechnicianIdByUser(currentUser.value?.id || null))

// My Jobs menampilkan seluruh penugasan teknisi (service, delivery, maintenance, survey, visit, dll)
const myJobs = computed(() => {
  return jobOrders.value.filter(j => String(j.technician_id) === String(myTechId.value))
})

const filterType = ref('')
const filterTypeOptions = [
  { value: '', label: 'All Types' },
  { value: 'service', label: 'Service' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'survey', label: 'Survey' },
  { value: 'visit', label: 'Visit' },
  { value: 'meter_reading', label: 'Meter Reading' },
]

const filterStatus = ref('')
const filterDate = ref('')
const filterCustomer = ref('')
const filterServiceNo = ref('')

function isDeliveryJob(job: any): boolean {
  if (!job) return false
  if (job.delivery_order_id) return true
  if (String(job.job_type || '').toLowerCase() === 'delivery') return true
  const d = job.delivery_order
  if (d && (d.id || d.do_number)) return true
  if (String(job.job_order_no || '').startsWith('Bi/DO') || String(job.job_order_no || '').startsWith('DO')) return true
  return false
}

function isSurveyJob(job: any): boolean {
  if (!job) return false
  return job.job_type === 'survey' || !!job.survey_id || !!job.survey
}

function getJobTypeBadgeClass(job: any): string {
  if (!job) return 'badge-secondary'
  const jt = String(job.job_type || '').toLowerCase()
  if (jt === 'survey' || isSurveyJob(job)) return 'badge-warning'
  if (jt === 'delivery' || isDeliveryJob(job)) return 'badge-info'
  if (jt === 'maintenance') return 'badge-success'
  if (jt === 'visit') return 'badge-primary'
  if (jt === 'meter_reading') return 'badge-secondary'
  return 'badge-primary'
}

function getJobTypeLabel(job: any): string {
  if (!job) return '-'
  const jt = String(job.job_type || '').toLowerCase()
  if (jt === 'survey' || isSurveyJob(job)) return 'SURVEY'
  if (jt === 'delivery' || isDeliveryJob(job)) return 'DELIVERY'
  if (jt === 'maintenance') return 'MAINTENANCE'
  if (jt === 'visit') return 'VISIT'
  if (jt === 'meter_reading') return 'METER READING'
  return (job.job_type || 'SERVICE').toUpperCase()
}

function getJobUnitDisplay(job: any): string {
  if (!job) return '-'
  if (isSurveyJob(job)) {
    return job.survey?.recommended_model || job.survey?.unit?.model || 'Survey Lokasi'
  }

  // If it's a delivery job or has delivery order, look up delivery items
  if (isDeliveryJob(job) || job.delivery_order || job.delivery_order_id) {
    const d = job.delivery_order || (job.delivery_order_id ? masterStore.deliveryOrders?.find((doItem: any) => String(doItem.id) === String(job.delivery_order_id)) : null)
    const items = d?.delivery_order_items?.length ? d.delivery_order_items : (d?.items?.length ? d.items : [])
    if (items.length > 0) {
      const itemNames = items.map((i: any) => {
        let name = i.unit?.model || (i.unit_id ? getUnitName(i.unit_id) : '')
        if (!name || name === '-') {
          const prod = i.product || (i.product_id ? masterStore.findProduct(i.product_id) : null)
          name = prod?.name || i.item_name || i.name || i.description || ''
        }
        if (!name || name === '-') {
          name = i.model || '-'
        }
        if (i.qty && i.qty > 1) {
          name += ` (x${i.qty})`
        }
        return name
      }).filter((n: string) => n && n !== '-')

      if (itemNames.length > 0) {
        return itemNames.join(', ')
      }
    }
  }

  const directUnit = job.unit?.model || job.service_report?.unit?.model || job.service_request?.unit?.model
  if (directUnit) return directUnit
  const uid = jobUnitId(job)
  if (uid) {
    const uName = getUnitName(uid)
    if (uName && uName !== '-') return uName
  }
  return '-'
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
  if (!job) return ''
  return (
    job.scheduled_date ||
    job.delivery_order?.delivery_date ||
    job.survey?.scheduled_date ||
    job.service_report?.service_date ||
    job.created_at ||
    ''
  )
}

function getJobAddress(job: any): string {
  if (!job) return ''
  const d = job.delivery_order
  return (
    d?.delivery_address ||
    job.survey?.location_address ||
    d?.rental?.installation_address ||
    job.rental?.installation_address ||
    d?.sale?.installation_address ||
    job.sale?.installation_address ||
    job.survey?.customer?.address ||
    job.service_report?.customer?.address ||
    job.customer?.address ||
    findCustomer(jobCustomerId(job))?.address ||
    ''
  )
}

function toLocalDateStr(dateVal: any): string {
  if (!dateVal) return ''
  const d = new Date(dateVal)
  if (isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const todayStr = computed(() => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
})

const dateFilterTab = ref<'all' | 'today' | 'upcoming'>('all')

function setDateFilterTab(tab: 'all' | 'today' | 'upcoming') {
  dateFilterTab.value = tab
  if (tab === 'today') {
    filterDate.value = todayStr.value
  } else if (tab === 'all') {
    filterDate.value = ''
  }
}

function onCustomDateChange() {
  if (filterDate.value === todayStr.value) {
    dateFilterTab.value = 'today'
  } else if (!filterDate.value) {
    dateFilterTab.value = 'all'
  } else {
    dateFilterTab.value = 'all'
  }
}

const filteredJobs = computed(() => {
  return myJobs.value.filter(job => {
    if (filterStatus.value && job.status !== filterStatus.value) return false

    if (filterType.value) {
      const jt = String(job.job_type || '').toLowerCase()
      if (filterType.value === 'delivery') {
        if (!isDeliveryJob(job) && jt !== 'delivery') return false
      } else if (filterType.value === 'survey') {
        if (!isSurveyJob(job) && jt !== 'survey') return false
      } else if (filterType.value === 'visit') {
        if (jt !== 'visit' && !String(job.job_order_no || '').startsWith('JOV')) return false
      } else {
        if (jt !== filterType.value) return false
      }
    }
    
    // Timezone-safe date filtering
    const jd = jobDate(job)
    const jdLocal = toLocalDateStr(jd)
    if (dateFilterTab.value === 'upcoming') {
      if (jdLocal && jdLocal < todayStr.value) return false
    } else if (filterDate.value) {
      if (jdLocal !== filterDate.value) return false
    }

    if (filterCustomer.value) {
      const cust = findCustomer(jobCustomerId(job))
      if (!cust || !(cust.company_name || '').toLowerCase().includes(filterCustomer.value.toLowerCase())) return false
    }
    if (filterServiceNo.value) {
      const hay = `${job.job_order_no || ''} ${jobRefNo(job)}`.toLowerCase()
      if (!hay.includes(filterServiceNo.value.toLowerCase())) return false
    }
    return true
  }).sort((a, b) => {
    const timeA = new Date(jobDate(a)).getTime() || 0
    const timeB = new Date(jobDate(b)).getTime() || 0
    if (dateFilterTab.value === 'upcoming' || filterDate.value) {
      return timeA - timeB
    }
    return timeB - timeA
  })
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
  { value: 'draft', label: 'Draft' },
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

watch([filterStatus, filterDate, dateFilterTab, filterCustomer, filterServiceNo], () => {
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
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${getJobUnitDisplay(job)}</td>
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
    'Unit / Mesin': getJobUnitDisplay(job),
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

function isJobCopier(job: any): boolean {
  if (!job) return false
  const uId = jobUnitId(job)
  const unit = findUnit(uId) || job.unit || job.service_request?.unit || job.service_report?.unit
  if (unit?.is_copier) return true

  const uType = (unit?.type?.name || '').toLowerCase()
  if (uType.includes('copier') || uType.includes('photocopy') || uType.includes('fotokopi')) return true

  const sr = getLinkedServiceReport(job)
  if (sr && isCopierReport(sr)) return true

  const model = (unit?.model || unit?.name || job.instructions || '').toLowerCase()
  if (model.includes('copier') || model.includes('photocopy') || model.includes('fotokopi')) return true

  const jType = String(job.job_type || '').toLowerCase()
  if (jType === 'visit' || String(job.job_order_no || '').startsWith('JOV')) return true

  return false
}

function getPrintableServiceReport(job: any) {
  if (!job) return null
  const linked = getLinkedServiceReport(job)
  if (linked) return linked

  const d = job.delivery_order || (job.delivery_order_id ? masterStore.deliveryOrders?.find((doItem: any) => String(doItem.id) === String(job.delivery_order_id)) : null)
  const custId = jobCustomerId(job)
  const cust = job.customer || job.survey?.customer || job.service_request?.customer || d?.customer || findCustomer(custId) || {}

  const uId = jobUnitId(job)
  let unit = findUnit(uId) || job.unit || job.service_request?.unit || job.service_report?.unit

  const dItems = (d?.delivery_order_items && d.delivery_order_items.length > 0) ? d.delivery_order_items : (d?.items && d.items.length > 0 ? d.items : [])
  const doi = dItems.length > 0 ? dItems[0] : null
  if (!unit && doi) {
    unit = doi.unit || findUnit(doi.unit_id) || {
      model: doi.model || doi.product?.name || doi.item_name || '-',
      serial_no: doi.serial_no || '-',
      brand_id: doi.brand_id,
      brand: doi.brand || findBrand(doi.brand_id),
      is_copier: doi.is_copier,
    }
  }

  const isDelivery = isDeliveryJob(job)
  const isCopier = !isDelivery && isJobCopier(job)

  return {
    id: null,
    report_no: jobRefNo(job),
    service_type: isCopier ? 'copier' : (isDelivery ? 'delivery' : 'repair'),
    customer_id: custId || cust?.id,
    customer: cust,
    customer_name: cust?.company_name || cust?.name || '',
    customer_address: getJobAddress(job) || cust?.address || '',
    customer_phone: cust?.phone || d?.recipient_phone || '',
    pic_name: cust?.pic_name || cust?.contact_person || d?.recipient_name || '',
    unit_id: uId || unit?.id || doi?.unit_id,
    unit: unit ? { ...unit, is_copier: isCopier } : { is_copier: isCopier },
    brand: unit?.brand || doi?.brand || (doi?.brand_id ? findBrand(doi.brand_id) : null),
    brand_name: unit?.brand?.name || doi?.brand?.name || '',
    model: unit?.model || doi?.model || doi?.product?.name || doi?.item_name || '',
    serial_no: unit?.serial_no || doi?.serial_no || '',
    technician_id: job.technician_id,
    technician: job.technician,
    technician_name: job.technician?.user?.name || job.technician?.name || '',
    service_date: jobDate(job) || new Date().toISOString(),
    machine_problem: job.instructions || job.service_request?.problem_description || d?.problem || job.problem_description || (isDelivery ? (unit?.model || doi?.model || 'Pengantaran barang/unit') : ''),
    action_taken: job.action_taken || d?.action || '',
    job_order: job,
    delivery_order: d,
    delivery_order_items: dItems,
    service_request: job.service_request,
    is_copier: isCopier,
  }
}

function openPrintModal(job: any) {
  printTarget.value = job
  srPrintType.value = isJobCopier(job) ? 'copier' : 'technical'
  printModalOpen.value = true
}

// ── 1. Service History ──
async function handlePrintServiceHistory(job: any) {
  const report = getPrintableServiceReport(job)
  toast.info('Membuka dialog cetak Service History...')
  await printServiceReport(report, 'history')
}

async function handleDownloadServiceHistory(job: any) {
  isModalActionLoading.value = true
  toast.info('Menyiapkan Service History PDF...')
  const report = getPrintableServiceReport(job)
  const ok = await downloadServiceReportPdf(report, 'history')
  isModalActionLoading.value = false
  if (ok) toast.success('Service History PDF berhasil didownload')
  else toast.error('Gagal mendownload Service History PDF')
}

// ── 2. Copier Service Report ──
async function handlePrintCopierReport(job: any) {
  const report = getPrintableServiceReport(job)
  toast.info('Membuka dialog cetak Copier Service Report...')
  await printServiceReport(report, 'copier')
}

async function handleDownloadCopierReport(job: any) {
  isModalActionLoading.value = true
  toast.info('Menyiapkan Copier Service Report PDF...')
  const report = getPrintableServiceReport(job)
  const ok = await downloadServiceReportPdf(report, 'copier')
  isModalActionLoading.value = false
  if (ok) toast.success('Copier Service Report PDF berhasil didownload')
  else toast.error('Gagal mendownload Copier Service Report PDF')
}

// ── 3. Technical Report Form ──
async function handlePrintTechnicalReport(job: any) {
  const report = getPrintableServiceReport(job)
  toast.info('Membuka dialog cetak Technical Report Form...')
  await printServiceReport(report, 'technical')
}

async function handleDownloadTechnicalReport(job: any) {
  isModalActionLoading.value = true
  toast.info('Menyiapkan Technical Report Form PDF...')
  const report = getPrintableServiceReport(job)
  const ok = await downloadServiceReportPdf(report, 'technical')
  isModalActionLoading.value = false
  if (ok) toast.success('Technical Report Form PDF berhasil didownload')
  else toast.error('Gagal mendownload Technical Report Form PDF')
}

async function handleDownloadRowJob(job: any) {
  if (downloadingJobId.value) return
  downloadingJobId.value = job.id
  try {
    const isCopier = isJobCopier(job)
    const report = getPrintableServiceReport(job)
    const reportType: ReportType = isCopier ? 'copier' : 'history'
    toast.info(`Menyiapkan ${isCopier ? 'Copier Service Report' : 'Service History'} PDF...`)
    const ok = await downloadServiceReportPdf(report, reportType)
    if (ok) toast.success('PDF berhasil didownload')
    else toast.error('Gagal mendownload PDF')
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
          <label class="form-label">Tanggal Jadwal</label>
          <div class="date-filter-wrapper">
            <input v-model="filterDate" type="date" class="form-input date-input-sm" @change="onCustomDateChange">
            <div class="date-tab-buttons">
              <button
                type="button"
                class="btn-date-tab"
                :class="{ active: filterDate === todayStr }"
                @click="setDateFilterTab('today')"
              >
                Hari Ini
              </button>
              <button
                type="button"
                class="btn-date-tab"
                :class="{ active: dateFilterTab === 'upcoming' && !filterDate }"
                @click="setDateFilterTab('upcoming')"
              >
                Mendatang
              </button>
              <button
                type="button"
                class="btn-date-tab"
                :class="{ active: !filterDate && dateFilterTab === 'all' }"
                @click="setDateFilterTab('all')"
              >
                Semua
              </button>
            </div>
          </div>
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Type</label>
          <CustomSelect v-model="filterType" class="form-select" :options="filterTypeOptions" />
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
              <th>Customer & Alamat Instalasi</th>
              <th>Unit</th>
              <th>Jadwal / Scheduled Date</th>
              <th>Status</th>
              <th style="width: 195px; text-align: center;">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="job in paginatedJobs" :key="job.id">
              <td><strong>{{ jobRefNo(job) }}</strong></td>
              <td>
                <span class="badge" :class="getJobTypeBadgeClass(job)">
                  {{ getJobTypeLabel(job) }}
                </span>
              </td>
              <td>
                <div class="font-semibold">{{ job.survey?.customer?.company_name || job.service_report?.customer?.company_name || job.service_request?.customer?.company_name || job.delivery_order?.customer?.company_name || getCustomerName(jobCustomerId(job)) }}</div>
                <div v-if="getJobAddress(job)" class="job-installation-addr" title="Installation Address">
                  📍 {{ getJobAddress(job) }}
                </div>
              </td>
              <td>{{ getJobUnitDisplay(job) }}</td>
              <td>
                <span v-if="jobDate(job)" class="scheduled-date-cell">
                  {{ new Date(jobDate(job)).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) }}
                </span>
                <span v-else class="text-muted">-</span>
              </td>
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
            <div class="m-row" v-if="getJobAddress(job)">
              <span class="m-label">Installation Address</span>
              <span class="m-val text-muted">📍 {{ getJobAddress(job) }}</span>
            </div>
            <div class="m-row">
              <span class="m-label">Unit</span>
              <span class="m-val">{{ getJobUnitDisplay(job) }}</span>
            </div>
            <div class="m-row">
              <span class="m-label">Scheduled Date</span>
              <span class="m-val font-medium">{{ jobDate(job) ? new Date(jobDate(job)).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-' }}</span>
            </div>
          </div>

          <div class="mobile-job-footer">
            <span class="badge" :class="getJobTypeBadgeClass(job)">
              {{ getJobTypeLabel(job) }}
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
              <span class="badge" :class="getJobTypeBadgeClass(printTarget)">
                {{ getJobTypeLabel(printTarget) }}
              </span>
              <span v-if="isJobCopier(printTarget)" class="badge" style="background: rgba(14, 165, 233, 0.15); color: #0284c7; font-weight: 600;">
                COPIER
              </span>
              <span v-else class="badge" style="background: rgba(99, 102, 241, 0.15); color: #4f46e5; font-weight: 600;">
                NON-COPIER
              </span>
            </div>
            <div class="target-info-sub">
              <strong>{{ printTarget.survey?.customer?.company_name || printTarget.service_report?.customer?.company_name || printTarget.service_request?.customer?.company_name || printTarget.delivery_order?.customer?.company_name || getCustomerName(jobCustomerId(printTarget)) }}</strong>
              &bull;
              {{ getJobUnitDisplay(printTarget) }}
            </div>
          </div>
        </div>

        <div class="doc-options-title">Pilih Dokumen yang Ingin Dicetak atau Didownload:</div>

        <div class="doc-options-list">
          <!-- 1. Service History (Selalu Tersedia untuk Semua Unit) -->
          <div class="doc-option-card">
            <div class="doc-option-left">
              <div class="doc-badge-history">HISTORY</div>
              <div>
                <div class="doc-title">Service History</div>
                <div class="doc-desc">
                  Lembar riwayat pengerjaan servis teknisi, status kondisi unit, detail penanganan, foto dokumentasi, dan blok tanda tangan.
                </div>
              </div>
            </div>
            <div class="doc-option-actions">
              <button class="btn btn-sm btn-primary" @click="handlePrintServiceHistory(printTarget)" :disabled="isModalActionLoading">
                🖨️ Print
              </button>
              <button class="btn btn-sm btn-outline" @click="handleDownloadServiceHistory(printTarget)" :disabled="isModalActionLoading">
                📥 PDF
              </button>
            </div>
          </div>

          <!-- 2. Copier Service Report (Hanya jika Unit Mesin Copier dan BUKAN Delivery) -->
          <div v-if="!isDeliveryJob(printTarget) && isJobCopier(printTarget)" class="doc-option-card">
            <div class="doc-option-left">
              <div class="doc-badge-copier">COPIER</div>
              <div>
                <div class="doc-title">Copier Service Report</div>
                <div class="doc-desc">
                  Format khusus mesin fotokopi dengan pencatatan counter meter (Black/White &amp; Color) serta checklist meter reading.
                </div>
              </div>
            </div>
            <div class="doc-option-actions">
              <button class="btn btn-sm btn-primary" @click="handlePrintCopierReport(printTarget)" :disabled="isModalActionLoading">
                🖨️ Print
              </button>
              <button class="btn btn-sm btn-outline" @click="handleDownloadCopierReport(printTarget)" :disabled="isModalActionLoading">
                📥 PDF
              </button>
            </div>
          </div>

          <!-- 3. Technical Report Form (Hanya jika Unit BUKAN Copier dan BUKAN Delivery) -->
          <div v-else-if="!isDeliveryJob(printTarget)" class="doc-option-card">
            <div class="doc-option-left">
              <div class="doc-badge-tech">TECHNICAL</div>
              <div>
                <div class="doc-title">Technical Report Form</div>
                <div class="doc-desc">
                  Laporan teknis servis lengkap (detail masalah unit, tindakan perbaikan teknis, pergantian sparepart, dan rekomendasi).
                </div>
              </div>
            </div>
            <div class="doc-option-actions">
              <button class="btn btn-sm btn-primary" @click="handlePrintTechnicalReport(printTarget)" :disabled="isModalActionLoading">
                🖨️ Print
              </button>
              <button class="btn btn-sm btn-outline" @click="handleDownloadTechnicalReport(printTarget)" :disabled="isModalActionLoading">
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

.date-filter-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.date-tab-buttons {
  display: flex;
  gap: 4px;
}

.btn-date-tab {
  flex: 1;
  padding: 4px 6px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid var(--color-border-light, #e2e8f0);
  background: var(--color-surface, #ffffff);
  color: var(--color-text-muted, #64748b);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: center;
}

.btn-date-tab:hover {
  background: #f1f5f9;
  color: var(--color-text, #0f172a);
}

.btn-date-tab.active {
  background: var(--color-primary, #0066cc);
  border-color: var(--color-primary, #0066cc);
  color: #ffffff;
  font-weight: 600;
}

.job-installation-addr {
  font-size: 11.5px;
  color: var(--color-text-muted, #64748b);
  line-height: 1.3;
  margin-top: 3px;
  max-width: 260px;
  word-break: break-word;
}

.scheduled-date-cell {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--color-text, #0f172a);
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

.doc-badge-spk, .doc-badge-do, .doc-badge-sr, .doc-badge-history, .doc-badge-copier, .doc-badge-tech {
  padding: 4px 8px;
  border-radius: 6px;
  font-weight: 700;
  font-size: 11px;
  flex-shrink: 0;
  letter-spacing: 0.5px;
}

.doc-badge-history {
  background: #fef3c7;
  color: #92400e;
}

.doc-badge-copier {
  background: #e0f2fe;
  color: #0369a1;
}

.doc-badge-tech {
  background: #ede9fe;
  color: #5b21b6;
}

.doc-badge-spk {
  background: #f1f5f9;
  color: #475569;
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
