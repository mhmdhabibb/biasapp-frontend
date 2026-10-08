<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import SignaturePad from '@/components/ui/SignaturePad.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { useResourcesStore } from '@/stores/resources.store'
import { useRouter } from 'vue-router'
import { hasDeliveryHistory, printDeliveryServiceHistory } from '@/utils/printDeliveryHistory'
import type { TableColumn, ServiceReport, SparepartRequest } from '@/types'

const { can } = usePermission()
const router = useRouter()
const toast = useToast()
const resources = useResourcesStore()

const {
  serviceReports: data,
  deliveryOrders,
  contractItems,
  customers,
  technicians,
  units,
  products,
  sparepartRequests,
  findContractItem,
  findCustomer,
  findTechnician,
  findProduct,
  findUnit,
  findServiceReport,
} = useMasterStore()

const customerOptions = computed(() =>
  (customers.value as any[]).map((c: any) => ({
    value: c.id,
    label: c.company_name || c.name,
  })),
)

const unitOptions = computed(() =>
  (units.value as any[]).map((u: any) => ({
    value: u.id,
    label: `${u.model} (SN: ${u.serial_number})`,
  })),
)

const serviceTypeOptions = [
  { value: 'corrective', label: 'Corrective' },
  { value: 'preventive', label: 'Preventive' },
  { value: 'installation', label: 'Installation' },
  { value: 'relocation', label: 'Relocation' },
]

const technicianOptions = computed(() =>
  (technicians.value as any[]).map((t: any) => ({
    value: t.id,
    label: t.name,
  })),
)

const statusOptions = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'Continue (In Progress)' },
  { value: 'completed', label: 'Done (Test OK)' },
  { value: 'cancelled', label: 'Cancelled' },
]

const sparepartProductOptions = computed(() =>
  (products.value as any[]).map((p: any) => ({
    value: p.id,
    label: p.name,
  })),
)

const printTypeOptions = [
  { value: 'technical', label: 'Technical Report Form' },
  { value: 'history', label: 'Service History Form' },
  { value: 'copier', label: 'Copier Service Report' },
]

// Tab: service reports | delivery history | sparepart requests
const activeTab = ref<'service' | 'delivery' | 'sparepart'>('service')

// ── Sparepart Requests (Procurement) ───────────────────────────────────────
const sprColumns: TableColumn[] = [
  { key: 'request_no', label: 'Request No' },
  { key: 'service_report_id', label: 'Service No' },
  { key: 'technician_id', label: 'Requested By' },
  { key: 'product_id', label: 'Sparepart' },
  { key: 'qty', label: 'Qty' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Date' },
  { key: 'actions', label: 'Action' },
]

const creatingId = ref<string | number | null>(null)

function getProduct(row: any) {
  const id = row?.product_id ?? row
  return (
    (row as any)?.product?.name ||
    findProduct(id as any)?.name ||
    '-'
  )
}

function getSR(row: any) {
  const id = row?.service_report_id ?? row
  const sr = (row as any)?.service_report || findServiceReport(id as any)
  return sr ? sr.report_no || (sr as any).service_report_no || '-' : '-'
}

function sprTechName(row: any): string {
  const direct =
    row?.technician ||
    (row?.technician_id ? findTechnician(row.technician_id as any) : null)
  const name = (t: any) => t?.user?.name || t?.user?.username || t?.name || ''
  if (name(direct)) return name(direct)
  const srTechId = row?.service_report?.technician_id
  const srTech =
    row?.service_report?.technician ||
    (srTechId ? findTechnician(srTechId as any) : null)
  return name(srTech) || '-'
}

async function handleCreatePO(request: SparepartRequest) {
  if (creatingId.value !== null) return
  creatingId.value = request.id
  try {
    await resources.create('purchaseOrders', {
      sparepart_request_id: request.id,
      order_date: new Date().toISOString(),
      status: 'draft',
    })
    await useMasterStore().refreshInBackground()
    toast.success(`Purchase order created for ${request.request_no}`)
    router.push('/accounting/purchase-orders')
  } catch (err) {
    toast.error(toast.fromError(err, 'Failed to create purchase order'))
  } finally {
    creatingId.value = null
  }
}
// ───────────────────────────────────────────────────────────────────────────

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

// ── DO Detail Modal ─────────────────────────────────────────────────────────
const showDoDetail = ref(false)
const doDetailItem = ref<any>(null)

function openDoDetail(row: any) {
  doDetailItem.value = row
  showDoDetail.value = true
}

function getDoItemName(item: any): string {
  if (item.product?.name) return item.product.name
  if (item.product_id) return findProduct(item.product_id as any)?.name || `Product ${item.product_id}`
  if (item.unit) return `${item.unit.model || 'Unit'}${item.unit.serial_number ? ` (SN: ${item.unit.serial_number})` : ''}`
  if (item.unit_id) {
    const unit = findUnit(item.unit_id as any)
    return unit ? `${unit.model}${(unit as any).serial_number ? ` (SN: ${(unit as any).serial_number})` : ''}` : `Unit ${item.unit_id}`
  }
  return '-'
}

// ── SR Detail Modal ─────────────────────────────────────────────────────────
const showSrDetail = ref(false)
const srDetailItem = ref<any>(null)

function openSrDetail(row: any) {
  srDetailItem.value = row
  showSrDetail.value = true
}

function getSrUnitName(item: any): string {
  if (item.unit) return `${item.unit.model || 'Unit'}${item.unit.serial_number ? ` (SN: ${item.unit.serial_number})` : ''}`
  if (item.unit_id) {
    const unit = findUnit(item.unit_id as any)
    return unit ? `${unit.model}${(unit as any).serial_number ? ` (SN: ${(unit as any).serial_number})` : ''}` : `Unit ${item.unit_id}`
  }
  return '-'
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
  data.value.filter(
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
  if (!form.report_no.trim()) return
  
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
      <button class="btn btn-sm" :class="activeTab === 'sparepart' ? 'btn-primary' : 'btn-outline'" @click="activeTab = 'sparepart'">
        Sparepart Requests ({{ (sparepartRequests as any[]).length }})
      </button>
    </div>
    <DataTable v-if="activeTab === 'service'" :columns="columns" :data="serviceOnlyReports" search-placeholder="Search service reports..." @edit="openEdit" @delete="openDelete">
      <template #cell-report_no="{ value, row }">
        <span class="sr-link" @click="openSrDetail(row)">{{ value || row.service_report_no || '-' }}</span>
      </template>
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
      <template #cell-do_number="{ value, row }">
        <span class="do-link" @click="openDoDetail(row)">{{ value }}</span>
      </template>
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

    <!-- SR Detail Modal -->
    <FormModal :open="showSrDetail" :title="srDetailItem ? `Detail ${srDetailItem.report_no || srDetailItem.service_report_no}` : 'Detail Service Report'" max-width="640px" @close="showSrDetail = false">
      <template v-if="srDetailItem">
        <div class="detail-grid">
          <div class="detail-field">
            <span>Report No.</span>
            <strong>{{ srDetailItem.report_no || srDetailItem.service_report_no }}</strong>
          </div>
          <div class="detail-field">
            <span>Service Type</span>
            <strong>{{ srDetailItem.service_type || '-' }}</strong>
          </div>
          <div class="detail-field">
            <span>Customer</span>
            <strong>{{ customerName(srDetailItem.customer_id) }}</strong>
          </div>
          <div class="detail-field">
            <span>Technician</span>
            <strong>{{ technicianName(srDetailItem.technician_id) }}</strong>
          </div>
          <div class="detail-field">
            <span>Product / Unit</span>
            <strong>{{ getSrUnitName(srDetailItem) }}</strong>
          </div>
          <div class="detail-field">
            <span>Visit Date</span>
            <strong>{{ srDetailItem.service_date ? new Date(srDetailItem.service_date).toLocaleDateString('en-GB') : '-' }}</strong>
          </div>
          <div class="detail-field">
            <span>Status</span>
            <strong>
              <span class="badge" :class="srDetailItem.status === 'completed' ? 'badge-success' : srDetailItem.status === 'in_progress' ? 'badge-info' : 'badge-warning'">
                {{ String(srDetailItem.status === 'open' ? 'Open' : srDetailItem.status === 'in_progress' ? 'In Progress' : srDetailItem.status === 'completed' ? 'Completed' : srDetailItem.status || '-').replace('_', ' ') }}
              </span>
            </strong>
          </div>
          <div v-if="srDetailItem.delivery_address" class="detail-field detail-field--wide">
            <span>Delivery Address</span>
            <strong>{{ srDetailItem.delivery_address }}</strong>
          </div>
          <div v-if="srDetailItem.machine_problem" class="detail-field detail-field--wide">
            <span>Machine Problem</span>
            <strong>{{ srDetailItem.machine_problem }}</strong>
          </div>
          <div v-if="srDetailItem.repair_action" class="detail-field detail-field--wide">
            <span>Repair Action</span>
            <strong>{{ srDetailItem.repair_action }}</strong>
          </div>
          <div v-if="srDetailItem.remarks" class="detail-field detail-field--wide">
            <span>Remarks</span>
            <strong>{{ srDetailItem.remarks }}</strong>
          </div>
        </div>
        <section class="detail-items" v-if="srDetailItem.spareparts && srDetailItem.spareparts.length > 0">
          <h4>Spareparts Used</h4>
          <div class="detail-items-table-wrap">
            <table class="detail-items-table">
              <thead>
                <tr><th>Sparepart</th><th>Qty</th></tr>
              </thead>
              <tbody>
                <tr v-for="(sp, index) in srDetailItem.spareparts" :key="index">
                  <td>{{ sp.product?.name || findProduct(sp.product_id as any)?.name || `Product ${sp.product_id}` }}</td>
                  <td>{{ sp.qty }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
      <template #footer>
        <button type="button" class="btn btn-outline" @click="showSrDetail = false">Close</button>
      </template>
    </FormModal>

    <!-- DO Detail Modal -->
    <FormModal :open="showDoDetail" :title="doDetailItem ? `Detail ${doDetailItem.do_number}` : 'Detail Delivery Order'" max-width="640px" @close="showDoDetail = false">
      <template v-if="doDetailItem">
        <div class="detail-grid">
          <div class="detail-field">
            <span>DO Number</span>
            <strong>{{ doDetailItem.do_number }}</strong>
          </div>
          <div class="detail-field">
            <span>Type</span>
            <strong>{{ doTypeLabel(doDetailItem.do_type) }}</strong>
          </div>
          <div class="detail-field">
            <span>Customer</span>
            <strong>{{ customerName(doDetailItem.customer_id) }}</strong>
          </div>
          <div class="detail-field">
            <span>Technician</span>
            <strong>{{ technicianName(doDetailItem.technician_id) }}</strong>
          </div>
          <div class="detail-field">
            <span>Delivery Date</span>
            <strong>{{ doDetailItem.delivery_date ? new Date(doDetailItem.delivery_date).toLocaleDateString('en-GB') : '-' }}</strong>
          </div>
          <div class="detail-field">
            <span>Status</span>
            <strong>
              <span class="badge" :class="doDetailItem.status === 'delivered' ? 'badge-success' : doDetailItem.status === 'in_transit' ? 'badge-info' : 'badge-warning'">
                {{ String(doDetailItem.status || '-').replace('_', ' ') }}
              </span>
            </strong>
          </div>
          <div class="detail-field">
            <span>Recipient</span>
            <strong>{{ doDetailItem.recipient_name || '-' }}</strong>
          </div>
          <div class="detail-field">
            <span>Phone</span>
            <strong>{{ doDetailItem.recipient_phone || '-' }}</strong>
          </div>
          <div v-if="doDetailItem.delivery_address" class="detail-field detail-field--wide">
            <span>Delivery Address</span>
            <strong>{{ doDetailItem.delivery_address }}</strong>
          </div>
          <div v-if="doDetailItem.notes" class="detail-field detail-field--wide">
            <span>Notes</span>
            <strong>{{ doDetailItem.notes }}</strong>
          </div>
        </div>
        <section class="detail-items">
          <h4>Products / Items</h4>
          <div class="detail-items-table-wrap">
            <table class="detail-items-table">
              <thead>
                <tr><th>Item</th><th>Qty</th><th>Remarks</th></tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in doDetailItem.delivery_order_items || []" :key="item.id || index">
                  <td>{{ getDoItemName(item) }}</td>
                  <td>{{ item.qty || 1 }}</td>
                  <td>{{ item.remarks || '-' }}</td>
                </tr>
                <tr v-if="!doDetailItem.delivery_order_items?.length">
                  <td colspan="3" class="detail-items-empty">No delivery items</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
      <template #footer>
        <button type="button" class="btn btn-outline" @click="showDoDetail = false">Close</button>
      </template>
    </FormModal>
    <!-- Sparepart Requests Tab -->
    <DataTable v-if="activeTab === 'sparepart'" :columns="sprColumns" :data="sparepartRequests" permission="service_sparepart" search-placeholder="Search requests...">
      <template #cell-product_id="{ row }">{{ getProduct(row) }}</template>
      <template #cell-service_report_id="{ row }">{{ getSR(row) }}</template>
      <template #cell-technician_id="{ row }">{{ sprTechName(row) }}</template>
      <template #cell-status="{ value }">
        <span class="badge" :class="{
          'badge-warning': value === 'pending',
          'badge-success': value === 'po_created' || value === 'completed',
          'badge-danger': value === 'rejected'
        }">
          {{ value || 'pending' }}
        </span>
      </template>
      <template #cell-created_at="{ value }">
        {{ new Date(value).toLocaleDateString() }}
      </template>
      <template #cell-actions="{ row }">
        <button v-if="row.status === 'pending' && can('purchase_order:create')" class="btn btn-sm btn-primary"
          :disabled="creatingId !== null" @click="handleCreatePO(row)">
          {{ creatingId === row.id ? 'Creating...' : 'Create PO' }}
        </button>
        <span v-else class="text-muted text-sm">Processed</span>
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Service Report' : 'Add Service Report'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="sr-no" class="form-label">Report No.</label>
        <input id="sr-no" v-model="form.report_no" type="text" class="form-input" placeholder="SR-XXXXXX">
      </div>
      <div class="form-group">
        <label for="sr-customer" class="form-label">Customer</label>
        <CustomSelect id="sr-customer" v-model="form.customer_id" :options="customerOptions" placeholder="-- Select Customer --" class="form-select" />
      </div>
      <div class="form-group">
        <label class="form-label">Unit / Machine</label>
        <CustomSelect v-model="form.unit_id" :options="unitOptions" placeholder="-- Select Unit --" class="form-select" />
      </div>
      <div class="form-group">
        <label for="sr-type" class="form-label">Service Type</label>
        <CustomSelect id="sr-type" v-model="form.service_type" :options="serviceTypeOptions" class="form-select" />
      </div>
      <div class="form-group">
        <label for="sr-tech" class="form-label">Technician</label>
        <CustomSelect id="sr-tech" v-model="form.technician_id" :options="technicianOptions" placeholder="-- Select Technician --" class="form-select" />
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
        <CustomSelect id="sr-status" v-model="form.status" :options="statusOptions" class="form-select" />
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
          <CustomSelect v-model="sp.product_id" :options="sparepartProductOptions" placeholder="Select Product (Sparepart)..." class="form-select" style="flex: 1;" />
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
        <CustomSelect v-model="printType" :options="printTypeOptions" class="form-select" />
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

/* DO & SR Detail Link */
.do-link, .sr-link {
  color: var(--color-primary);
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  transition: color 0.15s, text-decoration 0.15s;
}
.do-link:hover, .sr-link:hover {
  color: var(--color-primary-hover, #2563eb);
  text-decoration: underline;
}

/* DO Detail Modal */
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.detail-field {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
}
.detail-field span {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}
.detail-field strong {
  overflow-wrap: anywhere;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}
.detail-field--wide {
  grid-column: 1 / -1;
}
.detail-items {
  margin-top: 16px;
}
.detail-items h4 {
  margin: 0 0 10px;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: 600;
}
.detail-items-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
}
.detail-items-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}
.detail-items-table th,
.detail-items-table td {
  padding: 9px 11px;
  border-bottom: 1px solid var(--color-border-light);
  text-align: left;
}
.detail-items-table th {
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  font-weight: var(--font-weight-medium);
}
.detail-items-table tr:last-child td {
  border-bottom: 0;
}
.detail-items-empty {
  color: var(--color-text-muted);
  text-align: center !important;
}
@media (max-width: 520px) {
  .detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
