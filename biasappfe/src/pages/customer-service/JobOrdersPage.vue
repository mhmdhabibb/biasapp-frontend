<script setup lang="ts">
import { useMasterStore } from '@/composables/useMasterStore'
import { ref, onMounted, computed } from 'vue'

const { technicians } = useMasterStore()

const jobOrders = ref<any[]>([])
const serviceRequests = ref<any[]>([])

const searchUnassigned = ref('')
const searchTech = ref('')

async function fetchJobOrders() {
  try {
    const res = await fetch('http://localhost:4008/api/job-orders', {
      headers: { 'Authorization': `Bearer ${sessionStorage.getItem('bias_token')}` }
    })
    if (res.ok) {
      const data = await res.json()
      jobOrders.value = data.data.map((j: any) => ({
        ...j,
        service_request_no: j.service_request?.request_no || '-',
        customer_name: j.service_request?.customer?.company_name || j.service_request?.customer?.name || '-',
        problem: j.service_request?.problem_description || '-',
      }))
    }
  } catch (error) {
    console.error("Gagal mengambil data", error)
  }
}

async function fetchServiceRequests() {
  try {
    const res = await fetch('http://localhost:4008/api/service-requests', {
      headers: { 'Authorization': `Bearer ${sessionStorage.getItem('bias_token')}` }
    })
    if (res.ok) {
      const data = await res.json()
      serviceRequests.value = data.data
    }
  } catch (error) {
    console.error("Gagal mengambil data SR", error)
  }
}

onMounted(() => {
  fetchJobOrders()
  fetchServiceRequests()
})

const unassignedRequests = computed(() => {
  // Find SRs that don't have a job order yet (or just show all pending/open)
  const assignedSrIds = new Set(jobOrders.value.map(j => j.service_request_id))
  return serviceRequests.value.filter(sr => 
    (sr.status === 'pending' || sr.status === 'open') && 
    !assignedSrIds.has(sr.id) &&
    (sr.request_no.toLowerCase().includes(searchUnassigned.value.toLowerCase()) || 
     (sr.customer?.name || '').toLowerCase().includes(searchUnassigned.value.toLowerCase()))
  )
})

const filteredTechs = computed(() => {
  if (!searchTech.value) return technicians.value;
  return technicians.value.filter((t: any) => t && (t.name || (t.user && t.user.name) || '').toLowerCase().includes(searchTech.value.toLowerCase()))
})

function getJobsForTech(techId: string) {
  return jobOrders.value.filter(j => j.technician_id === techId)
}

function formatDateDisplay(d: string) {
  const date = new Date(d)
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

// Drag and drop logic
let draggedRequest: any = null

function onDragStart(req: any) {
  draggedRequest = req
}

async function onDrop(techId: string) {
  if (!draggedRequest) return
  
  const payload = {
    job_order_no: `JO-${Date.now().toString().slice(-6)}`,
    service_request_id: draggedRequest.id,
    technician_id: techId,
    scheduled_date: new Date().toISOString(),
    instructions: draggedRequest.problem_description || 'Silakan cek unit'
  }

  try {
    const res = await fetch('http://localhost:4008/api/job-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('bias_token')}` },
      body: JSON.stringify(payload)
    })
    
    if (res.ok) {
      draggedRequest = null
      fetchJobOrders()
    } else {
      alert("Gagal assign job order")
    }
  } catch (error) {
    alert("Terjadi kesalahan")
  }
}
</script>

<template>
  <div class="dashboard-layout">
    <!-- Left Sidebar for Unassigned Requests -->
    <div class="sidebar">
      <div class="sidebar-header">
        <h3 class="title">SERVICE REQUESTS</h3>
        <button class="action-btn">Action</button>
      </div>
      <div class="sidebar-search">
        <input v-model="searchUnassigned" type="text" placeholder="Search code..." class="search-input">
        <button class="refresh-btn" @click="fetchServiceRequests">↻</button>
      </div>
      <div class="unassigned-list">
        <div v-if="unassignedRequests.length === 0" class="empty-state">Belum ada request baru</div>
        <div 
          v-for="req in unassignedRequests" 
          :key="req.id" 
          class="job-card draggble"
          draggable="true"
          @dragstart="onDragStart(req)"
        >
          <div class="card-header">
            <span class="ref-no">{{ req.request_no }}</span>
            <span class="date-tag">{{ formatDateDisplay(req.created_at) }}</span>
          </div>
          <div class="card-body">
            <div class="customer-name">{{ req.customer?.company_name || req.customer?.name }}</div>
            <div class="problem-text">{{ req.problem_description }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Board for Technicians -->
    <div class="main-board">
      <div class="board-topbar">
        <input v-model="searchTech" type="text" placeholder="Search for Technician Name" class="search-input">
        <select class="filter-select"><option>All</option></select>
        <button class="filter-btn black">ALL</button>
      </div>

      <div class="tech-lanes">
        <div v-for="t in filteredTechs" :key="t.id" class="tech-row">
          <div class="tech-name">{{ (t as any).name || ((t as any).user && (t as any).user.name) || 'Unknown' }} - {{ (t as any).status || 'AVAILABLE' }}</div>
          
          <div 
            class="tech-lane"
            @dragover.prevent
            @drop="onDrop(t.id)"
          >
            <div class="lane-empty" v-if="getJobsForTech(t.id).length === 0">Tarik request ke sini untuk assign ke Teknisi</div>
            
            <div class="job-card assigned" v-for="job in getJobsForTech(t.id)" :key="job.id">
              <div class="card-header">
                <span class="ref-no">{{ job.service_request_no }}</span>
                <span class="status-badge">{{ job.status }}</span>
                <span class="date-tag">{{ formatDateDisplay(job.scheduled_date) }}</span>
              </div>
              <div class="card-body">
                <div class="customer-name">{{ job.customer_name }}</div>
                <div class="problem-text">{{ job.problem }}</div>
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-layout {
  display: flex;
  height: calc(100vh - var(--header-height, 60px) - 40px);
  background: #f0f2f5;
  font-family: 'Inter', sans-serif;
  gap: 16px;
}

/* Sidebar Styles */
.sidebar {
  width: 320px;
  background: #f0f2f5;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.sidebar-header .title {
  font-weight: 700;
  font-size: 16px;
  color: #333;
}

.action-btn {
  background: #4ade80;
  color: white;
  border: none;
  padding: 6px 16px;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
}

.sidebar-search {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  outline: none;
  font-size: 13px;
}

.refresh-btn {
  background: #4ade80;
  color: white;
  border: none;
  width: 34px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
}

.unassigned-list {
  background: white;
  flex: 1;
  border-radius: 8px;
  padding: 12px;
  overflow-y: auto;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.empty-state {
  text-align: center;
  color: #999;
  font-size: 13px;
  margin-top: 20px;
}

/* Main Board Styles */
.main-board {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  overflow: hidden;
}

.board-topbar {
  padding: 12px 20px;
  border-bottom: 1px solid #eee;
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
}

.filter-select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  min-width: 100px;
}

.filter-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-weight: bold;
  font-size: 12px;
  cursor: pointer;
}
.filter-btn.black {
  background: #000;
  color: #fff;
}

.tech-lanes {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: #f8f9fa;
}

.tech-row {
  margin-bottom: 24px;
}

.tech-name {
  font-size: 11px;
  font-weight: 700;
  color: #666;
  text-transform: uppercase;
  margin-bottom: 4px;
  letter-spacing: 0.5px;
}

.tech-lane {
  background: #fff;
  border: 1px solid #e2e8f0;
  min-height: 80px;
  padding: 8px;
  border-radius: 4px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: flex-start;
}

.lane-empty {
  color: #bbb;
  font-size: 12px;
  font-style: italic;
  width: 100%;
  text-align: center;
  margin-top: 20px;
}

/* Card Styles */
.job-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 10px;
  width: 100%;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
  transition: transform 0.2s, box-shadow 0.2s;
}

.job-card.draggble {
  cursor: grab;
  margin-bottom: 10px;
}
.job-card.draggble:active {
  cursor: grabbing;
}

.job-card.assigned {
  width: 280px;
  border-left: 3px solid #22c55e;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.ref-no {
  color: #22c55e;
  font-weight: 700;
  font-size: 13px;
}

.date-tag {
  background: #ef4444;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: bold;
  margin-left: auto;
}

.status-badge {
  background: #4ade80;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: bold;
}

.card-body {
  font-size: 11px;
}

.customer-name {
  color: #ef4444;
  font-weight: 700;
  margin-bottom: 4px;
}

.problem-text {
  color: #666;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
