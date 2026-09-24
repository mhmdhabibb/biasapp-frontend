<script setup lang="ts">
// @ts-nocheck
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import PageHeader from '@/components/ui/PageHeader.vue'

const route = useRoute()
const router = useRouter()
const { currentUser } = useAuth()
const {
  serviceReports,
  findCustomer,
  findContractItem,
  findUnit,
  findProduct,
  findWarranty
} = useMasterStore()

const serviceId = Number(route.params.id)
const job = computed(() => serviceReports.value.find(sr => sr.id === serviceId))

// Authorization check
onMounted(() => {
  if (!job.value || job.value.technician_id !== currentUser.value?.id) {
    alert('Unauthorized or Service Not Found')
    router.replace('/technician/dashboard')
  }
})

const customer = computed(() => findCustomer(job.value?.customer_id || null))
const contract = computed(() => findContractItem(job.value?.contract_item_id || null))
const unit = computed(() => findUnit(contract.value?.unit_id || null))
const product = computed(() => findProduct(Number(unit.value?.model) || null)) // simplified assumption

const slaDurationStr = computed(() => {
  if (!job.value) return '-'
  const created = new Date(job.value.created_at).getTime()
  const end = (job.value.status === 'completed' && job.value.time_out) 
    ? new Date(job.value.time_out).getTime() 
    : new Date().getTime()
  const hours = (end - created) / (1000 * 60 * 60)
  return `${hours.toFixed(1)} Jam`
})

// Form fields
const form = ref({
  inspection_result: job.value?.inspection_result || '',
  repair_action: job.value?.repair_action || '',
  notes: job.value?.notes || '',
  testing_confirmed: job.value?.testing_confirmed || false
})

function acceptJob() {
  if (!job.value) return
  if (confirm('Yakin ingin menerima pekerjaan ini sekarang? Waktu mulai (time_in) akan dicatat.')) {
    job.value.status = 'on_progress'
    job.value.time_in = new Date().toISOString()
  }
}

function requestSparepart() {
  router.push(`/technician/sparepart-request?service_id=${serviceId}`)
}

function completeJob() {
  if (!job.value) return
  if (!form.value.inspection_result.trim()) {
    alert('Hasil Pemeriksaan harus diisi!')
    return
  }
  if (!form.value.repair_action.trim()) {
    alert('Tindakan Perbaikan harus diisi!')
    return
  }
  if (!form.value.testing_confirmed) {
    alert('Testing harus dikonfirmasi!')
    return
  }
  if (confirm('Yakin ingin menyelesaikan pekerjaan ini? Waktu selesai (time_out) akan dicatat.')) {
    job.value.inspection_result = form.value.inspection_result
    job.value.repair_action = form.value.repair_action
    job.value.notes = form.value.notes
    job.value.testing_confirmed = form.value.testing_confirmed
    job.value.status = 'completed'
    job.value.time_out = new Date().toISOString()
    job.value.is_complete = true
    job.value.updated_at = new Date().toISOString()
    alert('Pekerjaan selesai!')
    router.push('/technician/call-services')
  }
}
</script>

<template>
  <div class="tech-job-detail" v-if="job">
    <PageHeader title="Detail Call Service" :back-button="true" @back="router.back()" />

    <div class="grid-2">
      <!-- Info Section -->
      <div class="card p-lg">
        <h2 class="card-title mb-md">Informasi Service</h2>
        <div class="info-list">
          <div class="info-item">
            <span class="info-label">Service No</span>
            <span class="info-value font-bold">{{ job.service_report_no }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Customer</span>
            <span class="info-value">{{ customer?.company_name || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Alamat</span>
            <span class="info-value">{{ customer?.address || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">PIC & Kontak</span>
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
            <span class="badge" :class="'badge-' + (job.status === 'completed' ? 'success' : job.status === 'on_progress' ? 'info' : 'warning')">
              {{ job.status.toUpperCase().replace('_', ' ') }}
            </span>
          </div>
          <div class="info-item">
            <span class="info-label">Durasi / SLA</span>
            <span class="info-value">{{ slaDurationStr }} (Batas: 2 Jam)</span>
          </div>
        </div>

        <div class="mt-lg pt-md" style="border-top: 1px solid var(--color-border-light)">
          <h3 class="text-md font-bold mb-sm">Keluhan Customer</h3>
          <p class="text-sm p-md" style="background: var(--color-surface-sunken); border-radius: var(--radius-md);">
            {{ job.machine_problem || 'Tidak ada catatan keluhan.' }}
          </p>
        </div>
      </div>

      <!-- Action Section -->
      <div class="card p-lg">
        <h2 class="card-title mb-md">Form Pemeriksaan</h2>

        <div v-if="job.status === 'assigned'" class="text-center py-xl">
          <p class="mb-lg text-muted">Anda belum menerima pekerjaan ini.</p>
          <button class="btn btn-primary" style="padding: var(--space-md) var(--space-xl); font-size: 16px;" @click="acceptJob">
            Terima Pekerjaan
          </button>
        </div>

        <div v-else-if="job.status === 'on_progress' || job.status === 'waiting_sparepart'">
          <div class="form-group">
            <label class="form-label">Hasil Pemeriksaan <span class="text-danger">*</span></label>
            <textarea v-model="form.inspection_result" class="form-textarea" rows="3" placeholder="Deskripsikan hasil pengecekan unit..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Tindakan Perbaikan <span class="text-danger">*</span></label>
            <textarea v-model="form.repair_action" class="form-textarea" rows="3" placeholder="Apa yang dilakukan untuk memperbaiki masalah?"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Catatan Tambahan</label>
            <textarea v-model="form.notes" class="form-textarea" rows="2" placeholder="Catatan operasional..."></textarea>
          </div>

          <div class="mt-md mb-lg">
            <button class="btn btn-outline" @click="requestSparepart">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-sm"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
              Request Sparepart
            </button>
            <p v-if="job.status === 'waiting_sparepart'" class="text-warning text-sm mt-xs">
              Status saat ini: Menunggu Sparepart. Anda tetap dapat memperbarui laporan.
            </p>
          </div>

          <div class="form-group">
            <label class="flex items-center gap-sm cursor-pointer p-md" style="background: var(--color-surface-sunken); border-radius: var(--radius-sm)">
              <input type="checkbox" v-model="form.testing_confirmed" style="width: 20px; height: 20px;">
              <span class="font-bold">Mesin sudah dilakukan testing dan berfungsi normal. <span class="text-danger">*</span></span>
            </label>
          </div>

          <button class="btn btn-primary w-full" style="padding: var(--space-md); font-size: 16px;" @click="completeJob">
            Selesaikan Service
          </button>
        </div>

        <div v-else-if="job.status === 'completed'">
          <div class="form-group">
            <label class="form-label">Hasil Pemeriksaan</label>
            <div class="p-sm text-sm" style="background: var(--color-surface-sunken); border-radius: var(--radius-sm)">{{ job.inspection_result || '-' }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Tindakan Perbaikan</label>
            <div class="p-sm text-sm" style="background: var(--color-surface-sunken); border-radius: var(--radius-sm)">{{ job.repair_action || '-' }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Catatan Tambahan</label>
            <div class="p-sm text-sm" style="background: var(--color-surface-sunken); border-radius: var(--radius-sm)">{{ job.notes || '-' }}</div>
          </div>
          <div class="mt-md text-success font-bold flex items-center gap-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Pekerjaan telah diselesaikan pada {{ new Date(job.time_out).toLocaleString('id-ID') }}
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
