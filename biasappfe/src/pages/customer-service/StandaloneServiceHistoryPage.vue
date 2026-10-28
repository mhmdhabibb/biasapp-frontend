<script setup lang="ts">
// @ts-nocheck
// Standalone Service History — sisi Customer Service / Admin.
// CS mengisi Customer Detail, teknisi mengisi Product Detail.
// Fitur: Edit, Assign (otomatis membuat Job Order), Delete, Print, Export.
import { computed, reactive, ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useHardDelete } from '@/composables/useHardDelete'
import { useToast } from '@/composables/useToast'
import { useResourcesStore } from '@/stores/resources.store'
import { resources as resourceService } from '@/services/resource.service'
import { api } from '@/services/api'
import { hasDeliveryHistory, printDeliveryServiceHistory } from '@/utils/printDeliveryHistory'
import { printServiceReport, type ReportType } from '@/utils/printReport'
import type { TableColumn } from '@/types'

const toast = useToast()
const { can } = usePermission()
const route = useRoute()
const { ensureResourcesLoaded } = useMasterStore()
const store = useMasterStore()
const resources = useResourcesStore()

onMounted(() => {
  ensureResourcesLoaded(route.path)
  void store.refreshOnly(['deliveryOrders', 'jobOrders', 'technicians', 'customers'])
})

const filterCustomer = ref<any>(null)
const filterCustomerOptions = computed(() => [
  { value: null as any, label: 'Semua Customer' },
  ...((store.customers?.value || []) as any[]).map((c: any) => ({
    value: c.id,
    label: c.company_name || c.name || `Customer ${c.id}`,
  })),
])

const filterTechnician = ref<any>(null)
const filterTechnicianOptions = computed(() => [
  { value: null as any, label: 'Semua Teknisi' },
  { value: 'unassigned', label: 'Belum Ditunjuk / Tanpa Teknisi' },
  ...((store.technicians?.value || []) as any[]).map((t: any) => ({
    value: t.id,
    label: t.user?.name || t.name || `Teknisi ${t.id}`,
  })),
])

// Hanya DO mandiri bertipe service (bukan rental/sale/inbound)
const standaloneList = computed(() => {
  let list = ((store.deliveryOrders?.value || []) as any[]).filter(
    (d: any) => String(d.do_type || '').toLowerCase() === 'service',
  )
  if (filterCustomer.value) {
    list = list.filter((d: any) => String(d.customer_id) === String(filterCustomer.value))
  }
  if (filterTechnician.value) {
    if (filterTechnician.value === 'unassigned') {
      list = list.filter((d: any) => !d.technician_id)
    } else {
      list = list.filter((d: any) => String(d.technician_id) === String(filterTechnician.value))
    }
  }
  return list.sort((a: any, b: any) =>
    String(b.created_at || b.delivery_date || '').localeCompare(String(a.created_at || a.delivery_date || '')),
  )
})

// ── Job Orders yang terkait DO (by delivery_order_id) ──
function findJobOrderForDO(doId: string): any {
  return ((store.jobOrders?.value || []) as any[]).find(
    (jo: any) => jo.delivery_order_id && String(jo.delivery_order_id) === String(doId)
  ) || null
}

// Columns tabel
const columns: TableColumn[] = [
  { key: 'do_number', label: 'No. DO', width: '130px' },
  { key: 'customer_id', label: 'Customer', width: '220px' },
  { key: 'delivery_date', label: 'Tanggal', width: '110px' },
  { key: 'items', label: 'Unit / Product', width: '200px' },
  { key: 'status', label: 'Status', width: '120px' },
  { key: 'technician_id', label: 'Teknisi', width: '150px' },
  { key: 'job_order', label: 'Job Order', width: '140px' },
]

function customerName(id: any): string {
  const c: any = store.findCustomer(id)
  return c ? (c.company_name || c.name || '-') : '-'
}
function technicianName(id: any): string {
  const t: any = store.findTechnician(id)
  return t ? (t.user?.name || t.name || '-') : '- (belum ditunjuk)'
}
function isFilled(row: any): boolean {
  return !!(row?.action || row?.is_tested || row?.is_completed || row?.technician_signature || (row?.delivery_order_items || []).length)
}
function statusLabel(row: any): string {
  if (row.status === 'draft') return 'DRAFT'
  if (row.status === 'in_progress') return 'IN PROGRESS'
  if (row.status === 'completed' || row.status === 'delivered') return 'COMPLETED'
  if (isFilled(row)) return 'FILLED'
  return 'PENDING'
}
function statusClass(row: any): string {
  if (row.status === 'draft') return 'badge-secondary'
  if (row.status === 'in_progress') return 'badge-info'
  if (row.status === 'completed' || row.status === 'delivered') return 'badge-success'
  if (isFilled(row)) return 'badge-success'
  return 'badge-warning'
}

function productSummary(row: any): string {
  const items = row?.delivery_order_items || []
  if (!items.length) return 'Belum diisi teknisi'
  return items.map((it: any) => {
    if (it.unit_id) {
      const u: any = store.findUnit(it.unit_id)
      return u ? `${u.model || 'Unit'}${u.serial_no ? ` (${u.serial_no})` : ''}` : 'Unit'
    }
    if (it.product_id) {
      const p: any = store.findProduct(it.product_id)
      return p?.name || 'Product'
    }
    if (it.model) return it.model
    if (it.serial_no) return it.serial_no
    return 'Item'
  }).join(', ')
}

const customerOptions = computed(() =>
  ((store.customers?.value || []) as any[]).map((c: any) => ({
    value: c.id,
    label: c.company_name || c.name || `Customer ${c.id}`,
  })),
)
const technicianOptions = computed(() => [
  { value: null as any, label: '-- Tanpa penunjukan langsung --' },
  ...((store.technicians?.value || []) as any[]).map((t: any) => ({
    value: t.id,
    label: t.user?.name || t.name || `Teknisi ${t.id}`,
  })),
])
const customerCategoryOptions = [
  { value: 'Corporate', label: 'Corporate' },
  { value: 'Government', label: 'Government' },
]

// ══════════════════════════════════════════════════
// MODAL ADD / EDIT
// ══════════════════════════════════════════════════
const showModal = ref(false)
const editingItem = ref<any>(null)
const isSaving = ref(false)

const form = reactive({
  customer_id: null as any,
  customer_category: 'Corporate' as string,
  project_name: '',
  delivery_address: '',
  recipient_name: '',
  recipient_phone: '',
  delivery_date: new Date().toISOString().slice(0, 10),
  technician_id: null as any,
  notes: '',
})

watch(
  () => form.customer_id,
  (cid) => {
    if (editingItem.value || !cid) return
    const cust: any = ((store.customers?.value || []) as any[]).find((c: any) => String(c.id) === String(cid))
    if (cust) {
      if (!form.delivery_address) form.delivery_address = cust.address || ''
      if (!form.recipient_name) form.recipient_name = cust.pic_name || cust.company_name || cust.name || ''
      if (!form.recipient_phone) form.recipient_phone = cust.phone || ''
      if (cust.category) form.customer_category = cust.category
      if (!form.project_name && form.delivery_address) {
        form.project_name = `Pengantaran Unit ke ${form.delivery_address}`
      }
    }
  }
)

function resetForm() {
  Object.assign(form, {
    customer_id: null,
    customer_category: 'Corporate',
    project_name: '',
    delivery_address: '',
    recipient_name: '',
    recipient_phone: '',
    delivery_date: new Date().toISOString().slice(0, 10),
    technician_id: null,
    notes: '',
  })
}

function openAdd() {
  editingItem.value = null
  resetForm()
  showModal.value = true
}

function openEdit(row: any) {
  editingItem.value = row
  Object.assign(form, {
    customer_id: row.customer_id || null,
    customer_category: row.customer_category || row.customer?.category || 'Corporate',
    project_name: row.project_name || '',
    delivery_address: row.delivery_address || '',
    recipient_name: row.recipient_name || '',
    recipient_phone: row.recipient_phone || '',
    delivery_date: row.delivery_date ? String(row.delivery_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    technician_id: row.technician_id || null,
    notes: row.notes || '',
  })
  showModal.value = true
}

async function handleSubmit() {
  if (!form.customer_id) {
    toast.warning('Pilih customer dulu.')
    return
  }
  isSaving.value = true
  try {
    if (editingItem.value) {
      await resources.update('deliveryOrders', String(editingItem.value.id), {
        customer_id: form.customer_id,
        customer_category: form.customer_category,
        project_name: form.project_name,
        delivery_address: form.delivery_address,
        recipient_name: form.recipient_name,
        recipient_phone: form.recipient_phone,
        delivery_date: form.delivery_date ? `${form.delivery_date}T00:00:00Z` : undefined,
        technician_id: form.technician_id,
        notes: form.notes,
      })

      // Jika ada Job Order terhubung dan teknisi diubah, sinkronkan ke Job Order
      if (form.technician_id) {
        const linkedJO = findJobOrderForDO(editingItem.value.id)
        if (linkedJO) {
          try {
            await api.patch(`/job-orders/${linkedJO.id}`, { technician_id: form.technician_id })
          } catch {}
        }
      }
      toast.success('Customer detail diperbarui.')
    } else {
      await resources.create('deliveryOrders', {
        do_type: 'service',
        status: 'pending',
        customer_id: form.customer_id,
        customer_category: form.customer_category,
        project_name: form.project_name,
        delivery_address: form.delivery_address,
        recipient_name: form.recipient_name,
        recipient_phone: form.recipient_phone,
        delivery_date: form.delivery_date ? `${form.delivery_date}T00:00:00Z` : new Date().toISOString(),
        technician_id: form.technician_id,
        notes: form.notes,
      })
      toast.success('Form service history baru dibuat.')
    }
    await store.refreshOnly(['deliveryOrders', 'jobOrders', 'technicians', 'customers'])
    showModal.value = false
  } catch (err: any) {
    toast.error(err?.message || 'Gagal menyimpan.')
  } finally {
    isSaving.value = false
  }
}

// ══════════════════════════════════════════════════
// MODAL ASSIGN → BUAT JOB ORDER
// ══════════════════════════════════════════════════
const showAssignModal = ref(false)
const assigningRow = ref<any>(null)
const assignForm = reactive({
  technician_id: null as any,
  scheduled_date: new Date().toISOString().slice(0, 16),
  instructions: '',
})
const isAssigning = ref(false)

const assignTechOptions = computed(() => [
  { value: null as any, label: '-- Pilih Teknisi --' },
  ...((store.technicians?.value || []) as any[]).map((t: any) => ({
    value: t.id,
    label: t.user?.name || t.name || t.employee_code || `Teknisi ${t.id}`,
  })),
])

function openAssign(row: any) {
  assigningRow.value = row
  const linkedJO = findJobOrderForDO(row.id)
  Object.assign(assignForm, {
    technician_id: row.technician_id || linkedJO?.technician_id || null,
    scheduled_date: linkedJO?.scheduled_date
      ? String(linkedJO.scheduled_date).slice(0, 16)
      : row.delivery_date
        ? String(row.delivery_date).slice(0, 16)
        : new Date().toISOString().slice(0, 16),
    instructions: linkedJO?.instructions || row.notes || row.project_name || '',
  })
  showAssignModal.value = true
}

async function handleAssignSubmit() {
  if (!assigningRow.value) return
  if (!assignForm.technician_id) {
    toast.warning('Pilih teknisi terlebih dahulu.')
    return
  }
  isAssigning.value = true
  try {
    const row = assigningRow.value

    // 1. Update technician_id di Delivery Order
    await api.patch(`/delivery-orders/${row.id}`, {
      technician_id: assignForm.technician_id,
    })

    // 2. Buat atau update Job Order
    const existingJO = findJobOrderForDO(row.id)
    if (existingJO) {
      await api.patch(`/job-orders/${existingJO.id}`, {
        technician_id: assignForm.technician_id,
        scheduled_date: new Date(assignForm.scheduled_date).toISOString(),
        instructions: assignForm.instructions,
      })
      toast.success('Job Order berhasil diperbarui dan teknisi di-assign.')
    } else {
      const joPayload = {
        job_order_no: `JO-${Date.now().toString().slice(-6)}`,
        delivery_order_id: row.id,
        technician_id: assignForm.technician_id,
        job_type: 'delivery',
        scheduled_date: new Date(assignForm.scheduled_date).toISOString(),
        instructions: assignForm.instructions,
        status: 'assigned',
      }
      await api.post('/job-orders', joPayload)
      toast.success('Job Order berhasil dibuat dan teknisi di-assign!')
    }

    await store.refreshOnly(['deliveryOrders', 'jobOrders', 'technicians'])
    showAssignModal.value = false
  } catch (err: any) {
    toast.error(err?.message || 'Gagal meng-assign teknisi.')
  } finally {
    isAssigning.value = false
  }
}

// ══════════════════════════════════════════════════
// MODAL DELETE (SOFT DELETE) & HARD DELETE (SUPERADMIN)
// ══════════════════════════════════════════════════
const showDelete = ref(false)
const deletingItem = ref<any>(null)

function openDelete(row: any) {
  deletingItem.value = row
  showDelete.value = true
}

async function handleDelete() {
  if (!deletingItem.value) return
  try {
    // Hapus juga Job Order terkait jika ada
    const linkedJO = findJobOrderForDO(deletingItem.value.id)
    if (linkedJO) {
      try {
        await resources.remove('jobOrders', String(linkedJO.id))
      } catch {}
    }
    await resources.remove('deliveryOrders', String(deletingItem.value.id))
    await store.refreshOnly(['deliveryOrders', 'jobOrders'])
    toast.success('Service history dihapus.')
  } catch (err: any) {
    toast.error(err?.message || 'Gagal menghapus.')
  } finally {
    showDelete.value = false
    deletingItem.value = null
  }
}

const hardDelete = useHardDelete(
  async (id: string) => {
    const linkedJO = findJobOrderForDO(id)
    if (linkedJO) {
      try {
        await resourceService.jobOrders.hardRemove(String(linkedJO.id))
      } catch {}
    }
    await resourceService.deliveryOrders.hardRemove(id)
  },
  async () => {
    await store.refreshOnly(['deliveryOrders', 'jobOrders'])
  },
  'delivery_order',
)

// ══════════════════════════════════════════════════
// DETAIL & PRINT
// ══════════════════════════════════════════════════
const showDetailModal = ref(false)
const detailItem = ref<any>(null)

function openDetail(row: any) {
  detailItem.value = row
  showDetailModal.value = true
}

const printModalOpen = ref(false)
const printType = ref<ReportType | 'all'>('all')
const printTarget = ref<any>(null)

const printTypeOptions = [
  { value: 'all', label: 'Semua Form (Lengkap)' },
  { value: 'technical', label: 'Technical Report Form' },
  { value: 'history', label: 'Service History Form' },
  { value: 'copier', label: 'Copier Service Report' },
]

function handlePrint(row: any) {
  printTarget.value = row
  printType.value = 'all'
  printModalOpen.value = true
}

function handleConfirmPrint() {
  if (printTarget.value) {
    printServiceReport(printTarget.value, printType.value === 'all' ? undefined : (printType.value as ReportType))
  }
  printModalOpen.value = false
}

// ══════════════════════════════════════════════════
// EXPORT EXCEL & PDF
// ══════════════════════════════════════════════════
async function exportExcel() {
  if (!standaloneList.value.length) {
    toast.error('Tidak ada data untuk diexport.')
    return
  }
  const XLSX = await import('xlsx')
  const rows = standaloneList.value.map((d: any) => {
    const linkedJO = findJobOrderForDO(d.id)
    return {
      'No. DO': d.do_number || '-',
      'Customer': customerName(d.customer_id),
      'Unit / Product': productSummary(d),
      'Tanggal': d.delivery_date ? new Date(d.delivery_date).toLocaleDateString('en-GB') : '-',
      'Teknisi': technicianName(d.technician_id),
      'Job Order': linkedJO ? linkedJO.job_order_no : '-',
      'Problem': d.problem || d.notes || '-',
      'Action': d.action || '-',
      'Status': String(d.status || '-').toUpperCase().replace('_', ' ')
    }
  })
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Service History')
  const custName = filterCustomer.value ? `_${customerName(filterCustomer.value).replace(/[^a-zA-Z0-9]/g, '_')}` : ''
  XLSX.writeFile(wb, `Service_History${custName}_${Date.now()}.xlsx`)
}

async function exportPdf() {
  if (!standaloneList.value.length) {
    toast.error('Tidak ada data untuk diexport.')
    return
  }
  const { default: html2pdf } = await import('html2pdf.js')
  const custName = filterCustomer.value ? customerName(filterCustomer.value) : 'Semua Customer'
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2 style="margin-bottom: 4px;">Laporan Service History Mandiri</h2>
      <p style="color: #666; margin-top: 0; font-size: 13px;">Customer: <strong>${custName}</strong> | Tanggal Export: ${new Date().toLocaleDateString('en-GB')}</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px;">
        <thead>
          <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
            <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">No. DO</th>
            <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">Tanggal</th>
            <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">Customer</th>
            <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">Unit / Product</th>
            <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">Problem</th>
            <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">Action</th>
            <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">Teknisi</th>
            <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">Job Order</th>
            <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${standaloneList.value.map((d: any) => {
            const linkedJO = findJobOrderForDO(d.id)
            return `
            <tr>
              <td style="padding: 8px; border: 1px solid #e2e8f0;">${d.do_number || '-'}</td>
              <td style="padding: 8px; border: 1px solid #e2e8f0;">${d.delivery_date ? new Date(d.delivery_date).toLocaleDateString('en-GB') : '-'}</td>
              <td style="padding: 8px; border: 1px solid #e2e8f0;">${customerName(d.customer_id)}</td>
              <td style="padding: 8px; border: 1px solid #e2e8f0;">${productSummary(d)}</td>
              <td style="padding: 8px; border: 1px solid #e2e8f0;">${d.problem || d.notes || '-'}</td>
              <td style="padding: 8px; border: 1px solid #e2e8f0;">${d.action || '-'}</td>
              <td style="padding: 8px; border: 1px solid #e2e8f0;">${technicianName(d.technician_id)}</td>
              <td style="padding: 8px; border: 1px solid #e2e8f0;">${linkedJO ? linkedJO.job_order_no : '-'}</td>
              <td style="padding: 8px; border: 1px solid #e2e8f0;">${String(d.status || '-').toUpperCase().replace('_', ' ')}</td>
            </tr>
          `}).join('')}
        </tbody>
      </table>
    </div>
  `
  const opt = {
    margin: 0.3,
    filename: `Service_History_${Date.now()}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }
  }
  html2pdf().set(opt).from(htmlContent).save()
}
</script>

<template>
  <div class="standalone-page">
    <PageHeader
      title="Service History Mandiri"
      button-label="Buat Form Baru"
      permission="delivery_order:create"
      @add="openAdd"
    >
      <template #actions>
        <button class="btn btn-outline btn-header-action" @click="exportPdf">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Export PDF
        </button>
        <button class="btn btn-outline btn-header-action" @click="exportExcel">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="17"></line><line x1="16" y1="13" x2="8" y2="17"></line></svg>
          Export Excel
        </button>
      </template>
    </PageHeader>

    <div class="info-alert mb-4">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <div>
        <strong>Service History Mandiri:</strong> CS mengisi <strong>Customer Detail</strong>, teknisi mengisi <strong>Product Detail</strong> di menu teknisi.
        <div class="text-xs" style="margin-top: 2px;">
          Gunakan tombol <strong>Assign</strong> untuk menugaskan teknisi dan membuat <strong>Job Order</strong> secara otomatis di Job Orders.
        </div>
      </div>
    </div>

    <div class="filter-bar mb-4">
      <div class="filter-item">
        <span class="filter-label">Filter Customer:</span>
        <CustomSelect v-model="filterCustomer" :options="filterCustomerOptions" class="form-select flex-1" />
      </div>
      <div class="filter-item">
        <span class="filter-label">Filter Teknisi:</span>
        <CustomSelect v-model="filterTechnician" :options="filterTechnicianOptions" class="form-select flex-1" />
      </div>
    </div>

    <!-- Wide table container with horizontal scroll support -->
    <div class="standalone-table-card">
      <DataTable :columns="columns" :data="standaloneList" search-placeholder="Cari customer, DO, atau tanggal...">
        <template #cell-do_number="{ value }">
          <span class="badge badge-secondary font-mono">{{ value || '-' }}</span>
        </template>
        <template #cell-customer_id="{ value, row }">
          <div class="font-medium">{{ customerName(value) }}</div>
          <div class="text-xs text-muted" v-if="row.delivery_address">{{ row.delivery_address }}</div>
        </template>
        <template #cell-delivery_date="{ value }">
          <span class="text-nowrap">{{ value ? new Date(value).toLocaleDateString('en-GB') : '-' }}</span>
        </template>
        <template #cell-items="{ row }">
          <div class="text-xs product-summary-link" @click="openDetail(row)" :title="productSummary(row)">
            {{ productSummary(row) }}
          </div>
        </template>
        <template #cell-status="{ row }">
          <span class="badge" :class="statusClass(row)">
            {{ statusLabel(row) }}
          </span>
        </template>
        <template #cell-technician_id="{ value }">
          <span class="text-nowrap">{{ technicianName(value) }}</span>
        </template>
        <template #cell-job_order="{ row }">
          <template v-if="findJobOrderForDO(row.id)">
            <span class="badge badge-primary jo-badge">
              {{ findJobOrderForDO(row.id).job_order_no }}
            </span>
            <div class="text-xs text-muted">
              {{ String(findJobOrderForDO(row.id).status || '').toUpperCase().replace('_', ' ') }}
            </div>
          </template>
          <span v-else class="text-xs text-muted">—</span>
        </template>
        <template #actions="{ row }">
          <div class="action-buttons">
            <button class="btn btn-sm btn-outline" @click="openDetail(row)" title="Lihat Detail Pekerjaan">
              Detail
            </button>
            <button
              v-if="can('delivery_order:update')"
              class="btn btn-sm btn-outline btn-edit-action"
              @click="openEdit(row)"
              title="Edit Detail Customer"
            >
              Edit
            </button>
            <button
              v-if="can('job_order:create') || can('delivery_order:update')"
              class="btn btn-sm btn-outline btn-assign-action"
              @click="openAssign(row)"
              :title="findJobOrderForDO(row.id) ? 'Re-assign Job Order' : 'Assign ke Job Order'"
            >
              {{ findJobOrderForDO(row.id) ? 'Re-assign' : 'Assign' }}
            </button>
            <button
              v-if="can('delivery_order:read') && (row.status !== 'pending' || hasDeliveryHistory(row))"
              class="btn btn-sm btn-outline"
              @click="handlePrint(row)"
              title="Print Report"
            >
              Print
            </button>
            <button
              v-if="can('delivery_order:delete')"
              class="btn btn-sm btn-outline btn-danger"
              @click="openDelete(row)"
              title="Hapus Data (Soft Delete)"
            >
              Hapus
            </button>
            <button
              v-if="hardDelete.isSuperadmin"
              class="btn btn-sm btn-outline btn-hard-delete"
              @click="hardDelete.open(row)"
              title="Hapus Permanen dari Database (Superadmin)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 3px;">
                <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"></path>
              </svg>
              Hard Delete
            </button>
          </div>
        </template>
      </DataTable>
    </div>

    <!-- ═══ MODAL ADD / EDIT ═══ -->
    <FormModal :open="showModal" :title="editingItem ? 'Edit Customer Detail' : 'Buat Service History Mandiri'" max-width="640px" @close="showModal = false" @submit="handleSubmit">
      <div class="section-title">Customer Detail — diisi CS</div>
      <div class="form-group">
        <label class="form-label">Customer <span class="text-danger">*</span></label>
        <CustomSelect v-model="form.customer_id" :options="customerOptions" placeholder="-- Pilih Customer --" class="form-select" />
      </div>
      <div class="form-group">
        <label class="form-label">Project Name</label>
        <input v-model="form.project_name" type="text" class="form-input" placeholder="Pengantaran [Nama Produk / Unit] ke [Alamat Penerima]" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Tipe Customer</label>
          <CustomSelect v-model="form.customer_category" :options="customerCategoryOptions" class="form-select" />
        </div>
        <div class="form-group">
          <label class="form-label">Tanggal Kunjungan</label>
          <input v-model="form.delivery_date" type="date" class="form-input" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Alamat Instalasi / Kunjungan</label>
        <textarea v-model="form.delivery_address" class="form-textarea" rows="2" placeholder="Alamat lengkap customer..."></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Nama PIC / Penerima</label>
          <input v-model="form.recipient_name" type="text" class="form-input" placeholder="Nama PIC" />
        </div>
        <div class="form-group">
          <label class="form-label">No. HP PIC</label>
          <input v-model="form.recipient_phone" type="text" class="form-input" placeholder="08xx..." />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Teknisi (opsional, atau gunakan tombol Assign)</label>
        <CustomSelect v-model="form.technician_id" :options="technicianOptions" placeholder="-- Tanpa penunjukan langsung --" class="form-select" />
        <span class="form-hint">Dapat di-assign langsung nanti melalui tombol "Assign" di tabel.</span>
      </div>
      <div class="form-group">
        <label class="form-label">Catatan / Keluhan Awal</label>
        <textarea v-model="form.notes" class="form-textarea" rows="2" placeholder="Keluhan dari customer..."></textarea>
      </div>
      <template #footer>
        <button type="button" class="btn btn-outline" @click="showModal = false">Batal</button>
        <button type="button" class="btn btn-primary" :disabled="isSaving" @click="handleSubmit">
          {{ isSaving ? 'Menyimpan...' : (editingItem ? 'Simpan Customer Detail' : 'Buat Form') }}
        </button>
      </template>
    </FormModal>

    <!-- ═══ MODAL ASSIGN → BUAT JOB ORDER ═══ -->
    <FormModal
      :open="showAssignModal"
      :title="findJobOrderForDO(assigningRow?.id) ? 'Re-assign Job Order' : 'Assign ke Job Order'"
      max-width="560px"
      @close="showAssignModal = false"
      @submit="handleAssignSubmit"
    >
      <div v-if="assigningRow" class="assign-summary-box mb-4">
        <div><strong>No. DO:</strong> {{ assigningRow.do_number || '-' }}</div>
        <div><strong>Customer:</strong> {{ customerName(assigningRow.customer_id) }}</div>
        <div v-if="assigningRow.delivery_address"><strong>Alamat:</strong> {{ assigningRow.delivery_address }}</div>
        <div v-if="findJobOrderForDO(assigningRow.id)" class="mt-xs">
          <strong>Job Order Terhubung:</strong>
          <span class="badge badge-primary jo-badge ml-1">{{ findJobOrderForDO(assigningRow.id).job_order_no }}</span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Pilih Teknisi <span class="text-danger">*</span></label>
        <CustomSelect
          v-model="assignForm.technician_id"
          :options="assignTechOptions"
          placeholder="-- Pilih Teknisi --"
          class="form-select"
        />
      </div>

      <div class="form-group">
        <label class="form-label">Tanggal & Waktu Jadwal</label>
        <input v-model="assignForm.scheduled_date" type="datetime-local" class="form-input" />
      </div>

      <div class="form-group">
        <label class="form-label">Instruksi / Catatan untuk Teknisi</label>
        <textarea
          v-model="assignForm.instructions"
          class="form-textarea"
          rows="3"
          placeholder="Instruksi pengerjaan teknisi..."
        ></textarea>
      </div>

      <div class="assign-note">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="10" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>
          Setelah di-assign, sistem otomatis membuat <strong>Job Order</strong> sehingga tugas ini langsung muncul di <strong>Job Orders</strong> dan dashboard teknisi terkait.
        </span>
      </div>

      <template #footer>
        <button type="button" class="btn btn-outline" @click="showAssignModal = false" :disabled="isAssigning">Batal</button>
        <button type="button" class="btn btn-primary" :disabled="isAssigning" @click="handleAssignSubmit">
          {{ isAssigning ? 'Menyimpan...' : (findJobOrderForDO(assigningRow?.id) ? 'Update Assignment' : 'Assign & Buat Job Order') }}
        </button>
      </template>
    </FormModal>

    <!-- ═══ MODAL DELETE (SOFT DELETE) ═══ -->
    <ConfirmDialog
      :open="showDelete"
      title="Hapus Service History"
      :message="`Apakah Anda yakin ingin menghapus '${deletingItem?.do_number || ''}'? Jika ada Job Order terkait, Job Order juga akan dihapus.`"
      confirm-label="Hapus"
      variant="danger"
      @close="showDelete = false"
      @confirm="handleDelete"
    />

    <!-- ═══ MODAL HARD DELETE (SUPERADMIN) ═══ -->
    <HardDeleteDialog
      :open="hardDelete.show"
      title="Hapus Permanen Service History"
      :item-label="hardDelete.expected"
      :expected="hardDelete.expected"
      :confirm-valid="hardDelete.confirmed"
      @update:input="hardDelete.input = $event"
      @confirm="hardDelete.confirm"
      @close="hardDelete.close"
    />

    <!-- ═══ MODAL DETAIL ═══ -->
    <FormModal :open="showDetailModal" title="Detail Pekerjaan Teknisi" max-width="500px" @close="showDetailModal = false">
      <div v-if="detailItem" class="detail-content">
        <div class="info-group">
          <label>Unit / Product:</label>
          <div style="font-weight: 500;">{{ productSummary(detailItem) }}</div>
        </div>
        <div class="info-group mt-sm">
          <label>Problem / Kendala:</label>
          <div class="box">{{ detailItem.problem || '-' }}</div>
        </div>
        <div class="info-group mt-sm">
          <label>Action / Repair:</label>
          <div class="box">{{ detailItem.action || '-' }}</div>
        </div>
        <div class="form-row mt-sm">
          <div class="info-group">
            <label>Time In:</label>
            <div style="font-weight: 500;">{{ detailItem.time_in || '-' }}</div>
          </div>
          <div class="info-group">
            <label>Time Out:</label>
            <div style="font-weight: 500;">{{ detailItem.time_out || '-' }}</div>
          </div>
        </div>
        <div class="form-row mt-sm">
          <div class="info-group">
            <label>Tested:</label>
            <div style="font-weight: 500;" :class="detailItem.is_tested ? 'text-success' : ''">{{ detailItem.is_tested ? 'YES' : 'NO' }}</div>
          </div>
          <div class="info-group">
            <label>Completed:</label>
            <div style="font-weight: 500;" :class="detailItem.is_completed ? 'text-success' : ''">{{ detailItem.is_completed ? 'YES' : 'NO' }}</div>
          </div>
        </div>
        <div v-if="detailItem.photo_before || detailItem.photo_after" class="form-row mt-sm">
          <div class="info-group">
            <label>Foto Awal:</label>
            <div v-if="detailItem.photo_before" class="photo-preview">
              <img :src="detailItem.photo_before" alt="Foto Awal" />
            </div>
            <div v-else class="text-muted text-xs">Tidak ada</div>
          </div>
          <div class="info-group">
            <label>Foto Akhir:</label>
            <div v-if="detailItem.photo_after" class="photo-preview">
              <img :src="detailItem.photo_after" alt="Foto Akhir" />
            </div>
            <div v-else class="text-muted text-xs">Tidak ada</div>
          </div>
        </div>
      </div>
      <template #footer>
        <button type="button" class="btn btn-outline" style="width: 100%;" @click="showDetailModal = false">Tutup</button>
      </template>
    </FormModal>

    <!-- ═══ MODAL PRINT ═══ -->
    <FormModal :open="printModalOpen" title="Pilih Format Print" @close="printModalOpen = false" @submit="handleConfirmPrint">
      <div class="form-group">
        <label class="form-label">Tipe Format Report</label>
        <CustomSelect v-model="printType" :options="printTypeOptions" class="form-select" />
      </div>
      <template #footer>
        <button type="button" class="btn btn-outline" @click="printModalOpen = false">Batal</button>
        <button type="button" class="btn btn-primary" @click="handleConfirmPrint">Print / Download</button>
      </template>
    </FormModal>
  </div>
</template>

<style scoped>
.standalone-page {
  display: flex;
  flex-direction: column;
}

.btn-header-action {
  display: flex;
  align-items: center;
  gap: 6px;
}

.section-title {
  background: var(--color-primary-surface, #eff6ff);
  color: var(--color-primary, #2563eb);
  font-weight: 700;
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 12px;
}
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.form-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-muted);
}
.info-alert {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 13px;
}
.mb-4 { margin-bottom: 16px; }
.font-medium { font-weight: 600; }
.font-mono { font-family: ui-monospace, monospace; }
.text-xs { font-size: 12px; }
.text-muted { color: var(--color-text-muted); }
.text-nowrap { white-space: nowrap; }
.btn-danger { color: var(--color-danger, #dc2626); }
.btn-danger:hover {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #b91c1c;
}

.filter-bar {
  display: flex;
  gap: 1rem;
  align-items: center;
  background: var(--color-surface, #fff);
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid var(--color-border-light);
  flex-wrap: wrap;
}
.filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 260px;
}
.filter-label {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.flex-1 { flex: 1; }
.mt-xs { margin-top: 4px; }
.ml-1 { margin-left: 4px; }

/* ── Wide Card Wrapper for Table ── */
.standalone-table-card {
  background: var(--color-surface, #fff);
  border-radius: 10px;
  border: 1px solid var(--color-border-light);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05));
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

:deep(.data-table) {
  min-width: 1100px;
}

.jo-badge {
  font-family: ui-monospace, monospace;
  font-weight: 700;
  letter-spacing: 0.02em;
}

/* ── Action Buttons Group ── */
.action-buttons {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.btn-edit-action {
  color: #d97706;
  border-color: #fcd34d;
}
.btn-edit-action:hover {
  background: #fef3c7;
  color: #b45309;
}

.btn-assign-action {
  color: #2563eb;
  border-color: #bfdbfe;
}
.btn-assign-action:hover {
  background: #eff6ff;
  color: #1d4ed8;
}

.btn-hard-delete {
  background: rgba(153, 27, 27, 0.08);
  color: #991b1b;
  border: 1px dashed #991b1b;
  display: inline-flex;
  align-items: center;
}
.btn-hard-delete:hover {
  background: #991b1b;
  color: #fff;
  border-style: solid;
}

.assign-summary-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.assign-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: #475569;
  background: #f1f5f9;
  padding: 8px 12px;
  border-radius: 6px;
  margin-top: 12px;
}

@media (max-width: 640px) {
  .form-row { grid-template-columns: 1fr; }
}

.product-summary-link {
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 3px;
  transition: color 0.2s;
}
.product-summary-link:hover {
  color: var(--color-primary, #2563eb);
}
.info-group label {
  display: block;
  font-weight: 600;
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 4px;
}
.box {
  background: var(--color-surface-sunken, #f8fafc);
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  white-space: pre-wrap;
  border: 1px solid var(--color-border-light);
}
.mt-sm { margin-top: 16px; }
.text-success { color: #16a34a; }
.photo-preview img {
  max-width: 100%;
  max-height: 200px;
  border-radius: 8px;
  object-fit: contain;
  background: var(--color-surface-sunken, #f8fafc);
  border: 1px solid var(--color-border-light);
}
</style>
