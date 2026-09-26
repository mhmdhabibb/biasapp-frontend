<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import PageHeader from '@/components/ui/PageHeader.vue'
import FormModal from '@/components/ui/FormModal.vue'
import { api } from '@/services/api'

const router = useRouter()
const { currentUser } = useAuth()
const {
  serviceRequests,
  jobOrders,
  technicians,
  customers,
  findCustomer,
  findUnit,
  refresh
} = useMasterStore()

let intervalId: any = null

onMounted(() => {
  intervalId = setInterval(() => {
    refresh(true)
  }, 30000)
})

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
})

// Unassigned are service requests that don't have a job order
const unassignedRequests = computed(() => {
  const jobReqIds = new Set(jobOrders.value.map(j => j.service_request_id).filter(id => id))
  return serviceRequests.value.filter(sr => 
    (sr.status === 'pending' || sr.status === 'open') && !jobReqIds.has(sr.id)
  )
})

function getJobsForTech(techId: string | number) {
  return jobOrders.value.filter(j => j.technician_id === String(techId) || j.technician_id === techId)
}

function getCustomerName(id: any) {
  return findCustomer(id)?.company_name || '-'
}

// Drag and Drop Logic
let draggedItem: any = null
let dragType: 'request' | 'job' | null = null

function onDragStartRequest(req: any) {
  draggedItem = req
  dragType = 'request'
}

function onDragStartJob(job: any) {
  draggedItem = job
  dragType = 'job'
}

async function onDropToTech(event: any, techId: string | number) {
  if (!draggedItem) return
  
  try {
    if (dragType === 'request') {
      // Create a new job order for this service request and assign to tech
      await api.post('/job-orders', {
        service_request_id: draggedItem.id,
        technician_id: String(techId),
        status: 'assigned',
        instructions: draggedItem.problem_description || 'Assigned from dashboard'
      })
    } else if (dragType === 'job') {
      // Update existing job order with new tech
      if (draggedItem.technician_id !== String(techId) && draggedItem.technician_id !== techId) {
        await api.put(`/job-orders/${draggedItem.id}`, {
          ...draggedItem,
          technician_id: String(techId)
        })
      }
    }
    await refresh(true)
  } catch (err) {
    console.error('Failed to assign', err)
  }
  
  draggedItem = null
  dragType = null
}

// Create Job / Request Modal
const showModal = ref(false)
const form = reactive({
  customer_id: '',
  job_type: 'Visit', // Visit, Maintenance, Pengantaran
  instructions: ''
})

function openCreateJob() {
  form.customer_id = customers.value.length > 0 ? String(customers.value[0].id) : ''
  form.job_type = 'Visit'
  form.instructions = ''
  showModal.value = true
}

async function handleCreateJob() {
  if (!form.customer_id) return
  try {
    // We create a service request, which will appear as an unassigned job on the left
    await api.post('/service-requests', {
      customer_id: String(form.customer_id),
      problem_description: `[${form.job_type.toUpperCase()}] ${form.instructions}`,
      status: 'pending'
    })
    showModal.value = false
    await refresh(true)
  } catch (err) {
    console.error('Failed to create job', err)
  }
}

function parseJobType(description: string) {
  if (!description) return 'General'
  if (description.startsWith('[VISIT]')) return 'Visit'
  if (description.startsWith('[MAINTENANCE]')) return 'Maintenance'
  if (description.startsWith('[PENGANTARAN]')) return 'Pengantaran'
  return 'Service'
}

function parseJobInstructions(description: string) {
  if (!description) return '-'
  return description.replace(/^\[.*?\]\s*/, '')
}
</script>

<template>
  <div class="tech-dashboard">
    <div class="header">
      <PageHeader title="Dispatcher Dashboard" />
      <button class="btn btn-primary" @click="openCreateJob">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        Buat Job
      </button>
    </div>

    <div class="dashboard-layout">
      <!-- Left side: Unassigned Jobs -->
      <div class="unassigned-panel">
        <div class="panel-header">
           <h3 class="panel-title">Unassigned Requests</h3>
        </div>
        <div class="jobs-list unassigned-list">
          <div 
            v-for="req in unassignedRequests" 
            :key="req.id" 
            class="job-card request-card"
            draggable="true"
            @dragstart="onDragStartRequest(req)"
          >
            <div class="job-card-header">
               <span class="job-id">{{ req.request_no || 'REQ' }}</span>
               <span class="job-type badge badge-info">{{ parseJobType(req.problem_description) }}</span>
            </div>
            <div class="job-customer">{{ getCustomerName(req.customer_id) }}</div>
            <div class="job-problem text-truncate">{{ parseJobInstructions(req.problem_description) }}</div>
          </div>
          
          <div v-if="unassignedRequests.length === 0" class="empty-state">
             No unassigned requests.
          </div>
        </div>
      </div>

      <!-- Right side: Technicians Swimlanes -->
      <div class="technicians-panel">
        <div class="panel-header">
           <h3 class="panel-title">Technicians / Drivers</h3>
        </div>
        
        <div class="tech-swimlanes">
          <div v-for="tech in technicians" :key="tech.id" class="tech-lane">
             <div class="tech-name">
                <div class="tech-avatar">{{ tech.name.charAt(0) }}</div>
                <span>{{ tech.name }}</span>
             </div>
             
             <div class="tech-jobs" @dragover.prevent @drop="onDropToTech($event, tech.id)">
                <div 
                  v-for="job in getJobsForTech(tech.id)" 
                  :key="job.id" 
                  class="job-card assigned-card"
                  draggable="true"
                  @dragstart="onDragStartJob(job)"
                >
                   <div class="job-card-header">
                     <span class="job-id">{{ job.job_order_no || 'JOB' }}</span>
                     <span class="job-type badge badge-success">{{ parseJobType(job.instructions) }}</span>
                   </div>
                   <div class="job-customer">{{ getCustomerName(job.service_request?.customer_id) }}</div>
                   <div class="job-problem text-truncate">{{ parseJobInstructions(job.instructions) }}</div>
                </div>
                
                <div v-if="getJobsForTech(tech.id).length === 0" class="empty-lane-text">
                  Drop job here to assign
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Job Modal -->
    <FormModal v-if="showModal" title="Buat Job Baru" @close="showModal = false" @submit="handleCreateJob">
       <div class="form-group">
         <label class="form-label">Customer</label>
         <select v-model="form.customer_id" class="form-select" required>
            <option disabled value="">-- Pilih Customer --</option>
            <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.company_name }}</option>
         </select>
       </div>
       <div class="form-group">
         <label class="form-label">Tipe Job</label>
         <select v-model="form.job_type" class="form-select" required>
            <option value="Visit">Visit</option>
            <option value="Maintenance">Maintenance</option>
            <option value="Pengantaran">Pengantaran</option>
         </select>
       </div>
       <div class="form-group">
         <label class="form-label">Instruksi / Catatan</label>
         <textarea v-model="form.instructions" class="form-textarea" placeholder="Detail pekerjaan..." required></textarea>
       </div>
    </FormModal>
  </div>
</template>

<style scoped>
.tech-dashboard {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--topbar-height) - 60px); 
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
}

.dashboard-layout {
  display: flex;
  gap: var(--space-lg);
  flex: 1;
  overflow: hidden;
}

/* LEFT PANEL */
.unassigned-panel {
  width: 320px;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
}

.panel-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border-light);
  background: var(--color-surface-sunken);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

.panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-secondary);
}

.jobs-list {
  padding: var(--space-md);
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  background: #f8fafc;
}

/* RIGHT PANEL */
.technicians-panel {
  flex: 1;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.tech-swimlanes {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.tech-lane {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--color-border-light);
}
.tech-lane:last-child {
  border-bottom: none;
}

.tech-name {
  background: var(--color-surface);
  padding: 12px 20px;
  font-weight: 600;
  font-size: 13px;
  border-bottom: 1px dashed var(--color-border-light);
  display: flex;
  align-items: center;
  gap: 12px;
  text-transform: uppercase;
  color: var(--color-text);
  position: sticky;
  left: 0;
}

.tech-avatar {
  width: 24px;
  height: 24px;
  background: var(--color-primary);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.tech-jobs {
  min-height: 100px;
  padding: 16px 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  background: #fff; 
  transition: background 0.2s;
}

.tech-jobs:hover {
  background: #f8fafc; /* highlight on hover */
}

/* JOB CARDS */
.job-card {
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 14px;
  cursor: grab;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  transition: transform 0.1s, box-shadow 0.1s, border-color 0.2s;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.job-card:active {
  cursor: grabbing;
  transform: scale(0.98);
  box-shadow: 0 4px 10px rgba(0,0,0,0.1);
}

.job-card:hover {
  border-color: var(--color-primary);
}

.request-card {
  width: 100%;
}

.assigned-card {
  width: 260px;
  background: #f8fafc;
}

.job-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.job-id {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text);
}

.job-type {
  font-size: 10px;
  text-transform: uppercase;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 600;
}

.badge-info { background: rgba(14, 165, 233, 0.15); color: #0284c7; }
.badge-warning { background: rgba(245, 158, 11, 0.15); color: #d97706; }
.badge-success { background: rgba(16, 185, 129, 0.15); color: #059669; }

.job-customer {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.job-problem {
  font-size: 12px;
  color: var(--color-text-muted);
}

.text-truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--color-text-muted);
  font-size: 13px;
  font-style: italic;
}

.empty-lane-text {
  width: 100%;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 13px;
  padding: 20px 0;
  border: 2px dashed var(--color-border-light);
  border-radius: var(--radius-md);
  opacity: 0.5;
}
</style>
