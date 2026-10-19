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
import { computed, ref } from 'vue'

const toast = useToast()
const { can } = usePermission()
const { currentUser } = useAuth()
const {
  jobOrders,
  serviceReports,
  getTechnicianIdByUser,
  findCustomer,
  findTechnician,
  findUnit,
  contractItems,
  monthlyMeterReadings,
  refreshInBackground,
} = useMasterStore()

const myTechId = computed(() => getTechnicianIdByUser(currentUser.value?.id || null))

const myJobs = computed(() =>
  jobOrders.value.filter(j =>
    String(j.technician_id) === String(myTechId.value) &&
    (j.job_type === 'maintenance' ||
      j.job_type === 'maintenance_visit' ||
      (j.job_type === 'service' &&
        (j.instructions?.includes('Rutin Maintenance') ||
          j.service_request?.problem_description?.includes('[MAINTENANCE_VISIT]'))))
  )
)

const activeJobs = computed(() => myJobs.value.filter(j => j.status !== 'completed' && j.status !== 'cancelled'))
const completedJobs = computed(() => myJobs.value.filter(j => j.status === 'completed'))

// ── Detail & Form State ───────────────────────────────────────────────────
const showForm = ref(false)
const selectedJob = ref<any>(null)
const photoZoom = ref<string | null>(null)

const form = ref({
  photo_before: '',
  photo_after: '',
  repair_action: '',
  work_start: '',
  work_end: '',
  customer_name: '',
  technician_name: '',
  customer_signature: '',
  technician_signature: '',
})

const isFormCompleted = computed(() =>
  !!form.value.repair_action.trim() &&
  !!form.value.work_start &&
  !!form.value.customer_name.trim() &&
  !!form.value.customer_signature &&
  !!form.value.technician_signature,
)

const fileInputBefore = ref<HTMLInputElement | null>(null)
const fileInputAfter = ref<HTMLInputElement | null>(null)
const isSaving = ref(false)

// ── Helpers ──────────────────────────────────────────────────────────────
function getCustomerName(id: any) {
  return findCustomer(id)?.company_name || findCustomer(id)?.name || '-'
}

function getUnitName(id: any) {
  const u = findUnit(id)
  return u ? `${u.model}${u.serial_no ? ` (${u.serial_no})` : ''}` : '-'
}

function jobCustomerId(job: any) {
  return job?.service_request?.customer_id || job?.customer_id
}

function jobUnitId(job: any) {
  return job?.service_request?.unit_id || job?.unit_id
}

function jobProblem(job: any) {
  return (job?.service_request?.problem_description || job?.instructions || '-')
    .replace('[MAINTENANCE_VISIT]', '').trim()
}

function jobProjectName(job: any) {
  return job?.service_request?.project_name || job?.project_name || '-'
}

function fmtDateTime(iso: string) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
}

// ── Photo handling ────────────────────────────────────────────────────────
function triggerPhoto(type: 'before' | 'after') {
  if (type === 'before') fileInputBefore.value?.click()
  else fileInputAfter.value?.click()
}

function handlePhoto(event: Event, type: 'before' | 'after') {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    if (type === 'before') form.value.photo_before = e.target?.result as string
    else form.value.photo_after = e.target?.result as string
  }
  reader.readAsDataURL(file)
}

function removePhoto(type: 'before' | 'after') {
  if (type === 'before') { form.value.photo_before = ''; if (fileInputBefore.value) fileInputBefore.value.value = '' }
  else { form.value.photo_after = ''; if (fileInputAfter.value) fileInputAfter.value.value = '' }
}

// ── Open / Start Job ──────────────────────────────────────────────────────
function openJob(job: any) {
  selectedJob.value = job
  // Pre-fill saved data if any
  const sr = serviceReports.value.find(s => String(s.job_order_id) === String(job.id))
  const tech: any = findTechnician(job.technician_id)
  const cust: any = findCustomer(jobCustomerId(job))
  form.value = {
    photo_before: sr?.photo_before || '',
    photo_after: sr?.photo_after || '',
    repair_action: sr?.repair_action || '',
    work_start: sr?.time_in || job.started_at || '',
    work_end: sr?.time_out || '',
    customer_name: sr?.customer_name || cust?.pic_name || cust?.name || '',
    technician_name: sr?.technician_name || tech?.user?.name || tech?.name || currentUser.value?.name || '',
    customer_signature: sr?.customer_signature || '',
    technician_signature: sr?.technician_signature || '',
  }
  showForm.value = true
}

async function startJob() {
  if (!selectedJob.value || form.value.work_start) return
  const now = new Date().toISOString()
  form.value.work_start = now
  try {
    await api.patch(`/job-orders/${selectedJob.value.id}`, { status: 'in_progress' })
    selectedJob.value.status = 'in_progress'
    toast.success('Job started — work start time recorded.')
    refreshInBackground()
  } catch {
    toast.error('Failed to update job status')
  }
}

// ── Complete Job ──────────────────────────────────────────────────────────
async function completeJob() {
  if (!selectedJob.value) return
  if (!form.value.repair_action.trim()) {
    toast.error('Please fill in the Result / Repair Action before completing.')
    return
  }
  if (!form.value.work_start) {
    toast.error('Please start the job first.')
    return
  }
  if (!form.value.customer_name.trim() || !form.value.customer_signature || !form.value.technician_signature) {
    toast.error('Customer name and both signatures are required.')
    return
  }

  const now = new Date().toISOString()
  form.value.work_end = now
  isSaving.value = true

  try {
    const unitId = jobUnitId(selectedJob.value)
    const customerId = jobCustomerId(selectedJob.value)

    const reportPayload = {
      machine_problem: jobProblem(selectedJob.value),
      repair_action: form.value.repair_action,
      time_in: form.value.work_start,
      time_out: now,
      photo_before: form.value.photo_before || '',
      photo_after: form.value.photo_after || '',
      customer_name: form.value.customer_name,
      technician_name: form.value.technician_name,
      customer_signature: form.value.customer_signature,
      technician_signature: form.value.technician_signature,
      is_tested: true,
      is_completed: true,
      status: 'completed',
    }

    const existing = serviceReports.value.find(s => String(s.job_order_id) === String(selectedJob.value.id))
    if (existing) {
      await api.patch(`/service-reports/${existing.id}`, reportPayload)
    } else {
      await api.post('/service-reports', {
        report_no: `SR-${Date.now().toString().slice(-6)}`,
        job_order_id: selectedJob.value.id,
        unit_id: String(unitId),
        customer_id: String(customerId),
        technician_id: selectedJob.value.technician_id,
        project_name: jobProjectName(selectedJob.value),
        service_type: 'maintenance',
        service_date: form.value.work_start,
        ...reportPayload,
      })
    }
    await api.patch(`/job-orders/${selectedJob.value.id}`, { status: 'completed' })

    selectedJob.value.status = 'completed'
    showForm.value = false
    toast.success('Maintenance completed!')
    refreshInBackground()
  } catch (err: any) {
    toast.error(err.message || 'Failed to complete maintenance')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="tech-maint">
    <PageHeader title="Maintenance" />

    <!-- Active Jobs Table -->
    <div class="maint-card">
      <div class="maint-card-header">
        <h2 class="maint-card-title">Active Schedule</h2>
        <span class="maint-badge-count">{{ activeJobs.length }}</span>
      </div>

      <div v-if="activeJobs.length === 0" class="maint-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
        <span>No active maintenance assigned to you.</span>
      </div>

      <div v-else class="maint-job-list">
        <div v-for="job in activeJobs" :key="job.id" class="maint-job-row" @click="openJob(job)">
          <div class="maint-job-main">
            <div class="maint-job-no">{{ job.job_order_no }}</div>
            <div class="maint-job-meta">
              <span>{{ getCustomerName(jobCustomerId(job)) }}</span>
              <span class="maint-dot">·</span>
              <span>{{ getUnitName(jobUnitId(job)) }}</span>
            </div>
            <div v-if="jobProjectName(job) !== '-'" class="maint-job-project">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
              {{ jobProjectName(job) }}
            </div>
          </div>
          <div class="maint-job-right">
            <span class="badge" :class="job.status === 'in_progress' ? 'badge-info' : 'badge-warning'">
              {{ (job.status || 'SCHEDULED').toUpperCase().replace('_', ' ') }}
            </span>
            <div class="maint-job-date">{{ fmtDateTime(job.scheduled_date) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Completed Jobs -->
    <div v-if="completedJobs.length > 0" class="maint-card maint-card--done">
      <div class="maint-card-header">
        <h2 class="maint-card-title">Completed</h2>
        <span class="maint-badge-count maint-badge-count--done">{{ completedJobs.length }}</span>
      </div>
      <div class="maint-job-list">
        <div v-for="job in completedJobs" :key="job.id" class="maint-job-row maint-job-row--done" @click="openJob(job)">
          <div class="maint-job-main">
            <div class="maint-job-no">{{ job.job_order_no }}</div>
            <div class="maint-job-meta">
              <span>{{ getCustomerName(jobCustomerId(job)) }}</span>
              <span class="maint-dot">·</span>
              <span>{{ getUnitName(jobUnitId(job)) }}</span>
            </div>
          </div>
          <span class="badge badge-success">COMPLETED</span>
        </div>
      </div>
    </div>

    <!-- ── MAINTENANCE FORM (full-screen overlay) ── -->
    <Teleport to="body">
      <div v-if="showForm && selectedJob" class="mf-overlay">
        <div class="mf-sheet">

          <!-- Header -->
          <div class="mf-header">
            <div>
              <div class="mf-header-no">{{ selectedJob.job_order_no }}</div>
              <div class="mf-header-sub">Maintenance Form</div>
            </div>
            <button class="mf-close" @click="showForm = false">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div class="mf-body">

            <!-- ── Section: CS Info (read-only) ── -->
            <div class="mf-section-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Job Information (from CS)
            </div>
            <div class="mf-info-grid">
              <div class="mf-info-field">
                <span class="mf-info-label">Maintenance Number</span>
                <span class="mf-info-value mf-info-value--primary">{{ selectedJob.job_order_no }}</span>
              </div>
              <div class="mf-info-field">
                <span class="mf-info-label">Scheduled Date</span>
                <span class="mf-info-value">{{ fmtDateTime(selectedJob.scheduled_date) }}</span>
              </div>
              <div class="mf-info-field">
                <span class="mf-info-label">Customer</span>
                <span class="mf-info-value">{{ getCustomerName(jobCustomerId(selectedJob)) }}</span>
              </div>
              <div class="mf-info-field">
                <span class="mf-info-label">Product / Unit</span>
                <span class="mf-info-value">{{ getUnitName(jobUnitId(selectedJob)) }}</span>
              </div>
              <div class="mf-info-field mf-info-field--wide">
                <span class="mf-info-label">Project Name</span>
                <span class="mf-info-value">{{ jobProjectName(selectedJob) }}</span>
              </div>
              <div class="mf-info-field mf-info-field--wide">
                <span class="mf-info-label">Problem / Task</span>
                <span class="mf-info-value">{{ jobProblem(selectedJob) }}</span>
              </div>
            </div>

            <!-- ── Section: Work Time ── -->
            <div class="mf-section-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Work Time
            </div>
            <div class="mf-time-grid">
              <div class="mf-time-field">
                <div class="mf-time-label">Work Start</div>
                <div class="mf-time-value" :class="form.work_start ? 'mf-time-value--set' : 'mf-time-value--empty'">
                  {{ form.work_start ? fmtDateTime(form.work_start) : 'Not started yet' }}
                </div>
              </div>
              <div class="mf-time-field">
                <div class="mf-time-label">Work End</div>
                <div class="mf-time-value" :class="form.work_end ? 'mf-time-value--set' : 'mf-time-value--empty'">
                  {{ form.work_end ? fmtDateTime(form.work_end) : 'Will be set on complete' }}
                </div>
              </div>
            </div>

            <div v-if="!form.work_start && selectedJob.status !== 'completed'" class="mf-start-hint">
              <button class="mf-btn-start" @click="startJob">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Start Job — Record Work Start Time
              </button>
            </div>

            <!-- ── Section: Photos ── -->
            <div class="mf-section-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              Documentation Photos
            </div>
            <div class="mf-photos-grid">
              <!-- Before -->
              <div class="mf-photo-card">
                <div class="mf-photo-badge mf-photo-badge--before">Before</div>
                <div class="mf-photo-frame" @click="form.photo_before ? photoZoom = form.photo_before : triggerPhoto('before')">
                  <img v-if="form.photo_before" :src="form.photo_before" alt="Before" class="mf-photo-img" />
                  <div v-else class="mf-photo-empty">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    <span>Tap to upload</span>
                  </div>
                </div>
                <div class="mf-photo-actions">
                  <button class="mf-photo-btn" @click="triggerPhoto('before')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    {{ form.photo_before ? 'Change' : 'Upload' }}
                  </button>
                  <button v-if="form.photo_before" class="mf-photo-btn mf-photo-btn--remove" @click="removePhoto('before')">Remove</button>
                </div>
                <input ref="fileInputBefore" type="file" accept="image/*" capture="environment" class="mf-file-input" @change="handlePhoto($event, 'before')" />
              </div>

              <!-- After -->
              <div class="mf-photo-card">
                <div class="mf-photo-badge mf-photo-badge--after">After</div>
                <div class="mf-photo-frame" @click="form.photo_after ? photoZoom = form.photo_after : triggerPhoto('after')">
                  <img v-if="form.photo_after" :src="form.photo_after" alt="After" class="mf-photo-img" />
                  <div v-else class="mf-photo-empty">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    <span>Tap to upload</span>
                  </div>
                </div>
                <div class="mf-photo-actions">
                  <button class="mf-photo-btn" @click="triggerPhoto('after')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    {{ form.photo_after ? 'Change' : 'Upload' }}
                  </button>
                  <button v-if="form.photo_after" class="mf-photo-btn mf-photo-btn--remove" @click="removePhoto('after')">Remove</button>
                </div>
                <input ref="fileInputAfter" type="file" accept="image/*" capture="environment" class="mf-file-input" @change="handlePhoto($event, 'after')" />
              </div>
            </div>

            <!-- ── Section: Result ── -->
            <div class="mf-section-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              Result / Repair Action
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <textarea
                v-model="form.repair_action"
                class="form-textarea mf-result-area"
                rows="4"
                :disabled="selectedJob.status === 'completed'"
                placeholder="Describe what was done, parts checked, actions taken..."
              ></textarea>
            </div>

            <!-- ── Section: Signatures ── -->
            <div class="mf-section-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
              Signatures
            </div>
            <div v-if="selectedJob.status !== 'completed'" class="mf-sig-grid">
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">Customer / PIC Name <span class="text-danger">*</span></label>
                <input v-model="form.customer_name" type="text" class="form-input" placeholder="Customer PIC name" />
                <label class="form-label mt-sm">Customer Signature <span class="text-danger">*</span></label>
                <SignaturePad v-model="form.customer_signature" height="150px" />
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">Technician Name</label>
                <input v-model="form.technician_name" type="text" class="form-input" readonly disabled />
                <label class="form-label mt-sm">Technician Signature <span class="text-danger">*</span></label>
                <SignaturePad v-model="form.technician_signature" height="150px" />
              </div>
            </div>
            <div v-else class="mf-sig-grid">
              <div class="mf-info-field">
                <span class="mf-info-label">Customer</span>
                <span class="mf-info-value">{{ form.customer_name || '-' }}</span>
                <img v-if="form.customer_signature" :src="form.customer_signature" alt="Customer signature" class="mf-sig-img" />
              </div>
              <div class="mf-info-field">
                <span class="mf-info-label">Technician</span>
                <span class="mf-info-value">{{ form.technician_name || '-' }}</span>
                <img v-if="form.technician_signature" :src="form.technician_signature" alt="Technician signature" class="mf-sig-img" />
              </div>
            </div>

          </div>

          <!-- Footer -->
          <div class="mf-footer" v-if="selectedJob.status !== 'completed'">
            <button class="btn btn-outline" @click="showForm = false">Close</button>
            <button
              class="btn btn-primary"
              :disabled="isSaving || !isFormCompleted"
              @click="completeJob"
            >
              <svg v-if="isSaving" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite; margin-right:5px;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              {{ isSaving ? 'Saving...' : (isFormCompleted ? 'Complete Maintenance' : 'Complete Form First') }}
            </button>
          </div>
          <div class="mf-footer mf-footer--done" v-else>
            <span class="mf-done-label">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Maintenance Completed
            </span>
            <button class="btn btn-outline" @click="showForm = false">Close</button>
          </div>

        </div>
      </div>
    </Teleport>

    <!-- Photo Zoom Lightbox -->
    <Teleport to="body">
      <div v-if="photoZoom" class="mf-lightbox" @click="photoZoom = null">
        <button class="mf-lightbox-close" @click="photoZoom = null">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <img :src="photoZoom" class="mf-lightbox-img" @click.stop />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.tech-maint { padding-bottom: 40px; }

/* ── Job Cards ── */
.maint-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  margin-bottom: 20px;
  overflow: hidden;
}
.maint-card--done { opacity: 0.75; }
.maint-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-border-light);
}
.maint-card-title { font-size: var(--font-size-sm); font-weight: 700; margin: 0; }
.maint-badge-count {
  background: var(--color-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  border-radius: 20px;
  padding: 1px 8px;
}
.maint-badge-count--done { background: var(--color-success, #16a34a); }
.maint-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 36px;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
.maint-job-list { display: flex; flex-direction: column; }
.maint-job-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-border-light);
  cursor: pointer;
  transition: background 0.12s;
}
.maint-job-row:last-child { border-bottom: none; }
.maint-job-row:hover { background: var(--color-surface-hover); }
.maint-job-row--done { opacity: 0.7; }
.maint-job-no { font-size: var(--font-size-sm); font-weight: 700; color: var(--color-primary); }
.maint-job-meta { font-size: var(--font-size-xs); color: var(--color-text-muted); margin-top: 3px; }
.maint-job-project { font-size: var(--font-size-xs); color: var(--color-text-muted); margin-top: 3px; display: flex; align-items: center; gap: 4px; }
.maint-dot { margin: 0 3px; }
.maint-job-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
.maint-job-date { font-size: 11px; color: var(--color-text-muted); }

/* ── Full-screen Form ── */
.mf-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
@media (min-width: 640px) {
  .mf-overlay { align-items: center; }
}
.mf-sheet {
  background: var(--color-surface);
  width: 100%;
  max-width: 560px;
  max-height: 92vh;
  border-radius: 20px 20px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -4px 32px rgba(0,0,0,0.18);
}
@media (min-width: 640px) {
  .mf-sheet { border-radius: 16px; }
}

.mf-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--color-border-light);
  flex-shrink: 0;
}
.mf-header-no { font-size: var(--font-size-lg); font-weight: 700; color: var(--color-primary); }
.mf-header-sub { font-size: var(--font-size-xs); color: var(--color-text-muted); margin-top: 2px; }
.mf-close {
  background: var(--color-surface-sunken);
  border: none;
  border-radius: 50%;
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--color-text-muted); flex-shrink: 0;
}
.mf-close:hover { background: var(--color-border-light); color: var(--color-text); }

.mf-body { overflow-y: auto; padding: 18px 20px; flex: 1; display: flex; flex-direction: column; gap: 16px; }

.mf-section-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.6px; color: var(--color-text-muted);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--color-border-light);
}

/* Info grid (CS fields) */
.mf-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.mf-info-field {
  display: flex; flex-direction: column; gap: 3px;
  padding: 10px 12px;
  background: var(--color-surface-sunken);
  border-radius: 8px;
}
.mf-info-field--wide { grid-column: 1 / -1; }
.mf-info-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: var(--color-text-muted); }
.mf-info-value { font-size: var(--font-size-sm); font-weight: 500; color: var(--color-text); }
.mf-info-value--primary { color: var(--color-primary); font-weight: 700; }

/* Time grid */
.mf-time-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.mf-time-field {
  padding: 12px;
  border: 1.5px solid var(--color-border-light);
  border-radius: 8px;
  display: flex; flex-direction: column; gap: 4px;
}
.mf-time-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: var(--color-text-muted); }
.mf-time-value { font-size: var(--font-size-xs); }
.mf-time-value--set { color: var(--color-text); font-weight: 600; }
.mf-time-value--empty { color: var(--color-text-muted); font-style: italic; }
.mf-start-hint { display: flex; justify-content: center; margin-top: -4px; }
.mf-btn-start {
  display: flex; align-items: center; gap: 8px;
  background: var(--color-primary); color: #fff;
  border: none; border-radius: 24px;
  padding: 10px 22px; font-size: var(--font-size-sm); font-weight: 600;
  cursor: pointer; transition: opacity 0.15s;
}
.mf-btn-start:hover { opacity: 0.88; }

/* Photos */
.mf-photos-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.mf-photo-card { display: flex; flex-direction: column; gap: 6px; }
.mf-photo-badge {
  display: inline-flex; width: fit-content;
  padding: 2px 10px; border-radius: 20px;
  font-size: 11px; font-weight: 700;
}
.mf-photo-badge--before { background: #fff3cd; color: #92620a; }
.mf-photo-badge--after  { background: #d1fae5; color: #065f46; }
.mf-photo-frame {
  border: 1.5px dashed var(--color-border-light);
  border-radius: 10px; overflow: hidden;
  background: var(--color-surface-sunken);
  min-height: 130px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: border-color 0.15s;
}
.mf-photo-frame:hover { border-color: var(--color-primary); }
.mf-photo-img { width: 100%; height: 140px; object-fit: cover; display: block; }
.mf-photo-empty {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  color: var(--color-text-muted); padding: 20px; text-align: center;
}
.mf-photo-empty span { font-size: 11px; }
.mf-photo-actions { display: flex; gap: 6px; }
.mf-photo-btn {
  flex: 1; font-size: 11px; font-weight: 600;
  padding: 5px 8px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--color-border-light);
  background: var(--color-surface); color: var(--color-text);
  display: flex; align-items: center; justify-content: center; gap: 4px;
  transition: background 0.12s;
}
.mf-photo-btn:hover { background: var(--color-surface-hover); }
.mf-photo-btn--remove { color: var(--color-danger, #dc2626); border-color: var(--color-danger, #dc2626); }
.mf-file-input { display: none; }

.mf-result-area { resize: vertical; }

/* Signatures */
.mf-sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.mf-sig-img {
  margin-top: 6px;
  max-height: 60px;
  max-width: 100%;
  object-fit: contain;
  background: #fff;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
}

/* Footer */
.mf-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--color-border-light);
  flex-shrink: 0;
}
.mf-footer--done { justify-content: space-between; }
.mf-done-label {
  display: flex; align-items: center; gap: 6px;
  color: var(--color-success, #16a34a); font-weight: 600; font-size: var(--font-size-sm);
}

/* Lightbox */
.mf-lightbox {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.88);
  display: flex; align-items: center; justify-content: center;
  cursor: zoom-out;
}
.mf-lightbox-img {
  max-width: 92vw; max-height: 88vh;
  border-radius: 6px; object-fit: contain;
  box-shadow: 0 8px 40px rgba(0,0,0,0.6);
  cursor: default;
}
.mf-lightbox-close {
  position: absolute; top: 16px; right: 16px;
  width: 36px; height: 36px; border-radius: 50%;
  background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25);
  color: #fff; display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.mf-lightbox-close:hover { background: rgba(255,255,255,0.28); }

@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 440px) {
  .mf-info-grid, .mf-time-grid, .mf-photos-grid, .mf-sig-grid { grid-template-columns: 1fr; }
  .mf-info-field--wide { grid-column: 1; }
}
</style>
