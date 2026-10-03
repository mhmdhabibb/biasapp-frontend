<script setup lang="ts">
// @ts-nocheck
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import type { RentalInvoice, TableColumn } from '@/types'
import { buildRecapSheet, downloadStyledExcel, filterApprovedPaid, filterByYear, normalizeExportYear, RENTAL_INVOICE_YEAR_FIELDS, uniqueSheetName, type RecapRow, type StyledCell } from '@/utils/exportHelpers'
import { printPaymentSlip } from '@/utils/paymentReceipt'
import { computed, reactive, ref } from 'vue'

const toast = useToast()
const { can } = usePermission()
const {
  rentalInvoices: data,
  contractItems,
  customers,
  payments,
  findContractItem,
  findCustomer,
  findUnit,
  refresh,
} = useMasterStore()

const columns: TableColumn[] = [
  { key: 'invoice_no', label: 'Invoice No' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'contract_item_id', label: 'Contract' },
  { key: 'period_start', label: 'Period Start' },
  { key: 'period_end', label: 'Period End' },
  { key: 'due_date', label: 'Due Date' },
  { key: 'total_pay', label: 'Total' },
  { key: 'status', label: 'Approval Status' },
  { key: 'payment_status', label: 'Status' },
]

function formatDate(value: any): string {
  if (!value) return '-'
  const d = new Date(value)
  if (isNaN(d.getTime())) return String(value).slice(0, 10)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function approvalStatus(status: string): string {
  if (status === 'approved') return 'approved'
  if (status === 'rejected') return 'rejected'
  return 'pending'
}

function isCopierUnit(unit: any): boolean {
  if (!unit) return false
  if (unit.is_computer === true || unit.is_computer === 1) return false
  return unit.is_copier === true || unit.is_copier === 1 ||
    String(unit.model || '').toLowerCase().includes('copier')
}

function invoicePayments(item: any) {
  return payments.value.filter((p: any) => String(p.rental_invoice_id) === String(item.id))
}

const showDetail = ref(false)
const detailItem = ref<any>(null)

function openDetail(item: any) {
  detailItem.value = item
  showDetail.value = true
}

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<RentalInvoice | null>(null)
const deletingItem = ref<RentalInvoice | null>(null)

// Date Range & Month Filters
const startDateFilter = ref('')
const endDateFilter = ref('')
const monthFilter = ref('')
const customerFilter = ref('')
const yearFilter = ref(new Date().getFullYear())
// Lock so double-clicking Export Excel does not produce 2 files.
const isExporting = ref(false)

function onMonthFilterChange() {
  if (!monthFilter.value) return
  const [yearStr, monthStr] = monthFilter.value.split('-')
  const year = parseInt(yearStr)
  const month = parseInt(monthStr)

  const firstDay = `${yearStr}-${monthStr.padStart(2, '0')}-01`
  const lastDayNum = new Date(year, month, 0).getDate()
  const lastDay = `${yearStr}-${monthStr.padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`

  startDateFilter.value = firstDay
  endDateFilter.value = lastDay
}

function resetFilters() {
  startDateFilter.value = ''
  endDateFilter.value = ''
  monthFilter.value = ''
  customerFilter.value = ''
}

const filteredData = computed(() => {
  let items = data.value
  if (customerFilter.value) {
    items = items.filter((d: any) => String(d.customer_id) === customerFilter.value)
  }
  if (startDateFilter.value) {
    items = items.filter((d: any) => {
      const itemDate = d.monthly_date || d.period_start || d.created_at
      if (!itemDate) return false
      return String(itemDate).slice(0, 10) >= startDateFilter.value
    })
  }
  if (endDateFilter.value) {
    items = items.filter((d: any) => {
      const itemDate = d.monthly_date || d.period_start || d.created_at
      if (!itemDate) return false
      return String(itemDate).slice(0, 10) <= endDateFilter.value
    })
  }
  return items
})

async function exportMonthToExcel() {
  if (isExporting.value) return
  const items = filteredData.value
  if (items.length === 0) {
    toast.warning('No rental invoice data to export!')
    return
  }

  let periodLabel = 'All_Periods'
  if (monthFilter.value) {
    periodLabel = monthFilter.value
  } else if (startDateFilter.value || endDateFilter.value) {
    periodLabel = `${startDateFilter.value || 'Start'}_to_${endDateFilter.value || 'End'}`
  }

  isExporting.value = true
  try {
    await exportInvoicesToExcel(items, `RentalInvoice_${periodLabel}`)
    toast.success('Excel report downloaded successfully')
  } finally {
    isExporting.value = false
  }
}

async function exportInvoicesToExcel(
  items: any[],
  filename: string,
  leadingSheets: Array<{ name: string; columnWidths: number[]; rows: StyledCell[][] }> = [],
) {
  const groups = new Map<string, any[]>()
  for (const item of items) {
    const key = String(item.customer_id ?? 'unknown')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }

  const sheets: Array<{ name: string; columnWidths: number[]; rows: StyledCell[][] }> = []
  // Sheet names must be unique (two customers may share the same company name).
  const usedSheetNames = new Set<string>()
  // Column widths: A=No(5), B=Description(30), C=MeterValues(12), D=Operator/Rate(8), E=Rp(4), F=Amount(16)
  const columnWidths = [5, 30, 12, 8, 4, 16]

  const fmtRp = (n: number) => n > 0 ? n.toLocaleString('id-ID') : (n === 0 ? '0' : String(n))

  for (const [customerId, groupItems] of groups) {
    const sortedItems = [...groupItems].sort((a, b) => {
      const da = a.period_start || a.monthly_date || ''
      const db = b.period_start || b.monthly_date || ''
      return da.localeCompare(db)
    })

    const firstCustomer = findCustomer(sortedItems[0].customer_id)
    const sheetName = uniqueSheetName(
      firstCustomer?.company_name || firstCustomer?.name || 'Customer_' + customerId,
      usedSheetNames,
    )

    const rows: StyledCell[][] = []
    const addRow = (cells: StyledCell[]) => rows.push(cells)

    const addInvoice = (item: any) => {
      const customer = findCustomer(item.customer_id)
      const custName = customer?.company_name || customer?.name || '-'
      const custAddress = customer?.address || '-'
      const ci = findContractItem(item.contract_item_id)
      const unit = findUnit(ci?.unit_id)
      const isCopier = isCopierUnit(unit)
      const invoiceDate = item.invoice_date || item.monthly_date || item.period_start
      const dateLabel = invoiceDate ? new Date(invoiceDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'
      const periodLabel = item.period_start
        ? new Date(item.period_start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        : '-'
      const baseRentalFee = item.base_rental_fee ?? item.basis_rental_fee ?? 0

      const pic = customer?.pic_name || ''
      const picGender = customer?.pic_gender
      const picPhone = customer?.phone || ''
      const picPrefix = picGender === 'L' ? 'Mr.' : picGender === 'P' ? 'Mrs.' : ''
      const picDisplay = pic ? ('PIC ' + (picPrefix ? picPrefix + ' ' : '') + pic + (picPhone ? ' - ' + picPhone : '')) : 'PIC Finance'

      const brandName = unit?.brand?.name || unit?.brand_name || ''
      const modelDesc = unit?.model || ci?.description || ''
      const serialNo = unit?.serial_no || ''
      // Format: "Rental Charges Photocopy Machine <Customer> <Brand> <Model> S/N : <Serial>  1 Unit"
      const machineType = isCopier ? 'Photocopy Machine' : 'Printer'
      const descParts = [`Rental Charges ${machineType} ${custName}`]
      if (brandName) descParts.push(brandName)
      if (modelDesc) descParts.push(modelDesc)
      if (serialNo) descParts.push(`S/N : ${serialNo}`)
      descParts.push(' 1 Unit')
      const unitLine = descParts.join(' ').replace(/\s+/g, ' ').trim()

      // ===== COMPANY HEADER (left) + INVOICE INFO (right) =====
      // Row 1: Company name + Inv No.
      addRow([
        { v: 'PT. BiAS SURYA TEKNOLOGI', mergeAcross: 2, style: 'borderBold' }, {}, {},
        { v: 'Inv No. :', style: 'borderBoldRight' },
        { v: item.invoice_no || '-', mergeAcross: 1, style: 'border' }, {},
      ])
      // Row 2: Address line 1 + Date
      addRow([
        { v: 'Greenland Housing Blok E6 No. 11', mergeAcross: 2, style: 'borderCenter' }, {}, {},
        { v: 'Date :', style: 'borderBoldRight' },
        { v: dateLabel, mergeAcross: 1, style: 'border' }, {},
      ])
      // Row 3: Address line 2 + Bill-to
      addRow([
        { v: 'Batam Kota - Batam - Kepulauan Riau', mergeAcross: 2, style: 'borderCenter' }, {}, {},
        { v: 'To:', style: 'borderBoldRight' },
        { v: custName, mergeAcross: 1, style: 'borderBold' }, {},
      ])
      // Row 4: Phone + Customer address
      addRow([
        { v: 'Telp : +62 811 7045 657', mergeAcross: 2, style: 'borderCenter' }, {}, {},
        { v: custAddress, mergeAcross: 1, style: 'border' }, {},
      ])
      // Row 5: Email + (continued address)
      addRow([
        { v: 'Email : admin@biasbst.com', mergeAcross: 2, style: 'borderCenter' }, {}, {},
        {}, {},
      ])
      // Row 6: Website + PIC / Attn
      addRow([
        { v: 'www.biasbst.com', mergeAcross: 2, style: 'borderCenter' }, {}, {},
        { v: 'Attn :', style: 'borderBoldRight' },
        { v: picDisplay, mergeAcross: 1, style: 'borderBold' }, {},
      ])

      // ===== INVOICE TITLE + PERIOD =====
      addRow([{ v: 'INVOICE', mergeAcross: 5, style: 'titleCell' }])
      addRow([{ v: 'Period: ' + periodLabel, mergeAcross: 2, style: 'borderCenter' }])

      // ===== TABLE HEADER =====
      addRow([
        { v: 'No', style: 'headerCell' },
        { v: 'Description', mergeAcross: 2, style: 'headerCell' }, {}, {},
        {}, // operator/rate column (empty in header)
        { v: 'Amount', style: 'headerCell' },
      ])

      // ===== ROW 1: Rental Charge =====
      addRow([
        { v: 1, style: 'borderCenter' },
        { v: unitLine, mergeAcross: 2, style: 'borderBold' }, {}, {},
        { v: 'Rp', style: 'borderBoldRight' },
        { v: fmtRp(baseRentalFee), style: 'borderBoldRight' },
      ])

      const meterDetails: any[] = item.meter_details || []
      let rowNum = 2

      // --- Helper: render meter section ---
      const pushMeterSection = (sectionLabel: string, start: number, last: number, free: number) => {
        const total = last - start
        const billable = Math.max(0, total - free)
        // Section label (e.g. "B/W A4", "Colour A4") — bold
        addRow([{}, { v: sectionLabel, mergeAcross: 2, style: 'borderBoldCenter' }, {}, {}, {}, {}])
        // Start Meter Reading
        addRow([{}, { v: 'Start Meter Reading', style: 'border' }, { v: start, style: 'borderRight' }, {}, {}, {}])
        // Last Meter Reading + (-)
        addRow([{}, { v: 'Last Meter Reading', style: 'border' }, { v: last, style: 'borderRight' }, { v: '(-)', style: 'border' }, {}, {}])
        // Total Copies
        addRow([{}, { v: 'Total Copies', style: 'border' }, { v: total, style: 'borderBoldRight' }, {}, {}, {}])
        // Free Copies + (-)
        addRow([{}, { v: 'Free Copies', style: 'border' }, { v: free, style: 'borderRight' }, { v: '(-)', style: 'border' }, {}, {}])
        // Total Copies (billable)
        addRow([{}, { v: 'Total Copies', style: 'border' }, { v: billable, style: 'borderBoldRight' }, {}, {}, {}])
        return { total, billable }
      }

      // --- Helper: render charge row ---
      const chargeRow = (desc: string, rate: number, amount: number) => {
        addRow([
          { v: rowNum++, style: 'borderCenter' },
          { v: desc, style: 'border' },
          { v: '(x)', style: 'borderCenter' },
          { v: 'Rp', style: 'borderRight' },
          { v: fmtRp(rate), style: 'borderRight' },
          { v: fmtRp(amount), style: 'borderBoldRight' },
        ])
      }

      if (meterDetails.length > 0) {
        // Group meter details by paper size + kind
        const byPaperSize = new Map<string, any[]>()
        for (const detail of meterDetails) {
          const psName = detail.paper_size?.name || 'Tanpa ukuran'
          const ptName = detail.paper_type?.name || ''
          const key = ptName ? `${psName}/${ptName}` : psName
          if (!byPaperSize.has(key)) byPaperSize.set(key, [])
          byPaperSize.get(key)!.push(detail)
        }

        for (const [paperSize, details] of byPaperSize) {
          const bwDetails = details.filter((d: any) => /bw|mono|b\/w/i.test(d.color_mode || ''))
          const colorDetails = details.filter((d: any) => /colou?r/i.test(d.color_mode || ''))

          // B/W section for this paper size
          for (const detail of bwDetails) {
            const start = detail.start_meter_reading || 0
            const last = detail.last_meter_reading || 0
            const free = detail.free_quota ?? 0
            const billable = detail.billable_copies ?? Math.max(0, (last - start) - free)
            pushMeterSection(`B/W ${paperSize}`, start, last, free)
            chargeRow(`Copies Charges B/W ${paperSize}`, detail.rate_per_page || 0, detail.total_amount || 0)
          }

          // Colour section for this paper size
          for (const detail of colorDetails) {
            const start = detail.start_meter_reading || 0
            const last = detail.last_meter_reading || 0
            const free = detail.free_quota ?? 0
            const billable = detail.billable_copies ?? Math.max(0, (last - start) - free)
            pushMeterSection(`Colour ${paperSize}`, start, last, free)
            chargeRow(`Copies Charges Colour ${paperSize}`, detail.rate_per_page || 0, detail.total_amount || 0)
          }
        }
      } else if (isCopier) {
        // Fallback: no meter_details but is copier
        const bwStart = item.meter_start || item.meter_start_bw || ci?.start_meter_bw || 0
        const bwEnd = item.meter_end || item.meter_end_bw || bwStart
        const bwFree = item.free_copies || ci?.free_copy_quota || 2000
        const bwRate = item.rate_per_page || 150
        const bw = pushMeterSection('B/W A4', bwStart, bwEnd, bwFree)
        chargeRow('Copies Charges B/W A4', bwRate, bw.billable * bwRate)

        const colorStart = ci?.start_meter_color || 0
        const colorEnd = item.meter_end_colour || colorStart
        const colorFree = ci?.free_quota_color || 0
        const colorRate = ci?.rate_per_page_color || bwRate
        if (colorStart > 0 || colorFree > 0) {
          const col = pushMeterSection('Colour A4', colorStart, colorEnd, colorFree)
          chargeRow('Copies Charges Colour A4', colorRate, col.billable * colorRate)
        }
      }

      // ===== TOTAL / TAX / TOTAL PAY =====
      const subtotal = item.subtotal ?? (baseRentalFee + (item.excess_copies_fee || item.excess_amount || 0))
      const tax = item.tax || 0
      const totalPay = item.total_pay ?? subtotal + tax

      addRow([{}, {}, {}, { v: 'TOTAL', style: 'borderBoldRight' }, { v: 'Rp', style: 'borderBoldRight' }, { v: fmtRp(subtotal), style: 'borderBoldRight' }])
      addRow([{ v: 'Payment by transfer to account:', mergeAcross: 1, style: 'border' }, {}, { v: 'TAX', style: 'borderBoldRight' }, {}, { v: tax || '-', style: 'borderBoldRight' }])
      addRow([{ v: 'PT. BIAS SURYA TEKNOLOGI', mergeAcross: 1, style: 'borderBoldCenter' }, {}, { v: 'TOTAL PAY', style: 'borderBoldRight' }, { v: 'Rp', style: 'borderBoldRight' }, { v: fmtRp(totalPay), style: 'borderBoldRight' }])
      addRow([{ v: 'NPWP : 0941.8395.0822.5000', mergeAcross: 1, style: 'borderBoldCenter' }])
      addRow([{ v: 'BANK RIAU KEPRI SYARIAH CAB. BATAM', mergeAcross: 1, style: 'borderBold' }])
      addRow([{ v: 'Account No. 1060885757', mergeAcross: 1, style: 'borderBold' }])
      addRow([{ v: 'BANK MANDIRI CABANG BATAM', mergeAcross: 1, style: 'borderBold' }])
      addRow([{ v: 'Account No. 109-00-3388575-7', mergeAcross: 1, style: 'borderBold' }])

      // ===== SIGNATURES =====
      addRow([])
      addRow([{ v: 'Received By,', mergeAcross: 1, style: 'plainBoldCenter' }, {}, {}, { v: 'PT. BiAS SURYA TEKNOLOGI', mergeAcross: 1, style: 'plainBoldCenter' }])
      addRow([])
      addRow([{ v: '_______________________', mergeAcross: 1, style: 'plainCenter' }, {}, {}, { v: '_______________________', mergeAcross: 1, style: 'plainCenter' }])
      addRow([{ v: '', mergeAcross: 1 }, {}, {}, { v: 'Grace Hutapea', mergeAcross: 1, style: 'plainBoldCenter' }])
      addRow([{}, {}, {}, { v: 'Admin Finance', style: 'plainCenter' }])
      addRow([])
    }

    for (const item of sortedItems) addInvoice(item)
    sheets.push({ name: sheetName, columnWidths, rows })
  }

  await downloadStyledExcel([...leadingSheets, ...sheets], filename)
}
// Old export block (unused XLSX/PDF) removed — active export uses downloadStyledExcel.
function exportMonthToPdf() {
  const items = filteredData.value
  if (items.length === 0) {
    toast.warning('No rental invoice data to export to PDF!')
    return
  }

  const rows = items.map((item: any, index: number) => `
    <tr>
      <td>${index + 1}</td>
      <td>${item.invoice_no || `INV-R-${item.id}`}</td>
      <td>${formatDate(item.monthly_date || item.period_start)}</td>
      <td>${customerName(item.customer_id)}</td>
      <td>${contractNo(item.contract_item_id)}</td>
      <td>${formatRupiah(item.total_pay || item.subtotal || 0)}</td>
      <td>${String(item.status || 'unpaid').toUpperCase()}</td>
    </tr>
  `).join('')
  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  printWindow.document.write(`<!doctype html><html><head><title>Rental Invoices</title><style>
    body{font:12px Arial,sans-serif;color:#222}h1,h2{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #777;padding:6px}th{background:#e8f1ff}
    </style></head><body><h1>PT. BIAS SURYA TEKNOLOGI</h1><h2>Rental Invoices</h2><table><thead><tr><th>No</th><th>Invoice</th><th>Date</th><th>Customer</th><th>Contract</th><th>Total</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`)
  printWindow.document.close()
}

const form = reactive({
  invoice_no: '',
  contract_item_id: null as any,
  customer_id: null as any,
  period_start: '',
  period_end: '',
  monthly_date: '',
  due_date: '',
  basis_rental_fee: 0,
  excess_amount: 0,
  subtotal: 0,
  tax: 0,
  total_pay: 0,
  status: 'unpaid',
  meter_start: 0,
  meter_end: 0,
  free_copies: 2000,
  rate_per_page: 150
})

const defaultForm = { ...form }

async function exportAnnualExcel() {
  if (isExporting.value) return
  // Strict filter: only records with ALL dates inside the selected year,
  // so other-year data (e.g. 2027) is excluded when exporting 2026.
  const year = normalizeExportYear(yearFilter.value)
  if (year === null) {
    toast.warning('Invalid year (1900–2100)!')
    return
  }
  // Annual export only for invoices that are approved AND paid.
  const items = filterApprovedPaid(filterByYear(data.value, year, RENTAL_INVOICE_YEAR_FIELDS))
  if (items.length === 0) {
    toast.warning(`No approved & paid rental invoice data for year ${year}!`)
    return
  }
  isExporting.value = true
  try {
    const sorted = [...items].sort((a: any, b: any) =>
      String(a.period_start || a.monthly_date || '').localeCompare(String(b.period_start || b.monthly_date || '')))
    const recapRows: RecapRow[] = sorted.map((item: any, i: number) => {
      const c = findCustomer(item.customer_id)
      const period = item.period_start
        ? new Date(item.period_start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        : String(item.monthly_date || '').slice(0, 10)
      return {
        no: i + 1,
        customer: c?.company_name || c?.name || '-',
        invoiceNo: item.invoice_no || '-',
        period,
        total: item.total_pay ?? item.subtotal ?? 0,
      }
    })
    const recap = buildRecapSheet(`Rental Invoice Recap ${year}`, `${items.length} invoice(s) (approved & paid)`, recapRows)
    await exportInvoicesToExcel(items, `RentalInvoice_Annual_${year}`, [recap])
    toast.success('Annual Excel report downloaded successfully')
  } finally {
    isExporting.value = false
  }
}

async function exportAnnualPdf() {
  const year = normalizeExportYear(yearFilter.value)
  if (year === null) {
    toast.warning('Invalid year (1900–2100)!')
    return
  }
  // Annual export only for invoices that are approved AND paid.
  const items = filterApprovedPaid(filterByYear(data.value, year, RENTAL_INVOICE_YEAR_FIELDS))
  if (items.length === 0) {
    toast.warning(`No approved & paid rental invoice data for year ${year}!`)
    return
  }
  const body = items.map((inv: any) => {
    const html = invoiceHtml(inv)
    const m = html.match(/<body>([\s\S]*?)<\/body>/)
    return m ? `<div style="page-break-after: always;">${m[1]}</div>` : ''
  }).join('')
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Annual Rental Invoice Report ${year}</title>
  <style>
    @media print { @page { margin: 12mm 10mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; margin: 0; padding: 20px; color: #1a1a1a; background: #fff; }
    .inv-container { max-width: 760px; margin: 0 auto; page-break-after: always; }
    .header-wrap { display: flex; justify-content: space-between; align-items: stretch; gap: 16px; margin-bottom: 16px; }
    .left-box { width: 44%; background: #f0f7ff; border-radius: 8px; padding: 14px 16px; }
    .left-box .co-name { color: #1a56db; font-size: 14px; font-weight: 700; margin-bottom: 8px; letter-spacing: 0.3px; }
    .left-box .co-addr { font-size: 10.5px; color: #374151; line-height: 1.6; padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid #bfdbfe; }
    .left-box .co-contact { font-size: 10.5px; color: #374151; line-height: 1.8; }
    .right-box { width: 54%; }
    .right-table { width: 100%; border-collapse: collapse; font-size: 11px; border-radius: 8px; overflow: hidden; }
    .right-table td { border: 1px solid #e5e7eb; padding: 5px 10px; vertical-align: top; }
    .right-table .lbl { width: 80px; font-weight: 600; color: #6b7280; background: #f9fafb; white-space: nowrap; }
    .right-table .kepada { text-align: center; font-weight: 700; background: #1a56db; color: #fff; letter-spacing: 0.5px; }
    .right-table .cust-name { font-weight: 700; font-size: 12px; }
    .inv-title-wrap { text-align: center; margin: 16px 0 6px; }
    .inv-title { font-size: 26px; font-weight: 800; letter-spacing: 6px; color: #111827; }
    .period { text-align: center; font-style: italic; font-size: 11.5px; color: #4b5563; margin-bottom: 14px; }
    .main-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .main-table thead tr { background: #1a56db; color: #fff; }
    .main-table th { padding: 8px 10px; font-weight: 600; font-size: 11px; text-align: left; letter-spacing: 0.3px; }
    .main-table th.center { text-align: center; }
    .main-table td { border: 1px solid #e5e7eb; padding: 6px 10px; vertical-align: top; }
    .main-table tbody tr:nth-child(even) { background: #f9fafb; }
    .no-col { width: 28px; text-align: center; }
    .rp-col { width: 22px; border-right: none !important; text-align: center; color: #6b7280; font-size: 10px; }
    .val-col { border-left: none !important; text-align: right; width: 90px; font-weight: 600; }
    .desc-inner { font-size: 10.5px; }
    .desc-inner .meter-section { margin: 6px 0 4px 8px; color: #374151; }
    .desc-inner .meter-label { font-weight: 600; font-size: 10.5px; color: #1a56db; margin-bottom: 2px; }
    .desc-inner .meter-grid { display: grid; grid-template-columns: 1fr 70px 16px; line-height: 1.7; padding-left: 4px; color: #374151; }
    .desc-inner .meter-grid span.num { text-align: right; font-weight: 500; }
    .total-row td { font-weight: 600; background: #f9fafb; border: 1px solid #e5e7eb; padding: 6px 10px; }
    .total-row.grand td { background: #1a56db; color: #fff; font-size: 12px; font-weight: 700; }
    .total-lbl { text-align: right; padding-right: 12px; color: #4b5563; }
    .total-row.grand .total-lbl { color: #fff; }
    .bottom-wrap { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-top: 16px; }
    .bank-box { width: 44%; background: #f0f7ff; border-radius: 8px; padding: 12px 14px; font-size: 10px; line-height: 1.7; color: #374151; }
    .bank-box .bank-header { font-weight: 700; color: #1a56db; text-align: center; font-size: 10.5px; margin-bottom: 4px; }
    .bank-box .bank-name { font-weight: 700; margin-top: 4px; }
    .sig-area { width: 52%; display: flex; justify-content: space-between; padding-top: 4px; }
    .sig-col { width: 46%; text-align: center; display: flex; flex-direction: column; align-items: center; font-size: 11px; }
    .sig-label { font-size: 10.5px; color: #6b7280; margin-bottom: 48px; }
    .sig-line { width: 85%; border-bottom: 1.5px solid #374151; margin-bottom: 4px; }
    .sig-name { font-weight: 700; font-size: 11px; }
    .sig-role { font-style: italic; font-size: 10px; color: #6b7280; }
    .paid-stamp { display: inline-block; border: 3px double #166534; border-radius: 12px; color: #166534; font-weight: 900; font-size: 26px; letter-spacing: 4px; padding: 6px 22px; transform: rotate(-8deg); margin-top: 10px; }
    .paid-stamp.partial { border-color: #b45309; color: #b45309; font-size: 16px; letter-spacing: 2px; }
    .paid-stamp.unpaid { border-color: #57534e; color: #57534e; font-size: 16px; letter-spacing: 2px; }
  </style>
</head>
<body>
${body}
<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script>
</body>
</html>`
  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
}

function onContractChange() {
  const ci = findContractItem(form.contract_item_id)
  if (ci) {
    form.customer_id = ci.customer_id
    form.basis_rental_fee = ci.monthly_rent_fee
    recalculate()
  }
}

function recalculate() {
  const ci = findContractItem(form.contract_item_id)
  const isComputer = ci && ci.specs && ci.specs.length > 5

  if (!isComputer) {
    const totalUsage = Math.max(0, form.meter_end - form.meter_start)
    const excess = Math.max(0, totalUsage - form.free_copies)
    form.excess_amount = excess * form.rate_per_page
  }

  form.subtotal = form.basis_rental_fee + form.excess_amount
  form.total_pay = form.subtotal + form.tax
}

function openAdd() {
  editingItem.value = null
  Object.assign(form, { ...defaultForm, invoice_no: `INV-R-${Date.now().toString().slice(-6)}` })
  showModal.value = true
}

function openEdit(item: RentalInvoice) {
  editingItem.value = item
  Object.assign(form, {
    invoice_no: item.invoice_no,
    contract_item_id: item.contract_item_id,
    customer_id: item.customer_id,
    period_start: item.period_start,
    period_end: item.period_end,
    monthly_date: item.monthly_date,
    due_date: item.due_date,
    basis_rental_fee: item.basis_rental_fee,
    excess_amount: item.excess_amount,
    subtotal: item.subtotal,
    tax: item.tax,
    total_pay: item.total_pay,
    status: item.status,
    meter_start: item.meter_start || 0,
    meter_end: item.meter_end || 0,
    free_copies: item.free_copies || 2000,
    rate_per_page: item.rate_per_page || 150
  })
  showModal.value = true
}

async function handleUpdateStatus(item: any, newStatus: string) {
  try {
    await api.patch(`/rental-invoices/${item.id}`, { status: newStatus })
    await refresh()
    toast.success(`Invoice status updated to ${newStatus}`)
  } catch (error: any) {
    toast.error('Failed to update status: ' + (error.message || 'Error'))
  }
}

const showPaymentModal = ref(false)
const paymentInvoiceId = ref<string | null>(null)
const paymentForm = reactive({
  amount: 0,
  payment_date: new Date().toISOString().split('T')[0],
  payment_method: 'transfer',
  reference: '',
  notes: '',
  bank_name: '',
  account_number: '',
  sender_name: ''
})

function openPaymentModal(item: any) {
  paymentInvoiceId.value = item.id
  paymentForm.amount = item.total_pay || item.subtotal || 0
  paymentForm.payment_date = new Date().toISOString().split('T')[0]
  paymentForm.payment_method = 'transfer'
  paymentForm.reference = ''
  paymentForm.notes = ''
  paymentForm.bank_name = ''
  paymentForm.account_number = ''
  paymentForm.sender_name = ''
  showPaymentModal.value = true
}

async function submitPayment() {
  if (!paymentInvoiceId.value || paymentForm.amount <= 0) {
    toast.error('Invalid payment amount')
    return
  }
  try {
    let finalBankName = paymentForm.bank_name
    if (paymentForm.payment_method === 'transfer' || paymentForm.payment_method === 'credit_card') {
      finalBankName = `${paymentForm.bank_name} - ${paymentForm.account_number} (A/N: ${paymentForm.sender_name})`
    }

    const payNo = `PAY-${Date.now()}`
    await api.post(`/payments`, {
      payment_no: payNo,
      rental_invoice_id: paymentInvoiceId.value,
      payment_date: paymentForm.payment_date + "T00:00:00Z",
      amount: paymentForm.amount,
      payment_method: paymentForm.payment_method,
      bank_name: paymentForm.payment_method === 'cash' ? 'CASH' : finalBankName,
      reference_no: paymentForm.reference || '-',
      notes: paymentForm.notes
    })
    toast.success('Payment recorded successfully')
    const inv = data.value.find((d: any) => String(d.id) === String(paymentInvoiceId.value))
    const opened = printPaymentSlip({
      payment_no: payNo,
      invoice_no: inv?.invoice_no || '-',
      customer_name: customerName(inv?.customer_id),
      payment_date: paymentForm.payment_date,
      amount: Number(paymentForm.amount || 0),
      reference_no: paymentForm.reference || '-',
      status: 'pending',
      method: paymentForm.payment_method === 'cash' ? 'Tunai' : 'Transfer',
    })
    if (!opened) toast.warning('Izinkan pop-up browser untuk mencetak tanda terima.')
    showPaymentModal.value = false
    refresh()
  } catch (error: any) {
    toast.error('Failed to record payment: ' + (error.message || 'Error'))
  }
}

function handleSubmit() {
  if (!form.invoice_no.trim()) return
  recalculate()
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx]!, ...form, updated_at: new Date().toISOString() }
  } else {
    data.value.push({ id: Date.now(), ...form, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })
  }
  showModal.value = false
}

function openDelete(item: RentalInvoice) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}

function customerName(id: any): string {
  const c = findCustomer(id as any)
  return c ? c.company_name || c.name || '-' : '-'
}

function contractNo(id: any): string {
  const ci = findContractItem(id)
  return ci ? ci.contract_no : '-'
}

function formatRupiah(val: number): string {
  return 'Rp ' + val.toLocaleString('id-ID')
}

function invoiceHtml(item: any): string {
  const customer = findCustomer(item.customer_id)
  const custName = customer?.company_name || customer?.name || '-'
  const custAddress = customer?.address || '-'
  const pic = customer?.pic_name || '-'
  const gender = customer?.pic_gender
  let prefix = 'Mr./Mrs. '
  if (gender === 'L') prefix = 'Mr. '
  if (gender === 'P') prefix = 'Mrs. '
  const picDisplay = pic !== '-' ? prefix + pic : 'Finance'

  const dateStr = item.invoice_date
    ? new Date(item.invoice_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
    : (item.monthly_date ? new Date(item.monthly_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '-')

  let periodStr = '-'
  if (item.period_start) {
    periodStr = new Date(item.period_start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  }

  const ci = findContractItem(item.contract_item_id) || contractItems.value.find(c => String(c.contract_id) === String(item.contract_id))
  const unit = findUnit(ci?.unit_id)
  const isCopier = isCopierUnit(unit)
  const unitDesc = ci?.description || unit?.model || ''
  const baseRentalFee = item.base_rental_fee || item.basis_rental_fee || 0

  // Build meter detail rows from meter_details array
  const meterDetails: any[] = item.meter_details || []
  const bwDetails = meterDetails.filter((d: any) => (d.color_mode || '').toLowerCase().includes('bw') || (d.color_mode || '').toLowerCase().includes('mono') || (d.color_mode || '').toLowerCase() === 'b/w')
  const colDetails = meterDetails.filter((d: any) => (d.color_mode || '').toLowerCase().includes('colour') || (d.color_mode || '').toLowerCase().includes('color'))

  // If no meter_details, fall back to flat fields for legacy data
  const legacyBwStart = item.meter_start || item.meter_start_bw || ci?.start_meter_bw || 0
  const legacyBwEnd = item.meter_end || item.meter_end_bw || legacyBwStart
  const legacyFree = item.free_copies || ci?.free_copy_quota || 2000
  const legacyRateBw = item.rate_per_page || 150

  function meterDetailRows(details: any[], label: string): string {
    if (details.length === 0) return ''
    return details.map(d => {
      const total = d.total_copies ?? Math.max(0, (d.last_meter_reading || 0) - (d.start_meter_reading || 0))
      const free = d.free_quota ?? 0
      const net = d.billable_copies ?? Math.max(0, total - free)
      const sizeLabel = d.paper_size?.name || d.color_mode || label
      return `
        <tr><td></td><td colspan="3" style="padding:2px 8px; font-weight:normal;">
          <b>${sizeLabel}</b><br>
          <div style="display:grid; grid-template-columns:1fr 80px 20px; line-height:1.6; padding-left:8px;">
            <span>Start Meter Reading</span><span style="text-align:right;">${(d.start_meter_reading || 0).toLocaleString('id-ID')}</span><span></span>
            <span>Last Meter Reading</span><span style="text-align:right;">${(d.last_meter_reading || 0).toLocaleString('id-ID')}</span><span style="padding-left:4px;">(-)</span>
            <span>Total Copies</span><span style="text-align:right;"><b>${total.toLocaleString('id-ID')}</b></span><span></span>
            ${free > 0 ? `<span>Free Copies</span><span style="text-align:right;">${free.toLocaleString('id-ID')}</span><span style="padding-left:4px;">(-)</span>` : ''}
            ${free > 0 ? `<span>Total Copies</span><span style="text-align:right;"><b>${net.toLocaleString('id-ID')}</b></span><span></span>` : ''}
          </div>
        </td></tr>`
    }).join('')
  }

  // Charge rows per detail
  function chargeRows(details: any[], rowNum: number): string {
    return details.map((d, i) => {
      const sizeLabel = d.paper_size?.name ? `Copies Charges ${d.color_mode?.toUpperCase() || ''} ${d.paper_size.name}` : `Copies Charges ${d.color_mode?.toUpperCase() || ''}`
      const rate = d.rate_per_page || 0
      const amount = d.total_amount || 0
      return `<tr>
        <td class="no-col">${rowNum + i}</td>
        <td>${sizeLabel}</td>
        <td style="text-align:center;">(x)</td>
        <td style="text-align:right;">Rp&nbsp;${rate.toLocaleString('id-ID')}</td>
        <td class="rp-col">Rp</td>
        <td class="val-col">${amount > 0 ? amount.toLocaleString('id-ID') : '-'}</td>
      </tr>`
    }).join('')
  }

  // Legacy (no meter_details) rows
  const legacyBwTotal = Math.max(0, legacyBwEnd - legacyBwStart)
  const legacyBwBillable = Math.max(0, legacyBwTotal - legacyFree)
  const legacyBwAmount = legacyBwBillable * legacyRateBw

  const legacyColStart = ci?.start_meter_color || 0
  const legacyColEnd = legacyColStart
  const legacyColFree = ci?.free_quota_color || 0
  const legacyColTotal = Math.max(0, legacyColEnd - legacyColStart)
  const legacyColBillable = Math.max(0, legacyColTotal - legacyColFree)

  const legacyBodyRows = (meterDetails.length === 0 && isCopier) ? `
    <tr><td></td><td colspan="3" style="padding:2px 8px; font-weight:normal;">
      <b>B/W</b><br>
      <div style="display:grid; grid-template-columns:1fr 80px 20px; line-height:1.6; padding-left:8px;">
        <span>Start Meter Reading</span><span style="text-align:right;">${legacyBwStart.toLocaleString('id-ID')}</span><span></span>
        <span>Last Meter Reading</span><span style="text-align:right;">${legacyBwEnd.toLocaleString('id-ID')}</span><span style="padding-left:4px;">(-)</span>
        <span>Total Copies</span><span style="text-align:right;"><b>${legacyBwTotal.toLocaleString('id-ID')}</b></span><span></span>
        <span>Free Copies</span><span style="text-align:right;">${legacyFree.toLocaleString('id-ID')}</span><span style="padding-left:4px;">(-)</span>
        <span>Total Copies</span><span style="text-align:right;"><b>${legacyBwBillable.toLocaleString('id-ID')}</b></span><span></span>
      </div>
      
      ${legacyColStart > 0 || legacyColFree > 0 ? `
      <br><b>Color</b><br>
      <div style="display:grid; grid-template-columns:1fr 80px 20px; line-height:1.6; padding-left:8px;">
        <span>Start Meter Reading</span><span style="text-align:right;">${legacyColStart.toLocaleString('id-ID')}</span><span></span>
        <span>Last Meter Reading</span><span style="text-align:right;">${legacyColEnd.toLocaleString('id-ID')}</span><span style="padding-left:4px;">(-)</span>
        <span>Total Copies</span><span style="text-align:right;"><b>${legacyColTotal.toLocaleString('id-ID')}</b></span><span></span>
        <span>Free Copies</span><span style="text-align:right;">${legacyColFree.toLocaleString('id-ID')}</span><span style="padding-left:4px;">(-)</span>
        <span>Total Copies</span><span style="text-align:right;"><b>${legacyColBillable.toLocaleString('id-ID')}</b></span><span></span>
      </div>
      ` : ''}
    </td></tr>
    <tr>
      <td class="no-col">2</td><td>Copies Charges B/W</td>
      <td style="text-align:center;">(x)</td>
      <td style="text-align:right;">Rp&nbsp;${legacyRateBw.toLocaleString('id-ID')}</td>
      <td class="rp-col">Rp</td>
      <td class="val-col">${legacyBwAmount > 0 ? legacyBwAmount.toLocaleString('id-ID') : '-'}</td>
    </tr>` : ''

  const total = (item.subtotal || baseRentalFee + (item.excess_copies_fee || item.excess_amount || 0)).toLocaleString('id-ID')
  const tax = (item.tax || 0).toLocaleString('id-ID')
  const totalPay = (item.total_pay || 0).toLocaleString('id-ID')

  // Stempel pelunasan: hanya bila invoice sudah di-approve accounting.
  const payStatus = String(item.payment_status || '').toLowerCase()
  const isApprovedInv = String(item.status || '').toLowerCase() === 'approved'
  const stampHtml = !isApprovedInv ? '' : payStatus === 'paid'
    ? `<div style="text-align:center; margin: 8px 0 2px;"><span class="paid-stamp">LUNAS</span></div>`
    : (payStatus === 'partially_paid' || payStatus === 'partial')
      ? `<div style="text-align:center; margin: 8px 0 2px;"><span class="paid-stamp partial">BELUM LUNAS (CICILAN)</span></div>`
      : `<div style="text-align:center; margin: 8px 0 2px;"><span class="paid-stamp unpaid">BELUM BAYAR</span></div>`

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Invoice - ${item.invoice_no || 'Rental'}</title>
  <style>
    @media print { @page { margin: 12mm 10mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; margin: 0; padding: 20px; color: #1a1a1a; background: #fff; }
    .inv-container { max-width: 760px; margin: 0 auto; }

    /* Header */
    .header-wrap { display: flex; justify-content: space-between; align-items: stretch; gap: 16px; margin-bottom: 16px; }
    .left-box { width: 44%; background: #f0f7ff; border-radius: 8px; padding: 14px 16px; }
    .left-box .co-name { color: #1a56db; font-size: 14px; font-weight: 700; margin-bottom: 8px; letter-spacing: 0.3px; }
    .left-box .co-addr { font-size: 10.5px; color: #374151; line-height: 1.6; padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid #bfdbfe; }
    .left-box .co-contact { font-size: 10.5px; color: #374151; line-height: 1.8; }
    .right-box { width: 54%; }
    .right-table { width: 100%; border-collapse: collapse; font-size: 11px; border-radius: 8px; overflow: hidden; }
    .right-table td { border: 1px solid #e5e7eb; padding: 5px 10px; vertical-align: top; }
    .right-table tr:first-child td:first-child { border-radius: 8px 0 0 0; }
    .right-table .lbl { width: 80px; font-weight: 600; color: #6b7280; background: #f9fafb; white-space: nowrap; }
    .right-table .kepada { text-align: center; font-weight: 700; background: #1a56db; color: #fff; letter-spacing: 0.5px; }
    .right-table .cust-name { font-weight: 700; font-size: 12px; }

    /* Invoice Title */
    .inv-title-wrap { text-align: center; margin: 16px 0 6px; }
    .inv-title { font-size: 26px; font-weight: 800; letter-spacing: 6px; color: #111827; }
    .period { text-align: center; font-style: italic; font-size: 11.5px; color: #4b5563; margin-bottom: 14px; }

    /* Main Table */
    .main-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .main-table thead tr { background: #1a56db; color: #fff; }
    .main-table th { padding: 8px 10px; font-weight: 600; font-size: 11px; text-align: left; letter-spacing: 0.3px; }
    .main-table th.center { text-align: center; }
    .main-table td { border: 1px solid #e5e7eb; padding: 6px 10px; vertical-align: top; }
    .main-table tbody tr:nth-child(even) { background: #f9fafb; }
    .no-col { width: 28px; text-align: center; }
    .rp-col { width: 22px; border-right: none !important; text-align: center; color: #6b7280; font-size: 10px; }
    .val-col { border-left: none !important; text-align: right; width: 90px; font-weight: 600; }
    .desc-inner { font-size: 10.5px; }
    .desc-inner .meter-section { margin: 6px 0 4px 8px; color: #374151; }
    .desc-inner .meter-label { font-weight: 600; font-size: 10.5px; color: #1a56db; margin-bottom: 2px; }
    .desc-inner .meter-grid { display: grid; grid-template-columns: 1fr 70px 16px; line-height: 1.7; padding-left: 4px; color: #374151; }
    .desc-inner .meter-grid span.num { text-align: right; font-weight: 500; }

    /* Total rows */
    .total-row td { font-weight: 600; background: #f9fafb; border: 1px solid #e5e7eb; padding: 6px 10px; }
    .total-row.grand td { background: #1a56db; color: #fff; font-size: 12px; font-weight: 700; }
    .total-lbl { text-align: right; padding-right: 12px; color: #4b5563; }
    .total-row.grand .total-lbl { color: #fff; }

    /* Footer */
    .bottom-wrap { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-top: 16px; }
    .bank-box { width: 44%; background: #f0f7ff; border-radius: 8px; padding: 12px 14px; font-size: 10px; line-height: 1.7; color: #374151; }
    .bank-box .bank-header { font-weight: 700; color: #1a56db; text-align: center; font-size: 10.5px; margin-bottom: 4px; }
    .bank-box .bank-name { font-weight: 700; margin-top: 4px; }
    .sig-area { width: 52%; display: flex; justify-content: space-between; padding-top: 4px; }
    .sig-col { width: 46%; text-align: center; display: flex; flex-direction: column; align-items: center; font-size: 11px; }
    .sig-label { font-size: 10.5px; color: #6b7280; margin-bottom: 48px; }
    .sig-line { width: 85%; border-bottom: 1.5px solid #374151; margin-bottom: 4px; }
    .sig-name { font-weight: 700; font-size: 11px; }
    .sig-role { font-style: italic; font-size: 10px; color: #6b7280; }
    .paid-stamp { display: inline-block; border: 3px double #166534; border-radius: 12px; color: #166534; font-weight: 900; font-size: 26px; letter-spacing: 4px; padding: 6px 22px; transform: rotate(-8deg); margin-top: 10px; }
    .paid-stamp.partial { border-color: #b45309; color: #b45309; font-size: 16px; letter-spacing: 2px; }
    .paid-stamp.unpaid { border-color: #57534e; color: #57534e; font-size: 16px; letter-spacing: 2px; }
  </style>
</head>
<body>
<div class="inv-container">
  <!-- Header -->
  <div class="header-wrap">
    <div class="left-box">
      <div class="co-name">PT. BiAS SURYA TEKNOLOGI</div>
      <div class="co-addr">Greenland Housing Blok E6 No. 11<br>Batam Kota - Batam - Kepulauan Riau</div>
      <div class="co-contact">
        Telp : +62 811 7045 657<br>
        Email : admin@biasbst.com<br>
        www.biasbst.com
      </div>
    </div>
    <div class="right-box">
      <table class="right-table">
        <tr><td class="lbl">Inv No. :</td><td>${item.invoice_no || '-'}</td></tr>
        <tr><td class="lbl">Date :</td><td>${dateStr}</td></tr>
        ${item.po_no || item.rental?.po_no ? `<tr><td class="lbl">PO No. :</td><td>${item.po_no || item.rental?.po_no}</td></tr>` : ''}
        <tr><td colspan="2" style="text-align:center; font-weight:bold;">To:</td></tr>
        <tr><td colspan="2" class="cust-name">${custName}</td></tr>
        <tr><td colspan="2" style="font-weight:normal; min-height:36px; vertical-align:top;">${custAddress}</td></tr>
        <tr><td class="lbl">Attn</td><td>${picDisplay}</td></tr>
      </table>
    </div>
  </div>

  <div class="inv-title-wrap"><div class="inv-title">INVOICE</div></div>
  <div class="period">Period: ${periodStr}</div>

  <!-- Main Table -->
  <table class="main-table">
    <thead>
      <tr>
        <th class="no-col">No</th>
        <th>Description</th>
        <th></th>
        <th></th>
        <th class="center">Rp</th>
        <th style="text-align:right; width:90px;">Amount</th>
      </tr>
    </thead>
    <tbody>
      <!-- Row 1: Rental charge -->
      <tr>
        <td class="no-col">1</td>
        <td colspan="3" style="font-weight:bold;">Rental Charges ${unitDesc} 1 Unit</td>
        <td class="rp-col">Rp</td>
        <td class="val-col">${baseRentalFee.toLocaleString('id-ID')}</td>
      </tr>

      ${meterDetails.length > 0
      ? meterDetailRows(bwDetails, 'B/W') + meterDetailRows(colDetails, 'Colour')
      : legacyBodyRows
    }

      ${meterDetails.length > 0 ? chargeRows([...bwDetails, ...colDetails], 2) : ''}

      <!-- Total rows -->
      <tr class="total-row">
        <td colspan="4" class="total-lbl">TOTAL</td>
        <td class="rp-col">Rp</td>
        <td class="val-col">${total}</td>
      </tr>
      <tr class="total-row">
        <td colspan="4" class="total-lbl">TAX</td>
        <td class="rp-col">Rp</td>
        <td class="val-col">${tax === '0' ? '-' : tax}</td>
      </tr>
      <tr class="total-row grand">
        <td colspan="4" class="total-lbl">TOTAL PAY</td>
        <td class="rp-col">Rp</td>
        <td class="val-col">${totalPay}</td>
      </tr>
    </tbody>
  </table>

  ${stampHtml}
  <!-- Footer -->
  <div class="bottom-wrap">
    <div class="bank-box">
      <div class="bank-header">Payment by transfer to account:</div>
      <div class="bank-header">PT. BIAS SURYA TEKNOLOGI</div>
      NPWP : 0941.8395.0822.5000<br>
      <span class="bank-name">BANK RIAU KEPRI SYARIAH CAB. BATAM</span><br>
      Rek No. 1060885757<br>
      <span class="bank-name">BANK MANDIRI CABANG BATAM</span><br>
      Rek No. 109-00-3388575-7
    </div>
    <div class="sig-area">
      <div class="sig-col">
        <span class="sig-label">Received By,</span>
        <div class="sig-line"></div>
        <div class="sig-name">&nbsp;</div>
      </div>
      <div class="sig-col">
        <span class="sig-label">PT. BiAS SURYA TEKNOLOGI</span>
        <div class="sig-line"></div>
        <div class="sig-name">Grace Hutapea</div>
        <div class="sig-role">Admin Finance</div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`

  return html
}

function printInvoice(item: any) {
  if (item.status !== 'approved') {
    toast.warning('Invoice is not approved yet, cannot print receipt')
    return
  }
  const html = invoiceHtml(item).replace('</body>', '<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body>')
  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
}
</script>

<template>
  <div>
    <PageHeader title="Monitoring Invoice" button-label="Add Invoice" permission="rental_invoice:create"
      @add="openAdd" />

    <!-- Filter & Export Toolbar -->
    <div class="filter-toolbar">
      <div class="filter-inputs">
        <div class="filter-item">
          <label class="filter-label">Start Date</label>
          <input v-model="startDateFilter" type="date" class="form-input filter-input">
        </div>
        <div class="filter-item">
          <label class="filter-label">End Date</label>
          <input v-model="endDateFilter" type="date" class="form-input filter-input">
        </div>
        <div class="filter-item">
          <label class="filter-label">Month Filter</label>
          <input v-model="monthFilter" type="month" class="form-input filter-input" @change="onMonthFilterChange">
        </div>
        <div class="filter-item">
          <label class="filter-label">Year</label>
          <input v-model.number="yearFilter" type="number" min="1900" max="9999" class="form-input filter-input">
        </div>
        <div class="filter-item">
          <label class="filter-label">Customer</label>
          <select v-model="customerFilter" class="form-select filter-input">
            <option value="">All Customers</option>
            <option v-for="customer in customers" :key="customer.id" :value="String(customer.id)">{{
              customer.company_name || customer.name || '-' }}</option>
          </select>
        </div>
        <button v-if="startDateFilter || endDateFilter || monthFilter || customerFilter" type="button"
          class="btn btn-outline btn-sm filter-reset-btn" @click="resetFilters">
          Reset Filter
        </button>
      </div>

      <div class="export-actions">
        <button v-if="can('rental_invoice:read')" type="button" class="btn btn-export-pdf" @click="exportMonthToPdf"
          title="Export Invoices (PDF)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
          Export PDF
        </button>
        <button v-if="can('rental_invoice:read')" type="button" class="btn btn-export-excel" @click="exportMonthToExcel"
          :disabled="isExporting" title="Export Invoices (Excel)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="8" y1="13" x2="16" y2="13"></line>
            <line x1="8" y1="17" x2="16" y2="17"></line>
          </svg>
          Export Excel
        </button>
        <button v-if="can('rental_invoice:read')" type="button" class="btn btn-export-pdf" @click="exportAnnualPdf"
          title="Export Annual (PDF)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
          Annual PDF
        </button>
        <button v-if="can('rental_invoice:read')" type="button" class="btn btn-export-excel" @click="exportAnnualExcel"
          :disabled="isExporting" title="Export Annual (Excel)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="8" y1="13" x2="16" y2="13"></line>
            <line x1="8" y1="17" x2="16" y2="17"></line>
          </svg>
          Annual Excel
        </button>
      </div>
    </div>

    <DataTable :columns="columns" :data="filteredData" search-placeholder="Search invoices..." @edit="openEdit"
      @delete="openDelete">
      <template #cell-customer_id="{ value }">{{ customerName(value as any) }}</template>
      <template #cell-contract_item_id="{ value }">{{ contractNo(value as any) }}</template>
      <template #cell-period_start="{ value }">{{ formatDate(value) }}</template>
      <template #cell-period_end="{ value }">{{ formatDate(value) }}</template>
      <template #cell-due_date="{ value }">{{ formatDate(value) }}</template>
      <template #cell-total_pay="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-status="{ value }">
        <span
          :class="approvalStatus(value) === 'approved' ? 'badge badge-info' : approvalStatus(value) === 'rejected' ? 'badge badge-danger' : 'badge badge-warning'">
          {{ approvalStatus(value) === 'approved' ? 'Approved' : approvalStatus(value) === 'rejected' ? 'Rejected' :
            'Pending' }}
        </span>
      </template>
      <template #cell-payment_status="{ value }">
        <span
          :class="value === 'paid' ? 'badge badge-success' : value === 'overdue' ? 'badge badge-danger' : value === 'partially_paid' ? 'badge badge-info' : 'badge badge-warning'">
          {{ value === 'paid' ? 'Paid' : value === 'overdue' ? 'Overdue' : value === 'partially_paid' ?
            'Partial' : 'Unpaid' }}
        </span>
      </template>
      <template #actions="{ row }">
        <div style="display: flex; align-items: center; gap: 6px;">
          <button
            v-if="(row.status === 'unpaid' || row.status === 'draft' || row.status === 'pending') && can('rental_invoice:update')"
            class="action-btn action-btn--edit" title="Approve" @click="handleUpdateStatus(row, 'approved')"
            style="color: var(--color-success); width: 36px; height: 36px;">
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </button>
          <button
            v-if="(row.status === 'unpaid' || row.status === 'draft' || row.status === 'pending') && can('rental_invoice:update')"
            class="action-btn action-btn--delete" title="Reject" @click="handleUpdateStatus(row, 'rejected')"
            style="width: 36px; height: 36px;">
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <button
            v-if="(row.status === 'unpaid' || row.status === 'draft' || row.status === 'partially_paid') && (can('payment:create') || can('rental_invoice:update'))"
            class="action-btn action-btn--edit" title="Payment" @click="openPaymentModal(row)"
            style="color: #059669; width: 36px; height: 36px;">
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"></rect>
              <line x1="2" y1="10" x2="22" y2="10"></line>
            </svg>
          </button>
          <button v-if="can('rental_invoice:read')" class="action-btn action-btn--edit" title="Detail"
            @click="openDetail(row)" style="color: var(--color-text-muted); width: 36px; height: 36px;">
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <button v-if="row.status === 'approved' && can('rental_invoice:read')" class="action-btn action-btn--edit"
            title="Print Receipt" @click="printInvoice(row)"
            style="color: var(--color-primary); width: 36px; height: 36px;">
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"></polyline>
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"></path>
              <rect x="6" y="14" width="12" height="8"></rect>
            </svg>
          </button>
          <button v-if="can('rental_invoice:update')" class="action-btn action-btn--edit" title="Edit"
            @click="openEdit(row)" style="width: 36px; height: 36px;">
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button v-if="can('rental_invoice:delete')" class="action-btn action-btn--delete" title="Delete"
            @click="openDelete(row)" style="width: 36px; height: 36px;">
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Invoice' : 'Add Invoice'" @close="showModal = false"
      @submit="handleSubmit">
      <div class="form-group">
        <label for="ri-no" class="form-label">No. Invoice</label>
        <input id="ri-no" v-model="form.invoice_no" type="text" class="form-input" placeholder="INV-R-XXXXXX">
      </div>
      <div class="form-group">
        <label for="ri-contract" class="form-label">Contract</label>
        <select id="ri-contract" v-model="form.contract_item_id" class="form-select" @change="onContractChange">
          <option :value="null">-- Select Contract --</option>
          <option v-for="ci in contractItems" :key="ci.id" :value="ci.id">{{ ci.contract_no }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="ri-customer" class="form-label">Customer</label>
        <select id="ri-customer" v-model="form.customer_id" class="form-select">
          <option :value="null">-- Select Customer --</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.company_name || c.name || '-' }}</option>
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="ri-period-start" class="form-label">Period Start</label>
          <input id="ri-period-start" v-model="form.period_start" type="date" class="form-input">
        </div>
        <div class="form-group">
          <label for="ri-period-end" class="form-label">Period End</label>
          <input id="ri-period-end" v-model="form.period_end" type="date" class="form-input">
        </div>
      </div>
      <div class="form-group">
        <label for="ri-due" class="form-label">Due Date</label>
        <input id="ri-due" v-model="form.due_date" type="date" class="form-input">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="ri-basis" class="form-label">Base Rental Fee (Rp)</label>
          <input id="ri-basis" v-model.number="form.basis_rental_fee" type="number" class="form-input" min="0"
            @input="recalculate">
        </div>
      </div>

      <!-- Meter Readings for Copier -->
      <div
        v-if="findContractItem(form.contract_item_id) && (!findContractItem(form.contract_item_id)?.specs || findContractItem(form.contract_item_id)?.specs.length < 5)"
        style="border: 1px solid #cbd5e1; padding: 10px; border-radius: 6px; margin-bottom: 15px;">
        <div style="font-weight: bold; margin-bottom: 10px; font-size: 14px;">Meter Reading (Photocopy)</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Start Meter Reading</label>
            <input v-model.number="form.meter_start" type="number" class="form-input" min="0" @input="recalculate">
          </div>
          <div class="form-group">
            <label class="form-label">Last Meter Reading</label>
            <input v-model.number="form.meter_end" type="number" class="form-input" min="0" @input="recalculate">
          </div>
        </div>
        <div class="form-row mt-2">
          <div class="form-group">
            <label class="form-label">Free Copies</label>
            <input v-model.number="form.free_copies" type="number" class="form-input" min="0" @input="recalculate">
          </div>
          <div class="form-group">
            <label class="form-label">Unit Price (Overusage)</label>
            <input v-model.number="form.rate_per_page" type="number" class="form-input" min="0" @input="recalculate">
          </div>
        </div>
        <div style="margin-top: 10px; font-size: 12px; color: #64748b;">
          Total Usage: <b>{{ Math.max(0, form.meter_end - form.meter_start) }}</b> sheets.
          Excess: <b>{{ Math.max(0, (form.meter_end - form.meter_start) - form.free_copies) }}</b> sheets.
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="ri-excess" class="form-label">Excess Amount (Rp)</label>
          <input id="ri-excess" v-model.number="form.excess_amount" type="number" class="form-input" min="0"
            @input="recalculate">
        </div>
        <div class="form-group">
          <label for="ri-tax" class="form-label">Tax (Rp)</label>
          <input id="ri-tax" v-model.number="form.tax" type="number" class="form-input" min="0" @input="recalculate">
        </div>
      </div>
      <div class="sale-summary">
        <div class="summary-row"><span>Subtotal</span><span>{{ formatRupiah(form.subtotal) }}</span></div>
        <div class="summary-row summary-total"><span>Total Pay</span><span>{{ formatRupiah(form.total_pay) }}</span>
        </div>
      </div>
      <div class="form-group">
        <label for="ri-status" class="form-label">Status</label>
        <select id="ri-status" v-model="form.status" class="form-select">
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Invoice"
      :message="`Are you sure you want to delete invoice '${deletingItem?.invoice_no}'?`" @close="showConfirm = false"
      @confirm="handleDelete" />

    <FormModal :open="showDetail" :title="detailItem ? `Invoice Details ${detailItem.invoice_no}` : 'Invoice Details'"
      @close="showDetail = false">
      <template v-if="detailItem">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
          <div class="form-group">
            <label class="form-label">No. Invoice</label>
            <div>{{ detailItem.invoice_no }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Customer</label>
            <div>{{ customerName(detailItem.customer_id) }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Contract</label>
            <div>{{ contractNo(detailItem.contract_item_id) }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Total Amount</label>
            <div>{{ formatRupiah(detailItem.total_pay || detailItem.subtotal || 0) }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Approval Status</label>
            <span
              :class="approvalStatus(detailItem.status) === 'approved' ? 'badge badge-info' : approvalStatus(detailItem.status) === 'rejected' ? 'badge badge-danger' : 'badge badge-warning'">
              {{ approvalStatus(detailItem.status) === 'approved' ? 'Approved' : approvalStatus(detailItem.status) ===
                'rejected' ? 'Rejected' : 'Pending' }}
            </span>
          </div>
          <div class="form-group">
            <label class="form-label">Payment Status</label>
            <span
              :class="detailItem.payment_status === 'paid' ? 'badge badge-success' : detailItem.payment_status === 'overdue' ? 'badge badge-danger' : detailItem.payment_status === 'partially_paid' ? 'badge badge-info' : 'badge badge-warning'">
              {{ detailItem.payment_status === 'paid' ? 'Paid' : detailItem.payment_status === 'overdue' ? 'Overdue' :
                detailItem.payment_status === 'partially_paid' ? 'Partial' : 'Unpaid' }}
            </span>
          </div>
        </div>

        <div class="form-section-title" style="margin-bottom: 8px;">Payment History</div>
        <div v-if="invoicePayments(detailItem).length > 0"
          style="border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: var(--font-size-sm);">
            <thead style="background: var(--color-surface-raised); border-bottom: 1px solid var(--color-border);">
              <tr>
                <th style="padding: 12px;">Payment No.</th>
                <th style="padding: 12px;">Date</th>
                <th style="padding: 12px;">Method / Bank</th>
                <th style="padding: 12px;">Ref No.</th>
                <th style="padding: 12px; text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(pay, idx) in invoicePayments(detailItem)" :key="idx"
                style="border-bottom: 1px solid var(--color-border-light);">
                <td style="padding: 12px;">{{ pay.payment_no || '-' }}</td>
                <td style="padding: 12px;">{{ pay.payment_date ? String(pay.payment_date).substring(0, 10) : '-' }}</td>
                <td style="padding: 12px;">{{ pay.bank_name || '-' }}</td>
                <td style="padding: 12px;">{{ pay.reference_no || '-' }}</td>
                <td style="padding: 12px; text-align: right; font-weight: 600; color: var(--color-success);">{{
                  formatRupiah(pay.amount || 0) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else
          style="padding: 16px; text-align: center; color: var(--color-text-muted); background: var(--color-surface); border-radius: var(--radius-md);">
          No payment history yet.
        </div>
      </template>
      <template #footer>
        <button class="btn btn-outline" @click="showDetail = false">Close</button>
      </template>
    </FormModal>

    <FormModal :open="showPaymentModal" title="Process Payment" @close="showPaymentModal = false"
      @submit="submitPayment">
      <div class="form-group">
        <label class="form-label">Payment Date</label>
        <input v-model="paymentForm.payment_date" type="date" class="form-input" required>
      </div>
      <div class="form-group">
        <label class="form-label">Payment Method</label>
        <select v-model="paymentForm.payment_method" class="form-select" required>
          <option value="cash">Cash</option>
          <option value="transfer">Bank Transfer</option>
          <option value="credit_card">Credit / Debit Card</option>
        </select>
      </div>

      <template v-if="paymentForm.payment_method === 'transfer'">
        <div class="form-group">
          <label class="form-label">Bank Name</label>
          <input type="text" class="form-input" v-model="paymentForm.bank_name" placeholder="E.g. BCA, Mandiri, BRI"
            required />
        </div>
        <div class="form-group">
          <label class="form-label">Account Number</label>
          <input type="text" class="form-input" v-model="paymentForm.account_number" placeholder="Sender account number"
            required />
        </div>
        <div class="form-group">
          <label class="form-label">Sender Name</label>
          <input type="text" class="form-input" v-model="paymentForm.sender_name" placeholder="Account holder name"
            required />
        </div>
      </template>

      <template v-if="paymentForm.payment_method === 'credit_card'">
        <div class="form-group">
          <label class="form-label">Card Provider / Bank</label>
          <input type="text" class="form-input" v-model="paymentForm.bank_name" placeholder="E.g. Visa, Mastercard, BCA"
            required />
        </div>
        <div class="form-group">
          <label class="form-label">Card Number (Last 4 Digits)</label>
          <input type="text" class="form-input" v-model="paymentForm.account_number" placeholder="E.g. 1234"
            maxlength="16" required />
        </div>
        <div class="form-group">
          <label class="form-label">Cardholder Name</label>
          <input type="text" class="form-input" v-model="paymentForm.sender_name" placeholder="Name as shown on card"
            required />
        </div>
      </template>

      <div class="form-group">
        <label class="form-label">Payment Amount (Rp)</label>
        <input v-model.number="paymentForm.amount" type="number" class="form-input" min="0" required>
      </div>
      <div class="form-group">
        <label class="form-label">Reference No. / Receipt (Optional)</label>
        <input v-model="paymentForm.reference" type="text" class="form-input" placeholder="Enter reference number...">
      </div>
      <div class="form-group">
        <label class="form-label">Notes (Optional)</label>
        <textarea v-model="paymentForm.notes" class="form-input" rows="2" placeholder="Add payment notes..."></textarea>
      </div>
    </FormModal>
  </div>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-base);
}

.sale-summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-md);
  border-radius: var(--radius-base);
  background: var(--color-surface-raised);
}

.summary-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.summary-total {
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-xs);
}

.filter-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  background: var(--color-surface, #ffffff);
  padding: 16px;
  border-radius: var(--radius-lg, 12px);
  border: 1px solid var(--color-border-light, #e2e8f0);
  margin-bottom: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.filter-inputs {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-text-muted, #64748b);
  letter-spacing: 0.5px;
}

.filter-input {
  padding: 7px 12px;
  font-size: 13px;
  border-radius: 6px;
  border: 1px solid var(--color-border, #cbd5e1);
  background: var(--color-background, #ffffff);
}

.filter-reset-btn {
  height: 35px;
  align-self: flex-end;
}

.export-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-export-pdf {
  display: flex;
  align-items: center;
  background: #dc2626;
  color: white;
  border: none;
  padding: 8px 14px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-export-pdf:hover {
  background: #b91c1c;
  transform: translateY(-1px);
}

.btn-export-excel {
  display: flex;
  align-items: center;
  background: #16a34a;
  color: white;
  border: none;
  padding: 8px 14px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-export-excel:hover {
  background: #15803d;
  transform: translateY(-1px);
}

.btn-export-excel:disabled,
.btn-export-pdf:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.form-section-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
}
</style>
