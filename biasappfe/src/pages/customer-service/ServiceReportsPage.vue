<script setup lang="ts">
// @ts-nocheck
import { ref, reactive, computed } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import SignaturePad from '@/components/ui/SignaturePad.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { hasDeliveryHistory, printDeliveryServiceHistory } from '@/utils/printDeliveryHistory'
import type { TableColumn, ServiceReport } from '@/types'

const { can } = usePermission()

const {
  serviceReports: data,
  deliveryOrders,
  contractItems,
  customers,
  technicians,
  findContractItem,
  findCustomer,
  findTechnician,
} = useMasterStore()

// Tab: laporan service (dari service request) vs service history delivery (dari DO).
const activeTab = ref<'service' | 'delivery'>('service')

const doColumns: TableColumn[] = [
  { key: 'do_number', label: 'DO No.' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'do_type', label: 'Type' },
  { key: 'technician_id', label: 'Technician' },
  { key: 'delivery_date', label: 'Delivery Date' },
  { key: 'status', label: 'Status' },
]

const deliveryHistories = computed(() =>
  (deliveryOrders.value as any[]).filter(
    (d: any) =>
      hasDeliveryHistory(d) &&
      String(d.do_type || '').toLowerCase() !== 'inbound',
  ),
)

function doTypeLabel(type: string | undefined): string {
  switch (String(type || '').toLowerCase()) {
    case 'inbound': return 'Sparepart'
    case 'sale': return 'Sales'
    case 'service': return 'Service'
    case 'replacement': return 'Replacement'
    case 'return': return 'Return'
    default: return 'Rental'
  }
}

function printDO(item: any) {
  printDeliveryServiceHistory(item)
}

const columns: TableColumn[] = [
  { key: 'report_no', label: 'Report No.' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'service_type', label: 'Service Type' },
  { key: 'technician_id', label: 'Technician' },
  { key: 'service_date', label: 'Visit Date' },
  { key: 'status', label: 'Status' },
]

// Copier report punya list tersendiri (CopierReportsPage) — disembunyikan
// dari list Service Reports.
const serviceOnlyReports = computed(() =>
  ((data as any)?.value || data as any[]).filter(
    (item: any) => !isCopierReport(item),
  ),
)

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
  if (!form.report_no.trim() && !form.service_report_no?.trim()) return
  
  const finalForm = { ...form, service_report_no: form.report_no }
  
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx]!, ...finalForm, updated_at: new Date().toISOString() }
  } else {
    const newId = Date.now()
    data.value.push({ id: newId, ...finalForm, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })
    
    // Auto-generate Sparepart Requests for accounting/procurement
    if (form.spareparts && form.spareparts.length > 0) {
      form.spareparts.forEach((sp: any, i: number) => {
        if (sp.product_id && sp.qty > 0) {
          useMasterStore().sparepartRequests.value.push({
            id: Date.now() + i,
            request_no: `SPR-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`,
            service_report_id: newId,
            product_id: sp.product_id,
            qty: sp.qty,
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        }
      })
    }
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
  const t: any = findTechnician(id)
  return t ? t.user?.name || t.name || '-' : '-'
}

import { printServiceReport, printMultipleServiceReports, type ReportType } from '@/utils/printReport'
import { isCopierReport } from '@/utils/copierReport'

const printModalOpen = ref(false)
const printType = ref<ReportType>('technical')
const printTarget = ref<any | null>(null)

function openPrintModal(item: any = null) {
  printTarget.value = item
  printType.value = 'technical'
  printModalOpen.value = true
}

function handleConfirmPrint() {
  if (printTarget.value) {
    printServiceReport(printTarget.value, printType.value)
  } else {
    printMultipleServiceReports(serviceOnlyReports.value, printType.value)
  }
  printModalOpen.value = false
}

function exportToExcel() {
  const rows = [['Report No.', 'Customer', 'Contract', 'Service Type', 'Technician', 'Visit Date', 'Status']]
  for (const item of serviceOnlyReports.value) {
    rows.push([
      item.report_no || item.service_report_no || '-',
      customerName(item.customer_id),
      contractNo(item.contract_item_id),
      item.service_type || '-',
      technicianName(item.technician_id),
      item.service_date ? new Date(item.service_date).toLocaleDateString('en-GB') : '-',
      item.status || '-'
    ])
  }
  const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
  const encodedUri = encodeURI(csvContent)
  const link = document.createElement('a')
  link.setAttribute('href', encodedUri)
  link.setAttribute('download', 'Data_Service_Reports.csv')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function printTable() {
  openPrintModal(null)
}
</script>

<template>
  <div>
    <PageHeader title="Service Reports" button-label="Add Service Report" permission="service_report:create" @add="openAdd">
      <template #actions>
        <button v-if="activeTab === 'service'" class="btn btn-outline" @click="exportToExcel">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Export Excel
        </button>
        <button v-if="activeTab === 'service'" class="btn btn-outline" @click="openPrintModal(null)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          Print / PDF
        </button>
      </template>
    </PageHeader>
    <div style="display: flex; gap: 8px; margin-bottom: 12px;">
      <button class="btn btn-sm" :class="activeTab === 'service' ? 'btn-primary' : 'btn-outline'" @click="activeTab = 'service'">
        Service Reports ({{ serviceOnlyReports.length }})
      </button>
      <button class="btn btn-sm" :class="activeTab === 'delivery' ? 'btn-primary' : 'btn-outline'" @click="activeTab = 'delivery'">
        Delivery History ({{ deliveryHistories.length }})
      </button>
    </div>
    <DataTable v-if="activeTab === 'service'" :columns="columns" :data="serviceOnlyReports" search-placeholder="Search service reports..." @edit="openEdit" @delete="openDelete">
      <template #cell-customer_id="{ value }">{{ customerName(value as any) }}</template>
      <template #cell-contract_item_id="{ value }">{{ contractNo(value as any) }}</template>
      <template #cell-technician_id="{ value }">{{ technicianName(value) }}</template>
      <template #cell-service_date="{ value }">{{ value ? new Date(value).toLocaleDateString('en-GB') : '-' }}</template>
      <template #cell-status="{ value }">
        <span :class="value === 'open' ? 'badge badge-warning' : value === 'in_progress' ? 'badge badge-info' : value === 'completed' ? 'badge badge-success' : 'badge badge-neutral'">
          {{ value === 'open' ? 'Open' : value === 'in_progress' ? 'In Progress' : value === 'completed' ? 'Completed' : value || '-' }}
        </span>
      </template>
      <template #actions="{ row }">
        <button v-if="can('service_report:read')" class="action-btn" title="Quick Look Form" @click="$router.push(`/shared/service-reports/${row.id}`)" style="color: var(--color-primary); border-color: transparent;">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
        <button v-if="can('service_report:read')" class="action-btn" title="Print Report" @click="openPrintModal(row)" style="color: var(--color-primary); border-color: transparent;">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
        </button>
        <button v-if="can('service_report:update')" class="action-btn action-btn--edit" title="Edit" @click="openEdit(row)">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button v-if="can('service_report:delete')" class="action-btn action-btn--delete" title="Delete" @click="openDelete(row)">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </template>
    </DataTable>
    <DataTable v-if="activeTab === 'delivery'" :columns="doColumns" :data="deliveryHistories" search-placeholder="Search delivery history...">
      <template #cell-customer_id="{ value }">{{ customerName(value as any) }}</template>
      <template #cell-do_type="{ value }">{{ doTypeLabel(value) }}</template>
      <template #cell-technician_id="{ value }">{{ technicianName(value) }}</template>
      <template #cell-delivery_date="{ value }">{{ value ? new Date(value).toLocaleDateString('en-GB') : '-' }}</template>
      <template #cell-status="{ value }">
        <span :class="value === 'delivered' ? 'badge badge-success' : value === 'in_transit' ? 'badge badge-info' : 'badge badge-neutral'">
          {{ String(value || '-').replace('_', ' ') }}
        </span>
      </template>
      <template #actions="{ row }">
        <button v-if="can('delivery_order:read')" class="action-btn" title="Print Service History" @click="printDO(row)" style="color: var(--color-primary); border-color: transparent;">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
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
            <option value="" disabled>Select Product (Sparepart)...</option>
            <option v-for="p in useMasterStore().products" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <input type="number" v-model="sp.qty" class="form-input" style="width: 80px;" min="1" placeholder="Qty">
          <button type="button" class="btn btn-sm btn-outline" @click="form.spareparts.splice(idx, 1)">Delete</button>
        </div>
        <button type="button" class="btn btn-sm btn-outline mt-2" @click="form.spareparts.push({product_id: '', qty: 1})">+ Add Sparepart</button>
      </div>
      
      <!-- Tested and Completed Action Buttons -->
      <div class="form-row" style="margin-top: 15px; margin-bottom: 15px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
        <div class="form-group">
          <label class="form-label">Tested</label>
          <div style="display: flex; align-items: center; gap: 10px;">
            <button type="button" class="btn btn-outline" :class="{'btn-primary': form.is_tested}" @click="form.is_tested = true">
              <svg v-if="form.is_tested" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Mark as Tested
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
              Mark as Completed
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
          <label class="form-label">Technician Signature</label>
          <SignaturePad v-model="form.technician_signature" height="150px" />
        </div>
        <div class="form-group">
          <label class="form-label">Customer Signature</label>
          <SignaturePad v-model="form.customer_signature" height="150px" />
        </div>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Service Report" :message="`Are you sure you want to delete report '${deletingItem?.report_no || (deletingItem as any)?.service_report_no}'?`" @close="showConfirm = false" @confirm="handleDelete" />

    <!-- Print Modal -->
    <FormModal :open="printModalOpen" title="Select Report Type" @close="printModalOpen = false" @submit="handleConfirmPrint">
      <div class="form-group">
        <label class="form-label">Report Type (PDF)</label>
        <select v-model="printType" class="form-select">
          <option value="technical">Technical Report Form</option>
          <option value="history">Service History Form</option>
          <option value="copier">Copier Service Report</option>
        </select>
      </div>
      <template #footer>
        <button type="button" class="btn btn-outline" @click="printModalOpen = false">Cancel</button>
        <button type="button" class="btn btn-primary" @click="handleConfirmPrint">Print / Download</button>
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
