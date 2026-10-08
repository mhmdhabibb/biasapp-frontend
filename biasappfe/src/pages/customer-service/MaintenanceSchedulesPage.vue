<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import type { TableColumn } from '@/types'
import html2pdf from 'html2pdf.js'
import * as XLSX from 'xlsx'

const toast = useToast()
const store = useMasterStore()

const jobOrders = ref<any[]>([])
const loading = ref(false)
const showModal = ref(false)
const showDetailModal = ref(false)
const detailRow = ref<any>(null)
const detailPhotoZoom = ref<string | null>(null)

const form = ref({
  id: '',
  job_order_no: '',
  customer_id: null as string | null,
  unit_id: null as string | null,
  project_name: '',
  problem: '',
  scheduled_date: '',
  instructions: '',
  customer_name: '',
  unit_name: ''
})

const columns: TableColumn[] = [
  { key: 'job_order_no', label: 'Job Order No' },
  { key: 'customer', label: 'Customer' },
  { key: 'unit', label: 'Unit' },
  { key: 'scheduled_date', label: 'Scheduled Date' },
  { key: 'status', label: 'Status' },
]

async function fetchJobs() {
  try {
    const res = await api.get<{ data: any[] }>('/job-orders')
    // Only maintenance visits (identified by problem_description marker)
    jobOrders.value = res.data.filter(j => 
      j.job_type === 'service' && 
      (j.service_request?.problem_description?.includes('[MAINTENANCE_VISIT]') || j.instructions?.includes('Rutin Maintenance'))
    ).map(j => ({
      ...j,
      job_order_no: (j.job_order_no || '').replace('JO-', 'MT-').replace('REQ-', 'MT-')
    }))
  } catch (err) {
    console.error(err)
  }
}

onMounted(() => {
  fetchJobs()
})

const customerOptions = computed(() =>
  store.customers.value.map((c: any) => ({ value: c.id, label: c.company_name || c.name }))
)

const unitOptions = computed(() => {
  if (!form.value.customer_id) return []
  const validUnits = store.getUnitsByCustomer(form.value.customer_id)
  return validUnits.map((u: any) => ({ value: u.id, label: `${u.serial_no || '-'} - ${u.model || u.name}` }))
})

import { watch } from 'vue'
watch(() => form.value.customer_id, (newVal, oldVal) => {
  if (oldVal !== null) form.value.unit_id = null
})

function getCustomerName(row: any) {
  const c = store.findCustomer(row.service_request?.customer_id)
  return c ? c.company_name || c.name : '-'
}

function getUnitName(row: any) {
  const u = store.findUnit(row.service_request?.unit_id)
  return u ? `${u.model} (${u.serial_no || '-'})` : '-'
}

function getTechnicianName(row: any) {
  const t = store.findTechnician(row.technician_id)
  return t ? t.user?.name || t.name : '-'
}

function openAdd() {
  form.value = {
    id: '',
    job_order_no: `MT-${Date.now().toString().slice(-6)}`,
    customer_id: null,
    unit_id: null,
    project_name: '',
    problem: '',
    scheduled_date: new Date().toISOString().slice(0, 16),
    instructions: 'Rutin Maintenance',
    customer_name: '',
    unit_name: ''
  }
  showModal.value = true
}

function openEdit(row: any) {
  form.value = {
    id: row.id,
    job_order_no: row.job_order_no,
    customer_id: String(row.service_request?.customer_id || ''),
    unit_id: String(row.service_request?.unit_id || ''),
    project_name: row.service_request?.project_name || row.project_name || '',
    problem: (row.service_request?.problem_description || row.instructions || '').replace('[MAINTENANCE_VISIT]', '').trim(),
    scheduled_date: row.scheduled_date ? new Date(row.scheduled_date).toISOString().slice(0, 16) : '',
    instructions: row.instructions || '',
    customer_name: getCustomerName(row) || '',
    unit_name: getUnitName(row) || ''
  }
  showModal.value = true
}

function openDetail(row: any) {
  detailRow.value = row
  showDetailModal.value = true
  // Fetch full job order detail to get service_report with photos
  api.get(`/job-orders/${row.id}`).then((res: any) => {
    const full = res?.data?.data ?? res?.data ?? res
    if (full?.id) detailRow.value = full
  }).catch(() => {
    // fallback: keep row data already set
  })
}
async function submitForm() {
  loading.value = true
  try {
    if (form.value.id) {
      // Edit existing
      await api.patch(`/job-orders/${form.value.id}`, {
        scheduled_date: new Date(form.value.scheduled_date).toISOString(),
        instructions: form.value.instructions
      })
      toast.success('Maintenance schedule updated')
    } else {
      // Create new: requires a service request first
      const srPayload = {
        request_no: `MT-${Date.now().toString().slice(-6)}`,
        customer_id: form.value.customer_id,
        unit_id: form.value.unit_id,
        project_name: form.value.project_name,
        problem_description: `[MAINTENANCE_VISIT] ${form.value.problem || form.value.instructions}`,
        request_date: new Date().toISOString(),
        status: 'pending'
      }
      const srRes = await api.post<any>('/service-requests/', srPayload)
      const srId = srRes?.data?.id

      if (srId) {
        const joPayload = {
          job_order_no: form.value.job_order_no,
          service_request_id: srId,
          scheduled_date: new Date(form.value.scheduled_date).toISOString(),
          instructions: form.value.instructions,
          job_type: 'service',
          status: 'scheduled'
        }
        await api.post('/job-orders/', joPayload)
      }
      toast.success('Maintenance schedule created')
    }
    showModal.value = false
    fetchJobs()
  } catch (err: any) {
    toast.error(err.message || 'Error saving maintenance schedule')
  } finally {
    loading.value = false
  }
}

function exportToPdf() {
  const data = jobOrders.value.map((j, index) => {
    const u = store.findUnit(j.service_request?.unit_id || j.unit_id)
    return {
      'No': index + 1,
      'Project Name': j.service_report?.project_name || j.customer_name || 'Pemeliharaan Printer',
      'Model/Type': u ? u.model : '-',
      'Serial Number': u ? (u.serial_no || '-') : '-',
      'Repair Action': (j.service_report?.repair_action || j.instructions || '-').replace('[MAINTENANCE_VISIT]', '').trim(),
      'photoBefore': j.service_report?.photo_before || null,
      'photoAfter': j.service_report?.photo_after || null
    }
  })
  
  if (!data.length) {
    toast.error('No data to export')
    return
  }

  let html = `
    <div style="font-family: sans-serif; padding: 10px;">
      <h2 style="text-align: center; margin-bottom: 5px; text-transform: uppercase;">PHOTO DOKUMENTASI</h2>
      <p style="text-align: center; font-size: 12px; margin-top: 0; margin-bottom: 20px; font-weight: bold;">SURAT PESANAN NO :</p>
      <table border="1" cellpadding="8" cellspacing="0" style="width:100%; border-collapse: collapse; font-size: 11px; text-align: center;">
        <thead>
          <tr style="background-color: #5b9bd5; color: white;">
            <th style="width: 5%">No</th>
            <th style="width: 15%">Project Name</th>
            <th style="width: 15%">Model/Type</th>
            <th style="width: 10%">Serial Number</th>
            <th style="width: 25%">Repair Action</th>
            <th style="width: 15%">Foto Dokumentasi Problem</th>
            <th style="width: 15%">Foto dokumentasi ok diservice</th>
          </tr>
        </thead>
        <tbody>
  `
  
  data.forEach(row => {
    const img1 = row.photoBefore ? `<img src="${row.photoBefore}" style="max-height: 90px; max-width: 120px; object-fit: contain;" crossorigin="anonymous" />` : '-'
    const img2 = row.photoAfter ? `<img src="${row.photoAfter}" style="max-height: 90px; max-width: 120px; object-fit: contain;" crossorigin="anonymous" />` : '-'
    
    html += `
      <tr>
        <td>${row['No']}</td>
        <td>${row['Project Name']}</td>
        <td>${row['Model/Type']}</td>
        <td>${row['Serial Number']}</td>
        <td>${row['Repair Action']}</td>
        <td style="padding: 4px;">${img1}</td>
        <td style="padding: 4px;">${img2}</td>
      </tr>
    `
  })
  html += '</tbody></table></div>'

  const wrapper = document.createElement('div')
  wrapper.innerHTML = html

  const opt = {
    margin: 0.5,
    filename: `Photo_Dokumentasi_${Date.now()}.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' as const }
  }
  html2pdf().set(opt).from(wrapper).save()
}

function exportToExcel() {
  const data = jobOrders.value.map((j, index) => {
    const u = store.findUnit(j.service_request?.unit_id || j.unit_id)
    return {
      'No': index + 1,
      'Project Name': j.service_report?.project_name || j.customer_name || 'Pemeliharaan Printer',
      'Model/Type': u ? u.model : '-',
      'Serial Number': u ? (u.serial_no || '-') : '-',
      'Repair Action': j.service_report?.repair_action || j.instructions || '-',
      'Foto Dokumentasi Problem': j.service_report?.photo_before || '-',
      'Foto dokumentasi ok diservice': j.service_report?.photo_after || '-'
    }
  })
  
  if (!data.length) {
    toast.error('No data to export')
    return
  }

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Photo Dokumentasi")
  XLSX.writeFile(wb, `Photo_Dokumentasi_${Date.now()}.xlsx`)
}
</script>

<template>
  <div>
    <PageHeader title="Maintenance Schedules" button-label="Add Schedule" @add="openAdd">
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

    <DataTable :columns="columns" :data="jobOrders" search-placeholder="Search schedules..." @edit="openEdit" @row-click="openDetail">
      <template #cell-customer="{ row }">{{ getCustomerName(row) }}</template>
      <template #cell-unit="{ row }">{{ getUnitName(row) }}</template>
      <template #cell-scheduled_date="{ value }">
        {{ value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '-' }}
      </template>
      <template #cell-status="{ value }">
        <span class="badge" :class="value === 'completed' ? 'badge-success' : 'badge-info'">
          {{ String(value || '-').toUpperCase().replace('_', ' ') }}
        </span>
      </template>
    </DataTable>

    <FormModal :open="showModal" :title="form.id ? 'Edit Schedule' : 'Create Schedule'" @close="showModal = false" @submit="submitForm">
      
      <div v-if="form.id" style="margin-bottom: 20px; padding: 16px; background: var(--color-surface-hover); border-radius: 8px;">
        <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-muted); margin-bottom: 4px;">Schedule No</div>
        <div style="font-weight: 500; font-size: 16px; color: var(--color-primary); margin-bottom: 12px;">{{ form.job_order_no }}</div>
        
        <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-muted); margin-bottom: 4px;">Customer</div>
        <div style="font-weight: 500; margin-bottom: 12px;">{{ form.customer_name }}</div>
        
        <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-muted); margin-bottom: 4px;">Unit</div>
        <div style="font-weight: 500;">{{ form.unit_name }}</div>
      </div>

      <div class="form-group" v-if="!form.id">
        <label class="form-label">Customer</label>
        <CustomSelect v-model="form.customer_id" :options="customerOptions" placeholder="-- Select Customer --" class="form-select" />
      </div>
      <div class="form-group" v-if="!form.id">
        <label class="form-label">Unit / Machine</label>
        <CustomSelect v-model="form.unit_id" :options="unitOptions" placeholder="-- Select Unit --" class="form-select" :disabled="!form.customer_id" />
      </div>
      <div class="form-group" v-if="!form.id">
        <label class="form-label">Project Name</label>
        <input v-model="form.project_name" type="text" class="form-input" placeholder="e.g. Pemeliharaan Mesin Kantor Pusat">
      </div>
      <div class="form-group" v-if="!form.id">
        <label class="form-label">Problem / Task Description</label>
        <textarea v-model="form.problem" class="form-textarea" rows="2" placeholder="Describe the maintenance task or issue"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Scheduled Date & Time</label>
        <input type="datetime-local" v-model="form.scheduled_date" class="form-input">
      </div>
      <div class="form-group">
        <label class="form-label">Instructions / Remarks</label>
        <textarea v-model="form.instructions" class="form-textarea" rows="3"></textarea>
      </div>
      <template #footer>
        <button type="button" class="btn btn-outline" @click="showModal = false">Cancel</button>
        <button type="button" class="btn btn-primary" :disabled="loading || (!form.id && (!form.customer_id || !form.unit_id))" @click="submitForm">
          {{ loading ? 'Saving...' : 'Save' }}
        </button>
      </template>
    </FormModal>

    <!-- Detail Modal -->
    <FormModal v-if="detailRow" :open="showDetailModal" :title="`Detail ${detailRow.job_order_no}`" max-width="520px" @close="showDetailModal = false">
      <div class="detail-grid">
        <div class="detail-field">
          <span>Job Order No</span>
          <strong>{{ detailRow.job_order_no }}</strong>
        </div>
        <div class="detail-field">
          <span>Status</span>
          <strong>
            <span class="badge" :class="detailRow.status === 'completed' ? 'badge-success' : 'badge-info'">
              {{ String(detailRow.status || '-').toUpperCase().replace('_', ' ') }}
            </span>
          </strong>
        </div>
        <div class="detail-field">
          <span>Customer</span>
          <strong>{{ getCustomerName(detailRow) }}</strong>
        </div>
        <div class="detail-field">
          <span>Technician</span>
          <strong>{{ getTechnicianName(detailRow) || '-' }}</strong>
        </div>
        <div class="detail-field">
          <span>Unit / Machine</span>
          <strong>{{ getUnitName(detailRow) }}</strong>
        </div>
        <div class="detail-field">
          <span>Scheduled Date</span>
          <strong>{{ detailRow.scheduled_date ? new Date(detailRow.scheduled_date).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '-' }}</strong>
        </div>
        <div class="detail-field detail-field--wide">
          <span>Instructions / Remarks</span>
          <strong>{{ (detailRow.instructions || '-').replace('[MAINTENANCE_VISIT]', '').trim() }}</strong>
        </div>
        <div v-if="detailRow.service_report" class="detail-field detail-field--wide">
          <span>Machine Problem</span>
          <strong>{{ detailRow.service_report.machine_problem || '-' }}</strong>
        </div>
        <div v-if="detailRow.service_report" class="detail-field detail-field--wide">
          <span>Repair Action</span>
          <strong>{{ detailRow.service_report.repair_action || '-' }}</strong>
        </div>
      </div>

      <!-- Photos — always shown -->
      <div class="detail-photos">
        <div class="detail-photos-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;vertical-align:-2px"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          Photos
        </div>
        <div class="detail-photos-grid">
          <div class="detail-photo-card">
            <div class="detail-photo-label detail-photo-label--before">Before</div>
            <div class="detail-photo-frame">
              <img v-if="detailRow.service_report?.photo_before" :src="detailRow.service_report.photo_before" alt="Before" class="detail-photo-img" @click="detailPhotoZoom = detailRow.service_report.photo_before" />
              <div v-else class="detail-photo-empty">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <span>No photo</span>
              </div>
            </div>
          </div>
          <div class="detail-photo-card">
            <div class="detail-photo-label detail-photo-label--after">After</div>
            <div class="detail-photo-frame">
              <img v-if="detailRow.service_report?.photo_after" :src="detailRow.service_report.photo_after" alt="After" class="detail-photo-img" @click="detailPhotoZoom = detailRow.service_report.photo_after" />
              <div v-else class="detail-photo-empty">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <span>No photo</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <button type="button" class="btn btn-outline" @click="openEdit(detailRow); showDetailModal = false">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px;vertical-align:-2px"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit
        </button>
        <button type="button" class="btn btn-outline" @click="showDetailModal = false">Close</button>
      </template>
    </FormModal>

    <!-- Photo Lightbox -->
    <Teleport to="body">
      <div v-if="detailPhotoZoom" class="msp-lightbox" @click="detailPhotoZoom = null">
        <button class="msp-lightbox-close" @click="detailPhotoZoom = null">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <img :src="detailPhotoZoom" alt="Zoom" class="msp-lightbox-img" @click.stop />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.detail-field {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
}
.detail-field span {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}
.detail-field strong {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  overflow-wrap: anywhere;
}
.detail-field--wide {
  grid-column: 1 / -1;
}

/* Photos */
.detail-photos {
  margin-top: 16px;
}
.detail-photos-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 10px;
}
.detail-photos-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.detail-photo-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.detail-photo-label {
  display: inline-flex;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: var(--font-size-xs);
  font-weight: 600;
  width: fit-content;
}
.detail-photo-label--before { background: #fff3cd; color: #92620a; }
.detail-photo-label--after  { background: #d1fae5; color: #065f46; }
.detail-photo-frame {
  border: 1px solid var(--color-border-light);
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-surface-sunken);
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.detail-photo-img {
  width: 100%;
  height: 140px;
  object-fit: cover;
  display: block;
  cursor: zoom-in;
  transition: opacity 0.15s;
}
.detail-photo-img:hover {
  opacity: 0.88;
}
.detail-photo-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  padding: 20px;
  text-align: center;
}

/* Lightbox */
.msp-lightbox {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0,0,0,0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
  animation: mspFadeIn 0.15s ease;
}
@keyframes mspFadeIn { from { opacity: 0; } to { opacity: 1; } }
.msp-lightbox-img {
  max-width: 90vw;
  max-height: 88vh;
  border-radius: 6px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.6);
  cursor: default;
  object-fit: contain;
}
.msp-lightbox-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255,255,255,0.15);
  border: 1px solid rgba(255,255,255,0.25);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s;
}
.msp-lightbox-close:hover { background: rgba(255,255,255,0.28); }
@media (max-width: 520px) {
  .detail-grid, .detail-photos-grid { grid-template-columns: 1fr; }
}
</style>
