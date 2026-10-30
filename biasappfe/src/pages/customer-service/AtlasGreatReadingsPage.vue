<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useResourcesStore } from '@/stores/resources.store'
import { useToast } from '@/composables/useToast'
import { resources } from '@/services/resource.service'
import type { TableColumn } from '@/types'

const toast = useToast()
const master = useMasterStore()
const resourceStore = useResourcesStore()

const { customers, units, formatUnitDisplayName } = master

// --- State ---
const readings = ref<any[]>([])
const loading = ref(false)
const activeTab = ref<'all' | 'atlas_great' | 'standard'>('all')
const filterCustomer = ref<string>('')
const filterMonth = ref<number | ''>('')
const filterYear = ref<number | ''>(new Date().getFullYear())
const searchQuery = ref('')

const showModal = ref(false)
const isEditing = ref(false)
const editingId = ref<string | null>(null)
const isFetchingMeter = ref(false)
const isSaving = ref(false)

const showDeleteConfirm = ref(false)
const itemToDelete = ref<any | null>(null)

const showDetailModal = ref(false)
const detailItem = ref<any | null>(null)

// --- Aturan Tanggal 7 Khusus Atlas & Great ---
const currentDay = new Date().getDate()
const allowOffSchedule = ref(true)

// --- Form State ---
const form = reactive({
  scheme_type: 'standard' as 'atlas_great' | 'standard' | 'custom', // Standar, Atlas/Great (88/12), atau Custom
  customer_type: 'standard',
  customer_id: '',
  unit_id: '',
  period_month: new Date().getMonth() + 1,
  period_year: new Date().getFullYear(),
  reading_date: new Date().toISOString().slice(0, 10),
  start_meter_bw: 0,
  end_meter_bw: 0,
  start_meter_color: 0,
  end_meter_color: 0,
  percentage_bw: 88,
  percentage_color: 12,
  remarks: '',
})

// --- Live Calculations ---
const calcBaseUsageBW = computed(() => {
  const diff = Number(form.end_meter_bw || 0) - Number(form.start_meter_bw || 0)
  return Math.abs(diff)
})

const calcBaseUsageColor = computed(() => {
  const diff = Number(form.end_meter_color || 0) - Number(form.start_meter_color || 0)
  return Math.abs(diff)
})

const calcAllocatedColorToBW = computed(() => {
  if (form.scheme_type === 'standard') return 0
  const pct = Number(form.percentage_bw || 0)
  const val = calcBaseUsageColor.value * (pct / 100)
  return Math.round(val * 100) / 100
})

const calcRetainedColor = computed(() => {
  if (form.scheme_type === 'standard') return calcBaseUsageColor.value
  const pct = Number(form.percentage_color || 0)
  const val = calcBaseUsageColor.value * (pct / 100)
  return Math.round(val * 100) / 100
})

const calcFinalBW = computed(() => {
  if (form.scheme_type === 'standard') return calcBaseUsageBW.value
  const val = calcBaseUsageBW.value + calcAllocatedColorToBW.value
  return Math.round(val * 100) / 100
})

const calcFinalColor = computed(() => {
  return calcRetainedColor.value
})

// --- Month and Year Options ---
const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

const monthFilterOptions = [
  { value: '', label: '-- Semua Bulan --' },
  ...MONTH_NAMES.map((name, idx) => ({ value: idx + 1, label: name }))
]

const monthFormOptions = MONTH_NAMES.map((name, idx) => ({
  value: idx + 1,
  label: `${idx + 1} - ${name}`
}))

const currentYear = new Date().getFullYear()
const yearFilterOptions = [
  { value: '', label: '-- Semua Tahun --' },
  { value: currentYear - 1, label: String(currentYear - 1) },
  { value: currentYear, label: String(currentYear) },
  { value: currentYear + 1, label: String(currentYear + 1) },
]

// --- Helper: Format Customer Name ---
function getCustomerName(c: any): string {
  if (!c) return '-'
  return c.company_name || c.name || 'Unnamed Customer'
}

// --- Customer & Unit Dropdown Options ---
const customerOptions = computed(() => {
  return (customers.value || []).map((c: any) => ({
    value: c.id,
    label: getCustomerName(c),
  }))
})

const customerFilterOptions = computed(() => {
  return [
    { value: '', label: '-- Semua Customer --' },
    ...customerOptions.value,
  ]
})

const customerRentedUnits = ref<any[]>([])
const isLoadingCustomerUnits = ref(false)
const showAllUnitsFallback = ref(false)

async function loadUnitsForCustomer(customerId: string) {
  if (!customerId) {
    customerRentedUnits.value = []
    return
  }
  isLoadingCustomerUnits.value = true
  try {
    const res: any = await resources.atlasGreatReadings.getCustomerUnits(customerId)
    const items = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []
    customerRentedUnits.value = items

    // Jika customer hanya punya 1 unit mesin rental dan mode tambah, langsung auto-select
    if (!isEditing.value && items.length === 1 && !form.unit_id) {
      form.unit_id = items[0].id
      await onUnitChange(items[0].id)
    }
  } catch (err) {
    console.error('Failed to load customer units:', err)
    customerRentedUnits.value = []
  } finally {
    isLoadingCustomerUnits.value = false
  }
}

const unitOptions = computed(() => {
  if (!form.customer_id) {
    return []
  }

  // Jika customer memiliki unit rental terdaftar
  if (customerRentedUnits.value.length > 0 && !showAllUnitsFallback.value) {
    return customerRentedUnits.value.map((u: any) => {
      const brandStr = u.brand?.name ? `${u.brand.name} ` : ''
      const modelStr = u.model || u.name || 'Unit'
      const snStr = u.serial_no ? ` (SN: ${u.serial_no})` : ''
      return {
        value: u.id,
        label: `${brandStr}${modelStr}${snStr}`,
      }
    })
  }

  // Fallback: Jika belum ada kontrak rental atau user memilih opsi lihat semua unit copier
  const allUnitsList = (units.value || []).filter((u: any) => u.is_copier || showAllUnitsFallback.value)
  return allUnitsList.map((u: any) => {
    const disp = formatUnitDisplayName ? formatUnitDisplayName(u) : `${u.name || u.model || 'Unit'}${u.serial_no ? ` (SN: ${u.serial_no})` : ''}`
    return {
      value: u.id,
      label: disp,
    }
  })
})

// Deteksi otomatis apakah customer adalah Atlas atau Great saat memilih customer
watch(() => form.customer_id, async (newCustId, oldCustId) => {
  if (!newCustId) {
    customerRentedUnits.value = []
    form.unit_id = ''
    return
  }

  // Jika ganti customer saat tambah data, reset unit_id
  if (!isEditing.value && newCustId !== oldCustId) {
    form.unit_id = ''
  }

  await loadUnitsForCustomer(newCustId)

  if (isEditing.value) return

  const cust = (customers.value || []).find((c: any) => c.id === newCustId)
  if (cust) {
    const name = getCustomerName(cust).toLowerCase()
    if (name.includes('atlas')) {
      form.scheme_type = 'atlas_great'
      form.customer_type = 'atlas'
      form.percentage_bw = 88
      form.percentage_color = 12
    } else if (name.includes('great')) {
      form.scheme_type = 'atlas_great'
      form.customer_type = 'great'
      form.percentage_bw = 88
      form.percentage_color = 12
    } else if (form.scheme_type === 'atlas_great' && !name.includes('atlas') && !name.includes('great')) {
      // Default untuk customer umum: Standar 100%
      form.scheme_type = 'standard'
      form.customer_type = 'standard'
      form.percentage_bw = 0
      form.percentage_color = 100
    }
  }
})

// Sinkronisasi scheme_type dengan customer_type & persentase
watch(() => form.scheme_type, (newScheme) => {
  if (newScheme === 'atlas_great') {
    const cust = (customers.value || []).find((c: any) => c.id === form.customer_id)
    const name = cust ? getCustomerName(cust).toLowerCase() : ''
    form.customer_type = name.includes('great') ? 'great' : 'atlas'
    form.percentage_bw = 88
    form.percentage_color = 12
  } else if (newScheme === 'standard') {
    form.customer_type = 'standard'
    form.percentage_bw = 0
    form.percentage_color = 100
  } else if (newScheme === 'custom') {
    form.customer_type = 'custom'
    if (form.percentage_bw === 0 && form.percentage_color === 100) {
      form.percentage_bw = 88
      form.percentage_color = 12
    }
  }
})

// Cek apakah data ini tergolong Atlas atau Great
const isAtlasOrGreat = computed(() => {
  if (form.scheme_type === 'atlas_great' || form.customer_type === 'atlas' || form.customer_type === 'great') {
    return true
  }
  const cust = (customers.value || []).find((c: any) => c.id === form.customer_id)
  if (cust) {
    const name = getCustomerName(cust).toLowerCase()
    return name.includes('atlas') || name.includes('great')
  }
  return false
})

// Kunci reading_date ke tanggal 7 secara otomatis jika customer Atlas atau Great
watch(
  [() => form.period_month, () => form.period_year, () => form.scheme_type, () => form.customer_id],
  () => {
    if (isAtlasOrGreat.value) {
      const mStr = String(form.period_month).padStart(2, '0')
      form.reading_date = `${form.period_year}-${mStr}-07`
    }
  },
  { immediate: true }
)

// --- Columns ---
const columns: TableColumn[] = [
  { key: 'period', label: 'Periode' },
  { key: 'customer', label: 'Customer & Skema' },
  { key: 'unit', label: 'Unit & SN' },
  { key: 'meter_bw', label: 'Counter BW (Awal / Akhir)' },
  { key: 'meter_color', label: 'Counter Color (Awal / Akhir)' },
  { key: 'base_usage', label: 'Pemakaian Dasar' },
  { key: 'allocation', label: 'Alokasi Lembar' },
  { key: 'total_pages', label: 'Total Lembar Akhir' },
  { key: 'actions', label: 'Aksi' },
]

// --- Load Data ---
async function fetchReadings() {
  loading.value = true
  try {
    const res: any = await resources.atlasGreatReadings.list({ per_page: 500 })
    readings.value = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []
  } catch (err: any) {
    toast.error('Gagal memuat data pencatatan: ' + (err?.message || 'Error'))
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await Promise.all([
    resourceStore.fetchAll('customers', { per_page: 500 }, false),
    resourceStore.fetchAll('units', { per_page: 500 }, false),
  ])
  await fetchReadings()
})

// --- Filtered Data ---
const filteredReadings = computed(() => {
  let list = readings.value

  if (activeTab.value === 'atlas_great') {
    list = list.filter((r) => r.customer_type === 'atlas' || r.customer_type === 'great' || r.percentage_bw > 0)
  } else if (activeTab.value === 'standard') {
    list = list.filter((r) => r.customer_type === 'standard' || Number(r.percentage_bw) === 0)
  }

  if (filterCustomer.value) {
    list = list.filter((r) => r.customer_id === filterCustomer.value)
  }

  if (filterMonth.value !== '') {
    list = list.filter((r) => {
      const dt = r.period_date ? new Date(r.period_date) : null
      const m = dt ? dt.getMonth() + 1 : Number(r.period_month)
      return m === Number(filterMonth.value)
    })
  }

  if (filterYear.value !== '') {
    list = list.filter((r) => {
      const dt = r.period_date ? new Date(r.period_date) : null
      const y = dt ? dt.getFullYear() : Number(r.period_year)
      return y === Number(filterYear.value)
    })
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter((r) => {
      const custName = getCustomerName(r.customer).toLowerCase()
      const sn = (r.unit?.serial_number || '').toLowerCase()
      const model = (r.unit?.model_name || r.unit?.model || '').toLowerCase()
      const notes = (r.notes || '').toLowerCase()
      return custName.includes(q) || sn.includes(q) || model.includes(q) || notes.includes(q)
    })
  }

  return list
})

// --- Auto Fetch Latest Meter from Technician Readings ---
async function handleAutoFetchMeter() {
  isFetchingMeter.value = true
  try {
    const res: any = await resources.atlasGreatReadings.getLatestMeter({
      customer_type: form.customer_type,
      unit_id: form.unit_id || undefined,
    })

    const payload = res?.data || res
    if (payload) {
      if (payload.customer_id && !form.customer_id) {
        form.customer_id = payload.customer_id
      }
      if (payload.unit_id) {
        form.unit_id = payload.unit_id
      }
      if (payload.reading_date) {
        form.reading_date = payload.reading_date
      }

      form.start_meter_bw = Number(payload.counter_awal_bw ?? payload.start_meter_bw ?? 0)
      form.end_meter_bw = Number(payload.counter_akhir_bw ?? payload.end_meter_bw ?? 0)
      form.start_meter_color = Number(payload.counter_awal_color ?? payload.start_meter_color ?? 0)
      form.end_meter_color = Number(payload.counter_akhir_color ?? payload.end_meter_color ?? 0)

      const srcText = payload.source === 'technician_monthly_readings'
        ? 'Monthly Reading Teknisi'
        : payload.source === 'previous_record'
          ? 'Periode Sebelumnya'
          : 'Counter Unit'

      toast.success(`Berhasil menarik meter otomatis (${srcText})!`)
    } else {
      toast.info('Data meter reading teknisi belum tersedia untuk unit ini.')
    }
  } catch (err: any) {
    toast.error('Gagal menarik meter otomatis: ' + (err?.message || 'Error'))
  } finally {
    isFetchingMeter.value = false
  }
}

// Saat unit dipilih di form tambah, tawarkan/auto-tarik meter teknisi
async function onUnitChange(unitId: string) {
  form.unit_id = unitId
  if (!isEditing.value && unitId) {
    await handleAutoFetchMeter()
  }
}

// --- Add / Edit Handlers ---
function openAddModal() {
  isEditing.value = false
  editingId.value = null
  allowOffSchedule.value = true
  showAllUnitsFallback.value = false
  customerRentedUnits.value = []
  form.scheme_type = 'standard'
  form.customer_type = 'standard'
  form.customer_id = ''
  form.unit_id = ''
  form.period_month = new Date().getMonth() + 1
  form.period_year = new Date().getFullYear()
  form.reading_date = new Date().toISOString().slice(0, 10)
  form.start_meter_bw = 0
  form.end_meter_bw = 0
  form.start_meter_color = 0
  form.end_meter_color = 0
  form.percentage_bw = 0
  form.percentage_color = 100
  form.remarks = ''

  showModal.value = true
}

function openEditModal(item: any) {
  isEditing.value = true
  editingId.value = item.id
  allowOffSchedule.value = true
  showAllUnitsFallback.value = false

  const cType = item.customer_type || 'standard'
  if (cType === 'atlas' || cType === 'great') {
    form.scheme_type = 'atlas_great'
  } else if (cType === 'custom') {
    form.scheme_type = 'custom'
  } else {
    form.scheme_type = 'standard'
  }

  form.customer_type = cType
  form.customer_id = item.customer_id || ''
  form.unit_id = item.unit_id || ''

  if (item.customer_id) {
    void loadUnitsForCustomer(item.customer_id)
  }

  const dt = item.period_date ? new Date(item.period_date) : new Date()
  form.period_month = dt.getMonth() + 1
  form.period_year = dt.getFullYear()
  form.reading_date = item.period_date ? item.period_date.slice(0, 10) : new Date().toISOString().slice(0, 10)

  form.start_meter_bw = Number(item.counter_awal_bw || 0)
  form.end_meter_bw = Number(item.counter_akhir_bw || 0)
  form.start_meter_color = Number(item.counter_awal_color || 0)
  form.end_meter_color = Number(item.counter_akhir_color || 0)

  form.percentage_bw = Number(item.percentage_bw || (form.scheme_type === 'standard' ? 0 : 88))
  form.percentage_color = Number(item.percentage_color || (form.scheme_type === 'standard' ? 100 : 12))
  form.remarks = item.notes || item.remarks || ''

  showModal.value = true
}

async function handleSubmit() {
  if (!form.customer_id) {
    toast.error('Pilih customer terlebih dahulu')
    return
  }
  if (!form.unit_id) {
    toast.error('Pilih unit mesin terlebih dahulu')
    return
  }

  // Validasi aturan: Atlas & Great hanya dapat dibuat pada tanggal 7 setiap bulannya
  if (!isEditing.value && isAtlasOrGreat.value && currentDay !== 7 && !allowOffSchedule.value) {
    toast.error(
      `Pencatatan Atlas Copco & PT Great Eastern hanya dapat dibuat pada tanggal 7 setiap bulannya! (Hari ini: tanggal ${currentDay}). Centang 'Izinkan pembuatan di luar tanggal 7' jika merupakan input susulan oleh Admin.`
    )
    return
  }

  isSaving.value = true
  try {
    const periodDay = isAtlasOrGreat.value ? 7 : 1
    const periodDate = new Date(form.period_year, form.period_month - 1, periodDay)
    const periodLabel = `${MONTH_NAMES[form.period_month - 1]} ${form.period_year}`

    const payload = {
      customer_type: form.customer_type,
      customer_id: form.customer_id,
      unit_id: form.unit_id,
      period_date: periodDate.toISOString(),
      period_label: periodLabel,
      counter_awal_bw: Number(form.start_meter_bw || 0),
      counter_akhir_bw: Number(form.end_meter_bw || 0),
      counter_awal_color: Number(form.start_meter_color || 0),
      counter_akhir_color: Number(form.end_meter_color || 0),
      percentage_bw: form.scheme_type === 'standard' ? 0 : Number(form.percentage_bw || 88),
      percentage_color: form.scheme_type === 'standard' ? 100 : Number(form.percentage_color || 12),
      notes: form.remarks,
    }

    if (isEditing.value && editingId.value) {
      await resources.atlasGreatReadings.update(editingId.value, payload)
      toast.success('Pencatatan berhasil diperbarui')
    } else {
      await resources.atlasGreatReadings.create(payload)
      toast.success('Pencatatan berhasil disimpan')
    }

    showModal.value = false
    await fetchReadings()
  } catch (err: any) {
    toast.error('Gagal menyimpan pencatatan: ' + (err?.message || 'Error'))
  } finally {
    isSaving.value = false
  }
}

// --- Delete Handlers ---
function confirmDelete(item: any) {
  itemToDelete.value = item
  showDeleteConfirm.value = true
}

async function handleDelete() {
  if (!itemToDelete.value) return
  try {
    await resources.atlasGreatReadings.delete(itemToDelete.value.id)
    toast.success('Pencatatan berhasil dihapus')
    showDeleteConfirm.value = false
    itemToDelete.value = null
    await fetchReadings()
  } catch (err: any) {
    toast.error('Gagal menghapus: ' + (err?.message || 'Error'))
  }
}

// --- Detail & Print Slip ---
function openDetail(item: any) {
  detailItem.value = item
  showDetailModal.value = true
}

function printSlip(item: any) {
  const printWindow = window.open('', '_blank', 'width=900,height=750')
  if (!printWindow) {
    toast.error('Pop-up browser diblokir. Harap izinkan pop-up untuk mencetak.')
    return
  }

  const custName = getCustomerName(item.customer)
  const unitInfo = item.unit ? `${item.unit.model_name || item.unit.model || ''} - SN: ${item.unit.serial_number || '-'}` : '-'
  const periodStr = item.period_label || (item.period_date ? new Date(item.period_date).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : '-')
  const isStd = item.customer_type === 'standard' || Number(item.percentage_bw) === 0

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Laporan Perhitungan Pemakaian Lembar - ${custName}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body {
      font-family: Arial, sans-serif;
      color: #1f2937;
      margin: 0;
      padding: 16px;
      font-size: 13px;
    }
    .header-table {
      width: 100%;
      border-bottom: 2px solid #111827;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .company-title {
      font-size: 18px;
      font-weight: bold;
      color: #111827;
    }
    .company-sub {
      font-size: 11px;
      color: #4b5563;
      margin-top: 2px;
    }
    .doc-title {
      text-align: center;
      font-size: 15px;
      font-weight: bold;
      text-transform: uppercase;
      margin: 16px 0 18px 0;
      text-decoration: underline;
    }
    .meta-table {
      width: 100%;
      margin-bottom: 20px;
      font-size: 13px;
    }
    .meta-table td {
      padding: 4px 6px;
      vertical-align: top;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    .data-table th, .data-table td {
      border: 1px solid #9ca3af;
      padding: 8px 10px;
      text-align: left;
    }
    .data-table th {
      background-color: #f3f4f6;
      font-weight: bold;
      font-size: 12px;
      text-transform: uppercase;
    }
    .text-right { text-align: right !important; }
    .text-center { text-align: center !important; }
    .highlight-yellow {
      background-color: #fef08a !important;
      font-weight: bold;
    }
    .highlight-total {
      background-color: #dcfce7 !important;
      font-weight: bold;
      font-size: 14px;
    }
    .summary-box {
      border: 2px solid #22c55e;
      background: #f0fdf4;
      border-radius: 8px;
      padding: 14px 20px;
      margin-bottom: 26px;
    }
    .summary-grid {
      display: flex;
      justify-content: space-around;
      text-align: center;
    }
    .summary-val {
      font-size: 20px;
      font-weight: bold;
      color: #15803d;
      margin-top: 4px;
    }
    .signatures {
      width: 100%;
      margin-top: 36px;
      page-break-inside: avoid;
    }
    .signatures td {
      width: 33.33%;
      text-align: center;
      vertical-align: top;
    }
    .sig-space {
      height: 65px;
    }
    .sig-line {
      display: inline-block;
      width: 75%;
      border-bottom: 1px solid #1f2937;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <table class="header-table">
    <tr>
      <td>
        <div class="company-title">PT. BIAS SURYA TEKNOLOGI</div>
        <div class="company-sub">Office Solution & Multifunction Copier Rental System</div>
        <div class="company-sub">Batam - Kepulauan Riau, Indonesia</div>
      </td>
      <td class="text-right" style="vertical-align: bottom;">
        <span style="font-size: 11px; color: #6b7280;">Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}</span>
      </td>
    </tr>
  </table>

  <div class="doc-title">Laporan Perhitungan Pemakaian Lembar Cetak</div>

  <table class="meta-table">
    <tr>
      <td style="width: 18%;"><strong>Customer</strong></td>
      <td style="width: 2%;">:</td>
      <td style="width: 40%;"><strong>${custName}</strong></td>
      <td style="width: 18%;"><strong>Periode</strong></td>
      <td style="width: 2%;">:</td>
      <td style="width: 20%;"><strong>${periodStr}</strong></td>
    </tr>
    <tr>
      <td><strong>Unit Mesin</strong></td>
      <td>:</td>
      <td>${unitInfo}</td>
      <td><strong>Skema Hitung</strong></td>
      <td>:</td>
      <td>${isStd ? 'Standar (100% Murni)' : `Alokasi (${Number(item.percentage_bw || 88)}% BW / ${Number(item.percentage_color || 12)}% CL)`}</td>
    </tr>
  </table>

  <h4 style="margin: 0 0 8px 0;">1. Data Pembacaan Counter (Meter Reading)</h4>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 25%;">Kategori</th>
        <th class="text-right" style="width: 25%;">Counter Awal</th>
        <th class="text-right" style="width: 25%;">Counter Akhir</th>
        <th class="text-right" style="width: 25%;">Pemakaian Dasar</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Black & White (BW)</strong></td>
        <td class="text-right">${Number(item.counter_awal_bw || 0).toLocaleString('id-ID')}</td>
        <td class="text-right">${Number(item.counter_akhir_bw || 0).toLocaleString('id-ID')}</td>
        <td class="text-right highlight-yellow">${Number(item.pemakaian_bw_dasar || 0).toLocaleString('id-ID')}</td>
      </tr>
      <tr>
        <td><strong>Color (CL)</strong></td>
        <td class="text-right">${Number(item.counter_awal_color || 0).toLocaleString('id-ID')}</td>
        <td class="text-right">${Number(item.counter_akhir_color || 0).toLocaleString('id-ID')}</td>
        <td class="text-right highlight-yellow">${Number(item.pemakaian_color_dasar || 0).toLocaleString('id-ID')}</td>
      </tr>
    </tbody>
  </table>

  ${!isStd ? `
  <h4 style="margin: 0 0 8px 0;">2. Perhitungan Alokasi Lembar (${Number(item.percentage_bw || 88)}% : ${Number(item.percentage_color || 12)}%)</h4>
  <table class="data-table">
    <thead>
      <tr>
        <th>Jenis</th>
        <th class="text-center">Perhitungan Alokasi</th>
        <th class="text-right">Hasil Alokasi</th>
        <th class="text-right">Ditambah BW Dasar</th>
        <th class="text-right">Total Akhir Lembar</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>BW (Black & White)</strong></td>
        <td class="text-center">${Number(item.pemakaian_color_dasar || 0).toLocaleString('id-ID')} &times; ${Number(item.percentage_bw || 88)}%</td>
        <td class="text-right">${Number(item.allocation_bw || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })}</td>
        <td class="text-right">+ ${Number(item.pemakaian_bw_dasar || 0).toLocaleString('id-ID')}</td>
        <td class="text-right highlight-total">${Number(item.total_bw || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })} Lembar</td>
      </tr>
      <tr>
        <td><strong>Color (CL)</strong></td>
        <td class="text-center">${Number(item.pemakaian_color_dasar || 0).toLocaleString('id-ID')} &times; ${Number(item.percentage_color || 12)}%</td>
        <td class="text-right highlight-yellow">${Number(item.allocation_color || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })}</td>
        <td class="text-right">-</td>
        <td class="text-right highlight-total">${Number(item.total_color || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })} Lembar</td>
      </tr>
    </tbody>
  </table>
  ` : ''}

  <div class="summary-box">
    <div class="summary-grid">
      <div>
        <div style="font-size: 13px; color: #374151; font-weight: 600;">TOTAL PEMAKAIAN LEMBAR BW</div>
        <div class="summary-val">${Number(item.total_bw || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })} <span style="font-size: 13px; font-weight: normal;">Lembar</span></div>
      </div>
      <div style="border-left: 2px solid #bbf7d0; padding-left: 30px;">
        <div style="font-size: 13px; color: #374151; font-weight: 600;">TOTAL PEMAKAIAN LEMBAR COLOR</div>
        <div class="summary-val" style="color: #2563eb;">${Number(item.total_color || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })} <span style="font-size: 13px; font-weight: normal;">Lembar</span></div>
      </div>
    </div>
  </div>

  <table class="signatures">
    <tr>
      <td>
        <div>Dibuat Oleh:</div>
        <div class="sig-space"></div>
        <div class="sig-line"></div>
        <div>( Admin / Rental )</div>
      </td>
      <td>
        <div>Diperiksa Oleh:</div>
        <div class="sig-space"></div>
        <div class="sig-line"></div>
        <div>( Accounting )</div>
      </td>
      <td>
        <div>Disetujui Oleh:</div>
        <div class="sig-space"></div>
        <div class="sig-line"></div>
        <div>( ${custName} )</div>
      </td>
    </tr>
  </table>

  <script>
    window.onload = function() {
      window.print();
    };
  <\/script>
</body>
</html>
`

  printWindow.document.write(html)
  printWindow.document.close()
}

// --- Export to CSV ---
function exportCSV() {
  if (filteredReadings.value.length === 0) {
    toast.info('Tidak ada data untuk diekspor')
    return
  }

  const headers = [
    'No',
    'Customer',
    'Skema',
    'Unit',
    'Serial Number',
    'Periode',
    'Awal BW',
    'Akhir BW',
    'Pemakaian Dasar BW',
    'Awal CL',
    'Akhir CL',
    'Pemakaian Dasar CL',
    '% Alokasi BW',
    '% Alokasi CL',
    'Hasil Alokasi ke BW',
    'Total Akhir Lembar BW',
    'Total Akhir Lembar Color',
    'Catatan',
  ]

  const rows = filteredReadings.value.map((r, i) => [
    i + 1,
    `"${getCustomerName(r.customer)}"`,
    r.customer_type === 'standard' ? 'Standar' : `Alokasi (${r.percentage_bw}:${r.percentage_color})`,
    `"${r.unit?.model_name || r.unit?.model || ''}"`,
    `"${r.unit?.serial_number || ''}"`,
    `"${r.period_label || ''}"`,
    r.counter_awal_bw,
    r.counter_akhir_bw,
    r.pemakaian_bw_dasar,
    r.counter_awal_color,
    r.counter_akhir_color,
    r.pemakaian_color_dasar,
    r.percentage_bw,
    r.percentage_color,
    r.allocation_bw,
    r.total_bw,
    r.total_color,
    `"${r.notes || ''}"`,
  ])

  const csvContent =
    'data:text/csv;charset=utf-8,\uFEFF' +
    [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')

  const encodedUri = encodeURI(csvContent)
  const link = document.createElement('a')
  link.setAttribute('href', encodedUri)
  link.setAttribute('download', `Pencatatan_Lembar_Pemakaian_${new Date().toISOString().slice(0, 10)}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  toast.success('File CSV berhasil diunduh')
}
</script>

<template>
  <div class="atlas-great-page">
    <PageHeader
      title="Pencatatan Lembar Pemakaian (Rental Meter)"
      buttonLabel="+ Hitung / Tambah Pencatatan"
      @add="openAddModal"
    >
      <template #actions>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          title="Export data ke CSV / Excel"
          @click="exportCSV"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          Export CSV
        </button>
      </template>
    </PageHeader>

    <!-- Info banner penjelasan modul & fleksibilitas semua customer -->
    <div class="info-card">
      <div class="info-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </div>
      <div class="info-content">
        <div class="info-title">Modul Perhitungan Lembar Pemakaian Meter Rental (Semua Customer)</div>
        <div class="info-desc">
          Teknisi mencatat meter reading di lapangan pada rentang <strong>tanggal 25–30 setiap akhir bulan</strong>.
          Admin / Accounting menarik data tersebut secara otomatis untuk menerbitkan perhitungan lembar pemakaian.
          Bagi customer dengan skema khusus (alokasi 88% Color ke BW & 12% Color murni), perhitungan diterbitkan setiap <strong>tanggal 7</strong>.
        </div>
      </div>
    </div>

    <!-- Filter Bar & Tabs -->
    <div class="filter-container">
      <div class="tabs-group">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'all' }"
          @click="activeTab = 'all'"
        >
          Semua Data
          <span class="badge-count">{{ readings.length }}</span>
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'atlas_great' }"
          @click="activeTab = 'atlas_great'"
        >
          Alokasi 88% : 12% (Khusus)
          <span class="badge-count">{{ readings.filter(r => r.customer_type === 'atlas' || r.customer_type === 'great' || r.percentage_bw > 0).length }}</span>
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'standard' }"
          @click="activeTab = 'standard'"
        >
          Standar (100% Murni)
          <span class="badge-count">{{ readings.filter(r => r.customer_type === 'standard' || Number(r.percentage_bw) === 0).length }}</span>
        </button>
      </div>

      <div class="filter-controls">
        <div class="filter-item">
          <label class="filter-label">Customer:</label>
          <select v-model="filterCustomer" class="filter-select max-w-xs">
            <option v-for="opt in customerFilterOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="filter-item">
          <label class="filter-label">Bulan:</label>
          <select v-model="filterMonth" class="filter-select">
            <option v-for="opt in monthFilterOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="filter-item">
          <label class="filter-label">Tahun:</label>
          <select v-model="filterYear" class="filter-select">
            <option v-for="opt in yearFilterOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="filter-item search-item">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Cari Customer, Unit, atau SN..."
            class="filter-input"
          />
        </div>
      </div>
    </div>

    <!-- Data Table -->
    <div class="table-card">
      <DataTable
        :columns="columns"
        :data="filteredReadings"
        :loading="loading"
        searchPlaceholder=""
        maxHeight="calc(100vh - 350px)"
      >
        <template #cell(period)="{ item }">
          <div class="font-medium text-slate-800">
            {{ item.period_label || (item.period_date ? new Date(item.period_date).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : '-') }}
          </div>
          <div class="text-xs text-slate-500">
            {{ item.period_date ? item.period_date.slice(0, 10) : '-' }}
          </div>
        </template>

        <template #cell(customer)="{ item }">
          <div class="font-semibold text-slate-800">
            {{ getCustomerName(item.customer) }}
          </div>
          <div class="mt-1 flex items-center gap-1">
            <span
              v-if="item.customer_type === 'atlas' || item.customer_type === 'great' || item.percentage_bw > 0"
              class="badge-type badge-atlas"
            >
              Alokasi {{ Number(item.percentage_bw || 88) }}% : {{ Number(item.percentage_color || 12) }}%
            </span>
            <span
              v-else
              class="badge-type badge-standard"
            >
              Standar 100%
            </span>
          </div>
        </template>

        <template #cell(unit)="{ item }">
          <div class="font-semibold text-slate-800">
            {{ item.unit?.model_name || item.unit?.model || 'Unit' }}
          </div>
          <div class="text-xs text-slate-500 font-mono">
            SN: {{ item.unit?.serial_number || '-' }}
          </div>
        </template>

        <template #cell(meter_bw)="{ item }">
          <div class="text-xs">
            <span class="text-slate-500">Awal:</span> <strong>{{ Number(item.counter_awal_bw || 0).toLocaleString() }}</strong>
          </div>
          <div class="text-xs">
            <span class="text-slate-500">Akhir:</span> <strong>{{ Number(item.counter_akhir_bw || 0).toLocaleString() }}</strong>
          </div>
        </template>

        <template #cell(meter_color)="{ item }">
          <div class="text-xs">
            <span class="text-slate-500">Awal:</span> <strong>{{ Number(item.counter_awal_color || 0).toLocaleString() }}</strong>
          </div>
          <div class="text-xs">
            <span class="text-slate-500">Akhir:</span> <strong>{{ Number(item.counter_akhir_color || 0).toLocaleString() }}</strong>
          </div>
        </template>

        <template #cell(base_usage)="{ item }">
          <div class="text-xs">
            <span class="font-medium text-slate-700">BW:</span>
            <span class="badge-mini badge-yellow">{{ Number(item.pemakaian_bw_dasar || 0).toLocaleString() }}</span>
          </div>
          <div class="text-xs mt-1">
            <span class="font-medium text-slate-700">CL:</span>
            <span class="badge-mini badge-yellow">{{ Number(item.pemakaian_color_dasar || 0).toLocaleString() }}</span>
          </div>
        </template>

        <template #cell(allocation)="{ item }">
          <template v-if="Number(item.percentage_bw) > 0">
            <div class="text-xs">
              <span class="text-slate-500">{{ Number(item.percentage_bw) }}% ke BW:</span>
              <strong>+{{ Number(item.allocation_bw || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</strong>
            </div>
            <div class="text-xs">
              <span class="text-slate-500">{{ Number(item.percentage_color) }}% CL:</span>
              <strong>{{ Number(item.allocation_color || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</strong>
            </div>
          </template>
          <template v-else>
            <div class="text-xs text-slate-400 italic">
              Standar Murni (Tanpa Alokasi)
            </div>
          </template>
        </template>

        <template #cell(total_pages)="{ item }">
          <div class="badge-total badge-bw">
            <span>BW:</span>
            <strong>{{ Number(item.total_bw || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</strong> lbr
          </div>
          <div class="badge-total badge-color mt-1">
            <span>CL:</span>
            <strong>{{ Number(item.total_color || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</strong> lbr
          </div>
        </template>

        <template #cell(actions)="{ item }">
          <div class="action-btns">
            <button
              type="button"
              class="btn-icon"
              title="Detail & Cetak Slip Laporan"
              @click="openDetail(item)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </button>
            <button
              type="button"
              class="btn-icon btn-icon-print"
              title="Cetak Cepat"
              @click="printSlip(item)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
              </svg>
            </button>
            <button
              type="button"
              class="btn-icon btn-icon-edit"
              title="Edit Pencatatan"
              @click="openEditModal(item)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </button>
            <button
              type="button"
              class="btn-icon btn-icon-delete"
              title="Hapus"
              @click="confirmDelete(item)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </template>
      </DataTable>
    </div>

    <!-- MODAL FORM HITUNG / TAMBAH / EDIT -->
    <FormModal
      :open="showModal"
      :title="isEditing ? 'Edit Pencatatan Lembar' : 'Hitung / Tambah Pencatatan Lembar'"
      :submitLabel="isEditing ? 'Perbarui' : 'Simpan Pencatatan'"
      maxWidth="780px"
      @close="showModal = false"
      @submit="handleSubmit"
    >
      <div class="form-grid">
        <!-- Customer & Unit Selection -->
        <div class="form-group">
          <label class="form-label required">Customer / Perusahaan</label>
          <CustomSelect
            v-model="form.customer_id"
            :options="customerOptions"
            placeholder="Pilih Customer..."
          />
        </div>

        <div class="form-group">
          <label class="form-label required">
            Unit Mesin Rented
            <span v-if="isLoadingCustomerUnits" style="font-weight: normal; font-size: 11px; color: var(--color-text-muted); margin-left: 4px;">
              (Memuat unit rental...)
            </span>
          </label>
          <CustomSelect
            v-model="form.unit_id"
            :options="unitOptions"
            :placeholder="!form.customer_id ? 'Pilih Customer terlebih dahulu...' : isLoadingCustomerUnits ? 'Sedang memuat unit rental...' : unitOptions.length === 0 ? 'Tidak ada unit rental untuk customer ini' : 'Pilih Unit Mesin...'"
            :disabled="!form.customer_id || isLoadingCustomerUnits"
            @update:modelValue="onUnitChange"
          />
          <div v-if="form.customer_id && !isLoadingCustomerUnits && customerRentedUnits.length === 0" style="margin-top: 6px; font-size: 12px; color: #d97706; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <span>Customer ini belum memiliki unit rental terdaftar di kontrak/rental.</span>
            <label style="display: inline-flex; align-items: center; gap: 4px; cursor: pointer; color: var(--color-primary); font-weight: 500;">
              <input type="checkbox" v-model="showAllUnitsFallback" />
              Tampilkan semua unit mesin
            </label>
          </div>
          <div v-else-if="form.customer_id && customerRentedUnits.length > 0" style="margin-top: 4px; font-size: 12px; color: #059669; display: flex; align-items: center; gap: 4px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Menampilkan {{ customerRentedUnits.length }} unit mesin rental customer ini
          </div>
        </div>

        <!-- Skema Perhitungan Selector -->
        <div class="form-group full-width">
          <label class="form-label required">Skema Metode Perhitungan Lembar</label>
          <div class="scheme-radio-group">
            <label class="scheme-radio-card" :class="{ selected: form.scheme_type === 'standard' }">
              <input
                v-model="form.scheme_type"
                type="radio"
                value="standard"
              />
              <div class="scheme-card-body">
                <div class="scheme-title">Standar (100% Murni)</div>
                <div class="scheme-desc">Untuk customer umum/biasa: Total lembar = Pemakaian BW murni & Color murni.</div>
              </div>
            </label>

            <label class="scheme-radio-card" :class="{ selected: form.scheme_type === 'atlas_great' }">
              <input
                v-model="form.scheme_type"
                type="radio"
                value="atlas_great"
              />
              <div class="scheme-card-body">
                <div class="scheme-title">Alokasi Khusus (88% : 12% - Tgl 7)</div>
                <div class="scheme-desc">Untuk customer yang meminta alokasi (cth: Atlas, Great, dll): 88% Color ke BW & cut-off tgl 7.</div>
              </div>
            </label>

            <label class="scheme-radio-card" :class="{ selected: form.scheme_type === 'custom' }">
              <input
                v-model="form.scheme_type"
                type="radio"
                value="custom"
              />
              <div class="scheme-card-body">
                <div class="scheme-title">Kustom Alokasi %</div>
                <div class="scheme-desc">Tentukan persentase alokasi secara dinamis sesuai perjanjian sewa.</div>
              </div>
            </label>
          </div>
        </div>

        <!-- Custom Percentages Inputs (Jika Kustom dipilih) -->
        <div v-if="form.scheme_type === 'custom'" class="custom-pct-box full-width">
          <div class="pct-input-wrap">
            <label class="form-label">% Color Dialihkan ke BW:</label>
            <div class="pct-input-group">
              <input
                v-model.number="form.percentage_bw"
                type="number"
                min="0"
                max="100"
                class="form-input"
                @input="form.percentage_color = Math.max(0, 100 - (form.percentage_bw || 0))"
              />
              <span class="pct-symbol">%</span>
            </div>
          </div>
          <div class="pct-input-wrap">
            <label class="form-label">% Color Tetap Color:</label>
            <div class="pct-input-group">
              <input
                v-model.number="form.percentage_color"
                type="number"
                min="0"
                max="100"
                class="form-input"
                @input="form.percentage_bw = Math.max(0, 100 - (form.percentage_color || 0))"
              />
              <span class="pct-symbol">%</span>
            </div>
          </div>
        </div>

        <!-- Periode & Reading Date -->
        <div class="form-group">
          <label class="form-label required">Periode Bulan</label>
          <select v-model="form.period_month" class="form-input">
            <option v-for="opt in monthFormOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label required">Periode Tahun</label>
          <input
            v-model="form.period_year"
            type="number"
            min="2020"
            max="2035"
            class="form-input"
          />
        </div>

        <!-- ALERT ATURAN TANGGAL 7 KHUSUS SKEMA ALOKASI -->
        <div v-if="isAtlasOrGreat && !isEditing" class="cutoff-notice-card full-width" :class="{ 'warning-mode': currentDay !== 7 }">
          <div class="notice-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span class="font-bold">Siklus Billing: Tanggal 7 Setiap Bulan</span>
          </div>
          <div class="notice-body">
            Meter reading dicatat oleh teknisi pada rentang tanggal 25–30 setiap akhir bulan. Perhitungan alokasi lembar untuk customer dengan skema ini diterbitkan setiap <strong>tanggal 7</strong>, dan tanggal pembacaan otomatis dikunci pada <strong>tanggal 7</strong>.
          </div>
          <div v-if="currentDay !== 7" class="notice-override">
            <div class="today-tag">Hari ini: Tanggal {{ currentDay }} (Jadwal normal: Tanggal 7)</div>
            <label class="override-checkbox">
              <input v-model="allowOffSchedule" type="checkbox" />
              <span>Mode Pengujian / Otorisasi Admin Aktif (Bebas langsung disimpan dan diuji hari ini)</span>
            </label>
          </div>
        </div>

        <div class="form-group full-width">
          <label class="form-label">
            Tanggal Pembacaan Meter
            <span v-if="isAtlasOrGreat" class="text-xs text-blue-600 font-normal ml-2">
              (Terkunci otomatis ke tanggal 7)
            </span>
          </label>
          <input
            v-model="form.reading_date"
            type="date"
            class="form-input"
            :disabled="isAtlasOrGreat"
          />
        </div>

        <!-- TOMBOL TARIK OTOMATIS -->
        <div class="auto-fetch-banner full-width">
          <div class="auto-fetch-text">
            <strong>Penarikan Otomatis Meter Reading Teknisi</strong>
            <p>Tarik counter awal dan akhir BW/Color langsung dari pencatatan teknisi lapangan tanpa perlu input manual.</p>
          </div>
          <button
            type="button"
            class="btn btn-warning auto-fetch-btn"
            :disabled="isFetchingMeter"
            @click="handleAutoFetchMeter"
          >
            <span v-if="isFetchingMeter" class="spinner-sm"></span>
            <span v-else>⚡ Tarik Otomatis dari Meter Reading Teknisi</span>
          </button>
        </div>

        <!-- COUNTER INPUTS -->
        <div class="counter-box full-width">
          <div class="counter-box-header">
            <span>Rincian Pembacaan Counter (Meter Reading)</span>
          </div>

          <div class="counter-inputs-grid">
            <!-- BW Section -->
            <div class="counter-col">
              <div class="counter-col-title">BLACK & WHITE (BW)</div>
              <div class="form-group">
                <label class="form-label">Counter Awal BW</label>
                <input
                  v-model.number="form.start_meter_bw"
                  type="number"
                  min="0"
                  class="form-input"
                />
              </div>
              <div class="form-group">
                <label class="form-label">Counter Akhir BW</label>
                <input
                  v-model.number="form.end_meter_bw"
                  type="number"
                  min="0"
                  class="form-input"
                />
              </div>
              <div class="counter-calc-badge">
                <span>Pemakaian Dasar BW:</span>
                <strong>{{ calcBaseUsageBW.toLocaleString() }}</strong>
              </div>
            </div>

            <!-- Color Section -->
            <div class="counter-col">
              <div class="counter-col-title color-title">COLOR (CL)</div>
              <div class="form-group">
                <label class="form-label">Counter Awal Color</label>
                <input
                  v-model.number="form.start_meter_color"
                  type="number"
                  min="0"
                  class="form-input"
                />
              </div>
              <div class="form-group">
                <label class="form-label">Counter Akhir Color</label>
                <input
                  v-model.number="form.end_meter_color"
                  type="number"
                  min="0"
                  class="form-input"
                />
              </div>
              <div class="counter-calc-badge color-calc-badge">
                <span>Pemakaian Dasar Color:</span>
                <strong>{{ calcBaseUsageColor.toLocaleString() }}</strong>
              </div>
            </div>
          </div>
        </div>

        <!-- LIVE CALCULATION SPREADSHEET CARD (EXCEL REPLICA) -->
        <div class="excel-preview-card full-width">
          <div class="excel-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="3" y1="9" x2="21" y2="9"></line>
              <line x1="9" y1="21" x2="9" y2="9"></line>
            </svg>
            <span>Preview Kalkulasi Lembar Pemakaian ({{ form.scheme_type === 'standard' ? 'Standar 100%' : `Rumus Alokasi ${form.percentage_bw}% : ${form.percentage_color}%` }})</span>
          </div>

          <table class="excel-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Counter Awal</th>
                <th>Counter Akhir</th>
                <th class="cell-highlight">Pemakaian</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>BW</strong></td>
                <td>{{ Number(form.start_meter_bw || 0).toLocaleString() }}</td>
                <td>{{ Number(form.end_meter_bw || 0).toLocaleString() }}</td>
                <td class="cell-highlight">{{ calcBaseUsageBW.toLocaleString() }}</td>
              </tr>
              <tr>
                <td><strong>COLOUR</strong></td>
                <td>{{ Number(form.start_meter_color || 0).toLocaleString() }}</td>
                <td>{{ Number(form.end_meter_color || 0).toLocaleString() }}</td>
                <td class="cell-highlight">{{ calcBaseUsageColor.toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>

          <div class="formula-breakdown">
            <template v-if="form.scheme_type !== 'standard'">
              <div class="formula-row">
                <span class="formula-label">BW :</span>
                <span class="formula-calc">
                  {{ calcBaseUsageColor.toLocaleString() }} &times; {{ form.percentage_bw }}% = <strong>{{ calcAllocatedColorToBW.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</strong> + {{ calcBaseUsageBW.toLocaleString() }} =
                </span>
                <span class="formula-result bw-res">
                  {{ calcFinalBW.toLocaleString(undefined, { minimumFractionDigits: 2 }) }} Lembar
                </span>
              </div>

              <div class="formula-row">
                <span class="formula-label">CL :</span>
                <span class="formula-calc">
                  {{ calcBaseUsageColor.toLocaleString() }} &times; {{ form.percentage_color }}% =
                </span>
                <span class="formula-result cl-res">
                  {{ calcFinalColor.toLocaleString(undefined, { minimumFractionDigits: 2 }) }} Lembar
                </span>
              </div>
            </template>
            <template v-else>
              <div class="formula-row">
                <span class="formula-label">BW :</span>
                <span class="formula-calc">
                  Pemakaian Murni =
                </span>
                <span class="formula-result bw-res">
                  {{ calcFinalBW.toLocaleString() }} Lembar
                </span>
              </div>
              <div class="formula-row">
                <span class="formula-label">CL :</span>
                <span class="formula-calc">
                  Pemakaian Murni =
                </span>
                <span class="formula-result cl-res">
                  {{ calcFinalColor.toLocaleString() }} Lembar
                </span>
              </div>
            </template>
          </div>
        </div>

        <!-- Remarks -->
        <div class="form-group full-width">
          <label class="form-label">Catatan Tambahan (Opsional)</label>
          <textarea
            v-model="form.remarks"
            rows="2"
            class="form-input"
            placeholder="Catatan pengerjaan atau kondisi mesin..."
          ></textarea>
        </div>
      </div>
    </FormModal>

    <!-- MODAL DETAIL & CETAK SLIP -->
    <FormModal
      :open="showDetailModal"
      title="Detail & Laporan Perhitungan Lembar"
      submitLabel="🖨️ Cetak Slip / Download PDF"
      maxWidth="780px"
      @close="showDetailModal = false"
      @submit="printSlip(detailItem)"
    >
      <div v-if="detailItem" class="detail-container">
        <!-- Letterhead Info -->
        <div class="detail-letterhead">
          <div class="detail-brand">PT. BIAS SURYA TEKNOLOGI</div>
          <div class="detail-subbrand">Laporan Perhitungan Pemakaian Lembar Cetak (Meter Reading)</div>
        </div>

        <div class="detail-meta-grid">
          <div>
            <span class="meta-label">Customer / Perusahaan:</span>
            <div class="meta-value font-semibold">
              {{ getCustomerName(detailItem.customer) }}
            </div>
          </div>
          <div>
            <span class="meta-label">Periode:</span>
            <div class="meta-value font-semibold">
              {{ detailItem.period_label || (detailItem.period_date ? new Date(detailItem.period_date).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : '-') }}
            </div>
          </div>
          <div>
            <span class="meta-label">Unit Mesin:</span>
            <div class="meta-value">
              {{ detailItem.unit?.model_name || detailItem.unit?.model || 'Unit' }} (SN: {{ detailItem.unit?.serial_number || '-' }})
            </div>
          </div>
          <div>
            <span class="meta-label">Skema Perhitungan:</span>
            <div class="meta-value font-medium">
              {{ detailItem.customer_type === 'standard' || Number(detailItem.percentage_bw) === 0 ? 'Standar (100% Murni)' : `Alokasi (${Number(detailItem.percentage_bw)}% BW : ${Number(detailItem.percentage_color)}% CL)` }}
            </div>
          </div>
        </div>

        <!-- Counter Summary -->
        <div class="detail-table-wrap">
          <table class="detail-table">
            <thead>
              <tr>
                <th>Tipe</th>
                <th class="text-right">Counter Awal</th>
                <th class="text-right">Counter Akhir</th>
                <th class="text-right">Pemakaian Dasar</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Black & White (BW)</strong></td>
                <td class="text-right">{{ Number(detailItem.counter_awal_bw || 0).toLocaleString() }}</td>
                <td class="text-right">{{ Number(detailItem.counter_akhir_bw || 0).toLocaleString() }}</td>
                <td class="text-right font-bold text-slate-800">{{ Number(detailItem.pemakaian_bw_dasar || 0).toLocaleString() }}</td>
              </tr>
              <tr>
                <td><strong>Color (CL)</strong></td>
                <td class="text-right">{{ Number(detailItem.counter_awal_color || 0).toLocaleString() }}</td>
                <td class="text-right">{{ Number(detailItem.counter_akhir_color || 0).toLocaleString() }}</td>
                <td class="text-right font-bold text-slate-800">{{ Number(detailItem.pemakaian_color_dasar || 0).toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Formula Breakdown -->
        <div v-if="Number(detailItem.percentage_bw) > 0" class="detail-formula-box">
          <div class="detail-formula-title">Perhitungan Alokasi Lembar ({{ Number(detailItem.percentage_bw) }}% : {{ Number(detailItem.percentage_color) }}%)</div>
          <div class="detail-formula-item">
            <div class="item-calc">
              BW: {{ Number(detailItem.pemakaian_color_dasar || 0).toLocaleString() }} &times; {{ Number(detailItem.percentage_bw) }}% = {{ Number(detailItem.allocation_bw || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }} + {{ Number(detailItem.pemakaian_bw_dasar || 0).toLocaleString() }}
            </div>
            <div class="item-total text-green-700">
              <strong>{{ Number(detailItem.total_bw || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</strong> Lembar BW
            </div>
          </div>
          <div class="detail-formula-item mt-2">
            <div class="item-calc">
              CL: {{ Number(detailItem.pemakaian_color_dasar || 0).toLocaleString() }} &times; {{ Number(detailItem.percentage_color) }}% =
            </div>
            <div class="item-total text-blue-700">
              <strong>{{ Number(detailItem.total_color || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</strong> Lembar Color
            </div>
          </div>
        </div>
        <div v-else class="detail-formula-box">
          <div class="detail-formula-title">Perhitungan Lembar Standar (100% Murni)</div>
          <div class="detail-formula-item">
            <div class="item-calc">Total Lembar BW:</div>
            <div class="item-total text-green-700"><strong>{{ Number(detailItem.total_bw || 0).toLocaleString() }}</strong> Lembar</div>
          </div>
          <div class="detail-formula-item mt-2">
            <div class="item-calc">Total Lembar Color:</div>
            <div class="item-total text-blue-700"><strong>{{ Number(detailItem.total_color || 0).toLocaleString() }}</strong> Lembar</div>
          </div>
        </div>

        <!-- Catatan -->
        <div v-if="detailItem.notes" class="detail-remarks">
          <strong>Catatan:</strong> {{ detailItem.notes }}
        </div>
      </div>
    </FormModal>

    <!-- CONFIRM DELETE DIALOG -->
    <ConfirmDialog
      v-model="showDeleteConfirm"
      title="Hapus Pencatatan Meter"
      message="Apakah Anda yakin ingin menghapus pencatatan meter ini? Data yang dihapus tidak dapat dikembalikan."
      confirmLabel="Hapus"
      type="danger"
      @confirm="handleDelete"
    />
  </div>
</template>

<style scoped>
.atlas-great-page {
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
}

/* Info Banner */
.info-card {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
}

.info-icon {
  color: #2563eb;
  flex-shrink: 0;
  margin-top: 2px;
}

.info-title {
  font-weight: 600;
  color: #1e40af;
  font-size: 0.95rem;
  margin-bottom: 0.25rem;
}

.info-desc {
  font-size: 0.875rem;
  color: #1e3a8a;
  line-height: 1.4;
}

/* Filter Bar */
.filter-container {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.tabs-group {
  display: flex;
  gap: 0.5rem;
  background: #f1f5f9;
  padding: 0.25rem;
  border-radius: 0.5rem;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.9rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #64748b;
  border-radius: 0.375rem;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn:hover {
  color: #0f172a;
}

.tab-btn.active {
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  font-weight: 600;
}

.badge-count {
  font-size: 0.75rem;
  background: #e2e8f0;
  color: #475569;
  padding: 0.1rem 0.45rem;
  border-radius: 9999px;
}

.tab-btn.active .badge-count {
  background: #dbeafe;
  color: #1d4ed8;
}

.filter-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.filter-label {
  font-size: 0.8125rem;
  color: #64748b;
  font-weight: 500;
}

.filter-select {
  padding: 0.4rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.375rem;
  background: #ffffff;
  color: #1e293b;
  outline: none;
}

.filter-input {
  padding: 0.4rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.375rem;
  width: 220px;
}

/* Table Card */
.table-card {
  background: #ffffff;
  border-radius: 0.75rem;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.table-card :deep(.data-table) {
  min-width: 1250px;
}

.table-card :deep(.table-scroll) {
  max-height: calc(100vh - 350px);
  min-height: 250px;
}

/* Badges */
.badge-type {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 0.375rem;
}

.badge-atlas {
  background: #e0e7ff;
  color: #3730a3;
}

.badge-standard {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
}

.badge-mini {
  display: inline-block;
  padding: 0.1rem 0.35rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.badge-yellow {
  background: #fef08a;
  color: #854d0e;
}

.badge-total {
  font-size: 0.8125rem;
  padding: 0.25rem 0.6rem;
  border-radius: 0.375rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 500;
}

.badge-bw {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}

.badge-bw strong {
  font-size: 0.9375rem;
}

.badge-color {
  background: #eff6ff;
  color: #1e40af;
  border: 1px solid #bfdbfe;
}

.badge-color strong {
  font-size: 0.9375rem;
}

/* Action Buttons */
.action-btns {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.btn-icon {
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  padding: 0.35rem;
  cursor: pointer;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.btn-icon:hover {
  background: #f8fafc;
  color: #0f172a;
}

.btn-icon-print:hover {
  background: #f0fdf4;
  color: #16a34a;
  border-color: #bbf7d0;
}

.btn-icon-edit:hover {
  background: #eff6ff;
  color: #2563eb;
  border-color: #bfdbfe;
}

.btn-icon-delete:hover {
  background: #fef2f2;
  color: #dc2626;
  border-color: #fecaca;
}

/* Form Styles */
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.full-width {
  grid-column: span 2;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.form-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #334155;
}

.form-label.required::after {
  content: " *";
  color: #ef4444;
}

.form-input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  color: #1e293b;
  outline: none;
}

.form-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px #3b82f6;
}

/* Scheme Radio Group */
.scheme-radio-group {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}

.scheme-radio-card {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.75rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s ease;
  background: #ffffff;
}

.scheme-radio-card:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.scheme-radio-card.selected {
  border-color: #3b82f6;
  background: #eff6ff;
}

.scheme-radio-card input[type="radio"] {
  margin-top: 3px;
}

.scheme-title {
  font-weight: 600;
  font-size: 0.875rem;
  color: #0f172a;
}

.scheme-desc {
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 2px;
  line-height: 1.3;
}

/* Custom Percentage Box */
.custom-pct-box {
  display: flex;
  gap: 1.5rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  padding: 0.875rem 1rem;
}

.pct-input-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.pct-input-group {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.pct-input-group .form-input {
  width: 80px;
  text-align: center;
}

.pct-symbol {
  font-weight: bold;
  color: #64748b;
}

/* Auto Fetch Banner */
.auto-fetch-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  background: #fffbeb;
  border: 1.5px dashed #f59e0b;
  border-radius: 0.5rem;
  padding: 0.875rem 1rem;
}

.auto-fetch-text strong {
  font-size: 0.875rem;
  color: #92400e;
  display: block;
}

.auto-fetch-text p {
  font-size: 0.75rem;
  color: #b45309;
  margin: 2px 0 0 0;
}

.auto-fetch-btn {
  font-size: 0.8125rem;
  font-weight: 600;
  padding: 0.5rem 0.875rem;
  background: #f59e0b;
  color: #ffffff;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
}

.auto-fetch-btn:hover {
  background: #d97706;
}

/* Counter Box */
.counter-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  padding: 1rem;
}

.counter-box-header {
  font-size: 0.875rem;
  font-weight: 600;
  color: #334155;
  margin-bottom: 0.75rem;
}

.counter-inputs-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.counter-col {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 0.375rem;
  padding: 0.875rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.counter-col-title {
  font-size: 0.8125rem;
  font-weight: 700;
  color: #1e293b;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 0.35rem;
}

.color-title {
  color: #2563eb;
}

.counter-calc-badge {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f1f5f9;
  padding: 0.4rem 0.6rem;
  border-radius: 0.25rem;
  font-size: 0.8125rem;
  color: #475569;
}

.counter-calc-badge strong {
  color: #0f172a;
}

.color-calc-badge {
  background: #eff6ff;
  color: #1e40af;
}

/* Excel Replica Preview Card */
.excel-preview-card {
  background: #ffffff;
  border: 2px solid #22c55e;
  border-radius: 0.5rem;
  padding: 1rem;
  box-shadow: 0 1px 3px rgba(34, 197, 94, 0.1);
}

.excel-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #15803d;
  margin-bottom: 0.75rem;
}

.excel-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
  margin-bottom: 0.75rem;
}

.excel-table th, .excel-table td {
  border: 1px solid #cbd5e1;
  padding: 0.5rem 0.75rem;
  text-align: left;
}

.excel-table th {
  background: #f8fafc;
  color: #475569;
}

.cell-highlight {
  background-color: #fef08a !important;
  font-weight: 700;
  color: #854d0e;
}

.formula-breakdown {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 0.375rem;
  padding: 0.75rem 1rem;
}

.formula-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.formula-label {
  font-weight: 700;
  color: #166534;
  min-width: 32px;
}

.formula-calc {
  color: #374151;
}

.formula-result {
  font-weight: 700;
  padding: 0.2rem 0.5rem;
  border-radius: 0.25rem;
}

.bw-res {
  background: #dcfce7;
  color: #15803d;
}

.cl-res {
  background: #fef08a;
  color: #854d0e;
}

/* Detail Modal Styles */
.detail-container {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.detail-letterhead {
  text-align: center;
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 0.75rem;
}

.detail-brand {
  font-size: 1.25rem;
  font-weight: 800;
  color: #0f172a;
}

.detail-subbrand {
  font-size: 0.875rem;
  color: #64748b;
  margin-top: 2px;
}

.detail-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  background: #f8fafc;
  padding: 0.875rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
}

.meta-label {
  display: block;
  font-size: 0.75rem;
  color: #64748b;
}

.meta-value {
  color: #1e293b;
}

.detail-table-wrap {
  overflow-x: auto;
}

.detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.detail-table th, .detail-table td {
  border: 1px solid #e2e8f0;
  padding: 0.6rem 0.75rem;
}

.detail-table th {
  background: #f1f5f9;
  font-weight: 600;
  color: #475569;
}

.detail-formula-box {
  background: #f0fdf4;
  border: 1px solid #86efac;
  border-radius: 0.5rem;
  padding: 1rem;
}

.detail-formula-title {
  font-size: 0.875rem;
  font-weight: 700;
  color: #166534;
  margin-bottom: 0.5rem;
}

.detail-formula-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.875rem;
}

.item-total {
  font-size: 1rem;
}

.detail-remarks {
  font-size: 0.8125rem;
  color: #475569;
  background: #f8fafc;
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
}

.spinner-sm {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Cutoff Notice Card Khusus Atlas & Great */
.cutoff-notice-card {
  background: #f0fdf4;
  border: 1.5px solid #86efac;
  border-radius: 0.5rem;
  padding: 0.875rem 1rem;
  color: #166534;
}

.cutoff-notice-card.warning-mode {
  background: #fffbeb;
  border-color: #fcd34d;
  color: #92400e;
}

.notice-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  margin-bottom: 0.35rem;
}

.notice-body {
  font-size: 0.8125rem;
  line-height: 1.4;
}

.notice-override {
  margin-top: 0.65rem;
  padding-top: 0.65rem;
  border-top: 1px dashed #f59e0b;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.today-tag {
  font-size: 0.75rem;
  font-weight: 600;
  color: #b45309;
}

.override-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  cursor: pointer;
  color: #78350f;
  font-weight: 500;
}
</style>
