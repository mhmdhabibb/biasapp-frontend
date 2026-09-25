<script setup lang="ts">
// @ts-nocheck
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import SignaturePad from '@/components/ui/SignaturePad.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn, ServiceReport } from '@/types'

const {
  serviceReports: data,
  contractItems,
  customers,
  technicians,
  findContractItem,
  findCustomer,
  findTechnician,
} = useMasterStore()

const columns: TableColumn[] = [
  { key: 'service_report_no', label: 'No. Laporan' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'contract_item_id', label: 'Kontrak' },
  { key: 'service_type', label: 'Tipe Servis' },
  { key: 'technician_id', label: 'Teknisi' },
  { key: 'visit_date', label: 'Tanggal Kunjungan' },
  { key: 'status', label: 'Status' },
]

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<ServiceReport | null>(null)
const deletingItem = ref<ServiceReport | null>(null)
const form = reactive({
  report_no: '',
  service_type: 'corrective',
  customer_id: null as string | null,
  unit_id: null as string | null,
  technician_id: null as string | null,
  project_name: '',
  reading_period: '',
  service_date: '',
  time_in: '',
  time_out: '',
  machine_problem: '',
  repair_action: '',
  remarks: '',
  is_tested: false,
  is_completed: false,
  customer_signature: '',
  technician_signature: '',
  status: 'open',
  next_sparepart: '',
  spareparts: [] as any[],
  meter_reading_before: 0,
  meter_reading_after: 0
})

const defaultForm = { ...form }

function openAdd() {
  editingItem.value = null
  Object.assign(form, { ...defaultForm, report_no: `SR-${Date.now().toString().slice(-6)}` })
  showModal.value = true
}

function openEdit(item: any) {
  editingItem.value = item
  Object.assign(form, {
    report_no: item.report_no,
    service_type: item.service_type,
    customer_id: item.customer_id,
    unit_id: item.unit_id,
    technician_id: item.technician_id,
    project_name: item.project_name,
    reading_period: item.reading_period ? item.reading_period.slice(0,10) : '',
    service_date: item.service_date ? item.service_date.slice(0,10) : '',
    time_in: item.time_in,
    time_out: item.time_out,
    machine_problem: item.machine_problem,
    repair_action: item.repair_action,
    remarks: item.remarks,
    is_tested: item.is_tested,
    is_completed: item.is_completed,
    customer_signature: item.customer_signature || '',
    technician_signature: item.technician_signature || '',
    status: item.status,
    next_sparepart: item.next_sparepart || '',
    spareparts: item.spareparts ? JSON.parse(JSON.stringify(item.spareparts)) : [],
    meter_reading_before: item.meter_reading_before || 0,
    meter_reading_after: item.meter_reading_after || 0
  })
  showModal.value = true
}

function handleSubmit() {
  if (!form.service_report_no.trim()) return
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx]!, ...form, updated_at: new Date().toISOString() }
  } else {
    data.value.push({ id: Date.now(), ...form, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })
  }
  showModal.value = false
}

function openDelete(item: ServiceReport) { deletingItem.value = item; showConfirm.value = true }
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

function technicianName(id: any): string {
  const t = findTechnician(id)
  return t ? t.name : '-'
}

function printReport(item: any) {
  const customer = findCustomer(item.customer_id) || {}
  const u = useMasterStore().units.find((u: any) => u.id === item.unit_id) || {}
  const brand = useMasterStore().brands.find((b: any) => b.id === u.brand_id)
  const tech = findTechnician(item.technician_id) || {}
  
  const custName = customer.company_name || customer.name || '-'
  const custPhone = customer.phone || '-'
  const picName = customer.pic_name || '-'
  const custAddress = customer.address || '-'
  
  const dateStr = item.service_date ? new Date(item.service_date).toLocaleDateString('id-ID') : '-'
  
  // Find Contract if any
  const contract = findContractItem(item.contract_item_id)
  const isContract = contract ? contract.contract_no.includes('KNT') : false // Simplified check or based on category
  
  // Copier Layout vs Computer Layout
  const isCopier = !u.is_computer
  
  let html = ''
  
  if (isCopier) {
    html = `
    <html>
      <head>
        <title>Copier Service Report - \${item.report_no || item.service_report_no || ''}</title>
        <style>
          @media print {
            @page { margin: 10mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 10px; color: #000; }
          .container { max-width: 800px; margin: 0 auto; border: 2px solid #000; box-sizing: border-box; }
          
          .header-table { width: 100%; border-collapse: collapse; }
          .header-table td { padding: 10px; }
          .logo-col { width: 100px; vertical-align: middle; border-bottom: 2px solid #000; }
          .info-col { text-align: right; vertical-align: middle; border-bottom: 2px solid #000; }
          
          .logo { width: 70px; height: 70px; }
          .company-name { font-size: 20px; font-weight: bold; color: #3399ff; margin: 0; }
          .tagline { font-size: 14px; font-style: italic; font-weight: bold; margin: 0; }
          .address { font-size: 9px; font-weight: bold; margin-top: 5px; }
          
          .title-bar { background-color: #000; color: #fff; text-align: center; font-size: 18px; font-weight: bold; padding: 5px; }
          
          .grid-table { width: 100%; border-collapse: collapse; font-weight: bold; text-transform: uppercase; font-size: 10px; }
          .grid-table td { border: 1px solid #000; padding: 3px 6px; }
          
          .bg-black { background-color: #000; color: #fff; text-align: center; }
          .text-center { text-align: center; }
          
        </style>
      </head>
      <body>
        <div class="container">
          <table class="header-table">
            <tr>
              <td class="logo-col">
                <svg class="logo" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="50" cy="50" r="40" stroke="#003366" stroke-width="12"/>
                  <path d="M50 10 A40 40 0 0 1 90 50" stroke="#F4B042" stroke-width="12" fill="none"/>
                  <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#F4B042" font-weight="bold" font-size="22">BiAS</text>
                </svg>
              </td>
              <td class="info-col">
                <div class="company-name">PT. BIAS SURYA TEKNOLOGI</div>
                <div class="tagline">The shape of smart</div>
                <div class="address">
                  Ruko Purimas Blok A No.47 Kota Batam, Kepulauan Riau - Indonesia<br>
                  Phone: +62811 704 5657  Email: admin@biasbst.com<br>
                  Website: www.biassuryateknologi.com
                </div>
              </td>
            </tr>
          </table>
          
          <div class="title-bar">COPIER SERVICE REPORT</div>
          
          <table class="grid-table">
            <tr>
              <td colspan="2" class="text-center" style="width: 60%;">SERVICE REPORT</td>
              <td colspan="2">DATE : \${dateStr}</td>
            </tr>
            <tr>
              <td style="width: 25%;" class="bg-black">COMPANY NAME :</td>
              <td style="width: 35%;">\${custName}</td>
              <td colspan="2" class="text-center">COSTUMER TYPE</td>
            </tr>
            <tr>
              <td rowspan="2" class="bg-black">ADDRESS :</td>
              <td rowspan="2">\${custAddress}</td>
              <td style="width: 20%; text-align: right;">CONTRACT</td>
              <td style="width: 20%; text-align: center;">\${contract ? '✓' : ''}</td>
            </tr>
            <tr>
              <td style="text-align: right;">RENTAL</td>
              <td style="text-align: center;">\${!contract ? '✓' : ''}</td>
            </tr>
            <tr>
              <td class="bg-black">TELP &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:</td>
              <td>\${custPhone}</td>
              <td style="text-align: right;">SALES</td>
              <td style="text-align: center;"></td>
            </tr>
            <tr>
              <td class="bg-black">PRODUCT/TYPE</td>
              <td class="bg-black">SERIAL NUMBER</td>
              <td colspan="2" rowspan="11" style="vertical-align: top;">
                <div class="text-center" style="border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 3px;">REMARKS</div>
                <div style="font-weight: normal;">\${item.remarks || ''}</div>
              </td>
            </tr>
            <tr>
              <td class="text-center">\${u.model || '-'}</td>
              <td class="text-center">\${u.serial_number || '-'}</td>
            </tr>
            <tr>
              <td colspan="2" class="bg-black">METER READING</td>
            </tr>
            <tr>
              <td class="text-center">BEFORE</td>
              <td class="text-center">AFTER</td>
            </tr>
            <tr>
              <td class="text-center">\${item.meter_reading_before || ''}</td>
              <td class="text-center">\${item.meter_reading_after || ''}</td>
            </tr>
            <tr>
              <td colspan="2" class="bg-black">CHANGE SPAREPART</td>
            </tr>
            <tr>
              <td colspan="2" style="height: 60px; vertical-align: top; font-weight: normal;">
                \${
                    (item.spareparts || []).map((sp, i) => {
                      const p = useMasterStore().products.find(x => x.id === sp.product_id)
                      return '<div>' + (i+1) + '. ' + (p ? p.name : '') + ' (' + sp.qty + ')</div>'
                    }).join('')
                }
              </td>
            </tr>
            <tr>
              <td colspan="2" class="bg-black">MACHINE PROBLEM</td>
            </tr>
            <tr>
              <td colspan="2" style="height: 60px; vertical-align: top; font-weight: normal;">\${item.machine_problem || ''}</td>
            </tr>
            <tr>
              <td colspan="2" style="height: 40px; vertical-align: top; font-weight: normal;">\${item.repair_action || ''}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding: 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="width: 40%; border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px;">Tested</td>
                    <td style="border-bottom: 1px solid #000; padding: 2px;">: \${item.is_tested ? 'YES' : 'NO'}</td>
                  </tr>
                  <tr>
                    <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px;">Complete</td>
                    <td style="border-bottom: 1px solid #000; padding: 2px;">: \${item.is_completed ? 'YES' : 'NO'}</td>
                  </tr>
                  <tr>
                    <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px;">Time in</td>
                    <td style="border-bottom: 1px solid #000; padding: 2px;">: \${item.time_in || ''}</td>
                  </tr>
                  <tr>
                    <td style="border-right: 1px solid #000; padding: 2px;">Time Out</td>
                    <td style="padding: 2px;">: \${item.time_out || ''}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          
          <table class="grid-table" style="border-top: none;">
            <tr>
              <td style="width: 50%; text-align: center; border-top: none;">
                TESTED YES / NO<br><br><br>
                \${item.technician_signature ? '<img src="' + item.technician_signature + '" style="max-height: 50px;" />' : '<br><br>'}
              </td>
              <td style="width: 50%; text-align: center; border-top: none;">
                COMPLETE YES / NO<br><br><br>
                \${item.customer_signature ? '<img src="' + item.customer_signature + '" style="max-height: 50px;" />' : '<br><br>'}
              </td>
            </tr>
            <tr>
              <td style="text-align: center;">TECHNISI<br>\${tech.name || ''}</td>
              <td style="padding: 0; vertical-align: bottom;">
                <div style="text-align: center; margin-bottom: 2px;">COSTUMER</div>
                <div class="bg-black" style="font-size: 9px; padding: 2px;">Signature & Company Stamp</div>
              </td>
            </tr>
          </table>
          
        </div>
        \x3Cscript>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 500);
          }
        \x3C/script>
      </body>
    </html>
    `
  } else {
    html = `
    <html>
      <head>
        <title>Technical Report - \${item.report_no || item.service_report_no || ''}</title>
        <style>
          @media print {
            @page { margin: 10mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 10px; color: #000; }
          .container { max-width: 800px; margin: 0 auto; border: 2px solid #000; box-sizing: border-box; }
          
          .header-table { width: 100%; border-collapse: collapse; }
          .header-table td { padding: 10px; }
          .logo-col { width: 100px; vertical-align: middle; border-bottom: 2px solid #000; }
          .info-col { text-align: right; vertical-align: middle; border-bottom: 2px solid #000; }
          
          .logo { width: 70px; height: 70px; }
          .company-name { font-size: 20px; font-weight: bold; color: #3399ff; margin: 0; }
          .tagline { font-size: 14px; font-style: italic; font-weight: bold; margin: 0; }
          .address { font-size: 9px; font-weight: bold; margin-top: 5px; }
          
          .title-bar { background-color: #000; color: #fff; text-align: center; font-size: 22px; font-weight: bold; padding: 5px; }
          
          .meta-table { width: 100%; border-collapse: collapse; font-weight: bold; }
          .meta-table td { border-bottom: 2px solid #000; padding: 5px; width: 50%; }
          .meta-table .right-col { border-left: 2px solid #000; }
          
          .section-title { background-color: #2b579a; color: #fff; text-align: center; font-size: 14px; font-weight: bold; padding: 4px; border-bottom: 2px solid #000; }
          
          .data-table { width: 100%; border-collapse: collapse; font-weight: bold; font-size: 11px; }
          .data-table td { border-bottom: 1px solid #000; padding: 5px 8px; vertical-align: top; }
          .data-table tr:last-child td { border-bottom: 2px solid #000; }
          .data-table .label-col { width: 30%; border-right: 1px solid #000; }
          .data-table .val-col { width: 70%; }
          
          .components-grid { display: grid; grid-template-columns: 1fr 1fr; }
          .comp-item { padding: 2px 0; border-bottom: 1px dotted #999; margin-right: 10px; }
          
          .bottom-table { width: 100%; border-collapse: collapse; font-weight: bold; font-size: 11px; }
          .bottom-table td { padding: 4px 8px; border-bottom: 1px solid #000; }
          
          .signatures { display: flex; justify-content: space-between; padding: 10px 20px; font-weight: bold; text-align: center; margin-top: 20px; }
          .sig-box { width: 200px; display: flex; flex-direction: column; justify-content: space-between; align-items: center; }
          .sig-line { width: 100%; border-bottom: 1px solid #000; margin-top: 60px; padding-bottom: 5px; }
          .sig-box.right { background-color: #000; color: #fff; padding: 2px 5px; margin-top: 60px; width: auto; font-size: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <table class="header-table">
            <tr>
              <td class="logo-col">
                <svg class="logo" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="50" cy="50" r="40" stroke="#003366" stroke-width="12"/>
                  <path d="M50 10 A40 40 0 0 1 90 50" stroke="#F4B042" stroke-width="12" fill="none"/>
                  <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#F4B042" font-weight="bold" font-size="22">BiAS</text>
                </svg>
              </td>
              <td class="info-col">
                <div class="company-name">PT. BIAS SURYA TEKNOLOGI</div>
                <div class="tagline">The shape of smart</div>
                <div class="address">
                  Ruko Purimas Blok A No.47 Kota Batam, Kepulauan Riau - Indonesia<br>
                  Phone: +62811 704 5657  Email: admin@biasbst.com<br>
                  Website: www.biassuryateknologi.com
                </div>
              </td>
            </tr>
          </table>
          
          <div class="title-bar">Technical Report Form</div>
          
          <table class="meta-table">
            <tr>
              <td>PRODUCT TYPES : \${u.is_computer ? 'Komputer/Desktop' : 'Fotocopy'}</td>
              <td class="right-col">DATE : \${dateStr}</td>
            </tr>
          </table>
          
          <div class="section-title">CUSTOMER DETAIL</div>
          <table class="data-table">
            <tr><td class="label-col">Company Name</td><td class="val-col">: \${custName}</td></tr>
            <tr><td class="label-col">Customer Type</td><td class="val-col">: \${customer.category || '-'}</td></tr>
            <tr><td class="label-col">Project Name</td><td class="val-col">: \${item.project_name || '-'}</td></tr>
            <tr><td class="label-col">Address</td><td class="val-col">: \${customer.address || '-'}</td></tr>
            <tr><td class="label-col">Telepon / Handphone</td><td class="val-col">: \${custPhone}</td></tr>
            <tr><td class="label-col">Personnel Incharges</td><td class="val-col">: \${picName}</td></tr>
          </table>
          
          <div class="section-title">PRODUCT DETAIL</div>
          <table class="data-table">
            <tr><td class="label-col">Brand</td><td class="val-col">: \${brand?.name || '-'}</td></tr>
            <tr><td class="label-col">Model/Type</td><td class="val-col">: \${u.model || '-'}</td></tr>
            <tr><td class="label-col">Serial Number</td><td class="val-col">: \${u.serial_number || '-'}</td></tr>
            <tr><td class="label-col" style="height: 50px;">Problem</td><td class="val-col">: \${item.machine_problem || '-'}</td></tr>
            <tr><td class="label-col" style="height: 50px;">Repair Action</td><td class="val-col">: \${item.repair_action || '-'}</td></tr>
            <tr>
              <td class="label-col">Component Replacement</td>
              <td class="val-col">
                <div class="components-grid">
                  \${
                    Array.from({length: 8}).map((_, i) => {
                      const sp = (item.spareparts || [])[i]
                      if (sp) {
                        const p = useMasterStore().products.find(x => x.id === sp.product_id)
                        return '<div class="comp-item">' + (i+1) + '. ' + (p ? p.name : '') + ' (' + sp.qty + ')</div>'
                      }
                      return '<div class="comp-item">' + (i+1) + '. </div>'
                    }).join('')
                  }
                </div>
              </td>
            </tr>
            <tr>
              <td class="label-col">Service Result</td>
              <td class="val-col">: \${item.status === 'in_progress' ? 'Continue' : item.status === 'completed' ? 'Done (Test OK)' : item.status}
                \${item.status === 'in_progress' && item.next_sparepart ? '<br>&nbsp;&nbsp;Next Sparepart: ' + item.next_sparepart : ''}
              </td>
            </tr>
            <tr><td class="label-col" style="height: 40px;">Remarks</td><td class="val-col">: \${item.remarks || '-'}</td></tr>
          </table>
          
          <table class="bottom-table">
            <tr>
              <td style="width: 50%; border-right: 2px solid #000;">
                <div style="margin-bottom: 20px;">TESTED YES / NO</div>
              </td>
              <td>
                <div style="display: flex;">
                  <div style="width: 80px;">Tested</div><div>: \${item.is_tested ? 'YES' : 'NO'}</div>
                </div>
                <div style="display: flex;">
                  <div style="width: 80px;">Complete</div><div>: \${item.is_completed ? 'YES' : 'NO'}</div>
                </div>
                <div style="display: flex;">
                  <div style="width: 80px;">Time in</div><div>: \${item.time_in || '-'}</div>
                </div>
                <div style="display: flex;">
                  <div style="width: 80px;">Time Out</div><div>: \${item.time_out || '-'}</div>
                </div>
              </td>
            </tr>
          </table>
          
          <div style="display: flex; justify-content: space-between; padding: 5px 20px 20px; font-weight: bold; border-top: 2px solid #000;">
            <div style="width: 45%; text-align: center;">
              <div>TECHNISI</div>
              <div style="margin-top: 20px; min-height: 50px; border-bottom: 1px solid #000;">
                \${item.technician_signature ? '<img src="' + item.technician_signature + '" style="max-height: 50px;" />' : '<br><br><br>'}
              </div>
              <div style="margin-top: 5px;">\${tech.name || ''}</div>
            </div>
            <div style="width: 45%; text-align: center; display: flex; flex-direction: column; justify-content: flex-end;">
              <div style="border-bottom: 1px solid #000; padding-bottom: 5px; min-height: 50px;">
                COSTUMER<br>
                \${item.customer_signature ? '<img src="' + item.customer_signature + '" style="max-height: 50px;" />' : ''}
              </div>
              <div style="background-color: #000; color: #fff; padding: 4px; font-size: 10px;">Signature & Company Stamp</div>
            </div>
          </div>
        </div>
        \x3Cscript>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 500);
          }
        \x3C/script>
      </body>
    </html>
    `
  }
  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
  }
}
</script>

<template>
  <div>
    <PageHeader title="Service Reports" button-label="Add Service Report" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari laporan servis..." @edit="openEdit" @delete="openDelete">
      <template #cell-customer_id="{ value }">{{ customerName(value as any) }}</template>
      <template #cell-contract_item_id="{ value }">{{ contractNo(value as any) }}</template>
      <template #cell-technician_id="{ value }">{{ technicianName(value) }}</template>
      <template #cell-status="{ value }">
        <span :class="value === 'open' ? 'badge badge-warning' : value === 'in_progress' ? 'badge badge-info' : value === 'completed' ? 'badge badge-success' : 'badge badge-neutral'">
          {{ value === 'open' ? 'Open' : value === 'in_progress' ? 'Proses' : value === 'completed' ? 'Selesai' : value || '-' }}
        </span>
      </template>
      <template #actions="{ row }">
        <button class="action-btn" title="Print Laporan" @click="printReport(row)" style="color: var(--color-primary); border-color: transparent;">
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
        <button class="action-btn action-btn--delete" title="Delete" @click="openDelete(row)">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Service Report' : 'Add Service Report'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="sr-no" class="form-label">Report No.</label>
        <input id="sr-no" v-model="form.report_no" type="text" class="form-input" placeholder="SR-XXXXXX">
      </div>
      <div class="form-group">
        <label for="sr-customer" class="form-label">Customer</label>
        <select id="sr-customer" v-model="form.customer_id" class="form-select">
          <option :value="null">-- Select Customer --</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ (c as any).company_name || (c as any).name }}</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Unit / Machine</label>
        <select v-model="form.unit_id" class="form-select">
          <option :value="null">-- Select Unit --</option>
          <option v-for="u in (useMasterStore().units as any)" :key="u.id" :value="u.id">{{ u.model }} (SN: {{ u.serial_number }})</option>
        </select>
      </div>
      <div class="form-group">
        <label for="sr-type" class="form-label">Service Type</label>
        <select id="sr-type" v-model="form.service_type" class="form-select">
          <option value="corrective">Corrective</option>
          <option value="preventive">Preventive</option>
          <option value="installation">Installation</option>
          <option value="relocation">Relocation</option>
        </select>
      </div>
      <div class="form-group">
        <label for="sr-tech" class="form-label">Technician</label>
        <select id="sr-tech" v-model="form.technician_id" class="form-select">
          <option :value="null">-- Select Technician --</option>
          <option v-for="t in technicians" :key="t.id" :value="t.id">{{ (t as any).name }}</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Project Name</label>
        <input v-model="form.project_name" type="text" class="form-input">
      </div>
      <div class="form-group">
        <label class="form-label">Reading Period</label>
        <input v-model="form.reading_period" type="date" class="form-input">
      </div>
      <div class="form-group">
        <label for="sr-visit" class="form-label">Service Date</label>
        <input id="sr-visit" v-model="form.service_date" type="date" class="form-input">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="sr-timein" class="form-label">Time In</label>
          <input id="sr-timein" v-model="form.time_in" type="time" class="form-input">
        </div>
        <div class="form-group">
          <label for="sr-timeout" class="form-label">Time Out</label>
          <input id="sr-timeout" v-model="form.time_out" type="time" class="form-input">
        </div>
      </div>
      <div class="form-group">
        <label for="sr-problem" class="form-label">Machine Problem</label>
        <textarea id="sr-problem" v-model="form.machine_problem" class="form-textarea" placeholder="Problem description"></textarea>
      </div>
      <div class="form-group">
        <label for="sr-action" class="form-label">Repair Action</label>
        <textarea id="sr-action" v-model="form.repair_action" class="form-textarea" placeholder="Action description"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Remarks</label>
        <textarea v-model="form.remarks" class="form-textarea"></textarea>
      </div>
      <div class="form-group">
        <label for="sr-status" class="form-label">Status</label>
        <select id="sr-status" v-model="form.status" class="form-select">
          <option value="open">Open</option>
          <option value="in_progress">Continue (In Progress)</option>
          <option value="completed">Done (Test OK)</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Meter Reading Before</label>
          <input type="number" v-model="form.meter_reading_before" class="form-input">
        </div>
        <div class="form-group">
          <label class="form-label">Meter Reading After</label>
          <input type="number" v-model="form.meter_reading_after" class="form-input">
        </div>
      </div>
      <div class="form-group" v-if="form.status === 'in_progress' || true">
        <label class="form-label">Change Sparepart / Component Replacement</label>
        <div v-for="(sp, idx) in form.spareparts" :key="idx" style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
          <select v-model="sp.product_id" class="form-select" style="flex: 1;">
            <option value="" disabled>Pilih Produk (Sparepart)...</option>
            <option v-for="p in useMasterStore().products" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <input type="number" v-model="sp.qty" class="form-input" style="width: 80px;" min="1" placeholder="Qty">
          <button type="button" class="btn btn-sm btn-outline" @click="form.spareparts.splice(idx, 1)">Hapus</button>
        </div>
        <button type="button" class="btn btn-sm btn-outline mt-2" @click="form.spareparts.push({product_id: '', qty: 1})">+ Tambah Sparepart</button>
      </div>
      
      <!-- Tested and Completed Action Buttons -->
      <div class="form-row" style="margin-top: 15px; margin-bottom: 15px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
        <div class="form-group">
          <label class="form-label">Tested</label>
          <div style="display: flex; align-items: center; gap: 10px;">
            <button type="button" class="btn btn-outline" :class="{'btn-primary': form.is_tested}" @click="form.is_tested = true">
              <svg v-if="form.is_tested" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Tandai Tested
            </button>
            <span v-if="form.is_tested" class="text-success" style="font-weight: bold;">YES</span>
            <span v-else class="text-neutral">NO</span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Completed</label>
          <div style="display: flex; align-items: center; gap: 10px;">
            <button type="button" class="btn btn-outline" :class="{'btn-primary': form.is_completed}" @click="form.is_completed = true">
              <svg v-if="form.is_completed" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Tandai Completed
            </button>
            <span v-if="form.is_completed" class="text-success" style="font-weight: bold;">YES</span>
            <span v-else class="text-neutral">NO</span>
          </div>
        </div>
      </div>
      <div class="form-group form-check-group">
        <label class="form-check-label">
          <input v-model="form.is_tested" type="checkbox" class="form-checkbox"> Is Tested?
        </label>
      </div>
      <div class="form-group form-check-group">
        <label class="form-check-label">
          <input v-model="form.is_completed" type="checkbox" class="form-checkbox"> Is Completed?
        </label>
      </div>

      <div class="form-row mt-3">
        <div class="form-group">
          <label class="form-label">Tanda Tangan Teknisi</label>
          <SignaturePad v-model="form.technician_signature" height="150px" />
        </div>
        <div class="form-group">
          <label class="form-label">Tanda Tangan Customer</label>
          <SignaturePad v-model="form.customer_signature" height="150px" />
        </div>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Laporan Servis" :message="`Yakin ingin menghapus laporan '${deletingItem?.report_no || (deletingItem as any)?.service_report_no}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-base);
}
.form-check-group {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.form-check-label {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-size-sm);
  cursor: pointer;
}
.form-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--color-primary);
}
.mt-3 {
  margin-top: 1rem;
}
</style>
