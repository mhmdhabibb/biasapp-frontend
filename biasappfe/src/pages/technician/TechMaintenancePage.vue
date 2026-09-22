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
  return getServiceReportsByTechnician(currentUser.value?.id || null).filter(j => j.service_type === 'maintenance')
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
  inspection_result: '',
  notes: ''
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
    previous_meter: job.reading_counter || 0,
    current_meter: job.reading_counter || 0
  }
  form.value = {
    inspection_result: job.inspection_result || '',
    notes: job.notes || ''
  }
  showDetailModal.value = true
}

function completeMaintenance() {
  if (!selectedJob.value) return
  if (meterReadingForm.value.current_meter < meterReadingForm.value.previous_meter) {
    alert('Current meter tidak boleh lebih kecil dari previous meter!')
    return
  }
  
  if (confirm('Selesaikan Maintenance?')) {
    // Serialize checklists into repair_action
    const cl = []
    if (checklist.value.cleaning) cl.push('Cleaning')
    if (checklist.value.roller) cl.push('Roller Check')
    if (checklist.value.drum) cl.push('Drum Check')
    if (checklist.value.toner) cl.push('Toner Check')
    if (checklist.value.paperFeeder) cl.push('Paper Feeder Check')
    if (checklist.value.machineTesting) cl.push('Machine Testing')

    selectedJob.value.repair_action = cl.join(', ')
    selectedJob.value.inspection_result = form.value.inspection_result
    selectedJob.value.notes = form.value.notes
    selectedJob.value.reading_counter = meterReadingForm.value.current_meter
    
    selectedJob.value.status = 'completed'
    selectedJob.value.time_out = new Date().toISOString()
    if (!selectedJob.value.time_in) {
      selectedJob.value.time_in = selectedJob.value.created_at // fallback
    }
    selectedJob.value.is_complete = true
    selectedJob.value.updated_at = new Date().toISOString()

    showDetailModal.value = false
    alert('Maintenance Selesai!')
  }
}
</script>

<template>
  <div class="tech-maintenance">
    <PageHeader title="Maintenance Rutin" />

    <div class="card mb-lg">
      <div class="card-header">
        <h2 class="card-title">Jadwal Maintenance (Aktif)</h2>
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
              <td>{{ job.service_report_no }}</td>
              <td>{{ getCustomerName(job.customer_id) }}</td>
              <td>{{ getUnitName(job.contract_item_id) }}</td>
              <td>{{ job.visit_date }}</td>
              <td>
                <span class="badge badge-warning">ASSIGNED</span>
              </td>
              <td>
                <button class="btn btn-sm btn-primary" @click="openMaintenance(job)">Proses</button>
              </td>
            </tr>
            <tr v-if="activeJobs.length === 0">
              <td colspan="6" class="text-center py-lg text-muted">Tidak ada jadwal maintenance aktif.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Form -->
    <div v-if="showDetailModal" class="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">Form Maintenance</h2>
          <button class="btn-close" @click="showDetailModal = false">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="info-grid mb-md">
            <div>
              <span class="text-xs text-muted block">Customer</span>
              <span class="font-bold">{{ getCustomerName(selectedJob?.customer_id) }}</span>
            </div>
            <div>
              <span class="text-xs text-muted block">Unit</span>
              <span class="font-bold">{{ getUnitName(selectedJob?.contract_item_id) }}</span>
            </div>
            <div>
              <span class="text-xs text-muted block">Schedule</span>
              <span class="font-bold">{{ selectedJob?.visit_date }}</span>
            </div>
          </div>

          <h3 class="text-sm font-bold mb-sm mt-md border-b pb-xs">Checklist Pekerjaan</h3>
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
            <label class="form-label">Hasil Maintenance</label>
            <textarea v-model="form.inspection_result" class="form-textarea" rows="2"></textarea>
          </div>
          
          <div class="form-group">
            <label class="form-label">Catatan Tambahan</label>
            <textarea v-model="form.notes" class="form-textarea" rows="2"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" @click="showDetailModal = false">Batal</button>
          <button class="btn btn-primary" @click="completeMaintenance">Selesaikan Maintenance</button>
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
