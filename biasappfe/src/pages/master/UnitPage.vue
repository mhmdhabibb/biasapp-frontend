<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import DataTable from '@/components/ui/DataTable.vue'
import ExcelImportButtons from '@/components/ui/ExcelImportButtons.vue'
import FormModal from '@/components/ui/FormModal.vue'
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useAuth } from '@/composables/useAuth'
import { useHardDelete } from '@/composables/useHardDelete'
import { useToast } from '@/composables/useToast'
import { resources } from '@/services/resource.service'
import type { TableColumn, Unit, UOM } from '@/types'
import { computed, reactive, ref, onMounted, watch, onUnmounted } from 'vue'
import { formatUnitDisplayName as utilFormatUnitDisplayName } from '@/utils/format'
import { downloadStyledExcel, NUMFMT_COUNT, NUMFMT_RP, type StyledCell } from "@/utils/exportHelpers"
import { BIAS_LOGO_DATA_URL } from "@/utils/logoData"

const toast = useToast()
const { currentUser } = useAuth()
const isTechnician = computed(() => currentUser.value?.role === 'technician')

const columns: TableColumn[] = [
  { key: 'name', label: 'Product Name' },
  { key: 'brand_id', label: 'Brand' },
  { key: 'model', label: 'Model' },
  { key: 'price', label: 'Price' },
  { key: 'uom.name', label: 'UOM' },
  { key: 'serial_no', label: 'SN' },
  { key: 'status', label: 'Status' },
  { key: 'is_computer', label: 'Computer' },
  { key: 'is_copier', label: 'Copier' },
]

const brands = ref<{ id: string, name: string }[]>([])
const unitTypes = ref<{ id: string, name: string }[]>([])
const paperSizes = ref<{ id: string, name: string }[]>([])
const uoms = ref<UOM[]>([])

const brandOptions = computed(() => brands.value.map(b => ({ value: b.id, label: b.name })))
const typeOptions = computed(() => unitTypes.value.map(t => ({ value: t.id, label: t.name })))
const paperSizeOptions = computed(() => paperSizes.value.map(p => ({ value: p.id, label: p.name })))
const uomOptions = computed(() => uoms.value.map(u => ({ value: u.id, label: u.name })))

const data = ref<Unit[]>([])

async function fetchData() {
  try {
    const [resUnits, resBrands, resTypes, resPaperSizes, resUoms] = await Promise.all([
      resources.units.list(),
      resources.brands.list(),
      resources.unitTypes.list(),
      resources.paperSizes.list(),
      resources.uoms.list()
    ])
    data.value = resUnits.data as any
    brands.value = resBrands.data as any
    unitTypes.value = resTypes.data as any
    paperSizes.value = resPaperSizes.data as any
    uoms.value = resUoms.data as any
  } catch (error: any) {
    console.error('Failed to fetch data:', error)
    toast.error('Failed to fetch data from server: ' + (error.message || 'Error'))
  }
}

const totalUnitCount = computed(() => (data.value || []).length)
const totalAvailableCount = computed(() => (data.value || []).filter(u => (u.status || '').toLowerCase() === 'available').length)
const totalRentedCount = computed(() => (data.value || []).filter(u => (u.status || '').toLowerCase() === 'rented').length)
const totalUnitValue = computed(() => (data.value || []).reduce((acc, u) => acc + (Number((u as any).price) || 0), 0))

let unitTimer: any = null
async function silentRefresh() {
  if (showModal.value || showConfirm.value || hardDelete.isOpen.value) return
  try {
    const resUnits = await resources.units.list()
    data.value = Array.isArray(resUnits.data) ? (resUnits.data as any) : []
  } catch {}
}

onMounted(() => {
  fetchData()
  unitTimer = setInterval(silentRefresh, 5000)
  window.addEventListener('focus', silentRefresh)
  window.addEventListener('bias:data-mutated', silentRefresh)
})

onUnmounted(() => {
  if (unitTimer) clearInterval(unitTimer)
  window.removeEventListener('focus', silentRefresh)
  window.removeEventListener('bias:data-mutated', silentRefresh)
})

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Unit | null>(null)
const deletingItem = ref<Unit | null>(null)
// type_id is the json key expected by backend, frontend had unit_type_id
const form = reactive({
  serial_no: '',
  serial_numbers: [] as string[],
  temp_serial: '',
  brand_id: null as string | null,
  type_id: null as string | null,
  print_tech: '' as string,
  uom_id: '' as string | null,
  model: '',
  name: '',
  price: null as number | null,
  is_copier: false,
  is_computer: false,
  current_meter_bw: 0,
  current_meter_color: 0,
  free_quota_color: 0,
  free_quota_bw: 0,
  rates: [] as { paper_size_id: string; paper_type_id: string | null; rate_per_page_bw: number; rate_per_page_color: number; free_quota_bw: number; free_quota_color: number; quota_applies_to: string }[],
  specsData: {
    cpu: '',
    ram: '',
    storage: '',
    storage_type: '',
    os: '',
    vga: '',
    office: ''
  },
})

const printTechOptions = [
  { value: 'Laser', label: 'Laser' },
  { value: 'Inject', label: 'Inject' },
]

function getTypeName(id: string | null): string {
  if (!id) return ''
  const t = unitTypes.value.find(t => String(t.id) === String(id))
  return t ? t.name : ''
}

const isPrinterOrCopier = computed(() => {
  const tName = getTypeName(form.type_id).toLowerCase().trim()
  return (
    tName === 'printer' ||
    tName.includes('printer') ||
    tName === 'photocopy machine' ||
    tName.includes('photocopy') ||
    tName.includes('copier') ||
    Boolean(form.is_copier)
  )
})

function computeUnitName(typeId: string | null, printTech: string, brandId: string | null, model: string, isCopier = false): string {
  const typeName = getTypeName(typeId).trim()
  const brandName = getBrandName(brandId)
  const validBrand = (brandName && brandName !== '-') ? brandName.trim() : ''
  const validModel = (model || '').trim()

  const tLower = typeName.toLowerCase()
  const isPrintOrCopy = tLower.includes('printer') || tLower.includes('copier') || tLower.includes('photocopy') || isCopier

  if (isPrintOrCopy) {
    const tech = (printTech || '').trim()
    return [typeName, tech, validBrand, validModel].filter(Boolean).join(' ').trim()
  } else {
    return [typeName, validBrand, validModel].filter(Boolean).join(' ').trim()
  }
}

function formatUnitDisplayName(row: any): string {
  return utilFormatUnitDisplayName(row, {
    findBrand: (id) => brands.value.find(b => String(b.id) === String(id)),
    findUnitType: (id) => unitTypes.value.find(t => String(t.id) === String(id)),
  })
}

watch(
  [() => form.type_id, () => form.print_tech, () => form.brand_id, () => form.model, () => form.is_copier],
  ([newType, newTech, newBrand, newModel, newCopier]) => {
    if (!isPrinterOrCopier.value && form.print_tech) {
      form.print_tech = ''
    }
    form.name = computeUnitName(newType, form.print_tech, newBrand, newModel, newCopier)
  }
)

function addRate() {
  form.rates.push({ paper_size_id: '', paper_type_id: null, rate_per_page_bw: 0, rate_per_page_color: 0, free_quota_bw: 0, free_quota_color: 0, quota_applies_to: 'color' })
}

function removeRate(index: number) {
  form.rates.splice(index, 1)
}

function openAdd() {
  editingItem.value = null
  Object.assign(form, {
    serial_no: '',
    serial_numbers: [],
    temp_serial: '',
    brand_id: null,
    type_id: null,
    print_tech: '',
    uom_id: '',
    model: '',
    name: '',
    price: null,
    is_copier: false,
    is_computer: false,
    current_meter_bw: 0,
    current_meter_color: 0,
    free_quota_color: 0,
    free_quota_bw: 0,
    rates: [],
    specsData: { cpu: '', ram: '', storage: '', storage_type: '', os: '', vga: '', office: '' }
  })
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingItem.value = null
  form.serial_numbers = []
  form.temp_serial = ''
  form.serial_no = ''
}

function openEdit(item: any) {
  editingItem.value = item
  let detectedTech = item.print_tech || ''
  if (!detectedTech && item.specs) {
    try {
      const s = typeof item.specs === 'string' ? JSON.parse(item.specs) : item.specs
      detectedTech = s.print_tech || ''
    } catch {}
  }
  if (!detectedTech && item.name) {
    if (/\bLaser\b/i.test(item.name)) detectedTech = 'Laser'
    else if (/\bInject\b/i.test(item.name) || /\bInkjet\b/i.test(item.name)) detectedTech = 'Inject'
  }

  Object.assign(form, {
    serial_no: item.serial_no,
    serial_numbers: [],
    temp_serial: '',
    brand_id: item.brand_id,
    type_id: item.type_id,
    print_tech: detectedTech,
    uom_id: item.uom_id ?? '',
    model: item.model,
    name: item.name || '',
    price: (item as any).price || null,
    is_copier: !!item.is_copier,
    is_computer: !!item.is_computer,
    current_meter_bw: item.current_meter_bw || 0,
    current_meter_color: item.current_meter_color || 0,
    free_quota_color: item.free_quota_color || 0,
    free_quota_bw: (item as any).free_quota_bw || 0,
    rates: Array.isArray(item.rates) ? item.rates.map((r: any) => ({
      paper_size_id: r.paper_size_id,
      paper_type_id: r.paper_type_id ?? null,
      rate_per_page_bw: r.rate_per_page_bw,
      rate_per_page_color: r.rate_per_page_color,
      free_quota_bw: r.free_quota_bw ?? 0,
      free_quota_color: r.free_quota_color ?? 0,
      quota_applies_to: r.quota_applies_to === 'bw' ? 'bw' : 'color'
    })) : [],
    specsData: item.specs ? (typeof item.specs === 'string' ? JSON.parse(item.specs || '{}') : item.specs) : { cpu: '', ram: '', storage: '', storage_type: '', os: '', vga: '', office: '' },
  })
  showModal.value = true
}

async function handleSubmit() {
  if (form.temp_serial && form.temp_serial.trim()) {
    addSerialNumber()
  }

  if (editingItem.value) {
    if (!form.brand_id || !form.type_id || !form.serial_no.trim()) {
      toast.warning('Silakan lengkapi kolom Brand, Tipe Unit, dan Serial Number.')
      return
    }
  } else {
    if (!form.brand_id || !form.type_id) {
      toast.warning('Silakan lengkapi kolom Brand dan Tipe Unit.')
      return
    }
    if (form.serial_numbers.length === 0 && form.serial_no.trim()) {
      form.serial_numbers.push(form.serial_no.trim().toUpperCase())
    }
    if (form.serial_numbers.length === 0) {
      toast.warning('Silakan masukkan minimal satu Serial Number (SN).')
      return
    }
  }

  if (isPrinterOrCopier.value && !form.print_tech) {
    toast.warning('Silakan pilih tipe Laser atau Inject untuk Printer / Copier Machine.')
    return
  }

  try {
    const payload = {
      ...form,
      print_tech: form.print_tech || undefined,
      specs: JSON.stringify({
        ...(form.is_computer ? form.specsData : {}),
        print_tech: form.print_tech || undefined,
      })
    }
    delete (payload as any).serial_numbers
    delete (payload as any).temp_serial

    if (editingItem.value) {
      await resources.units.update(String(editingItem.value.id), payload)
      toast.success("Unit updated successfully!")
    } else {
      const serials = Array.from(new Set(form.serial_numbers.map(s => s.trim().toUpperCase()).filter(Boolean)))
      if (serials.length === 0) {
        toast.warning('Silakan masukkan Serial Number yang valid.')
        return
      }
      
      const promises = serials.map(sn => {
         return resources.units.create({ ...payload, serial_no: sn })
      })
      await Promise.all(promises)
      toast.success(serials.length > 1 ? `${serials.length} unit berhasil disimpan!` : "Unit berhasil disimpan!")
    }
    await fetchData()
    window.dispatchEvent(new CustomEvent('bias:data-mutated', { detail: { path: '/units' } }))
    closeModal()
  } catch (error: any) {
    console.error('Failed to save unit:', error)
    toast.error('Failed to save Unit data: ' + (error.message || 'An error occurred'))
  }
}

function addSerialNumber() {
  const sn = (form.temp_serial || '').trim().toUpperCase()
  if (sn && !form.serial_numbers.includes(sn)) {
    form.serial_numbers.push(sn)
  }
  form.temp_serial = ''
}

function openDelete(item: Unit) { deletingItem.value = item; showConfirm.value = true }

const hardDelete = useHardDelete((id: string) => resources.units.hardRemove(id), fetchData)

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.units.remove(String(deletingItem.value.id))
      await fetchData()
      toast.success("Unit deleted successfully!")
    } catch (error) {
      console.error('Failed to delete unit:', error)
      toast.error('Failed to delete Unit data')
    }
  }
  showConfirm.value = false
}

function getBrandName(id: string | null): string {
  if (!id) return '-'
  const b = brands.value.find(b => b.id === id)
  return b ? b.name : '-'
}

function statusBadgeClass(status: string | null | undefined): string {
  switch ((status || '').toLowerCase()) {
    case 'available':
      return 'badge-success'
    case 'rented':
      return 'badge-info'
    case 'maintenance':
      return 'badge-warning'
    case 'broken':
      return 'badge-danger'
    case 'sold':
      return 'badge-neutral'
    default:
      return 'badge-neutral'
  }
}

function formatStatus(status: string | null | undefined): string {
  if (!status) return '-'
  return status
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function formatRupiah(val: number | null | undefined): string {
  if (val === null || val === undefined) return '-'
  return 'Rp ' + Number(val).toLocaleString('id-ID')
}

const badgeTrue = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  borderRadius: '50%',
  backgroundColor: '#dcfce7',
  color: '#16a34a',
}

const badgeFalse = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  borderRadius: '50%',
  backgroundColor: '#fee2e2',
  color: '#dc2626',
}

async function exportStockExcel() {
  if (!data.value.length) {
    toast.error("Tidak ada data stok unit untuk diekspor")
    return
  }

  const dateStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
  const rows: StyledCell[][] = [
    [{ v: 'PT. BIAS SURYA TEKNOLOGI', mergeAcross: 8, style: 'titleCell' }],
    [{ v: 'LAPORAN STOK & DAFTAR ASET UNIT (PRINTER, COPIER, PC / LAPTOP)', mergeAcross: 8, style: 'plainBoldCenter' }],
    [{ v: 'Ruko Purimas Blok A No.47 Kota Batam, Kepulauan Riau - Indonesia | Phone: +62 811 7045 657', mergeAcross: 8, style: 'subTitleCell' }],
    [{ v: `Tanggal Cetak: ${dateStr}`, mergeAcross: 8, style: 'subTitleCell' }],
    [],
    [
      { v: 'RINGKASAN STATUS & VALUASI UNIT', mergeAcross: 8, style: 'plainBoldCenter' },
    ],
    [
      { v: 'Total Unit Terdaftar', style: 'headerCell', mergeAcross: 1 }, {},
      { v: 'Unit Available (Siap)', style: 'headerCell', mergeAcross: 1 }, {},
      { v: 'Unit Rented (Disewa)', style: 'headerCell', mergeAcross: 1 }, {},
      { v: 'Total Estimasi Nilai Unit (Rp)', style: 'headerCell', mergeAcross: 2 }, {}, {},
    ],
    [
      { v: `${totalUnitCount.value} Unit`, style: 'grandTotalCell', mergeAcross: 1 }, {},
      { v: `${totalAvailableCount.value} Unit`, style: 'grandTotalCell', mergeAcross: 1 }, {},
      { v: `${totalRentedCount.value} Unit`, style: 'grandTotalCell', mergeAcross: 1 }, {},
      { v: totalUnitValue.value, style: 'grandTotalCell', mergeAcross: 2, numFmt: NUMFMT_RP }, {}, {},
    ],
    [],
    [
      { v: 'No', style: 'headerCell' },
      { v: 'Serial Number (SN)', style: 'headerCell' },
      { v: 'Nama Lengkap Unit', style: 'headerCell' },
      { v: 'Brand', style: 'headerCell' },
      { v: 'Model', style: 'headerCell' },
      { v: 'Tipe / Kategori', style: 'headerCell' },
      { v: 'Status', style: 'headerCell' },
      { v: 'Meter (BW / Color)', style: 'headerCell' },
      { v: 'Nilai Unit (Rp)', style: 'headerCell' },
    ],
  ]

  data.value.forEach((u, idx) => {
    const priceVal = Number((u as any).price) || 0
    const meterStr = u.is_copier ? `${u.current_meter_bw || 0} / ${u.current_meter_color || 0}` : '-'
    const brandName = getBrandName(u.brand_id)
    const typeName = getTypeName(u.type_id)

    rows.push([
      { v: idx + 1, style: 'borderCenter' },
      { v: u.serial_no || '-', style: 'borderCenter' },
      { v: formatUnitDisplayName(u), style: 'border' },
      { v: brandName, style: 'border' },
      { v: u.model || '-', style: 'border' },
      { v: typeName || '-', style: 'border' },
      { v: formatStatus(u.status), style: 'borderCenter' },
      { v: meterStr, style: 'borderCenter' },
      { v: priceVal, style: 'borderBoldRight', numFmt: NUMFMT_RP },
    ])
  })

  // Grand Total row
  rows.push([
    { v: 'GRAND TOTAL', mergeAcross: 7, style: 'grandTotalCell' },
    {}, {}, {}, {}, {}, {}, {},
    { v: totalUnitValue.value, style: 'grandTotalCell', numFmt: NUMFMT_RP },
  ])

  const columnWidths = [6, 20, 36, 16, 18, 18, 16, 20, 22]
  await downloadStyledExcel(
    [{ name: 'Stok Unit BiAS', columnWidths, rows }],
    `Laporan_Stok_Unit_BiAS_${new Date().toISOString().slice(0, 10)}.xlsx`
  )
  toast.success("Laporan stok unit berhasil diekspor ke Excel!")
}

function exportStockPdf() {
  if (!data.value.length) {
    toast.error("Tidak ada data stok unit untuk diekspor")
    return
  }
  const dateStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
  const totalItems = totalUnitCount.value
  const availableItems = totalAvailableCount.value
  const rentedItems = totalRentedCount.value
  const totalValStr = formatRupiah(totalUnitValue.value)

  const rowsHtml = data.value.map((u, idx) => {
    const priceVal = Number((u as any).price) || 0
    const meterStr = u.is_copier ? `${(u.current_meter_bw || 0).toLocaleString('id-ID')} / ${(u.current_meter_color || 0).toLocaleString('id-ID')}` : '-'
    const brandName = getBrandName(u.brand_id)
    const typeName = getTypeName(u.type_id)
    const statusText = formatStatus(u.status)

    let statusColor = '#64748b'
    if ((u.status || '').toLowerCase() === 'available') statusColor = '#16a34a'
    else if ((u.status || '').toLowerCase() === 'rented') statusColor = '#0284c7'
    else if ((u.status || '').toLowerCase() === 'maintenance') statusColor = '#d97706'

    return `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td style="text-align: center; font-family: monospace; font-weight: 600;">${u.serial_no || '-'}</td>
        <td style="font-weight: 500;">${formatUnitDisplayName(u)}</td>
        <td>${brandName}</td>
        <td>${u.model || '-'}</td>
        <td>${typeName || '-'}</td>
        <td style="text-align: center; font-weight: 600; color: ${statusColor};">${statusText}</td>
        <td style="text-align: center;">${meterStr}</td>
        <td style="text-align: right; font-weight: 700;">${priceVal > 0 ? 'Rp ' + priceVal.toLocaleString('id-ID') : '-'}</td>
      </tr>
    `
  }).join('')

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Laporan Stok & Daftar Unit - BiAS</title>
  <style>
    @media print {
      @page { margin: 8mm; size: landscape; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1e293b; margin: 0; padding: 15px; }
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; border-bottom: 2px solid #003366; padding-bottom: 10px; }
    .logo { width: 70px; height: 70px; object-fit: contain; }
    .company-title h1 { margin: 0; font-size: 18px; font-weight: 800; color: #003366; letter-spacing: 0.5px; }
    .company-title h2 { margin: 2px 0 4px 0; font-size: 12px; font-style: italic; color: #64748b; font-weight: normal; }
    .company-title p { margin: 0; font-size: 10px; color: #475569; line-height: 1.4; }
    .doc-title { text-align: right; vertical-align: top; }
    .doc-title h2 { margin: 0; font-size: 18px; font-weight: 800; color: #003366; }
    .doc-title p { margin: 4px 0 0 0; font-size: 11px; color: #64748b; }
    
    .kpi-container { display: flex; gap: 12px; margin-bottom: 16px; }
    .kpi-card { flex: 1; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 14px; }
    .kpi-label { font-size: 10px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 3px; }
    .kpi-val { font-size: 16px; font-weight: 800; color: #0f172a; }

    table.data-table { width: 100%; border-collapse: collapse; margin-top: 5px; }
    table.data-table thead { display: table-header-group; }
    table.data-table tr { page-break-inside: avoid; }
    table.data-table th { background-color: #003366; color: #ffffff; border: 1px solid #002244; padding: 7px 8px; text-align: left; font-size: 10.5px; }
    table.data-table td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 10.5px; vertical-align: middle; }
    table.data-table tr:nth-child(even) { background-color: #f8fafc; }
    table.data-table tfoot td { background-color: #e2e8f0; font-weight: 800; border: 1px solid #94a3b8; }
  </style>
</head>
<body>
  <table class="header-table">
    <tr>
      <td style="width: 80px; vertical-align: top;">
        <img src="${BIAS_LOGO_DATA_URL}" class="logo" alt="BiAS Logo" />
      </td>
      <td style="vertical-align: top; padding-left: 10px;">
        <div class="company-title">
          <h1>PT. BIAS SURYA TEKNOLOGI</h1>
          <h2>The shape of smart</h2>
          <p>Ruko Purimas Blok A No.47 Kota Batam, Kepulauan Riau - Indonesia<br>
          Phone: +62811 704 5657 | Email: admin@biasbst.com | Web: www.biassuryateknologi.com</p>
        </div>
      </td>
      <td class="doc-title">
        <h2>LAPORAN STOK & DAFTAR UNIT</h2>
        <p>Tanggal Cetak: <strong>${dateStr}</strong></p>
      </td>
    </tr>
  </table>

  <div class="kpi-container">
    <div class="kpi-card">
      <div class="kpi-label">Total Unit Aset</div>
      <div class="kpi-val">${totalItems} Unit</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Unit Available (Siap)</div>
      <div class="kpi-val" style="color: #16a34a;">${availableItems} Unit</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Unit Rented (Disewa)</div>
      <div class="kpi-val" style="color: #0284c7;">${rentedItems} Unit</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total Estimasi Nilai Unit</div>
      <div class="kpi-val" style="color: #003366;">${totalValStr}</div>
    </div>
  </div>

  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 35px; text-align: center;">No</th>
        <th style="width: 110px; text-align: center;">Serial Number (SN)</th>
        <th>Nama Unit / Produk</th>
        <th style="width: 100px;">Brand</th>
        <th style="width: 100px;">Model</th>
        <th style="width: 110px;">Tipe Unit</th>
        <th style="width: 90px; text-align: center;">Status</th>
        <th style="width: 100px; text-align: center;">Meter (BW/Col)</th>
        <th style="width: 130px; text-align: right;">Estimasi Nilai</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="6" style="text-align: center;">GRAND TOTAL UNIT: ${totalItems}</td>
        <td colspan="2" style="text-align: right;">Total Nilai Aset:</td>
        <td style="text-align: right; color: #003366;">${totalValStr}</td>
      </tr>
    </tfoot>
  </table>

  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 400);
    };
  <\/script>
</body>
</html>`

  const w = window.open('', '_blank')
  if (w) {
    w.document.write(fullHtml)
    w.document.close()
  } else {
    toast.error('Pop-up terblokir oleh browser. Izinkan pop-up untuk mencetak PDF.')
  }
}
</script>

<template>
  <div>
    <PageHeader title="Products" :button-label="isTechnician ? undefined : 'Add Product'" permission="unit:create"
      @add="openAdd">
      <template #actions>
        <button class="btn btn-outline" @click="exportStockPdf" style="display: flex; align-items: center; gap: 6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Export Unit Stock PDF
        </button>
        <button class="btn btn-outline" @click="exportStockExcel" style="display: flex; align-items: center; gap: 6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="17"></line><line x1="16" y1="13" x2="8" y2="17"></line></svg>
          Export Unit Stock Excel
        </button>
      </template>
    </PageHeader>

    <!-- Summary Cards -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px;">
      <div class="card p-md" style="background: var(--color-surface, #fff); border: 1px solid var(--color-border-light); border-radius: 8px; padding: 16px;">
        <div style="font-size: 12px; color: var(--color-text-muted); font-weight: 600; text-transform: uppercase;">Total Unit Aset</div>
        <div style="font-size: 24px; font-weight: bold; margin-top: 4px; color: var(--color-text);">{{ totalUnitCount }} Unit</div>
      </div>
      <div class="card p-md" style="background: var(--color-surface, #fff); border: 1px solid var(--color-border-light); border-radius: 8px; padding: 16px;">
        <div style="font-size: 12px; color: var(--color-text-muted); font-weight: 600; text-transform: uppercase;">Unit Available (Siap)</div>
        <div style="font-size: 24px; font-weight: bold; margin-top: 4px; color: #16a34a;">{{ totalAvailableCount }} Unit</div>
      </div>
      <div class="card p-md" style="background: var(--color-surface, #fff); border: 1px solid var(--color-border-light); border-radius: 8px; padding: 16px;">
        <div style="font-size: 12px; color: var(--color-text-muted); font-weight: 600; text-transform: uppercase;">Unit Rented (Disewa)</div>
        <div style="font-size: 24px; font-weight: bold; margin-top: 4px; color: #0284c7;">{{ totalRentedCount }} Unit</div>
      </div>
      <div class="card p-md" style="background: var(--color-surface, #fff); border: 1px solid var(--color-border-light); border-radius: 8px; padding: 16px;">
        <div style="font-size: 12px; color: var(--color-text-muted); font-weight: 600; text-transform: uppercase;">Total Nilai Aset Unit</div>
        <div style="font-size: 24px; font-weight: bold; margin-top: 4px; color: #003366;">{{ formatRupiah(totalUnitValue) }}</div>
      </div>
    </div>
    <DataTable :columns="columns" :data="data" search-placeholder="Search products..." permission="unit" @edit="openEdit"
      @delete="openDelete" :show-hard-delete="hardDelete.isSuperadmin" @hard-delete="hardDelete.open">
      <template #toolbar>
        <ExcelImportButtons master-key="unit" @imported="fetchData" />
      </template>
      <template #cell-name="{ row }">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>{{ formatUnitDisplayName(row) }}</span>
          <span v-if="row.is_external" class="badge badge-warning" style="font-size: 10px; padding: 2px 6px;">External</span>
        </div>
      </template>
      <template #cell-uom.name="{ row }">
        {{ row.uom?.name ?? "-" }}
      </template>
      <template #cell-brand_id="{ value }">
        {{ getBrandName(value) }}
      </template>
      <template #cell-price="{ value }">
        {{ formatRupiah(value) }}
      </template>
      <template #cell-status="{ value }">
        <span class="badge" :class="statusBadgeClass(value)">
          {{ formatStatus(value) }}
        </span>
      </template>
      <template #cell-is_computer="{ value }">
        <span :style="value ? badgeTrue : badgeFalse">
          <svg v-if="value" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </span>
      </template>
      <template #cell-is_copier="{ value }">
        <span :style="value ? badgeTrue : badgeFalse">
          <svg v-if="value" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </span>
      </template>
    </DataTable>
    <FormModal v-if="!isTechnician" :open="showModal" :title="editingItem ? 'Edit Product' : 'Add Product'"
      @close="closeModal" @submit="handleSubmit">
      <div class="form-group">
        <label for="unit-serial" class="form-label">
          SN (Serial Number)
          <span v-if="!editingItem" style="font-weight:normal; font-size: 0.85em; color: var(--color-text-light);">(Tekan enter atau koma untuk menambah)</span>
        </label>
        
        <div v-if="!editingItem" class="tags-input-container" style="display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 12px; border: 1px solid var(--color-border); border-radius: 6px; min-height: 42px; align-items: center; background: var(--color-surface); transition: border-color 0.2s;">
          <span v-for="(sn, index) in form.serial_numbers" :key="index" class="badge" style="background-color: var(--color-primary); color: white; display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem;">
            {{ sn }}
            <button type="button" @click="form.serial_numbers.splice(index, 1)" style="background: transparent; border: none; color: white; cursor: pointer; padding: 0; display: flex; align-items: center; font-size: 1.1rem; line-height: 1;">&times;</button>
          </span>
          <input 
            type="text" 
            v-model="form.temp_serial" 
            @input="form.temp_serial = ($event.target as HTMLInputElement).value.toUpperCase()"
            @keydown.enter.prevent="addSerialNumber"
            @keydown.comma.prevent="addSerialNumber"
            @blur="addSerialNumber"
            style="flex: 1; min-width: 140px; border: none; outline: none; background: transparent; text-transform: uppercase; padding: 2px 0; font-size: 0.875rem; color: var(--color-text);"
            placeholder="Ketik SN lalu tekan Enter"
          />
        </div>
        
        <input v-else id="unit-serial" v-model="form.serial_no" @input="form.serial_no = ($event.target as HTMLInputElement).value.toUpperCase()" type="text" class="form-input" style="text-transform: uppercase;"
          placeholder="Product serial number (SN)">
      </div>
      <div class="form-group">
        <label for="unit-name" class="form-label">Product Name</label>
        <input id="unit-name" v-model="form.name" type="text" class="form-input" placeholder="Auto-generated" disabled
          style="background-color: var(--color-surface-hover); cursor: not-allowed;">
      </div>
      <div class="form-group" style="position: relative;">
        <label for="unit-brand" class="form-label">Brand</label>
        <CustomSelect id="unit-brand" v-model="form.brand_id" :options="brandOptions" placeholder="Select brand" />
      </div>
      <div class="form-group" style="position: relative;">
        <label for="unit-type" class="form-label">Unit Type</label>
        <CustomSelect id="unit-type" v-model="form.type_id" :options="typeOptions" placeholder="Select unit type" />
      </div>
      <div v-if="isPrinterOrCopier" class="form-group" style="position: relative;">
        <label for="unit-print-tech" class="form-label">
          Kategori Cetak (Laser / Inject) <span class="text-danger" style="color: var(--color-danger, #ef4444);">*</span>
        </label>
        <CustomSelect
          id="unit-print-tech"
          v-model="form.print_tech"
          :options="printTechOptions"
          placeholder="-- Pilih Laser atau Inject --"
        />
      </div>
          <div class="form-group" style="position: relative;">
        <label for="uom" class="form-label">Unit Of Measure</label>
        <CustomSelect id="uom" v-model="form.uom_id" :options="uomOptions" placeholder="Select UOM type" />
      </div>
      <div class="form-group">
        <label for="unit-price" class="form-label">Price (Optional)</label>
        <input id="unit-price" v-model.number="form.price" type="number" class="form-input" placeholder="e.g. 15000000" min="0">
      </div>
      <div class="form-group">
        <label for="unit-model" class="form-label">Model</label>
        <input id="unit-model" v-model="form.model" type="text" class="form-input" placeholder="Unit model">
      </div>
      <div class="form-group" style="margin-top: 1rem;">
        <label class="form-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
          <input type="checkbox" v-model="form.is_copier" style="width: 1rem; height: 1rem;" />
          Is a Photocopy Machine
        </label>
      </div>
      <div class="form-group" style="margin-top: 1rem;">
        <label class="form-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
          <input type="checkbox" v-model="form.is_computer" style="width: 1rem; height: 1rem;" />
          Is a Computer / PC / Laptop
        </label>
      </div>

      <div v-if="form.is_computer"
        style="margin-top: 1rem; border-top: 1px solid var(--color-border-light); padding-top: 1rem;">
        <h4 style="margin-bottom: 1rem; font-weight: 600;">Computer / Desktop Specifications</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label class="form-label">CPU</label>
            <input v-model="form.specsData.cpu" type="text" class="form-input" placeholder="e.g. Intel Core i5">
          </div>
          <div class="form-group">
            <label class="form-label">RAM</label>
            <input v-model="form.specsData.ram" type="text" class="form-input" placeholder="e.g. 8GB DDR4">
          </div>
          <div class="form-group">
            <label class="form-label">Storage</label>
            <input v-model="form.specsData.storage" type="text" class="form-input" placeholder="e.g. 512GB">
          </div>
          <div class="form-group">
            <label class="form-label">Storage Type</label>
            <CustomSelect v-model="form.specsData.storage_type"
              :options="[{ value: 'SSD', label: 'SSD' }, { value: 'HDD', label: 'HDD' }, { value: 'NVMe', label: 'NVMe' }]"
              placeholder="Select Type" />
          </div>
          <div class="form-group">
            <label class="form-label">OS</label>
            <input v-model="form.specsData.os" type="text" class="form-input" placeholder="e.g. Windows 11">
          </div>
          <div class="form-group">
            <label class="form-label">VGA</label>
            <input v-model="form.specsData.vga" type="text" class="form-input" placeholder="e.g. Intel Iris Xe">
          </div>
          <div class="form-group" style="grid-column: span 2;">
            <label class="form-label">Office Package</label>
            <input v-model="form.specsData.office" type="text" class="form-input"
              placeholder="e.g. Office Home & Student 2021">
          </div>
        </div>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Product" :message="`Are you sure you want to delete this product?`"
      @close="showConfirm = false" @confirm="handleDelete" />
    <HardDeleteDialog :open="hardDelete.show" title="Hapus Permanen Product" :item-label="hardDelete.expected"
      :expected="hardDelete.expected" :confirm-valid="hardDelete.confirmed" @close="hardDelete.close"
      @confirm="hardDelete.confirm" @update:input="hardDelete.input = $event" />
  </div>
</template>
