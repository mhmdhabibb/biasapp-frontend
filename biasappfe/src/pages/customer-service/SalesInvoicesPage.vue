<script setup lang="ts">
// @ts-nocheck
import { ref, reactive, computed } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn, SalesInvoice } from '@/types'

const {
  salesInvoices: data,
  sales,
  customers,
  products,
  findCustomer,
  findSale,
  findProduct,
} = useMasterStore()

const columns: TableColumn[] = [
  { key: 'invoice_no', label: 'No. Invoice' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'sale_id', label: 'Ref. Penjualan' },
  { key: 'due_date', label: 'Jatuh Tempo' },
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'total', label: 'Total' },
  { key: 'status', label: 'Status' },
]

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
  total: 0,
  status: 'unpaid',
})

const defaultForm = { ...form }

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
  alert('Export PDF akan segera tersedia (contoh fungsi)')
}

function exportMonthToExcel() {
  alert('Export Excel akan segera tersedia (contoh fungsi)')
}

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
  alert('Export PDF akan segera tersedia (contoh fungsi)')
}

function exportMonthToExcel() {
  alert('Export Excel akan segera tersedia (contoh fungsi)')
}

const calcTotal = computed(() => form.subtotal + form.service_charge + form.tax)

function onSaleChange() {
  const s = findSale(form.sale_id)
  if (s) {
    form.customer_id = s.customer_id
    form.subtotal = s.subtotal
    form.service_charge = s.service_charge
    form.tax = s.tax
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
    total: item.total,
    status: item.status,
  })
  showModal.value = true
}

function handleSubmit() {
  if (!form.invoice_no.trim()) return
  form.total = calcTotal.value
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx]!, ...form, updated_at: new Date().toISOString() }
  } else {
    data.value.push({ id: Date.now(), ...form, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })
  }
  showModal.value = false
}

function openDelete(item: SalesInvoice) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}

function customerName(id: any): string {
  const c = findCustomer(id as any)
  return c ? c.company_name || c.name || '-' : '-'
}

function saleRef(id: any): string {
  return id ? `SALE-${id}` : '-'
}

function formatRupiah(val: number): string {
  return 'Rp ' + val.toLocaleString('id-ID')
}

function printInvoice(item: any) {
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
  
  const invoiceNo = item.invoice_no || '-'
  const invoiceDate = item.created_at || item.due_date
  
  const dateStr = invoiceDate ? new Date(invoiceDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'

  let itemsHtml = ''
  const sale = findSale(item.sale_id)
  if (sale && sale.sale_items && sale.sale_items.length > 0) {
    itemsHtml = sale.sale_items.map((si: any, idx: number) => {
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
        </style>
      </head>
      <body>
        <div class="container">
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
                  ${item.sale?.po_no || item.po_no ? `
                  <tr>
                    <td class="label">PO NO.:</td>
                    <td>${item.sale?.po_no || item.po_no}</td>
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
    <PageHeader title="Sales Invoices" button-label="Add Sales Invoice" @add="openAdd" />

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

    <DataTable :columns="columns" :data="filteredData" search-placeholder="Cari invoice penjualan..." @edit="openEdit" @delete="openDelete">
      <template #cell-customer_id="{ value }">{{ customerName(value as any) }}</template>
      <template #cell-sale_id="{ value }">{{ saleRef(value) }}</template>
      <template #cell-subtotal="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-total="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-status="{ value }">
        <span :class="value === 'paid' ? 'badge badge-success' : value === 'overdue' ? 'badge badge-danger' : 'badge badge-warning'">
          {{ value === 'paid' ? 'Lunas' : value === 'overdue' ? 'Lewat Jatuh Tempo' : 'Belum Bayar' }}
        </span>
      </template>
      <template #actions="{ row }">
        <button class="action-btn action-btn--print" title="Print Invoice" @click="printInvoice(row)">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9V2h12v7"></path>
            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
        </button>
        <button class="action-btn action-btn--edit" title="Edit" @click="openEdit(row)" style="margin-left: 4px;">
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
    <FormModal :open="showModal" :title="editingItem ? 'Edit Sales Invoice' : 'Add Sales Invoice'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="si-no" class="form-label">No. Invoice</label>
        <input id="si-no" v-model="form.invoice_no" type="text" class="form-input" placeholder="INV-S-XXXXXX">
      </div>
      <div class="form-group">
        <label for="si-sale" class="form-label">Referensi Penjualan</label>
        <select id="si-sale" v-model="form.sale_id" class="form-select" @change="onSaleChange">
          <option :value="null">-- Pilih Penjualan --</option>
          <option v-for="s in sales" :key="s.id" :value="s.id">SALE-{{ s.id }} — {{ formatRupiah(s.total) }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="si-customer" class="form-label">Customer</label>
        <select id="si-customer" v-model="form.customer_id" class="form-select">
          <option :value="null">-- Pilih Customer --</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.company_name || c.name || '-' }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="si-due" class="form-label">Jatuh Tempo</label>
        <input id="si-due" v-model="form.due_date" type="date" class="form-input">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="si-subtotal" class="form-label">Subtotal (Rp)</label>
          <input id="si-subtotal" v-model.number="form.subtotal" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="si-svc" class="form-label">Biaya Jasa (Rp)</label>
          <input id="si-svc" v-model.number="form.service_charge" type="number" class="form-input" min="0">
        </div>
      </div>
      <div class="form-group">
        <label for="si-tax" class="form-label">Pajak (Rp)</label>
        <input id="si-tax" v-model.number="form.tax" type="number" class="form-input" min="0">
      </div>
      <div class="sale-summary">
        <div class="summary-row summary-total"><span>Total</span><span>{{ formatRupiah(calcTotal) }}</span></div>
      </div>
      <div class="form-group">
        <label for="si-status" class="form-label">Status</label>
        <select id="si-status" v-model="form.status" class="form-select">
          <option value="unpaid">Belum Bayar</option>
          <option value="paid">Lunas</option>
          <option value="overdue">Lewat Jatuh Tempo</option>
        </select>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Invoice Penjualan" :message="`Yakin ingin menghapus invoice '${deletingItem?.invoice_no}'?`" @close="showConfirm = false" @confirm="handleDelete" />
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
</style>
