<script setup lang="ts">
// @ts-nocheck
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useResourcesStore } from '@/stores/resources.store'
import type { Sale, TableColumn } from '@/types'
import { computed, reactive, ref } from 'vue'

const {
  sales: data,
  customers,
  products,
  salesInvoices,
  payments,
  findCustomer,
  findProduct,
} = useMasterStore()

const resources = useResourcesStore()

const columns: TableColumn[] = [
  { key: 'date', label: 'Tanggal Transaksi' },
  { key: 'sale_no', label: 'Kode' },
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

const showPaymentModal = ref(false)
const paymentData = reactive({
  amount: 0,
  payment_date: new Date().toISOString().substring(0, 10),
  method_type: 'CASH', // CASH, TRANSFER, CREDIT_CARD
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
            payment_date: paymentData.payment_date + "T00:00:00Z",
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
    await useMasterStore().refresh(true)
    showPaymentModal.value = false
    alert("Pembayaran berhasil dicatat!")
  } catch (err: any) {
    alert("Gagal mencatat pembayaran! " + (err.response?.data?.message || err.message))
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

  const invoice = salesInvoices.value.find((inv: any) => inv.sale_id === item.id)
  const invoiceNo = invoice ? invoice.invoice_no : (item.sale_no || item.code || `SLS-${item.id}`)
  const invoiceDate = invoice?.created_at || invoice?.due_date || item.sale_date || item.date

  const dateStr = invoiceDate ? new Date(invoiceDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'

  let itemsHtml = ''
  if (item.sale_items && item.sale_items.length > 0) {
    itemsHtml = item.sale_items.map((si: any, idx: number) => {
      const p = findProduct(si.product_id)
      let pName = p ? p.name : ('Produk ID: ' + si.product_id)
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
    itemsHtml = `<tr><td colspan="8" style="text-align: center; color: #666;">Data item tidak tersedia</td></tr>`
  }

  const subTotalStr = (item.subtotal || item.total_amount || item.total || 0).toLocaleString('id-ID')
  const grandTotalStr = (item.total_amount || item.total || 0).toLocaleString('id-ID')

  return `
    <div class="page-break" style="padding: 20px; box-sizing: border-box; max-width: 900px; margin: 0 auto;">
      <table class="header-table">
        <tr>
          <td class="logo-col">
            <div class="logo-container">
              <svg class="logo" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="40" stroke="#003366" stroke-width="12"/>
                <path d="M50 10 A40 40 0 0 1 90 50" stroke="#F4B042" stroke-width="12" fill="none"/>
                <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#F4B042" font-weight="bold" font-size="22">BiAS</text>
              </svg>
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
                <td colspan="2" class="bg-blue">Kepada Yth. :</td>
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
                <td class="label">Up.:</td>
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
          <td class="val-col" style="border-left: none; text-align: right;">-</td>
        </tr>
        <tr>
          <td class="label">Amount</td>
          <td class="rp-col" style="border-right: none; padding-right: 0;">Rp</td>
          <td class="val-col" style="border-left: none; text-align: right;">${grandTotalStr}</td>
        </tr>
      </table>

      <div class="payment-info">
        Pembayaran Transfer ke rekening :<br>
        BANK BRKSYARIAH Cabang Batam<br>
        Rek No. 106-08-85757<br>
        A/N : PT. BIAS SURYA TEKNOLOGI<br>
        NPWP : 0941.8395.0822.5000
      </div>

      <div class="signatures">
        <div class="sig-box">
          Received By,
          <div class="sig-line"></div>
        </div>
        <div class="sig-box">
          Hormat Kami,
          <div class="sig-line">Grace</div>
        </div>
      </div>
    </div>
  `
}

function exportMonthToExcel() {
  const items = filteredData.value
  if (items.length === 0) {
    alert('Tidak ada data sales invoice untuk diekspor!')
    return
  }

  let periodLabel = 'Semua_Periode'
  if (monthFilter.value) {
    periodLabel = monthFilter.value
  } else if (startDateFilter.value || endDateFilter.value) {
    periodLabel = `${startDateFilter.value || 'Awal'}_sd_${endDateFilter.value || 'Akhir'}`
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
    const dateStr = invoiceDate ? new Date(invoiceDate).toLocaleDateString('id-ID') : '-'

    const subtotal = item.subtotal || item.total_amount || item.total || 0
    const grandTotal = item.total_amount || item.total || 0

    csvContent += `INVOICE SALES #${idx + 1};;;;;;\n`
    csvContent += `PT. BIAS SURYA TEKNOLOGI;;;;;Invoice No:;"${invoiceNo}"\n`
    csvContent += `Ruko Purimas Blok A No.47 Batam;;;;;Tanggal:;"${dateStr}"\n`
    csvContent += `Kepada Yth:;"${custName}";;;;;Status:;"${(item.status || 'pending').toUpperCase()}"\n`
    csvContent += `Alamat:;"${custAddress}";;;;;Phone:;"${custPhone}"\n`
    csvContent += `UP:;"${picDisplay}";;;;;\n`
    csvContent += `;;;;;;\n`
    csvContent += `No;Deskripsi Produk / Item;Qty;Satuan;Harga Satuan (Rp);Total Amount (Rp)\n`

    if (item.sale_items && item.sale_items.length > 0) {
      item.sale_items.forEach((si: any, sIdx: number) => {
        const p = findProduct(si.product_id)
        const pName = (p ? p.name : ('Produk ID: ' + si.product_id)).replace(/;/g, ',')
        const qty = si.qty || 1
        const uPrice = si.unit_price || si.price || 0
        const itemTotal = uPrice * qty
        csvContent += `${sIdx + 1};"${pName}";${qty};unit;${uPrice};${itemTotal}\n`
      })
    } else {
      csvContent += `1;"Penjualan Barang / Jasa";1;unit;${subtotal};${subtotal}\n`
    }

    csvContent += `;;;;Sub Total:;${subtotal}\n`
    csvContent += `;;;;Discount:;0\n`
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
    alert('Tidak ada data sales invoice untuk diekspor ke PDF!')
    return
  }

  let periodTitle = 'Seluruh Periode'
  if (monthFilter.value) {
    const [yearStr, monthStr] = monthFilter.value.split('-')
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
    periodTitle = `${months[parseInt(monthStr) - 1]} ${yearStr}`
  } else if (startDateFilter.value || endDateFilter.value) {
    periodTitle = `${startDateFilter.value || 'Awal'} s/d ${endDateFilter.value || 'Akhir'}`
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

const saleItems = ref<{ product_id: number | null; qty: number; unit_price: number; is_computer: boolean; specs: { cpu: string; ram: string; storage: string; storage_type: string; os: string; vga: string; office: string; }; description: string; }[]>([])

const form = reactive({
  sale_no: '',
  customer_id: null as string | null,
  sale_date: '',
  po_no: '',
  total_amount: 0,
  status: 'pending',
  has_warranty: false,
  warranty: {
    warranty_type: 'machine',
    duration_months: 12,
    duration_days: 0,
    terms_conditions: ''
  }
})

const calcSubtotal = computed(() => saleItems.value.reduce((sum, item) => sum + (item.qty * item.unit_price), 0))
// You can use calcSubtotal to set total_amount automatically before submit
const calcTotal = computed(() => calcSubtotal.value)

function addSaleItem() {
  saleItems.value.push({ product_id: null as any, qty: 1, unit_price: 0, is_computer: false, specs: { cpu: '', ram: '', storage: '', storage_type: '', os: '', vga: '', office: '' }, description: '' })
}

function removeSaleItem(idx: number) {
  saleItems.value.splice(idx, 1)
}

function onProductChange(idx: number) {
  const item = saleItems.value[idx]
  if (!item) return
  const prod = findProduct(item.product_id)
  if (prod) {
    item.unit_price = prod.price
    item.is_computer = !!prod.is_computer
  }
}

function openAdd() {
  editingItem.value = null
  Object.assign(form, { sale_no: `SLS-${Date.now().toString().slice(-6)}`, customer_id: null, sale_date: new Date().toISOString().slice(0, 10), po_no: '', total_amount: 0, status: 'pending', has_warranty: false, warranty: { warranty_type: 'machine', duration_months: 12, duration_days: 0, terms_conditions: '' } })
  saleItems.value = [{ product_id: null as any, qty: 1, unit_price: 0, is_computer: false, specs: { cpu: '', ram: '', storage: '', storage_type: '', os: '', vga: '', office: '' }, description: '' }]
  showModal.value = true
}

function openView(item: any) {
  viewingItem.value = item
  showDetail.value = true
}

function openEdit(item: any) {
  editingItem.value = item
  Object.assign(form, {
    sale_no: item.sale_no || `SLS-${item.id}`,
    customer_id: item.customer_id,
    po_no: item.po_no || '',
    sale_date: item.sale_date ? item.sale_date.slice(0, 10) : '',
    total_amount: item.total_amount || item.total,
    status: item.status || 'pending',
    has_warranty: item.has_warranty || (item.warranties && item.warranties.length > 0) || false,
    warranty: item.warranties && item.warranties.length > 0 ? {
      warranty_type: item.warranties[0].warranty_type || 'machine',
      duration_months: item.warranties[0].duration_months || 0,
      duration_days: item.warranties[0].duration_days || 0,
      terms_conditions: item.warranties[0].terms_conditions || ''
    } : {
      warranty_type: 'machine',
      duration_months: 12,
      duration_days: 0,
      terms_conditions: ''
    }
  })
  if (item.sale_items && item.sale_items.length > 0) {
    saleItems.value = item.sale_items.map((si: any) => {
      let parsedSpecs = { cpu: '', ram: '', storage: '', storage_type: '', os: '', vga: '', office: '' }
      if (si.specs) {
        try { parsedSpecs = typeof si.specs === 'string' ? JSON.parse(si.specs) : si.specs } catch (e) {}
      }
      return {
        product_id: si.product_id,
        qty: si.qty,
        unit_price: si.unit_price || si.price || 0,
        is_computer: !!(findProduct(si.product_id)?.is_computer),
        specs: parsedSpecs,
        description: si.description || ''
      }
    })
  } else {
    saleItems.value = [{ product_id: null as any, qty: 1, unit_price: 0, is_computer: false, specs: { cpu: '', ram: '', storage: '', storage_type: '', os: '', vga: '', office: '' }, description: '' }]
  }
  showModal.value = true
}

async function handleSubmit() {
  if (!form.customer_id) return
  const saleData = {
    ...form,
    subtotal: calcSubtotal.value,
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
    await useMasterStore().refresh(true)
    showModal.value = false

    // Auto-print invoice when a new sale is created
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
    alert("Gagal menyimpan data! " + errMsg)
  }
}

function openDelete(item: Sale) { deletingItem.value = item; showConfirm.value = true }
async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.remove("sales", deletingItem.value.id as any)
      useMasterStore().refresh(true)
    } catch (error) {
      alert("Gagal menghapus data!")
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
  const custName = customer?.company_name || customer?.name || '-'
  
  const invoice = salesInvoices.value.find((inv: any) => inv.sale_id === item.id)
  const invoiceNo = invoice ? invoice.invoice_no : (item.sale_no || item.code || `SLS-${item.id}`)
  const invoiceDate = invoice?.created_at || invoice?.due_date || item.sale_date || item.date

  const dateStr = invoiceDate ? new Date(invoiceDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'
  const amountStr = (item.total_amount || item.total || 0).toLocaleString('id-ID')

  return `
    <div class="page-break" style="padding: 40px; box-sizing: border-box; max-width: 800px; margin: 0 auto; font-family: 'Segoe UI', sans-serif;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 2px solid #003366; padding-bottom: 20px;">
        <div class="logo-container" style="display: flex; align-items: center;">
          <svg class="logo" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 70px; height: 70px; margin-right: 15px;">
            <circle cx="50" cy="50" r="40" stroke="#003366" stroke-width="12"/>
            <path d="M50 10 A40 40 0 0 1 90 50" stroke="#F4B042" stroke-width="12" fill="none"/>
            <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#F4B042" font-weight="bold" font-size="22">BiAS</text>
          </svg>
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
            <td style="padding: 15px 0; width: 180px; color: #64748b; font-weight: bold;">Telah Diterima Dari</td>
            <td style="padding: 15px 0; width: 20px;">:</td>
            <td style="padding: 15px 0; font-weight: bold; font-size: 18px; border-bottom: 1px dashed #cbd5e1;">${custName}</td>
          </tr>
          <tr>
            <td style="padding: 15px 0; color: #64748b; font-weight: bold;">Uang Sejumlah</td>
            <td style="padding: 15px 0;">:</td>
            <td style="padding: 15px 0; font-weight: bold; font-size: 22px; color: #0f172a; border-bottom: 1px dashed #cbd5e1;">Rp ${amountStr}</td>
          </tr>
          <tr>
            <td style="padding: 15px 0; color: #64748b; font-weight: bold;">Untuk Pembayaran</td>
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

</script>

<template>
  <div>
    <PageHeader title="Sales" button-label="Add Sale" @add="openAdd" />
    
    <DataTable :columns="columns" :data="data" search-placeholder="Cari penjualan..." @edit="openEdit"
      @delete="openDelete">
      <template #cell-customer_id="{ value }">{{ customerName(value as any) }}</template>
      <template #cell-pic_name="{ row }">{{ picName(row.customer_id) }}</template>
      <template #cell-date="{ value }">{{ value ? new Date(value).toLocaleDateString('id-ID') : '-' }}</template>
      <template #cell-subtotal="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-service_charge="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-tax="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-total="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-status="{ value }">
        <span
          :class="(!value || value === 'pending') ? 'badge badge-warning' : value === 'approved' ? 'badge badge-success' : value === 'paid' ? 'badge badge-success' : 'badge badge-danger'">
          {{ (!value || value === 'pending') ? 'Pending' : value === 'approved' ? 'Approved' : value === 'paid' ? 'Paid'
            : 'Cancelled' }}
        </span>
      </template>
      <template #actions="{ row }">
        <button class="action-btn action-btn--view" title="Detail" @click="openView(row)" style="margin-right: 4px;">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
        <button v-if="row.status !== 'paid'" class="action-btn" title="Pembayaran" @click="openPayment(row)" style="margin-right: 4px; color: var(--color-success);">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="2" y1="10" x2="22" y2="10"></line>
          </svg>
        </button>
        <button v-if="row.status === 'paid'" class="action-btn" title="Print Bukti Bayar"
          @click="printReceipt(row)" style="margin-right: 4px; color: var(--color-success);">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
        </button>
        <button v-if="row.status === 'approved'" class="action-btn action-btn--print" title="Print Invoice"
          @click="printInvoice(row)" style="margin-right: 4px; color: var(--color-primary);">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
        </button>
        <button class="action-btn action-btn--edit" title="Edit" @click="openEdit(row)">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="action-btn action-btn--delete" title="Delete" @click="openDelete(row)" style="margin-left: 4px;">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Sale' : 'Add Sale'" @close="showModal = false"
      @submit="handleSubmit">
      <div class="form-group">
        <label for="sale-no" class="form-label">Sale No. (Otomatis)</label>
        <input id="sale-no" v-model="form.sale_no" type="text" class="form-input" disabled
          style="background: var(--color-surface-raised); cursor: not-allowed;">
      </div>
      <div class="form-group">
        <label for="sale-customer" class="form-label">Customer</label>
        <select id="sale-customer" v-model="form.customer_id" class="form-select">
          <option :value="null">-- Pilih Customer --</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ (c as any).company_name || (c as any).name }}{{ (c as any).pic_name ? ' - ' + (c as any).pic_name : '' }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="sale-date" class="form-label">Tanggal</label>
        <input id="sale-date" v-model="form.sale_date" type="date" class="form-input">
      </div>
      <div class="form-group">
        <label for="sale-po-no" class="form-label">PO No (Opsional)</label>
        <input id="sale-po-no" v-model="form.po_no" type="text" class="form-input" placeholder="Misal: PO-2024-001">
      </div>
      <div class="form-group">
        <label for="sale-status" class="form-label">Status</label>
        <select id="sale-status" v-model="form.status" class="form-select">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div class="form-section-title">Item Penjualan</div>
      <div v-for="(item, idx) in saleItems" :key="idx" class="sale-item-row">
        <div class="form-group sale-item-product">
          <select v-model="item.product_id" class="form-select" @change="onProductChange(idx)">
            <option :value="null">-- Produk --</option>
            <option v-for="p in products" :key="p.id" :value="p.id">{{ (p as any).name }}</option>
          </select>
        </div>
        <div class="form-group sale-item-qty">
          <input v-model.number="item.qty" type="number" class="form-input" min="1" placeholder="Qty">
        </div>
        <div class="form-group sale-item-price">
          <input v-model.number="item.unit_price" type="number" class="form-input" min="0" placeholder="Harga">
        </div>
        <button type="button" class="btn-remove-item" title="Hapus item" @click="removeSaleItem(idx)">✕</button>

        <div v-if="item.is_computer" style="grid-column: 1 / -1; margin-top: 1rem; border-top: 1px dashed var(--color-border-light); padding-top: 1rem;">
          <h4 style="margin-bottom: 0.75rem; font-weight: 600; font-size: 0.95rem; color: var(--color-primary);">Spesifikasi Komputer / PC</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem;">
            <div class="form-group">
              <label class="form-label" style="font-size: 0.8rem;">Processor (CPU)</label>
              <input v-model="item.specs.cpu" type="text" class="form-input" placeholder="Misal: Intel Core i5">
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size: 0.8rem;">RAM</label>
              <input v-model="item.specs.ram" type="text" class="form-input" placeholder="Misal: 16GB DDR4">
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size: 0.8rem;">VGA / GPU</label>
              <input v-model="item.specs.vga" type="text" class="form-input" placeholder="Misal: Intel UHD Graphics">
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem; margin-top: 0.75rem;">
            <div class="form-group">
              <label class="form-label" style="font-size: 0.8rem;">Storage Type</label>
              <select v-model="item.specs.storage_type" class="form-select">
                <option value="">Pilih</option>
                <option value="SSD">SSD</option>
                <option value="HDD">HDD</option>
                <option value="NVMe">NVMe</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size: 0.8rem;">Storage Capacity</label>
              <input v-model="item.specs.storage" type="text" class="form-input" placeholder="Misal: 512GB">
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size: 0.8rem;">Operating System (OS)</label>
              <input v-model="item.specs.os" type="text" class="form-input" placeholder="Misal: Windows 11 Pro">
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr; gap: 0.75rem; margin-top: 0.75rem;">
            <div class="form-group">
              <label class="form-label" style="font-size: 0.8rem;">Office Package</label>
              <input v-model="item.specs.office" type="text" class="form-input" placeholder="Misal: Microsoft Office 2021">
            </div>
          </div>
        </div>

        <div style="grid-column: 1 / -1; margin-top: 1rem; border-top: 1px dashed var(--color-border-light); padding-top: 1rem;">
          <div class="form-group">
            <label class="form-label" style="font-size: 0.8rem;">Deskripsi / Keterangan (Tampil di Invoice)</label>
            <textarea v-model="item.description" class="form-input" placeholder="Misal: Kondisi mulus, termasuk kabel power..." rows="2"></textarea>
          </div>
        </div>
      </div>
      <button type="button" class="btn btn-outline btn-sm" @click="addSaleItem" style="margin-top: 1rem;">+ Add Item</button>

      <div class="form-section-title" style="margin-top: 1.5rem;">Garansi & Layanan</div>
      <div class="form-group" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
        <input type="checkbox" id="has-warranty" v-model="form.has_warranty" style="width: 1.2rem; height: 1.2rem; accent-color: var(--color-primary);">
        <label for="has-warranty" class="form-label" style="margin: 0; cursor: pointer; font-weight: 600;">Termasuk Garansi?</label>
      </div>
      
      <div v-if="form.has_warranty" style="border: 1px solid var(--color-border); padding: 1rem; border-radius: var(--radius-md); background-color: var(--color-surface); margin-bottom: 1.5rem;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label class="form-label">Tipe Garansi</label>
            <select v-model="form.warranty.warranty_type" class="form-select">
              <option value="machine">Mesin (Machine)</option>
              <option value="sparepart">Suku Cadang (Sparepart)</option>
              <option value="service">Layanan (Service)</option>
            </select>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Durasi (Bulan)</label>
              <input v-model.number="form.warranty.duration_months" type="number" min="0" class="form-input">
            </div>
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Durasi (Hari)</label>
              <input v-model.number="form.warranty.duration_days" type="number" min="0" class="form-input">
            </div>
          </div>
        </div>
        <div class="form-group" style="margin-top: 0.75rem;">
          <label class="form-label">Syarat & Ketentuan Garansi</label>
          <textarea v-model="form.warranty.terms_conditions" class="form-input" rows="3" placeholder="Misal: Garansi void jika segel rusak, human error, atau terkena air..."></textarea>
        </div>
      </div>

      <div class="sale-summary">
        <div class="summary-row summary-total"><span>Total</span><span>{{ formatRupiah(calcTotal) }}</span></div>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Penjualan"
      :message="`Yakin ingin menghapus penjualan ID ${deletingItem?.id}?`" @close="showConfirm = false"
      @confirm="handleDelete" />

    <FormModal :open="showDetail" title="Detail Penjualan" @close="showDetail = false" @submit="showDetail = false">
      <template #default>
        <template v-if="viewingItem">
          <div style="margin-bottom: var(--space-md);">
            <div
              style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md); margin-bottom: var(--space-md);">
              <div>
                <p style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin: 0;">Kode Sales</p>
                <p style="font-weight: var(--font-weight-medium); margin: 4px 0 0 0;">{{ viewingItem.sale_no || '-' }}
                </p>
              </div>
              <div>
                <p style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin: 0;">Tanggal Transaksi
                </p>
                <p style="font-weight: var(--font-weight-medium); margin: 4px 0 0 0;">{{ (viewingItem.sale_date || (viewingItem as any).date) ? new
                  Date(viewingItem.sale_date || (viewingItem as any).date).toLocaleDateString('id-ID') : '-' }}</p>
              </div>
              <div>
                <p style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin: 0;">Customer</p>
                <p style="font-weight: var(--font-weight-medium); margin: 4px 0 0 0;">{{
                  customerName(viewingItem.customer_id) }}</p>
              </div>
              <div>
                <p style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin: 0;">PIC Name</p>
                <p style="font-weight: var(--font-weight-medium); margin: 4px 0 0 0;">{{
                  picName(viewingItem.customer_id) }}</p>
              </div>
              <div>
                <p style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin: 0;">PO No</p>
                <p style="font-weight: var(--font-weight-medium); margin: 4px 0 0 0;">{{ viewingItem.po_no || '-' }}</p>
              </div>
            </div>
          </div>

          <div class="form-section-title">Daftar Item Terjual</div>
          <div
            style="border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; margin-bottom: var(--space-md); flex-shrink: 0; min-height: 100px;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: var(--font-size-sm);">
              <thead style="background: var(--color-surface-raised); border-bottom: 1px solid var(--color-border);">
                <tr>
                  <th style="padding: 12px; font-weight: var(--font-weight-semibold);">Produk</th>
                  <th style="padding: 12px; font-weight: var(--font-weight-semibold); text-align: center;">Qty</th>
                  <th style="padding: 12px; font-weight: var(--font-weight-semibold); text-align: right;">Harga Satuan</th>
                  <th style="padding: 12px; font-weight: var(--font-weight-semibold); text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!viewingItem.sale_items || viewingItem.sale_items.length === 0">
                  <td colspan="4" style="padding: 16px; text-align: center; color: var(--color-text-muted);">Data item tidak tersedia</td>
                </tr>
                <tr v-for="(si, idx) in viewingItem.sale_items" :key="idx" style="border-bottom: 1px solid var(--color-border-light);">
                  <td style="padding: 12px;">{{ findProduct(si.product_id)?.name || 'Produk ID: ' + si.product_id }}</td>
                  <td style="padding: 12px; text-align: center;">{{ si.qty }}</td>
                  <td style="padding: 12px; text-align: right;">{{ formatRupiah(si.unit_price || (si as any).price || 0) }}</td>
                  <td style="padding: 12px; text-align: right;">{{ formatRupiah((si.unit_price || (si as any).price || 0) * (si.qty || 1)) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="viewingItem.has_warranty || (viewingItem.warranties && viewingItem.warranties.length > 0)">
            <div class="form-section-title">Detail Garansi</div>
            <div style="border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: var(--space-md); background-color: var(--color-surface-raised);">
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1.25rem;">
                <div>
                  <p style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin: 0 0 4px 0;">Tipe Garansi</p>
                  <p style="font-weight: var(--font-weight-medium); margin: 0; text-transform: capitalize;">
                    {{ viewingItem.warranties && viewingItem.warranties.length > 0 ? viewingItem.warranties[0].warranty_type : '-' }}
                  </p>
                </div>
                <div>
                  <p style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin: 0 0 4px 0;">Durasi</p>
                  <p style="font-weight: var(--font-weight-medium); margin: 0;">
                    <template v-if="viewingItem.warranties && viewingItem.warranties.length > 0">
                      {{ viewingItem.warranties[0].duration_months }} Bulan <span v-if="viewingItem.warranties[0].duration_days">{{ viewingItem.warranties[0].duration_days }} Hari</span>
                    </template>
                    <template v-else>-</template>
                  </p>
                </div>
                <div>
                  <p style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin: 0 0 4px 0;">Status</p>
                  <p style="font-weight: var(--font-weight-medium); margin: 0; text-transform: capitalize;">
                    <span v-if="viewingItem.warranties && viewingItem.warranties.length > 0" 
                          :style="{ 
                            display: 'inline-block', 
                            padding: '4px 10px', 
                            borderRadius: '12px', 
                            fontSize: '0.75rem', 
                            fontWeight: '600',
                            backgroundColor: viewingItem.warranties[0].status === 'active' ? '#e6f4ea' : '#fce8e6',
                            color: viewingItem.warranties[0].status === 'active' ? '#137333' : '#c5221f'
                          }">
                      {{ viewingItem.warranties[0].status === 'active' ? 'Aktif' : viewingItem.warranties[0].status }}
                    </span>
                    <span v-else>-</span>
                  </p>
                </div>
                
                <div>
                  <p style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin: 0 0 4px 0;">Berlaku Mulai</p>
                  <p style="font-weight: var(--font-weight-medium); margin: 0;">
                    {{ (viewingItem.warranties && viewingItem.warranties.length > 0 && viewingItem.warranties[0].start_date) ? String(viewingItem.warranties[0].start_date).substring(0, 10) : '-' }}
                  </p>
                </div>
                <div style="grid-column: span 2;">
                  <p style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin: 0 0 4px 0;">Berakhir Pada</p>
                  <p style="font-weight: var(--font-weight-medium); margin: 0;">
                    {{ (viewingItem.warranties && viewingItem.warranties.length > 0 && viewingItem.warranties[0].end_date) ? String(viewingItem.warranties[0].end_date).substring(0, 10) : '-' }}
                  </p>
                </div>

                <div style="grid-column: 1 / -1; margin-top: 0.5rem; padding-top: 1rem; border-top: 1px dashed var(--color-border-light);">
                  <p style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin: 0 0 8px 0;">Syarat & Ketentuan</p>
                  <div style="font-weight: var(--font-weight-medium); margin: 0; white-space: pre-line; background: var(--color-surface); padding: 12px; border-radius: 8px; border: 1px solid var(--color-border-light); font-size: 0.85rem; color: var(--color-text);">
                    {{ viewingItem.warranties && viewingItem.warranties.length > 0 && viewingItem.warranties[0].terms_conditions ? viewingItem.warranties[0].terms_conditions : 'Tidak ada syarat & ketentuan khusus.' }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="salePayments && salePayments.length > 0" style="margin-top: var(--space-lg);">
            <div class="form-section-title">Riwayat Pembayaran</div>
            <div style="border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; margin-bottom: var(--space-md);">
              <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: var(--font-size-sm);">
                <thead style="background: var(--color-surface-raised); border-bottom: 1px solid var(--color-border);">
                  <tr>
                    <th style="padding: 12px; font-weight: var(--font-weight-semibold);">Tgl Bayar</th>
                    <th style="padding: 12px; font-weight: var(--font-weight-semibold);">No Ref</th>
                    <th style="padding: 12px; font-weight: var(--font-weight-semibold);">Metode</th>
                    <th style="padding: 12px; font-weight: var(--font-weight-semibold); text-align: right;">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(pay, idx) in salePayments" :key="idx" style="border-bottom: 1px solid var(--color-border-light);">
                    <td style="padding: 12px;">{{ pay.payment_date ? String(pay.payment_date).substring(0, 10) : '-' }}</td>
                    <td style="padding: 12px;">{{ pay.reference_no || '-' }}</td>
                    <td style="padding: 12px;">{{ pay.bank_name || 'CASH' }}</td>
                    <td style="padding: 12px; text-align: right; font-weight: 600; color: var(--color-success);">{{ formatRupiah(pay.amount || 0) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="sale-summary" style="margin-top: var(--space-md);">
            <div class="summary-row"><span>Subtotal</span><span>{{ formatRupiah(viewingItem.subtotal || 0) }}</span>
            </div>
            <div class="summary-row"><span>Biaya Jasa</span><span>{{ formatRupiah(viewingItem.service_charge || 0)
                }}</span></div>
            <div class="summary-row"><span>Pajak (PPN)</span><span>{{ formatRupiah(viewingItem.tax || 0) }}</span></div>
            <div class="summary-row summary-total"><span>Grand Total</span><span>{{ formatRupiah(viewingItem.total || 0)
                }}</span></div>
          </div>

          <!-- Hide submit button for view only using CSS in modal -->
          <div style="display: flex; justify-content: flex-end; margin-top: var(--space-lg);">
            <button type="button" class="btn btn-outline" @click="showDetail = false">Tutup</button>
          </div>
        </template>
      </template>
      <template #footer>
        <span style="display:none;"></span>
      </template>
    </FormModal>
    <FormModal :open="showPaymentModal" title="Proses Pembayaran" @close="showPaymentModal = false" @submit="handlePayment">
      <div style="display: flex; flex-direction: column; gap: var(--space-md);">
        <div>
          <label class="form-label" style="display: block; margin-bottom: 4px; font-weight: var(--font-weight-medium);">Tanggal Pembayaran</label>
          <input type="date" class="form-input" v-model="paymentData.payment_date" style="width: 100%; padding: 8px; border: 1px solid var(--color-border); border-radius: 4px;" required />
        </div>
        <div>
          <label class="form-label" style="display: block; margin-bottom: 4px; font-weight: var(--font-weight-medium);">Metode Pembayaran</label>
          <select class="form-input" v-model="paymentData.method_type" style="width: 100%; padding: 8px; border: 1px solid var(--color-border); border-radius: 4px;">
            <option value="CASH">Tunai (Cash)</option>
            <option value="TRANSFER">Transfer Bank</option>
            <option value="CREDIT_CARD">Kartu Kredit / Debit</option>
          </select>
        </div>
        
        <template v-if="paymentData.method_type === 'TRANSFER'">
          <div>
            <label class="form-label" style="display: block; margin-bottom: 4px; font-weight: var(--font-weight-medium);">Nama Bank</label>
            <input type="text" class="form-input" v-model="paymentData.bank_name" placeholder="Misal: BCA, Mandiri, BRI" style="width: 100%; padding: 8px; border: 1px solid var(--color-border); border-radius: 4px;" required />
          </div>
          <div>
            <label class="form-label" style="display: block; margin-bottom: 4px; font-weight: var(--font-weight-medium);">Nomor Rekening</label>
            <input type="text" class="form-input" v-model="paymentData.account_number" placeholder="Nomor rekening pengirim" style="width: 100%; padding: 8px; border: 1px solid var(--color-border); border-radius: 4px;" required />
          </div>
          <div>
            <label class="form-label" style="display: block; margin-bottom: 4px; font-weight: var(--font-weight-medium);">Nama Pengirim (A/N)</label>
            <input type="text" class="form-input" v-model="paymentData.sender_name" placeholder="Nama pemilik rekening" style="width: 100%; padding: 8px; border: 1px solid var(--color-border); border-radius: 4px;" required />
          </div>
        </template>
        
        <template v-if="paymentData.method_type === 'CREDIT_CARD'">
          <div>
            <label class="form-label" style="display: block; margin-bottom: 4px; font-weight: var(--font-weight-medium);">Provider Kartu / Bank</label>
            <input type="text" class="form-input" v-model="paymentData.bank_name" placeholder="Misal: Visa, Mastercard, BCA" style="width: 100%; padding: 8px; border: 1px solid var(--color-border); border-radius: 4px;" required />
          </div>
          <div>
            <label class="form-label" style="display: block; margin-bottom: 4px; font-weight: var(--font-weight-medium);">Nomor Kartu (4 Digit Terakhir)</label>
            <input type="text" class="form-input" v-model="paymentData.account_number" placeholder="Misal: 1234" maxlength="16" style="width: 100%; padding: 8px; border: 1px solid var(--color-border); border-radius: 4px;" required />
          </div>
          <div>
            <label class="form-label" style="display: block; margin-bottom: 4px; font-weight: var(--font-weight-medium);">Nama Pemilik Kartu</label>
            <input type="text" class="form-input" v-model="paymentData.sender_name" placeholder="Nama yang tertera pada kartu" style="width: 100%; padding: 8px; border: 1px solid var(--color-border); border-radius: 4px;" required />
          </div>
        </template>
        <div>
          <label class="form-label" style="display: block; margin-bottom: 4px; font-weight: var(--font-weight-medium);">Jumlah Bayar</label>
          <input type="number" class="form-input" v-model="paymentData.amount" style="width: 100%; padding: 8px; border: 1px solid var(--color-border); border-radius: 4px;" required />
        </div>
        <div>
          <label class="form-label" style="display: block; margin-bottom: 4px; font-weight: var(--font-weight-medium);">No Referensi / Bukti (Opsional)</label>
          <input type="text" class="form-input" v-model="paymentData.reference_no" placeholder="Masukkan nomor referensi..." style="width: 100%; padding: 8px; border: 1px solid var(--color-border); border-radius: 4px;" />
        </div>
        <div>
          <label class="form-label" style="display: block; margin-bottom: 4px; font-weight: var(--font-weight-medium);">Catatan (Opsional)</label>
          <textarea class="form-input" v-model="paymentData.notes" rows="3" placeholder="Tambahkan catatan pembayaran..." style="width: 100%; padding: 8px; border: 1px solid var(--color-border); border-radius: 4px;"></textarea>
        </div>
      </div>
      <template #footer>
        <button class="btn btn-outline" @click="showPaymentModal = false">Batal</button>
        <button class="btn btn-accent" @click="handlePayment">Simpan Pembayaran</button>
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

.form-section-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
  padding-top: var(--space-sm);
  border-top: 1px solid var(--color-border-light);
}

.sale-item-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr auto;
  gap: var(--space-sm);
  align-items: end;
}

.btn-remove-item {
  width: 32px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  margin-bottom: 2px;
}

.btn-remove-item:hover {
  background: var(--color-danger-surface);
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
</style>
