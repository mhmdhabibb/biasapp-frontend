<script setup lang="ts">
// @ts-nocheck
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import { useResourcesStore } from '@/stores/resources.store'
import type { SalesInvoice, TableColumn } from '@/types'
import { buildRecapSheet, downloadStyledExcel, filterApprovedPaid, filterByYear, normalizeExportYear, NUMFMT_RP, SALES_INVOICE_YEAR_FIELDS, uniqueSheetName, type RecapRow, type StyledCell } from '@/utils/exportHelpers'
import { BIAS_LOGO_DATA_URL } from '@/utils/logoData'
import { buildPaymentVerifyUrl, generatePaymentQrDataUrl, paymentMethodOf, printPaymentStruk } from '@/utils/paymentReceipt'
import { computed, reactive, ref } from 'vue'

const toast = useToast()
const { can } = usePermission()
const { currentUser } = useAuth()

/** Penanda tangan dokumen: pembuat invoice (user backend), fallback user login. */
function signerName(item: any): string {
  return item?.user?.name || item?.user?.username
    || (currentUser as any)?.value?.name || (currentUser as any)?.name || '-'
}
const {
  salesInvoices: data,
  sales,
  customers,
  products,
  payments,
  findCustomer,
  findProduct,
  findSale,
} = useMasterStore()

const resources = useResourcesStore()

const columns: TableColumn[] = [
  { key: 'invoice_no', label: 'No. Invoice' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'sale_id', label: 'Sale Ref.' },
  { key: 'due_date', label: 'Due Date' },
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'total', label: 'Total' },
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

function invoicePayments(item: any) {
  return payments.value.filter((p: any) => String(p.sales_invoice_id) === String(item.id))
}

const showDetail = ref(false)
const detailItem = ref<any>(null)

function openDetail(item: any) {
  detailItem.value = item
  showDetail.value = true
}

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<SalesInvoice | null>(null)
const deletingItem = ref<SalesInvoice | null>(null)
const form = reactive({
  invoice_no: '',
  customer_id: null as any,
  sale_id: null as any,
  due_date: '',
  subtotal: 0,
  service_charge: 0,
  tax: 0,
  discount: 0,
  total: 0,
  status: 'unpaid',
})

const defaultForm = { ...form }

const siSaleOptions = computed(() =>
  (sales.value as any[]).map((s: any) => ({
    value: s.id,
    label: `${s.sale_no} — ${formatRupiah(s.total)}`,
  })),
)
const siCustomerOptions = computed(() =>
  (customers.value as any[]).map((c: any) => ({
    value: c.id,
    label: c.company_name || c.name || '-',
  })),
)
const siStatusOptions = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
]

// Date Range & Month Filters
const startDateFilter = ref('')
const endDateFilter = ref('')
const monthFilter = ref('')
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
}

const filteredData = computed(() => {
  let items = data.value
  if (startDateFilter.value) {
    items = items.filter(d => {
      const itemDate = d.created_at || d.due_date || d.invoice_date || d.date
      if (!itemDate) return false
      return String(itemDate).slice(0, 10) >= startDateFilter.value
    })
  }
  if (endDateFilter.value) {
    items = items.filter(d => {
      const itemDate = d.created_at || d.due_date || d.invoice_date || d.date
      if (!itemDate) return false
      return String(itemDate).slice(0, 10) <= endDateFilter.value
    })
  }
  return items
})

function exportMonthToPdf() {
  toast.info('PDF export will be available soon (sample function)')
}

async function exportMonthToExcel() {
  if (isExporting.value) return
  const items = filteredData.value
  if (items.length === 0) {
    toast.warning('No sales invoice data to export!')
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
    await exportInvoicesToExcel(items, `SalesInvoice_${periodLabel}`)
    toast.success('Excel report downloaded successfully')
  } finally {
    isExporting.value = false
  }
}

async function exportAnnualExcel() {
  if (isExporting.value) return
  const year = normalizeExportYear(yearFilter.value)
  if (year === null) {
    toast.warning('Invalid year (1900–2100)!')
    return
  }
  // Annual export only for invoices that are approved AND paid.
  const items = filterApprovedPaid(filterByYear(data.value, year, SALES_INVOICE_YEAR_FIELDS))
  if (items.length === 0) {
    toast.warning(`No approved & paid sales invoice data for year ${year}!`)
    return
  }
  isExporting.value = true
  try {
    const sorted = [...items].sort((a: any, b: any) =>
      String(a.invoice_date || a.created_at || a.due_date || '').localeCompare(
        String(b.invoice_date || b.created_at || b.due_date || '')))
    const recapRows: RecapRow[] = sorted.map((item: any, i: number) => {
      const c = findCustomer(item.customer_id)
      const dateVal = item.invoice_date || item.created_at || item.due_date
      const period = dateVal ? new Date(dateVal).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'
      return {
        no: i + 1,
        customer: c?.company_name || c?.name || '-',
        invoiceNo: item.invoice_no || '-',
        period,
        total: item.total_amount ?? item.total ?? item.subtotal ?? 0,
      }
    })
    const recap = buildRecapSheet(`Sales Invoice Recap ${year}`, `${items.length} invoice(s) (approved & paid)`, recapRows)
    await exportInvoicesToExcel(items, `SalesInvoice_Annual_${year}`, [recap])
    toast.success('Annual Excel report downloaded successfully')
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
  // Layout 5 kolom ala invoice manual (tanpa kolom Rp terpisah, Rp via number
  // format): A=No(4.2), B=Description(39.2), C=Qty(7.8), D=UOM(13), E=Amount(31.2)
  const columnWidths = [4.2, 39.2, 7.8, 13, 31.2]

  for (const [customerId, groupItems] of groups) {
    const sortedItems = [...groupItems].sort((a, b) => {
      const da = a.invoice_date || a.created_at || a.due_date || ''
      const db = b.invoice_date || b.created_at || b.due_date || ''
      return String(da).localeCompare(String(db))
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
      const dateLabel = item.invoice_date || item.created_at
        ? new Date(item.invoice_date || item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
        : '-'
      const poNo = item.sale?.po_no || item.po_no || '-'

      // Header blok (5 kolom, konsisten dengan export rental)
      addRow([
        { v: 'PT. BiAS SURYA TEKNOLOGI', mergeAcross: 1, style: 'borderBold' }, {},
        {},
        { v: 'Inv No. :', style: 'borderBoldRight' },
        { v: item.invoice_no || '-', style: 'border' },
      ])
      addRow([
        { v: 'Ruko Puri Mas I Blok A No.40 teluk tering', mergeAcross: 1, style: 'borderCenter' }, {},
        {},
        { v: 'Date :', style: 'borderBoldRight' },
        { v: dateLabel, style: 'border' },
      ])
      addRow([
        { v: 'Batam Kota - Batam - Kepulauan Riau', mergeAcross: 1, style: 'borderCenter' }, {},
        {},
        { v: 'PO No. :', style: 'borderBoldRight' },
        { v: poNo, style: 'border' },
      ])
      addRow([
        { v: 'Telp : +62 811 7045 657', mergeAcross: 1, style: 'borderCenter' }, {},
        {},
        { v: 'Kepada Yth. ', style: 'borderBoldRight' },
        { style: 'border' },
      ])
      addRow([
        { v: 'Email : admin@biasbst.com', mergeAcross: 1, style: 'borderCenter' }, {},
        {},
        { v: custName, style: 'borderBold' },
        { style: 'border' },
      ])
      addRow([
        { v: 'www.biasbst.com', mergeAcross: 1, style: 'borderCenter' }, {},
        {},
        { v: customer?.address || '-', mergeAcross: 1, style: 'border' }, {},
      ])
      addRow([
        { style: 'border' }, { style: 'border' },
        {},
        { v: 'Up :', style: 'borderBoldRight' },
        { v: customer?.pic_name || '-', style: 'borderBold' },
      ])
      // Spacer bergaris ala invoice manual
      addRow([
        { style: 'border' }, { style: 'border' },
        {},
        { style: 'border' }, { style: 'border' },
      ])

      addRow([{ v: 'INVOICE', mergeAcross: 4, style: 'titleCell' }])
      addRow([])

      // Header tabel items
      addRow([
        { v: 'No', style: 'borderBoldCenter' },
        { v: 'Description', style: 'borderBold' },
        { v: 'Qty', style: 'borderBoldCenter' },
        { v: 'UOM', style: 'borderBoldCenter' },
        { v: 'Amount', style: 'borderBold' },
      ])

      const sale = findSale(item.sale_id)
      const saleItems: any[] = (sale && sale.sale_items) ? sale.sale_items : []
      if (saleItems.length > 0) {
        saleItems.forEach((si: any, idx: number) => {
          const p: any = findProduct(si.product_id)
          const pName = p ? p.name : 'Product ID: ' + si.product_id
          const qty = si.qty || 1
          const unitPrice = si.unit_price || si.price || 0
          const amount = unitPrice * qty
          addRow([
            { v: idx + 1, style: 'borderCenter' },
            { v: pName, style: 'border' },
            { v: qty, style: 'borderCenter' },
            { v: 'unit', style: 'borderCenter' },
            { v: amount, style: 'borderBoldRight', numFmt: NUMFMT_RP },
          ])
        })
      } else {
        addRow([
          { v: 1, style: 'borderCenter' },
          { v: 'No item data available', style: 'border' },
          { style: 'border' },
          { style: 'border' },
          { v: 0, style: 'borderBoldRight', numFmt: NUMFMT_RP },
        ])
      }

      const subTotal = item.subtotal || item.total_amount || item.total || 0
      const grandTotal = item.total_amount || item.total || 0
      addRow([{}, {}, {}, { v: 'Sub Total', style: 'borderBoldRight' }, { v: subTotal, style: 'borderBoldRight', numFmt: NUMFMT_RP }])
      addRow([{}, {}, {}, { v: 'Discount', style: 'borderBoldRight' }, { v: item.discount || 0, style: 'borderBoldRight', numFmt: NUMFMT_RP }])
      addRow([{}, {}, {}, { v: 'Amount', style: 'borderBoldRight' }, { v: grandTotal, style: 'borderBoldRight', numFmt: NUMFMT_RP }])

      addRow([])
      addRow([{ v: 'Payment by transfer to account:', mergeAcross: 1, style: 'border' }, {}, {}, { v: 'Received By,' }, { v: 'PT. BiAS SURYA TEKNOLOGI' }])
      addRow([{ v: 'BANK BRKSYARIAH Cabang Batam - Account No. 106-08-85757', mergeAcross: 1, style: 'border' }, {}, {}, { style: 'border' }, { style: 'border' }])
      addRow([{ v: 'Account Name : PT. BIAS SURYA TEKNOLOGI', mergeAcross: 1, style: 'border' }, {}, {}, { style: 'border' }, { v: signerName(item), style: 'plainBold' }])
      addRow([])
    }

    for (const item of sortedItems) addInvoice(item)
    sheets.push({ name: sheetName, columnWidths, rows })
  }

  await downloadStyledExcel([...leadingSheets, ...sheets], filename)
}

async function exportAnnualPdf() {
  const year = normalizeExportYear(yearFilter.value)
  if (year === null) {
    toast.warning('Invalid year (1900–2100)!')
    return
  }
  // Annual export only for invoices that are approved AND paid.
  const items = filterApprovedPaid(filterByYear(data.value, year, SALES_INVOICE_YEAR_FIELDS))
  if (items.length === 0) {
    toast.warning(`No approved & paid sales invoice data for year ${year}!`)
    return
  }

  const style = `@media print { @page { margin: 10mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 0; color: #000; font-size: 12px; margin: 0; }
  .container { max-width: 900px; margin: 0 auto; padding: 20px; page-break-after: always; }
  .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  .header-table td { vertical-align: top; padding: 0; }
  .logo-col { width: 50%; padding-right: 20px; }
  .info-col { width: 50%; }
  .company-details h1 { margin: 0; font-size: 22px; font-weight: bold; }
  .company-details h2 { margin: 0; font-size: 14px; font-style: italic; font-weight: normal; margin-bottom: 10px; color: #333; }
  .company-details p { margin: 0; font-size: 11px; line-height: 1.4; }
  .invoice-text { font-size: 28px; font-weight: bold; text-align: center; margin-top: 20px; margin-bottom: 10px; letter-spacing: 1px; }
  .meta-table { width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #7ea8ce; }
  .meta-table td, .meta-table th { border: 1px solid #7ea8ce; padding: 4px 8px; }
  .meta-table .bg-blue { background-color: #003366; color: white; font-weight: bold; }
  .meta-table .label { width: 90px; font-weight: bold; }
  .items-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  .items-table th { background-color: #003366; color: white; border: 1px solid #7ea8ce; padding: 8px; text-align: center; font-size: 12px; }
  .items-table td { border: 1px solid #7ea8ce; padding: 8px; vertical-align: top; }
  .items-table .rp-col { border-right: none; width: 20px; padding-right: 2px; }
  .items-table .val-col { border-left: none; text-align: right; }
  .summary-table { width: 350px; float: right; border-collapse: collapse; margin-top: 0; margin-bottom: 20px; }
  .summary-table td { border: 1px solid #7ea8ce; padding: 6px; background-color: #dbeaf4; font-weight: bold; }
  .summary-table .label { text-align: right; padding-right: 10px; }
  .payment-info { clear: left; float: left; margin-top: 10px; font-size: 12px; font-weight: bold; line-height: 1.6; }
  .signatures { display: flex; justify-content: space-between; clear: both; padding-top: 50px; text-align: center; font-weight: bold; }
  .sig-box { width: 250px; }
  .sig-line { margin-top: 80px; border-bottom: 1px solid #000; padding-bottom: 5px; }
  .paid-stamp { display: inline-block; border: 3px double #166534; border-radius: 12px; color: #166534; font-weight: 900; font-size: 26px; letter-spacing: 4px; padding: 6px 22px; transform: rotate(-8deg); margin: 10px 0; }
  .paid-stamp.partial { border-color: #b45309; color: #b45309; font-size: 16px; letter-spacing: 2px; }
  .paid-stamp.unpaid { border-color: #57534e; color: #57534e; font-size: 16px; letter-spacing: 2px; }
  .stamp-wrap { text-align: center; clear: both; padding-top: 10px; }`

  const body = items.map((inv: any) => {
    const html = invoiceHtml(inv)
    const bodyMatch = html.match(/<body>([\s\S]*?)<\/body>/)
    if (!bodyMatch) return ''
    return `<div style="page-break-after: always;">${bodyMatch[1]}</div>`
  }).join('')

  const fullHtml = `<!DOCTYPE html>
<html>
  <head><title>Annual Sales Invoice Report ${year}</title><style>${style}</style></head>
<body>${body}
<script>window.onload=function(){setTimeout(()=>{window.print()},500)}<\/script>
</body></html>`

  const w = window.open('', '_blank')
  if (w) { w.document.write(fullHtml); w.document.close() }
}

const calcTotal = computed(() => Math.max(0, form.subtotal + form.service_charge + form.tax - (Number(form.discount) || 0)))

function onSaleChange() {
  const s = findSale(form.sale_id)
  if (s) {
    form.customer_id = s.customer_id
    form.subtotal = s.subtotal
    form.service_charge = s.service_charge
    form.tax = s.tax
    form.discount = (s as any).discount || 0
    form.total = s.total
  }
}

function openAdd() {
  editingItem.value = null
  Object.assign(form, { ...defaultForm, invoice_no: `INV-S-${Date.now().toString().slice(-6)}` })
  showModal.value = true
}

function openEdit(item: SalesInvoice) {
  editingItem.value = item
  Object.assign(form, {
    invoice_no: item.invoice_no,
    customer_id: item.customer_id,
    sale_id: item.sale_id,
    due_date: item.due_date,
    subtotal: item.subtotal,
    service_charge: item.service_charge,
    tax: item.tax,
    discount: item.discount || 0,
    total: item.total,
    status: item.status,
  })
  showModal.value = true
}

async function handleSubmit() {
  if (!form.invoice_no.trim()) return
  form.total = calcTotal.value
  try {
    if (editingItem.value) {
      await resources.update("salesInvoices", editingItem.value.id as any, form)
      toast.success("Invoice Update Successfully!")
    } else {
      await resources.create("salesInvoices", form)
      toast.success("Success create new invoice")
    }
    useMasterStore().refreshInBackground()
    showModal.value = false
  } catch (error) {
    toast.error("Failed to save invoice")
  }
}

function openDelete(item: SalesInvoice) { deletingItem.value = item; showConfirm.value = true }
async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.remove("salesInvoices", deletingItem.value.id as any)
      useMasterStore().refreshInBackground()
      toast.success("Invoice deleted successfully!")
    } catch (error) {
      toast.error("Failed to delete invoice!")
    }
  }
  showConfirm.value = false
}

async function handleUpdateStatus(item: any, newStatus: string) {
  try {
    await api.patch(`/sales-invoices/${item.id}`, { status: newStatus })
    await useMasterStore().refreshInBackground()
    toast.success(`Invoice status updated to ${newStatus}`)
  } catch (error: any) {
    toast.error('Failed to update status: ' + (error.message || 'Error'))
  }
}

function customerName(id: any): string {
  const c = findCustomer(id as any)
  return c ? c.company_name || c.name || '-' : '-'
}

function saleRef(id: any): string {
  if (!id) return '-'
  const s = findSale(id as any)
  return s ? s.sale_no : '-'
}

function formatRupiah(val: number): string {
  return 'Rp ' + val.toLocaleString('id-ID')
}

function invoiceHtml(item: any): string {
  const customer = findCustomer(item.customer_id)
  const custName = customer?.company_name || customer?.name || '-'
  const custAddress = customer?.address || '-'
  const custPhone = customer?.phone || '-'
  const pic = customer?.pic_name || '-'
  const gender = customer?.pic_gender
  let prefix = 'Bapak/Ibu '
  if (gender === 'L') prefix = 'Bapak '
  if (gender === 'P') prefix = 'Ibu '
  const picDisplay = pic !== '-' ? prefix + pic : '-'
  const signer = signerName(item)

  const invoiceNo = item.invoice_no || '-'
  const invoiceDate = item.created_at || item.due_date

  const dateStr = invoiceDate ? new Date(invoiceDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'

  let itemsHtml = ''
  const sale = findSale(item.sale_id)
  if (sale && sale.sale_items && sale.sale_items.length > 0) {
    itemsHtml = sale.sale_items.map((si: any, idx: number) => {
      const p = findProduct(si.product_id)
      let pName = p ? p.name : ('Product ID: ' + si.product_id)
      if (si.description) {
        pName += `<br><span style="font-size: 10px; color: #555;">${si.description}</span>`
      }
      return `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td>${pName}</td>
          <td style="text-align: center;">${si.qty || 1}</td>
          <td style="text-align: center;">unit</td>
          <td class="rp-col">Rp</td><td class="val-col">${(si.unit_price || si.price || 0).toLocaleString('id-ID')}</td>
          <td class="rp-col">Rp</td><td class="val-col">${((si.unit_price || si.price || 0) * (si.qty || 1)).toLocaleString('id-ID')}</td>
        </tr>
      `
    }).join('')
  } else {
    itemsHtml = `<tr><td colspan="8" style="text-align: center; color: #666;">Item data not available</td></tr>`
  }

  const subTotalStr = (item.subtotal || item.total_amount || item.total || 0).toLocaleString('id-ID')
  const discountStr = (item.discount || 0).toLocaleString('id-ID')
  const grandTotalStr = (item.total_amount || item.total || 0).toLocaleString('id-ID')

  // Stempel pelunasan: hanya bila invoice sudah di-approve accounting.
  const payStatus = String(item.payment_status || '').toLowerCase()
  const isApprovedInv = String(item.status || '').toLowerCase() === 'approved'
  const stampHtml = !isApprovedInv ? '' : payStatus === 'paid'
    ? `<div class="stamp-wrap"><span class="paid-stamp">LUNAS</span></div>`
    : (payStatus === 'partially_paid' || payStatus === 'partial')
    ? `<div class="stamp-wrap"><span class="paid-stamp partial">BELUM LUNAS (CICILAN)</span></div>`
    : `<div class="stamp-wrap"><span class="paid-stamp unpaid">BELUM BAYAR</span></div>`

  const html = `
    <html>
      <head>
        <title>Invoice - ${invoiceNo}</title>
        <style>
          @media print {
            @page { margin: 10mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 0; color: #000; font-size: 12px; margin: 0; }
          .container { max-width: 900px; margin: 0 auto; padding: 20px; }

          .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .header-table td { vertical-align: top; padding: 0; }

          .logo-col { width: 50%; padding-right: 20px; }
          .info-col { width: 50%; }

          .logo-container { display: flex; align-items: center; margin-bottom: 10px; }
          .logo { width: 80px; height: 80px; margin-right: 15px; flex-shrink: 0; }

          .company-details h1 { margin: 0; font-size: 22px; font-weight: bold; }
          .company-details h2 { margin: 0; font-size: 14px; font-style: italic; font-weight: normal; margin-bottom: 10px; color: #333; }
          .company-details p { margin: 0; font-size: 11px; line-height: 1.4; }

          .invoice-text { font-size: 28px; font-weight: bold; text-align: center; margin-top: 20px; margin-bottom: 10px; letter-spacing: 1px; }

          .meta-table { width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #7ea8ce; }
          .meta-table td, .meta-table th { border: 1px solid #7ea8ce; padding: 4px 8px; }
          .meta-table .bg-blue { background-color: #003366; color: white; font-weight: bold; }
          .meta-table .label { width: 90px; font-weight: bold; }

          .items-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          .items-table th { background-color: #003366; color: white; border: 1px solid #7ea8ce; padding: 8px; text-align: center; font-size: 12px; }
          .items-table td { border: 1px solid #7ea8ce; padding: 8px; vertical-align: top; }
          .items-table .rp-col { border-right: none; width: 20px; padding-right: 2px; }
          .items-table .val-col { border-left: none; text-align: right; }

          .summary-table { width: 350px; float: right; border-collapse: collapse; margin-top: 0; margin-bottom: 20px; }
          .summary-table td { border: 1px solid #7ea8ce; padding: 6px; background-color: #dbeaf4; font-weight: bold; }
          .summary-table .label { text-align: right; padding-right: 10px; }

          .payment-info { clear: left; float: left; margin-top: 10px; font-size: 12px; font-weight: bold; line-height: 1.6; }

          .signatures { display: flex; justify-content: space-between; clear: both; padding-top: 50px; text-align: center; font-weight: bold; }
          .sig-box { width: 250px; }
          .sig-line { margin-top: 80px; border-bottom: 1px solid #000; padding-bottom: 5px; }
          .paid-stamp { display: inline-block; border: 3px double #166534; border-radius: 12px; color: #166534; font-weight: 900; font-size: 26px; letter-spacing: 4px; padding: 6px 22px; transform: rotate(-8deg); margin: 10px 0; }
          .paid-stamp.partial { border-color: #b45309; color: #b45309; font-size: 16px; letter-spacing: 2px; }
          .paid-stamp.unpaid { border-color: #57534e; color: #57534e; font-size: 16px; letter-spacing: 2px; }
          .stamp-wrap { text-align: center; clear: both; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <table class="header-table">
            <tr>
              <td class="logo-col">
                <div class="logo-container">
                  <img src="${BIAS_LOGO_DATA_URL}" class="logo"  alt="BiAS Logo" />
                  <div class="company-details">
                    <h1>PT. BIAS SURYA</h1>
                    <h1>TEKNOLOGI</h1>
                    <h2>The shape of smart</h2>
                  </div>
                </div>
                <div class="company-details" style="padding-left: 95px;">
                  <p>Ruko Purimas Blok A No.47 Kota Batam,<br>
                  Kepulauan Riau - Indonesia<br>
                  Phone: +62811 704 5657<br>
                  Email: admin@biasbst.com<br>
                  Website: www.biassuryateknologi.com</p>
                </div>
                <div class="invoice-text">INVOICE</div>
              </td>
              <td class="info-col">
                <div style="font-size: 20px; font-weight: bold; text-align: right; margin-bottom: 10px; font-family: monospace;">INVOICE NO. : ${invoiceNo}</div>
                <table class="meta-table">
                  <tr>
                    <td class="label">Date :</td>
                    <td>${dateStr}</td>
                  </tr>
                  ${item.sale?.po_no || item.po_no ? `
                  <tr>
                    <td class="label">PO NO.:</td>
                    <td>${item.sale?.po_no || item.po_no}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td colspan="2" class="bg-blue">To:</td>
                  </tr>
                  <tr>
                    <td colspan="2" style="font-weight: bold; height: 35px; vertical-align: top;">${custName}</td>
                  </tr>
                  <tr>
                    <td colspan="2" class="bg-blue" style="height: 10px; padding: 4px 8px;">Address :</td>
                  </tr>
                  <tr>
                    <td colspan="2" style="height: 45px; vertical-align: top;">${custAddress}</td>
                  </tr>
                  <tr>
                    <td class="label">Phone :</td>
                    <td>${custPhone}</td>
                  </tr>
                  <tr>
                    <td class="label">Attn:</td>
                    <td>${picDisplay}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 40px;">No</th>
                <th>Description</th>
                <th style="width: 50px;">Qty</th>
                <th style="width: 60px;">UOM</th>
                <th colspan="2" style="width: 140px;">Unit Price</th>
                <th colspan="2" style="width: 140px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
              <tr style="height: 100px;">
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td class="rp-col"></td><td class="val-col"></td>
                <td class="rp-col"></td><td class="val-col"></td>
              </tr>
            </tbody>
          </table>

          <table class="summary-table">
            <tr>
              <td class="label">Sub Total</td>
              <td class="rp-col" style="border-right: none; width: 30px; padding-right: 0;">Rp</td>
              <td class="val-col" style="border-left: none; text-align: right; width: 110px;">${subTotalStr}</td>
            </tr>
            <tr>
              <td class="label">Discount</td>
              <td class="rp-col" style="border-right: none; padding-right: 0;">Rp</td>
              <td class="val-col" style="border-left: none; text-align: right;">${discountStr}</td>
            </tr>
            <tr>
              <td class="label">Amount</td>
              <td class="rp-col" style="border-right: none; padding-right: 0;">Rp</td>
              <td class="val-col" style="border-left: none; text-align: right;">${grandTotalStr}</td>
            </tr>
          </table>

          <div class="payment-info">
            Payment by transfer to account:<br>
            BANK BRKSYARIAH Cabang Batam<br>
            Account No. 106-08-85757<br>
            Account Name : PT. BIAS SURYA TEKNOLOGI<br>
            NPWP : 0941.8395.0822.5000
          </div>

          ${stampHtml}
          <div class="signatures">
            <div class="sig-box">
              Received By, (${picDisplay})
              <div class="sig-line"></div>
            </div>
            <div class="sig-box">
              Sincerely,
              <div class="sig-line">${signer}</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `
  return html
}

function printInvoice(item: any) {
  if (item.status !== 'approved') {
    toast.warning('Invoice is not approved yet, cannot print receipt')
    return
  }
  const html = invoiceHtml(item).replace('</body>', '<script>window.onload=function(){setTimeout(()=>{window.print()},500)}<\/script></body>')
  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
  }
}

function hasApprovedPayment(item: any) {
  return invoicePayments(item).some((payment: any) => payment.status === 'approved')
}

function printReceipt(item: any) {
  const approved = invoicePayments(item).find((payment: any) => payment.status === 'approved')
  if (!approved) {
    toast.warning('Bukti bayar tersedia setelah pembayaran disetujui Accounting.')
    return
  }
  printReceiptAsync(item, approved)
}

async function printReceiptAsync(item: any, approved: any) {
  const ps = String(item.payment_status || '').toLowerCase()
  const sender = approved.sender_name
    || String(approved.bank_name || '').match(/\bA\/N\s*:\s*([^)]*)\)?/i)?.[1]?.trim()
    || ''
  const payload = {
    payment_no: approved.payment_no,
    invoice_no: item.invoice_no,
    customer_name: customerName(item.customer_id),
    payment_date: approved.payment_date,
    amount: Number(approved.amount || 0),
    reference_no: approved.reference_no || '-',
    sender_name: sender,
    bank_name: approved.bank_name,
    notes: approved.notes,
    status: approved.status,
    lunas: ps === 'paid',
    partial: ps === 'partially_paid' || ps === 'partial',
    method: paymentMethodOf(approved.bank_name),
    cs_name: approved.user?.name || approved.user?.username || (currentUser as any)?.value?.name || (currentUser as any)?.name || '-',
  }
  const win = window.open('', '_blank')
  if (!win) {
    toast.warning('Izinkan pop-up browser untuk mencetak bukti bayar.')
    return
  }
  payload.qr_data_url = await generatePaymentQrDataUrl(buildPaymentVerifyUrl(payload))
  const opened = printPaymentStruk(payload, win)
  if (!opened) toast.warning('Izinkan pop-up browser untuk mencetak bukti bayar.')
}
</script>

<template>
  <div>
    <PageHeader title="Sales Invoices" />

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
        <button v-if="startDateFilter || endDateFilter || monthFilter" type="button" class="btn btn-outline btn-sm filter-reset-btn" @click="resetFilters">
          Reset Filter
        </button>
      </div>

      <div class="export-actions">
        <button v-if="can('sales_invoice:read')" type="button" class="btn btn-export-pdf" @click="exportMonthToPdf" title="Export Invoices (PDF)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
          Export PDF
        </button>
        <button v-if="can('sales_invoice:read')" type="button" class="btn btn-export-excel" @click="exportMonthToExcel" :disabled="isExporting" title="Export Invoices (Excel)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line></svg>
          Export Excel
        </button>
          <button v-if="can('sales_invoice:read')" type="button" class="btn btn-export-pdf" @click="exportAnnualPdf" title="Export Annual (PDF)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
          Annual PDF
        </button>
          <button v-if="can('sales_invoice:read')" type="button" class="btn btn-export-excel" @click="exportAnnualExcel" :disabled="isExporting" title="Export Annual (Excel)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line></svg>
          Annual Excel
        </button>
      </div>
    </div>

    <DataTable :columns="columns" :data="filteredData" search-placeholder="Search sales invoices..." @edit="openEdit" @delete="openDelete">
      <template #cell-customer_id="{ value }">{{ customerName(value as any) }}</template>
      <template #cell-sale_id="{ value }">{{ saleRef(value) }}</template>
      <template #cell-due_date="{ value }">{{ formatDate(value) }}</template>
      <template #cell-subtotal="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-total="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-status="{ value }">
        <span :class="approvalStatus(value) === 'approved' ? 'badge badge-info' : approvalStatus(value) === 'rejected' ? 'badge badge-danger' : 'badge badge-warning'">
          {{ approvalStatus(value) === 'approved' ? 'Approved' : approvalStatus(value) === 'rejected' ? 'Rejected' : 'Unpaid' }}
        </span>
      </template>
      <template #cell-payment_status="{ value }">
        <span :class="value === 'paid' ? 'badge badge-success' : value === 'overdue' ? 'badge badge-danger' : value === 'partially_paid' ? 'badge badge-info' : 'badge badge-warning'">
          {{ value === 'paid' ? 'Paid' : value === 'overdue' ? 'Overdue' : value === 'partially_paid' ? 'Partial' : 'Unpaid' }}
        </span>
      </template>
      <template #actions="{ row }">
        <div style="display: flex; align-items: center; gap: 6px;">
          <!-- Approval dimatikan: invoice auto-approved via payment, tombol Approve/Reject dihapus. -->
          <button v-if="row.status === 'approved' && can('sales_invoice:read')" class="action-btn action-btn--edit" title="Print Receipt" @click="printInvoice(row)" style="color: var(--color-primary); width: 36px; height: 36px;">
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 9V2h12v7"></path>
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"></path>
              <rect x="6" y="14" width="12" height="8"></rect>
            </svg>
          </button>
          <button v-if="hasApprovedPayment(row) && can('sales_invoice:read')" class="action-btn action-btn--edit" title="Print Struk Bukti Bayar" @click="printReceipt(row)" style="color: var(--color-success); width: 36px; height: 36px;">
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z M8 10h8 M8 14h8 M8 18h5"></path>
            </svg>
          </button>
          <button v-if="can('sales_invoice:read')" class="action-btn action-btn--edit" title="Detail" @click="openDetail(row)" style="color: var(--color-text-muted); width: 36px; height: 36px;">
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <button v-if="can('sales_invoice:update')" class="action-btn action-btn--edit" title="Edit" @click="openEdit(row)" style="width: 36px; height: 36px;">
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button v-if="can('sales_invoice:delete')" class="action-btn action-btn--delete" title="Delete" @click="openDelete(row)" style="width: 36px; height: 36px;">
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Sales Invoice' : 'Add Sales Invoice'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="si-no" class="form-label">No. Invoice</label>
        <input id="si-no" v-model="form.invoice_no" type="text" class="form-input" placeholder="INV-S-XXXXXX">
      </div>
      <div class="form-group">
        <label for="si-sale" class="form-label">Sale Reference</label>
        <CustomSelect id="si-sale" v-model="form.sale_id" :options="siSaleOptions" placeholder="-- Select Sale --" class="form-select" @update:modelValue="onSaleChange" />
      </div>
      <div class="form-group">
        <label for="si-customer" class="form-label">Customer</label>
        <CustomSelect id="si-customer" v-model="form.customer_id" :options="siCustomerOptions" placeholder="-- Select Customer --" class="form-select" />
      </div>
      <div class="form-group">
        <label for="si-due" class="form-label">Due Date</label>
        <input id="si-due" v-model="form.due_date" type="date" class="form-input">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="si-subtotal" class="form-label">Subtotal (Rp)</label>
          <input id="si-subtotal" v-model.number="form.subtotal" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="si-svc" class="form-label">Service Fee (Rp)</label>
          <input id="si-svc" v-model.number="form.service_charge" type="number" class="form-input" min="0">
        </div>
      </div>
      <div class="form-group">
        <label for="si-tax" class="form-label">Tax (Rp)</label>
        <input id="si-tax" v-model.number="form.tax" type="number" class="form-input" min="0">
      </div>
      <div class="form-group">
        <label for="si-discount" class="form-label">Discount (Rp)</label>
        <input id="si-discount" v-model.number="form.discount" type="number" class="form-input" min="0">
      </div>
      <div class="sale-summary">
        <div class="summary-row summary-total"><span>Total</span><span>{{ formatRupiah(calcTotal) }}</span></div>
      </div>
      <div class="form-group">
        <label for="si-status" class="form-label">Status</label>
        <CustomSelect id="si-status" v-model="form.status" :options="siStatusOptions" class="form-select" />
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Sales Invoice" :message="`Are you sure you want to delete invoice '${deletingItem?.invoice_no}'?`" @close="showConfirm = false" @confirm="handleDelete" />

    <FormModal :open="showDetail" :title="detailItem ? `Invoice Details ${detailItem.invoice_no}` : 'Invoice Details'" @close="showDetail = false">
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
            <label class="form-label">Sale Ref.</label>
            <div>{{ saleRef(detailItem.sale_id) }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Total</label>
            <div>{{ formatRupiah(detailItem.total || detailItem.subtotal || 0) }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Approval Status</label>
            <span :class="approvalStatus(detailItem.status) === 'approved' ? 'badge badge-info' : approvalStatus(detailItem.status) === 'rejected' ? 'badge badge-danger' : 'badge badge-warning'">
              {{ approvalStatus(detailItem.status) === 'approved' ? 'Approved' : approvalStatus(detailItem.status) === 'rejected' ? 'Rejected' : 'Pending' }}
            </span>
          </div>
          <div class="form-group">
            <label class="form-label">Payment Status</label>
            <span :class="detailItem.payment_status === 'paid' ? 'badge badge-success' : detailItem.payment_status === 'overdue' ? 'badge badge-danger' : detailItem.payment_status === 'partially_paid' ? 'badge badge-info' : 'badge badge-warning'">
              {{ detailItem.payment_status === 'paid' ? 'Paid' : detailItem.payment_status === 'overdue' ? 'Overdue' : detailItem.payment_status === 'partially_paid' ? 'Partial' : 'Unpaid' }}
            </span>
          </div>
        </div>

        <div class="form-section-title" style="margin-bottom: 8px;">Payment History</div>
        <div v-if="invoicePayments(detailItem).length > 0" style="border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden;">
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
              <tr v-for="(pay, idx) in invoicePayments(detailItem)" :key="idx" style="border-bottom: 1px solid var(--color-border-light);">
                <td style="padding: 12px;">{{ pay.payment_no || '-' }}</td>
                <td style="padding: 12px;">{{ pay.payment_date ? String(pay.payment_date).substring(0, 10) : '-' }}</td>
                <td style="padding: 12px;">{{ pay.bank_name || '-' }}</td>
                <td style="padding: 12px;">{{ pay.reference_no || '-' }}</td>
                <td style="padding: 12px; text-align: right; font-weight: 600; color: var(--color-success);">{{ formatRupiah(pay.amount || 0) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else style="padding: 16px; text-align: center; color: var(--color-text-muted); background: var(--color-surface); border-radius: var(--radius-md);">
          No payment history yet.
        </div>
      </template>
      <template #footer>
        <button class="btn btn-outline" @click="showDetail = false">Close</button>
      </template>
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
  box-shadow: 0 1px 3px rgba(0,0,0,0.03);
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
