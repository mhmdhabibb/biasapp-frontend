<script setup lang="ts">
// @ts-nocheck
import PageHeader from '@/components/ui/PageHeader.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import FormModal from '@/components/ui/FormModal.vue'
import SignaturePad from '@/components/ui/SignaturePad.vue'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import { resources } from '@/services/resource.service'
import { findPreviousServiceReportMeter } from '@/utils/meterReading'
import { computed, onMounted, ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const toast = useToast()
const { can } = usePermission()
const route = useRoute()
const router = useRouter()
const { currentUser } = useAuth()
const {
  serviceReports,
  jobOrders,
  contractItems,
  findCustomer,
  findUnit,
  findProduct,
  getTechnicianIdByUser, refreshInBackground } = useMasterStore()

const serviceId = String(route.params.id)
const job = computed(() => jobOrders.value.find(j => String(j.id) === serviceId))
const serviceReport = computed(() => serviceReports.value.find(sr => String(sr.job_order_id) === String(job.value?.id)))

// service_report.technician_id references technicians.id, not users.id
const myTechId = computed(() => getTechnicianIdByUser(currentUser.value?.id || null))
const isPreparingForm = ref(false)

watchEffect(() => {
  if (job.value && myTechId.value && String(job.value.technician_id) !== String(myTechId.value)) {
    toast.error('Unauthorized or Service Not Found')
    router.replace('/technician/dashboard')
  }
})

const customer = computed(() => findCustomer(job.value?.customer_id || job.value?.service_request?.customer_id || (serviceReport.value as any)?.customer_id || null))
// Job order visit (copier) tidak punya unit_id sendiri — unit ada di service report
// yang terhubung via service_report_id, jadi sertakan sebagai fallback.
const unit = computed(() => findUnit(job.value?.unit_id || job.value?.service_request?.unit_id || (serviceReport.value as any)?.unit_id || null) || (serviceReport.value as any)?.unit || null)
const contract = computed(() => {
  const uid = job.value?.unit_id || job.value?.service_request?.unit_id || (serviceReport.value as any)?.unit_id || (unit.value as any)?.id || null
  if (!uid) return null
  return contractItems.value.find(ci => String(ci.unit_id) === String(uid)) || null
})

// ── Delivery jobs (JO dari delivery order) ──
// Hanya job yang benar-benar terhubung ke delivery order (bukan sekadar
// label job_type) yang menampilkan Service History Form.
function hasDeliveryOrder(j: any): boolean {
  if (!j) return false
  if (j.delivery_order_id) return true
  const d = j.delivery_order
  return !!d && (!!d.id || !!d.do_number)
}
const isDeliveryJob = computed(() => hasDeliveryOrder(job.value))
// Visit copier: hanya form Copier Service Report yang ditampilkan,
// Technical Report disembunyikan.
const isVisitJob = computed(() => {
  const j: any = job.value
  const sr: any = serviceReport.value
  return (
    String(j?.job_type || '').toLowerCase() === 'visit' ||
    String(j?.taskType || '').toLowerCase() === 'visit' ||
    String(sr?.service_type || '').toLowerCase() === 'copier'
  )
})
const deliveryOrder = computed(() => (job.value as any)?.delivery_order || null)
const doCustomer = computed(() => deliveryOrder.value?.customer || findCustomer(deliveryOrder.value?.customer_id || null) || null)
const doItems = computed(() => deliveryOrder.value?.delivery_order_items || [])
function doItemLabel(item: any): string {
  if (item?.unit_id) {
    const u: any = findUnit(item.unit_id)
    const name = item.unit?.model || u?.model || 'Unit'
    const sn = item.unit?.serial_no || u?.serial_no || ''
    return `${name}${sn ? ` (${sn})` : ''} x${item.qty || 1}`
  }
  if (item?.product_id) {
    const p: any = findProduct(item.product_id)
    return `${item.product?.name || p?.name || 'Product'} x${item.qty || 1}`
  }
  return `Item x${item?.qty || 1}`
}

const doForm = ref({
  problem: '',
  action: '',
  time_in: '',
  time_out: '',
  is_tested: false,
  is_completed: false,
  customer_signature: '',
  technician_signature: '',
  customer_name: '',
  technician_name: '',
  customer_category: '',
})
const isDoFormInit = ref(false)
const isSavingDoForm = ref(false)

const customerCategoryOptions = [
  { value: 'Corporate', label: 'Corporate' },
  { value: 'Government', label: 'Government' },
]

function initDoForm() {
  const d: any = deliveryOrder.value
  if (!d || isDoFormInit.value) return
  const theCustomer = doCustomer.value || customer.value
  doForm.value = {
    problem: d.problem || '',
    action: d.action || '',
    time_in: d.time_in || '',
    time_out: d.time_out || '',
    is_tested: !!d.is_tested,
    is_completed: !!d.is_completed,
    customer_signature: d.customer_signature || '',
    technician_signature: d.technician_signature || '',
    customer_name: d.customer_name || (theCustomer?.pic_name || theCustomer?.name || ''),
    technician_name: d.technician_name || currentUser.value?.name || '',
    customer_category: d.customer_category || theCustomer?.category || '',
  }
  isDoFormInit.value = true
}

const lastInitJobId = ref<string | null>(null)
watchEffect(() => {
  const jid = String((job.value as any)?.id || '')
  if (jid && lastInitJobId.value !== jid) {
    lastInitJobId.value = jid
    isDoFormInit.value = false
  }
  if (isDeliveryJob.value && deliveryOrder.value && !isDoFormInit.value) initDoForm()
})

const isDeliveryFormCompleted = computed(() => {
  const f = doForm.value
  return !!(f.action || '').trim() && f.is_tested && f.is_completed && !!f.customer_signature && !!f.technician_signature && !!(f.customer_name || '').trim()
})

function nowHM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function acceptDeliveryJob() {
  if (!job.value || !deliveryOrder.value) return
  if (!confirm('Are you sure you want to accept this delivery job now? Start time (time_in) will be recorded.')) return
  isSavingDoForm.value = true
  try {
    const timeIn = nowHM()
    await api.patch(`/job-orders/${job.value.id}`, { status: 'in_progress' })
    await api.patch(`/delivery-orders/${deliveryOrder.value.id}`, { status: 'in_transit', time_in: timeIn })
    doForm.value.time_in = timeIn
    toast.success('Delivery job accepted. Start time recorded.')
    await refreshInBackground()
    initDoForm()
  } catch (err: any) {
    toast.error(err.message || 'Failed to accept delivery job')
  } finally {
    isSavingDoForm.value = false
  }
}

async function saveDeliveryForm(silent = false) {
  if (!deliveryOrder.value) return false
  isSavingDoForm.value = true
  try {
    await api.patch(`/delivery-orders/${deliveryOrder.value.id}`, { ...doForm.value })
    await refreshInBackground()
    if (!silent) toast.success('Service history saved.')
    return true
  } catch (err: any) {
    toast.error(err.message || 'Failed to save service history')
    return false
  } finally {
    isSavingDoForm.value = false
  }
}

async function completeDeliveryJob() {
  if (!job.value || !deliveryOrder.value) return
  if (!isDeliveryFormCompleted.value) {
    toast.warning('Please complete the service history form first (action, tested, completed + signatures).')
    return
  }
  if (!confirm('Are you sure you want to complete this delivery? End time (time_out) will be recorded.')) return
  isSavingDoForm.value = true
  try {
    const timeOut = nowHM()
    doForm.value.time_out = timeOut
    const ok = await saveDeliveryForm(true)
    if (!ok) return
    await api.patch(`/delivery-orders/${deliveryOrder.value.id}`, { status: 'delivered', time_out: timeOut })
    await api.patch(`/job-orders/${job.value.id}`, { status: 'completed', completed_at: new Date().toISOString() })
    toast.success('Delivery completed. End time recorded.')
    await refreshInBackground()
    router.push('/technician/call-services')
  } catch (err: any) {
    toast.error(err.message || 'Failed to complete delivery')
  } finally {
    isSavingDoForm.value = false
  }
}

const slaDurationStr = computed(() => {
  if (!job.value) return '-'
  const created = new Date(job.value.created_at).getTime()
  const end = (job.value.status === 'completed' && job.value.time_out)
    ? new Date(job.value.time_out).getTime()
    : new Date().getTime()
  const hours = (end - created) / (1000 * 60 * 60)
  return `${hours.toFixed(1)} Hours`
})

// Form states managed in separate pages now
const numVal = (v: any) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
function resolveBeforeMeter(): number {
  const sr: any = serviceReport.value
  const saved = numVal(sr?.meter_reading_before) || numVal(sr?.reading_counter)
  if (saved > 0) return saved
  const previousVisit = findPreviousServiceReportMeter(sr || {
    unit_id: job.value?.unit_id || job.value?.service_request?.unit_id,
    customer_id: job.value?.customer_id || job.value?.service_request?.customer_id,
    service_date: new Date().toISOString(),
  }, serviceReports.value, contractItems.value)
  if (previousVisit !== null) return previousVisit
  const u: any = unit.value
  const fromUnit = numVal(u?.current_meter_bw) || numVal(u?.current_meter_color)
  if (fromUnit > 0) return fromUnit
  const c: any = contract.value
  const fromContract = numVal(c?.start_mono_value) || numVal(c?.start_color_value)
  return fromContract > 0 ? fromContract : 0
}
// JO service (dari service request) TIDAK memakai form Service Report:
// cukup Technical Report (+ Copier bila copier).
const isAllFormsCompleted = computed(() => {
  const sr: any = serviceReport.value
  if (!sr) return false
  const techOk = !!(sr.remarks || job.value?.remarks) && (sr.is_tested ?? job.value?.is_tested)

  const techSigOk = !!sr?.customer_signature_technical && !!sr?.technician_signature_technical

  let copierOk = true
  let copierSigOk = true
  if (isVisitJob.value || unit.value?.is_copier || unit.value?.model?.toLowerCase().includes('copier')) {
    copierOk = (numVal(sr.meter_reading_after) || numVal(sr.reading_counter)) > 0
    copierSigOk = !!sr?.customer_signature_copier && !!sr?.technician_signature_copier
  }

  // Visit copier: cukup form copier (meter + tanda tangan copier),
  // Technical Report tidak wajib.
  if (isVisitJob.value) return copierOk && copierSigOk

  const signaturesOk = techSigOk && copierSigOk
  return techOk && signaturesOk && copierOk
})

onMounted(() => refreshInBackground())

// --- Custom confirmation modal state ---
const showAcceptModal = ref(false)
const showCompleteModal = ref(false)
const isCompletingJob = ref(false)

// --- Add Unit Form ---
const showAddUnitModal = ref(false)
const isSavingUnit = ref(false)
const unitForm = ref({
  serial_no: '',
  brand_id: null,
  model: '',
})

async function submitUnitForm() {
  if (!unitForm.value.serial_no || !unitForm.value.model || !unitForm.value.brand_id) {
    toast.warning('Silakan isi Serial Number, Brand, dan Model.')
    return
  }
  isSavingUnit.value = true
  try {
    const { brands } = useMasterStore()
    const b: any = brands.find((x: any) => x.id === unitForm.value.brand_id)
    const brandName = b ? b.name : ''
    
    const payload = {
      ...unitForm.value,
      name: `${brandName} ${unitForm.value.model}`,
      is_copier: true,
      is_computer: false,
    }
    await resources.units.create(payload)
    toast.success('Unit berhasil didaftarkan.')
    showAddUnitModal.value = false
    await refreshInBackground()
  } catch (e: any) {
    toast.error('Gagal mendaftarkan unit: ' + e.message)
  } finally {
    isSavingUnit.value = false
  }
}

// --- Edit SN Form ---
const showEditSnModal = ref(false)
const isSavingSn = ref(false)
const editSnForm = ref({
  id: '',
  serial_no: ''
})

function openEditSn(unitObj: any) {
  editSnForm.value.id = String(unitObj.unit_id || unitObj.id)
  editSnForm.value.serial_no = unitObj.unit?.serial_no || unitObj.serial_no || ''
  showEditSnModal.value = true
}

async function submitEditSn() {
  if (!editSnForm.value.serial_no) {
    toast.warning('Silakan isi Serial Number.')
    return
  }
  isSavingSn.value = true
  try {
    await resources.units.update(editSnForm.value.id, { serial_no: editSnForm.value.serial_no })
    toast.success('Serial Number berhasil diupdate.')
    showEditSnModal.value = false
    await refreshInBackground()
  } catch (e: any) {
    toast.error('Gagal update SN: ' + e.message)
  } finally {
    isSavingSn.value = false
  }
}
// --------------------

async function ensureServiceReport(now: string) {
  await refreshInBackground()
  if (serviceReport.value) return serviceReport.value

  const unitId = job.value?.unit_id || job.value?.service_request?.unit_id || unit.value?.id
  const customerId = job.value?.customer_id || job.value?.service_request?.customer_id || customer.value?.id
  if (!unitId || !customerId) {
    throw new Error('Unit or customer on this job is incomplete. Contact admin to complete the data.')
  }

  await api.post('/service-reports', {
    report_no: `SR-${Date.now().toString().slice(-6)}`,
    job_order_id: job.value.id,
    unit_id: String(unitId),
    customer_id: String(customerId),
    customer_category: customer.value?.category || job.value?.customer?.category || '',
    technician_id: job.value.technician_id,
    service_type: 'repair',
    status: 'in_progress',
    time_in: now,
    machine_problem: job.value.instructions || job.value.service_request?.problem_description || '-',
    project_name: '-',
    repair_action: '-',
    service_date: now,
    time_out: '-',
    meter_reading_before: resolveBeforeMeter(),
  })

  await refreshInBackground()
  if (!serviceReport.value) {
    throw new Error('Report created successfully, but it could not be loaded yet. Please try again.')
  }
  return serviceReport.value
}

async function acceptJob() {
  if (!job.value) return
  if (isPreparingForm.value) return
  isPreparingForm.value = true

  if (job.value.status === 'in_progress') {
    try {
      await ensureServiceReport(new Date().toISOString())
      toast.success('Inspection form is ready to use.')
    } catch (err: any) {
      toast.error(err.message || 'Failed to prepare inspection form')
    } finally {
      isPreparingForm.value = false
    }
    return
  }
  showAcceptModal.value = true
  isPreparingForm.value = false
}

async function confirmAcceptJob() {
  showAcceptModal.value = false
  isPreparingForm.value = true
  try {
    const now = new Date().toISOString()
    const report = await ensureServiceReport(now)
    await api.patch(`/service-reports/${report.id}`, {
      status: 'in_progress',
      time_in: report.time_in || now,
    })
    await api.patch(`/job-orders/${job.value.id}`, { status: 'in_progress' })

    toast.success('Job accepted. Start time recorded.')
    await refreshInBackground()
  } catch (err: any) {
    toast.error(err.message || 'Failed to accept job')
  } finally {
    isPreparingForm.value = false
  }
}

function requestSparepart() {
  router.push(`/technician/sparepart-request?service_id=${serviceId}`)
}

async function completeJob() {
  if (!job.value) return
  if (!isAllFormsCompleted.value) {
    toast.warning('Please complete all forms first!')
    return
  }
  showCompleteModal.value = true
}

async function confirmCompleteJob() {
  showCompleteModal.value = false
  isCompletingJob.value = true
  try {
    const now = new Date().toISOString()

    await api.patch(`/job-orders/${job.value.id}`, { status: 'completed', completed_at: now })
    
    if (serviceReport.value) {
      await api.patch(`/service-reports/${serviceReport.value.id}`, {
        status: 'completed',
        is_completed: true,
        time_out: now,
      })
    }

    toast.success('Job completed! Sparepart replacement data queued for Procurement.')
    await refresh(true)
    router.push('/technician/call-services')
  } catch (err: any) {
    toast.error(err.message || 'Failed to complete job')
  } finally {
    isCompletingJob.value = false
  }
}
</script>

<template>
  <div class="tech-job-detail" v-if="job">
    <PageHeader :title="isDeliveryJob ? 'Delivery Job Detail' : 'Call Service Detail'" :back-button="true" @back="router.back()" />

    <div v-if="isDeliveryJob" class="grid-2">
      <!-- Info Section (Delivery Order data) -->
      <div class="card p-lg">
        <h2 class="card-title mb-md">Delivery Information</h2>
        <div class="info-list">
          <div class="info-item">
            <span class="info-label">Job Order No</span>
            <span class="info-value font-bold">{{ job.job_order_no }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">DO Number</span>
            <span class="info-value font-bold">{{ deliveryOrder?.do_number || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Customer</span>
            <span class="info-value">{{ doCustomer?.company_name || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Delivery Address</span>
            <span class="info-value">{{ deliveryOrder?.delivery_address || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Recipient & Contact</span>
            <span class="info-value">{{ deliveryOrder?.recipient_name || '-' }} ({{ deliveryOrder?.recipient_phone || '-' }})</span>
          </div>
          <div class="info-item">
            <span class="info-label">Delivery Date</span>
            <span class="info-value">{{ deliveryOrder?.delivery_date ? new Date(deliveryOrder.delivery_date).toLocaleString('en-GB') : '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">DO Status</span>
            <span class="badge" :class="'badge-' + (deliveryOrder?.status === 'delivered' ? 'success' : deliveryOrder?.status === 'in_transit' ? 'info' : 'warning')">
              {{ String(deliveryOrder?.status || '-').toUpperCase().replace('_', ' ') }}
            </span>
          </div>
          <div class="info-item">
            <span class="info-label">Job Status</span>
            <span class="badge" :class="'badge-' + (job.status === 'completed' ? 'success' : job.status === 'in_progress' ? 'info' : 'warning')">
              {{ job.status.toUpperCase().replace('_', ' ') }}
            </span>
          </div>
          <div class="info-item">
            <span class="info-label">Duration / SLA</span>
            <span class="info-value">{{ slaDurationStr }} (Limit: 2 Hours)</span>
          </div>
        </div>

        <div class="mt-lg pt-md" style="border-top: 1px solid var(--color-border-light)">
          <h3 class="text-md font-bold mb-sm">Items ({{ doItems.length }})</h3>
          <div v-if="doItems.length > 0">
            <div v-for="(it, idx) in doItems" :key="idx" class="text-sm p-md mb-sm" style="background: var(--color-surface-sunken); border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center;">
              <span>{{ idx + 1 }}. {{ doItemLabel(it) }}</span>
              <button v-if="it.unit_id && job.status === 'in_progress'" class="btn btn-outline btn-sm" style="padding: 2px 8px; font-size: 0.7rem;" @click="openEditSn(it)">Edit SN</button>
            </div>
          </div>
          <p v-else class="text-sm text-muted">No items.</p>
          <div class="mt-md" v-if="job.status === 'in_progress'">
            <button class="btn btn-outline btn-sm w-full" @click="showAddUnitModal = true">
              ➕ Tambah / Daftarkan Unit Baru
            </button>
          </div>
        </div>

        <div class="mt-lg pt-md" style="border-top: 1px solid var(--color-border-light)">
          <h3 class="text-md font-bold mb-sm">Instructions</h3>
          <p class="text-sm p-md" style="background: var(--color-surface-sunken); border-radius: var(--radius-md);">
            {{ job.instructions || deliveryOrder?.notes || 'No notes.' }}
          </p>
        </div>
      </div>

      <!-- Action Section (Service History form) -->
      <div class="card p-lg">
        <h2 class="card-title mb-md">Service History Form</h2>

        <div v-if="job.status === 'assigned' || job.status === 'pending' || job.status === 'scheduled'" class="text-center py-xl">
          <p class="mb-lg text-muted">You have not accepted this delivery yet.</p>
          <button v-if="can('delivery_order:update')" class="btn btn-primary" style="padding: var(--space-md) var(--space-xl); font-size: 16px;" :disabled="isSavingDoForm" @click="acceptDeliveryJob">
            {{ isSavingDoForm ? 'Accepting...' : 'Accept Delivery Job' }}
          </button>
        </div>

        <div v-else-if="job.status === 'in_progress'">
          <div class="form-group">
            <label class="form-label">Problem</label>
            <textarea v-model="doForm.problem" class="form-textarea" rows="3" placeholder="Describe the problem..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Customer Type</label>
            <CustomSelect v-model="doForm.customer_category" class="form-select" :options="customerCategoryOptions" disabled title="Customer type follows the delivery order data" />
          </div>
          <div class="form-group">
            <label class="form-label">Action / Repair <span class="text-danger">*</span></label>
            <textarea v-model="doForm.action" class="form-textarea" rows="3" placeholder="Action taken..."></textarea>
          </div>
          <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Time In (Auto)</label>
              <input v-model="doForm.time_in" type="time" class="form-input" readonly disabled>
            </div>
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Time Out (Auto)</label>
              <input v-model="doForm.time_out" type="time" class="form-input" readonly disabled placeholder="Auto at completion">
            </div>
          </div>
          <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem;">
            <label style="display: flex; align-items: center; gap: 0.5rem;">
              <input type="checkbox" v-model="doForm.is_tested"> Is Tested?
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem;">
              <input type="checkbox" v-model="doForm.is_completed"> Is Completed?
            </label>
          </div>
          <div style="display: flex; gap: 1rem; margin-top: 1rem;">
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Technician Name</label>
              <input v-model="doForm.technician_name" type="text" class="form-input" readonly disabled>
              <label class="form-label mt-sm">Technician Signature <span class="text-danger">*</span></label>
              <SignaturePad v-model="doForm.technician_signature" height="150px" />
            </div>
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Customer / PIC Name <span class="text-danger">*</span></label>
              <input v-model="doForm.customer_name" type="text" class="form-input" placeholder="Customer PIC name">
              <label class="form-label mt-sm">Customer Signature <span class="text-danger">*</span></label>
              <SignaturePad v-model="doForm.customer_signature" height="150px" />
            </div>
          </div>
          <div class="mt-lg" style="display: flex; gap: 0.75rem;">
            <button v-if="can('delivery_order:update')" class="btn btn-outline" style="flex: 1; padding: var(--space-md);" :disabled="isSavingDoForm" @click="saveDeliveryForm()">
              {{ isSavingDoForm ? 'Saving...' : 'Save Draft' }}
            </button>
            <button v-if="can('delivery_order:update')" class="btn btn-primary" style="flex: 2; padding: var(--space-md); font-size: 16px;" :disabled="isSavingDoForm || !isDeliveryFormCompleted" @click="completeDeliveryJob">
              {{ isSavingDoForm ? 'Saving...' : (isDeliveryFormCompleted ? '✅ Complete Delivery' : '🔒 Complete Form First') }}
            </button>
          </div>
        </div>

        <div v-else-if="job.status === 'completed'">
          <div class="form-group">
            <label class="form-label">Problem</label>
            <div class="p-sm text-sm" style="background: var(--color-surface-sunken); border-radius: var(--radius-sm); white-space: pre-wrap;">{{ deliveryOrder?.problem || '-' }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Action / Repair</label>
            <div class="p-sm text-sm" style="background: var(--color-surface-sunken); border-radius: var(--radius-sm); white-space: pre-wrap;">{{ deliveryOrder?.action || '-' }}</div>
          </div>
          <div class="form-group mt-md" style="padding: 12px; border: 1px dashed var(--color-border); border-radius: var(--radius-md);">
            <div class="text-sm font-bold mb-xs">Timestamps</div>
            <div class="text-sm text-muted">Start (Time In): <strong>{{ deliveryOrder?.time_in || '-' }}</strong></div>
            <div class="text-sm text-muted">End (Time Out): <strong>{{ deliveryOrder?.time_out || '-' }}</strong></div>
          </div>
          <div class="form-group mt-md" style="padding: 12px; border: 1px dashed var(--color-border); border-radius: var(--radius-md);">
            <div class="text-sm font-bold mb-xs">Signatures</div>
            <div class="text-sm text-muted">Technician: <strong>{{ deliveryOrder?.technician_name || '-' }} ({{ deliveryOrder?.technician_signature ? 'Signed' : '-' }})</strong></div>
            <div class="text-sm text-muted">Customer: <strong>{{ deliveryOrder?.customer_name || '-' }} ({{ deliveryOrder?.customer_signature ? 'Signed' : '-' }})</strong></div>
          </div>
          <div class="mt-md text-success font-bold flex items-center gap-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Delivery completed on {{ job.completed_at ? new Date(job.completed_at).toLocaleString('en-GB') : '-' }}
          </div>
        </div>
      </div>
    </div>

    <div class="grid-2" v-if="!isDeliveryJob">
      <!-- Info Section -->
      <div class="card p-lg">
        <h2 class="card-title mb-md">Service Information</h2>
        <div class="info-list">
          <div class="info-item">
            <span class="info-label">Job Order No</span>
            <span class="info-value font-bold">{{ job.job_order_no }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Customer</span>
            <span class="info-value">{{ customer?.company_name || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Address</span>
            <span class="info-value">{{ customer?.address || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">PIC & Contact</span>
            <span class="info-value">{{ customer?.name || '-' }} ({{ customer?.phone || '-' }})</span>
          </div>
          <div class="info-item">
            <span class="info-label">Unit</span>
            <span class="info-value">{{ unit?.model || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Serial Number</span>
            <span class="info-value">
              {{ unit?.serial_no || '-' }}
              <button v-if="unit?.id && job.status === 'in_progress'" class="btn btn-outline btn-sm" style="margin-left: 8px; padding: 2px 8px; font-size: 0.7rem;" @click="openEditSn(unit)">Edit</button>
            </span>
          </div>
          <div class="info-item">
            <span class="info-label">Contract</span>
            <span class="info-value">{{ contract?.contract_no || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Status</span>
            <span class="badge" :class="'badge-' + (job.status === 'completed' ? 'success' : job.status === 'in_progress' ? 'info' : 'warning')">
              {{ job.status.toUpperCase().replace('_', ' ') }}
            </span>
          </div>
          <div class="info-item">
            <span class="info-label">Duration / SLA</span>
            <span class="info-value">{{ slaDurationStr }} (Limit: 2 Hours)</span>
          </div>
        </div>

        <div class="mt-lg pt-md" style="border-top: 1px solid var(--color-border-light)">
          <h3 class="text-md font-bold mb-sm">Instructions / Complaint</h3>
          <p class="text-sm p-md" style="background: var(--color-surface-sunken); border-radius: var(--radius-md);">
            {{ job.instructions || job.service_request?.problem_description || 'No notes.' }}
          </p>
        </div>
      </div>

      <!-- Action Section -->
      <div class="card p-lg">
        <h2 class="card-title mb-md">Inspection Form</h2>

        <div v-if="job.status === 'assigned' || job.status === 'pending' || job.status === 'scheduled'" class="text-center py-xl">
          <p class="mb-lg text-muted">You have not accepted this job yet.</p>
          <button v-if="can('service_report:update')" class="btn btn-primary" style="padding: var(--space-md) var(--space-xl); font-size: 16px;" @click="acceptJob">
            {{ isPreparingForm ? 'Preparing form...' : 'Accept Job' }}
          </button>
        </div>

        <div v-else-if="job.status === 'in_progress'">
          <div v-if="!serviceReport" class="mb-lg p-md text-center text-muted" style="background: var(--color-surface-sunken); border-radius: var(--radius-md);">
            <p class="text-sm mb-sm">Inspection form is not available yet.</p>
            <button v-if="can('service_report:update')" class="btn btn-outline" :disabled="isPreparingForm" @click="acceptJob">
              {{ isPreparingForm ? 'Preparing form...' : 'Try Preparing Form' }}
            </button>
          </div>
          <div v-else>
            <div class="mb-lg p-md" style="background: var(--color-surface-sunken); border-radius: var(--radius-md);">
              <p class="font-bold mb-xs">Complete Service Forms</p>
              <p class="text-sm text-muted">Open and fill in each form below. Status will turn into a checklist (✅) once completed.</p>
            </div>
          </div>

          <div class="form-list" v-if="serviceReport">
            <button v-if="!isVisitJob" class="btn btn-outline w-full mb-sm text-left flex justify-between items-center p-md" @click="router.push(`/technician/call-services/${serviceReport?.id}/technical-report`)">
              <span class="font-bold"><span v-if="serviceReport?.remarks && serviceReport?.is_tested">✅</span><span v-else>📝</span> 1. Technical Report</span>
              <span>></span>
            </button>
            <button
              v-if="(unit?.is_copier || unit?.model?.toLowerCase().includes('copier')) && serviceReport?.status !== 'draft'"
              class="btn btn-outline w-full mb-sm text-left flex justify-between items-center p-md"
              @click="router.push(`/technician/call-services/${serviceReport?.id}/copier-report`)"
            >
              <span class="font-bold"><span v-if="serviceReport?.meter_reading_after || serviceReport?.reading_counter">✅</span><span v-else>📝</span> {{ isVisitJob ? '1' : '2' }}. Copier Service Report</span>
              <span>></span>
            </button>
            <div
              v-else-if="unit?.is_copier || unit?.model?.toLowerCase().includes('copier')"
              class="p-md text-sm text-muted"
              style="background: var(--color-surface-sunken); border-radius: var(--radius-md); margin-bottom: 8px;"
            >
              📋 Copier visit is <b>draft</b> (not assigned yet). Visit akan muncul setelah di-assign oleh CS.
            </div>
          </div>

       

          <div class="mt-xl pt-md" style="border-top: 1px solid var(--color-border-light)">
            <button v-if="can('service_report:update')" class="btn btn-primary w-full" :disabled="!isAllFormsCompleted" style="padding: var(--space-md); font-size: 16px;" @click="completeJob">
              {{ isAllFormsCompleted ? '✅ Complete Service' : '🔒 Complete Forms First' }}
            </button>
          </div>
        </div>

        <div v-else-if="job.status === 'completed'">
          <div class="form-group">
            <label class="form-label">Inspection Result</label>
            <div class="p-sm text-sm" style="background: var(--color-surface-sunken); border-radius: var(--radius-sm); white-space: pre-wrap;">{{ serviceReport?.remarks || '-' }}</div>
          </div>
          <div class="form-group" v-if="serviceReport?.repair_action && serviceReport.repair_action !== '-'">
            <label class="form-label">Repair Action</label>
            <div class="p-sm text-sm" style="background: var(--color-surface-sunken); border-radius: var(--radius-sm)">{{ serviceReport?.repair_action }}</div>
          </div>
                    <div class="form-group mt-md" style="padding: 12px; border: 1px dashed var(--color-border); border-radius: var(--radius-md);">
            <label class="form-label">Direct Component Replacement</label>
            <div v-if="serviceReport?.service_spareparts && serviceReport.service_spareparts.length > 0">
              <div v-for="sp in serviceReport.service_spareparts" :key="sp.id" class="text-sm p-sm" style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span>{{ sp.product?.name || findProduct(sp.product_id)?.name || '-' }}</span>
                <span class="font-bold">x {{ sp.qty }}</span>
              </div>
            </div>
            <div v-else class="text-sm text-muted">No component replacement.</div>
          </div>

          <div class="mt-md text-success font-bold flex items-center gap-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Job was completed on {{ job.completed_at ? new Date(job.completed_at).toLocaleString('en-GB') : '-' }}
          </div>

          <div class="mt-lg">
            <button class="btn btn-primary w-full" style="padding: var(--space-md); font-size: 16px;" @click="router.push(`/shared/service-reports/${serviceReport?.id}`)">
              📄 View Full Report (Digital)
            </button>
          </div>
        </div>

      </div>
    </div>

    <!-- ========== ACCEPT JOB MODAL ========== -->
    <Teleport to="body">
      <Transition name="confirm-modal">
        <div v-if="showAcceptModal" class="confirm-overlay" @click.self="showAcceptModal = false">
          <div class="confirm-dialog">
            <div class="confirm-ribbon confirm-ribbon--blue"></div>
            <div class="confirm-body">
              <div class="confirm-icon-circle confirm-icon--blue">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
              </div>
              <h3 class="confirm-heading">Accept This Job?</h3>
              <p class="confirm-text">
                Start time <strong>(time_in)</strong> will be recorded once you accept.
                Make sure you are ready to begin the service.
              </p>
              <div class="confirm-info-card">
                <div class="confirm-info-row">
                  <span class="confirm-info-label">Job Order</span>
                  <span class="confirm-info-value">{{ job?.job_order_no }}</span>
                </div>
                <div class="confirm-info-row">
                  <span class="confirm-info-label">Customer</span>
                  <span class="confirm-info-value">{{ customer?.company_name || '-' }}</span>
                </div>
              </div>
              <div class="confirm-buttons">
                <button class="confirm-btn-cancel" @click="showAcceptModal = false">Cancel</button>
                <button class="confirm-btn-primary confirm-btn--blue" @click="confirmAcceptJob">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  Accept &amp; Start
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ========== COMPLETE JOB MODAL ========== -->
    <Teleport to="body">
      <Transition name="confirm-modal">
        <div v-if="showCompleteModal" class="confirm-overlay" @click.self="showCompleteModal = false">
          <div class="confirm-dialog">
            <div class="confirm-ribbon confirm-ribbon--green"></div>
            <div class="confirm-body">
              <div class="confirm-icon-circle confirm-icon--green">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <h3 class="confirm-heading">Complete This Job?</h3>
              <p class="confirm-text">
                Finish time <strong>(time_out)</strong> will be recorded and the job
                will be marked as <strong>completed</strong>. This action cannot be undone.
              </p>
              <div class="confirm-info-card">
                <div class="confirm-info-row">
                  <span class="confirm-info-label">Job Order</span>
                  <span class="confirm-info-value">{{ job?.job_order_no }}</span>
                </div>
                <div class="confirm-info-row">
                  <span class="confirm-info-label">Customer</span>
                  <span class="confirm-info-value">{{ customer?.company_name || '-' }}</span>
                </div>
                <div class="confirm-info-row">
                  <span class="confirm-info-label">Duration</span>
                  <span class="confirm-info-value">{{ slaDurationStr }}</span>
                </div>
              </div>
              <div class="confirm-buttons">
                <button class="confirm-btn-cancel" @click="showCompleteModal = false">Cancel</button>
                <button class="confirm-btn-primary confirm-btn--green" :disabled="isCompletingJob" @click="confirmCompleteJob">
                  <svg v-if="!isCompletingJob" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <span v-if="isCompletingJob" class="confirm-loading-spinner"></span>
                  {{ isCompletingJob ? 'Completing...' : 'Yes, Complete Job' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ========== ADD UNIT MODAL ========== -->
    <FormModal :open="showAddUnitModal" title="Daftarkan Unit Baru (DO)" @close="showAddUnitModal = false" @submit="submitUnitForm">
      <div class="form-group">
        <label class="form-label">Serial Number <span class="text-danger">*</span></label>
        <input v-model="unitForm.serial_no" type="text" class="form-input" placeholder="Masukkan Serial Number">
      </div>
      <div class="form-group mt-sm">
        <label class="form-label">Brand <span class="text-danger">*</span></label>
        <CustomSelect v-model="unitForm.brand_id" :options="useMasterStore().brands.map((b: any) => ({ value: b.id, label: b.name }))" placeholder="-- Pilih Brand --" />
      </div>
      <div class="form-group mt-sm">
        <label class="form-label">Model <span class="text-danger">*</span></label>
        <input v-model="unitForm.model" type="text" class="form-input" placeholder="Masukkan Model Mesin">
      </div>
      <template #footer>
        <button class="btn btn-outline" @click="showAddUnitModal = false">Batal</button>
        <button class="btn btn-primary" :disabled="isSavingUnit" @click="submitUnitForm">
          {{ isSavingUnit ? 'Menyimpan...' : 'Simpan Unit' }}
        </button>
      </template>
    </FormModal>

    <!-- ========== EDIT SN MODAL ========== -->
    <FormModal :open="showEditSnModal" title="Edit Serial Number Unit" @close="showEditSnModal = false" @submit="submitEditSn">
      <div class="form-group">
        <label class="form-label">Serial Number Baru <span class="text-danger">*</span></label>
        <input v-model="editSnForm.serial_no" type="text" class="form-input" placeholder="Masukkan Serial Number">
      </div>
      <template #footer>
        <button class="btn btn-outline" @click="showEditSnModal = false">Batal</button>
        <button class="btn btn-primary" :disabled="isSavingSn" @click="submitEditSn">
          {{ isSavingSn ? 'Menyimpan...' : 'Update SN' }}
        </button>
      </template>
    </FormModal>

  </div>
</template>

<style scoped>
.grid-2 {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-lg);
}
@media (min-width: 1024px) {
  .grid-2 {
    grid-template-columns: 1fr 1.5fr;
  }
}
.info-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}
.info-item {
  display: flex;
  flex-direction: column;
}
.info-label {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  margin-bottom: 2px;
}
.info-value {
  font-size: var(--font-size-sm);
  color: var(--color-text);
}
</style>

<!-- Non-scoped: modal is Teleported to body -->
<style>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.confirm-dialog {
  background: var(--color-surface, #fff);
  border-radius: 20px;
  width: 100%;
  max-width: 400px;
  box-shadow:
    0 24px 48px -12px rgba(0, 0, 0, 0.25),
    0 0 0 1px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.confirm-ribbon {
  height: 5px;
  width: 100%;
}
.confirm-ribbon--blue {
  background: linear-gradient(90deg, #3b82f6, #6366f1, #8b5cf6);
}
.confirm-ribbon--green {
  background: linear-gradient(90deg, #10b981, #059669, #047857);
}

.confirm-body {
  padding: 28px 24px 24px;
  text-align: center;
}

.confirm-icon-circle {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  animation: confirmBounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.confirm-icon--blue {
  background: linear-gradient(135deg, #eff6ff, #dbeafe);
  color: #3b82f6;
  box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.08);
}
.confirm-icon--green {
  background: linear-gradient(135deg, #ecfdf5, #d1fae5);
  color: #059669;
  box-shadow: 0 0 0 6px rgba(16, 185, 129, 0.08);
}

@keyframes confirmBounceIn {
  0% { transform: scale(0); opacity: 0; }
  60% { transform: scale(1.15); }
  100% { transform: scale(1); opacity: 1; }
}

.confirm-heading {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text, #111827);
  margin: 0 0 8px;
  letter-spacing: -0.2px;
}

.confirm-text {
  font-size: 13.5px;
  color: var(--color-text-secondary, #6b7280);
  margin: 0 0 20px;
  line-height: 1.55;
}

.confirm-info-card {
  background: var(--color-surface-sunken, #f8fafc);
  border: 1px solid var(--color-border-light, #f1f5f9);
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 20px;
}

.confirm-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
}
.confirm-info-row + .confirm-info-row {
  border-top: 1px solid var(--color-border-light, #f1f5f9);
}

.confirm-info-label {
  font-size: 11.5px;
  color: var(--color-text-muted, #9ca3af);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  font-weight: 600;
}

.confirm-info-value {
  font-size: 13px;
  color: var(--color-text, #111827);
  font-weight: 600;
  max-width: 55%;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.confirm-buttons {
  display: flex;
  gap: 10px;
}

.confirm-btn-cancel,
.confirm-btn-primary {
  flex: 1;
  padding: 11px 16px;
  border-radius: 12px;
  font-size: 13.5px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s ease;
  min-height: 44px;
}

.confirm-btn-cancel {
  background: var(--color-surface-sunken, #f1f5f9);
  color: var(--color-text-secondary, #64748b);
}
.confirm-btn-cancel:hover {
  background: #e2e8f0;
  color: var(--color-text, #111827);
}

.confirm-btn--blue {
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: #fff;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
}
.confirm-btn--blue:hover {
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
  transform: translateY(-1px);
}

.confirm-btn--green {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
}
.confirm-btn--green:hover {
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
  transform: translateY(-1px);
}
.confirm-btn--green:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  transform: none !important;
}

.confirm-loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: confirmSpin 0.65s linear infinite;
}

@keyframes confirmSpin {
  to { transform: rotate(360deg); }
}

/* Transition */
.confirm-modal-enter-active {
  transition: opacity 0.25s ease;
}
.confirm-modal-enter-active .confirm-dialog {
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease;
}
.confirm-modal-leave-active {
  transition: opacity 0.2s ease;
}
.confirm-modal-leave-active .confirm-dialog {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.confirm-modal-enter-from {
  opacity: 0;
}
.confirm-modal-enter-from .confirm-dialog {
  transform: scale(0.92) translateY(12px);
  opacity: 0;
}
.confirm-modal-leave-to {
  opacity: 0;
}
.confirm-modal-leave-to .confirm-dialog {
  transform: scale(0.96) translateY(6px);
  opacity: 0;
}
</style>
