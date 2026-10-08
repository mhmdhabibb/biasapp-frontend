<script setup lang="ts">
// @ts-nocheck
import PageHeader from '@/components/ui/PageHeader.vue'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import { findPreviousServiceReportMeter } from '@/utils/meterReading'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

const toast = useToast()
const { can } = usePermission()
const router = useRouter()
const { currentUser } = useAuth()
const {
  jobOrders,
  getServiceReportsByTechnician,
  serviceReports,
  getTechnicianIdByUser,
  findCustomer,
  findUnit,
  contractItems,
  monthlyMeterReadings, refreshInBackground } = useMasterStore()

// service_report.technician_id references technicians.id, not users.id
const myTechId = computed(() => getTechnicianIdByUser(currentUser.value?.id || null))

const myJobs = computed(() => {
  return jobOrders.value.filter(j => 
    String(j.technician_id) === String(myTechId.value) && 
    (j.job_type === 'maintenance' || j.job_type === 'maintenance_visit' || 
     (j.job_type === 'service' && (j.instructions?.includes('Rutin Maintenance') || j.service_request?.problem_description?.includes('[MAINTENANCE_VISIT]'))))
  )
})

const activeJobs = computed(() => myJobs.value.filter(j => j.status !== 'completed' && j.status !== 'cancelled'))
const completedJobs = computed(() => myJobs.value.filter(j => j.status === 'completed'))

const showDetailModal = ref(false)
const selectedJob = ref<any>(null)

// Checklists
const checklist = ref({
  cleaning: false,
  roller: false,
  drum: false,
  toner: false,
  paperFeeder: false,
  machineTesting: false
})
const meterReadingForm = ref({
  previous_meter: 0,
  current_meter: 0
})
const form = ref({
  remarks: '',
  notes: ''
})

function getCustomerName(id: number | null) {
  return findCustomer(id as any)?.company_name || '-'
}

function getUnitName(unitId: number | null) {
  const u = findUnit(unitId as any)
  return u ? u.model : '-'
}

const numVal = (v: any) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Previous meter: saved -> linked reading -> unit -> contract.
// Previously only `job.meter_reading_before || 0`, so old reports were always 0.
function resolvePreviousMeter(job: any): number {
  const saved = numVal(job?.meter_reading_before) || numVal(job?.reading_counter)
  if (saved > 0) return saved
  const readings: any[] = job?.monthly_meter_readings || job?.monthlyMeterReadings || []
  let lastEnd = 0
  for (const r of readings) lastEnd = Math.max(lastEnd, numVal(r.end_meter) || numVal(r.start_meter))
  if (lastEnd > 0) return lastEnd
  const previousVisit = findPreviousServiceReportMeter(job, serviceReports.value, contractItems.value)
  if (previousVisit !== null) return previousVisit
  // latest reading of this unit from the store (previous period)
  const unitId = String(job?.unit_id || '')
  if (unitId) {
    const storeReadings: any[] = (monthlyMeterReadings as any)?.value || (monthlyMeterReadings as any) || []
    const forUnit = storeReadings.filter((r: any) => String(r.unit_id || r.unit?.id || '') === unitId)
    forUnit.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    if (forUnit.length > 0) {
      const last = numVal(forUnit[0].end_meter) || numVal(forUnit[0].start_meter)
      if (last > 0) return last
    }
  }
  const u: any = unitId ? findUnit(unitId as any) : null
  const fromUnit = numVal(u?.current_meter_bw) || numVal(u?.current_meter_color)
  if (fromUnit > 0) return fromUnit
  if (unitId) {
    const items: any[] = (contractItems as any)?.value || (contractItems as any) || []
    const ci = items.find((c: any) => String(c.unit_id || c.unit?.id || '') === unitId)
    const fromContract = numVal(ci?.start_mono_value) || numVal(ci?.start_color_value)
    if (fromContract > 0) return fromContract
  }
  return 0
}

function openMaintenance(job: any) {
  selectedJob.value = job
  // Reset form
  checklist.value = {
    cleaning: false,
    roller: false,
    drum: false,
    toner: false,
    paperFeeder: false,
    machineTesting: false
  }
  meterReadingForm.value = {
    previous_meter: resolvePreviousMeter(job),
    current_meter: numVal(job.meter_reading_after) || numVal(job.meter_reading_before) || resolvePreviousMeter(job)
  }
  form.value = {
    remarks: job.remarks || '',
    notes: ''
  }
  showDetailModal.value = true
}

async function completeMaintenance() {
  if (!selectedJob.value) return
  if (meterReadingForm.value.current_meter < meterReadingForm.value.previous_meter) {
    toast.warning('Current meter must not be smaller than previous meter!')
    return
  }

  if (confirm('Complete Maintenance?')) {
    // Serialize checklists into repair_action
    const cl = []
    if (checklist.value.cleaning) cl.push('Cleaning')
    if (checklist.value.roller) cl.push('Roller Check')
    if (checklist.value.drum) cl.push('Drum Check')
    if (checklist.value.toner) cl.push('Toner Check')
    if (checklist.value.paperFeeder) cl.push('Paper Feeder Check')
    if (checklist.value.machineTesting) cl.push('Machine Testing')

    const remarks = [form.value.remarks, form.value.notes]
      .map(s => s.trim()).filter(Boolean).join('\n')
    const now = new Date().toISOString()

    try {
      const unitId = selectedJob.value.service_request?.unit_id || selectedJob.value.unit_id
      const customerId = selectedJob.value.service_request?.customer_id || selectedJob.value.customer_id
      
      const payload = {
        report_no: `SR-${Date.now().toString().slice(-6)}`,
        job_order_id: selectedJob.value.id,
        unit_id: String(unitId),
        customer_id: String(customerId),
        technician_id: selectedJob.value.technician_id,
        service_type: 'maintenance',
        status: 'completed',
        is_completed: true,
        is_tested: checklist.value.machineTesting,
        time_in: selectedJob.value.time_in || now,
        time_out: now,
        repair_action: cl.join(', '),
        remarks,
        meter_reading_before: meterReadingForm.value.previous_meter,
        meter_reading_after: meterReadingForm.value.current_meter,
        service_date: now
      }
      
      await api.post(`/service-reports`, payload)
      await api.patch(`/job-orders/${selectedJob.value.id}`, { status: 'completed', completed_at: now })

      Object.assign(selectedJob.value, {
        status: 'completed',
        time_out: now,
        remarks
      })

      showDetailModal.value = false
      toast.success('Maintenance Completed!')
      refreshInBackground()
    } catch (err: any) {
      toast.error(err.message || 'Failed to complete maintenance')
    }
  }
}
</script>

<template>
  <div class="tech-maintenance">
    <PageHeader title="Routine Maintenance" />

    <div class="card mb-lg">
      <div class="card-header">
        <h2 class="card-title">Maintenance Schedule (Active)</h2>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Maintenance No</th>
              <th>Customer</th>
              <th>Unit</th>
              <th>Schedule Date</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="job in activeJobs" :key="job.id">
              <td>{{ job.job_order_no || job.report_no }}</td>
              <td>{{ getCustomerName(job.customer_id || job.service_request?.customer_id) }}</td>
              <td>{{ getUnitName(job.unit_id || job.service_request?.unit_id) }}</td>
              <td>{{ job.scheduled_date || job.service_date ? new Date(job.scheduled_date || job.service_date).toLocaleDateString('en-GB') : '-' }}</td>
              <td>
                <span class="badge" :class="'badge-' + (job.status === 'in_progress' ? 'info' : 'warning')">
                  {{ (job.status || 'SCHEDULED').toUpperCase().replace('_', ' ') }}
                </span>
              </td>
              <td>
                <button v-if="can('service_report:update')" class="btn btn-sm btn-primary" @click="openMaintenance(job)">Process</button>
              </td>
            </tr>
            <tr v-if="activeJobs.length === 0">
              <td colspan="6" class="text-center py-lg text-muted">No active maintenance schedules.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Form -->
    <div v-if="showDetailModal" class="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">Maintenance Form</h2>
          <button class="btn-close" @click="showDetailModal = false">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="info-grid mb-md">
            <div>
              <span class="text-xs text-muted block">Customer</span>
              <span class="font-bold">{{ getCustomerName(selectedJob?.customer_id || selectedJob?.service_request?.customer_id) }}</span>
            </div>
            <div>
              <span class="text-xs text-muted block">Unit</span>
              <span class="font-bold">{{ getUnitName(selectedJob?.unit_id || selectedJob?.service_request?.unit_id) }}</span>
            </div>
            <div>
              <span class="text-xs text-muted block">Schedule</span>
              <span class="font-bold">{{ (selectedJob?.scheduled_date || selectedJob?.service_date) ? new Date(selectedJob?.scheduled_date || selectedJob?.service_date).toLocaleDateString('en-GB') : '-' }}</span>
            </div>
          </div>

          <h3 class="text-sm font-bold mb-sm mt-md border-b pb-xs">Work Checklist</h3>
          <div class="checklist-grid mb-md">
            <label class="flex items-center gap-sm cursor-pointer"><input type="checkbox" v-model="checklist.cleaning"> Cleaning</label>
            <label class="flex items-center gap-sm cursor-pointer"><input type="checkbox" v-model="checklist.roller"> Roller Check</label>
            <label class="flex items-center gap-sm cursor-pointer"><input type="checkbox" v-model="checklist.drum"> Drum Check</label>
            <label class="flex items-center gap-sm cursor-pointer"><input type="checkbox" v-model="checklist.toner"> Toner Check</label>
            <label class="flex items-center gap-sm cursor-pointer"><input type="checkbox" v-model="checklist.paperFeeder"> Paper Feeder Check</label>
            <label class="flex items-center gap-sm cursor-pointer"><input type="checkbox" v-model="checklist.machineTesting"> Machine Testing</label>
          </div>

          <h3 class="text-sm font-bold mb-sm mt-md border-b pb-xs">Meter Reading</h3>
          <div class="flex gap-md mb-md">
            <div class="form-group flex-1 mb-0">
              <label class="form-label">Previous Meter</label>
              <input type="number" v-model.number="meterReadingForm.previous_meter" class="form-input" disabled>
            </div>
            <div class="form-group flex-1 mb-0">
              <label class="form-label">Current Meter</label>
              <input type="number" v-model.number="meterReadingForm.current_meter" class="form-input">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Maintenance Result</label>
            <textarea v-model="form.remarks" class="form-textarea" rows="2"></textarea>
          </div>
          
          <div class="form-group">
            <label class="form-label">Additional Notes</label>
            <textarea v-model="form.notes" class="form-textarea" rows="2"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" @click="showDetailModal = false">Cancel</button>
          <button v-if="can('service_report:update')" class="btn btn-primary" @click="completeMaintenance">Complete Maintenance</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal {
  background: var(--color-surface);
  width: 90%;
  max-width: 600px;
  border-radius: var(--radius-lg);
  box-shadow: 0 10px 25px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}
.modal-header {
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--color-border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.modal-title { font-size: var(--font-size-lg); font-weight: var(--font-weight-bold); }
.btn-close {
  background: none; border: none; color: var(--color-text-muted); cursor: pointer;
  padding: 4px; border-radius: 4px;
}
.btn-close:hover { background: var(--color-surface-sunken); color: var(--color-text); }
.modal-body {
  padding: var(--space-lg);
  overflow-y: auto;
}
.modal-footer {
  padding: var(--space-md) var(--space-lg);
  border-top: 1px solid var(--color-border-light);
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-md);
  background: var(--color-surface-sunken);
  padding: var(--space-md);
  border-radius: var(--radius-md);
}

.checklist-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-sm);
}

.border-b { border-bottom: 1px solid var(--color-border-light); }
.pb-xs { padding-bottom: var(--space-xs); }
</style>
