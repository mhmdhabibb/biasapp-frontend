<script setup lang="ts">
// @ts-nocheck
import { ref, reactive, computed } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn, RentalInvoice } from '@/types'

const {
  rentalInvoices: data,
  contractItems,
  customers,
  findContractItem,
  findCustomer,
} = useMasterStore()

const columns: TableColumn[] = [
  { key: 'invoice_no', label: 'Invoice No' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'contract_item_id', label: 'Contract' },
  { key: 'period_start', label: 'Period Start' },
  { key: 'period_end', label: 'Period End' },
  { key: 'due_date', label: 'Due Date' },
  { key: 'total_pay', label: 'Total' },
  { key: 'status', label: 'Status' },
]

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<RentalInvoice | null>(null)
const deletingItem = ref<RentalInvoice | null>(null)

// Date Range & Month Filters
const startDateFilter = ref('')
const endDateFilter = ref('')
const monthFilter = ref('')

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

function exportMonthToExcel() {
  const items = filteredData.value
  if (items.length === 0) {
    alert('Tidak ada data rental invoice untuk diekspor!')
    return
  }

  let periodLabel = 'Semua_Periode'
  if (monthFilter.value) {
    periodLabel = monthFilter.value
  } else if (startDateFilter.value || endDateFilter.value) {
    periodLabel = `${startDateFilter.value || 'Awal'}_sd_${endDateFilter.value || 'Akhir'}`
  }

  let csvContent = '\uFEFF'
  csvContent += 'No;No. Invoice;Tanggal;Nama Customer;No. Kontrak;Biaya Sewa Pokok (Rp);Overusage Rate (Rp);Total Pay (Rp);Status\n'

  items.forEach((item: any, idx: number) => {
    const code = item.invoice_no || `INV-R-${item.id}`
    const dateVal = item.monthly_date ? String(item.monthly_date).slice(0, 10) : (item.period_start ? String(item.period_start).slice(0, 10) : '-')
    const cName = (customerName(item.customer_id) || '-').replace(/;/g, ',')
    const cNo = (contractNo(item.contract_item_id) || '-').replace(/;/g, ',')
    const baseFee = item.basis_rental_fee || 0
    const excessFee = item.excess_amount || 0
    const totalVal = item.total_pay || item.subtotal || 0
    const statusStr = (item.status || 'unpaid').toUpperCase()

    csvContent += `${idx + 1};"${code}";"${dateVal}";"${cName}";"${cNo}";${baseFee};${excessFee};${totalVal};"${statusStr}"\n`
  })

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `Laporan_Rental_Invoices_${periodLabel}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function exportMonthToPdf() {
  const items = filteredData.value
  if (items.length === 0) {
    alert('Tidak ada data rental invoice untuk diekspor ke PDF!')
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

  const totalRevenue = items.reduce((sum: number, item: any) => sum + (item.total_pay || item.subtotal || 0), 0)

  let rowsHtml = items.map((item: any, idx: number) => {
    const code = item.invoice_no || `INV-R-${item.id}`
    const dateVal = item.monthly_date ? new Date(item.monthly_date).toLocaleDateString('id-ID') : (item.period_start ? new Date(item.period_start).toLocaleDateString('id-ID') : '-')
    const cName = customerName(item.customer_id)
    const cNo = contractNo(item.contract_item_id)
    const totalStr = formatRupiah(item.total_pay || item.subtotal || 0)
    const statusStr = (item.status || 'unpaid').toUpperCase()

    return `
      <tr>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 8px;">${idx + 1}</td>
        <td style="border: 1px solid #cbd5e1; padding: 8px; font-weight: bold;">${code}</td>
        <td style="border: 1px solid #cbd5e1; padding: 8px;">${dateVal}</td>
        <td style="border: 1px solid #cbd5e1; padding: 8px; font-weight: bold;">${cName}</td>
        <td style="border: 1px solid #cbd5e1; padding: 8px;">${cNo}</td>
        <td style="text-align: right; border: 1px solid #cbd5e1; padding: 8px; font-weight: bold;">${totalStr}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 8px;"><span class="badge">${statusStr}</span></td>
      </tr>
    `
  }).join('')

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Laporan Rental Invoices - ${periodTitle}</title>
        <style>
          @page { size: A4 portrait; margin: 1.5cm; }
          body { font-family: Arial, sans-serif; font-size: 11pt; color: #333; margin: 0; padding: 20px; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #002b5e; padding-bottom: 12px; margin-bottom: 20px; }
          .header-title h1 { margin: 0; font-size: 18pt; color: #002b5e; font-weight: 900; }
          .header-title h2 { margin: 2px 0 0 0; font-size: 11pt; color: #666; font-style: italic; }
          .header-info { text-align: right; font-size: 9pt; color: #555; }
          .report-title { text-align: center; margin-bottom: 20px; }
          .report-title h3 { margin: 0; font-size: 14pt; color: #111; text-transform: uppercase; letter-spacing: 0.5px; }
          .report-title p { margin: 4px 0 0 0; font-size: 10.5pt; font-weight: bold; color: #004d99; }
          .summary-cards { display: flex; gap: 15px; margin-bottom: 20px; }
          .card-box { flex: 1; border: 1px solid #cbd5e1; background: #f8fafc; padding: 10px 15px; border-radius: 6px; }
          .card-box .label { font-size: 9pt; color: #64748b; font-weight: bold; text-transform: uppercase; }
          .card-box .val { font-size: 14pt; font-weight: bold; color: #0f172a; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
          th { background: #002b5e; color: white; border: 1px solid #002b5e; padding: 10px; font-size: 10pt; text-align: left; }
          th.right { text-align: right; }
          th.center { text-align: center; }
          .badge { background: #e2e8f0; padding: 3px 8px; border-radius: 4px; font-size: 8.5pt; font-weight: bold; color: #334155; }
          .footer-sig { display: flex; justify-content: space-between; margin-top: 40px; }
          .sig-box { text-align: center; width: 200px; font-size: 10pt; }
          .sig-space { height: 60px; }
          .sig-name { font-weight: bold; text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-title">
            <h1>PT. BIAS SURYA TEKNOLOGI</h1>
            <h2>Your Office Solution</h2>
          </div>
          <div class="header-info">
            Greenland Housing Blok E6 No.11<br>
            Batam Centre, Kepulauan Riau<br>
            Telepon: +62 811.704.5657
          </div>
        </div>
        <div class="report-title">
          <h3>Laporan Rekapitulasi Rental Invoices</h3>
          <p>Periode: ${periodTitle}</p>
        </div>
        <div class="summary-cards">
          <div class="card-box"><div class="label">Total Invoice</div><div class="val">${items.length} Dokumen</div></div>
          <div class="card-box"><div class="label">Total Tagihan</div><div class="val" style="color: #059669;">${formatRupiah(totalRevenue)}</div></div>
        </div>
        <table>
          <thead>
            <tr>
              <th class="center" style="width: 35px;">No</th>
              <th>No. Invoice</th>
              <th>Tanggal</th>
              <th>Customer</th>
              <th>Kontrak</th>
              <th class="right">Total Tagihan</th>
              <th class="center">Status</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="footer-sig">
          <div class="sig-box">Dibuat Oleh,<div class="sig-space"></div><div class="sig-name">Admin Finance</div></div>
          <div class="sig-box">Disetujui Oleh,<div class="sig-space"></div><div class="sig-name">Rosmalinda Hutagalung</div><i>Direktur</i></div>
        </div>
        <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); }<\/script>
      </body>
    </html>
  `
  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
  }
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
})

const defaultForm = { ...form }

function onContractChange() {
  const ci = findContractItem(form.contract_item_id)
  if (ci) {
    form.customer_id = ci.customer_id
    form.basis_rental_fee = ci.monthly_rent_fee
    recalculate()
  }
}

function recalculate() {
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
  })
  showModal.value = true
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

function printInvoice(item: any) {
  const customer = findCustomer(item.customer_id)
  const custName = customer?.company_name || customer?.name || '-'
  const custAddress = customer?.address || '-'
  const pic = customer?.pic_name || '-'
  const gender = customer?.pic_gender
  let prefix = 'Bapak/Ibu '
  if (gender === 'L') prefix = 'Bapak '
  if (gender === 'P') prefix = 'Ibu '
  const picDisplay = pic !== '-' ? prefix + pic : 'Finance'
  const dateStr = item.monthly_date ? new Date(item.monthly_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' }) : '-'
  
  let periodStr = '-'
  if (item.period_start) {
    const pDate = new Date(item.period_start)
    periodStr = pDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  }
  
  const basisFee = (item.basis_rental_fee || 0).toLocaleString('id-ID')
  const excessFee = (item.excess_amount || 0).toLocaleString('id-ID')
  const total = (item.subtotal || (item.basis_rental_fee + item.excess_amount) || 0).toLocaleString('id-ID')
  const tax = (item.tax || 0).toLocaleString('id-ID')
  const totalPay = (item.total_pay || 0).toLocaleString('id-ID')

  const html = `
    <html>
      <head>
        <title>Invoice - ${item.invoice_no || 'Rental'}</title>
        <style>
          @media print {
            @page { margin: 10mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11px; margin: 0; padding: 20px; }
          .inv-container { max-width: 800px; margin: 0 auto; }
          
          .header-wrap { display: flex; justify-content: space-between; margin-bottom: 5px; }
          
          .left-box { width: 45%; border: 2px solid #3399ff; padding: 5px; box-sizing: border-box; }
          .left-box .title { color: #3399ff; font-size: 18px; font-weight: bold; margin-bottom: 5px; }
          .left-box .address { font-weight: bold; font-size: 11px; line-height: 1.4; border-bottom: 2px solid #3399ff; padding-bottom: 5px; margin-bottom: 5px; }
          
          .right-box { width: 48%; }
          .right-table { width: 100%; border-collapse: collapse; font-weight: bold; font-size: 11px; }
          .right-table td, .right-table th { border: 2px solid #3399ff; padding: 4px; }
          .right-table .bg-label { text-align: center; width: 80px; }
          
          .invoice-title { text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 2px; margin: 10px 0; }
          .period-text { font-weight: bold; font-style: italic; margin-bottom: 5px; font-size: 11px; }
          
          .main-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
          .main-table th, .main-table td { border: 2px solid #3399ff; padding: 4px; vertical-align: top; font-weight: bold; }
          .main-table th { text-align: center; }
          .main-table .no-col { width: 30px; text-align: center; }
          .main-table .rp-col { width: 25px; border-right: none; }
          .main-table .val-col { border-left: none; text-align: right; width: 100px; }
          
          .desc-content { padding: 5px; }
          .desc-content .motor-grid { display: grid; grid-template-columns: 1fr 100px 30px; line-height: 1.3; font-weight: normal; margin-top: 5px; }
          
          .total-row td { border: 2px solid #3399ff; font-weight: bold; padding: 4px; }
          .total-label { text-align: right; padding-right: 10px; }
          
          .bottom-wrap { display: flex; justify-content: space-between; margin-top: 5px; }
          .bank-box { width: 45%; border: 2px solid #3399ff; padding: 5px; font-size: 10px; font-weight: bold; line-height: 1.4; }
          .signature-area { width: 50%; display: flex; justify-content: space-between; text-align: center; font-weight: bold; font-size: 11px; padding-top: 10px; }
          .sig-col { width: 45%; display: flex; flex-direction: column; justify-content: space-between; align-items: center; }
          .sig-line { width: 100%; border-bottom: 1px solid #000; margin-top: 50px; }
        </style>
      </head>
      <body>
        <div class="inv-container">
          <div class="header-wrap">
            <div class="left-box">
              <div class="title">PT. BIAS SURYA TEKNOLOGI</div>
              <div class="address">
                Greenland Housing Blok E6 No. 11<br>
                Batam Kota - Batam - Kepulauan Riau
              </div>
              <div class="address" style="border-bottom:none;">
                Telp : +62 811 7045 657<br><br>
                Email : admin@biasbst.com<br><br>
                www.biasbst.com
              </div>
            </div>
            <div class="right-box">
              <table class="right-table">
                <tr>
                  <td class="bg-label">Inv No. :</td>
                  <td>${item.invoice_no || '-'}</td>
                </tr>
                <tr>
                  <td class="bg-label">Date :</td>
                  <td>${dateStr}</td>
                </tr>
                <tr>
                  <td colspan="2" style="text-align: center;">Kepada Yth.</td>
                </tr>
                <tr>
                  <td colspan="2">${custName}</td>
                </tr>
                <tr>
                  <td colspan="2" style="font-weight: normal; height: 40px; vertical-align: top;">
                    ${custAddress}
                  </td>
                </tr>
                <tr>
                  <td class="bg-label">Up</td>
                  <td>${picDisplay}</td>
                </tr>
              </table>
            </div>
          </div>
          
          <div class="invoice-title">INVOICE</div>
          <div class="period-text">Periode : ${periodStr}</div>
          
          <table class="main-table">
            <thead>
              <tr>
                <th class="no-col">No</th>
                <th>Description</th>
                <th colspan="2">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="no-col">1</td>
                <td>
                  <div class="desc-content">
                    Rental Charges Mesin Fotocopy<br>
                    <br>
                    B/W A4<br>
                    <div class="motor-grid">
                      <div>Start Meter Reading</div><div>###</div><div></div>
                      <div>Last Meter Reading</div><div>###</div><div>(-)</div>
                      <div>Total Copies</div><div>###</div><div></div>
                      <div>Free Copies</div><div>###</div><div>(-)</div>
                      <div>Total Copies</div><div>###</div><div></div>
                    </div>
                    <br>
                    Colour A4<br>
                    <div class="motor-grid">
                      <div>Start Meter Reading</div><div>###</div><div></div>
                      <div>Last Meter Reading</div><div>###</div><div>(-)</div>
                      <div>Total Copies</div><div>###</div><div></div>
                      <div>Free Copies</div><div>###</div><div>(-)</div>
                      <div>Total Copies</div><div>###</div><div></div>
                    </div>
                  </div>
                </td>
                <td class="rp-col">Rp</td>
                <td class="val-col">${basisFee}</td>
              </tr>
              <tr>
                <td class="no-col">2</td>
                <td>
                  <div style="display: flex; justify-content: space-between;">
                    <span>Copies Charges</span>
                    <span>(x) Rp ###</span>
                  </div>
                </td>
                <td class="rp-col">Rp</td>
                <td class="val-col">${excessFee}</td>
              </tr>
              <tr class="total-row">
                <td colspan="2" class="total-label">TOTAL</td>
                <td class="rp-col">Rp</td>
                <td class="val-col">${total}</td>
              </tr>
              <tr class="total-row">
                <td colspan="2" class="total-label">TAX</td>
                <td class="rp-col">Rp</td>
                <td class="val-col">${tax}</td>
              </tr>
              <tr class="total-row">
                <td colspan="2" class="total-label">TOTAL PAY</td>
                <td class="rp-col">Rp</td>
                <td class="val-col">${totalPay}</td>
              </tr>
            </tbody>
          </table>
          
          <div class="bottom-wrap">
            <div class="bank-box">
              Pembayaran Transfer ke rekening:<br>
              <div style="text-align: center; margin: 4px 0;">PT. BIAS SURYA TEKNOLOGI<br>NPWP : 94.183.950.8.225.000</div>
              BANK RIAU KEPRI SYARIAH CAB. BATAM<br>
              Rek No. 1060885757<br>
              BANK MANDIRI CABANG BATAM<br>
              Rek No. 109-00-3388575-7
            </div>
            
            <div class="signature-area">
              <div class="sig-col">
                Received By,
                <div class="sig-line"></div>
              </div>
              <div class="sig-col">
                PT. BIAS SURYA TEKNOLOGI
                <div class="sig-line" style="margin-top: 30px;">Grace Hutapea</div>
                <div style="font-weight: normal; font-style: italic;">Admin Finance</div>
              </div>
            </div>
          </div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(() => { window.print(); }, 500);
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
</script>

<template>
  <div>
    <PageHeader title="Monitoring Invoice" button-label="Add Invoice" @add="openAdd" />
    
    <!-- Filter & Export Toolbar -->
    <div class="filter-toolbar">
      <div class="filter-inputs">
        <div class="filter-item">
          <label class="filter-label">Tanggal Awal</label>
          <input v-model="startDateFilter" type="date" class="form-input filter-input">
        </div>
        <div class="filter-item">
          <label class="filter-label">Tanggal Akhir</label>
          <input v-model="endDateFilter" type="date" class="form-input filter-input">
        </div>
        <div class="filter-item">
          <label class="filter-label">Filter Bulan</label>
          <input v-model="monthFilter" type="month" class="form-input filter-input" @change="onMonthFilterChange">
        </div>
        <button v-if="startDateFilter || endDateFilter || monthFilter" type="button" class="btn btn-outline btn-sm filter-reset-btn" @click="resetFilters">
          Reset Filter
        </button>
      </div>

      <div class="export-actions">
        <button type="button" class="btn btn-export-pdf" @click="exportMonthToPdf" title="Export Invoices (PDF)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
          Export PDF
        </button>
        <button type="button" class="btn btn-export-excel" @click="exportMonthToExcel" title="Export Invoices (Excel)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line></svg>
          Export Excel
        </button>
      </div>
    </div>

    <DataTable :columns="columns" :data="filteredData" search-placeholder="Search invoices..." @edit="openEdit" @delete="openDelete">
      <template #cell-customer_id="{ value }">{{ customerName(value as any) }}</template>
      <template #cell-contract_item_id="{ value }">{{ contractNo(value as any) }}</template>
      <template #cell-total_pay="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-status="{ value }">
        <span :class="value === 'paid' ? 'badge badge-success' : value === 'overdue' ? 'badge badge-danger' : 'badge badge-warning'">
          {{ value === 'paid' ? 'Paid' : value === 'overdue' ? 'Overdue' : 'Unpaid' }}
        </span>
      </template>
      <template #actions="{ row }">
        <button class="action-btn action-btn--print" title="Print Invoice" @click="printInvoice(row)" style="margin-right: 4px; color: var(--color-primary);">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
        </button>
        <button class="action-btn action-btn--edit" title="Edit" @click="openEdit(row)">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="action-btn action-btn--delete" title="Delete" @click="openDelete(row)" style="margin-left: 4px;">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Invoice' : 'Add Invoice'" @close="showModal = false" @submit="handleSubmit">
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
          <input id="ri-basis" v-model.number="form.basis_rental_fee" type="number" class="form-input" min="0" @input="recalculate">
        </div>
        <div class="form-group">
          <label for="ri-excess" class="form-label">Excess Amount (Rp)</label>
          <input id="ri-excess" v-model.number="form.excess_amount" type="number" class="form-input" min="0" @input="recalculate">
        </div>
      </div>
      <div class="form-group">
        <label for="ri-tax" class="form-label">Tax (Rp)</label>
        <input id="ri-tax" v-model.number="form.tax" type="number" class="form-input" min="0" @input="recalculate">
      </div>
      <div class="sale-summary">
        <div class="summary-row"><span>Subtotal</span><span>{{ formatRupiah(form.subtotal) }}</span></div>
        <div class="summary-row summary-total"><span>Total Pay</span><span>{{ formatRupiah(form.total_pay) }}</span></div>
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
    <ConfirmDialog :open="showConfirm" title="Delete Invoice" :message="`Are you sure you want to delete invoice '${deletingItem?.invoice_no}'?`" @close="showConfirm = false" @confirm="handleDelete" />
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
