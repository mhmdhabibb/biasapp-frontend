<script setup lang="ts">
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn } from '@/types'

const { deliveryOrders, findCustomer, findTechnician } = useMasterStore()

const columns: TableColumn[] = [
  { key: 'delivery_no', label: 'Delivery No' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'contract_item_id', label: 'Contract Ref' },
  { key: 'assigned_to', label: 'Assigned Technician' },
  { key: 'delivery_date', label: 'Delivery Date' },
  { key: 'status', label: 'Status' },
]

function getCustomer(id: number | null) {
  const c = findCustomer(id as any)
  return c ? c.company_name || c.name || '-' : '-'
}

function getTechnician(id: number | null) {
  const t = findTechnician(id)
  return t ? t.name : '-'
}

function printServiceHistory(item: any) {
  // item is DeliveryOrder
  const customer = findCustomer(item.customer_id) || {}
  const ci = useMasterStore().findContractItem(item.contract_item_id)
  const u = ci ? useMasterStore().findUnit(ci.unit_id) || {} : {}
  const brand = useMasterStore().brands.find((b: any) => b.id === u.brand_id)
  const tech = findTechnician(item.assigned_to) || {}
  
  const custName = customer.company_name || customer.name || '-'
  const custPhone = customer.phone || '-'
  const picName = customer.pic_name || '-'
  const dateStr = item.delivery_date ? new Date(item.delivery_date).toLocaleDateString('id-ID') : '-'
  
  const html = `
    <html>
      <head>
        <title>Service History - \${item.delivery_no || ''}</title>
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
          .meta-table td { border-bottom: 2px solid #000; padding: 5px; }
          
          .section-title { background-color: #2b579a; color: #fff; text-align: center; font-size: 14px; font-weight: bold; padding: 4px; border-bottom: 2px solid #000; }
          
          .data-table { width: 100%; border-collapse: collapse; font-weight: bold; font-size: 11px; }
          .data-table td { border-bottom: 1px solid #000; padding: 5px 8px; vertical-align: top; }
          .data-table tr:last-child td { border-bottom: 2px solid #000; }
          .data-table .label-col { width: 30%; border-right: 1px solid #000; }
          .data-table .val-col { width: 70%; }
          
          .bottom-table { width: 100%; border-collapse: collapse; font-weight: bold; font-size: 11px; }
          .bottom-table td { padding: 4px 8px; border-bottom: 1px solid #000; }
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
          
          <div class="title-bar">SERVICE HISTORY</div>
          
          <table class="meta-table">
            <tr>
              <td style="width: 30%; border-right: 1px solid #000;">Date in</td>
              <td>: \${dateStr}</td>
            </tr>
          </table>
          
          <div class="section-title">CUSTOMER DETAIL</div>
          <table class="data-table">
            <tr><td class="label-col">Company Name</td><td class="val-col">: \${custName}</td></tr>
            <tr><td class="label-col">Customer Type</td><td class="val-col">: \${customer.category || '-'}</td></tr>
            <tr><td class="label-col">Project Name</td><td class="val-col">: \${item.project_name || '-'}</td></tr>
            <tr><td class="label-col">Address</td><td class="val-col">: \${customer.address || '-'}</td></tr>
            <tr><td class="label-col">Installation Address</td><td class="val-col">: \${item.delivery_address || '-'}</td></tr>
            <tr><td class="label-col">Telepon</td><td class="val-col">: \${custPhone}</td></tr>
            <tr><td class="label-col">Personal Incharges</td><td class="val-col">: \${picName}</td></tr>
          </table>
          
          <div class="section-title">PRODUCT DETAIL</div>
          <table class="data-table">
            <tr><td class="label-col">Brand</td><td class="val-col">: \${brand?.name || '-'}</td></tr>
            <tr><td class="label-col">Product Types</td><td class="val-col">: \${u.is_computer ? 'Komputer/Desktop' : 'Fotocopy'}</td></tr>
            <tr><td class="label-col">Model/Type</td><td class="val-col">: \${u.model || '-'}</td></tr>
            <tr><td class="label-col">Serial Number</td><td class="val-col">: \${u.serial_number || '-'}</td></tr>
            <tr><td class="label-col" style="height: 50px;">Problem</td><td class="val-col">: \${item.problem || ''}</td></tr>
            <tr><td class="label-col" style="height: 50px;">Remarks</td><td class="val-col">: \${item.notes || ''}</td></tr>
          </table>
          
          <table class="bottom-table">
            <tr>
              <td style="width: 30%;">
                
              </td>
              <td>
                <div style="display: flex;">
                  <div style="width: 80px; border-right: 1px solid #000; padding: 2px;">Tested</div><div style="padding: 2px;">: \${item.is_tested ? 'YES' : 'NO'}</div>
                </div>
                <div style="display: flex; border-top: 1px solid #000;">
                  <div style="width: 80px; border-right: 1px solid #000; padding: 2px;">Comple</div><div style="padding: 2px;">: \${item.is_completed ? 'YES' : 'NO'}</div>
                </div>
                <div style="display: flex; border-top: 1px solid #000;">
                  <div style="width: 80px; border-right: 1px solid #000; padding: 2px;">Time in</div><div style="padding: 2px;">: \${item.time_in || ''}</div>
                </div>
                <div style="display: flex; border-top: 1px solid #000;">
                  <div style="width: 80px; border-right: 1px solid #000; padding: 2px;">Time Out</div><div style="padding: 2px;">: \${item.time_out || ''}</div>
                </div>
              </td>
            </tr>
          </table>
          
          <div style="display: flex; justify-content: space-between; padding: 5px 20px 20px; font-weight: bold; border-top: 2px solid #000;">
            <div style="width: 45%; text-align: center;">
              <div>TESTED \${item.is_tested ? 'YES' : 'NO'}</div>
              <div style="margin-top: 10px; text-align: left;">TECHNISI</div>
              <div style="min-height: 50px; border-bottom: 1px solid #000; text-align: center;">
                \${item.technician_signature ? '<img src="' + item.technician_signature + '" style="max-height: 50px;" />' : ''}
              </div>
              <div style="margin-top: 5px;">\${tech.name || ''}</div>
            </div>
            <div style="width: 45%; text-align: center; display: flex; flex-direction: column; justify-content: flex-end;">
              <div style="margin-bottom: 10px;">COMPLETE \${item.is_completed ? 'YES' : 'NO'}</div>
              <div style="border-bottom: 1px solid #000; padding-bottom: 5px; min-height: 50px;">
                COSTUMER<br>
                \${item.customer_signature ? '<img src="' + item.customer_signature + '" style="max-height: 50px;" />' : ''}
              </div>
              <div style="background-color: #000; color: #fff; padding: 4px; font-size: 10px;">Signature & Company Stamp</div>
            </div>
          </div>
        </div>
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

import { ref, reactive } from 'vue'
import FormModal from '@/components/ui/FormModal.vue'
import SignaturePad from '@/components/ui/SignaturePad.vue'
import { useResourcesStore } from '@/stores/resources'
const resources = useResourcesStore()

const showModal = ref(false)
const editingItem = ref<any>(null)
const form = reactive({
  problem: '',
  notes: '',
  is_tested: false,
  is_completed: false,
  time_in: '',
  time_out: '',
  customer_signature: '',
  technician_signature: ''
})

function openEdit(item: any) {
  editingItem.value = item
  Object.assign(form, {
    problem: item.problem || '',
    notes: item.notes || '',
    is_tested: !!item.is_tested,
    is_completed: !!item.is_completed,
    time_in: item.time_in || '',
    time_out: item.time_out || '',
    customer_signature: item.customer_signature || '',
    technician_signature: item.technician_signature || ''
  })
  showModal.value = true
}

async function handleSubmit() {
  try {
    if (editingItem.value) {
      await resources.deliveryOrders.update(String(editingItem.value.id), form)
      const store = useMasterStore()
      await store.syncFromApi(true)
    }
    showModal.value = false
  } catch (err) {
    console.error(err)
    alert('Failed to update')
  }
}
</script>

<template>
  <div>
    <PageHeader title="Delivery & Installation Monitoring" />
    <DataTable :columns="columns" :data="deliveryOrders" search-placeholder="Search delivery...">
      <template #cell-customer_id="{ value }">{{ getCustomer(value) }}</template>
      <template #cell-assigned_to="{ value }">{{ getTechnician(value) }}</template>
      <template #cell-status="{ value }">
        <span class="badge" :class="value === 'delivered' ? 'badge-success' : value === 'in_transit' ? 'badge-info' : 'badge-warning'">
          {{ value.toUpperCase().replace('_', ' ') }}
        </span>
      </template>
      <template #cell-delivery_date="{ value }">
        {{ value ? new Date(value).toLocaleDateString() : '-' }}
      </template>
      <template #actions="{ row }">
        <button class="btn btn-sm btn-outline" @click="openEdit(row)">Edit Report</button>
        <button class="btn btn-sm btn-outline" style="margin-left: 0.5rem;" @click="printServiceHistory(row)">Print Service History</button>
      </template>
    </DataTable>

    <FormModal :open="showModal" title="Edit Service Report (Delivery)" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label class="form-label">Problem</label>
        <textarea v-model="form.problem" class="form-textarea" placeholder="Describe the problem..."></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Remarks</label>
        <textarea v-model="form.notes" class="form-textarea" placeholder="Remarks / Actions taken..."></textarea>
      </div>
      <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
        <div class="form-group">
          <label class="form-label">Time In</label>
          <input v-model="form.time_in" type="time" class="form-input">
        </div>
        <div class="form-group">
          <label class="form-label">Time Out</label>
          <input v-model="form.time_out" type="time" class="form-input">
        </div>
      </div>
      <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem;">
        <label style="display: flex; align-items: center; gap: 0.5rem;">
          <input type="checkbox" v-model="form.is_tested"> Is Tested?
        </label>
        <label style="display: flex; align-items: center; gap: 0.5rem;">
          <input type="checkbox" v-model="form.is_completed"> Is Completed?
        </label>
      </div>
      
      <div style="display: flex; gap: 1rem; margin-top: 1rem;">
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Tanda Tangan Teknisi</label>
          <SignaturePad v-model="form.technician_signature" height="150px" />
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Tanda Tangan Customer</label>
          <SignaturePad v-model="form.customer_signature" height="150px" />
        </div>
      </div>
    </FormModal>
  </div>
</template>
