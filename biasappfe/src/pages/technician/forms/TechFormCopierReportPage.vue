<script setup lang="ts">
import PageHeader from '@/components/ui/PageHeader.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import SignaturePad from '@/components/ui/SignaturePad.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useToast } from '@/composables/useToast'
import { useAuth } from '@/composables/useAuth'
import { api } from '@/services/api'
import { findPreviousServiceReportMeter } from '@/utils/meterReading'
import { normalizeRole } from '@/router/role-access'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { currentUser } = useAuth()
const { serviceReports, contractItems, monthlyMeterReadings, findUnit, findCustomer, findTechnician, findProduct, refreshInBackground } = useMasterStore()

const serviceId = String(route.params.id)
const reportRecord = ref<any>(null)
const job = computed(() => {
  if (reportRecord.value) return reportRecord.value
  return (serviceReports.value || []).find((sr: any) =>
    String(sr.id) === serviceId || String(sr.job_order_id) === serviceId
  )
})
const realServiceReportId = computed(() => reportRecord.value?.id || job.value?.id || serviceId)
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
  const fromContract = num((ci as any)?.start_mono_value) || num((ci as any)?.start_meter_bw)
  return fromContract > 0 ? fromContract : 0
})

const beforeMeterColor = computed(() => {
  // 1. Saved value in this report
  const saved = num(job.value?.meter_reading_color_before)
  if (saved > 0) return saved
  // 2. Monthly meter readings linked to this report with color mode
  const readings: any[] =
    job.value?.monthly_meter_readings || job.value?.monthlyMeterReadings || []
  for (const r of readings) {
    if (normMeterMode(r.color_mode) === 'color') {
      const v = num(r.end_meter) || num(r.start_meter)
      if (v > 0) return v
    }
  }
  // 2b. Latest reading of this unit from store
  const unitIdForHistory = String(job.value?.unit_id || unit.value?.id || '')
  if (unitIdForHistory) {
    const storeReadings: any[] = (monthlyMeterReadings as any)?.value || (monthlyMeterReadings as any) || []
    const forUnit = storeReadings.filter(
      (r: any) => String(r.unit_id || r.unit?.id || '') === unitIdForHistory && normMeterMode(r.color_mode) === 'color'
    )
    forUnit.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    if (forUnit.length > 0) {
      const last = num(forUnit[0].end_meter) || num(forUnit[0].start_meter)
      if (last > 0) return last
    }
  }
  // 3. Current unit color meter
  const fromUnit = num(unit.value?.current_meter_color)
  if (fromUnit > 0) return fromUnit
  // 4. Contract initial value
  const ci = contractItemForUnit()
  const fromContract = num((ci as any)?.start_meter_color) || num((ci as any)?.start_color_value)
  return fromContract > 0 ? fromContract : 0
})

const hasColorMeter = computed(() => {
  return (
    beforeMeterColor.value > 0 ||
    num(unit.value?.current_meter_color) > 0 ||
    num(job.value?.meter_reading_color_before) > 0 ||
    num(job.value?.meter_reading_color_after) > 0
  )
})

const form = ref({
  meter_after: 0,
  meter_color_after: 0,
  copy_quality: 'Good',
  photo_before: '',
  photo_progress: '',
  photo_after: '',
  customer_signature: '',
  technician_signature: '',
  customer_name: '',
  technician_name: '',
})
const fileInputBefore = ref<HTMLInputElement | null>(null)
const fileInputProgress = ref<HTMLInputElement | null>(null)
const fileInputAfter = ref<HTMLInputElement | null>(null)
const photoZoom = ref<string | null>(null)

function handlePhoto(e: Event, type: 'before' | 'progress' | 'after') {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (uploadEvent) => {
    const img = new Image()
    img.onload = () => {
      const max = 1024
      let width = img.width
      let height = img.height
      if (width > height && width > max) {
        height = Math.round(height * (max / width))
        width = max
      } else if (height > max) {
        width = Math.round(width * (max / height))
        height = max
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx?.drawImage(img, 0, 0, width, height)
      const compressedUrl = canvas.toDataURL('image/jpeg', 0.6)

      if (type === 'before') {
        form.value.photo_before = compressedUrl
      } else if (type === 'progress') {
        form.value.photo_progress = compressedUrl
      } else {
        form.value.photo_after = compressedUrl
      }
    }
    img.src = uploadEvent.target?.result as string
  }
  reader.readAsDataURL(file)
  target.value = ''
}

function clearPhoto(type: 'before' | 'progress' | 'after') {
  if (type === 'before') {
    form.value.photo_before = ''
    if (fileInputBefore.value) fileInputBefore.value.value = ''
  } else if (type === 'progress') {
    form.value.photo_progress = ''
    if (fileInputProgress.value) fileInputProgress.value.value = ''
  } else {
    form.value.photo_after = ''
    if (fileInputAfter.value) fileInputAfter.value.value = ''
  }
}

const isLoading = ref(true)
const isSaving = ref(false)

const isDeliveredOrCompleted = computed(() => {
  const s = String(job.value?.status || '').toLowerCase()
  return s === 'delivered' || s === 'completed' || !!job.value?.is_completed
})
const isEditable = computed(() => {
  if (isDeliveredOrCompleted.value) return false
  const r = normalizeRole(currentUser.value?.role)
  return r === 'technician' || r === 'admin'
})

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
  const jcId = String(job.value?.contract_item_id || '')
  const items = contractItems.value || []

  // 1. By direct contract_item_id in job
  if (jcId) {
    const direct = items.find((c: any) => String(c.id) === jcId)
    if (direct) return direct
  }
  // 2. By unit_id
  if (unitId) {
    const byUnit = items.find((c: any) =>
      String(c.unit_id || c.unit?.id || '') === unitId
    )
    if (byUnit) return byUnit
  }
  // 3. By monthly meter readings linked to this report or unit
  const readings: any[] =
    job.value?.monthly_meter_readings || job.value?.monthlyMeterReadings || []
  for (const r of readings) {
    if (r.contract_item_id) {
      const byReading = items.find((c: any) => String(c.id) === String(r.contract_item_id))
      if (byReading) return byReading
    }
  }
  // 4. By unit serial number
  const unitSn = String(unit.value?.serial_no || job.value?.unit?.serial_no || '').trim().toLowerCase()
  if (unitSn) {
    const bySn = items.find((c: any) =>
      String(c.unit?.serial_no || '').trim().toLowerCase() === unitSn
    )
    if (bySn) return bySn
  }
  return null
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

  // Jika belum ada readings maupun contract rates, buat default section Standar
  // agar B/W dan Colour selalu tampil dan bisa dicatat.
  if (sections.size === 0) {
    const defaultRows: CopierMeterRow[] = [
      {
        key: 'default|bw',
        paper_size_id: '',
        paper_size_name: 'Standar (General)',
        paper_type_id: null,
        color_mode: 'bw',
        color_label: 'B/W',
        reading_id: null,
        before: beforeMeter.value,
      },
    ]
    if (beforeMeterColor.value > 0 || num(unit.value?.current_meter_color) > 0 || num(job.value?.meter_reading_color_before) > 0) {
      defaultRows.push({
        key: 'default|color',
        paper_size_id: '',
        paper_size_name: 'Standar (General)',
        paper_type_id: null,
        color_mode: 'color',
        color_label: 'Colour',
        reading_id: null,
        before: beforeMeterColor.value,
      })
    }
    sections.set('default', {
      paper_size_id: '',
      paper_size_name: 'Standar (General)',
      rows: defaultRows,
    })
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
      const isColor = row.color_mode === 'color'
      const reportMeterAfter = isColor ? num(job.value?.meter_reading_color_after) : num(job.value?.meter_reading_after)
      next[row.key] = savedEnd > 0 ? savedEnd : (reportMeterAfter > 0 ? reportMeterAfter : row.before)
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
  // If job is already available in memory, initialize form instantly (0ms loading!)
  if (job.value) {
    const after = Number(job.value.meter_reading_after ?? job.value.reading_counter ?? 0)
    form.value.meter_after = after > 0 ? after : beforeMeter.value
    const colorAfter = Number(job.value.meter_reading_color_after ?? 0)
    form.value.meter_color_after = colorAfter > 0 ? colorAfter : beforeMeterColor.value
    form.value.photo_before = job.value.photo_before || ''
    form.value.photo_progress = job.value.photo_progress || ''
    form.value.photo_after = job.value.photo_after || ''
    form.value.customer_signature = job.value.customer_signature_copier || ''
    form.value.technician_signature = job.value.technician_signature_copier || ''
    form.value.customer_name = job.value.customer_name_copier || findCustomer(job.value.customer_id)?.pic_name || job.value.customer?.pic_name || ''
    form.value.technician_name = job.value.technician_name_copier || findTechnician(job.value.technician_id)?.name || job.value.technician?.name || currentUser.value?.name || ''
    initSectionAfters()
    isLoading.value = false
  }

  // Preload contractItems and monthlyMeterReadings if not yet loaded in store
  if (!contractItems.value || contractItems.value.length === 0) {
    try {
      const res = await api.get<{ data: any[] }>('/contract-items', false, true)
      const items = (res as any)?.data?.data || (res as any)?.data || res
      if (Array.isArray(items)) {
        contractItems.value = items
      }
    } catch (e) {
      console.warn('Failed to preload contract items:', e)
    }
  }

  try {
    let data: any = null
    try {
      const response = await api.get<{ data: any }>(`/service-reports/${serviceId}`, !job.value, true)
      data = (response as any)?.data?.data || (response as any)?.data || response
    } catch {
      const fromStore = (serviceReports.value || []).find((sr: any) =>
        String(sr.job_order_id) === serviceId || String(sr.id) === serviceId
      )
      if (fromStore?.id) {
        const response2 = await api.get<{ data: any }>(`/service-reports/${fromStore.id}`, !job.value, true)
        data = (response2 as any)?.data?.data || (response2 as any)?.data || response2
      }
    }
    if (data && data.id) {
      reportRecord.value = data
      const after = Number(data.meter_reading_after ?? data.reading_counter ?? 0)
      form.value.meter_after = after > 0 ? after : beforeMeter.value
      const colorAfter = Number(data.meter_reading_color_after ?? 0)
      form.value.meter_color_after = colorAfter > 0 ? colorAfter : beforeMeterColor.value
      form.value.photo_before = data.photo_before || form.value.photo_before || ''
      form.value.photo_progress = data.photo_progress || form.value.photo_progress || ''
      form.value.photo_after = data.photo_after || form.value.photo_after || ''
      form.value.customer_signature = data.customer_signature_copier || ''
      form.value.technician_signature = data.technician_signature_copier || ''
      form.value.customer_name = data.customer_name_copier || findCustomer(data.customer_id)?.pic_name || data.customer?.pic_name || ''
      form.value.technician_name = data.technician_name_copier || findTechnician(data.technician_id)?.name || data.technician?.name || currentUser.value?.name || ''
      initSectionAfters()
    }
    if (!job.value) throw new Error('Service report not found')
    void refreshInBackground()
  } catch (err: any) {
    if (!job.value) {
      toast.error(err.message || 'Failed to load service report')
    }
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
  if (sections.length === 0 && Number(form.value.meter_after) < beforeMeter.value) {
    toast.warning(`Meter After (${form.value.meter_after}) must not be smaller than Before (${beforeMeter.value}).`)
    return
  }

  // Sinkron field tunggal: pakai baris B/W dan Colour yang diisi
  const bwRow = filled.find((f) => f.row.color_mode === 'bw')
  const colorRow = filled.find((f) => f.row.color_mode === 'color')
  let legacyBefore = bwRow ? bwRow.row.before : beforeMeter.value
  let legacyAfter = bwRow ? bwRow.after : Number(form.value.meter_after || 0)
  let legacyColorBefore = colorRow ? colorRow.row.before : beforeMeterColor.value
  let legacyColorAfter = colorRow ? colorRow.after : Number(form.value.meter_color_after || 0)

  isSaving.value = true
  try {
    // Simpan rincian per ukuran ke monthly readings bila ci ada atau update reading lama
    for (const f of filled) {
      if (f.row.reading_id) {
        await api.patch(`/monthly-meter-readings/${f.row.reading_id}`, {
          start_meter: f.row.before,
          end_meter: f.after,
        })
      } else if (f.row.paper_size_id && ci) {
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
          service_report_id: realServiceReportId.value,
        })
      }
    }
    await api.patch(`/service-reports/${realServiceReportId.value}`, {
      meter_reading_before: legacyBefore,
      meter_reading_after: legacyAfter,
      meter_reading_color_before: legacyColorBefore,
      meter_reading_color_after: legacyColorAfter,
      customer_signature_copier: form.value.customer_signature,
      technician_signature_copier: form.value.technician_signature,
      customer_name_copier: form.value.customer_name,
      technician_name_copier: form.value.technician_name,
      photo_before: form.value.photo_before,
      photo_progress: form.value.photo_progress,
      photo_after: form.value.photo_after,
    })
    if (unitId) {
      const unitPatch: any = {}
      if (legacyAfter > 0) unitPatch.current_meter_bw = legacyAfter
      if (legacyColorAfter > 0) unitPatch.current_meter_color = legacyColorAfter
      if (Object.keys(unitPatch).length > 0) {
        try {
          await api.patch(`/units/${unitId}`, unitPatch)
        } catch (e) {
          console.warn('Could not update unit meters:', e)
        }
      }
    }
    toast.success(ci ? 'Copier Report saved successfully' : 'Copier Report saved (Standard meter & photos saved)')
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
      <div v-else-if="!isEditable" class="text-center p-xl text-muted">
        <p class="mb-md">Form is read-only because it has been completed or you are not authorized to edit it. Please view the digital report instead.</p>
        <div style="display: flex; justify-content: center; gap: 8px; margin-top: 16px;">
          <button type="button" class="btn btn-primary" @click="router.push(`/shared/service-reports/${realServiceReportId}`)">
            View Copier Reports
          </button>
          <button type="button" class="btn btn-outline" @click="router.back()">
            Back
          </button>
        </div>
      </div>
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
          <label class="form-label">B/W — Before Meter (Read Only)</label>
          <input type="number" :value="beforeMeter" class="form-input" readonly disabled>
          <p class="form-hint">Initial meter automatically from latest data.</p>
        </div>
        <div class="form-group">
          <label class="form-label">B/W — After Meter <span class="text-danger">*</span></label>
          <input type="number" v-model.number="form.meter_after" class="form-input" :min="beforeMeter" placeholder="Enter B/W meter after service">
        </div>
      </div>
      <div v-if="beforeMeterColor > 0 || hasColorMeter" class="meter-grid" style="margin-top: 12px;">
        <div class="form-group">
          <label class="form-label">Colour — Before Meter (Read Only)</label>
          <input type="number" :value="beforeMeterColor" class="form-input" readonly disabled>
          <p class="form-hint">Initial color meter automatically from latest data.</p>
        </div>
        <div class="form-group">
          <label class="form-label">Colour — After Meter <span class="text-danger">*</span></label>
          <input type="number" v-model.number="form.meter_color_after" class="form-input" :min="beforeMeterColor" placeholder="Enter colour meter after service">
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
            {{ i + 1 }}. {{ sp.item_name || sp.product?.name || sp.product_name || findProduct(sp.product_id)?.name || '-' }} - Qty {{ sp.qty }}
            <span v-if="!sp.product_id && sp.item_name" class="badge" style="background: #e0f2fe; color: #0369a1; font-size: 10px; padding: 1px 4px; border-radius: 4px; margin-left: 4px;">Manual</span>
          </div>
        </div>
        <div v-else class="sparepart-box sparepart-empty">
          No sparepart request from Technical Report.
        </div>
        <p class="form-hint">Managed in Technical Report form.</p>
      </div>

      <!-- Dokumentasi Foto Service -->
      <div class="photo-section">
        <label class="form-label font-bold" style="font-size: 15px; margin-bottom: 6px; display: block;">Dokumentasi Foto Service</label>
        <p class="form-hint" style="margin-top: -2px; margin-bottom: 12px;">Lampirkan foto kondisi unit sebelum, saat pengerjaan, dan sesudah selesai service.</p>
        <div class="photo-cards-grid">
          <!-- Foto Sebelum -->
          <div class="photo-card">
            <div class="photo-card-header">
              <span class="photo-card-title">1. Foto Pengantaran / Problem</span>
              <button v-if="form.photo_before" type="button" class="btn-remove-photo" @click="clearPhoto('before')" title="Hapus foto">✕</button>
            </div>
            <div v-if="form.photo_before" class="photo-preview-box" @click="photoZoom = form.photo_before">
              <img :src="form.photo_before" alt="Foto Sebelum" class="photo-img-preview" />
              <div class="photo-zoom-hint">🔍 Klik perbesar</div>
            </div>
            <div v-else class="photo-upload-actions">
              <label class="photo-action-btn">
                📷 Kamera
                <input ref="fileInputBefore" type="file" accept="image/*" capture="environment" style="display: none;" @change="(e) => handlePhoto(e, 'before')" />
              </label>
              <label class="photo-action-btn">
                📁 File
                <input type="file" accept="image/*" style="display: none;" @change="(e) => handlePhoto(e, 'before')" />
              </label>
            </div>
          </div>

          <!-- Foto Pengerjaan -->
          <div class="photo-card">
            <div class="photo-card-header">
              <span class="photo-card-title">2. Foto Instal / Service</span>
              <button v-if="form.photo_progress" type="button" class="btn-remove-photo" @click="clearPhoto('progress')" title="Hapus foto">✕</button>
            </div>
            <div v-if="form.photo_progress" class="photo-preview-box" @click="photoZoom = form.photo_progress">
              <img :src="form.photo_progress" alt="Foto Pengerjaan" class="photo-img-preview" />
              <div class="photo-zoom-hint">🔍 Klik perbesar</div>
            </div>
            <div v-else class="photo-upload-actions">
              <label class="photo-action-btn">
                📷 Kamera
                <input ref="fileInputProgress" type="file" accept="image/*" capture="environment" style="display: none;" @change="(e) => handlePhoto(e, 'progress')" />
              </label>
              <label class="photo-action-btn">
                📁 File
                <input type="file" accept="image/*" style="display: none;" @change="(e) => handlePhoto(e, 'progress')" />
              </label>
            </div>
          </div>

          <!-- Foto Sesudah -->
          <div class="photo-card">
            <div class="photo-card-header">
              <span class="photo-card-title">3. Foto Selesai</span>
              <button v-if="form.photo_after" type="button" class="btn-remove-photo" @click="clearPhoto('after')" title="Hapus foto">✕</button>
            </div>
            <div v-if="form.photo_after" class="photo-preview-box" @click="photoZoom = form.photo_after">
              <img :src="form.photo_after" alt="Foto Sesudah" class="photo-img-preview" />
              <div class="photo-zoom-hint">🔍 Klik perbesar</div>
            </div>
            <div v-else class="photo-upload-actions">
              <label class="photo-action-btn">
                📷 Kamera
                <input ref="fileInputAfter" type="file" accept="image/*" capture="environment" style="display: none;" @change="(e) => handlePhoto(e, 'after')" />
              </label>
              <label class="photo-action-btn">
                📁 File
                <input type="file" accept="image/*" style="display: none;" @change="(e) => handlePhoto(e, 'after')" />
              </label>
            </div>
          </div>
        </div>
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

    <!-- Photo Zoom Modal -->
    <Teleport to="body">
      <div v-if="photoZoom" class="photo-zoom-overlay" @click="photoZoom = null">
        <div class="photo-zoom-modal" @click.stop>
          <img :src="photoZoom" alt="Zoom Foto" class="photo-zoomed-img" />
          <button type="button" class="btn-close-zoom" @click="photoZoom = null">✕ Tutup</button>
        </div>
      </div>
    </Teleport>
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

.photo-section {
  margin-top: 16px;
  margin-bottom: 20px;
  padding: 16px;
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-border-light);
  border-radius: 8px;
}

.photo-cards-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.photo-card {
  border: 1px solid var(--color-border-light);
  border-radius: 8px;
  background: var(--color-surface);
  padding: 10px;
  display: flex;
  flex-direction: column;
}

.photo-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.photo-card-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-emphasis);
}

.btn-remove-photo {
  background: var(--color-danger, #ef4444);
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.photo-preview-box {
  position: relative;
  cursor: pointer;
  border-radius: 6px;
  overflow: hidden;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
}

.photo-img-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-zoom-hint {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 10px;
  text-align: center;
  padding: 2px 4px;
}

.photo-upload-actions {
  display: flex;
  gap: 6px;
  height: 120px;
  align-items: center;
  justify-content: center;
}

.photo-action-btn {
  flex: 1;
  border: 1px dashed var(--color-border);
  border-radius: 6px;
  padding: 10px 4px;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  text-align: center;
  background: var(--color-surface-sunken);
  color: var(--color-text);
  transition: all 0.2s ease;
}

.photo-action-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-surface);
}

.photo-zoom-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
}

.photo-zoom-modal {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--color-surface);
  padding: 12px;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.photo-zoomed-img {
  max-width: 85vw;
  max-height: 80vh;
  object-fit: contain;
  border-radius: 6px;
}

.btn-close-zoom {
  margin-top: 10px;
  padding: 6px 16px;
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text);
  font-size: 13px;
  cursor: pointer;
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
  .photo-cards-grid { grid-template-columns: 1fr; }
}
</style>
