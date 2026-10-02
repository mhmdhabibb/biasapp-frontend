<script setup lang="ts">
// @ts-nocheck
import PageHeader from '@/components/ui/PageHeader.vue'
import SignaturePad from '@/components/ui/SignaturePad.vue'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
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
  getTechnicianIdByUser,
  refresh
} = useMasterStore()

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

const customer = computed(() => findCustomer(job.value?.customer_id || job.value?.service_request?.customer_id || null))
const contract = computed(() => contractItems.value.find(ci => String(ci.unit_id) === String(job.value?.unit_id || job.value?.service_request?.unit_id)) || null)
const unit = computed(() => findUnit(job.value?.unit_id || job.value?.service_request?.unit_id || null))

// ── Delivery jobs (JO dari delivery order) ──
const isDeliveryJob = computed(() => {
  const j: any = job.value
  return !!j && (j.job_type === 'delivery' || !!j.delivery_order_id || !!j.delivery_order)
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
})
const isDoFormInit = ref(false)
const isSavingDoForm = ref(false)

function initDoForm() {
  const d: any = deliveryOrder.value
  if (!d || isDoFormInit.value) return
  doForm.value = {
    problem: d.problem || '',
    action: d.action || '',
    time_in: d.time_in || '',
    time_out: d.time_out || '',
    is_tested: !!d.is_tested,
    is_completed: !!d.is_completed,
    customer_signature: d.customer_signature || '',
    technician_signature: d.technician_signature || '',
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
  return !!(f.action || '').trim() && f.is_tested && f.is_completed && !!f.customer_signature && !!f.technician_signature
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
    await refresh(true)
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
    await refresh(true)
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
    await refresh(true)
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
  if (unit.value?.is_copier || unit.value?.model?.toLowerCase().includes('copier')) {
    copierOk = (numVal(sr.meter_reading_after) || numVal(sr.reading_counter)) > 0
    copierSigOk = !!sr?.customer_signature_copier && !!sr?.technician_signature_copier
  }

  const signaturesOk = techSigOk && copierSigOk
  return techOk && signaturesOk && copierOk
})

onMounted(() => refresh(true))

async function ensureServiceReport(now: string) {
  await refresh(true)
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

  await refresh(true)
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
  if (!confirm('Are you sure you want to accept this job now? Start time (time_in) will be recorded.')) {
    isPreparingForm.value = false
    return
  }
  try {
    const now = new Date().toISOString()
    const report = await ensureServiceReport(now)
    await api.patch(`/service-reports/${report.id}`, {
      status: 'in_progress',
      time_in: report.time_in || now,
    })
    await api.patch(`/job-orders/${job.value.id}`, { status: 'in_progress' })

    toast.success('Job accepted. Start time recorded.')
    await refresh(true)
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
  if (confirm('Are you sure you want to complete this job? Finish time (time_out) will be recorded.')) {
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
    }
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
            <div v-for="(it, idx) in doItems" :key="idx" class="text-sm p-md mb-sm" style="background: var(--color-surface-sunken); border-radius: var(--radius-md);">
              {{ idx + 1 }}. {{ doItemLabel(it) }}
            </div>
          </div>
          <p v-else class="text-sm text-muted">No items.</p>
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
              <label class="form-label">Technician Signature <span class="text-danger">*</span></label>
              <SignaturePad v-model="doForm.technician_signature" height="150px" />
            </div>
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Customer Signature <span class="text-danger">*</span></label>
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
            <div class="text-sm text-muted">Technician: <strong>{{ deliveryOrder?.technician_signature ? 'Signed' : '-' }}</strong></div>
            <div class="text-sm text-muted">Customer: <strong>{{ deliveryOrder?.customer_signature ? 'Signed' : '-' }}</strong></div>
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
            <span class="info-value">{{ unit?.serial_no || '-' }}</span>
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
            <button class="btn btn-outline w-full mb-sm text-left flex justify-between items-center p-md" @click="router.push(`/technician/call-services/${serviceReport?.id}/technical-report`)">
              <span class="font-bold"><span v-if="serviceReport?.remarks && serviceReport?.is_tested">✅</span><span v-else>📝</span> 1. Technical Report</span>
              <span>></span>
            </button>
            <button v-if="unit?.is_copier || unit?.model?.toLowerCase().includes('copier')" class="btn btn-outline w-full mb-sm text-left flex justify-between items-center p-md" @click="router.push(`/technician/call-services/${serviceReport?.id}/copier-report`)">
              <span class="font-bold"><span v-if="serviceReport?.meter_reading_after || serviceReport?.reading_counter">✅</span><span v-else>📝</span> 2. Copier Service Report</span>
              <span>></span>
            </button>
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
                <span>{{ findProduct(sp.product_id)?.name || sp.product_id }}</span>
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

