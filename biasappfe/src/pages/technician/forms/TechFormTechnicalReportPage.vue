<script setup lang="ts">
import PageHeader from '@/components/ui/PageHeader.vue'
import SignaturePad from '@/components/ui/SignaturePad.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { serviceReports, refresh } = useMasterStore()

const serviceId = String(route.params.id)
const reportRecord = ref<any>(null)
const job = computed(() => reportRecord.value || serviceReports.value.find(sr => String(sr.id) === serviceId))

const form = ref({
  remarks: '',
  notes: '',
  is_tested: false,
  customer_signature: '',
  technician_signature: '',
})
const isLoading = ref(true)
const isSaving = ref(false)

onMounted(async () => {
  try {
    const response = await api.get<{ data: any }>(`/service-reports/${serviceId}`)
    reportRecord.value = response.data
    if (!job.value) throw new Error('Service report tidak ditemukan')
    form.value = {
      remarks: job.value.remarks || '',
      notes: job.value.notes || '',
      is_tested: job.value.is_tested || false,
      customer_signature: job.value.customer_signature || '',
      technician_signature: job.value.technician_signature || '',
    }
  } catch (err: any) {
    toast.error(err.message || 'Gagal memuat service report')
  } finally {
    isLoading.value = false
  }
})

async function saveForm() {
  if (isLoading.value || !job.value || isSaving.value) return
  if (!form.value.customer_signature || !form.value.technician_signature) {
    toast.warning('Tanda tangan customer dan teknisi wajib dilengkapi.')
    return
  }
  isSaving.value = true
  try {
    await api.patch(`/service-reports/${serviceId}`, {
      remarks: form.value.remarks,
      notes: form.value.notes,
      is_tested: form.value.is_tested,
      customer_signature: form.value.customer_signature,
      technician_signature: form.value.technician_signature,
    })
    toast.success('Technical Report saved successfully')
    await refresh(true)
    router.back()
  } catch (err: any) {
    toast.error(err.message || 'Failed to save form')
  } finally {
    isSaving.value = false
  }
}
</script>
<template>
  <div style="max-width: 800px; margin: 0 auto">
    <PageHeader title="Technical Report Form" :back-button="true" @back="router.back()" />
    <div class="card p-lg mt-md">
      <div v-if="isLoading" class="form-loading" role="status">Memuat laporan servis...</div>
      <div v-else-if="!job" class="form-loading" role="alert">Laporan servis tidak ditemukan. Data baru tidak dibuat.</div>
      <template v-else>
      <div class="form-group">
        <label class="form-label">Hasil Pemeriksaan / Root Cause <span class="text-danger">*</span></label>
        <textarea v-model="form.remarks" class="form-textarea" rows="4" placeholder="Deskripsikan hasil pengecekan unit..."></textarea>
      </div>
      
      <div class="form-group">
        <label class="form-label">Catatan Tambahan (Internal)</label>
        <textarea v-model="form.notes" class="form-textarea" rows="3" placeholder="Catatan operasional..."></textarea>
      </div>

      <div class="form-group mt-lg">
        <label class="flex items-center gap-sm cursor-pointer p-md" style="background: var(--color-surface-sunken); border-radius: var(--radius-sm)">
          <input type="checkbox" v-model="form.is_tested" style="width: 20px; height: 20px;">
          <span class="font-bold">Mesin sudah dilakukan testing dan berfungsi normal. <span class="text-danger">*</span></span>
        </label>
      </div>

      <div class="signature-grid">
        <div class="form-group">
          <label class="form-label">Tanda Tangan Customer <span class="text-danger">*</span></label>
          <SignaturePad v-model="form.customer_signature" height="160px" />
        </div>
        <div class="form-group">
          <label class="form-label">Tanda Tangan Teknisi <span class="text-danger">*</span></label>
          <SignaturePad v-model="form.technician_signature" height="160px" />
        </div>
      </div>

      <div class="mt-xl">
        <button class="btn btn-primary w-full" style="padding: 12px; font-size: 16px;" :disabled="isLoading || isSaving" @click="saveForm">
          {{ isSaving ? 'Menyimpan...' : 'Perbarui Technical Report' }}
        </button>
      </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.signature-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-base);
}

.form-loading {
  padding: 24px;
  border-radius: 8px;
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  text-align: center;
}

@media (max-width: 640px) {
  .signature-grid { grid-template-columns: 1fr; }
}
</style>
