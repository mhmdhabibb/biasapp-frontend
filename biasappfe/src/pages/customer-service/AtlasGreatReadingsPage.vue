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
import { useAuth } from '@/composables/useAuth'
import type { TableColumn } from '@/types'

const toast = useToast()
const master = useMasterStore()
const resourceStore = useResourcesStore()
const { currentUser } = useAuth()

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
const detailTab = ref<'formula' | 'epson'>('formula')
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
  gross_meter_bw: 0,
  gross_meter_color: 0,
  a3_meter_bw: 0,
  a3_meter_color: 0,
  percentage_bw: 88,
  percentage_color: 12,
  remarks: '',
})


function onGrossOrA3Change() {
  if (form.gross_meter_bw > 0 || form.a3_meter_bw > 0) {
    form.end_meter_bw = Math.max(0, Number(form.gross_meter_bw || 0) - Number(form.a3_meter_bw || 0))
  }
  if (form.gross_meter_color > 0 || form.a3_meter_color > 0) {
    form.end_meter_color = Math.max(0, Number(form.gross_meter_color || 0) - Number(form.a3_meter_color || 0))
  }
}

// --- Live Calculations ---
const calcBaseUsageBW = computed(() => {
  const start = Number(form.start_meter_bw || 0)
  const end = Number(form.end_meter_bw || 0)
  if (end <= start) return 0
  return end - start
})

const calcBaseUsageColor = computed(() => {
  const start = Number(form.start_meter_color || 0)
  const end = Number(form.end_meter_color || 0)
  if (end <= start) return 0
  return end - start
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
  const fetchPromises: Promise<any>[] = [fetchReadings()]
  if (!customers.value || customers.value.length === 0) {
    fetchPromises.push(resourceStore.fetchAll('customers', { per_page: 500 }, false))
  }
  if (!units.value || units.value.length === 0) {
    fetchPromises.push(resourceStore.fetchAll('units', { per_page: 500 }, false))
  }
  await Promise.all(fetchPromises)
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
      month: form.period_month || undefined,
      year: form.period_year || undefined,
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

// Otomatis tarik meter saat periode bulan / tahun diubah ketika form sedang terbuka
watch([() => form.period_month, () => form.period_year], async () => {
  if (form.unit_id && !isEditing.value && showModal.value) {
    await handleAutoFetchMeter()
  }
})

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
  form.gross_meter_bw = 0
  form.gross_meter_color = 0
  form.a3_meter_bw = 0
  form.a3_meter_color = 0
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
  form.gross_meter_bw = Number(item.gross_counter_bw || 0)
  form.gross_meter_color = Number(item.gross_counter_color || 0)
  form.a3_meter_bw = Number(item.a3_counter_bw || 0)
  form.a3_meter_color = Number(item.a3_counter_color || 0)

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
      gross_counter_bw: Number(form.gross_meter_bw || 0),
      gross_counter_color: Number(form.gross_meter_color || 0),
      a3_counter_bw: Number(form.a3_meter_bw || 0),
      a3_counter_color: Number(form.a3_meter_color || 0),
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
  detailTab.value = 'formula'
  showDetailModal.value = true
}

function printSlip(item: any) {
  const printWindow = window.open('', '_blank', 'width=980,height=800')
  if (!printWindow) {
    toast.error('Pop-up browser diblokir. Harap izinkan pop-up untuk mencetak.')
    return
  }

  const custName = getCustomerName(item.customer)
  const unitModel = item.unit?.model_name || item.unit?.model || 'WF-C878R'
  const unitSN = item.unit?.serial_number || item.unit?.serial_no || '-'
  const branchLoc = item.customer?.address || '20242 (Cab.Batam)'
  const periodStr = item.period_label || (item.period_date ? new Date(item.period_date).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : '-')

  const bwA3 = Number(item.a3_counter_bw || 0)
  const colA3 = Number(item.a3_counter_color || 0)
  const bwGross = Number(item.gross_counter_bw || (Number(item.counter_akhir_bw || 0) + bwA3))
  const colGross = Number(item.gross_counter_color || (Number(item.counter_akhir_color || 0) + colA3))
  const bwAkhir = Number(item.counter_akhir_bw || (bwGross - bwA3))
  const colAkhir = Number(item.counter_akhir_color || (colGross - colA3))
  const totalPages = bwGross + colGross

  const bwAwal = Number(item.counter_awal_bw || 0)
  const colAwal = Number(item.counter_awal_color || 0)
  const bwPemakaian = Number(item.pemakaian_bw_dasar ?? Math.max(0, bwAkhir - bwAwal))
  const colPemakaian = Number(item.pemakaian_color_dasar ?? Math.max(0, colAkhir - colAwal))

  const printDateStr = item.period_date
    ? new Date(item.period_date).toLocaleDateString('en-GB') + ' 00:00:00'
    : '30/03/2023 00:00:00'
  const signerName = currentUser.value?.name || currentUser.value?.username || 'Tim Accounting'

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Printer Usage Report - ${unitModel} (${custName})</title>
  <style>
    @page { size: A4 portrait; margin: 10mm 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1f2937;
      margin: 0;
      padding: 0;
      background: #ffffff;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .epson-header {
      background: #1e1e1e !important;
      color: #ffffff;
      padding: 16px 20px 10px 20px;
      border-radius: 4px 4px 0 0;
    }
    .epson-header-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .epson-title-left {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .epson-model {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #ffffff;
    }
    .epson-meta-row {
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 11px;
      color: #cbd5e1;
      margin-top: 2px;
    }
    .meta-chip {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .epson-status-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .status-pill {
      background: rgba(255,255,255,0.12);
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 10px;
      color: #e2e8f0;
      font-family: monospace;
    }
    .status-ready {
      background: #15803d !important;
      color: #ffffff;
      font-weight: bold;
    }

    .epson-tabs {
      display: flex;
      gap: 22px;
      border-top: 1px solid #334155;
      padding-top: 8px;
      font-size: 11px;
      color: #94a3b8;
    }
    .epson-tab {
      padding-bottom: 4px;
      cursor: default;
    }
    .epson-tab.active {
      color: #ffffff;
      font-weight: 700;
      border-bottom: 2px solid #38bdf8;
    }

    .epson-body {
      padding: 20px 20px 10px 20px;
    }
    .epson-section-title {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 2px;
    }
    .epson-first-print {
      font-size: 11px;
      color: #64748b;
      margin-bottom: 18px;
    }
    .first-date {
      color: #0f172a;
      font-weight: 600;
      margin-left: 8px;
    }

    .epson-cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    .metric-card {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 14px 16px;
      background: #f8fafc;
    }
    .metric-label {
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .metric-val-wrap {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .metric-icon {
      font-size: 20px;
    }
    .metric-val {
      font-size: 24px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.5px;
    }

    .table-title {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 8px;
    }
    .epson-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-bottom: 20px;
    }
    .epson-table th {
      border-bottom: 1.5px solid #cbd5e1;
      padding: 8px 10px;
      color: #475569;
      font-weight: 700;
      text-align: right;
    }
    .epson-table th:first-child {
      text-align: left;
    }
    .epson-table td {
      border-bottom: 1px solid #f1f5f9;
      padding: 7px 10px;
      text-align: right;
      color: #334155;
    }
    .epson-table td:first-child {
      text-align: left;
      font-weight: 500;
      color: #0f172a;
    }
    .row-highlight {
      background: #f8fafc;
      font-weight: 700;
    }
    .row-highlight td {
      color: #0f172a;
      font-weight: 700;
    }

    .audit-box {
      border: 1px dashed #94a3b8;
      border-radius: 6px;
      background: #f8fafc;
      padding: 10px 14px;
      font-size: 11px;
      margin-top: 15px;
      line-height: 1.5;
    }
    .audit-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 6px;
    }
    .audit-note {
      color: #1e40af;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 4px;
      padding: 6px 10px;
      margin-top: 6px;
      font-size: 10.5px;
    }

    .signatures-row {
      display: flex;
      justify-content: space-between;
      margin-top: 25px;
      page-break-inside: avoid;
    }
    .sig-col {
      width: 45%;
      text-align: center;
      font-size: 11px;
    }
    .sig-line {
      height: 55px;
      border-bottom: 1px solid #334155;
      margin-bottom: 4px;
    }
  
/* Epson Device Usage Report Modal Styles */
.epson-modal-wrapper {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  background: #ffffff;
}

.epson-dark-header {
  background: #1e1e1e;
  color: #ffffff;
  padding: 16px 20px 0 20px;
}

.epson-header-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.epson-machine-model {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: #ffffff;
}

.epson-meta-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #94a3b8;
  margin-top: 4px;
}

.epson-meta-line strong {
  color: #e2e8f0;
}

.meta-sep {
  color: #64748b;
}

.epson-status-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.epson-ip-badge {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: monospace;
  color: #cbd5e1;
}

.epson-ready-badge {
  background: #15803d;
  color: #ffffff;
  font-weight: 700;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
}

.epson-tab-bar {
  display: flex;
  gap: 16px;
  border-top: 1px solid #334155;
  padding-top: 8px;
  font-size: 11px;
  color: #94a3b8;
  overflow-x: auto;
}

.epson-tab-bar .tab-item {
  padding-bottom: 6px;
  cursor: pointer;
  white-space: nowrap;
}

.epson-tab-bar .tab-item.active {
  color: #ffffff;
  font-weight: 700;
  border-bottom: 2px solid #38bdf8;
}

.epson-body-content {
  padding: 18px 20px;
}

.epson-title-row {
  margin-bottom: 14px;
}

.epson-main-heading {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.epson-first-time {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}

.epson-metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 18px;
}

.epson-metric-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 12px 14px;
}

.metric-title {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 6px;
}

.metric-value-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.metric-icon {
  font-size: 18px;
}

.metric-num {
  font-size: 20px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.5px;
}

.epson-table-header-title {
  font-size: 12.5px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 6px;
}

.epson-table-container {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 14px;
}

.epson-device-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.epson-device-table th {
  background: #f1f5f9;
  padding: 8px 10px;
  font-weight: 700;
  color: #475569;
  border-bottom: 1px solid #cbd5e1;
}

.epson-device-table td {
  padding: 6px 10px;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
}

.epson-device-table tr.highlight-row {
  background: #f8fafc;
}

.epson-usage-strip {
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 11px;
}

.usage-strip-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 6px;
}

.usage-strip-note {
  font-size: 10.5px;
  color: #1e40af;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 4px;
  padding: 6px 8px;
}


.detail-nav-pills {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 8px;
}

.nav-pill-btn {
  flex: 1;
  padding: 8px 14px;
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-pill-btn.active {
  background: #ffffff;
  color: #1e40af;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

</style>
</head>
<body>
  <div class="epson-header">
    <div class="epson-header-top">
      <div class="epson-title-left">
        <div class="epson-model">${unitModel}</div>
        <div class="epson-meta-row">
          <div class="meta-chip">
            <span>SN: <strong>${unitSN}</strong></span>
          </div>
          <div class="meta-chip">
            <span>Customer: <strong>${custName}</strong></span>
          </div>
          <div class="meta-chip">
            <span>Lokasi: <strong>${branchLoc}</strong></span>
          </div>
        </div>
      </div>
      <div class="epson-status-right">
        <span class="status-pill">10.0.0.1</span>
        <span class="status-pill status-ready">Ready</span>
      </div>
    </div>

    <div class="epson-tabs">
      <div class="epson-tab">Status</div>
      <div class="epson-tab">Settings</div>
      <div class="epson-tab active">
        <span>📊 Usage</span>
      </div>
      <div class="epson-tab">Remote Operation</div>
      <div class="epson-tab">Extended Service Information</div>
    </div>
  </div>

  <div class="epson-body">
    <div class="epson-section-title">Printing</div>
    <div class="epson-first-print">
      First Time Printing: <span class="first-date">${printDateStr}</span>
    </div>

    <div class="epson-cards">
      <div class="metric-card">
        <div class="metric-label">Total Number of Pages</div>
        <div class="metric-val-wrap">
          <div class="metric-icon">📑</div>
          <div class="metric-val">${totalPages.toLocaleString('id-ID')}</div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Total Number of B&amp;W Pages</div>
        <div class="metric-val-wrap">
          <div class="metric-icon">📄</div>
          <div class="metric-val">${bwAkhir.toLocaleString('id-ID')}</div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Total Number of Color Pages</div>
        <div class="metric-val-wrap">
          <div class="metric-icon" style="color: #2563eb;">🎨</div>
          <div class="metric-val">${colAkhir.toLocaleString('id-ID')}</div>
        </div>
      </div>
    </div>

    <div class="table-title">Sorted by Paper Size</div>
    <table class="epson-table">
      <thead>
        <tr>
          <th>Paper Size</th>
          <th>1-Sided B&amp;W</th>
          <th>1-Sided Color</th>
          <th>2-Sided B&amp;W</th>
          <th>2-Sided Color</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>A3/Ledger</td>
          <td>0</td>
          <td>0</td>
          <td>0</td>
          <td>0</td>
        </tr>
        <tr class="row-highlight">
          <td><strong>A4/Letter</strong></td>
          <td>${bwAkhir.toLocaleString('id-ID')}</td>
          <td>${colAkhir.toLocaleString('id-ID')}</td>
          <td>0</td>
          <td>0</td>
        </tr>
        <tr>
          <td>A5</td>
          <td>0</td>
          <td>0</td>
          <td>0</td>
          <td>0</td>
        </tr>
        <tr>
          <td>A6</td>
          <td>0</td>
          <td>0</td>
          <td>0</td>
          <td>0</td>
        </tr>
        <tr>
          <td>B4/Legal</td>
          <td>0</td>
          <td>0</td>
          <td>0</td>
          <td>0</td>
        </tr>
        <tr>
          <td>B5</td>
          <td>0</td>
          <td>0</td>
          <td>0</td>
          <td>0</td>
        </tr>
        <tr>
          <td>Envelope</td>
          <td>0</td>
          <td>0</td>
          <td>0</td>
          <td>0</td>
        </tr>
        <tr>
          <td>Other</td>
          <td>0</td>
          <td>0</td>
          <td>0</td>
          <td>0</td>
        </tr>
      </tbody>
    </table>

    <div class="audit-note" style="margin-top: 15px; background: #f8fafc; border: 1px dashed #94a3b8; border-radius: 6px; padding: 10px 14px; font-size: 11px; font-family: monospace; line-height: 1.6;">
      <strong>Note :</strong><br>
      Last Meter B&amp;W (dari admin Emas) -<br>
      &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;B&amp;W&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Colour<br>
      Total Mesin : ${bwGross.toLocaleString('en-US')}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${colGross.toLocaleString('en-US')}<br>
      Deduksi A3&nbsp;&nbsp;: ${bwA3.toLocaleString('en-US')}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${colA3.toLocaleString('en-US')} (-)<br>
      Last Meter&nbsp;&nbsp;: <strong>${bwAkhir.toLocaleString('en-US')}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${colAkhir.toLocaleString('en-US')}</strong>
    </div>

    <div class="signatures-row" style="display: flex; justify-content: space-between; margin-top: 45px; page-break-inside: avoid;">
      <div class="sig-col" style="width: 42%; text-align: center; font-size: 11px;">
        <div style="font-weight: 600; color: #475569; margin-bottom: 55px;">Diterima &amp; Diverifikasi Oleh:</div>
        <div class="sig-line" style="border-bottom: 1.5px solid #334155; margin-bottom: 5px;"></div>
        <div style="font-weight: 700; color: #0f172a;">${custName}</div>
        <div style="font-size: 10px; color: #64748b;">Customer</div>
      </div>
      <div class="sig-col" style="width: 42%; text-align: center; font-size: 11px;">
        <div style="font-weight: 600; color: #475569; margin-bottom: 55px;">Dicetak &amp; Dibuat Oleh (Accounting):</div>
        <div class="sig-line" style="border-bottom: 1.5px solid #334155; margin-bottom: 5px;"></div>
        <div style="font-weight: 700; color: #0f172a;">${signerName}</div>
        <div style="font-size: 10px; color: #64748b;">Admin Finance / Accounting</div>
      </div>
    </div>

  </div>

  <script>
    window.onload = function() {
      window.print();
    };
  <\/script>
</body>
</html>`

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
        maxHeight="calc(100vh - 400px)"
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
                <label class="form-label">Counter Mesin Total (Gross BW)</label>
                <input
                  v-model.number="form.gross_meter_bw"
                  type="number"
                  min="0"
                  class="form-input"
                  placeholder="Contoh: 16311"
                  @input="onGrossOrA3Change"
                />
              </div>
              <div class="form-group">
                <label class="form-label">Deduksi Ukuran A3 B&amp;W (-)</label>
                <input
                  v-model.number="form.a3_meter_bw"
                  type="number"
                  min="0"
                  class="form-input"
                  placeholder="Contoh: 7"
                  @input="onGrossOrA3Change"
                />
              </div>
              <div class="form-group">
                <label class="form-label">Counter Akhir / Last Meter BW</label>
                <input
                  v-model.number="form.end_meter_bw"
                  type="number"
                  min="0"
                  class="form-input"
                  style="font-weight: 700; color: #1e3a8a;"
                />
                <small v-if="form.gross_meter_bw > 0" class="text-muted" style="font-size: 11px;">
                  = Total {{ form.gross_meter_bw }} - A3 {{ form.a3_meter_bw }}
                </small>
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
                <label class="form-label">Counter Mesin Total (Gross Color)</label>
                <input
                  v-model.number="form.gross_meter_color"
                  type="number"
                  min="0"
                  class="form-input"
                  placeholder="Contoh: 16458"
                  @input="onGrossOrA3Change"
                />
              </div>
              <div class="form-group">
                <label class="form-label">Deduksi Ukuran A3 Color (-)</label>
                <input
                  v-model.number="form.a3_meter_color"
                  type="number"
                  min="0"
                  class="form-input"
                  placeholder="Contoh: 15"
                  @input="onGrossOrA3Change"
                />
              </div>
              <div class="form-group">
                <label class="form-label">Counter Akhir / Last Meter Color</label>
                <input
                  v-model.number="form.end_meter_color"
                  type="number"
                  min="0"
                  class="form-input"
                  style="font-weight: 700; color: #1e3a8a;"
                />
                <small v-if="form.gross_meter_color > 0" class="text-muted" style="font-size: 11px;">
                  = Total {{ form.gross_meter_color }} - A3 {{ form.a3_meter_color }}
                </small>
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

          <div
            v-if="(Number(form.start_meter_bw) > 0 && Number(form.start_meter_bw) === Number(form.end_meter_bw)) || (Number(form.start_meter_color) > 0 && Number(form.start_meter_color) === Number(form.end_meter_color))"
            class="counter-warning-hint"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span>Counter Awal &amp; Counter Akhir bernilai sama (Pemakaian = 0). Masukkan Counter Akhir dari pencatatan fisik terbaru teknisi.</span>
          </div>

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
      title="Detail Pencatatan & Laporan Mesin"
      submitLabel="🖨️ Cetak Slip / Download PDF"
      maxWidth="840px"
      @close="showDetailModal = false"
      @submit="printSlip(detailItem)"
    >
      <div v-if="detailItem">
        <!-- Tab Selector: Rumus Pencatatan vs Output Mesin Epson -->
        <div class="detail-nav-pills">
          <button
            type="button"
            class="nav-pill-btn"
            :class="{ active: detailTab === 'formula' }"
            @click="detailTab = 'formula'"
          >
            📋 Detail Pencatatan &amp; Rumus Alokasi
          </button>
          <button
            type="button"
            class="nav-pill-btn"
            :class="{ active: detailTab === 'epson' }"
            @click="detailTab = 'epson'"
          >
            🖨️ Format Output Mesin (Epson)
          </button>
        </div>

        <!-- VIEW 1: PENCATATAN ATLAS & GREAT BESERTA RUMUSNYA -->
        <div v-if="detailTab === 'formula'" class="detail-container">
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
                {{ detailItem.unit?.model_name || detailItem.unit?.model || 'Unit' }} (SN: {{ detailItem.unit?.serial_number || detailItem.unit?.serial_no || '-' }})
              </div>
            </div>
            <div>
              <span class="meta-label">Skema Perhitungan:</span>
              <div class="meta-value font-medium">
                {{ detailItem.customer_type === 'standard' || Number(detailItem.percentage_bw) === 0 ? 'Standar (100% Murni)' : `Alokasi (${Number(detailItem.percentage_bw || 88)}% BW : ${Number(detailItem.percentage_color || 12)}% CL)` }}
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
                  <td><strong>Black &amp; White (BW)</strong></td>
                  <td class="text-right">{{ Number(detailItem.counter_awal_bw || 0).toLocaleString('id-ID') }}</td>
                  <td class="text-right">{{ Number(detailItem.counter_akhir_bw || 0).toLocaleString('id-ID') }}</td>
                  <td class="text-right font-bold text-slate-800">{{ Number(detailItem.pemakaian_bw_dasar || 0).toLocaleString('id-ID') }}</td>
                </tr>
                <tr>
                  <td><strong>Color (CL)</strong></td>
                  <td class="text-right">{{ Number(detailItem.counter_awal_color || 0).toLocaleString('id-ID') }}</td>
                  <td class="text-right">{{ Number(detailItem.counter_akhir_color || 0).toLocaleString('id-ID') }}</td>
                  <td class="text-right font-bold text-slate-800">{{ Number(detailItem.pemakaian_color_dasar || 0).toLocaleString('id-ID') }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Formula Breakdown (Rumus Alokasi 88% : 12%) -->
          <div v-if="Number(detailItem.percentage_bw || (detailItem.customer_type === 'atlas' || detailItem.customer_type === 'great' ? 88 : 0)) > 0" class="detail-formula-box">
            <div class="detail-formula-title">Perhitungan Alokasi Lembar ({{ Number(detailItem.percentage_bw || 88) }}% : {{ Number(detailItem.percentage_color || 12) }}%)</div>
            <div class="detail-formula-item">
              <div class="item-calc">
                <strong>BW:</strong> {{ Number(detailItem.pemakaian_color_dasar || 0).toLocaleString('id-ID') }} &times; {{ Number(detailItem.percentage_bw || 88) }}% = {{ Number(detailItem.allocation_bw || (Number(detailItem.pemakaian_color_dasar || 0) * 0.88)).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }} + {{ Number(detailItem.pemakaian_bw_dasar || 0).toLocaleString('id-ID') }}
              </div>
              <div class="item-total text-green-700">
                <strong>{{ Number(detailItem.total_bw || (Number(detailItem.pemakaian_bw_dasar || 0) + (Number(detailItem.pemakaian_color_dasar || 0) * 0.88))).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</strong> Lembar BW
              </div>
            </div>
            <div class="detail-formula-item mt-2">
              <div class="item-calc">
                <strong>CL:</strong> {{ Number(detailItem.pemakaian_color_dasar || 0).toLocaleString('id-ID') }} &times; {{ Number(detailItem.percentage_color || 12) }}% =
              </div>
              <div class="item-total text-blue-700">
                <strong>{{ Number(detailItem.total_color || (Number(detailItem.pemakaian_color_dasar || 0) * 0.12)).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</strong> Lembar Color
              </div>
            </div>
          </div>
          <div v-else class="detail-formula-box">
            <div class="detail-formula-title">Perhitungan Lembar Standar (100% Murni)</div>
            <div class="detail-formula-item">
              <div class="item-calc">Total Lembar BW:</div>
              <div class="item-total text-green-700"><strong>{{ Number(detailItem.total_bw || detailItem.pemakaian_bw_dasar || 0).toLocaleString('id-ID') }}</strong> Lembar</div>
            </div>
            <div class="detail-formula-item mt-2">
              <div class="item-calc">Total Lembar Color:</div>
              <div class="item-total text-blue-700"><strong>{{ Number(detailItem.total_color || detailItem.pemakaian_color_dasar || 0).toLocaleString('id-ID') }}</strong> Lembar</div>
            </div>
          </div>

          <!-- Catatan -->
          <div v-if="detailItem.notes" class="detail-remarks mt-3">
            <strong>Catatan:</strong> {{ detailItem.notes }}
          </div>
        </div>

        <!-- VIEW 2: FORMAT OUTPUT MESIN EPSON -->
        <div v-else class="epson-modal-wrapper">
          <!-- Dark Top Bar Header -->
          <div class="epson-dark-header">
            <div class="epson-header-top">
              <div class="epson-info-left">
                <div class="epson-machine-model">{{ detailItem.unit?.model_name || detailItem.unit?.model || 'WF-C878R' }}</div>
                <div class="epson-meta-line">
                  <span class="meta-tag">SN: <strong>{{ detailItem.unit?.serial_number || detailItem.unit?.serial_no || '-' }}</strong></span>
                  <span class="meta-sep">&bull;</span>
                  <span class="meta-tag">Customer: <strong>{{ getCustomerName(detailItem.customer) }}</strong></span>
                  <span class="meta-sep">&bull;</span>
                  <span class="meta-tag">Lokasi: <strong>{{ detailItem.customer?.address || '20242 (Cab.Batam)' }}</strong></span>
                </div>
              </div>
              <div class="epson-status-right">
                <span class="epson-ip-badge">10.0.0.1</span>
                <span class="epson-ready-badge">Ready</span>
              </div>
            </div>

            <!-- Navigation Tabs Bar -->
            <div class="epson-tab-bar">
              <span class="tab-item">Status</span>
              <span class="tab-item">Settings</span>
              <span class="tab-item active">📊 Usage</span>
              <span class="tab-item">Remote Operation</span>
              <span class="tab-item">Extended Service Information</span>
            </div>
          </div>

          <!-- Report Body -->
          <div class="epson-body-content">
            <div class="epson-title-row">
              <div class="epson-main-heading">Printing</div>
              <div class="epson-first-time">
                First Time Printing:
                <span class="font-medium text-slate-800">
                  {{ detailItem.period_date ? new Date(detailItem.period_date).toLocaleDateString('en-GB') + ' 00:00:00' : '30/03/2023 00:00:00' }}
                </span>
              </div>
            </div>

            <!-- 3 Big Metric Cards -->
            <div class="epson-metrics-grid">
              <div class="epson-metric-box">
                <div class="metric-title">Total Number of Pages</div>
                <div class="metric-value-row">
                  <span class="metric-icon">📑</span>
                  <span class="metric-num">{{ ((Number(detailItem.gross_counter_bw || (Number(detailItem.counter_akhir_bw || 0) + Number(detailItem.a3_counter_bw || 0)))) + (Number(detailItem.gross_counter_color || (Number(detailItem.counter_akhir_color || 0) + Number(detailItem.a3_counter_color || 0))))).toLocaleString('id-ID') }}</span>
                </div>
              </div>

              <div class="epson-metric-box">
                <div class="metric-title">Total Number of B&amp;W Pages</div>
                <div class="metric-value-row">
                  <span class="metric-icon">📄</span>
                  <span class="metric-num">{{ (Number(detailItem.gross_counter_bw || (Number(detailItem.counter_akhir_bw || 0) + Number(detailItem.a3_counter_bw || 0)))).toLocaleString('id-ID') }}</span>
                </div>
              </div>

              <div class="epson-metric-box">
                <div class="metric-title">Total Number of Color Pages</div>
                <div class="metric-value-row">
                  <span class="metric-icon" style="color: #2563eb;">🎨</span>
                  <span class="metric-num">{{ (Number(detailItem.gross_counter_color || (Number(detailItem.counter_akhir_color || 0) + Number(detailItem.a3_counter_color || 0)))).toLocaleString('id-ID') }}</span>
                </div>
              </div>
            </div>

            <!-- Sorted by Paper Size Table -->
            <div class="epson-table-header-title">Sorted by Paper Size</div>
            <div class="epson-table-container">
              <table class="epson-device-table">
                <thead>
                  <tr>
                    <th class="text-left">Paper Size</th>
                    <th class="text-right">1-Sided B&amp;W</th>
                    <th class="text-right">1-Sided Color</th>
                    <th class="text-right">2-Sided B&amp;W</th>
                    <th class="text-right">2-Sided Color</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="font-medium">A3/Ledger</td>
                    <td class="text-right font-semibold">{{ Number(detailItem.a3_counter_bw || 0).toLocaleString('id-ID') }}</td>
                    <td class="text-right font-semibold text-blue-700">{{ Number(detailItem.a3_counter_color || 0).toLocaleString('id-ID') }}</td>
                    <td class="text-right">0</td>
                    <td class="text-right">0</td>
                  </tr>
                  <tr class="highlight-row">
                    <td class="font-bold text-slate-900">A4/Letter</td>
                    <td class="text-right font-bold text-slate-900">{{ Number(detailItem.counter_akhir_bw || 0).toLocaleString('id-ID') }}</td>
                    <td class="text-right font-bold text-blue-700">{{ Number(detailItem.counter_akhir_color || 0).toLocaleString('id-ID') }}</td>
                    <td class="text-right">0</td>
                    <td class="text-right">0</td>
                  </tr>
                  <tr>
                    <td>A5</td>
                    <td class="text-right">0</td>
                    <td class="text-right">0</td>
                    <td class="text-right">0</td>
                    <td class="text-right">0</td>
                  </tr>
                  <tr>
                    <td>A6</td>
                    <td class="text-right">0</td>
                    <td class="text-right">0</td>
                    <td class="text-right">0</td>
                    <td class="text-right">0</td>
                  </tr>
                  <tr>
                    <td>B4/Legal</td>
                    <td class="text-right">0</td>
                    <td class="text-right">0</td>
                    <td class="text-right">0</td>
                    <td class="text-right">0</td>
                  </tr>
                  <tr>
                    <td>B5</td>
                    <td class="text-right">0</td>
                    <td class="text-right">0</td>
                    <td class="text-right">0</td>
                    <td class="text-right">0</td>
                  </tr>
                  <tr>
                    <td>Envelope</td>
                    <td class="text-right">0</td>
                    <td class="text-right">0</td>
                    <td class="text-right">0</td>
                    <td class="text-right">0</td>
                  </tr>
                  <tr>
                    <td>Other</td>
                    <td class="text-right">0</td>
                    <td class="text-right">0</td>
                    <td class="text-right">0</td>
                    <td class="text-right">0</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Note Perhitungan Deduksi A3 (Admin Emas) -->
            <div style="margin: 16px 20px 0 20px; background: #f8fafc; border: 1px dashed #94a3b8; border-radius: 6px; padding: 10px 14px; font-size: 11px; font-family: monospace; line-height: 1.6;">
              <strong>Note :</strong><br>
              Last Meter B&amp;W (dari admin Emas) -<br>
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;B&amp;W&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Colour<br>
              Total Mesin : {{ (Number(detailItem.gross_counter_bw || (Number(detailItem.counter_akhir_bw || 0) + Number(detailItem.a3_counter_bw || 0)))).toLocaleString('id-ID') }}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{{ (Number(detailItem.gross_counter_color || (Number(detailItem.counter_akhir_color || 0) + Number(detailItem.a3_counter_color || 0)))).toLocaleString('id-ID') }}<br>
              Deduksi A3&nbsp;&nbsp;: {{ Number(detailItem.a3_counter_bw || 0).toLocaleString('id-ID') }}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{{ Number(detailItem.a3_counter_color || 0).toLocaleString('id-ID') }} (-)<br>
              Last Meter&nbsp;&nbsp;: <strong>{{ Number(detailItem.counter_akhir_bw || 0).toLocaleString('id-ID') }}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{{ Number(detailItem.counter_akhir_color || 0).toLocaleString('id-ID') }}</strong>
            </div>

            <!-- Signatures Section: Accounting & Customer -->
            <div class="epson-modal-signatures">
              <div class="epson-sig-col">
                <div class="sig-col-title">Diterima &amp; Diverifikasi Oleh:</div>
                <div class="sig-col-line"></div>
                <div class="sig-col-name">{{ getCustomerName(detailItem.customer) }}</div>
                <div class="sig-col-role">Customer</div>
              </div>
              <div class="epson-sig-col">
                <div class="sig-col-title">Dicetak &amp; Dibuat Oleh (Accounting):</div>
                <div class="sig-col-line"></div>
                <div class="sig-col-name">{{ currentUser?.name || currentUser?.username || 'Tim Accounting' }}</div>
                <div class="sig-col-role">Admin Finance / Accounting</div>
              </div>
            </div>
          </div>
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
/* Epson Modal Signatures */
.epson-modal-signatures {
  display: flex;
  justify-content: space-between;
  margin-top: 32px;
  padding: 16px 20px 8px 20px;
  border-top: 1px dashed #cbd5e1;
}

.epson-sig-col {
  width: 42%;
  text-align: center;
  font-size: 11px;
}

.sig-col-title {
  font-weight: 600;
  color: #475569;
  margin-bottom: 50px;
}

.sig-col-line {
  border-bottom: 1.5px solid #334155;
  margin-bottom: 5px;
}

.sig-col-name {
  font-weight: 700;
  color: #0f172a;
}

.sig-col-role {
  font-size: 10px;
  color: #64748b;
}

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
  max-height: calc(100vh - 400px);
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

.counter-warning-hint {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  margin-top: 0.5rem;
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

/* Epson Device Usage Report Modal Styles */
.epson-modal-wrapper {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  background: #ffffff;
}

.epson-dark-header {
  background: #1e1e1e;
  color: #ffffff;
  padding: 16px 20px 0 20px;
}

.epson-header-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.epson-machine-model {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: #ffffff;
}

.epson-meta-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #94a3b8;
  margin-top: 4px;
}

.epson-meta-line strong {
  color: #e2e8f0;
}

.meta-sep {
  color: #64748b;
}

.epson-status-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.epson-ip-badge {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: monospace;
  color: #cbd5e1;
}

.epson-ready-badge {
  background: #15803d;
  color: #ffffff;
  font-weight: 700;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
}

.epson-tab-bar {
  display: flex;
  gap: 16px;
  border-top: 1px solid #334155;
  padding-top: 8px;
  font-size: 11px;
  color: #94a3b8;
  overflow-x: auto;
}

.epson-tab-bar .tab-item {
  padding-bottom: 6px;
  cursor: pointer;
  white-space: nowrap;
}

.epson-tab-bar .tab-item.active {
  color: #ffffff;
  font-weight: 700;
  border-bottom: 2px solid #38bdf8;
}

.epson-body-content {
  padding: 18px 20px;
}

.epson-title-row {
  margin-bottom: 14px;
}

.epson-main-heading {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.epson-first-time {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}

.epson-metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 18px;
}

.epson-metric-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 12px 14px;
}

.metric-title {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 6px;
}

.metric-value-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.metric-icon {
  font-size: 18px;
}

.metric-num {
  font-size: 20px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.5px;
}

.epson-table-header-title {
  font-size: 12.5px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 6px;
}

.epson-table-container {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 14px;
}

.epson-device-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.epson-device-table th {
  background: #f1f5f9;
  padding: 8px 10px;
  font-weight: 700;
  color: #475569;
  border-bottom: 1px solid #cbd5e1;
}

.epson-device-table td {
  padding: 6px 10px;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
}

.epson-device-table tr.highlight-row {
  background: #f8fafc;
}

.epson-usage-strip {
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 11px;
}

.usage-strip-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 6px;
}

.usage-strip-note {
  font-size: 10.5px;
  color: #1e40af;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 4px;
  padding: 6px 8px;
}


.detail-nav-pills {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 8px;
}

.nav-pill-btn {
  flex: 1;
  padding: 8px 14px;
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-pill-btn.active {
  background: #ffffff;
  color: #1e40af;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

</style>
