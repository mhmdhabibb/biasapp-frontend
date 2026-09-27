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
  contractItems,
  findCustomer,
  findUnit,
  findProduct,
  getTechnicianIdByUser,
  refresh
} = useMasterStore()

const serviceId = String(route.params.id)
const job = computed(() => serviceReports.value.find(sr => String(sr.id) === serviceId))

// service_report.technician_id references technicians.id, not users.id
const myTechId = computed(() => getTechnicianIdByUser(currentUser.value?.id || null))

watchEffect(() => {
  if (job.value && myTechId.value && String(job.value.technician_id) !== String(myTechId.value)) {
    toast.error('Unauthorized or Service Not Found')
    router.replace('/technician/dashboard')
  }
})

const customer = computed(() => findCustomer(job.value?.customer_id || null))
const contract = computed(() => contractItems.value.find(ci => String(ci.unit_id) === String(job.value?.unit_id)) || null)
const unit = computed(() => findUnit(job.value?.unit_id || null))

const slaDurationStr = computed(() => {
  if (!job.value) return '-'
  const created = new Date(job.value.created_at).getTime()
  const end = (job.value.status === 'completed' && job.value.time_out)
    ? new Date(job.value.time_out).getTime()
    : new Date().getTime()
  const hours = (end - created) / (1000 * 60 * 60)
  return `${hours.toFixed(1)} Jam`
})

// Form fields (backend ServiceReport contract: remarks, repair_action, is_tested)
const form = ref({
  remarks: job.value?.remarks || '',
  repair_action: job.value?.repair_action || '',
  notes: '',
  is_tested: job.value?.is_tested || false,
  spareparts: [] as any[]
})

async function acceptJob() {
  if (!job.value) return
  if (confirm('Yakin ingin menerima pekerjaan ini sekarang? Waktu mulai (time_in) akan dicatat.')) {
    try {
      const now = new Date().toISOString()
      await api.patch(`/service-reports/${job.value.id}`, { status: 'in_progress', time_in: now })
      job.value.status = 'in_progress'
      job.value.time_in = now
      toast.success('Pekerjaan diterima. Waktu mulai tercatat.')
      refresh(true)
    } catch (err: any) {
      toast.error(err.message || 'Gagal menerima pekerjaan')
    }
  }
}

function requestSparepart() {
  router.push(`/technician/sparepart-request?service_id=${serviceId}`)
}

async function completeJob() {
  if (!job.value) return
  if (!form.value.remarks.trim()) {
    toast.warning('Hasil Pemeriksaan harus diisi!')
    return
  }
  if (!form.value.repair_action.trim()) {
    toast.warning('Tindakan Perbaikan harus diisi!')
    return
  }
  if (!form.value.is_tested) {
    toast.warning('Testing harus dikonfirmasi!')
    return
  }
  if (confirm('Yakin ingin menyelesaikan pekerjaan ini? Waktu selesai (time_out) akan dicatat.')) {
    try {
      const now = new Date().toISOString()
      const remarks = [form.value.remarks, form.value.notes]
        .map(s => s.trim()).filter(Boolean).join('\n')

      await api.patch(`/service-reports/${job.value.id}`, {
        status: 'completed',
        is_completed: true,
        is_tested: true,
        time_out: now,
        repair_action: form.value.repair_action,
        remarks
      })

      for (const sp of form.value.spareparts) {
        if (sp.product_id && sp.qty > 0) {
          await api.post('/service-spareparts/', {
            service_report_id: job.value.id,
            product_id: sp.product_id,
            qty: Number(sp.qty)
          })
        }
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
            <span class="info-label">Service No</span>
            <span class="info-value font-bold">{{ job.report_no }}</span>
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
          <h3 class="text-md font-bold mb-sm">Keluhan Customer</h3>
          <p class="text-sm p-md" style="background: var(--color-surface-sunken); border-radius: var(--radius-md);">
            {{ job.machine_problem || 'Tidak ada catatan keluhan.' }}
          </p>
        </div>
      </div>

      <!-- Action Section -->
      <div class="card p-lg">
        <h2 class="card-title mb-md">Form Pemeriksaan</h2>

        <div v-if="job.status === 'assigned' || job.status === 'pending'" class="text-center py-xl">
          <p class="mb-lg text-muted">Anda belum menerima pekerjaan ini.</p>
          <button v-if="can('service_report:update')" class="btn btn-primary" style="padding: var(--space-md) var(--space-xl); font-size: 16px;" @click="acceptJob">
            Terima Pekerjaan
          </button>
        </div>

        <div v-else-if="job.status === 'in_progress'">
          <div class="form-group">
            <label class="form-label">Hasil Pemeriksaan <span class="text-danger">*</span></label>
            <textarea v-model="form.remarks" class="form-textarea" rows="3" placeholder="Deskripsikan hasil pengecekan unit..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Tindakan Perbaikan <span class="text-danger">*</span></label>
            <textarea v-model="form.repair_action" class="form-textarea" rows="3" placeholder="Apa yang dilakukan untuk memperbaiki masalah?"></textarea>
          </div>
                    <div class="form-group mt-md" style="padding: 12px; border: 1px dashed var(--color-border); border-radius: var(--radius-md);">
            <label class="form-label">Penggantian Komponen Langsung</label>
            <div v-for="(sp, idx) in form.spareparts" :key="idx" style="display: flex; gap: 8px; margin-bottom: 10px;">
              <select v-model="sp.product_id" class="form-select" style="flex: 1; padding: 6px; font-size: 13px;">
                <option value="" disabled>Pilih Komponen...</option>
                <option v-for="p in useMasterStore().products.value" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
              <input type="number" v-model="sp.qty" class="form-input" style="width: 60px; padding: 6px; text-align: center;" min="1" placeholder="Qty">
              <button type="button" class="btn btn-sm btn-outline" style="color: var(--color-danger); border-color: var(--color-danger); padding: 4px 10px;" @click="form.spareparts.splice(idx, 1)">x</button>
            </div>
            <button type="button" class="btn btn-sm btn-outline mt-xs w-full" style="width: 100%; border-style: dashed;" @click="form.spareparts.push({product_id: '', qty: 1})">
              + Tambah Penggunaan Sparepart
            </button>
          </div>

          <div class="form-group">
            <label class="form-label">Catatan Tambahan</label>
            <textarea v-model="form.notes" class="form-textarea" rows="2" placeholder="Catatan operasional..."></textarea>
          </div>

          <div class="mt-md mb-lg">
            <button v-if="can('service_sparepart:create')" class="btn btn-outline" @click="requestSparepart">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-sm"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
              Request Sparepart
            </button>
          </div>

          <div class="form-group">
            <label class="flex items-center gap-sm cursor-pointer p-md" style="background: var(--color-surface-sunken); border-radius: var(--radius-sm)">
              <input type="checkbox" v-model="form.is_tested" style="width: 20px; height: 20px;">
              <span class="font-bold">Mesin sudah dilakukan testing dan berfungsi normal. <span class="text-danger">*</span></span>
            </label>
          </div>

          <button v-if="can('service_report:update')" class="btn btn-primary w-full" style="padding: var(--space-md); font-size: 16px;" @click="completeJob">
            Selesaikan Service
          </button>
        </div>

        <div v-else-if="job.status === 'completed'">
          <div class="form-group">
            <label class="form-label">Hasil Pemeriksaan</label>
            <div class="p-sm text-sm" style="background: var(--color-surface-sunken); border-radius: var(--radius-sm); white-space: pre-wrap;">{{ job.remarks || '-' }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Tindakan Perbaikan</label>
            <div class="p-sm text-sm" style="background: var(--color-surface-sunken); border-radius: var(--radius-sm)">{{ job.repair_action || '-' }}</div>
          </div>
                    <div class="form-group mt-md" style="padding: 12px; border: 1px dashed var(--color-border); border-radius: var(--radius-md);">
            <label class="form-label">Penggantian Komponen Langsung</label>
            <div v-if="job.service_spareparts && job.service_spareparts.length > 0">
              <div v-for="sp in job.service_spareparts" :key="sp.id" class="text-sm p-sm" style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span>{{ findProduct(sp.product_id)?.name || sp.product_id }}</span>
                <span class="font-bold">x {{ sp.qty }}</span>
              </div>
            </div>
            <div v-else class="text-sm text-muted">Tidak ada penggantian komponen.</div>
          </div>

          <div class="mt-md text-success font-bold flex items-center gap-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Pekerjaan telah diselesaikan pada {{ job.time_out ? new Date(job.time_out).toLocaleString('id-ID') : '-' }}
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

