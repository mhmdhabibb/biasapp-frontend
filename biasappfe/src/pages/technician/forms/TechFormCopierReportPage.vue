<script setup lang="ts">
import PageHeader from '@/components/ui/PageHeader.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import SignaturePad from '@/components/ui/SignaturePad.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useToast } from '@/composables/useToast'
import { useAuth } from '@/composables/useAuth'
import { api } from '@/services/api'
import { findPreviousServiceReportMeter } from '@/utils/meterReading'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { currentUser } = useAuth()
const { serviceReports, contractItems, monthlyMeterReadings, findUnit, findCustomer, findTechnician, findProduct, refreshInBackground } = useMasterStore()

const serviceId = String(route.params.id)
const reportRecord = ref<any>(null)
const job = computed(() => reportRecord.value || serviceReports.value.find((sr: any) => String(sr.id) === serviceId))
const customerType = computed(() => job.value?.customer_category || findCustomer(job.value?.customer_id)?.category || 'Corporate')

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
  const fromContract = num((ci as any)?.start_mono_value) || num((ci as any)?.start_color_value) || num((ci as any)?.start_meter_bw) || num((ci as any)?.start_meter_color)
  return fromContract > 0 ? fromContract : 0
})

const form = ref({
  meter_after: 0,
  copy_quality: 'Good',
  customer_signature: '',
  technician_signature: '',
  customer_name: '',
  technician_name: '',
})
const isLoading = ref(true)
const isSaving = ref(false)

const copyQualityOptions = [
  { value: 'Good', label: 'Good' },
  { value: 'Fair', label: 'Fair' },
  { value: 'Poor', label: 'Poor' },
]

// ---- Meter per ukuran kertas ----
// Section per paper size (dari readings yang terhubung ke report ini +
// ukuran dari contract rates). Tiap section berisi baris B/W dan Colour
// dengan Before (readonly) + After (input) + Usage masing-masing.
interface CopierMeterRow {
  key: string
  paper_size_id: string
  paper_size_name: string
  paper_type_id: string | null
  color_mode: 'bw' | 'color'
  color_label: string
  reading_id: string | null
  before: number
}

const normMeterMode = (m: any): 'bw' | 'color' =>
  /colou?r/i.test(String(m || '')) ? 'color' : 'bw'

function contractItemForUnit(): any {
  const unitId = String(job.value?.unit_id || unit.value?.id || '')
  if (!unitId) return null
  return (contractItems.value || []).find((c: any) =>
    String(c.unit_id || c.unit?.id || '') === unitId,
  ) || null
}

// Meter awal untuk kombinasi (ukuran, mode): reading terbaru di store,
// fallback ke nilai awal kontrak.
function prevMeterFor(paperSizeId: string, mode: 'bw' | 'color', ci: any): number {
  const storeReadings: any[] =
    (monthlyMeterReadings as any)?.value || (monthlyMeterReadings as any) || []
  const sized = storeReadings.filter((r: any) =>
    (!ci || String(r.contract_item_id || '') === String(ci.id)) &&
    String(r.paper_size_id || '') === String(paperSizeId || '') &&
    normMeterMode(r.color_mode) === mode,
  )
  if (sized.length > 0) {
    const latest = sized.reduce((prev: any, curr: any) => {
      const prevDate = new Date(prev.reading_date || prev.created_at).getTime()
      const currDate = new Date(curr.reading_date || curr.created_at).getTime()
      return prevDate > currDate ? prev : curr
    })
    return num(latest.end_meter)
  }
  if (!ci) return 0
  return mode === 'color' ? num(ci.start_meter_color) : num(ci.start_meter_bw)
}

const meterSections = computed(() => {
  const sections = new Map<string, { paper_size_id: string; paper_size_name: string; rows: CopierMeterRow[] }>()
  const ci = contractItemForUnit()
  const ensureSection = (psId: string, psName: string) => {
    const key = psId || '-'
    if (!sections.has(key)) {
      sections.set(key, { paper_size_id: psId, paper_size_name: psName, rows: [] })
    }
    return sections.get(key)!
  }
  const hasRow = (psId: string, mode: 'bw' | 'color') =>
    (sections.get(psId || '-')?.rows || []).some((r) => r.color_mode === mode)

  // 1. Readings yang sudah terhubung ke report ini.
  const readings: any[] =
    job.value?.monthly_meter_readings || job.value?.monthlyMeterReadings || []
  for (const r of readings) {
    const psId = String(r.paper_size_id || '')
    const mode = normMeterMode(r.color_mode)
    const sec = ensureSection(
      psId,
      r.paper_size?.name || r.paper_size_name || (psId ? `Ukuran ${psId.slice(0, 8)}` : 'Tanpa ukuran'),
    )
    const before = num(r.start_meter) > 0 ? num(r.start_meter) : prevMeterFor(psId, mode, ci)
    sec.rows.push({
      key: `${psId}|${mode}`,
      paper_size_id: psId,
      paper_size_name: sec.paper_size_name,
      paper_type_id: r.paper_type_id ?? null,
      color_mode: mode,
      color_label: mode === 'color' ? 'Colour' : 'B/W',
      reading_id: r.id ? String(r.id) : null,
      before,
    })
  }

  // 2. Ukuran dari contract rates yang belum tercakup.
  for (const rate of (((ci as any)?.rates || []) as any[])) {
    const psId = String(rate.paper_size_id || '')
    if (!psId) continue
    const sec = ensureSection(
      psId,
      rate.paper_size?.name || rate.paper_size_name || `Ukuran ${psId.slice(0, 8)}`,
    )
    for (const mode of ['bw', 'color'] as const) {
      if (hasRow(psId, mode)) continue
      sec.rows.push({
        key: `${psId}|${mode}`,
        paper_size_id: psId,
        paper_size_name: sec.paper_size_name,
        paper_type_id: rate.paper_type_id ?? null,
        color_mode: mode,
        color_label: mode === 'color' ? 'Colour' : 'B/W',
        reading_id: null,
        before: prevMeterFor(psId, mode, ci),
      })
    }
  }

  return [...sections.values()]
    .map((sec) => ({
      ...sec,
      rows: sec.rows.sort((a, b) => (a.color_mode === b.color_mode ? 0 : a.color_mode === 'bw' ? -1 : 1)),
    }))
    .sort((a, b) => a.paper_size_name.localeCompare(b.paper_size_name))
})

// Nilai After per baris (prefill: end meter tersimpan, else before).
const sectionAfters = ref<Record<string, number | null>>({})

function initSectionAfters() {
  const readings: any[] =
    job.value?.monthly_meter_readings || job.value?.monthlyMeterReadings || []
  const next: Record<string, number | null> = {}
  for (const sec of meterSections.value) {
    for (const row of sec.rows) {
      const linked = row.reading_id
        ? readings.find((r: any) => String(r.id) === String(row.reading_id))
        : null
      const savedEnd = num(linked?.end_meter)
      next[row.key] = savedEnd > 0 ? savedEnd : row.before
    }
  }
  sectionAfters.value = next
}

function filledAfter(row: CopierMeterRow): number | null {
  const raw = sectionAfters.value[row.key]
  if (raw === null || raw === undefined || String(raw).trim() === '') return null
  const v = Number(raw)
  return Number.isFinite(v) ? v : null
}

const sparepartRequests = computed(() => {
  const list = job.value?.service_spareparts || []
  return Array.isArray(list) ? list : []
})

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
    await refreshInBackground()
    const response = await api.get<{ data: any }>(`/service-reports/${serviceId}`)
    reportRecord.value = response.data
    if (!job.value) throw new Error('Service report not found')
    const after = Number(job.value.meter_reading_after ?? job.value.reading_counter ?? 0)
    form.value.meter_after = after > 0 ? after : beforeMeter.value
    form.value.customer_signature = job.value.customer_signature_copier || ''
    form.value.technician_signature = job.value.technician_signature_copier || ''
    form.value.customer_name = job.value.customer_name_copier || findCustomer(job.value.customer_id)?.pic_name || job.value.customer?.pic_name || ''
    form.value.technician_name = job.value.technician_name_copier || findTechnician(job.value.technician_id)?.name || job.value.technician?.name || currentUser.value?.name || ''
    initSectionAfters()
  } catch (err: any) {
    toast.error(err.message || 'Failed to load service report')
  } finally {
    isLoading.value = false
  }
})

async function saveForm() {
  if (isLoading.value || !job.value || isSaving.value) return
  if (!form.value.customer_signature || !form.value.technician_signature || !form.value.customer_name.trim()) {
    toast.warning('Customer name, customer and technician signatures are required.')
    return
  }
  const sections = meterSections.value
  const ci = contractItemForUnit()
  const unitId = String(job.value?.unit_id || unit.value?.id || '')

  // Kumpulkan baris per ukuran yang diisi + validasi After >= Before.
  const filled: Array<{ row: CopierMeterRow; after: number }> = []
  for (const sec of sections) {
    for (const row of sec.rows) {
      const after = filledAfter(row)
      if (after === null) continue
      if (after < row.before) {
        toast.warning(`${sec.paper_size_name} (${row.color_label}): After (${after}) must not be smaller than Before (${row.before}).`)
        return
      }
      filled.push({ row, after })
    }
  }
  if (sections.length > 0 && filled.length === 0) {
    toast.warning('Fill in After Meter for at least one paper size.')
    return
  }
  if (sections.length > 0 && !ci) {
    toast.warning('Unit is not linked to a contract item — cannot save per-size readings.')
    return
  }
  if (sections.length === 0 && Number(form.value.meter_after) < beforeMeter.value) {
    toast.warning(`Meter After (${form.value.meter_after}) must not be smaller than Before (${beforeMeter.value}).`)
    return
  }

  // Sinkron field tunggal legacy: pakai baris B/W pertama yang diisi (else baris pertama).
  let legacyBefore = beforeMeter.value
  let legacyAfter = Number(form.value.meter_after || 0)
  if (filled.length > 0) {
    const primary = filled.find((f) => f.row.color_mode === 'bw') || filled[0]!
    legacyBefore = primary.row.before
    legacyAfter = primary.after
  }

  isSaving.value = true
  try {
    // Simpan rincian per ukuran ke monthly readings (update yang terhubung,
    // buat baru bila belum ada — ikut menghitung tagihan seperti Meter Readings).
    for (const f of filled) {
      if (f.row.reading_id) {
        await api.patch(`/monthly-meter-readings/${f.row.reading_id}`, {
          start_meter: f.row.before,
          end_meter: f.after,
        })
      } else {
        await api.post('/monthly-meter-readings/', {
          user_id: currentUser.value?.id,
          contract_item_id: ci.id,
          unit_id: unitId,
          paper_size_id: f.row.paper_size_id,
          paper_type_id: f.row.paper_type_id,
          color_mode: f.row.color_mode,
          start_meter: f.row.before,
          end_meter: f.after,
          reading_date: new Date().toISOString(),
          service_report_id: serviceId,
        })
      }
    }
    await api.patch(`/service-reports/${serviceId}`, {
      meter_reading_before: legacyBefore,
      meter_reading_after: legacyAfter,
      customer_signature_copier: form.value.customer_signature,
      technician_signature_copier: form.value.technician_signature,
      customer_name_copier: form.value.customer_name,
      technician_name_copier: form.value.technician_name,
    })
    toast.success('Copier Report saved successfully')
    await refreshInBackground()
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
      <template v-if="meterSections.length > 0">
        <div v-for="sec in meterSections" :key="sec.paper_size_id || 'general'" class="size-card">
          <div class="size-title">Paper Size: {{ sec.paper_size_name }}</div>
          <div v-for="row in sec.rows" :key="row.key" class="meter-grid">
            <div class="form-group">
              <label class="form-label">{{ row.color_label }} — Before (Read Only)</label>
              <input type="number" :value="row.before" class="form-input" readonly disabled>
            </div>
            <div class="form-group">
              <label class="form-label">{{ row.color_label }} — After <span class="text-danger">*</span></label>
              <input type="number" v-model.number="sectionAfters[row.key]" class="form-input" :min="row.before" placeholder="Enter meter after service">
            </div>
          </div>
        </div>
      </template>
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
        </div>
      </div>
      </template>

      <div class="form-group">
        <label class="form-label">Copy Quality Check</label>
        <CustomSelect v-model="form.copy_quality" class="form-select" :options="copyQualityOptions" />
      </div>

      <div class="form-group">
        <label class="form-label">Sparepart Request (Read Only)</label>
        <div v-if="sparepartRequests.length > 0" class="sparepart-box">
          <div v-for="(sp, i) in sparepartRequests" :key="sp.id || i">
            {{ i + 1 }}. {{ sp.product?.name || sp.product_name || findProduct(sp.product_id)?.name || '-' }} - Qty {{ sp.qty }}
          </div>
        </div>
        <div v-else class="sparepart-box sparepart-empty">
          No sparepart request from Technical Report.
        </div>
        <p class="form-hint">Managed in Technical Report form.</p>
      </div>

      <div class="signature-grid">
        <div class="form-group">
          <label class="form-label">Customer Type</label>
          <input :value="customerType" type="text" class="form-input" readonly disabled>
          <label class="form-label mt-sm">Customer / PIC Name <span class="text-danger">*</span></label>
          <input v-model="form.customer_name" type="text" class="form-input" placeholder="Customer PIC name">
          <label class="form-label mt-sm">Customer Signature <span class="text-danger">*</span></label>
          <SignaturePad v-model="form.customer_signature" height="160px" />
        </div>
        <div class="form-group">
          <label class="form-label">Technician Name</label>
          <input v-model="form.technician_name" type="text" class="form-input" readonly disabled>
          <label class="form-label mt-sm">Technician Signature <span class="text-danger">*</span></label>
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

.size-card {
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-border-light);
  margin-bottom: 12px;
}

.size-title {
  font-weight: 700;
  font-size: var(--font-size-sm);
  margin-bottom: 10px;
}

.sparepart-box {
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-border-light);
  font-size: var(--font-size-sm);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sparepart-empty {
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
