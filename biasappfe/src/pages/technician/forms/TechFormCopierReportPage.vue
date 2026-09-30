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
const { serviceReports, findUnit, refresh } = useMasterStore()

const serviceId = String(route.params.id)
const reportRecord = ref<any>(null)
const job = computed(() => reportRecord.value || serviceReports.value.find((sr: any) => String(sr.id) === serviceId))

const unit = computed(() => {
  const unitId = job.value?.unit_id || job.value?.unit?.id
  if (!unitId) return job.value?.unit || null
  return findUnit(unitId) || job.value?.unit || null
})

// Before meter: prioritas dari data tersimpan, fallback ke meter unit saat ini.
// Read-only di form — dikunci saat pertama kali disimpan.
const beforeMeter = computed(() => {
  const saved = Number(job.value?.meter_reading_before ?? job.value?.reading_counter ?? 0)
  if (saved > 0) return saved
  const fromUnit = Number(unit.value?.current_meter_bw ?? unit.value?.current_meter_color ?? 0)
  return fromUnit > 0 ? fromUnit : 0
})

const form = ref({
  meter_after: 0,
  copy_quality: 'Good',
  customer_signature: '',
  technician_signature: '',
})
const isLoading = ref(true)
const isSaving = ref(false)

const usage = computed(() => Math.max(0, Number(form.value.meter_after || 0) - beforeMeter.value))

onMounted(async () => {
  try {
    await refresh(true)
    const response = await api.get<{ data: any }>(`/service-reports/${serviceId}`)
    reportRecord.value = response.data
    if (!job.value) throw new Error('Service report tidak ditemukan')
    const after = Number(job.value.meter_reading_after ?? job.value.reading_counter ?? 0)
    form.value.meter_after = after > 0 ? after : beforeMeter.value
    form.value.customer_signature = job.value.customer_signature || ''
    form.value.technician_signature = job.value.technician_signature || ''
  } catch (err: any) {
    toast.error(err.message || 'Gagal memuat service report')
  } finally {
    isLoading.value = false
  }
})

async function saveForm() {
  if (isLoading.value || !job.value || isSaving.value) return
  if (Number(form.value.meter_after) < beforeMeter.value) {
    toast.warning(`Meter After (${form.value.meter_after}) tidak boleh lebih kecil dari Before (${beforeMeter.value}).`)
    return
  }
  if (!form.value.customer_signature || !form.value.technician_signature) {
    toast.warning('Tanda tangan customer dan teknisi wajib dilengkapi.')
    return
  }
  isSaving.value = true
  try {
    await api.patch(`/service-reports/${serviceId}`, {
      meter_reading_before: beforeMeter.value,
      meter_reading_after: Number(form.value.meter_after),
      reading_counter: Number(form.value.meter_after),
      customer_signature: form.value.customer_signature,
      technician_signature: form.value.technician_signature,
    })
    toast.success('Copier Report saved successfully')
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
    <PageHeader title="Copier Service Report" :back-button="true" @back="router.back()" />
    <div class="card p-lg mt-md">
      <div v-if="isLoading" class="form-loading" role="status">Memuat laporan servis...</div>
      <div v-else-if="!job" class="form-loading" role="alert">Laporan servis tidak ditemukan. Data baru tidak dibuat.</div>
      <template v-else>
      <div class="meter-grid">
        <div class="form-group">
          <label class="form-label">Before Meter (Read Only)</label>
          <input type="number" :value="beforeMeter" class="form-input" readonly disabled>
          <p class="form-hint">Meter awal otomatis dari data terakhir.</p>
        </div>
        <div class="form-group">
          <label class="form-label">After Meter <span class="text-danger">*</span></label>
          <input type="number" v-model.number="form.meter_after" class="form-input" :min="beforeMeter" placeholder="Isi meter setelah servis">
          <p class="form-hint">Pemakaian: <b>{{ usage }}</b> lembar.</p>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Copy Quality Check</label>
        <select v-model="form.copy_quality" class="form-select">
          <option>Good</option>
          <option>Fair</option>
          <option>Poor</option>
        </select>
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
          {{ isSaving ? 'Menyimpan...' : 'Perbarui Copier Report' }}
        </button>
      </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.meter-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-base);
}

.signature-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-base);
}

.form-hint {
  margin-top: 6px;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.form-loading {
  padding: 24px;
  border-radius: 8px;
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  text-align: center;
}

@media (max-width: 640px) {
  .meter-grid { grid-template-columns: 1fr; }
  .signature-grid { grid-template-columns: 1fr; }
}
</style>
