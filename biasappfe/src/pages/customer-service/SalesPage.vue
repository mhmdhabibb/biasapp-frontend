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
import { useResourcesStore } from '@/stores/resources.store'
import type { Sale, TableColumn } from '@/types'
import { computed, reactive, ref } from 'vue'
import { BIAS_LOGO_DATA_URL } from '@/utils/logoData'
import { buildPaymentTimestamp } from '@/utils/paymentReceipt'
import { normalizeRole } from '@/router/role-access'
import html2pdf from 'html2pdf.js'
import * as XLSX from 'xlsx'

const toast = useToast()
const { can, isAdmin } = usePermission()
const { currentUser } = useAuth()

// Helper untuk mengubah YYYY-MM-DD menjadi format ISO 8601 lengkap (misal: 2026-10-09T00:00:00Z)
function formatToISO8601(dateStr: string): string {
  if (!dateStr) return new Date().toISOString()
  if (dateStr.includes('T')) return dateStr
  return new Date(`${dateStr}T00:00:00Z`).toISOString()
}

// CS tidak boleh melihat nominal pada detail item.
const canSeeAmount = computed(() => {
  if (isAdmin.value) return true
  const role = normalizeRole(currentUser.value?.role)
  return role === 'accounting' || role === 'admin'
})

const {
  sales: data,
  customers,
  products,
  units,
  salesInvoices,
  payments,
  findCustomer,
  findProduct,
  findUnit,
} = useMasterStore()

const resources = useResourcesStore()

const customerOptions = computed(() => [
  { value: null, label: 'All Customers' },
  ...(customers.value as any[]).map((c: any) => ({
    value: c.id,
    label: `${c.company_name || c.name}${c.pic_name ? ' - ' + c.pic_name : ''}`,
  }))
])

const filterCustomer = ref<string | null>(null)
const filteredSales = computed(() => {
  if (!filterCustomer.value) return data.value
  return data.value.filter((s: any) => String(s.customer_id) === String(filterCustomer.value))
})

const productOptions = computed(() =>
  (products.value as any[]).map((p: any) => ({
    value: p.id,
    label: p.name,
  })),
)

const storageTypeOptions = [
  { value: 'SSD', label: 'SSD' },
  { value: 'HDD', label: 'HDD' },
  { value: 'NVMe', label: 'NVMe' },
]

const warrantyTypeOptions = [
  { value: 'machine', label: 'Machine' },
  { value: 'sparepart', label: 'Sparepart' },
  { value: 'service', label: 'Service' },
]

const paymentMethodOptions = [
  { value: 'CASH', label: 'Cash' },
  { value: 'TRANSFER', label: 'Bank Transfer' },
  { value: 'CREDIT_CARD', label: 'Credit / Debit Card' },
]

const columns: TableColumn[] = [
  { key: 'date', label: 'Transaction Date' },
  { key: 'sale_no', label: 'Code' },
  { key: 'customer_id', label: 'Company' },
  { key: 'pic_name', label: 'PIC Name' },
  { key: 'total', label: 'Total' },
  { key: 'status', label: 'Status' },
]

const showModal = ref(false)
const showConfirm = ref(false)
const showDetail = ref(false)
const editingItem = ref<Sale | null>(null)
const deletingItem = ref<Sale | null>(null)
const viewingItem = ref<Sale | null>(null)
const selectedSaleItem = ref<any>(null)
const showItemDetail = ref(false)

function openSaleItemDetail(si: any) {
  selectedSaleItem.value = si
  showItemDetail.value = true
}

function closeSaleItemDetail() {
  showItemDetail.value = false
  selectedSaleItem.value = null
}

const showPaymentModal = ref(false)
const paymentData = reactive({
  amount: 0,
  payment_date: new Date().toISOString().substring(0, 10),
  method_type: 'CASH',
  bank_name: '',
  account_number: '',
  sender_name: '',
  reference_no: '',
  notes: ''
})

function openPayment(item: Sale) {
  viewingItem.value = item
  paymentData.amount = item.total || 0
  paymentData.payment_date = new Date().toISOString().substring(0, 10)
  paymentData.method_type = 'CASH'
  paymentData.bank_name = ''
  paymentData.account_number = ''
  paymentData.sender_name = ''
  paymentData.reference_no = ''
  paymentData.notes = ''
  showPaymentModal.value = true
}

const salePayments = computed(() => {
  if (!viewingItem.value) return []
  const invoice = salesInvoices.value.find((inv: any) => inv.sale_id === viewingItem.value?.id)
  if (!invoice) return []
  return payments.value.filter((p: any) => p.sales_invoice_id === invoice.id)
})

async function handlePayment() {
  if (!viewingItem.value) return
  try {
    const invoice = salesInvoices.value.find((inv: any) => inv.sale_id === viewingItem.value?.id)
    if (invoice) {
      let finalBankName = paymentData.bank_name
      if (paymentData.method_type === 'TRANSFER' || paymentData.method_type === 'CREDIT_CARD') {
        finalBankName = `${paymentData.bank_name} - ${paymentData.account_number} (A/N: ${paymentData.sender_name})`
      }

      const paymentPayload = {
        payment_no: 'PAY-' + Math.floor(Date.now() / 1000),
        sales_invoice_id: invoice.id,
        payment_date: buildPaymentTimestamp(paymentData.payment_date),
        amount: Number(paymentData.amount),
        tax_deduction: 0,
        bank_name: paymentData.method_type === 'CASH' ? 'CASH' : finalBankName,
        reference_no: paymentData.reference_no || '-'
      }
      await resources.create("payments", paymentPayload)
    }

    const payload = {
      ...viewingItem.value,
      status: 'paid'
    }
    await resources.update("sales", viewingItem.value.id as any, payload)
    await useMasterStore().refreshInBackground()
    showPaymentModal.value = false
    toast.success("Payment recorded successfully!")
  } catch (err: any) {
    toast.error("Failed to record payment! " + (err.response?.data?.message || err.message))
  }
}

function generateSingleInvoiceHtml(item: any) {
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
  const signer = item?.user?.name || item?.user?.username || currentUser.value?.name || currentUser.value?.username || '-'

  const invoice = salesInvoices.value.find((inv: any) => inv.sale_id === item.id)
  const invoiceNo = invoice ? invoice.invoice_no : (item.sale_no || item.code || `SLS-${item.id}`)
  const invoiceDate = invoice?.created_at || invoice?.due_date || item.sale_date || item.date

  const dateStr = invoiceDate ? new Date(invoiceDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'

  let itemsHtml = ''
  if (item.sale_items && item.sale_items.length > 0) {
    itemsHtml = item.sale_items.map((si: any, idx: number) => {
      const p = si.product_id ? findProduct(si.product_id) : null
      let pName = p ? p.name : (si.product_id ? 'Product ID: ' + si.product_id : 'Unit Only')
      if (si.unit_id) {
        const u = findUnit(si.unit_id)
        if (u) {
          pName += ` - ${u.name} ${u.serial_no ? `(SN: ${u.serial_no})` : ''}`
        }
      }
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
    itemsHtml = `<tr><td colspan="8" style="text-align: center; color: #666;">No item data available</td></tr>`
  }

  const subTotalStr = (item.subtotal || item.total_amount || item.total || 0).toLocaleString('id-ID')
  const discountStr = (item.discount || 0).toLocaleString('id-ID')
  const grandTotalStr = (item.total_amount || item.total || 0).toLocaleString('id-ID')

  return `
    <div class="page-break" style="padding: 20px; box-sizing: border-box; max-width: 900px; margin: 0 auto;">
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
              ${item.po_no ? `
              <tr>
                <td class="label">PO NO.:</td>
                <td>${item.po_no}</td>
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
          <tr style="height: 60px;">
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

      <div class="signatures">
        <div class="sig-box">
          Received By,
          <div class="sig-line"></div>
        </div>
        <div class="sig-box">
          Sincerely,
          <div class="sig-line">${signer}</div>
        </div>
      </div>
    </div>
  `
}

function exportMonthToExcel() {
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

  let csvContent = '\uFEFF'

  items.forEach((item: any, idx: number) => {
    const customer = findCustomer(item.customer_id)
    const custName = (customer?.company_name || customer?.name || '-').replace(/;/g, ',')
    const custAddress = (customer?.address || '-').replace(/;/g, ',').replace(/\n/g, ' ')
    const custPhone = (customer?.phone || '-').replace(/;/g, ',')
    const pic = customer?.pic_name || '-'
    const gender = customer?.pic_gender
    let prefix = 'Bapak/Ibu '
    if (gender === 'L') prefix = 'Bapak '
    if (gender === 'P') prefix = 'Ibu '
    const picDisplay = pic !== '-' ? (prefix + pic).replace(/;/g, ',') : '-'

    const invoice = salesInvoices.value.find((inv: any) => inv.sale_id === item.id)
    const invoiceNo = invoice ? invoice.invoice_no : (item.sale_no || item.code || `SLS-${item.id}`)
    const invoiceDate = invoice?.created_at || invoice?.due_date || item.sale_date || item.date
    const dateStr = invoiceDate ? new Date(invoiceDate).toLocaleDateString('en-GB') : '-'

    const subtotal = item.subtotal || item.total_amount || item.total || 0
    const grandTotal = item.total_amount || item.total || 0

    csvContent += `INVOICE SALES #${idx + 1};;;;;;\n`
    csvContent += `PT. BIAS SURYA TEKNOLOGI;;;;;Invoice No:;"${invoiceNo}"\n`
    csvContent += `Ruko Purimas Blok A No.47 Batam;;;;;Date:;"${dateStr}"\n`
    csvContent += `To:;"${custName}";;;;;Status:;"${(item.status || 'pending').toUpperCase()}"\n`
    csvContent += `Address:;"${custAddress}";;;;;Phone:;"${custPhone}"\n`
    csvContent += `Attn:;"${picDisplay}";;;;;\n`
    csvContent += `;;;;;;\n`
    csvContent += `No;Product / Item Description;Qty;UOM;Unit Price (Rp);Total Amount (Rp)\n`

    if (item.sale_items && item.sale_items.length > 0) {
      item.sale_items.forEach((si: any, sIdx: number) => {
        const p = si.product_id ? findProduct(si.product_id) : null
        let pName = (p ? p.name : (si.product_id ? 'Product ID: ' + si.product_id : 'Unit Only'))
        if (si.unit_id) {
          const u = findUnit(si.unit_id)
          if (u) {
            pName += ` - ${u.name} ${u.serial_no ? `(SN: ${u.serial_no})` : ''}`
          }
        }
        pName = pName.replace(/;/g, ',')
        const qty = si.qty || 1
        const uPrice = si.unit_price || si.price || 0
        const itemTotal = uPrice * qty
        csvContent += `${sIdx + 1};"${pName}";${qty};unit;${uPrice};${itemTotal}\n`
      })
    } else {
      csvContent += `1;"Goods / Services";1;unit;${subtotal};${subtotal}\n`
    }

    csvContent += `;;;;Sub Total:;${subtotal}\n`
    csvContent += `;;;;Discount:;${item.discount || 0}\n`
    csvContent += `;;;;Grand Total:;${grandTotal}\n`
    csvContent += `;;;;;;\n`
    csvContent += `------------------------------------------------------------------------;;;;;;\n`
    csvContent += `;;;;;;\n`
  })

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `Document_Invoices_Sales_${periodLabel}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function exportMonthToPdf() {
  const items = filteredData.value
  if (items.length === 0) {
    toast.warning('No sales invoice data to export to PDF!')
    return
  }

  let periodTitle = 'Entire Period'
  if (monthFilter.value) {
    const [yearStr, monthStr] = monthFilter.value.split('-')
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    periodTitle = `${months[parseInt(monthStr) - 1]} ${yearStr}`
  } else if (startDateFilter.value || endDateFilter.value) {
    periodTitle = `${startDateFilter.value || 'Start'} to ${endDateFilter.value || 'End'}`
  }

  const invoicesHtml = items.map(item => generateSingleInvoiceHtml(item)).join('')

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Sales Invoices - ${periodTitle}</title>
        <style>
          @media print {
            @page { size: A4 portrait; margin: 10mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .page-break { page-break-after: always; break-after: page; }
            .page-break:last-child { page-break-after: auto; break-after: auto; }
          }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 0; color: #000; font-size: 12px; margin: 0; }
          .page-break { page-break-after: always; break-after: page; min-height: 95vh; box-sizing: border-box; }
          .page-break:last-child { page-break-after: auto; break-after: auto; }
          
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
          
          .summary-table { width: 350px; float: right; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px; }
          .summary-table td { border: 1px solid #7ea8ce; padding: 6px; background-color: #dbeaf4; font-weight: bold; }
          .summary-table .label { text-align: right; padding-right: 10px; }
          
          .payment-info { clear: left; float: left; margin-top: 10px; font-size: 12px; font-weight: bold; line-height: 1.6; }
          
          .signatures { display: flex; justify-content: space-between; clear: both; padding-top: 50px; text-align: center; font-weight: bold; }
          .sig-box { width: 250px; }
          .sig-line { margin-top: 80px; border-bottom: 1px solid #000; padding-bottom: 5px; }
        </style>
      </head>
      <body>
        ${invoicesHtml}
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 500);
          }
        <\/script>
      </body>
    </html>
  `

  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
  }
}

const saleItems = ref<{ product_id: number | null; unit_id: string | null; _combined_id: string | null; qty: number; unit_price: number; is_computer: boolean; specs: { cpu: string; ram: string; storage: string; storage_type: string; os: string; vga: string; office: string; }; description: string; }[]>([])

const form = reactive({
  sale_no: '',
  customer_id: null as string | null,
  sale_date: '',
  po_no: '',
  installation_address: '',
  total_amount: 0,
  discount: 0,
  status: 'approved',
  has_warranty: true,
  warranty: {
    warranty_type: 'machine',
    warranty_types: ['machine'] as string[],
    duration_months: 12,
    duration_days: 0,
    expired_date: '',
    terms_conditions: ''
  }
})

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addMonthsISO(dateStr: string, months: number): string {
  const d = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date()
  d.setMonth(d.getMonth() + months)
  return toISODate(d)
}

const calcSubtotal = computed(() => saleItems.value.reduce((sum, item) => sum + (item.qty * item.unit_price), 0))
const calcDiscount = computed(() => Math.max(0, Number(form.discount) || 0))
const calcTotal = computed(() => Math.max(0, calcSubtotal.value - calcDiscount.value))

function addSaleItem() {
  saleItems.value.push({ product_id: null as any, unit_id: null, _combined_id: null, qty: 1, unit_price: 0, is_computer: false, specs: { cpu: '', ram: '', storage: '', storage_type: '', os: '', vga: '', office: '' }, description: '' })
}

function removeSaleItem(idx: number) {
  saleItems.value.splice(idx, 1)
}

function onCombinedItemChange(idx: number) {
  const item = saleItems.value[idx]
  if (!item || !item._combined_id) return

  const parseSpecs = (raw: any) => {
    const blank = { cpu: '', ram: '', storage: '', storage_type: '', os: '', vga: '', office: '' }
    if (!raw) return blank
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw
      return { ...blank, ...parsed }
    } catch { return blank }
  }

  if (item._combined_id.startsWith('P_')) {
    item.product_id = parseInt(item._combined_id.replace('P_', ''))
    item.unit_id = null
    const prod = findProduct(item.product_id)
    if (prod) {
      item.unit_price = prod.price
      item.is_computer = !!prod.is_computer
      if (item.is_computer) item.specs = parseSpecs((prod as any).specs)
    }
  } else if (item._combined_id.startsWith('U_')) {
    item.unit_id = item._combined_id.replace('U_', '')
    item.product_id = null
    const unit = findUnit(item.unit_id)
    item.unit_price = (unit && (unit as any).price) ? (unit as any).price : 0
    if (unit) {
      item.is_computer = !!unit.is_computer
      if (item.is_computer) item.specs = parseSpecs((unit as any).specs)
    }
  }
}

const currentStep = ref(1)

function openAdd() {
  editingItem.value = null
  currentStep.value = 1
  Object.assign(form, { sale_no: `SLS-${Date.now().toString().slice(-6)}`, customer_id: null, sale_date: new Date().toISOString().slice(0, 10), po_no: '', installation_address: '', total_amount: 0, discount: 0, status: 'approved', has_warranty: true, warranty: { warranty_type: 'machine', warranty_types: ['machine'], duration_months: 12, duration_days: 0, expired_date: addMonthsISO(new Date().toISOString().slice(0, 10), 12), terms_conditions: '' } })
  saleItems.value = [{ product_id: null as any, unit_id: null, _combined_id: null, qty: 1, unit_price: 0, is_computer: false, specs: { cpu: '', ram: '', storage: '', storage_type: '', os: '', vga: '', office: '' }, description: '' }]
  showModal.value = true
}

function openView(item: any) {
  viewingItem.value = item
  showDetail.value = true
}

function openEdit(item: any) {
  editingItem.value = item
  currentStep.value = 1
  Object.assign(form, {
    sale_no: item.sale_no || `SLS-${item.id}`,
    customer_id: item.customer_id,
    po_no: item.po_no || '',
    installation_address: item.installation_address || '',
    sale_date: item.sale_date ? item.sale_date.slice(0, 10) : '',
    total_amount: item.total_amount || item.total,
    discount: item.discount || 0,
    status: item.status || 'approved',
    has_warranty: item.has_warranty || (item.warranties && item.warranties.length > 0) || false,
    warranty: item.warranties && item.warranties.length > 0 ? {
      warranty_type: item.warranties[0].warranty_type || 'machine',
      warranty_types: (() => {
        const list = item.warranties.map((w: any) => w.warranty_type).filter(Boolean)
        return list.length ? [...new Set(list)] : ['machine']
      })(),
      duration_months: item.warranties[0].duration_months || 0,
      duration_days: item.warranties[0].duration_days || 0,
      expired_date: item.warranties[0].end_date ? String(item.warranties[0].end_date).substring(0, 10) : addMonthsISO(item.sale_date ? item.sale_date.slice(0, 10) : '', 12),
      terms_conditions: item.warranties[0].terms_conditions || ''
    } : {
      warranty_type: 'machine',
      warranty_types: ['machine'],
      duration_months: 12,
      duration_days: 0,
      expired_date: addMonthsISO(item.sale_date ? item.sale_date.slice(0, 10) : '', 12),
      terms_conditions: ''
    }
  })
  if (item.sale_items && item.sale_items.length > 0) {
    saleItems.value = item.sale_items.map((si: any) => {
      let parsedSpecs = { cpu: '', ram: '', storage: '', storage_type: '', os: '', vga: '', office: '' }
      if (si.specs) {
        try { parsedSpecs = typeof si.specs === 'string' ? JSON.parse(si.specs) : si.specs } catch (e) { }
      }
      return {
        product_id: si.product_id,
        unit_id: si.unit_id || null,
        _combined_id: si.unit_id ? `U_${si.unit_id}` : (si.product_id ? `P_${si.product_id}` : null),
        qty: si.qty,
        unit_price: si.unit_price || si.price || 0,
        is_computer: si.unit_id ? !!(findUnit(si.unit_id)?.is_computer) : !!(findProduct(si.product_id)?.is_computer),
        specs: parsedSpecs,
        description: si.description || ''
      }
    })
  } else {
    saleItems.value = [{ product_id: null as any, unit_id: null, _combined_id: null, qty: 1, unit_price: 0, is_computer: false, specs: { cpu: '', ram: '', storage: '', storage_type: '', os: '', vga: '', office: '' }, description: '' }]
  }
  showModal.value = true
}

async function handleSubmit() {
  if (!form.customer_id) return
  if (!form.installation_address.trim()) {
    toast.warning('Installation/delivery address is required.')
    return
  }

  // Konversi expired date -> duration
  const warrantyPayload = { ...form.warranty }
  if (form.has_warranty) {
    if (!warrantyPayload.expired_date) {
      toast.warning('Warranty expired date is required.')
      return
    }
    const types = [...new Set((warrantyPayload.warranty_types || []).filter(Boolean))]
    if (types.length === 0) {
      toast.warning('Pilih minimal 1 warranty type.')
      return
    }
    const start = new Date(`${form.sale_date}T00:00:00`)
    const end = new Date(`${warrantyPayload.expired_date}T00:00:00`)
    const diffDays = Math.round((end.getTime() - start.getTime()) / 86400000)
    if (diffDays < 0) {
      toast.warning('Warranty expired date must not be before the sale date.')
      return
    }
    warrantyPayload.start_date = formatToISO8601(form.sale_date)
    warrantyPayload.duration_months = 0
    warrantyPayload.duration_days = diffDays
    warrantyPayload.warranty_type = types[0]
    warrantyPayload.warranty_types = types
  }

  const saleData = {
    ...form,
    // Format tanggal transaksi menjadi ISO8601 lengkap agar backend Go dapat mempassing waktu T00:00:00Z
    sale_date: formatToISO8601(form.sale_date),
    warranty: warrantyPayload,
    warranties: form.has_warranty
      ? [...new Set((form.warranty.warranty_types || []).filter(Boolean))].map((t) => ({
        warranty_type: t,
        start_date: formatToISO8601(form.sale_date),
        duration_months: warrantyPayload.duration_months,
        duration_days: warrantyPayload.duration_days,
        terms_conditions: form.warranty.terms_conditions || '',
      }))
      : [],
    subtotal: calcSubtotal.value,
    discount: calcDiscount.value,
    total: calcTotal.value,
    sale_items: saleItems.value.map(item => ({
      ...item,
      specs: JSON.stringify(item.specs)
    }))
  }

  let pw: Window | null = null;
  if (!editingItem.value) {
    pw = window.open('', '_blank');
    if (pw) {
      pw.document.write('Loading invoice...');
    }
  }

  try {
    let res;
    if (editingItem.value) {
      res = await resources.update("sales", editingItem.value.id as any, saleData)
    } else {
      res = await resources.create("sales", saleData)
    }
    await useMasterStore().refreshInBackground()
    showModal.value = false
    toast.success(editingItem.value ? "Sale updated successfully!" : "Sale saved successfully!")

    if (!editingItem.value && res && res.id) {
      const newSale = useMasterStore().sales.value.find(s => s.id === res.id)
      if (newSale) {
        printInvoice(newSale, pw)
      } else {
        printInvoice(res, pw)
      }
    }
  } catch (error: any) {
    if (pw) pw.close();
    const errMsg = (error.response?.data?.message || error.message || "Unknown error") + " - Detail: " + JSON.stringify(error.response?.data || error.response || error);
    toast.error("Failed to save data! " + errMsg)
  }
}

function openDelete(item: Sale) { deletingItem.value = item; showConfirm.value = true }
async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.remove("sales", deletingItem.value.id as any)
      useMasterStore().refreshInBackground()
      toast.success("Sale deleted successfully!")
    } catch (error) {
      toast.error("Failed to delete data!")
    }
  }
  showConfirm.value = false
}

function customerName(id: any): string {
  const c = findCustomer(id as any) as any
  if (!c) return '-'
  return c.company_name || c.name || '-'
}

function picName(id: any): string {
  const c = findCustomer(id as any) as any
  if (!c) return '-'
  return c.pic_name || '-'
}

function formatRupiah(val: number): string {
  return 'Rp ' + val.toLocaleString('id-ID')
}

function printInvoice(item: any, existingWindow?: Window | null) {
  const invoiceContentHtml = generateSingleInvoiceHtml(item)
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Invoice - ${item.sale_no || item.id}</title>
        <style>
          @media print {
            @page { size: A4 portrait; margin: 10mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 0; color: #000; font-size: 12px; margin: 0; }
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
          .summary-table { width: 350px; float: right; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px; }
          .summary-table td { border: 1px solid #7ea8ce; padding: 6px; background-color: #dbeaf4; font-weight: bold; }
          .summary-table .label { text-align: right; padding-right: 10px; }
          .payment-info { clear: left; float: left; margin-top: 10px; font-size: 12px; font-weight: bold; line-height: 1.6; }
          .signatures { display: flex; justify-content: space-between; clear: both; padding-top: 50px; text-align: center; font-weight: bold; }
          .sig-box { width: 250px; }
          .sig-line { margin-top: 80px; border-bottom: 1px solid #000; padding-bottom: 5px; }
        </style>
      </head>
      <body>
        ${invoiceContentHtml}
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 500);
          }
        <\/script>
      </body>
    </html>
  `

  const printWindow = existingWindow || window.open('', '_blank')
  if (printWindow) {
    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
  }
}

function generateSingleReceiptHtml(item: any) {
  const customer = findCustomer(item.customer_id)
  const compName = customer?.company_name
  const custName = customer?.pic_name

  const invoice = salesInvoices.value.find((inv: any) => inv.sale_id === item.id)
  const invoiceNo = invoice ? invoice.invoice_no : (item.sale_no || item.code || `SLS-${item.id}`)
  const invoiceDate = invoice?.created_at || invoice?.due_date || item.sale_date || item.date

  const dateStr = invoiceDate ? new Date(invoiceDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'
  const amountStr = (item.total_amount || item.total || 0).toLocaleString('id-ID')

  return `
    <div class="page-break" style="padding: 40px; box-sizing: border-box; max-width: 800px; margin: 0 auto; font-family: 'Segoe UI', sans-serif;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 2px solid #003366; padding-bottom: 20px;">
        <div class="logo-container" style="display: flex; align-items: center;">
          <img src="${BIAS_LOGO_DATA_URL}" class="logo" style="width: 70px; height: 70px; margin-right: 15px;" alt="BiAS Logo" />
          <div class="company-details" style="color: #003366;">
            <h1 style="margin: 0; font-size: 20px;">PT. BIAS SURYA TEKNOLOGI</h1>
            <p style="margin: 5px 0 0 0; font-size: 11px;">Ruko Purimas Blok A No.47 Kota Batam</p>
          </div>
        </div>
        <div style="text-align: right; color: #003366;">
          <h1 style="margin: 0; font-size: 32px; letter-spacing: 2px;">RECEIPT</h1>
          <p style="margin: 5px 0 0 0; font-weight: bold;">No. ${invoiceNo}-REC</p>
          <p style="margin: 0;">Date: ${dateStr}</p>
        </div>
      </div>
      
      <div style="background: #f8fafc; padding: 30px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 40px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 16px;">
          <tr>
            <td style="padding: 15px 0; width: 180px; color: #64748b; font-weight: bold;">Received From</td>
            <td style="padding: 15px 0; width: 20px;">:</td>
            <td style="padding: 15px 0; font-weight: bold; font-size: 18px; border-bottom: 1px dashed #cbd5e1;">${compName} - ${custName}</td>
          </tr>
          <tr>
            <td style="padding: 15px 0; color: #64748b; font-weight: bold;">Amount</td>
            <td style="padding: 15px 0;">:</td>
            <td style="padding: 15px 0; font-weight: bold; font-size: 22px; color: #0f172a; border-bottom: 1px dashed #cbd5e1;">Rp ${amountStr}</td>
          </tr>
          <tr>
            <td style="padding: 15px 0; color: #64748b; font-weight: bold;">For Payment of</td>
            <td style="padding: 15px 0;">:</td>
            <td style="padding: 15px 0; font-size: 16px; border-bottom: 1px dashed #cbd5e1;">Invoice No. ${invoiceNo}</td>
          </tr>
        </table>
      </div>

      <div style="display: flex; justify-content: space-between; margin-top: 50px;">
        <div style="width: 200px; text-align: center;">
          <p style="margin: 0; color: #64748b;">Customer</p>
          <div style="border-bottom: 1px solid #000; height: 80px; margin-bottom: 5px;"></div>
          <p style="margin: 0; font-weight: bold;">${custName}</p>
        </div>
        <div style="width: 200px; text-align: center;">
          <p style="margin: 0; color: #64748b;">Finance / Accounting</p>
          <div style="border-bottom: 1px solid #000; height: 80px; margin-bottom: 5px;"></div>
          <p style="margin: 0; font-weight: bold;">PT. Bias Surya Teknologi</p>
        </div>
      </div>
    </div>
  `
}

function exportToExcel() {
  const exportData = filteredSales.value.map((j: any) => ({
    'Transaction Date': j.date ? new Date(j.date).toLocaleDateString('en-GB') : '-',
    'Code': j.sale_no || '-',
    'Customer': findCustomer(j.customer_id)?.company_name || findCustomer(j.customer_id)?.name || '-',
    'PIC Name': findCustomer(j.customer_id)?.pic_name || '-',
    'Total': j.total || 0,
    'Status': j.status || '-'
  }))
  if (!exportData.length) {
    toast.error('No data to export')
    return
  }
  const ws = XLSX.utils.json_to_sheet(exportData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Sales")
  XLSX.writeFile(wb, `Sales_${Date.now()}.xlsx`)
}

function exportToPdf() {
  const exportData = filteredSales.value.map((j: any) => ({
    'Transaction Date': j.date ? new Date(j.date).toLocaleDateString('en-GB') : '-',
    'Code': j.sale_no || '-',
    'Customer': findCustomer(j.customer_id)?.company_name || findCustomer(j.customer_id)?.name || '-',
    'PIC Name': findCustomer(j.customer_id)?.pic_name || '-',
    'Total': (j.total || 0).toLocaleString('id-ID'),
    'Status': String(j.status || '-').toUpperCase()
  }))
  if (!exportData.length) {
    toast.error('No data to export')
    return
  }

  let html = '<h2 style="font-family: sans-serif; text-align: center;">Sales Report</h2><table border="1" cellpadding="8" cellspacing="0" style="width:100%; border-collapse: collapse; font-family: sans-serif; font-size: 11px; text-align: center;">'
  html += '<thead><tr style="background-color: #5b9bd5; color: white;">'
  const keys = Object.keys(exportData[0]!)
  keys.forEach(k => html += `<th>${k}</th>`)
  html += '</tr></thead><tbody>'
  exportData.forEach(row => {
    html += '<tr>'
    keys.forEach(k => html += `<td>${(row as any)[k]}</td>`)
    html += '</tr>'
  })
  html += '</tbody></table>'

  const wrapper = document.createElement('div')
  wrapper.innerHTML = html

  const opt = {
    margin: 0.5,
    filename: `Sales_Report_${Date.now()}.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'landscape' as const }
  }
  html2pdf().set(opt).from(wrapper).save()
}

function printReceipt(item: any, existingWindow?: Window | null) {
  const receiptContentHtml = generateSingleReceiptHtml(item)
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Receipt - ${item.sale_no || item.id}</title>
        <style>
          @media print {
            @page { size: A5 landscape; margin: 0; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; }
          }
        </style>
      </head>
      <body>
        ${receiptContentHtml}
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 500);
          }
        <\/script>
      </body>
    </html>
  `
  const printWindow = existingWindow || window.open('', '_blank')
  if (printWindow) {
    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
  }
}

const combinedItemOptions = computed(() => {
  const opts: { value: string; label: string }[] = []
  products.value.forEach(p => {
    opts.push({ value: `P_${p.id}`, label: `[Product] ${p.name}` })
  })
  units.value.filter(u => u.status !== 'sold').forEach(u => {
    opts.push({ value: `U_${u.id}`, label: `[Unit] ${u.name} ${u.serial_no ? '(SN: ' + u.serial_no + ')' : ''}` })
  })
  return opts
})

</script>