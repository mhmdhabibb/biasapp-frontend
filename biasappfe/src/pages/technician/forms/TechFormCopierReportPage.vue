<script setup lang="ts">
import PageHeader from '@/components/ui/PageHeader.vue'
import SignaturePad from '@/components/ui/SignaturePad.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import { findPreviousServiceReportMeter } from '@/utils/meterReading'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { serviceReports, contractItems, monthlyMeterReadings, findUnit, refresh } = useMasterStore()

const serviceId = String(route.params.id)
const reportRecord = ref<any>(null)
const job = computed(() => reportRecord.value || serviceReports.value.find((sr: any) => String(sr.id) === serviceId))

const unit = computed(() => {
  const unitId = job.value?.unit_id || job.value?.unit?.id
  if (!unitId) return job.value?.unit || null
  return findUnit(unitId) || job.value?.unit || null
})

// Before meter: priority from saved data, fallback to current unit meter.
// Read-only in the form — locked on first save.
const num = (v: any) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const beforeMeter = computed(() => {
  // 1. Saved value in this report (0 = not filled yet, continue fallback).
  const saved = num(job.value?.meter_reading_before) || num(job.value?.reading_counter)
  if (saved > 0) return saved
  // 2. Monthly meter readings linked to this report — use the largest end_meter.
  const readings: any[] =
    job.value?.monthly_meter_readings || job.value?.monthlyMeterReadings || []
  let lastEnd = 0
  for (const r of readings) {
    lastEnd = Math.max(lastEnd, num(r.end_meter) || num(r.start_meter))
  }
  if (lastEnd > 0) return lastEnd
  const previousVisit = findPreviousServiceReportMeter(
    job.value,
    serviceReports.value,
    contractItems.value,
  )
  if (previousVisit !== null) return previousVisit
  // 2b. Latest reading of this unit from the store (previous period).
  const unitIdForHistory = String(job.value?.unit_id || unit.value?.id || '')
  if (unitIdForHistory) {
    const storeReadings: any[] = (monthlyMeterReadings as any)?.value || (monthlyMeterReadings as any) || []
    const forUnit = storeReadings.filter((r: any) => String(r.unit_id || r.unit?.id || '') === unitIdForHistory)
    forUnit.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    if (forUnit.length > 0) {
      const last = num(forUnit[0].end_meter) || num(forUnit[0].start_meter)
      if (last > 0) return last
    }
  }
  // 3. Current unit meter. Use || (not ??) so 0 falls through to color.
  const fromUnit = num(unit.value?.current_meter_bw) || num(unit.value?.current_meter_color)
  if (fromUnit > 0) return fromUnit
  // 4. Contract initial value (start_mono_value / start_color_value).
  const unitId = String(job.value?.unit_id || unit.value?.id || '')
  const ci = (contractItems.value || []).find((c: any) =>
    unitId && String(c.unit_id || c.unit?.id || '') === unitId
  )
  const fromContract = num((ci as any)?.start_mono_value) || num((ci as any)?.start_color_value)
  return fromContract > 0 ? fromContract : 0
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

// Paper size: from monthly meter readings linked to this report
// (paper_size preloaded by backend). Fallback: contract rates (copy of
// rental_item_rates) looked up via unit. Read-only, technician info only.
const paperTypes = computed(() => {
  const labels: string[] = []
  const seen = new Set<string>()
  const push = (raw: any) => {
    const label = String(raw || '').trim()
    if (label && !seen.has(label)) {
      seen.add(label)
      labels.push(label)
    }
  }
  const readings: any[] =
    job.value?.monthly_meter_readings || job.value?.monthlyMeterReadings || []
  for (const r of readings) {
    const name = r.paper_size?.name || r.paper_size_name || r.paper_size_id || ''
    push(`${name}${r.color_mode ? ` (${r.color_mode})` : ''}`.trim())
  }
  const unitId = String(job.value?.unit_id || unit.value?.id || '')
  const ci = (contractItems.value || []).find((c: any) =>
    unitId && String(c.unit_id || c.unit?.id || '') === unitId
  )
  for (const rate of ((ci?.rates || []) as any[])) {
    push(rate.paper_size?.name || rate.paper_size_name || rate.paper_size_id || '')
  }
  return labels
})

onMounted(async () => {
  try {
    await refresh(true)
    const response = await api.get<{ data: any }>(`/service-reports/${serviceId}`)
    reportRecord.value = response.data
    if (!job.value) throw new Error('Service report not found')
    const after = Number(job.value.meter_reading_after ?? job.value.reading_counter ?? 0)
    form.value.meter_after = after > 0 ? after : beforeMeter.value
    form.value.customer_signature = job.value.customer_signature_copier || ''
    form.value.technician_signature = job.value.technician_signature_copier || ''
  } catch (err: any) {
    toast.error(err.message || 'Failed to load service report')
  } finally {
    isLoading.value = false
  }
})

async function saveForm() {
  if (isLoading.value || !job.value || isSaving.value) return
  if (Number(form.value.meter_after) < beforeMeter.value) {
    toast.warning(`Meter After (${form.value.meter_after}) must not be smaller than Before (${beforeMeter.value}).`)
    return
  }
  if (!form.value.customer_signature || !form.value.technician_signature) {
    toast.warning('Customer and technician signatures are required.')
    return
  }
  isSaving.value = true
  try {
    await api.patch(`/service-reports/${serviceId}`, {
      meter_reading_before: beforeMeter.value,
      meter_reading_after: Number(form.value.meter_after),
      customer_signature_copier: form.value.customer_signature,
      technician_signature_copier: form.value.technician_signature,
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
      <div v-if="isLoading" class="form-loading" role="status">Loading service report...</div>
      <div v-else-if="!job" class="form-loading" role="alert">Service report not found. No new data created.</div>
      <template v-else>
      <div class="form-group">
        <label class="form-label">Paper Size (Read Only)</label>
        <div v-if="paperTypes.length > 0" class="paper-box">
          <div v-for="(pt, i) in paperTypes" :key="i">{{ i + 1 }}. {{ pt }}</div>
        </div>
        <div v-else class="paper-box paper-empty">
          No paper size data on this report yet.
        </div>
        <p class="form-hint">Automatically from meter readings linked to this report.</p>
      </div>
      <div class="meter-grid">
        <div class="form-group">
          <label class="form-label">Before Meter (Read Only)</label>
          <input type="number" :value="beforeMeter" class="form-input" readonly disabled>
          <p class="form-hint">Initial meter automatically from latest data.</p>
        </div>
        <div class="form-group">
          <label class="form-label">After Meter <span class="text-danger">*</span></label>
          <input type="number" v-model.number="form.meter_after" class="form-input" :min="beforeMeter" placeholder="Enter meter after service">
          <p class="form-hint">Usage: <b>{{ usage }}</b> sheets.</p>
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
          <label class="form-label">Customer Signature <span class="text-danger">*</span></label>
          <SignaturePad v-model="form.customer_signature" height="160px" />
        </div>
        <div class="form-group">
          <label class="form-label">Technician Signature <span class="text-danger">*</span></label>
          <SignaturePad v-model="form.technician_signature" height="160px" />
        </div>
      </div>

      <div class="mt-xl">
        <button class="btn btn-primary w-full" style="padding: 12px; font-size: 16px;" :disabled="isLoading || isSaving" @click="saveForm">
          {{ isSaving ? 'Saving...' : 'Update Copier Report' }}
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

.paper-box {
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-border-light);
  font-size: var(--font-size-sm);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.paper-empty {
  color: var(--color-text-muted);
  font-style: italic;
  border-style: dashed;
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
