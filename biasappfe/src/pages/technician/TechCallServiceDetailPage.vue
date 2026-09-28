<script setup lang="ts">
// @ts-nocheck
import { ref, computed, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { useToast } from '@/composables/useToast'
import { usePermission } from '@/composables/usePermission'
import { api } from '@/services/api'
import PageHeader from '@/components/ui/PageHeader.vue'

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

watchEffect(() => {
  if (job.value && myTechId.value && String(job.value.technician_id) !== String(myTechId.value)) {
    toast.error('Unauthorized or Service Not Found')
    router.replace('/technician/dashboard')
  }
})

const customer = computed(() => findCustomer(job.value?.customer_id || job.value?.service_request?.customer_id || null))
const contract = computed(() => contractItems.value.find(ci => String(ci.unit_id) === String(job.value?.unit_id || job.value?.service_request?.unit_id)) || null)
const unit = computed(() => findUnit(job.value?.unit_id || job.value?.service_request?.unit_id || null))

const slaDurationStr = computed(() => {
  if (!job.value) return '-'
  const created = new Date(job.value.created_at).getTime()
  const end = (job.value.status === 'completed' && job.value.time_out)
    ? new Date(job.value.time_out).getTime()
    : new Date().getTime()
  const hours = (end - created) / (1000 * 60 * 60)
  return `${hours.toFixed(1)} Jam`
})

// Form states managed in separate pages now
const isAllFormsCompleted = computed(() => {
  if (!job.value) return false
  const techOk = !!job.value.remarks && job.value.is_tested
  const srOk = !!job.value.repair_action
  let copierOk = true
  if (unit.value?.is_copier || unit.value?.model?.toLowerCase().includes('copier')) {
    copierOk = job.value.reading_counter !== null && job.value.reading_counter !== undefined && Number(job.value.reading_counter) > 0
  }
  return techOk && srOk && copierOk
})

let isRecovering = false
watchEffect(() => {
  if (job.value?.status === 'in_progress' && !serviceReport.value && !isRecovering) {
    isRecovering = true
    acceptJob(true).finally(() => {
      isRecovering = false
    })
  }
})

async function acceptJob(silent = false) {
  if (!job.value) return
  if (!silent && !confirm('Yakin ingin menerima pekerjaan ini sekarang? Waktu mulai (time_in) akan dicatat.')) {
    return
  }
    try {
      const now = new Date().toISOString()
      await api.patch(`/job-orders/${job.value.id}`, { status: 'in_progress' })
      
      await api.post('/service-reports', {
        report_no: `SR-${Date.now().toString().slice(-6)}`,
        job_order_id: job.value.id,
        unit_id: unit.value?.id,
        customer_id: customer.value?.id,
        technician_id: job.value.technician_id,
        service_type: job.value.job_type || 'repair',
        status: 'in_progress',
        time_in: now,
        machine_problem: job.value.instructions || job.value.service_request?.problem_description || '-',
        project_name: '-',
        repair_action: '-',
        service_date: now,
        time_out: '-'
      })
      
      toast.success('Pekerjaan diterima. Waktu mulai tercatat.')
      await refresh(true)
    } catch (err: any) {
      toast.error(err.message || 'Gagal menerima pekerjaan')
    }
}

function requestSparepart() {
  router.push(`/technician/sparepart-request?service_id=${serviceId}`)
}

async function completeJob() {
  if (!job.value) return
  if (!isAllFormsCompleted.value) {
    toast.warning('Selesaikan semua form terlebih dahulu!')
    return
  }
  if (confirm('Yakin ingin menyelesaikan pekerjaan ini? Waktu selesai (time_out) akan dicatat.')) {
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



      toast.success('Pekerjaan selesai! Data penggantian sparepart masuk antrean Procurement.')
      await refresh(true)
      router.push('/technician/call-services')
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyelesaikan pekerjaan')
    }
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
            <span class="info-label">Job Order No</span>
            <span class="info-value font-bold">{{ job.job_order_no }}</span>
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
            <span class="badge" :class="'badge-' + (job.status === 'completed' ? 'success' : job.status === 'in_progress' ? 'info' : 'warning')">
              {{ job.status.toUpperCase().replace('_', ' ') }}
            </span>
          </div>
          <div class="info-item">
            <span class="info-label">Durasi / SLA</span>
            <span class="info-value">{{ slaDurationStr }} (Batas: 2 Jam)</span>
          </div>
        </div>

        <div class="mt-lg pt-md" style="border-top: 1px solid var(--color-border-light)">
          <h3 class="text-md font-bold mb-sm">Instruksi / Keluhan</h3>
          <p class="text-sm p-md" style="background: var(--color-surface-sunken); border-radius: var(--radius-md);">
            {{ job.instructions || job.service_request?.problem_description || 'Tidak ada catatan.' }}
          </p>
        </div>
      </div>

      <!-- Action Section -->
      <div class="card p-lg">
        <h2 class="card-title mb-md">Form Pemeriksaan</h2>

        <div v-if="job.status === 'assigned' || job.status === 'pending' || job.status === 'scheduled'" class="text-center py-xl">
          <p class="mb-lg text-muted">Anda belum menerima pekerjaan ini.</p>
          <button v-if="can('service_report:update')" class="btn btn-primary" style="padding: var(--space-md) var(--space-xl); font-size: 16px;" @click="acceptJob">
            Terima Pekerjaan
          </button>
        </div>

        <div v-else-if="job.status === 'in_progress'">
          <div v-if="!serviceReport" class="mb-lg p-md text-center text-muted" style="background: var(--color-surface-sunken); border-radius: var(--radius-md);">
            <p class="text-sm">🔄 Sedang menyiapkan data form...</p>
          </div>
          <div v-else>
            <div class="mb-lg p-md" style="background: var(--color-surface-sunken); border-radius: var(--radius-md);">
              <p class="font-bold mb-xs">Lengkapi Formulir Service</p>
              <p class="text-sm text-muted">Buka dan isi masing-masing form di bawah ini. Status akan berubah menjadi checklist (✅) bila sudah terisi.</p>
            </div>
          </div>

          <div class="form-list" v-if="serviceReport">
            <button class="btn btn-outline w-full mb-sm text-left flex justify-between items-center p-md" @click="router.push(`/technician/call-services/${serviceReport?.id}/technical-report`)">
              <span class="font-bold"><span v-if="serviceReport?.remarks && serviceReport?.is_tested">✅</span><span v-else>📝</span> 1. Technical Report</span>
              <span>></span>
            </button>
            <button class="btn btn-outline w-full mb-sm text-left flex justify-between items-center p-md" @click="router.push(`/technician/call-services/${serviceReport?.id}/service-report`)">
              <span class="font-bold"><span v-if="serviceReport?.repair_action">✅</span><span v-else>📝</span> 2. Service Report Form</span>
              <span>></span>
            </button>
            <button v-if="unit?.is_copier || unit?.model?.toLowerCase().includes('copier')" class="btn btn-outline w-full mb-sm text-left flex justify-between items-center p-md" @click="router.push(`/technician/call-services/${serviceReport?.id}/copier-report`)">
              <span class="font-bold"><span v-if="serviceReport?.reading_counter">✅</span><span v-else>📝</span> 3. Copier Service Report</span>
              <span>></span>
            </button>
          </div>

          <div class="mt-lg">
            <button v-if="can('service_sparepart:create')" class="btn btn-outline text-sm" @click="requestSparepart">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-sm"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
              Request Sparepart ke Gudang
            </button>
          </div>

          <div class="mt-xl pt-md" style="border-top: 1px solid var(--color-border-light)">
            <button v-if="can('service_report:update')" class="btn btn-primary w-full" :disabled="!isAllFormsCompleted" style="padding: var(--space-md); font-size: 16px;" @click="completeJob">
              {{ isAllFormsCompleted ? '✅ Selesaikan Service' : '🔒 Selesaikan Form Dulu' }}
            </button>
          </div>
        </div>

        <div v-else-if="job.status === 'completed'">
          <div class="form-group">
            <label class="form-label">Hasil Pemeriksaan</label>
            <div class="p-sm text-sm" style="background: var(--color-surface-sunken); border-radius: var(--radius-sm); white-space: pre-wrap;">{{ serviceReport?.remarks || '-' }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Tindakan Perbaikan</label>
            <div class="p-sm text-sm" style="background: var(--color-surface-sunken); border-radius: var(--radius-sm)">{{ serviceReport?.repair_action || '-' }}</div>
          </div>
                    <div class="form-group mt-md" style="padding: 12px; border: 1px dashed var(--color-border); border-radius: var(--radius-md);">
            <label class="form-label">Penggantian Komponen Langsung</label>
            <div v-if="serviceReport?.service_spareparts && serviceReport.service_spareparts.length > 0">
              <div v-for="sp in serviceReport.service_spareparts" :key="sp.id" class="text-sm p-sm" style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span>{{ findProduct(sp.product_id)?.name || sp.product_id }}</span>
                <span class="font-bold">x {{ sp.qty }}</span>
              </div>
            </div>
            <div v-else class="text-sm text-muted">Tidak ada penggantian komponen.</div>
          </div>

          <div class="mt-md text-success font-bold flex items-center gap-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Pekerjaan telah diselesaikan pada {{ job.completed_at ? new Date(job.completed_at).toLocaleString('id-ID') : '-' }}
          </div>

          <div class="mt-lg">
            <button class="btn btn-primary w-full" style="padding: var(--space-md); font-size: 16px;" @click="router.push(`/shared/service-reports/${serviceReport?.id}`)">
              📄 Lihat Laporan Lengkap (Digital)
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

