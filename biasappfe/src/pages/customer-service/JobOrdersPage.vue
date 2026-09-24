<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn } from '@/types'
import { reactive, ref, onMounted } from 'vue'

const { technicians } = useMasterStore()

const columns: TableColumn[] = [
  { key: 'job_order_no', label: 'Job Order No' },
  { key: 'scheduled_date', label: 'Tgl Jadwal' },
  { key: 'service_request_no', label: 'Request Ref' },
  { key: 'technician', label: 'Teknisi' },
  { key: 'status', label: 'Status' }
]

const jobOrders = ref<any[]>([])
const serviceRequests = ref<any[]>([]) // Used for selection

const showModal = ref(false)
const isLoading = ref(false)

const form = reactive({
  job_order_no: `JO-${Date.now().toString().slice(-6)}`,
  service_request_id: null as string | null,
  technician_id: '',
  scheduled_date: new Date().toISOString().slice(0, 10),
  instructions: ''
})

function openAdd() {
  Object.assign(form, {
    job_order_no: `JO-${Date.now().toString().slice(-6)}`,
    service_request_id: null,
    technician_id: '',
    scheduled_date: new Date().toISOString().slice(0, 10),
    instructions: ''
  })
  showModal.value = true
}

async function fetchJobOrders() {
  try {
    const res = await fetch('http://localhost:4008/api/job-orders')
    if (res.ok) {
      const data = await res.json()
      jobOrders.value = data.data.map((j: any) => ({
        ...j,
        service_request_no: j.service_request?.request_no || '-',
        technician: j.technician?.name || '-',
      }))
    }
  } catch (error) {
    console.error("Gagal mengambil data", error)
  }
}

async function fetchServiceRequests() {
  try {
    const res = await fetch('http://localhost:4008/api/service-requests')
    if (res.ok) {
      const data = await res.json()
      // Filter open/pending requests for selection
      serviceRequests.value = data.data.filter((r: any) => r.status === 'pending' || r.status === 'open')
    }
  } catch (error) {
    console.error("Gagal mengambil data SR", error)
  }
}

async function handleSubmit() {
  if (!form.technician_id) return
  isLoading.value = true
  
  const payload = {
    job_order_no: form.job_order_no,
    service_request_id: form.service_request_id || null,
    technician_id: form.technician_id,
    scheduled_date: new Date(form.scheduled_date).toISOString(),
    instructions: form.instructions
  }

  try {
    const res = await fetch('http://localhost:4008/api/job-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    
    if (res.ok) {
      alert("Job Order berhasil dibuat dan ditugaskan ke Teknisi!")
      showModal.value = false
      fetchJobOrders()
    } else {
      const err = await res.json()
      alert("Gagal: " + JSON.stringify(err))
    }
  } catch (error) {
    alert("Terjadi kesalahan jaringan.")
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchJobOrders()
  fetchServiceRequests()
})
</script>

<template>
  <div>
    <PageHeader title="Manajemen Job Order" button-label="Buat Job Order" @add="openAdd" />
    
    <DataTable :columns="columns" :data="jobOrders" search-placeholder="Cari job order...">
      <template #cell-scheduled_date="{ value }">{{ new Date(value).toLocaleDateString('id-ID') }}</template>
    </DataTable>

    <FormModal :open="showModal" title="Assign Teknisi (Job Order)" @close="showModal = false" @submit="handleSubmit">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Job Order No</label>
          <input v-model="form.job_order_no" type="text" class="form-input" required>
        </div>
        <div class="form-group">
          <label class="form-label">Tanggal Penugasan</label>
          <input v-model="form.scheduled_date" type="date" class="form-input" required>
        </div>
      </div>

      <div class="form-group mt-3">
        <label class="form-label">Keluhan (Service Request) Terkait</label>
        <select v-model="form.service_request_id" class="form-select">
          <option :value="null">-- Tanpa Service Request Khusus --</option>
          <option v-for="sr in serviceRequests" :key="sr.id" :value="sr.id">
            {{ sr.request_no }} - {{ sr.customer?.company_name || sr.customer?.name }} ({{ sr.problem_description.slice(0, 30) }}...)
          </option>
        </select>
        <div class="text-xs text-gray-500 mt-1">*Hanya keluhan berstatus pending/open yang muncul.</div>
      </div>

      <div class="form-group mt-3">
        <label class="form-label">Pilih Teknisi</label>
        <select v-model="form.technician_id" class="form-select" required>
          <option value="">-- Tugaskan ke --</option>
          <option v-for="t in technicians" :key="t.id" :value="t.id">{{ (t as any).name }} - Status: {{ (t as any).status || 'available' }}</option>
        </select>
      </div>

      <div class="form-group mt-3">
        <label class="form-label">Instruksi Khusus untuk Teknisi</label>
        <textarea v-model="form.instructions" class="form-input" rows="3" placeholder="Instruksi perbaikan..."></textarea>
      </div>
      
      <div v-if="isLoading" class="mt-2 text-center text-sm text-gray-500">Menyimpan data...</div>
    </FormModal>
  </div>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-base);
}
.mt-3 { margin-top: 1rem; }
.mt-2 { margin-top: 0.5rem; }
.mt-1 { margin-top: 0.25rem; }
.text-center { text-align: center; }
.text-sm { font-size: 0.875rem; }
.text-xs { font-size: 0.75rem; }
.text-gray-500 { color: #6b7280; }
</style>
