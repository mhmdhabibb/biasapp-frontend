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
import { usePermission } from '@/composables/usePermission'
import type { TableColumn } from '@/types'
import { downloadStyledExcel, uniqueSheetName, NUMFMT_COUNT, type StyledCell } from '@/utils/exportHelpers'

const toast = useToast()
const master = useMasterStore()
const resourceStore = useResourcesStore()
const { currentUser } = useAuth()
const { can, canAny, isAdmin } = usePermission()

// Hak akses hapus pencatatan (Admin atau yang memiliki izin delete)
const canDeleteReading = computed(() => {
  return isAdmin.value || canAny(
    'monthly_meter_reading:delete',
    'rental:delete',
    'rental_invoice:delete',
    'atlas_great:delete'
  )
})

const { customers, units, rentalInvoices, contractItems, formatUnitDisplayName } = master

// Helper untuk Serial Number Unit
function getUnitSN(item: any): string {
  if (item?.unit?.serial_no && String(item.unit.serial_no).trim()) return String(item.unit.serial_no).trim()
  if (item?.unit?.serial_number && String(item.unit.serial_number).trim()) return String(item.unit.serial_number).trim()
  const targetId = item?.unit_id || item?.unit?.id
  if (targetId) {
    const found = (units.value || []).find((u: any) => String(u.id) === String(targetId))
    if (found?.serial_no && String(found.serial_no).trim()) return String(found.serial_no).trim()
    if (found?.serial_number && String(found.serial_number).trim()) return String(found.serial_number).trim()
  }
  return '-'
}

// Helper untuk Nama Model Unit
function getUnitDisplayName(item: any): string {
  if (item?.unit?.model && String(item.unit.model).trim()) return String(item.unit.model).trim()
  if (item?.unit?.model_name && String(item.unit.model_name).trim()) return String(item.unit.model_name).trim()
  if (item?.unit?.name && String(item.unit.name).trim()) return String(item.unit.name).trim()
  const targetId = item?.unit_id || item?.unit?.id
  if (targetId) {
    const found = (units.value || []).find((u: any) => String(u.id) === String(targetId))
    if (found?.model && String(found.model).trim()) return String(found.model).trim()
    if (found?.model_name && String(found.model_name).trim()) return String(found.model_name).trim()
    if (found?.name && String(found.name).trim()) return String(found.name).trim()
  }
  return 'Unit'
}

// --- State ---
const readings = ref<any[]>([])
const loading = ref(false)
const activeTab = ref<'atlas' | 'great'>('atlas')
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
interface PaperDeduction {
  name: string
  bw: number
  color: number
  bw_double?: number
  color_double?: number
}

const form = reactive({
  rental_invoice_id: '',
  scheme_type: 'atlas_great' as 'atlas_great' | 'standard' | 'custom',
  customer_type: 'atlas' as 'atlas' | 'great',
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
  start_meter_bw_double: 0,
  end_meter_bw_double: 0,
  start_meter_color_double: 0,
  end_meter_color_double: 0,
  gross_meter_bw_double: 0,
  gross_meter_color_double: 0,
  a3_meter_bw: 0,
  a3_meter_color: 0,
  paper_deductions: [{ name: 'A3', bw: 0, color: 0, bw_double: 0, color_double: 0 }] as PaperDeduction[],
  percentage_bw: 88,
  percentage_color: 12,
  remarks: '',
})

const totalDeductionBW = computed(() => {
  if (!form.paper_deductions || form.paper_deductions.length === 0) {
    return Number(form.a3_meter_bw || 0)
  }
  return form.paper_deductions.reduce((sum, d) => sum + Number(d.bw || 0), 0)
})

const totalDeductionColor = computed(() => {
  if (!form.paper_deductions || form.paper_deductions.length === 0) {
    return Number(form.a3_meter_color || 0)
  }
  return form.paper_deductions.reduce((sum, d) => sum + Number(d.color || 0), 0)
})

const totalDeductionBWDouble = computed(() => {
  if (!form.paper_deductions || form.paper_deductions.length === 0) return 0
  return form.paper_deductions.reduce((sum, d) => sum + Number(d.bw_double || 0), 0)
})

const totalDeductionColorDouble = computed(() => {
  if (!form.paper_deductions || form.paper_deductions.length === 0) return 0
  return form.paper_deductions.reduce((sum, d) => sum + Number(d.color_double || 0), 0)
})

function onGrossOrDeductionChange() {
  const totBW = totalDeductionBW.value
  const totCol = totalDeductionColor.value
  if (form.gross_meter_bw > 0 || totBW > 0) {
    form.end_meter_bw = Math.max(0, Number(form.gross_meter_bw || 0) - totBW)
  }
  if (form.gross_meter_color > 0 || totCol > 0) {
    form.end_meter_color = Math.max(0, Number(form.gross_meter_color || 0) - totCol)
  }
  const totBWDouble = totalDeductionBWDouble.value
  const totColDouble = totalDeductionColorDouble.value
  if (form.gross_meter_bw_double > 0 || totBWDouble > 0) {
    form.end_meter_bw_double = Math.max(0, Number(form.gross_meter_bw_double || 0) - totBWDouble)
  }
  if (form.gross_meter_color_double > 0 || totColDouble > 0) {
    form.end_meter_color_double = Math.max(0, Number(form.gross_meter_color_double || 0) - totColDouble)
  }
  // Sync ke field a3 untuk kompatibilitas
  form.a3_meter_bw = totBW
  form.a3_meter_color = totCol
}

// Master daftar ukuran kertas dari database
const paperSizesList = ref<any[]>([])
async function fetchPaperSizes() {
  try {
    const res: any = await resources.paperSizes.list()
    paperSizesList.value = res.data || []
  } catch (err) {
    console.error('Failed to fetch paper sizes', err)
  }
}

// Deteksi otomatis ukuran kertas yang digunakan di printer / kontrak / invoice rental
function getPaperSizesForPrinter(unitId?: string, invoice?: any): string[] {
  const paperNames = new Set<string>()

  const resolveName = (idOrObj: any): string => {
    if (!idOrObj) return ''
    if (typeof idOrObj === 'object') return idOrObj.name || ''
    const found = paperSizesList.value.find((p: any) => String(p.id) === String(idOrObj))
    return found ? found.name : ''
  }

  // 1. Dari rental invoice jika ada
  if (invoice) {
    if (Array.isArray(invoice.meter_details)) {
      for (const d of invoice.meter_details) {
        const pName = d.paper_size?.name || d.paper_size_name || resolveName(d.paper_size_id)
        if (pName && String(pName).trim() && !/^A4/i.test(String(pName).trim())) {
          paperNames.add(String(pName).trim().toUpperCase())
        }
      }
    }
    const ciRates = invoice.contract_item?.rates || invoice.rental?.rental_items?.[0]?.rates || []
    if (Array.isArray(ciRates)) {
      for (const r of ciRates) {
        const pName = r.paper_size?.name || resolveName(r.paper_size_id)
        if (pName && String(pName).trim() && !/^A4/i.test(String(pName).trim())) {
          paperNames.add(String(pName).trim().toUpperCase())
        }
      }
    }
  }

  // 2. Dari unit mesin yang dipilih
  const targetUnitId = unitId || form.unit_id
  if (targetUnitId) {
    const u = (units.value || []).find((x: any) => String(x.id) === String(targetUnitId))
    if (u && Array.isArray(u.rates)) {
      for (const r of u.rates) {
        const pName = r.paper_size?.name || resolveName(r.paper_size_id)
        if (pName && String(pName).trim() && !/^A4/i.test(String(pName).trim())) {
          paperNames.add(String(pName).trim().toUpperCase())
        }
      }
    }
    // Check contract items terkait unit ini
    const matchedCIs = (contractItems.value || []).filter((ci: any) => String(ci.unit_id) === String(targetUnitId))
    for (const ci of matchedCIs) {
      if (Array.isArray(ci.rates)) {
        for (const r of ci.rates) {
          const pName = r.paper_size?.name || resolveName(r.paper_size_id)
          if (pName && String(pName).trim() && !/^A4/i.test(String(pName).trim())) {
            paperNames.add(String(pName).trim().toUpperCase())
          }
        }
      }
    }
  }

  // Filter agar A4 tidak menjadi deduksi
  const nonA4 = Array.from(paperNames).filter(p => !/^A4/i.test(p))
  if (nonA4.length > 0) {
    return nonA4
  }

  return ['A3']
}

function getItemDeductions(item: any): PaperDeduction[] {
  if (item?.paper_deductions) {
    try {
      const parsed = typeof item.paper_deductions === 'string' ? JSON.parse(item.paper_deductions) : item.paper_deductions
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((p: any) => ({
          name: String(p.name || 'A3').trim().toUpperCase(),
          bw: Number(p.bw || 0),
          color: Number(p.color || 0),
          bw_double: Number(p.bw_double || p.bw_2sided || 0),
          color_double: Number(p.color_double || p.color_2sided || 0),
        }))
      }
    } catch (e) {}
  }
  const bw = Number(item?.a3_counter_bw || 0)
  const color = Number(item?.a3_counter_color || 0)
  return [{ name: 'A3', bw, color, bw_double: 0, color_double: 0 }]
}

function getDeductionSummary(item: any, type: 'bw' | 'color'): string {
  const deducts = getItemDeductions(item)
  if (deducts.length === 1) {
    return `${deducts[0].name}: -${Number(deducts[0][type] || 0).toLocaleString()}`
  }
  const parts = deducts.map((p: any) => `${p.name}: ${Number(p[type] || 0).toLocaleString()}`)
  const tot = deducts.reduce((sum: number, p: any) => sum + Number(p[type] || 0), 0)
  return `Deduksi: -${tot.toLocaleString()} (${parts.join(', ')})`
}

function getDetailGross(item: any, mode: 'bw' | 'color'): number {
  if (!item) return 0
  const gross = mode === 'bw' ? Number(item.gross_counter_bw || 0) : Number(item.gross_counter_color || 0)
  if (gross > 0) return gross
  const akhir = mode === 'bw' ? Number(item.counter_akhir_bw || 0) : Number(item.counter_akhir_color || 0)
  const deduct = getItemDeductions(item).reduce((s, d) => s + (mode === 'bw' ? d.bw : d.color), 0)
  return akhir + deduct
}

function autoSyncPrinterPaperSizes(unitId?: string, inv?: any) {
  const detected = getPaperSizesForPrinter(unitId, inv)
  const currentMap = new Map<string, { bw: number; color: number; bw_double: number; color_double: number }>()
  for (const d of (form.paper_deductions || [])) {
    currentMap.set(d.name.toUpperCase(), {
      bw: Number(d.bw || 0),
      color: Number(d.color || 0),
      bw_double: Number(d.bw_double || 0),
      color_double: Number(d.color_double || 0),
    })
  }

  // Juga periksa meter details jika ada pada inv
  const mDetails: any[] = Array.isArray(inv?.meter_details) ? inv.meter_details : []
  for (const d of mDetails) {
    const pName = String(d.paper_size?.name || d.paper_size_name || '').trim().toUpperCase()
    if (pName && !pName.includes('A4')) {
      if (!currentMap.has(pName)) {
        currentMap.set(pName, { bw: 0, color: 0, bw_double: 0, color_double: 0 })
      }
      const val = Number(d.last_meter_reading || d.start_meter_reading || d.total_copies || 0)
      if (/bw|mono|b\/w|black/i.test(d.color_mode || '')) {
        currentMap.get(pName)!.bw = val
      } else if (/colou?r/i.test(d.color_mode || '')) {
        currentMap.get(pName)!.color = val
      }
    }
  }

  const newDeductions: PaperDeduction[] = []
  for (const pName of detected) {
    const existing = currentMap.get(pName)
    newDeductions.push({
      name: pName,
      bw: existing ? existing.bw : (pName === 'A3' ? Number(form.a3_meter_bw || 0) : 0),
      color: existing ? existing.color : (pName === 'A3' ? Number(form.a3_meter_color || 0) : 0),
      bw_double: existing ? existing.bw_double : 0,
      color_double: existing ? existing.color_double : 0,
    })
  }

  if (newDeductions.length === 0) {
    newDeductions.push({ name: 'A3', bw: Number(form.a3_meter_bw || 0), color: Number(form.a3_meter_color || 0), bw_double: 0, color_double: 0 })
  }

  form.paper_deductions = newDeductions
  onGrossOrDeductionChange()
}

function addPredefinedPaper(paperName: string) {
  const cleanName = paperName.trim().toUpperCase()
  if (!form.paper_deductions.some(d => d.name.toUpperCase() === cleanName)) {
    form.paper_deductions.push({
      name: cleanName,
      bw: 0,
      color: 0,
      bw_double: 0,
      color_double: 0,
    })
    onGrossOrDeductionChange()
    toast.success(`Ukuran kertas ${cleanName} ditambahkan ke daftar deduksi`)
  }
}

function promptAddPaper() {
  const custom = window.prompt('Masukkan nama ukuran kertas baru untuk printer ini (Contoh: A4, F4, Folio, Legal, dll):', 'A4')
  if (custom && custom.trim()) {
    const cleanName = custom.trim().toUpperCase()
    if (!form.paper_deductions.some(d => d.name.toUpperCase() === cleanName)) {
      form.paper_deductions.push({
        name: cleanName,
        bw: 0,
        color: 0,
        bw_double: 0,
        color_double: 0,
      })
      onGrossOrDeductionChange()
      toast.success(`Ukuran kertas ${cleanName} ditambahkan ke daftar deduksi printer`)
    } else {
      toast.warning(`Ukuran kertas ${cleanName} sudah ada di daftar deduksi`)
    }
  }
}

function removePaperDeduction(index: number) {
  if (form.paper_deductions.length <= 1) {
    form.paper_deductions[0].bw = 0
    form.paper_deductions[0].color = 0
    form.paper_deductions[0].bw_double = 0
    form.paper_deductions[0].color_double = 0
  } else {
    form.paper_deductions.splice(index, 1)
  }
  onGrossOrDeductionChange()
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

const calcBaseUsageBWDouble = computed(() => {
  const start = Number(form.start_meter_bw_double || 0)
  const end = Number(form.end_meter_bw_double || form.gross_meter_bw_double || 0)
  if (end <= start) return 0
  return end - start
})

const calcBaseUsageColorDouble = computed(() => {
  const start = Number(form.start_meter_color_double || 0)
  const end = Number(form.end_meter_color_double || form.gross_meter_color_double || 0)
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

function resolveInvoiceUnit(inv: any) {
  if (!inv) return null
  if (inv.unit) return inv.unit
  if (inv.unit_id) {
    const u = (units.value || []).find((x: any) => String(x.id) === String(inv.unit_id))
    if (u) return u
  }
  const ci = inv.contract_item || (contractItems.value || []).find((c: any) => String(c.id) === String(inv.contract_item_id))
  if (ci?.unit) return ci.unit
  if (ci?.unit_id) {
    const u = (units.value || []).find((x: any) => String(x.id) === String(ci.unit_id))
    if (u) return u
  }
  if (inv.rental?.rental_items?.[0]?.unit) return inv.rental.rental_items[0].unit
  if (inv.meter_details?.[0]?.contract_item?.unit) return inv.meter_details[0].contract_item.unit
  return null
}

function getInvoiceContractInfo(inv: any) {
  if (!inv) return null
  const c = inv.contract
  const r = inv.rental
  const cStart = c?.start_date || r?.start_date
  const cEnd = c?.end_date || r?.end_date

  let labelRange = ''
  if (cStart && cEnd) {
    const sD = new Date(cStart)
    const eD = new Date(cEnd)
    if (!isNaN(sD.getTime()) && !isNaN(eD.getTime())) {
      const sMonth = sD.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })
      const eMonth = eD.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })
      labelRange = `${sMonth} - ${eMonth}`
    }
  }

  let isLastVisit = false
  if (cEnd) {
    const endD = new Date(cEnd)
    const invDateStr = inv.period_end || inv.period_start || inv.invoice_date
    if (invDateStr && !isNaN(endD.getTime())) {
      const invD = new Date(invDateStr)
      if (!isNaN(invD.getTime())) {
        isLastVisit = (invD.getFullYear() === endD.getFullYear() && invD.getMonth() === endD.getMonth())
      }
    }
  }

  return {
    cStart,
    cEnd,
    labelRange,
    isLastVisit,
  }
}

const selectedInvoiceContractInfo = ref<{
  cStart?: string
  cEnd?: string
  labelRange?: string
  isLastVisit?: boolean
  startBW?: number
  startColor?: number
} | null>(null)

const rentalInvoiceOptions = computed(() => {
  const list = (rentalInvoices.value || []) as any[]
  const targetType = form.customer_type === 'atlas' ? 'atlas' : 'great'

  return list
    .filter((inv: any) => {
      const c = inv.customer || (customers.value || []).find((cust: any) => cust.id === inv.customer_id)
      const cName = getCustomerName(c).toLowerCase()
      if (targetType === 'atlas') {
        if (!cName.includes('atlas') && inv.customer_type !== 'atlas') return false
      } else if (targetType === 'great') {
        if (!cName.includes('great') && inv.customer_type !== 'great') return false
      }
      if (form.customer_id && String(inv.customer_id) !== String(form.customer_id)) {
        return false
      }
      return true
    })
    .map((inv: any) => {
      const c = inv.customer || (customers.value || []).find((cust: any) => cust.id === inv.customer_id)
      const cName = getCustomerName(c)
      const u = resolveInvoiceUnit(inv)
      const uDesc = u ? `${u.brand?.name ? `${u.brand.name} ` : ''}${u.model || u.name || 'Unit'}${u.serial_no ? ` (SN: ${u.serial_no})` : ''}` : 'Unit Copier'
      const invNo = inv.invoice_no || `INV-${String(inv.id).slice(0, 8)}`
      const pLabel = inv.period_start
        ? `${inv.period_start.slice(0, 10)} s/d ${inv.period_end ? inv.period_end.slice(0, 10) : ''}`
        : (inv.monthly_date ? inv.monthly_date.slice(0, 10) : '')

      const cInfo = getInvoiceContractInfo(inv)
      const cLabel = cInfo?.labelRange ? ` • [Kontrak: ${cInfo.labelRange}]` : ''
      const lastBadge = cInfo?.isLastVisit ? ' ★ Visit Terakhir Kontrak' : ''

      return {
        value: inv.id,
        label: `${invNo} — ${cName} • [Unit: ${uDesc}] ${pLabel ? `• (${pLabel})` : ''}${cLabel}${lastBadge}`,
        invoice: inv,
        unit: u,
        contractInfo: cInfo,
      }
    })
})

async function onRentalInvoiceChange(invId: string) {
  if (!invId) return
  const opt = rentalInvoiceOptions.value.find((o: any) => String(o.value) === String(invId))
  if (!opt) return
  const inv = opt.invoice
  const u = opt.unit || resolveInvoiceUnit(inv)

  // Otomatis set Customer
  if (inv.customer_id) {
    form.customer_id = inv.customer_id
    await loadUnitsForCustomer(inv.customer_id)
  }

  // Otomatis set Unit yang terikat dengan invoice ini
  if (u?.id) {
    form.unit_id = u.id
    if (form.customer_type === 'atlas') {
      autoSyncPrinterPaperSizes(u.id, inv)
    }
  } else if (inv.unit_id) {
    form.unit_id = inv.unit_id
    if (form.customer_type === 'atlas') {
      autoSyncPrinterPaperSizes(inv.unit_id, inv)
    }
  }

  // Otomatis set Periode
  const dateVal = inv.period_start || inv.monthly_date || inv.invoice_date
  if (dateVal) {
    const d = new Date(dateVal)
    if (!isNaN(d.getTime())) {
      form.period_month = d.getMonth() + 1
      form.period_year = d.getFullYear()
    }
  }

  // Otomatis ambil Counter Awal & Akhir / Gross dari invoice (baik dari meter_details maupun flat fields)
  const mDetails: any[] = Array.isArray(inv.meter_details) ? inv.meter_details : []
  const a4Details = mDetails.filter((d: any) => {
    const pName = String(d.paper_size?.name || d.paper_size_name || '').trim().toUpperCase()
    return !pName || pName.includes('A4')
  })
  const nonA4Details = mDetails.filter((d: any) => {
    const pName = String(d.paper_size?.name || d.paper_size_name || '').trim().toUpperCase()
    return pName && !pName.includes('A4')
  })

  const a4BW = a4Details.find((d: any) => /bw|mono|b\/w|black/i.test(d.color_mode || ''))
  const a4Color = a4Details.find((d: any) => /colou?r/i.test(d.color_mode || ''))

  const bwStart = a4BW ? Number(a4BW.start_meter_reading || 0) : Number(inv.meter_start || inv.meter_start_bw || 0)
  const bwEnd = a4BW ? Number(a4BW.last_meter_reading || 0) : Number(inv.meter_end || inv.meter_end_bw || 0)
  const colStart = a4Color ? Number(a4Color.start_meter_reading || 0) : Number(inv.meter_start_color || inv.meter_start_colour || 0)
  const colEnd = a4Color ? Number(a4Color.last_meter_reading || 0) : Number(inv.meter_end_color || inv.meter_end_colour || 0)

  // Map non-A4 details (seperti A3, Folio, dll) ke paper_deductions
  if (nonA4Details.length > 0 && form.customer_type === 'atlas') {
    const dedMap = new Map<string, { bw: number; color: number }>()
    for (const d of nonA4Details) {
      const pName = String(d.paper_size?.name || d.paper_size_name || 'A3').trim().toUpperCase()
      if (!dedMap.has(pName)) {
        dedMap.set(pName, { bw: 0, color: 0 })
      }
      const entry = dedMap.get(pName)!
      const start = Number(d.start_meter_reading || 0)
      const last = Number(d.last_meter_reading || 0)
      // Ambil nilai meter reading fisik non-A4 dari input teknisi / admin
      const val = Number(last || start || d.total_copies || 0)
      if (/bw|mono|b\/w|black/i.test(d.color_mode || '')) {
        entry.bw = val
      } else if (/colou?r/i.test(d.color_mode || '')) {
        entry.color = val
      }
    }
    form.paper_deductions = Array.from(dedMap.entries()).map(([name, val]) => ({
      name,
      bw: val.bw,
      color: val.color,
    }))
    onGrossOrDeductionChange()
  }

  // Simpan info kontrak yang terkait dengan invoice ini
  selectedInvoiceContractInfo.value = opt?.contractInfo || getInvoiceContractInfo(inv)

  // Khusus Atlas Copco: Cari meter awal kontrak jika tersedia (Akumulasi seluruh masa kontrak)
  const matchedCI = (contractItems.value || []).find((ci: any) => 
    (ci.contract_id && inv.contract_id && String(ci.contract_id) === String(inv.contract_id)) ||
    (u?.id && String(ci.unit_id) === String(u.id))
  ) || inv.contract_item || inv.meter_details?.[0]?.contract_item

  let contractStartBW = Number(matchedCI?.start_meter_bw ?? matchedCI?.start_meter ?? 0)
  let contractStartColor = Number(matchedCI?.start_meter_color ?? 0)

  if (contractStartBW === 0) {
    const rItem = inv.rental?.rental_items?.[0]
    if (rItem) {
      contractStartBW = Number(rItem.start_meter_bw ?? 0)
      contractStartColor = Number(rItem.start_meter_color ?? 0)
    }
  }

  if (contractStartBW === 0) contractStartBW = bwStart
  if (contractStartColor === 0) contractStartColor = colStart

  if (form.customer_type === 'atlas') {
    if (contractStartBW > 0) form.start_meter_bw = contractStartBW
    if (contractStartColor > 0) form.start_meter_color = contractStartColor
    if (bwEnd > 0) form.gross_meter_bw = bwEnd
    if (colEnd > 0) form.gross_meter_color = colEnd
    onGrossOrDeductionChange()
  } else {
    if (bwStart > 0) form.start_meter_bw = bwStart
    if (colStart > 0) form.start_meter_color = colStart
    if (bwEnd > 0) form.end_meter_bw = bwEnd
    if (colEnd > 0) form.end_meter_color = colEnd
  }

  // Jika invoice belum terisi meter_details atau deduksi masih 0 pada atlas, tarik otomatis dari reading teknisi
  if (form.unit_id && (
    (bwEnd === 0 && colEnd === 0) ||
    (form.customer_type === 'atlas' && totalDeductionBW.value === 0 && totalDeductionColor.value === 0)
  )) {
    await handleAutoFetchMeter()
  }

  toast.success(`Unit ${u ? (u.model || u.name || '') : ''} & Customer otomatis terpilih dari ${inv.invoice_no || 'Rental Invoice'}`)
}

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

  // Fallback otomatis: Tampilkan seluruh unit printer / copier master (atau semua unit fisik)
  const candidateUnits = (units.value || []).filter((u: any) => 
    showAllUnitsFallback.value || u.is_copier || (u.name && (u.name.toLowerCase().includes('copier') || u.name.toLowerCase().includes('printer') || u.name.toLowerCase().includes('epson')))
  )
  const listToUse = candidateUnits.length > 0 ? candidateUnits : (units.value || [])
  return listToUse.map((u: any) => {
    const disp = formatUnitDisplayName ? formatUnitDisplayName(u) : `${u.name || u.model || 'Unit'}${u.serial_no ? ` (SN: ${u.serial_no})` : ''}`
    return {
      value: u.id,
      label: disp,
    }
  })
})

// Deteksi otomatis saat memilih customer
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
})

function isAtlas(r: any): boolean {
  if (!r) return false
  if (r.customer_type === 'atlas') return true
  if (r.customer_type === 'great') return false
  const c = r.customer || (customers.value || []).find((cust: any) => cust.id === r.customer_id)
  const name = c ? getCustomerName(c).toLowerCase() : ''
  return name.includes('atlas')
}

function isGreat(r: any): boolean {
  if (!r) return false
  if (r.customer_type === 'great') return true
  if (r.customer_type === 'atlas') return false
  const c = r.customer || (customers.value || []).find((cust: any) => cust.id === r.customer_id)
  const name = c ? getCustomerName(c).toLowerCase() : ''
  return name.includes('great')
}

// Filter customer khusus per tab yang aktif
const tabCustomerFilterOptions = computed(() => {
  if (activeTab.value === 'atlas') {
    const list = (customers.value || []).filter((c: any) => getCustomerName(c).toLowerCase().includes('atlas'))
    if (list.length > 0) {
      return [
        { value: '', label: '-- Semua Customer Atlas --' },
        ...list.map((c: any) => ({ value: c.id, label: getCustomerName(c) })),
      ]
    }
  } else if (activeTab.value === 'great') {
    const list = (customers.value || []).filter((c: any) => getCustomerName(c).toLowerCase().includes('great'))
    if (list.length > 0) {
      return [
        { value: '', label: '-- Semua Customer Great --' },
        ...list.map((c: any) => ({ value: c.id, label: getCustomerName(c) })),
      ]
    }
  }
  return customerFilterOptions.value
})

const modalCustomerOptions = computed(() => {
  // Metode Atlas & Great tidak terbatas hanya pada Atlas/Great, dapat digunakan untuk seluruh customer rental
  return (customers.value || []).map((c: any) => ({
    value: c.id,
    label: getCustomerName(c),
  }))
})

watch(activeTab, () => {
  filterCustomer.value = ''
})

// Kunci reading_date ke tanggal 7 secara otomatis
watch(
  [() => form.period_month, () => form.period_year],
  () => {
    const mStr = String(form.period_month).padStart(2, '0')
    form.reading_date = `${form.period_year}-${mStr}-07`
  },
  { immediate: true }
)

// --- Columns Terpisah Antara Atlas & Great (Kolom ACTION disediakan otomatis oleh DataTable) ---
const atlasColumns: TableColumn[] = [
  { key: 'period', label: 'Periode' },
  { key: 'customer', label: 'Customer' },
  { key: 'unit', label: 'Unit Mesin & SN' },
  { key: 'meter_bw', label: 'Counter BW (Gross / Deduksi / Akhir)' },
  { key: 'meter_color', label: 'Counter Color (Gross / Deduksi / Akhir)' },
  { key: 'base_usage', label: 'Pemakaian Dasar' },
  { key: 'allocation', label: 'Alokasi (88% : 12%)' },
  { key: 'total_pages', label: 'Total Lembar Akhir' },
]

const greatColumns: TableColumn[] = [
  { key: 'period', label: 'Periode' },
  { key: 'customer', label: 'Customer' },
  { key: 'unit', label: 'Unit Mesin & SN' },
  { key: 'meter_bw', label: 'Counter BW (Awal / Akhir)' },
  { key: 'meter_color', label: 'Counter Color (Awal / Akhir)' },
  { key: 'base_usage', label: 'Pemakaian Dasar' },
  { key: 'allocation', label: 'Alokasi (88% : 12%)' },
  { key: 'total_pages', label: 'Total Lembar Akhir' },
]

const columns = computed(() => {
  return activeTab.value === 'atlas' ? atlasColumns : greatColumns
})

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
  if (!rentalInvoices.value || rentalInvoices.value.length === 0) {
    fetchPromises.push(resourceStore.fetchAll('rentalInvoices', { per_page: 500 }, false))
  }
  if (!contractItems.value || contractItems.value.length === 0) {
    fetchPromises.push(resourceStore.fetchAll('contractItems', { per_page: 500 }, false))
  }
  fetchPromises.push(fetchPaperSizes())
  await Promise.all(fetchPromises)
})

// --- Filtered Data ---
const filteredReadings = computed(() => {
  let list = readings.value

  if (activeTab.value === 'atlas') {
    list = list.filter(isAtlas)
  } else {
    list = list.filter(isGreat)
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
      const sn = getUnitSN(r).toLowerCase()
      const model = getUnitDisplayName(r).toLowerCase()
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

      if (payload.contract_start_date || payload.contract_end_date) {
        const sDate = payload.contract_start_date || ''
        const eDate = payload.contract_end_date || ''
        let labelRange = ''
        if (sDate && eDate) {
          const sD = new Date(sDate)
          const eD = new Date(eDate)
          labelRange = `${sD.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })} - ${eD.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })}`
        }
        selectedInvoiceContractInfo.value = {
          cStart: sDate,
          cEnd: eDate,
          labelRange,
          isLastVisit: Boolean(payload.is_last_visit),
          startBW: Number(payload.contract_start_bw || 0),
          startColor: Number(payload.contract_start_color || 0),
        }
      }

      if (form.customer_type === 'atlas') {
        // Sesuai ketentuan Atlas: Gunakan meter awal kontrak jika tersedia (akumulasi seluruh masa kontrak)
        if (Number(payload.contract_start_bw || 0) > 0) {
          form.start_meter_bw = Number(payload.contract_start_bw)
        }
        if (Number(payload.contract_start_color || 0) > 0) {
          form.start_meter_color = Number(payload.contract_start_color)
        }
        if (Number(payload.contract_start_bw_double || 0) > 0) {
          form.start_meter_bw_double = Number(payload.contract_start_bw_double)
        }
        if (Number(payload.contract_start_color_double || 0) > 0) {
          form.start_meter_color_double = Number(payload.contract_start_color_double)
        }

        const grossBW = Number(payload.gross_counter_bw ?? payload.counter_akhir_bw ?? 0)
        const grossCol = Number(payload.gross_counter_color ?? payload.counter_akhir_color ?? 0)
        if (grossBW > 0) form.gross_meter_bw = grossBW
        if (grossCol > 0) form.gross_meter_color = grossCol

        const grossBWDouble = Number(payload.gross_counter_bw_double ?? payload.counter_akhir_bw_double ?? 0)
        const grossColDouble = Number(payload.gross_counter_color_double ?? payload.counter_akhir_color_double ?? 0)
        if (grossBWDouble > 0) form.gross_meter_bw_double = grossBWDouble
        if (grossColDouble > 0) form.gross_meter_color_double = grossColDouble

        if (Array.isArray(payload.paper_deductions) && payload.paper_deductions.length > 0) {
          form.paper_deductions = payload.paper_deductions.map((d: any) => ({
            name: d.name,
            bw: Number(d.bw || 0),
            color: Number(d.color || 0),
            bw_double: Number(d.bw_double || 0),
            color_double: Number(d.color_double || 0),
          }))
          const a3Item = form.paper_deductions.find(d => d.name === 'A3')
          if (a3Item) {
            form.a3_meter_bw = a3Item.bw
            form.a3_meter_color = a3Item.color
          }
        }
        onGrossOrDeductionChange()
      }

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

// Saat unit dipilih di form tambah, tawarkan/auto-tarik meter teknisi & deteksi kertas printer
async function onUnitChange(unitId: string) {
  form.unit_id = unitId
  if (unitId && form.customer_type === 'atlas' && !isEditing.value) {
    autoSyncPrinterPaperSizes(unitId)
  }
  if (!isEditing.value && unitId) {
    await handleAutoFetchMeter()
  }
}

// --- Add / Edit Handlers ---
function switchModalType(type: 'atlas' | 'great') {
  if (isEditing.value) return
  form.customer_type = type
  form.scheme_type = 'atlas_great'
  form.percentage_bw = 88
  form.percentage_color = 12

  if (type === 'atlas') {
    const atlasCust = (customers.value || []).find((c: any) => getCustomerName(c).toLowerCase().includes('atlas'))
    form.customer_id = atlasCust ? atlasCust.id : ''
  } else {
    const greatCust = (customers.value || []).find((c: any) => getCustomerName(c).toLowerCase().includes('great'))
    form.customer_id = greatCust ? greatCust.id : ''
    form.gross_meter_bw = 0
    form.gross_meter_color = 0
    form.a3_meter_bw = 0
    form.a3_meter_color = 0
  }

  form.unit_id = ''
  if (form.customer_id) {
    void loadUnitsForCustomer(form.customer_id)
  }
}

function openAddModal(type?: 'atlas' | 'great') {
  const targetType = type || activeTab.value
  isEditing.value = false
  editingId.value = null
  allowOffSchedule.value = true
  showAllUnitsFallback.value = false
  customerRentedUnits.value = []

  form.customer_type = targetType
  form.scheme_type = 'atlas_great'
  form.percentage_bw = 88
  form.percentage_color = 12

  if (targetType === 'atlas') {
    const atlasCust = (customers.value || []).find((c: any) => getCustomerName(c).toLowerCase().includes('atlas'))
    form.customer_id = atlasCust ? atlasCust.id : ''
  } else {
    const greatCust = (customers.value || []).find((c: any) => getCustomerName(c).toLowerCase().includes('great'))
    form.customer_id = greatCust ? greatCust.id : ''
  }

  form.unit_id = ''
  form.rental_invoice_id = ''
  selectedInvoiceContractInfo.value = null
  form.period_month = new Date().getMonth() + 1
  form.period_year = new Date().getFullYear()
  const mStr = String(form.period_month).padStart(2, '0')
  form.reading_date = `${form.period_year}-${mStr}-07`
  form.start_meter_bw = 0
  form.end_meter_bw = 0
  form.start_meter_color = 0
  form.end_meter_color = 0
  form.gross_meter_bw = 0
  form.gross_meter_color = 0
  form.start_meter_bw_double = 0
  form.end_meter_bw_double = 0
  form.start_meter_color_double = 0
  form.end_meter_color_double = 0
  form.gross_meter_bw_double = 0
  form.gross_meter_color_double = 0
  form.a3_meter_bw = 0
  form.a3_meter_color = 0
  form.paper_deductions = [{ name: 'A3', bw: 0, color: 0, bw_double: 0, color_double: 0 }]
  form.remarks = ''

  if (form.customer_id) {
    void loadUnitsForCustomer(form.customer_id)
  }

  showModal.value = true
}

function openEditModal(item: any) {
  isEditing.value = true
  editingId.value = item.id
  allowOffSchedule.value = true
  showAllUnitsFallback.value = false

  const cType: 'atlas' | 'great' = (item.customer_type === 'great' || isGreat(item)) ? 'great' : 'atlas'
  form.scheme_type = 'atlas_great'
  form.customer_type = cType
  form.rental_invoice_id = item.rental_invoice_id || ''
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
  form.start_meter_bw_double = Number(item.counter_awal_bw_double || 0)
  form.end_meter_bw_double = Number(item.counter_akhir_bw_double || 0)
  form.start_meter_color_double = Number(item.counter_awal_color_double || 0)
  form.end_meter_color_double = Number(item.counter_akhir_color_double || 0)
  form.gross_meter_bw_double = Number(item.gross_counter_bw_double || 0)
  form.gross_meter_color_double = Number(item.gross_counter_color_double || 0)
  form.a3_meter_bw = Number(item.a3_counter_bw || 0)
  form.a3_meter_color = Number(item.a3_counter_color || 0)

  if (item.paper_deductions) {
    try {
      const parsed = typeof item.paper_deductions === 'string' ? JSON.parse(item.paper_deductions) : item.paper_deductions
      if (Array.isArray(parsed) && parsed.length > 0) {
        form.paper_deductions = parsed
      } else {
        form.paper_deductions = [{ name: 'A3', bw: Number(item.a3_counter_bw || 0), color: Number(item.a3_counter_color || 0) }]
      }
    } catch {
      form.paper_deductions = [{ name: 'A3', bw: Number(item.a3_counter_bw || 0), color: Number(item.a3_counter_color || 0) }]
    }
  } else {
    form.paper_deductions = [{ name: 'A3', bw: Number(item.a3_counter_bw || 0), color: Number(item.a3_counter_color || 0) }]
  }

  form.percentage_bw = Number(item.percentage_bw || 88)
  form.percentage_color = Number(item.percentage_color || 12)
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
  if (!isEditing.value && currentDay !== 7 && !allowOffSchedule.value) {
    toast.error(
      `Pencatatan Atlas Copco & PT Great Eastern hanya dapat dibuat pada tanggal 7 setiap bulannya! (Hari ini: tanggal ${currentDay}). Centang 'Izinkan pembuatan di luar tanggal 7' jika merupakan input susulan oleh Admin.`
    )
    return
  }

  isSaving.value = true
  try {
    const periodDay = 7
    const periodDate = new Date(form.period_year, form.period_month - 1, periodDay)
    const periodLabel = `${MONTH_NAMES[form.period_month - 1]} ${form.period_year}`
    const isAtlasType = form.customer_type === 'atlas'
    const totBW = totalDeductionBW.value
    const totCol = totalDeductionColor.value

    const payload = {
      customer_type: form.customer_type,
      rental_invoice_id: form.rental_invoice_id || undefined,
      customer_id: form.customer_id,
      unit_id: form.unit_id,
      period_date: periodDate.toISOString(),
      period_label: periodLabel,
      counter_awal_bw: Number(form.start_meter_bw || 0),
      counter_akhir_bw: Number(form.end_meter_bw || 0),
      counter_awal_color: Number(form.start_meter_color || 0),
      counter_akhir_color: Number(form.end_meter_color || 0),
      counter_awal_bw_double: Number(form.start_meter_bw_double || 0),
      counter_akhir_bw_double: Number(form.end_meter_bw_double || form.gross_meter_bw_double || 0),
      counter_awal_color_double: Number(form.start_meter_color_double || 0),
      counter_akhir_color_double: Number(form.end_meter_color_double || form.gross_meter_color_double || 0),
      gross_counter_bw: isAtlasType ? Number(form.gross_meter_bw || 0) : 0,
      gross_counter_color: isAtlasType ? Number(form.gross_meter_color || 0) : 0,
      gross_counter_bw_double: isAtlasType ? Number(form.gross_meter_bw_double || 0) : 0,
      gross_counter_color_double: isAtlasType ? Number(form.gross_meter_color_double || 0) : 0,
      a3_counter_bw: isAtlasType ? totBW : 0,
      a3_counter_color: isAtlasType ? totCol : 0,
      paper_deductions: isAtlasType ? JSON.stringify(form.paper_deductions) : undefined,
      percentage_bw: Number(form.percentage_bw || 88),
      percentage_color: Number(form.percentage_color || 12),
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

// --- Delete Handlers (Dibatasi Hak Akses Role) ---
function confirmDelete(item: any) {
  if (!canDeleteReading.value) {
    toast.error('Akses ditolak: Anda tidak memiliki hak akses untuk menghapus data pencatatan ini.')
    return
  }
  itemToDelete.value = item
  showDeleteConfirm.value = true
}

async function handleDelete() {
  if (!canDeleteReading.value) {
    toast.error('Akses ditolak: Anda tidak memiliki hak akses untuk menghapus data pencatatan ini.')
    return
  }
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

function printAtlasSlip(item: any) {
  try {
    const printWindow = window.open('', '_blank', 'width=980,height=800')
    if (!printWindow) {
      toast.error('Pop-up browser diblokir. Harap izinkan pop-up untuk mencetak.')
      return
    }

    const c = item.customer || (customers.value || []).find((cust: any) => cust.id === item.customer_id)
    const custName = (c ? getCustomerName(c) : '') || 'Atlas Copco'
    const unitModel = getUnitDisplayName(item)
    const unitSN = getUnitSN(item)
    const branchLoc = c?.address || item.customer?.address || '20242 (Cab.Batam)'
    const deductions = getItemDeductions(item) || []
    const bwA3 = deductions.reduce((sum, d) => sum + Number(d.bw || 0), 0)
    const colA3 = deductions.reduce((sum, d) => sum + Number(d.color || 0), 0)
    const bwGross = Number(item.gross_counter_bw || (Number(item.counter_akhir_bw || 0) + bwA3))
    const colGross = Number(item.gross_counter_color || (Number(item.counter_akhir_color || 0) + colA3))
    const bwAkhir = Number(item.counter_akhir_bw || (bwGross - bwA3))
    const colAkhir = Number(item.counter_akhir_color || (colGross - colA3))
    const totalPages = bwGross + colGross

    const bwAwal = Number.isFinite(Number(item.counter_awal_bw)) ? Number(item.counter_awal_bw) : 0
    const colAwal = Number.isFinite(Number(item.counter_awal_color)) ? Number(item.counter_awal_color) : 0
    const bwPemakaian = Number.isFinite(Number(item.pemakaian_bw_dasar)) ? Number(item.pemakaian_bw_dasar) : Math.max(0, bwAkhir - bwAwal)
    const colPemakaian = Number.isFinite(Number(item.pemakaian_color_dasar)) ? Number(item.pemakaian_color_dasar) : Math.max(0, colAkhir - colAwal)

    let printDateStr = '30/03/2023 00:00:00'
    if (item.period_date) {
      const d = new Date(item.period_date)
      if (!isNaN(d.getTime())) {
        printDateStr = d.toLocaleDateString('en-GB') + ' 00:00:00'
      }
    }
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

.btn-excel-top {
  background: #16a34a !important;
  border-color: #16a34a !important;
  color: #ffffff !important;
  display: inline-flex;
  align-items: center;
  font-weight: 600;
}

.btn-excel-top:hover {
  background: #15803d !important;
  border-color: #15803d !important;
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
          <div class="metric-val">${bwGross.toLocaleString('id-ID')}</div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Total Number of Color Pages</div>
        <div class="metric-val-wrap">
          <div class="metric-icon" style="color: #2563eb;">🎨</div>
          <div class="metric-val">${colGross.toLocaleString('id-ID')}</div>
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
        <tr class="row-highlight">
          <td><strong>A4/Letter</strong></td>
          <td>${bwAkhir.toLocaleString('id-ID')}</td>
          <td>${colAkhir.toLocaleString('id-ID')}</td>
          <td>${Number(item.counter_akhir_bw_double || item.gross_counter_bw_double || 0).toLocaleString('id-ID')}</td>
          <td>${Number(item.counter_akhir_color_double || item.gross_counter_color_double || 0).toLocaleString('id-ID')}</td>
        </tr>
        ${deductions.map(d => `
        <tr>
          <td><strong>${d.name === 'A3' ? 'A3/Ledger' : d.name}</strong></td>
          <td>${Number(d.bw || 0).toLocaleString('id-ID')}</td>
          <td>${Number(d.color || 0).toLocaleString('id-ID')}</td>
          <td>${Number(d.bw_double || 0).toLocaleString('id-ID')}</td>
          <td>${Number(d.color_double || 0).toLocaleString('id-ID')}</td>
        </tr>`).join('')}
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
      ${deductions.map(d => `Deduksi ${d.name}&nbsp;&nbsp;: ${Number(d.bw || 0).toLocaleString('en-US')}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${Number(d.color || 0).toLocaleString('en-US')} (-)<br>`).join('')}
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
  } catch (err: any) {
    console.error('Error printing Atlas slip:', err)
    toast.error('Gagal mencetak slip Atlas: ' + (err?.message || 'Error'))
  }
}

function printGreatSlip(item: any) {
  try {
    const printWindow = window.open('', '_blank', 'width=980,height=800')
    if (!printWindow) {
      toast.error('Pop-up browser diblokir. Harap izinkan pop-up untuk mencetak.')
      return
    }

    const c = item.customer || (customers.value || []).find((cust: any) => cust.id === item.customer_id)
    const custName = (c ? getCustomerName(c) : '') || 'PT Great Eastern'
    const unitModel = getUnitDisplayName(item)
    const unitSN = getUnitSN(item)

    let periodStr = item.period_label || '-'
    if (periodStr === '-' && item.period_date) {
      const d = new Date(item.period_date)
      if (!isNaN(d.getTime())) {
        periodStr = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
      }
    }

    const bwAwal = Number.isFinite(Number(item.counter_awal_bw)) ? Number(item.counter_awal_bw) : 0
    const bwAkhir = Number.isFinite(Number(item.counter_akhir_bw)) ? Number(item.counter_akhir_bw) : 0
    const bwPemakaian = Number.isFinite(Number(item.pemakaian_bw_dasar)) ? Number(item.pemakaian_bw_dasar) : Math.max(0, bwAkhir - bwAwal)

    const colAwal = Number.isFinite(Number(item.counter_awal_color)) ? Number(item.counter_awal_color) : 0
    const colAkhir = Number.isFinite(Number(item.counter_akhir_color)) ? Number(item.counter_akhir_color) : 0
    const colPemakaian = Number.isFinite(Number(item.pemakaian_color_dasar)) ? Number(item.pemakaian_color_dasar) : Math.max(0, colAkhir - colAwal)

    const pctBW = Number.isFinite(Number(item.percentage_bw)) ? Number(item.percentage_bw) : 88
    const pctCol = Number.isFinite(Number(item.percentage_color)) ? Number(item.percentage_color) : 12
    const allocBW = Number.isFinite(Number(item.allocation_bw)) ? Number(item.allocation_bw) : Math.round(colPemakaian * (pctBW / 100) * 100) / 100
    const allocCol = Number.isFinite(Number(item.allocation_color)) ? Number(item.allocation_color) : Math.round(colPemakaian * (pctCol / 100) * 100) / 100

    const totalBW = Number.isFinite(Number(item.total_bw)) ? Number(item.total_bw) : Math.round((bwPemakaian + allocBW) * 100) / 100
    const totalCol = Number.isFinite(Number(item.total_color)) ? Number(item.total_color) : allocCol

    const hasDouble = (Number(item.counter_akhir_bw_double || item.counter_awal_bw_double || item.gross_counter_bw_double) > 0) ||
                      (Number(item.counter_akhir_color_double || item.counter_awal_color_double || item.gross_counter_color_double) > 0)
    const bwDblAwal = Number(item.counter_awal_bw_double || 0)
    const bwDblGross = Number(item.gross_counter_bw_double || 0)
    const bwDblAkhir = Number(item.counter_akhir_bw_double || bwDblGross)
    const bwDblUsage = Math.max(0, bwDblAkhir - bwDblAwal)

    const colDblAwal = Number(item.counter_awal_color_double || 0)
    const colDblGross = Number(item.gross_counter_color_double || 0)
    const colDblAkhir = Number(item.counter_akhir_color_double || colDblGross)
    const colDblUsage = Math.max(0, colDblAkhir - colDblAwal)

    let printDateStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
    if (item.period_date) {
      const d = new Date(item.period_date)
      if (!isNaN(d.getTime())) {
        printDateStr = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
      }
    }

    const signerName = currentUser.value?.name || currentUser.value?.username || 'Accounting / Admin'

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Perhitungan Lembar Pemakaian - ${custName}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      margin: 0;
      padding: 0;
      background: #ffffff;
    }
    .header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .title { font-size: 19px; font-weight: 800; color: #0f172a; }
    .subtitle { font-size: 12px; color: #64748b; margin-top: 2px; }
    .meta-box {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 24px;
      font-size: 12px;
    }
    .meta-item { display: flex; gap: 8px; }
    .meta-lbl { color: #64748b; width: 120px; font-weight: 500; }
    .meta-val { color: #0f172a; font-weight: 600; }
    .table-title { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
    th { background: #f1f5f9; padding: 8px 12px; border: 1px solid #cbd5e1; text-align: right; color: #334155; }
    th:first-child { text-align: left; }
    td { padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; color: #1e293b; }
    td:first-child { text-align: left; }
    .calc-box {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 6px;
      padding: 14px 16px;
      margin-bottom: 24px;
      font-size: 12px;
    }
    .calc-title { font-weight: 700; color: #166534; margin-bottom: 8px; }
    .calc-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .signatures { display: flex; justify-content: space-between; margin-top: 40px; page-break-inside: avoid; }
    .sig-col { width: 40%; text-align: center; font-size: 12px; }
    .sig-line { height: 60px; border-bottom: 1px solid #334155; margin-bottom: 6px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">LEMBAR PERHITUNGAN PEMAKAIAN (RENTAL)</div>
      <div class="subtitle">Skema Alokasi Khusus PT Great Eastern (88% Color ke BW &bull; Cut-Off Billing Tanggal 7)</div>
    </div>
    <div style="text-align: right; font-size: 11px; color: #64748b;">
      Dicetak: ${new Date().toLocaleDateString('id-ID')}
    </div>
  </div>

  <div class="meta-box">
    <div class="meta-item"><span class="meta-lbl">Customer:</span><span class="meta-val">${custName}</span></div>
    <div class="meta-item"><span class="meta-lbl">Periode:</span><span class="meta-val">${periodStr}</span></div>
    <div class="meta-item"><span class="meta-lbl">Unit Mesin:</span><span class="meta-val">${unitModel}</span></div>
    <div class="meta-item"><span class="meta-lbl">Serial Number:</span><span class="meta-val">${unitSN}</span></div>
    <div class="meta-item"><span class="meta-lbl">Billing Date:</span><span class="meta-val">${printDateStr}</span></div>
    <div class="meta-item"><span class="meta-lbl">Metode:</span><span class="meta-val">Direct Meter (Alokasi 88% : 12%)</span></div>
  </div>

  <div class="table-title">1. Pembacaan Meter Counter Dasar</div>
  <table>
    <thead>
      <tr>
        <th>Jenis Counter</th>
        <th>Counter Awal</th>
        <th>Counter Akhir</th>
        <th>Pemakaian Dasar</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Black &amp; White (BW)</strong></td>
        <td>${bwAwal.toLocaleString('id-ID')}</td>
        <td>${bwAkhir.toLocaleString('id-ID')}</td>
        <td style="font-weight: 700;">${bwPemakaian.toLocaleString('id-ID')}</td>
      </tr>
      <tr>
        <td><strong>Color (CL)</strong></td>
        <td>${colAwal.toLocaleString('id-ID')}</td>
        <td>${colAkhir.toLocaleString('id-ID')}</td>
        <td style="font-weight: 700;">${colPemakaian.toLocaleString('id-ID')}</td>
      </tr>
      ${hasDouble ? `
      <tr style="background: #f8fafc; font-style: italic;">
        <td>&nbsp;&nbsp;↳ Black &amp; White (2-Sided)</td>
        <td>${bwDblAwal.toLocaleString('id-ID')}</td>
        <td>${bwDblAkhir.toLocaleString('id-ID')}</td>
        <td style="font-weight: 600;">${bwDblUsage.toLocaleString('id-ID')}</td>
      </tr>
      <tr style="background: #f8fafc; font-style: italic;">
        <td>&nbsp;&nbsp;↳ Colour (2-Sided)</td>
        <td>${colDblAwal.toLocaleString('id-ID')}</td>
        <td>${colDblAkhir.toLocaleString('id-ID')}</td>
        <td style="font-weight: 600;">${colDblUsage.toLocaleString('id-ID')}</td>
      </tr>
      ` : ''}
    </tbody>
  </table>

  <div class="table-title">2. Hasil Alokasi &amp; Total Lembar Akhir</div>
  <div class="calc-box">
    <div class="calc-title">Rumus Alokasi Color (${pctBW}% ke BW &bull; ${pctCol}% Tetap Color):</div>
    <div class="calc-row">
      <span>Color dialihkan ke BW (${pctBW}% &times; ${colPemakaian.toLocaleString('id-ID')}):</span>
      <strong>+${allocBW.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Lembar</strong>
    </div>
    <div class="calc-row">
      <span>Color Murni Tetap (${pctCol}% &times; ${colPemakaian.toLocaleString('id-ID')}):</span>
      <strong>${allocCol.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Lembar</strong>
    </div>
    <hr style="border: none; border-top: 1px dashed #bbf7d0; margin: 8px 0;" />
    <div class="calc-row" style="font-size: 13px; font-weight: 800; color: #0f172a;">
      <span>TOTAL LEMBAR AKHIR BW (Pemakaian Dasar + Alokasi):</span>
      <span style="color: #1e40af;">${totalBW.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Lembar</span>
    </div>
    <div class="calc-row" style="font-size: 13px; font-weight: 800; color: #0f172a;">
      <span>TOTAL LEMBAR AKHIR COLOR (Color Murni):</span>
      <span style="color: #7c3aed;">${totalCol.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Lembar</span>
    </div>
    ${hasDouble ? `
    <div class="calc-row" style="font-size: 11px; color: #475569; margin-top: 8px; padding-top: 6px; border-top: 1px dotted #bbf7d0;">
      <span>Pemakaian Cetak 2-Sided (Duplex Tracking):</span>
      <span>BW: <strong>${bwDblUsage.toLocaleString('id-ID')}</strong> | Colour: <strong>${colDblUsage.toLocaleString('id-ID')}</strong> Lembar</span>
    </div>
    ` : ''}
  </div>

  <div class="signatures">
    <div class="sig-col">
      <div>Dibuat Oleh,</div>
      <div class="sig-line"></div>
      <div><strong>${signerName}</strong></div>
      <div style="font-size: 10px; color: #64748b;">Accounting / Sales Admin</div>
    </div>
    <div class="sig-col">
      <div>Dikonfirmasi / Diterima Oleh,</div>
      <div class="sig-line"></div>
      <div><strong>${custName}</strong></div>
      <div style="font-size: 10px; color: #64748b;">Perwakilan Perusahaan</div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 300);
    };
  <\/script>
</body>
</html>`

    printWindow.document.write(html)
    printWindow.document.close()
  } catch (err: any) {
    console.error('Error printing Great slip:', err)
    toast.error('Gagal mencetak slip Great: ' + (err?.message || 'Error'))
  }
}

function printSlip(item: any) {
  if (isGreat(item)) {
    printGreatSlip(item)
  } else {
    printAtlasSlip(item)
  }
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
    'Awal BW 2-Sided',
    'Akhir BW 2-Sided',
    'Pemakaian Dasar BW',
    'Awal CL',
    'Akhir CL',
    'Awal CL 2-Sided',
    'Akhir CL 2-Sided',
    'Pemakaian Dasar CL',
    '% Alokasi BW',
    '% Alokasi CL',
    'Hasil Alokasi ke BW',
    'Total Akhir Lembar BW',
    'Total Akhir Lembar Color',
    'Catatan',
  ]

  const rows = filteredReadings.value.map((r, i) => {
    const c = r.customer || (customers.value || []).find((cust: any) => cust.id === r.customer_id)
    const cName = getCustomerName(c) || (r.customer_type === 'atlas' ? 'Atlas Copco' : 'PT Great Eastern')
    return [
      i + 1,
      `"${cName}"`,
      r.customer_type === 'standard' ? 'Standar' : `Alokasi (${r.percentage_bw}:${r.percentage_color})`,
      `"${getUnitDisplayName(r)}"`,
      `"${getUnitSN(r)}"`,
      `"${r.period_label || ''}"`,
      r.counter_awal_bw,
      r.counter_akhir_bw,
      r.counter_awal_bw_double || 0,
      r.counter_akhir_bw_double || r.gross_counter_bw_double || 0,
      r.pemakaian_bw_dasar,
      r.counter_awal_color,
      r.counter_akhir_color,
      r.counter_awal_color_double || 0,
      r.counter_akhir_color_double || r.gross_counter_color_double || 0,
      r.pemakaian_color_dasar,
      r.percentage_bw,
      r.percentage_color,
      r.allocation_bw,
      r.total_bw,
      r.total_color,
      `"${r.notes || ''}"`,
    ]
  })

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

// --- Export to Formatted Excel (Sheets per Customer) ---
async function exportExcel() {
  if (filteredReadings.value.length === 0) {
    toast.info('Tidak ada data untuk diekspor')
    return
  }

  try {
    const isAtlasTab = activeTab.value === 'atlas'
    const usedSheetNames = new Set<string>()
    // Group by customer
    const grouped = new Map<string, { customer: any; custName: string; readings: any[] }>()
    for (const r of filteredReadings.value) {
      const c = r.customer || (customers.value || []).find((cust: any) => cust.id === r.customer_id)
      let cName = getCustomerName(c)
      if (!cName || cName === '-') {
        cName = (r.customer_type === 'atlas' || isAtlasTab) ? 'Atlas Copco' : 'PT Great Eastern'
      }
      const cId = r.customer_id || c?.id || cName
      if (!grouped.has(cId)) {
        grouped.set(cId, { customer: c, custName: cName, readings: [] })
      }
      grouped.get(cId)!.readings.push(r)
    }

    const sheets: Array<{ name: string; columnWidths: number[]; rows: StyledCell[][] }> = []

    for (const [, grp] of grouped) {
      const defaultTitle = isAtlasTab ? 'Atlas Copco' : 'PT Great Eastern'
      let custTitle = grp.custName
      if (!custTitle || custTitle === '-' || custTitle === 'Customer') {
        custTitle = defaultTitle
      }
      const sheetName = uniqueSheetName(custTitle, usedSheetNames)
      const columnWidths = isAtlasTab
        ? [5.5, 24, 15, 16, 16, 16, 16, 26, 16, 18]
        : [5.5, 24, 16, 16, 16, 26, 16, 18]
      const mergeWidth = columnWidths.length - 1
      const padEmpty = (cnt: number) => Array.from({ length: cnt }, () => ({}))

      const rows: StyledCell[][] = []
      const addRow = (r: StyledCell[] = []) => rows.push(r)

      addRow([{ v: 'PT. BiAS SURYA TEKNOLOGI', mergeAcross: mergeWidth, style: 'plainBoldCenter' }, ...padEmpty(mergeWidth)])
      addRow([{ v: 'Ruko Purimas Blok A No.47 Kota Batam, Kepulauan Riau - Telp: +62 811 7045 657 | Email: admin@biasbst.com', mergeAcross: mergeWidth, style: 'plainCenter' }, ...padEmpty(mergeWidth)])
      addRow([])
      addRow([{ v: 'LEMBAR PERHITUNGAN PEMAKAIAN METER RENTAL', mergeAcross: mergeWidth, style: 'titleCell' }, ...padEmpty(mergeWidth)])
      addRow([{
        v: isAtlasTab
          ? 'SKEMA: ATLAS COPCO (Deduksi Ukuran A3 & Rumus Alokasi 88% : 12%)'
          : 'SKEMA: PT GREAT EASTERN (Direct Counter & Rumus Alokasi 88% : 12%)',
        mergeAcross: mergeWidth,
        style: 'subTitleCell'
      }, ...padEmpty(mergeWidth)])
      addRow([])

      const latest = grp.readings[0] || {}
      const periodDisplay = latest.period_label || '-'
      const unitDisplay = getUnitDisplayName(latest)
      const snDisplay = getUnitSN(latest)

      const halfMerge = Math.floor(mergeWidth / 2) - 1
      const remMerge = mergeWidth - (halfMerge + 1) - 2

      addRow([
        { v: 'Customer :', style: 'borderBold' },
        { v: grp.custName, mergeAcross: halfMerge, style: 'borderBold' },
        ...padEmpty(halfMerge),
        { v: 'Billing Cycle :', style: 'borderBold' },
        { v: 'Setiap Tanggal 7 (Cut-Off Otomatis)', mergeAcross: remMerge, style: 'borderCenter' },
        ...padEmpty(remMerge),
      ])
      addRow([
        { v: 'Alamat :', style: 'border' },
        { v: grp.customer?.address || '-', mergeAcross: halfMerge, style: 'border' },
        ...padEmpty(halfMerge),
        { v: 'Periode :', style: 'borderBold' },
        { v: periodDisplay, mergeAcross: remMerge, style: 'borderCenter' },
        ...padEmpty(remMerge),
      ])
      addRow([
        { v: 'Unit Mesin :', style: 'border' },
        { v: unitDisplay, mergeAcross: halfMerge, style: 'border' },
        ...padEmpty(halfMerge),
        { v: 'No. Seri (S/N) :', style: 'borderBold' },
        { v: snDisplay, mergeAcross: remMerge, style: 'borderCenter' },
        ...padEmpty(remMerge),
      ])
      addRow([])

      for (let rIdx = 0; rIdx < grp.readings.length; rIdx++) {
        const r = grp.readings[rIdx]
        const curUnit = getUnitDisplayName(r)
        const curSN = getUnitSN(r)
        const curPeriod = r.period_label || periodDisplay

        if (grp.readings.length > 1) {
          addRow([{ v: `Pencatatan #${rIdx + 1} - Unit: ${curUnit} (SN: ${curSN}) | Periode: ${curPeriod}`, mergeAcross: mergeWidth, style: 'plainBold' }, ...padEmpty(mergeWidth)])
        }

        if (isAtlasTab) {
          let pDeducts: Array<{ name: string; bw: number; color: number }> = []
          if (r.paper_deductions) {
            try {
              pDeducts = typeof r.paper_deductions === 'string' ? JSON.parse(r.paper_deductions) : r.paper_deductions
            } catch (e) {}
          }
          const bwDeduksi = pDeducts.length > 0 ? pDeducts.reduce((s, p) => s + Number(p.bw || 0), 0) : Number(r.a3_counter_bw || 0)
          const colDeduksi = pDeducts.length > 0 ? pDeducts.reduce((s, p) => s + Number(p.color || 0), 0) : Number(r.a3_counter_color || 0)
          const deductHeaderLabel = pDeducts.length > 1
            ? `Deduksi Kertas (${pDeducts.map(p => p.name).join('+')}) (-)`
            : (pDeducts.length === 1 ? `Deduksi Ukuran ${pDeducts[0].name} (-)` : 'Deduksi A3 (-)')

          addRow([
            { v: 'No', style: 'headerCell' },
            { v: 'Kategori / Item', style: 'headerCell' },
            { v: 'Counter Awal', style: 'headerCell' },
            { v: 'Gross Mesin', style: 'headerCell' },
            { v: deductHeaderLabel, style: 'headerCell' },
            { v: 'Counter Akhir', style: 'headerCell' },
            { v: 'Pemakaian Dasar', style: 'headerCell' },
            { v: 'Rumus Alokasi (88%:12%)', style: 'headerCell' },
            { v: 'Lembar Alokasi', style: 'headerCell' },
            { v: 'Total Lembar Akhir', style: 'headerCell' },
          ])

          const bwAwal = Number(r.counter_awal_bw || 0)
          const bwGross = Number(r.gross_counter_bw || (Number(r.counter_akhir_bw || 0) + bwDeduksi))
          const bwAkhir = Number(r.counter_akhir_bw || (bwGross - bwDeduksi))
          const bwPemakaian = Number(r.pemakaian_bw_dasar ?? Math.max(0, bwAkhir - bwAwal))

          const colAwal = Number(r.counter_awal_color || 0)
          const colGross = Number(r.gross_counter_color || (Number(r.counter_akhir_color || 0) + colDeduksi))
          const colAkhir = Number(r.counter_akhir_color || (colGross - colDeduksi))
          const colPemakaian = Number(r.pemakaian_color_dasar ?? Math.max(0, colAkhir - colAwal))

          const pctBW = Number(r.percentage_bw || 88)
          const pctCol = Number(r.percentage_color || 12)
          const allocBW = Number(r.allocation_bw || Math.round(colPemakaian * (pctBW / 100) * 100) / 100)
          const allocCol = Number(r.allocation_color || Math.round(colPemakaian * (pctCol / 100) * 100) / 100)

          const totalBW = Number(r.total_bw || Math.round((bwPemakaian + allocBW) * 100) / 100)
          const totalCol = Number(r.total_color || allocCol)
          const grandTotalLembar = Math.round((totalBW + totalCol) * 100) / 100

          addRow([
            { v: 1, style: 'borderCenter' },
            { v: 'Black & White (BW)', style: 'borderBold' },
            { v: bwAwal, style: 'borderRight', numFmt: NUMFMT_COUNT },
            { v: bwGross, style: 'borderRight', numFmt: NUMFMT_COUNT },
            { v: bwDeduksi, style: 'borderRight', numFmt: NUMFMT_COUNT },
            { v: bwAkhir, style: 'borderRight', numFmt: NUMFMT_COUNT },
            { v: bwPemakaian, style: 'borderBoldRight', numFmt: NUMFMT_COUNT },
            { v: `88% dari Pemakaian CL (${colPemakaian.toLocaleString()})`, style: 'borderCenter' },
            { v: allocBW, style: 'borderRight', numFmt: NUMFMT_COUNT },
            { v: totalBW, style: 'borderBoldRight', numFmt: NUMFMT_COUNT },
          ])

          addRow([
            { v: 2, style: 'borderCenter' },
            { v: 'Colour (CL)', style: 'borderBold' },
            { v: colAwal, style: 'borderRight', numFmt: NUMFMT_COUNT },
            { v: colGross, style: 'borderRight', numFmt: NUMFMT_COUNT },
            { v: colDeduksi, style: 'borderRight', numFmt: NUMFMT_COUNT },
            { v: colAkhir, style: 'borderRight', numFmt: NUMFMT_COUNT },
            { v: colPemakaian, style: 'borderBoldRight', numFmt: NUMFMT_COUNT },
            { v: `12% dari Pemakaian CL (${colPemakaian.toLocaleString()})`, style: 'borderCenter' },
            { v: allocCol, style: 'borderRight', numFmt: NUMFMT_COUNT },
            { v: totalCol, style: 'borderBoldRight', numFmt: NUMFMT_COUNT },
          ])

          const hasDouble = (Number(r.counter_akhir_bw_double || r.counter_awal_bw_double || r.gross_counter_bw_double) > 0) ||
                            (Number(r.counter_akhir_color_double || r.counter_awal_color_double || r.gross_counter_color_double) > 0)
          if (hasDouble) {
            const bwDblAwal = Number(r.counter_awal_bw_double || 0)
            const bwDblGross = Number(r.gross_counter_bw_double || 0)
            const bwDblAkhir = Number(r.counter_akhir_bw_double || bwDblGross)
            const bwDblUsage = Math.max(0, bwDblAkhir - bwDblAwal)
            if (bwDblAkhir > 0 || bwDblGross > 0) {
              addRow([
                { v: '2S', style: 'borderCenter' },
                { v: '↳ Black & White (2-Sided)', style: 'border' },
                { v: bwDblAwal, style: 'borderRight', numFmt: NUMFMT_COUNT },
                { v: bwDblGross, style: 'borderRight', numFmt: NUMFMT_COUNT },
                { v: 0, style: 'borderRight', numFmt: NUMFMT_COUNT },
                { v: bwDblAkhir, style: 'borderRight', numFmt: NUMFMT_COUNT },
                { v: bwDblUsage, style: 'borderRight', numFmt: NUMFMT_COUNT },
                { v: '2-Sided Tracking', style: 'borderCenter' },
                { v: 0, style: 'borderRight', numFmt: NUMFMT_COUNT },
                { v: bwDblUsage, style: 'borderRight', numFmt: NUMFMT_COUNT },
              ])
            }
            const colDblAwal = Number(r.counter_awal_color_double || 0)
            const colDblGross = Number(r.gross_counter_color_double || 0)
            const colDblAkhir = Number(r.counter_akhir_color_double || colDblGross)
            const colDblUsage = Math.max(0, colDblAkhir - colDblAwal)
            if (colDblAkhir > 0 || colDblGross > 0) {
              addRow([
                { v: '2S', style: 'borderCenter' },
                { v: '↳ Colour (2-Sided)', style: 'border' },
                { v: colDblAwal, style: 'borderRight', numFmt: NUMFMT_COUNT },
                { v: colDblGross, style: 'borderRight', numFmt: NUMFMT_COUNT },
                { v: 0, style: 'borderRight', numFmt: NUMFMT_COUNT },
                { v: colDblAkhir, style: 'borderRight', numFmt: NUMFMT_COUNT },
                { v: colDblUsage, style: 'borderRight', numFmt: NUMFMT_COUNT },
                { v: '2-Sided Tracking', style: 'borderCenter' },
                { v: 0, style: 'borderRight', numFmt: NUMFMT_COUNT },
                { v: colDblUsage, style: 'borderRight', numFmt: NUMFMT_COUNT },
              ])
            }
          }

          addRow([
            { v: 'SUBTOTAL LEMBAR', mergeAcross: 5, style: 'totalCell' },
            ...padEmpty(5),
            { v: bwPemakaian + colPemakaian, style: 'totalCell', numFmt: NUMFMT_COUNT },
            { v: 'Total Alokasi 100%', style: 'totalCell' },
            { v: allocBW + allocCol, style: 'totalCell', numFmt: NUMFMT_COUNT },
            { v: grandTotalLembar, style: 'grandTotalCell', numFmt: NUMFMT_COUNT },
          ])

          if (pDeducts.length > 1) {
            const detailStr = pDeducts.map(p => `${p.name} (BW: ${Number(p.bw || 0).toLocaleString()}, CL: ${Number(p.color || 0).toLocaleString()})`).join(' | ')
            addRow([{ v: `* Rincian Deduksi per Ukuran Kertas: ${detailStr}`, mergeAcross: mergeWidth, style: 'plain' }, ...padEmpty(mergeWidth)])
          }

          addRow([])
          addRow([{ v: 'Rincian Rumus Alokasi & Rekapitulasi Lembar:', mergeAcross: mergeWidth, style: 'plainBold' }, ...padEmpty(mergeWidth)])
          addRow([{ v: `• Pemakaian Dasar BW = Counter Akhir (${bwAkhir.toLocaleString()}) - Counter Awal (${bwAwal.toLocaleString()}) = ${bwPemakaian.toLocaleString()} Lembar`, mergeAcross: mergeWidth, style: 'plainLeft' }, ...padEmpty(mergeWidth)])
          addRow([{ v: `• Pemakaian Dasar Color = Counter Akhir (${colAkhir.toLocaleString()}) - Counter Awal (${colAwal.toLocaleString()}) = ${colPemakaian.toLocaleString()} Lembar`, mergeAcross: mergeWidth, style: 'plainLeft' }, ...padEmpty(mergeWidth)])
          addRow([{ v: `• Alokasi Color ke BW (88%) = 88% × ${colPemakaian.toLocaleString()} = ${allocBW.toLocaleString()} Lembar`, mergeAcross: mergeWidth, style: 'plainLeft' }, ...padEmpty(mergeWidth)])
          addRow([{ v: `• Alokasi Color Murni (12%) = 12% × ${colPemakaian.toLocaleString()} = ${allocCol.toLocaleString()} Lembar`, mergeAcross: mergeWidth, style: 'plainLeft' }, ...padEmpty(mergeWidth)])
          addRow([{ v: `• TOTAL AKHIR BW = Pemakaian Dasar BW (${bwPemakaian.toLocaleString()}) + Alokasi Color 88% (${allocBW.toLocaleString()}) = ${totalBW.toLocaleString()} Lembar`, mergeAcross: mergeWidth, style: 'plainBold' }, ...padEmpty(mergeWidth)])
          addRow([{ v: `• TOTAL AKHIR COLOR = Alokasi Color Murni 12% = ${totalCol.toLocaleString()} Lembar`, mergeAcross: mergeWidth, style: 'plainBold' }, ...padEmpty(mergeWidth)])
          addRow([{ v: `• GRAND TOTAL PEMAKAIAN = ${grandTotalLembar.toLocaleString()} LEMBAR`, mergeAcross: mergeWidth, style: 'plainBold' }, ...padEmpty(mergeWidth)])
          addRow([])
        } else {
          addRow([
            { v: 'No', style: 'headerCell' },
            { v: 'Kategori / Item', style: 'headerCell' },
            { v: 'Counter Awal', style: 'headerCell' },
            { v: 'Counter Akhir', style: 'headerCell' },
            { v: 'Pemakaian Dasar', style: 'headerCell' },
            { v: 'Rumus Alokasi (88%:12%)', style: 'headerCell' },
            { v: 'Lembar Alokasi', style: 'headerCell' },
            { v: 'Total Lembar Akhir', style: 'headerCell' },
          ])

          const bwAwal = Number(r.counter_awal_bw || 0)
          const bwAkhir = Number(r.counter_akhir_bw || 0)
          const bwPemakaian = Number(r.pemakaian_bw_dasar ?? Math.max(0, bwAkhir - bwAwal))

          const colAwal = Number(r.counter_awal_color || 0)
          const colAkhir = Number(r.counter_akhir_color || 0)
          const colPemakaian = Number(r.pemakaian_color_dasar ?? Math.max(0, colAkhir - colAwal))

          const pctBW = Number(r.percentage_bw || 88)
          const pctCol = Number(r.percentage_color || 12)
          const allocBW = Number(r.allocation_bw || Math.round(colPemakaian * (pctBW / 100) * 100) / 100)
          const allocCol = Number(r.allocation_color || Math.round(colPemakaian * (pctCol / 100) * 100) / 100)

          const totalBW = Number(r.total_bw || Math.round((bwPemakaian + allocBW) * 100) / 100)
          const totalCol = Number(r.total_color || allocCol)
          const grandTotalLembar = Math.round((totalBW + totalCol) * 100) / 100

          addRow([
            { v: 1, style: 'borderCenter' },
            { v: 'Black & White (BW)', style: 'borderBold' },
            { v: bwAwal, style: 'borderRight', numFmt: NUMFMT_COUNT },
            { v: bwAkhir, style: 'borderRight', numFmt: NUMFMT_COUNT },
            { v: bwPemakaian, style: 'borderBoldRight', numFmt: NUMFMT_COUNT },
            { v: `88% dari Pemakaian CL (${colPemakaian.toLocaleString()})`, style: 'borderCenter' },
            { v: allocBW, style: 'borderRight', numFmt: NUMFMT_COUNT },
            { v: totalBW, style: 'borderBoldRight', numFmt: NUMFMT_COUNT },
          ])

          addRow([
            { v: 2, style: 'borderCenter' },
            { v: 'Colour (CL)', style: 'borderBold' },
            { v: colAwal, style: 'borderRight', numFmt: NUMFMT_COUNT },
            { v: colAkhir, style: 'borderRight', numFmt: NUMFMT_COUNT },
            { v: colPemakaian, style: 'borderBoldRight', numFmt: NUMFMT_COUNT },
            { v: `12% dari Pemakaian CL (${colPemakaian.toLocaleString()})`, style: 'borderCenter' },
            { v: allocCol, style: 'borderRight', numFmt: NUMFMT_COUNT },
            { v: totalCol, style: 'borderBoldRight', numFmt: NUMFMT_COUNT },
          ])

          const hasDouble = (Number(r.counter_akhir_bw_double || r.counter_awal_bw_double || r.gross_counter_bw_double) > 0) ||
                            (Number(r.counter_akhir_color_double || r.counter_awal_color_double || r.gross_counter_color_double) > 0)
          if (hasDouble) {
            const bwDblAwal = Number(r.counter_awal_bw_double || 0)
            const bwDblGross = Number(r.gross_counter_bw_double || 0)
            const bwDblAkhir = Number(r.counter_akhir_bw_double || bwDblGross)
            const bwDblUsage = Math.max(0, bwDblAkhir - bwDblAwal)
            if (bwDblAkhir > 0 || bwDblGross > 0) {
              addRow([
                { v: '2S', style: 'borderCenter' },
                { v: '↳ Black & White (2-Sided)', style: 'border' },
                { v: bwDblAwal, style: 'borderRight', numFmt: NUMFMT_COUNT },
                { v: bwDblAkhir, style: 'borderRight', numFmt: NUMFMT_COUNT },
                { v: bwDblUsage, style: 'borderRight', numFmt: NUMFMT_COUNT },
                { v: '2-Sided Tracking', style: 'borderCenter' },
                { v: 0, style: 'borderRight', numFmt: NUMFMT_COUNT },
                { v: bwDblUsage, style: 'borderRight', numFmt: NUMFMT_COUNT },
              ])
            }
            const colDblAwal = Number(r.counter_awal_color_double || 0)
            const colDblGross = Number(r.gross_counter_color_double || 0)
            const colDblAkhir = Number(r.counter_akhir_color_double || colDblGross)
            const colDblUsage = Math.max(0, colDblAkhir - colDblAwal)
            if (colDblAkhir > 0 || colDblGross > 0) {
              addRow([
                { v: '2S', style: 'borderCenter' },
                { v: '↳ Colour (2-Sided)', style: 'border' },
                { v: colDblAwal, style: 'borderRight', numFmt: NUMFMT_COUNT },
                { v: colDblAkhir, style: 'borderRight', numFmt: NUMFMT_COUNT },
                { v: colDblUsage, style: 'borderRight', numFmt: NUMFMT_COUNT },
                { v: '2-Sided Tracking', style: 'borderCenter' },
                { v: 0, style: 'borderRight', numFmt: NUMFMT_COUNT },
                { v: colDblUsage, style: 'borderRight', numFmt: NUMFMT_COUNT },
              ])
            }
          }

          addRow([
            { v: 'SUBTOTAL LEMBAR', mergeAcross: 3, style: 'totalCell' },
            ...padEmpty(3),
            { v: bwPemakaian + colPemakaian, style: 'totalCell', numFmt: NUMFMT_COUNT },
            { v: 'Total Alokasi 100%', style: 'totalCell' },
            { v: allocBW + allocCol, style: 'totalCell', numFmt: NUMFMT_COUNT },
            { v: grandTotalLembar, style: 'grandTotalCell', numFmt: NUMFMT_COUNT },
          ])

          addRow([])
          addRow([{ v: 'Rincian Rumus Alokasi & Rekapitulasi Lembar:', mergeAcross: mergeWidth, style: 'plainBold' }, ...padEmpty(mergeWidth)])
          addRow([{ v: `• Pemakaian Dasar BW = Counter Akhir (${bwAkhir.toLocaleString()}) - Counter Awal (${bwAwal.toLocaleString()}) = ${bwPemakaian.toLocaleString()} Lembar`, mergeAcross: mergeWidth, style: 'plainLeft' }, ...padEmpty(mergeWidth)])
          addRow([{ v: `• Pemakaian Dasar Color = Counter Akhir (${colAkhir.toLocaleString()}) - Counter Awal (${colAwal.toLocaleString()}) = ${colPemakaian.toLocaleString()} Lembar`, mergeAcross: mergeWidth, style: 'plainLeft' }, ...padEmpty(mergeWidth)])
          addRow([{ v: `• Alokasi Color ke BW (88%) = 88% × ${colPemakaian.toLocaleString()} = ${allocBW.toLocaleString()} Lembar`, mergeAcross: mergeWidth, style: 'plainLeft' }, ...padEmpty(mergeWidth)])
          addRow([{ v: `• Alokasi Color Murni (12%) = 12% × ${colPemakaian.toLocaleString()} = ${allocCol.toLocaleString()} Lembar`, mergeAcross: mergeWidth, style: 'plainLeft' }, ...padEmpty(mergeWidth)])
          addRow([{ v: `• TOTAL AKHIR BW = Pemakaian Dasar BW (${bwPemakaian.toLocaleString()}) + Alokasi Color 88% (${allocBW.toLocaleString()}) = ${totalBW.toLocaleString()} Lembar`, mergeAcross: mergeWidth, style: 'plainBold' }, ...padEmpty(mergeWidth)])
          addRow([{ v: `• TOTAL AKHIR COLOR = Alokasi Color Murni 12% = ${totalCol.toLocaleString()} Lembar`, mergeAcross: mergeWidth, style: 'plainBold' }, ...padEmpty(mergeWidth)])
          addRow([{ v: `• GRAND TOTAL PEMAKAIAN = ${grandTotalLembar.toLocaleString()} LEMBAR`, mergeAcross: mergeWidth, style: 'plainBold' }, ...padEmpty(mergeWidth)])
          addRow([])
        }
      }

      // Blok Otorisasi / Tanda Tangan
      addRow([])
      const sigHalf = Math.floor(mergeWidth / 2)
      const sigRem = mergeWidth - sigHalf - 1
      addRow([
        { v: 'Received By,', mergeAcross: sigHalf, style: 'plainBoldCenter' },
        ...padEmpty(sigHalf),
        { v: 'PT. BiAS SURYA TEKNOLOGI', mergeAcross: sigRem, style: 'plainBoldCenter' },
        ...padEmpty(sigRem),
      ])
      addRow([])
      addRow([])
      addRow([
        { v: '_______________________', mergeAcross: sigHalf, style: 'plainCenter' },
        ...padEmpty(sigHalf),
        { v: '_______________________', mergeAcross: sigRem, style: 'plainCenter' },
        ...padEmpty(sigRem),
      ])
      addRow([
        { v: `( ${grp.custName} )`, mergeAcross: sigHalf, style: 'plainBoldCenter' },
        ...padEmpty(sigHalf),
        { v: '( Admin Finance / Technical )', mergeAcross: sigRem, style: 'plainBoldCenter' },
        ...padEmpty(sigRem),
      ])

      sheets.push({ name: sheetName, columnWidths, rows })
    }

    const titlePrefix = isAtlasTab ? 'Atlas_Copco' : 'Great_Eastern'
    await downloadStyledExcel(sheets, `Perhitungan_Meter_${titlePrefix}_${new Date().toISOString().slice(0, 10)}`)
    toast.success('File Excel perhitungan meter berhasil diunduh')
  } catch (err: any) {
    toast.error('Gagal mengekspor file Excel: ' + (err?.message || 'Error'))
  }
}
</script>

<template>
  <div class="atlas-great-page">
    <PageHeader
      :title="activeTab === 'atlas' ? 'Pencatatan Lembar Pemakaian - Atlas Copco' : 'Pencatatan Lembar Pemakaian - PT Great Eastern'"
      :buttonLabel="activeTab === 'atlas' ? '+ Hitung Pencatatan Atlas' : '+ Hitung Pencatatan Great'"
      @add="openAddModal(activeTab)"
    >
      <template #actions>
        <button
          type="button"
          class="btn btn-primary btn-sm btn-excel-top"
          title="Export data ke Excel (Sheet per Customer)"
          @click="exportExcel"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="3" y1="9" x2="21" y2="9"></line>
            <line x1="9" y1="21" x2="9" y2="9"></line>
          </svg>
          Export Excel
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          title="Export data ke CSV"
          @click="exportCSV"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          Export CSV
        </button>
      </template>
    </PageHeader>

    <!-- Info banner penjelasan modul terpisah Atlas vs Great -->
    <div class="info-card" :class="activeTab === 'atlas' ? 'info-card-atlas' : 'info-card-great'">
      <div class="info-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </div>
      <div class="info-content">
        <div class="info-title">
          {{ activeTab === 'atlas' ? 'Perhitungan Lembar Pemakaian Khusus Atlas Copco (Deduksi A3 & Alokasi 88:12)' : 'Perhitungan Lembar Pemakaian Khusus PT Great Eastern (Direct Meter & Alokasi 88:12)' }}
        </div>
        <div class="info-desc" v-if="activeTab === 'atlas'">
          Teknisi mencatat meter reading fisik di lapangan tanggal 25–30. Untuk <strong>Atlas Copco</strong>, perhitungan menggunakan deduksi lembar A3:
          <strong>Last Meter (Counter Akhir) = Gross Mesin Total &minus; Deduksi A3</strong>, kemudian pemakaian color dialokasikan <strong>88% ke BW</strong> dan <strong>12% Color Murni</strong>.
          Siklus billing otomatis diterbitkan setiap <strong>tanggal 7</strong>.
        </div>
        <div class="info-desc" v-else>
          Teknisi mencatat meter reading fisik di lapangan tanggal 25–30. Untuk <strong>PT Great Eastern</strong>, perhitungan menggunakan pemakaian langsung (Direct Counter):
          <strong>Pemakaian Dasar = Counter Akhir &minus; Counter Awal</strong> (tanpa deduksi A3), kemudian pemakaian color dialokasikan <strong>88% ke BW</strong> dan <strong>12% Color Murni</strong>.
          Siklus billing otomatis diterbitkan setiap <strong>tanggal 7</strong>.
        </div>
      </div>
    </div>

    <!-- Filter Bar & Tabs (Tepat 2 Tab Terpisah) -->
    <div class="filter-container">
      <div class="tabs-group">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'atlas' }"
          @click="activeTab = 'atlas'"
        >
          <span class="tab-indicator indicator-atlas"></span>
          Perhitungan Atlas
          <span class="badge-count">{{ readings.filter(isAtlas).length }}</span>
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'great' }"
          @click="activeTab = 'great'"
        >
          <span class="tab-indicator indicator-great"></span>
          Perhitungan Great
          <span class="badge-count">{{ readings.filter(isGreat).length }}</span>
        </button>
      </div>

      <div class="filter-controls">
        <div class="filter-item">
          <label class="filter-label">Customer:</label>
          <select v-model="filterCustomer" class="filter-select max-w-xs">
            <option v-for="opt in tabCustomerFilterOptions" :key="opt.value" :value="opt.value">
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
            placeholder="Cari Unit, atau SN..."
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
              v-if="isAtlas(item)"
              class="badge-type badge-atlas"
            >
              Atlas Copco (88% : 12%)
            </span>
            <span
              v-else
              class="badge-type badge-great"
            >
              Great Eastern (88% : 12%)
            </span>
          </div>
        </template>

        <template #cell(unit)="{ item }">
          <div class="font-semibold text-slate-800">
            {{ getUnitDisplayName(item) }}
          </div>
          <div class="text-xs text-slate-500 font-mono">
            SN: {{ getUnitSN(item) }}
          </div>
        </template>

        <template #cell(meter_bw)="{ item }">
          <div class="text-xs">
            <span class="text-slate-500">Awal:</span> <strong>{{ Number(item.counter_awal_bw || 0).toLocaleString() }}</strong>
          </div>
          <div class="text-xs">
            <span class="text-slate-500">Akhir:</span> <strong>{{ Number(item.counter_akhir_bw || 0).toLocaleString() }}</strong>
          </div>
          <div v-if="Number(item.counter_akhir_bw_double || item.counter_awal_bw_double || item.gross_counter_bw_double) > 0" class="text-[10px] text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded border border-indigo-100 font-mono mt-0.5">
            2-S: {{ Number(item.counter_awal_bw_double || 0).toLocaleString() }} → {{ Number(item.counter_akhir_bw_double || item.gross_counter_bw_double || 0).toLocaleString() }}
          </div>
          <div v-if="activeTab === 'atlas' && (Number(item.gross_counter_bw) > 0 || Number(item.a3_counter_bw) > 0)" class="text-[10px] text-slate-500 mt-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 font-mono">
            Gross: {{ Number(item.gross_counter_bw || 0).toLocaleString() }} | {{ getDeductionSummary(item, 'bw') }}
          </div>
        </template>

        <template #cell(meter_color)="{ item }">
          <div class="text-xs">
            <span class="text-slate-500">Awal:</span> <strong>{{ Number(item.counter_awal_color || 0).toLocaleString() }}</strong>
          </div>
          <div class="text-xs">
            <span class="text-slate-500">Akhir:</span> <strong>{{ Number(item.counter_akhir_color || 0).toLocaleString() }}</strong>
          </div>
          <div v-if="Number(item.counter_akhir_color_double || item.counter_awal_color_double || item.gross_counter_color_double) > 0" class="text-[10px] text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded border border-indigo-100 font-mono mt-0.5">
            2-S: {{ Number(item.counter_awal_color_double || 0).toLocaleString() }} → {{ Number(item.counter_akhir_color_double || item.gross_counter_color_double || 0).toLocaleString() }}
          </div>
          <div v-if="activeTab === 'atlas' && (Number(item.gross_counter_color) > 0 || Number(item.a3_counter_color) > 0)" class="text-[10px] text-slate-500 mt-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 font-mono">
            Gross: {{ Number(item.gross_counter_color || 0).toLocaleString() }} | {{ getDeductionSummary(item, 'color') }}
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
          <div class="text-xs">
            <span class="text-slate-500">{{ Number(item.percentage_bw || 88) }}% ke BW:</span>
            <strong>+{{ Number(item.allocation_bw || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</strong>
          </div>
          <div class="text-xs">
            <span class="text-slate-500">{{ Number(item.percentage_color || 12) }}% CL:</span>
            <strong>{{ Number(item.allocation_color || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</strong>
          </div>
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

        <template #actions="{ item, row }">
          <div class="action-btns">
            <button
              type="button"
              class="btn-icon"
              :title="isAtlas(item || row) ? 'Detail Kalkulasi & Laporan Epson' : 'Detail Kalkulasi Lembar'"
              @click.stop="openDetail(item || row)"
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
              :title="isAtlas(item || row) ? 'Cetak Slip Epson' : 'Cetak Slip Great'"
              @click.stop="printSlip(item || row)"
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
              @click.stop="openEditModal(item || row)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </button>
            <button
              v-if="canDeleteReading"
              type="button"
              class="btn-icon btn-icon-delete"
              title="Hapus Pencatatan"
              @click.stop="confirmDelete(item || row)"
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
      :title="isEditing ? `Edit Pencatatan Lembar (${form.customer_type === 'atlas' ? 'Atlas' : 'Great'})` : `Hitung / Tambah Pencatatan Lembar - ${form.customer_type === 'atlas' ? 'Atlas Copco' : 'PT Great Eastern'}`"
      :submitLabel="isEditing ? 'Perbarui' : 'Simpan Pencatatan'"
      maxWidth="780px"
      @close="showModal = false"
      @submit="handleSubmit"
    >
      <div class="form-grid">
        <!-- Switcher Type (Khusus Mode Tambah Data) -->
        <div v-if="!isEditing" class="modal-type-switcher full-width">
          <button
            type="button"
            class="type-switch-btn"
            :class="{ active: form.customer_type === 'atlas' }"
            @click="switchModalType('atlas')"
          >
            <span class="dot dot-atlas"></span>
            Perhitungan Atlas (Deduksi A3 + 88:12)
          </button>
          <button
            type="button"
            class="type-switch-btn"
            :class="{ active: form.customer_type === 'great' }"
            @click="switchModalType('great')"
          >
            <span class="dot dot-great"></span>
            Perhitungan Great (Direct + 88:12)
          </button>
        </div>

        <!-- Pilihan Berdasarkan Rental Invoice -->
        <div class="form-group full-width" style="background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 8px; padding: 12px 14px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <label class="form-label" style="margin-bottom: 0; font-weight: 700; color: #1e40af; display: flex; align-items: center; gap: 6px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
              Pilih Berdasarkan Rental Invoice (Otomatis Customer &amp; Unit Terpilih)
            </label>
            <span v-if="form.rental_invoice_id" class="badge-mini badge-great" style="cursor: pointer; padding: 2px 8px; font-size: 11px;" @click="form.rental_invoice_id = ''">
              &times; Reset Pilihan Invoice
            </span>
          </div>
          <CustomSelect
            v-model="form.rental_invoice_id"
            :options="rentalInvoiceOptions"
            placeholder="-- Pilih Rental Invoice (Unit &amp; Customer akan otomatis terpilih) --"
            @update:modelValue="onRentalInvoiceChange"
          />
          <div v-if="form.rental_invoice_id" style="margin-top: 6px; font-size: 12px; color: #16a34a; display: flex; align-items: center; gap: 4px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Unit mesin, customer, dan periode otomatis terhubung dengan Rental Invoice terpilih.
          </div>
        </div>

        <!-- Customer & Unit Selection -->
        <div class="form-group">
          <label class="form-label required">Customer / Perusahaan</label>
          <CustomSelect
            v-model="form.customer_id"
            :options="modalCustomerOptions"
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
            :placeholder="!form.customer_id ? 'Pilih Customer terlebih dahulu...' : isLoadingCustomerUnits ? 'Sedang memuat unit rental...' : 'Pilih Unit Mesin...'"
            :disabled="!form.customer_id || isLoadingCustomerUnits"
            @update:modelValue="onUnitChange"
          />
          <div v-if="form.customer_id && !isLoadingCustomerUnits && customerRentedUnits.length === 0" style="margin-top: 6px; font-size: 12px; color: #2563eb; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <span>ℹ️ Menampilkan semua unit printer/copier tersedia (dapat langsung dipilih).</span>
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

        <!-- ALERT ATURAN TANGGAL 7 KHUSUS ATLAS & GREAT -->
        <div v-if="!isEditing" class="cutoff-notice-card full-width" :class="{ 'warning-mode': currentDay !== 7 }">
          <div class="notice-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span class="font-bold">Siklus Billing: Tanggal 7 Setiap Bulan</span>
          </div>
          <div class="notice-body">
            Meter reading dicatat oleh teknisi pada rentang tanggal 25–30 setiap akhir bulan. Perhitungan alokasi lembar untuk customer <strong>{{ form.customer_type === 'atlas' ? 'Atlas Copco' : 'PT Great Eastern' }}</strong> diterbitkan setiap <strong>tanggal 7</strong>, dan tanggal pembacaan otomatis dikunci pada <strong>tanggal 7</strong>.
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
            <span class="text-xs text-blue-600 font-normal ml-2">
              (Terkunci otomatis ke tanggal 7)
            </span>
          </label>
          <input
            v-model="form.reading_date"
            type="date"
            class="form-input"
            disabled
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

        <!-- BANNER KETENTUAN MASA KONTRAK & VISIT TERAKHIR KHUSUS ATLAS -->
        <div
          v-if="form.customer_type === 'atlas' && selectedInvoiceContractInfo?.labelRange"
          class="atlas-contract-status-box full-width"
          :class="selectedInvoiceContractInfo.isLastVisit ? 'is-last-visit' : 'is-intermediate-visit'"
        >
          <div class="status-box-header">
            <span class="status-icon">{{ selectedInvoiceContractInfo.isLastVisit ? '🎯' : 'ℹ️' }}</span>
            <div class="status-text">
              <div class="status-title">
                <span v-if="selectedInvoiceContractInfo.isLastVisit">
                  ★ Visit Terakhir Masa Kontrak (Periode Kontrak: {{ selectedInvoiceContractInfo.labelRange }})
                </span>
                <span v-else>
                  Masa Kontrak: {{ selectedInvoiceContractInfo.labelRange }} (Bukan Visit Terakhir)
                </span>
              </div>
              <div class="status-desc">
                <span v-if="selectedInvoiceContractInfo.isLastVisit">
                  Sesuai ketentuan Atlas Copco, perhitungan lembar pemakaian diterbitkan pada <strong>visit terakhir kontrak</strong>. Counter Awal dihitung akumulasi sejak awal kontrak ({{ Number(form.start_meter_bw).toLocaleString() }} BW / {{ Number(form.start_meter_color).toLocaleString() }} CL) hingga pembacaan fisik visit terakhir ({{ Number(form.gross_meter_bw).toLocaleString() }} BW / {{ Number(form.gross_meter_color).toLocaleString() }} CL).
                </span>
                <span v-else>
                  Catatan: Berdasarkan ketentuan Atlas Copco, perhitungan lembar pemakaian dihitung dan diterbitkan pada <strong>visit terakhir kontrak</strong>. Pilihan bulan ini tetap dapat diproses dan Counter Awal otomatis diakumulasikan dari awal kontrak.
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- COUNTER INPUTS (Kondisional: Atlas ada Gross & Deduksi Kertas Dinamis, Great hanya Awal & Akhir) -->
        <div class="counter-box full-width">
          <div class="counter-box-header" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>Rincian Pembacaan Counter (Meter Reading)</span>
              <span class="badge-mini" :class="form.customer_type === 'atlas' ? 'badge-atlas' : 'badge-great'">
                {{ form.customer_type === 'atlas' ? 'Metode Atlas (Gross & Deduksi Kertas)' : 'Metode Great (Direct Meter)' }}
              </span>
            </div>

            <!-- Toolbar Kertas Printer Khusus Atlas -->
            <div v-if="form.customer_type === 'atlas'" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <span style="font-size: 11px; color: #475569; font-weight: 500;">Kertas Deduksi:</span>
              <span
                v-for="pd in form.paper_deductions"
                :key="'badge-' + pd.name"
                class="px-2 py-0.5 text-xs font-semibold rounded bg-blue-50 text-blue-700 border border-blue-200"
              >
                {{ pd.name }}
              </span>
              <button
                v-if="!form.paper_deductions.some(d => d.name === 'A3')"
                type="button"
                style="padding: 2px 8px; font-size: 11px; border: 1px dashed #3b82f6; color: #2563eb; background: #eff6ff; border-radius: 4px; cursor: pointer; font-weight: 500;"
                title="Tambah deduksi kertas A3"
                @click="addPredefinedPaper('A3')"
              >
                + A3
              </button>
              <button
                v-if="!form.paper_deductions.some(d => d.name === 'FOLIO' || d.name === 'F4')"
                type="button"
                style="padding: 2px 8px; font-size: 11px; border: 1px dashed #3b82f6; color: #2563eb; background: #eff6ff; border-radius: 4px; cursor: pointer; font-weight: 500;"
                title="Tambah deduksi kertas Folio / F4"
                @click="addPredefinedPaper('Folio')"
              >
                + Folio
              </button>
              <button
                v-if="!form.paper_deductions.some(d => d.name === 'LEGAL')"
                type="button"
                style="padding: 2px 8px; font-size: 11px; border: 1px dashed #3b82f6; color: #2563eb; background: #eff6ff; border-radius: 4px; cursor: pointer; font-weight: 500;"
                title="Tambah deduksi kertas Legal"
                @click="addPredefinedPaper('Legal')"
              >
                + Legal
              </button>
              <button
                type="button"
                style="padding: 2px 8px; font-size: 11px; border: 1px dashed #64748b; color: #475569; background: #f8fafc; border-radius: 4px; cursor: pointer; font-weight: 500;"
                @click="promptAddPaper"
              >
                + Tambah Kertas Lain...
              </button>
            </div>
          </div>

          <div class="counter-inputs-grid">
            <!-- BW Section -->
            <div class="counter-col">
              <div class="counter-col-title">BLACK & WHITE (BW)</div>
              
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <div class="form-group">
                  <label class="form-label">Awal BW (1-Sided)</label>
                  <input
                    v-model.number="form.start_meter_bw"
                    type="number"
                    min="0"
                    class="form-input"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Awal BW (2-Sided)</label>
                  <input
                    v-model.number="form.start_meter_bw_double"
                    type="number"
                    min="0"
                    class="form-input"
                  />
                </div>
              </div>

              <!-- KHUSUS ATLAS: Gross & Deduksi Kertas Multi-Ukuran -->
              <template v-if="form.customer_type === 'atlas'">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                  <div class="form-group">
                    <label class="form-label">Gross Total BW (1-Sided)</label>
                    <input
                      v-model.number="form.gross_meter_bw"
                      type="number"
                      min="0"
                      class="form-input"
                      placeholder="1-Sided"
                      @input="onGrossOrDeductionChange"
                    />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Gross Total BW (2-Sided)</label>
                    <input
                      v-model.number="form.gross_meter_bw_double"
                      type="number"
                      min="0"
                      class="form-input"
                      placeholder="2-Sided"
                      @input="onGrossOrDeductionChange"
                    />
                  </div>
                </div>

                <!-- Input Deduksi per Ukuran Kertas Dinamis -->
                <div
                  v-for="(pd, pIdx) in form.paper_deductions"
                  :key="'deduct-bw-' + pd.name + '-' + pIdx"
                  class="form-group"
                  style="margin-bottom: 8px;"
                >
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                    <label class="form-label" style="margin-bottom: 0;">
                      Deduksi {{ pd.name }} B&amp;W (-)
                    </label>
                    <button
                      v-if="form.paper_deductions.length > 1"
                      type="button"
                      style="font-size: 11px; color: #ef4444; background: none; border: none; cursor: pointer; padding: 0 4px;"
                      title="Hapus ukuran kertas ini"
                      @click="removePaperDeduction(pIdx)"
                    >
                      &times; Hapus
                    </button>
                  </div>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <input
                      v-model.number="pd.bw"
                      type="number"
                      min="0"
                      class="form-input"
                      :placeholder="'1-Sided ' + pd.name"
                      @input="onGrossOrDeductionChange"
                    />
                    <input
                      v-model.number="pd.bw_double"
                      type="number"
                      min="0"
                      class="form-input"
                      :placeholder="'2-Sided ' + pd.name"
                      @input="onGrossOrDeductionChange"
                    />
                  </div>
                </div>

                <div v-if="form.paper_deductions && form.paper_deductions.length > 1" class="text-xs text-slate-500 mb-2 font-medium">
                  Total Deduksi BW: <strong class="text-slate-800">1-S: {{ totalDeductionBW }} | 2-S: {{ totalDeductionBWDouble }}</strong>
                </div>
              </template>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <div class="form-group">
                  <label class="form-label">
                    {{ form.customer_type === 'atlas' ? 'Akhir BW (1-S)' : 'Akhir BW (1-S)' }}
                  </label>
                  <input
                    v-model.number="form.end_meter_bw"
                    type="number"
                    min="0"
                    class="form-input"
                    style="font-weight: 700; color: #1e3a8a;"
                  />
                  <small v-if="form.customer_type === 'atlas' && (form.gross_meter_bw > 0 || totalDeductionBW > 0)" class="text-muted" style="font-size: 10px;">
                    = {{ form.gross_meter_bw }} - {{ totalDeductionBW }}
                  </small>
                </div>
                <div class="form-group">
                  <label class="form-label">
                    {{ form.customer_type === 'atlas' ? 'Akhir BW (2-S)' : 'Akhir BW (2-S)' }}
                  </label>
                  <input
                    v-model.number="form.end_meter_bw_double"
                    type="number"
                    min="0"
                    class="form-input"
                    style="font-weight: 700; color: #1e3a8a;"
                  />
                  <small v-if="form.customer_type === 'atlas' && (form.gross_meter_bw_double > 0 || totalDeductionBWDouble > 0)" class="text-muted" style="font-size: 10px;">
                    = {{ form.gross_meter_bw_double }} - {{ totalDeductionBWDouble }}
                  </small>
                </div>
              </div>

              <div class="counter-calc-badge">
                <span>Pemakaian Dasar BW:</span>
                <strong>{{ calcBaseUsageBW.toLocaleString() }} (1-S) | {{ calcBaseUsageBWDouble.toLocaleString() }} (2-S)</strong>
              </div>
            </div>

            <!-- Color Section -->
            <div class="counter-col">
              <div class="counter-col-title color-title">COLOR (CL)</div>
              
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <div class="form-group">
                  <label class="form-label">Awal Color (1-Sided)</label>
                  <input
                    v-model.number="form.start_meter_color"
                    type="number"
                    min="0"
                    class="form-input"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Awal Color (2-Sided)</label>
                  <input
                    v-model.number="form.start_meter_color_double"
                    type="number"
                    min="0"
                    class="form-input"
                  />
                </div>
              </div>

              <!-- KHUSUS ATLAS: Gross & Deduksi Kertas Multi-Ukuran -->
              <template v-if="form.customer_type === 'atlas'">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                  <div class="form-group">
                    <label class="form-label">Gross Total Color (1-Sided)</label>
                    <input
                      v-model.number="form.gross_meter_color"
                      type="number"
                      min="0"
                      class="form-input"
                      placeholder="1-Sided"
                      @input="onGrossOrDeductionChange"
                    />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Gross Total Color (2-Sided)</label>
                    <input
                      v-model.number="form.gross_meter_color_double"
                      type="number"
                      min="0"
                      class="form-input"
                      placeholder="2-Sided"
                      @input="onGrossOrDeductionChange"
                    />
                  </div>
                </div>

                <!-- Input Deduksi per Ukuran Kertas Dinamis -->
                <div
                  v-for="(pd, pIdx) in form.paper_deductions"
                  :key="'deduct-cl-' + pd.name + '-' + pIdx"
                  class="form-group"
                  style="margin-bottom: 8px;"
                >
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                    <label class="form-label" style="margin-bottom: 0;">
                      Deduksi {{ pd.name }} Color (-)
                    </label>
                    <button
                      v-if="form.paper_deductions.length > 1"
                      type="button"
                      style="font-size: 11px; color: #ef4444; background: none; border: none; cursor: pointer; padding: 0 4px;"
                      title="Hapus ukuran kertas ini"
                      @click="removePaperDeduction(pIdx)"
                    >
                      &times; Hapus
                    </button>
                  </div>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <input
                      v-model.number="pd.color"
                      type="number"
                      min="0"
                      class="form-input"
                      :placeholder="'1-Sided ' + pd.name"
                      @input="onGrossOrDeductionChange"
                    />
                    <input
                      v-model.number="pd.color_double"
                      type="number"
                      min="0"
                      class="form-input"
                      :placeholder="'2-Sided ' + pd.name"
                      @input="onGrossOrDeductionChange"
                    />
                  </div>
                </div>

                <div v-if="form.paper_deductions && form.paper_deductions.length > 1" class="text-xs text-slate-500 mb-2 font-medium">
                  Total Deduksi Color: <strong class="text-slate-800">1-S: {{ totalDeductionColor }} | 2-S: {{ totalDeductionColorDouble }}</strong>
                </div>
              </template>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <div class="form-group">
                  <label class="form-label">
                    {{ form.customer_type === 'atlas' ? 'Akhir Color (1-S)' : 'Akhir Color (1-S)' }}
                  </label>
                  <input
                    v-model.number="form.end_meter_color"
                    type="number"
                    min="0"
                    class="form-input"
                    style="font-weight: 700; color: #1e3a8a;"
                  />
                  <small v-if="form.customer_type === 'atlas' && (form.gross_meter_color > 0 || totalDeductionColor > 0)" class="text-muted" style="font-size: 10px;">
                    = {{ form.gross_meter_color }} - {{ totalDeductionColor }}
                  </small>
                </div>
                <div class="form-group">
                  <label class="form-label">
                    {{ form.customer_type === 'atlas' ? 'Akhir Color (2-S)' : 'Akhir Color (2-S)' }}
                  </label>
                  <input
                    v-model.number="form.end_meter_color_double"
                    type="number"
                    min="0"
                    class="form-input"
                    style="font-weight: 700; color: #1e3a8a;"
                  />
                  <small v-if="form.customer_type === 'atlas' && (form.gross_meter_color_double > 0 || totalDeductionColorDouble > 0)" class="text-muted" style="font-size: 10px;">
                    = {{ form.gross_meter_color_double }} - {{ totalDeductionColorDouble }}
                  </small>
                </div>
              </div>

              <div class="counter-calc-badge color-calc-badge">
                <span>Pemakaian Dasar Color:</span>
                <strong>{{ calcBaseUsageColor.toLocaleString() }} (1-S) | {{ calcBaseUsageColorDouble.toLocaleString() }} (2-S)</strong>
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
            <span>Preview Kalkulasi Lembar Pemakaian ({{ form.customer_type === 'atlas' ? 'Atlas Copco' : 'PT Great Eastern' }} &bull; Rumus Alokasi 88% : 12%)</span>
          </div>

          <table class="excel-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Counter Awal</th>
                <th v-if="form.customer_type === 'atlas'">Gross Mesin</th>
                <template v-if="form.customer_type === 'atlas'">
                  <th v-for="pd in form.paper_deductions" :key="'th-pd-' + pd.name">
                    Deduksi {{ pd.name }}
                  </th>
                  <th v-if="form.paper_deductions && form.paper_deductions.length > 1">Total Deduksi</th>
                </template>
                <th>Counter Akhir</th>
                <th class="cell-highlight">Pemakaian</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>BW (1-Sided)</strong></td>
                <td>{{ Number(form.start_meter_bw || 0).toLocaleString() }}</td>
                <td v-if="form.customer_type === 'atlas'">{{ Number(form.gross_meter_bw || 0).toLocaleString() }}</td>
                <template v-if="form.customer_type === 'atlas'">
                  <td v-for="pd in form.paper_deductions" :key="'td-bw-' + pd.name">
                    {{ Number(pd.bw || 0).toLocaleString() }}
                  </td>
                  <td v-if="form.paper_deductions && form.paper_deductions.length > 1" style="font-weight: 600;">
                    {{ totalDeductionBW.toLocaleString() }}
                  </td>
                </template>
                <td>{{ Number(form.end_meter_bw || 0).toLocaleString() }}</td>
                <td class="cell-highlight">{{ calcBaseUsageBW.toLocaleString() }}</td>
              </tr>
              <tr v-if="form.gross_meter_bw_double > 0 || form.end_meter_bw_double > 0 || totalDeductionBWDouble > 0 || form.start_meter_bw_double > 0">
                <td><strong>BW (2-Sided)</strong></td>
                <td>{{ Number(form.start_meter_bw_double || 0).toLocaleString() }}</td>
                <td v-if="form.customer_type === 'atlas'">{{ Number(form.gross_meter_bw_double || 0).toLocaleString() }}</td>
                <template v-if="form.customer_type === 'atlas'">
                  <td v-for="pd in form.paper_deductions" :key="'td-bw-dbl-' + pd.name">
                    {{ Number(pd.bw_double || 0).toLocaleString() }}
                  </td>
                  <td v-if="form.paper_deductions && form.paper_deductions.length > 1" style="font-weight: 600;">
                    {{ totalDeductionBWDouble.toLocaleString() }}
                  </td>
                </template>
                <td>{{ Number(form.end_meter_bw_double || 0).toLocaleString() }}</td>
                <td class="cell-highlight">{{ calcBaseUsageBWDouble.toLocaleString() }}</td>
              </tr>
              <tr>
                <td><strong>COLOR (1-Sided)</strong></td>
                <td>{{ Number(form.start_meter_color || 0).toLocaleString() }}</td>
                <td v-if="form.customer_type === 'atlas'">{{ Number(form.gross_meter_color || 0).toLocaleString() }}</td>
                <template v-if="form.customer_type === 'atlas'">
                  <td v-for="pd in form.paper_deductions" :key="'td-col-' + pd.name">
                    {{ Number(pd.color || 0).toLocaleString() }}
                  </td>
                  <td v-if="form.paper_deductions && form.paper_deductions.length > 1" style="font-weight: 600;">
                    {{ totalDeductionColor.toLocaleString() }}
                  </td>
                </template>
                <td>{{ Number(form.end_meter_color || 0).toLocaleString() }}</td>
                <td class="cell-highlight">{{ calcBaseUsageColor.toLocaleString() }}</td>
              </tr>
              <tr v-if="form.gross_meter_color_double > 0 || form.end_meter_color_double > 0 || totalDeductionColorDouble > 0 || form.start_meter_color_double > 0">
                <td><strong>COLOR (2-Sided)</strong></td>
                <td>{{ Number(form.start_meter_color_double || 0).toLocaleString() }}</td>
                <td v-if="form.customer_type === 'atlas'">{{ Number(form.gross_meter_color_double || 0).toLocaleString() }}</td>
                <template v-if="form.customer_type === 'atlas'">
                  <td v-for="pd in form.paper_deductions" :key="'td-col-dbl-' + pd.name">
                    {{ Number(pd.color_double || 0).toLocaleString() }}
                  </td>
                  <td v-if="form.paper_deductions && form.paper_deductions.length > 1" style="font-weight: 600;">
                    {{ totalDeductionColorDouble.toLocaleString() }}
                  </td>
                </template>
                <td>{{ Number(form.end_meter_color_double || 0).toLocaleString() }}</td>
                <td class="cell-highlight">{{ calcBaseUsageColorDouble.toLocaleString() }}</td>
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
        <!-- Tab Selector: Rumus Pencatatan vs Output Mesin Epson (Hanya untuk Atlas) -->
        <div v-if="isAtlas(detailItem)" class="detail-nav-pills">
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
        <div v-if="detailTab === 'formula' || !isAtlas(detailItem)" class="detail-container">
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
                {{ getUnitDisplayName(detailItem) }} (SN: {{ getUnitSN(detailItem) }})
              </div>
            </div>
            <div>
              <span class="meta-label">Skema Perhitungan:</span>
              <div class="meta-value font-medium">
                {{ isAtlas(detailItem) ? 'Skema Atlas Copco (Deduksi A3 & Alokasi 88% : 12%)' : 'Skema PT Great Eastern (Direct Counter & Alokasi 88% : 12%)' }}
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
                  <th v-if="isAtlas(detailItem)" class="text-right">Gross Mesin</th>
                  <th v-if="isAtlas(detailItem)" class="text-right">Deduksi A3</th>
                  <th class="text-right">Counter Akhir</th>
                  <th class="text-right">Pemakaian Dasar</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Black &amp; White (BW)</strong></td>
                  <td class="text-right">{{ Number(detailItem.counter_awal_bw || 0).toLocaleString('id-ID') }}</td>
                  <td v-if="isAtlas(detailItem)" class="text-right">{{ Number(detailItem.gross_counter_bw || 0).toLocaleString('id-ID') }}</td>
                  <td v-if="isAtlas(detailItem)" class="text-right">{{ Number(detailItem.a3_counter_bw || 0).toLocaleString('id-ID') }}</td>
                  <td class="text-right">{{ Number(detailItem.counter_akhir_bw || 0).toLocaleString('id-ID') }}</td>
                  <td class="text-right font-bold text-slate-800">{{ Number(detailItem.pemakaian_bw_dasar || 0).toLocaleString('id-ID') }}</td>
                </tr>
                <tr v-if="Number(detailItem.counter_akhir_bw_double || detailItem.counter_awal_bw_double || detailItem.gross_counter_bw_double) > 0">
                  <td class="text-indigo-800 font-medium">↳ BW (2-Sided)</td>
                  <td class="text-right">{{ Number(detailItem.counter_awal_bw_double || 0).toLocaleString('id-ID') }}</td>
                  <td v-if="isAtlas(detailItem)" class="text-right">{{ Number(detailItem.gross_counter_bw_double || 0).toLocaleString('id-ID') }}</td>
                  <td v-if="isAtlas(detailItem)" class="text-right">-</td>
                  <td class="text-right">{{ Number(detailItem.counter_akhir_bw_double || detailItem.gross_counter_bw_double || 0).toLocaleString('id-ID') }}</td>
                  <td class="text-right font-medium text-indigo-700">{{ Math.max(0, Number(detailItem.counter_akhir_bw_double || detailItem.gross_counter_bw_double || 0) - Number(detailItem.counter_awal_bw_double || 0)).toLocaleString('id-ID') }}</td>
                </tr>
                <tr>
                  <td><strong>Color (CL)</strong></td>
                  <td class="text-right">{{ Number(detailItem.counter_awal_color || 0).toLocaleString('id-ID') }}</td>
                  <td v-if="isAtlas(detailItem)" class="text-right">{{ Number(detailItem.gross_counter_color || 0).toLocaleString('id-ID') }}</td>
                  <td v-if="isAtlas(detailItem)" class="text-right">{{ Number(detailItem.a3_counter_color || 0).toLocaleString('id-ID') }}</td>
                  <td class="text-right">{{ Number(detailItem.counter_akhir_color || 0).toLocaleString('id-ID') }}</td>
                  <td class="text-right font-bold text-slate-800">{{ Number(detailItem.pemakaian_color_dasar || 0).toLocaleString('id-ID') }}</td>
                </tr>
                <tr v-if="Number(detailItem.counter_akhir_color_double || detailItem.counter_awal_color_double || detailItem.gross_counter_color_double) > 0">
                  <td class="text-indigo-800 font-medium">↳ Color (2-Sided)</td>
                  <td class="text-right">{{ Number(detailItem.counter_awal_color_double || 0).toLocaleString('id-ID') }}</td>
                  <td v-if="isAtlas(detailItem)" class="text-right">{{ Number(detailItem.gross_counter_color_double || 0).toLocaleString('id-ID') }}</td>
                  <td v-if="isAtlas(detailItem)" class="text-right">-</td>
                  <td class="text-right">{{ Number(detailItem.counter_akhir_color_double || detailItem.gross_counter_color_double || 0).toLocaleString('id-ID') }}</td>
                  <td class="text-right font-medium text-indigo-700">{{ Math.max(0, Number(detailItem.counter_akhir_color_double || detailItem.gross_counter_color_double || 0) - Number(detailItem.counter_awal_color_double || 0)).toLocaleString('id-ID') }}</td>
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
                <div class="epson-machine-model">{{ getUnitDisplayName(detailItem) }}</div>
                <div class="epson-meta-line">
                  <span class="meta-tag">SN: <strong>{{ getUnitSN(detailItem) }}</strong></span>
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
                  <span class="metric-num">{{ (getDetailGross(detailItem, 'bw') + getDetailGross(detailItem, 'color')).toLocaleString('id-ID') }}</span>
                </div>
              </div>

              <div class="epson-metric-box">
                <div class="metric-title">Total Number of B&amp;W Pages</div>
                <div class="metric-value-row">
                  <span class="metric-icon">📄</span>
                  <span class="metric-num">{{ getDetailGross(detailItem, 'bw').toLocaleString('id-ID') }}</span>
                </div>
              </div>

              <div class="epson-metric-box">
                <div class="metric-title">Total Number of Color Pages</div>
                <div class="metric-value-row">
                  <span class="metric-icon" style="color: #2563eb;">🎨</span>
                  <span class="metric-num">{{ getDetailGross(detailItem, 'color').toLocaleString('id-ID') }}</span>
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
                  <tr class="highlight-row">
                    <td class="font-bold text-slate-900">A4/Letter</td>
                    <td class="text-right font-bold text-slate-900">{{ Number(detailItem.counter_akhir_bw || 0).toLocaleString('id-ID') }}</td>
                    <td class="text-right font-bold text-blue-700">{{ Number(detailItem.counter_akhir_color || 0).toLocaleString('id-ID') }}</td>
                    <td class="text-right font-bold text-slate-900">{{ Number(detailItem.counter_akhir_bw_double || detailItem.gross_counter_bw_double || 0).toLocaleString('id-ID') }}</td>
                    <td class="text-right font-bold text-blue-700">{{ Number(detailItem.counter_akhir_color_double || detailItem.gross_counter_color_double || 0).toLocaleString('id-ID') }}</td>
                  </tr>
                  <tr v-for="d in getItemDeductions(detailItem)" :key="'detail-table-' + d.name">
                    <td class="font-medium">{{ d.name === 'A3' ? 'A3/Ledger' : d.name }}</td>
                    <td class="text-right font-semibold">{{ Number(d.bw || 0).toLocaleString('id-ID') }}</td>
                    <td class="text-right font-semibold text-blue-700">{{ Number(d.color || 0).toLocaleString('id-ID') }}</td>
                    <td class="text-right font-semibold text-slate-900">{{ Number(d.bw_double || 0).toLocaleString('id-ID') }}</td>
                    <td class="text-right font-semibold text-blue-700">{{ Number(d.color_double || 0).toLocaleString('id-ID') }}</td>
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
              Total Mesin : {{ (Number(detailItem.gross_counter_bw || (Number(detailItem.counter_akhir_bw || 0) + getItemDeductions(detailItem).reduce((s, d) => s + d.bw, 0)))).toLocaleString('id-ID') }}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{{ (Number(detailItem.gross_counter_color || (Number(detailItem.counter_akhir_color || 0) + getItemDeductions(detailItem).reduce((s, d) => s + d.color, 0)))).toLocaleString('id-ID') }}<br>
              <template v-for="d in getItemDeductions(detailItem)" :key="'detail-note-' + d.name">
                Deduksi {{ d.name }}&nbsp;&nbsp;: {{ Number(d.bw || 0).toLocaleString('id-ID') }}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{{ Number(d.color || 0).toLocaleString('id-ID') }} (-)<br>
              </template>
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
      :open="showDeleteConfirm"
      title="Hapus Pencatatan Meter"
      message="Apakah Anda yakin ingin menghapus pencatatan meter ini? Data yang dihapus tidak dapat dikembalikan."
      confirmLabel="Hapus"
      variant="danger"
      @close="showDeleteConfirm = false"
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
  transition: all 0.2s ease;
}

.info-card-atlas {
  background: #eff6ff;
  border-color: #bfdbfe;
}

.info-card-great {
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.info-card-great .info-icon {
  color: #16a34a;
}

.info-card-great .info-title {
  color: #166534;
}

.info-card-great .info-desc {
  color: #14532d;
}

.tab-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 2px;
}

.indicator-atlas {
  background: #2563eb;
}

.indicator-great {
  background: #16a34a;
}

.modal-type-switcher {
  display: flex;
  gap: 8px;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 8px;
  margin-bottom: 12px;
}

.type-switch-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 12.5px;
  font-weight: 600;
  color: #64748b;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.type-switch-btn:hover {
  color: #0f172a;
}

.type-switch-btn.active {
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot-atlas {
  background: #2563eb;
}

.dot-great {
  background: #16a34a;
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

.badge-great {
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
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
  position: relative;
  z-index: 2;
  pointer-events: auto;
}

.btn-icon svg {
  pointer-events: none;
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

.btn-excel-top {
  background: #16a34a !important;
  border-color: #16a34a !important;
  color: #ffffff !important;
  display: inline-flex;
  align-items: center;
  font-weight: 600;
}

.btn-excel-top:hover {
  background: #15803d !important;
  border-color: #15803d !important;
}

/* Banner Status Kontrak Atlas Copco */
.atlas-contract-status-box {
  margin-bottom: 14px;
  border-radius: 8px;
  padding: 12px 16px;
  border: 1.5px solid transparent;
  transition: all 0.2s ease;
}

.atlas-contract-status-box.is-last-visit {
  background: #f0fdf4;
  border-color: #86efac;
  color: #166534;
}

.atlas-contract-status-box.is-intermediate-visit {
  background: #eff6ff;
  border-color: #93c5fd;
  color: #1e40af;
}

.atlas-contract-status-box .status-box-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.atlas-contract-status-box .status-icon {
  font-size: 22px;
  line-height: 1.2;
}

.atlas-contract-status-box .status-title {
  font-weight: 700;
  font-size: 13.5px;
  margin-bottom: 3px;
}

.atlas-contract-status-box.is-last-visit .status-title {
  color: #15803d;
}

.atlas-contract-status-box.is-intermediate-visit .status-title {
  color: #1d4ed8;
}

.atlas-contract-status-box .status-desc {
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.95;
}

</style>
