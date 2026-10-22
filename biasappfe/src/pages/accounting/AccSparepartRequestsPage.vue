<script setup lang="ts">
// @ts-nocheck
import DataTable from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import FormModal from '@/components/ui/FormModal.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { useResourcesStore } from '@/stores/resources.store'
import { printPurchaseOrder } from '@/utils/printPurchaseOrder'
import type { SparepartRequest, TableColumn } from '@/types'
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'

const { can } = usePermission()
const store = useMasterStore()
const resources = useResourcesStore()
const toast = useToast()
const router = useRouter()

const creatingId = ref<string | number | null>(null)
const showCreatePOModal = ref(false)
const poTarget = ref<SparepartRequest | null>(null)

const poForm = reactive({
  request_form_no: '',
  order_date: new Date().toISOString().slice(0, 10),
  installation_date: '',
  priority: 'Normal',
  department: 'Technical / Service',
  requester_name: '',
  item_name: '',
  qty: 1,
  uom: 'Pcs',
  unit_price: 0,
  purpose: '',
  reason: '',
  warehouse_status: 'Pengadaan Baru',
  special_notes: '',
})

function openCreatePOModal(request: SparepartRequest) {
  poTarget.value = request
  const sr = (store.serviceReports.value as any[]).find(
    (s: any) => String(s.id) === String(request.service_report_id)
  ) || request.service_report
  const prod = request.product || store.findProduct(request.product_id)
  const cust = sr?.customer_id ? store.findCustomer(sr.customer_id) : (sr?.customer || null)
  const unit = sr?.unit_id ? store.findUnit(sr.unit_id) : (sr?.unit || null)
  const tech = getTechnician(request)

  poForm.request_form_no = `MRF-${Date.now().toString().slice(-6)}`
  poForm.order_date = new Date().toISOString().slice(0, 10)
  poForm.installation_date = ''
  poForm.priority = 'Normal'
  poForm.department = 'Technical / Service'
  poForm.requester_name = tech !== '-' ? tech : 'tech'
  poForm.item_name = request.item_name || prod?.name || 'Sparepart'
  poForm.qty = request.qty || 1
  poForm.uom = (request as any).uom || 'Pcs'
  poForm.unit_price = request.unit_price || prod?.price || 0

  const purposeParts: string[] = []
  if (unit?.model) {
    purposeParts.push(`Unit ${unit.model}${unit.serial_number ? ` (SN: ${unit.serial_number})` : ''}`)
  }
  if (cust?.company_name || cust?.name) {
    purposeParts.push(cust.company_name || cust.name)
  }
  if (sr?.report_no || (sr as any)?.service_report_no) {
    purposeParts.push(`SR: ${sr.report_no || (sr as any).service_report_no}`)
  }
  poForm.purpose = purposeParts.join(' - ') || 'Penggantian sparepart unit'
  poForm.reason = request.reason || sr?.remarks || 'Penggantian sparepart sesuai rekomendasi teknisi'
  poForm.warehouse_status = 'Pengadaan Baru'
  poForm.special_notes = ''

  showCreatePOModal.value = true
}

function closeCreatePOModal() {
  if (creatingId.value !== null) return
  showCreatePOModal.value = false
  poTarget.value = null
}

const columns: TableColumn[] = [
  { key: 'request_no', label: 'Request No' },
  { key: 'service_report_id', label: 'Service No' },
  { key: 'technician_id', label: 'Requested By' },
  { key: 'product_id', label: 'Sparepart' },
  { key: 'qty', label: 'Qty' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Date' },
  { key: 'actions', label: 'Action' }
]

function getProduct(row: any) {
  if (row?.item_name) return row.item_name
  const id = row?.product_id ?? row
  return (
    (row as any)?.product?.name ||
    store.findProduct(id as any)?.name ||
    row?.item_name ||
    '-'
  )
}

function getSR(row: any) {
  const id = row?.service_report_id ?? row
  const sr = (row as any)?.service_report || store.findServiceReport(id as any)
  return sr ? sr.report_no || (sr as any).service_report_no || '-' : '-'
}

function techNameOf(tech: any): string {
  if (!tech) return ''
  return tech.user?.name || tech.user?.username || tech.name || ''
}

function getTechnician(row: any) {
  const direct =
    row?.technician ||
    (row?.technician_id ? store.findTechnician(row.technician_id as any) : null)
  const directName = techNameOf(direct)
  if (directName) return directName
  const srTechId = row?.service_report?.technician_id
  const srTech =
    row?.service_report?.technician ||
    (srTechId ? store.findTechnician(srTechId as any) : null)
  return techNameOf(srTech) || '-'
}

async function handleCreatePO() {
  const request = poTarget.value
  if (!request || creatingId.value !== null) return
  const reason = poForm.reason.trim()
  if (!reason || !poForm.installation_date) {
    toast.error('Reason and target installation date are required')
    return
  }
  creatingId.value = request.id
  try {
    const sr = (store.serviceReports.value as any[]).find(
      (s: any) => String(s.id) === String(request.service_report_id)
    ) || request.service_report
    const customerId = sr?.customer_id || null
    const unitId = sr?.unit_id || null
    const serviceReportId = request.service_report_id || sr?.id || null
    const prod = request.product || store.findProduct(request.product_id)
    const unitPrice = Number(poForm.unit_price) || request.unit_price || prod?.price || 0
    const qty = Number(poForm.qty) || request.qty || 1

    await resources.create('purchaseOrders', {
      po_no: poForm.request_form_no || undefined,
      request_form_no: poForm.request_form_no || undefined,
      sparepart_request_id: request.id,
      service_report_id: serviceReportId,
      customer_id: customerId,
      unit_id: unitId,
      order_date: poForm.order_date ? `${poForm.order_date}T00:00:00+07:00` : new Date().toISOString(),
      status: 'draft',
      reason,
      installation_date: `${poForm.installation_date}T00:00:00+07:00`,
      priority: poForm.priority,
      department: poForm.department,
      warehouse_status: poForm.warehouse_status,
      special_notes: poForm.special_notes,
      purchase_order_items: [
        {
          item_name: poForm.item_name || request.item_name || prod?.name || 'Sparepart',
          product_id: request.product_id,
          qty,
          uom: poForm.uom || 'Pcs',
          unit_price: unitPrice,
          total_price: qty * unitPrice,
          purpose: poForm.purpose,
        }
      ]
    })
    await store.refreshInBackground()
    toast.success(`Request form created for ${request.request_no}`)
    showCreatePOModal.value = false
    poTarget.value = null
    router.push('/accounting/purchase-orders')
  } catch (err) {
    toast.error(toast.fromError(err, 'Failed to create request form'))
  } finally {
    creatingId.value = null
  }
}

async function handlePrintRequestForm(row: any) {
  const pos = (store.purchaseOrders.value as any[]) || []
  let po = pos.find((p: any) =>
    (p.sparepart_request_id && String(p.sparepart_request_id) === String(row.id)) ||
    (p.service_report_id && row.service_report_id && String(p.service_report_id) === String(row.service_report_id))
  )

  if (!po) {
    const sr = (store.serviceReports.value as any[]).find(
      (s: any) => String(s.id) === String(row.service_report_id)
    ) || row.service_report
    const prod = row.product || store.findProduct(row.product_id)
    const unitPrice = row.unit_price || prod?.price || 0
    const qty = row.qty || 1

    po = {
      id: row.id,
      po_no: `MRF-${row.request_no || Date.now().toString().slice(-6)}`,
      sparepart_request_id: row.id,
      sparepart_request: row,
      service_report_id: row.service_report_id,
      service_report: sr,
      customer_id: sr?.customer_id,
      customer: sr?.customer || (sr?.customer_id ? store.findCustomer(sr.customer_id) : null),
      unit_id: sr?.unit_id,
      unit: sr?.unit || (sr?.unit_id ? store.findUnit(sr.unit_id) : null),
      order_date: row.created_at || new Date().toISOString(),
      installation_date: row.installation_date || row.created_at,
      status: row.status === 'pending' ? 'draft' : 'approved',
      reason: row.reason || sr?.remarks || 'Penggantian sparepart mesin',
      priority: 'Normal',
      department: 'Technical / Service',
      purchase_order_items: [
        {
          item_name: row.item_name || prod?.name || 'Sparepart',
          product_id: row.product_id,
          qty,
          uom: 'Pcs',
          unit_price: unitPrice,
          total_price: qty * unitPrice,
          purpose: `Unit ${sr?.unit?.model || ''} - ${sr?.customer?.name || ''}`
        }
      ]
    }
  }

  await printPurchaseOrder(po)
}
</script>

<template>
  <div>
    <PageHeader title="Sparepart Requests (Procurement)" />

    <DataTable :columns="columns" :data="store.sparepartRequests.value" permission="service_sparepart"
      search-placeholder="Search requests...">
      <template #cell-product_id="{ row }">{{ getProduct(row) }}</template>
      <template #cell-service_report_id="{ row }">{{ getSR(row) }}</template>
      <template #cell-technician_id="{ row }">{{ getTechnician(row) }}</template>
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
        {{ new Date(value).toLocaleDateString('en-GB') }}
      </template>
      <template #cell-actions="{ row }">
        <div style="display: flex; align-items: center; gap: 8px;">
          <button v-if="row.status === 'pending' && can('purchase_order:create')" class="btn btn-sm btn-primary"
            :disabled="creatingId !== null" @click="openCreatePOModal(row)">
            {{ creatingId === row.id ? 'Creating...' : 'Create Request Form' }}
          </button>
          <template v-else>
            <span class="text-muted text-sm">Processed</span>
            <button
              v-if="can('purchase_order:read')"
              class="action-btn"
              title="Print Request Form"
              @click="handlePrintRequestForm(row)"
              style="color: var(--color-primary); border-color: transparent;"
            >
              <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
              </svg>
            </button>
          </template>
        </div>
      </template>
    </DataTable>

    <!-- Create Request Form Modal (Material Requisition Form) -->
    <FormModal :open="showCreatePOModal" title="Material Requisition Form (Request Form)" max-width="720px" @close="closeCreatePOModal" @submit="handleCreatePO">
      <div class="mrf-form-container">
        <!-- Section A: Informasi Pemohon -->
        <div class="mrf-section-header">A. INFORMASI PEMOHON</div>
        <div class="mrf-grid">
          <div class="form-group">
            <label class="form-label">Nomor Form</label>
            <input v-model="poForm.request_form_no" type="text" class="form-input" placeholder="e.g. Bi-MRF-001" />
          </div>
          <div class="form-group">
            <label class="form-label">Tanggal Pengajuan <span class="text-danger">*</span></label>
            <input v-model="poForm.order_date" type="date" class="form-input" required />
          </div>
          <div class="form-group">
            <label class="form-label">Nama Pemohon</label>
            <input v-model="poForm.requester_name" type="text" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">Divisi / Departemen</label>
            <input v-model="poForm.department" type="text" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">Tanggal Dibutuhkan <span class="text-danger">*</span></label>
            <input v-model="poForm.installation_date" type="date" class="form-input" required />
          </div>
          <div class="form-group">
            <label class="form-label">Tingkat Prioritas</label>
            <select v-model="poForm.priority" class="form-input">
              <option value="Normal">Normal</option>
              <option value="Mendesak">Mendesak</option>
            </select>
          </div>
        </div>

        <!-- Section B: Detail Barang yang Diminta -->
        <div class="mrf-section-header" style="margin-top: 14px;">B. DETAIL BARANG YANG DIMINTA</div>
        <div class="mrf-grid">
          <div class="form-group" style="grid-column: span 2;">
            <label class="form-label">Nama Barang &amp; Spesifikasi Teknis <span class="text-danger">*</span></label>
            <input v-model="poForm.item_name" type="text" class="form-input" required />
          </div>
          <div class="form-group">
            <label class="form-label">Volume (Qty) <span class="text-danger">*</span></label>
            <input v-model.number="poForm.qty" type="number" min="1" class="form-input" required />
          </div>
          <div class="form-group">
            <label class="form-label">Satuan</label>
            <input v-model="poForm.uom" type="text" class="form-input" placeholder="Pcs / Unit" />
          </div>
          <div class="form-group">
            <label class="form-label">Estimasi Harga Satuan (Rp)</label>
            <input v-model.number="poForm.unit_price" type="number" min="0" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">Total Estimasi (Rp)</label>
            <input :value="(poForm.qty * poForm.unit_price).toLocaleString('id-ID')" type="text" class="form-input" disabled style="background: #f8fafc; font-weight: bold;" />
          </div>
          <div class="form-group" style="grid-column: span 2;">
            <label class="form-label">Keperluan / Peruntukan</label>
            <input v-model="poForm.purpose" type="text" class="form-input" placeholder="e.g. Unit IR-2006 SN: 123 - Customer X" />
          </div>
        </div>

        <!-- Section C: Justifikasi / Alasan Kebutuhan Pengadaan -->
        <div class="mrf-section-header" style="margin-top: 14px;">JUSTIFIKASI / ALASAN KEBUTUHAN PENGADAAN</div>
        <div class="form-group" style="margin-top: 6px;">
          <div class="text-muted text-xs" style="margin-bottom: 6px; font-style: italic;">
            Tuliskan alasan pengadaan barang (misal: penggantian inventaris lama rusak, penambahan kebutuhan staf baru, operasional proyek, dll):
          </div>
          <textarea
            v-model="poForm.reason"
            class="form-input"
            rows="3"
            required
            placeholder="Alasan pembuatan Request Form..."
            style="width: 100%;"
          ></textarea>
        </div>

        <!-- Section D: Verifikasi Internal -->
        <div class="mrf-section-header" style="margin-top: 14px;">VERIFIKASI INTERNAL</div>
        <div class="mrf-grid" style="margin-top: 6px;">
          <div class="form-group">
            <label class="form-label">Status Stok Gudang</label>
            <select v-model="poForm.warehouse_status" class="form-input">
              <option value="Pengadaan Baru">Pengadaan Baru</option>
              <option value="Tersedia di Stok">Tersedia di Stok</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Catatan Khusus</label>
            <input v-model="poForm.special_notes" type="text" class="form-input" placeholder="Catatan tambahan (opsional)" />
          </div>
        </div>
      </div>
    </FormModal>
  </div>
</template>

<style scoped>
.mb-4 {
  margin-bottom: var(--space-lg);
}

.text-muted {
  color: var(--color-text-muted);
}

.text-sm {
  font-size: var(--font-size-xs);
}

.text-xs {
  font-size: 11px;
}

.text-danger {
  color: var(--color-danger, #ef4444);
}

/* Material Requisition Form Modal Styles */
.mrf-form-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mrf-section-header {
  background-color: #1e4e79;
  color: #ffffff;
  font-weight: bold;
  font-size: 11px;
  padding: 5px 8px;
  border-radius: 3px;
  letter-spacing: 0.3px;
}

.mrf-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 6px;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-label {
  font-size: var(--font-size-xs);
  font-weight: 500;
  margin-bottom: 4px;
  color: var(--color-text);
}

.form-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: var(--font-size-sm);
  box-sizing: border-box;
}

.action-btn {
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
}
</style>
