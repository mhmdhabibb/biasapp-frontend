<script setup lang="ts">
import { computed, reactive, ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/ui/PageHeader.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import { useHardDelete } from '@/composables/useHardDelete'
import { useMasterStore } from '@/composables/useMasterStore'
import { resources } from '@/services/resource.service'
import { useToast } from '@/composables/useToast'
import type { TableColumn } from '@/types'

const toast = useToast()
const master = useMasterStore()
const route = useRoute()
const { ensureResourcesLoaded } = master

onMounted(() => {
  ensureResourcesLoaded(route.path)
  void loadUndeliveredSources()
})

const {
  sparepartRequests,
  serviceReports,
  products,
  customers,
  units,
  findProduct,
  findServiceReport,
  findCustomer,
  findUnit,
  findTechnician,
} = master

const hardDelete = useHardDelete(
  (id, cascade) => resources.serviceSpareparts.hardRemove(id, cascade),
  () => master.refreshInBackground(),
  'service_sparepart:delete',
)

// --- Filter State ---
const activeTab = ref<'all' | 'sale' | 'rental' | 'service_report'>('all')
const filterStatus = ref<string>('')
const searchQuery = ref<string>('')

// --- Undelivered Sources State (Sales & Rentals belum diantar) ---
const undeliveredSales = ref<any[]>([])
const undeliveredRentals = ref<any[]>([])
const loadingSources = ref(false)

async function loadUndeliveredSources() {
  loadingSources.value = true
  try {
    const res: any = await (resources.serviceSpareparts as any).getUndeliveredSources()
    const data = res?.data || res || {}
    undeliveredSales.value = data.sales || []
    undeliveredRentals.value = data.rentals || []
  } catch (err) {
    console.warn('Gagal memuat transaksi belum diantar:', err)
  } finally {
    loadingSources.value = false
  }
}

// --- Columns ---
const columns: TableColumn[] = [
  { key: 'request_no', label: 'Request No' },
  { key: 'reference', label: 'Referensi & Transaksi' },
  { key: 'customer', label: 'Customer' },
  { key: 'unit', label: 'Unit Mesin & SN' },
  { key: 'product_id', label: 'Sparepart Item' },
  { key: 'qty', label: 'Qty' },
  { key: 'requester', label: 'Pemohon' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Tanggal' },
]

// --- Filtered Data ---
const filteredRequests = computed(() => {
  let list = sparepartRequests.value as any[]

  // Tab filter
  if (activeTab.value !== 'all') {
    list = list.filter((r) => {
      const refType = r.reference_type || (r.sale_id ? 'sale' : r.rental_id ? 'rental' : 'service_report')
      return refType === activeTab.value
    })
  }

  // Status filter
  if (filterStatus.value) {
    list = list.filter((r) => String(r.status || 'pending').toLowerCase() === filterStatus.value.toLowerCase())
  }

  // Search filter
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    list = list.filter((r) => {
      const reqNo = String(r.request_no || '').toLowerCase()
      const grpNo = String(r.group_no || '').toLowerCase()
      const itemName = String(r.item_name || r.product?.name || '').toLowerCase()
      const custName = String(getCustomerName(r)).toLowerCase()
      const refNo = String(getReferenceNo(r)).toLowerCase()
      const notes = String(r.notes || '').toLowerCase()
      return (
        reqNo.includes(q) ||
        grpNo.includes(q) ||
        itemName.includes(q) ||
        custName.includes(q) ||
        refNo.includes(q) ||
        notes.includes(q)
      )
    })
  }

  return list
})

// Counts per tab
const countAll = computed(() => (sparepartRequests.value as any[]).length)
const countSale = computed(
  () => (sparepartRequests.value as any[]).filter((r) => r.reference_type === 'sale' || r.sale_id).length,
)
const countRental = computed(
  () => (sparepartRequests.value as any[]).filter((r) => r.reference_type === 'rental' || r.rental_id).length,
)
const countService = computed(
  () =>
    (sparepartRequests.value as any[]).filter(
      (r) => !r.sale_id && !r.rental_id && (r.service_report_id || r.reference_type === 'service_report'),
    ).length,
)

// --- Modal State & Multi-Item Request Form ---
interface RequestItem {
  id: string
  source_type: 'db' | 'manual'
  product_id: string
  item_name: string
  qty: number
  notes: string
}

const showModal = ref(false)
const saving = ref(false)
const editingRequest = ref<any>(null)

const form = reactive({
  reference_type: 'sale' as 'sale' | 'rental' | 'service_report' | 'general',
  sale_id: '',
  rental_id: '',
  service_report_id: '',
  customer_id: '',
  unit_id: '',
  general_notes: '',
  items: [] as RequestItem[],
})

const filterOnlyUndelivered = ref(false)

// Edit-only single item form
const editForm = reactive({
  source_type: 'db' as 'db' | 'manual',
  product_id: '',
  item_name: '',
  qty: 1,
  status: 'pending',
  notes: '',
})

function createNewItem(): RequestItem {
  return {
    id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    source_type: 'db',
    product_id: '',
    item_name: '',
    qty: 1,
    notes: '',
  }
}

function addItem() {
  form.items.push(createNewItem())
}

function removeItem(index: number) {
  if (form.items.length > 1) {
    form.items.splice(index, 1)
  }
}

// Filtered Sources based on undelivered checkbox
const displayedSales = computed(() => {
  if (filterOnlyUndelivered.value) {
    return undeliveredSales.value.filter((s) => s.is_undelivered)
  }
  return undeliveredSales.value
})

const displayedRentals = computed(() => {
  if (filterOnlyUndelivered.value) {
    return undeliveredRentals.value.filter((r) => r.is_undelivered)
  }
  return undeliveredRentals.value
})

// Available Units for the selected Transaction
const availableUnits = computed(() => {
  if (form.reference_type === 'sale' && form.sale_id) {
    const sl = undeliveredSales.value.find((s) => s.id === form.sale_id)
    return sl?.units || []
  }
  if (form.reference_type === 'rental' && form.rental_id) {
    const r = undeliveredRentals.value.find((rn) => rn.id === form.rental_id)
    return r?.units || []
  }
  if (form.reference_type === 'service_report' && form.service_report_id) {
    const sr = (serviceReports.value as any[]).find((s) => s.id === form.service_report_id)
    if (sr?.unit) return [sr.unit]
    if (sr?.unit_id) {
      const u = findUnit(sr.unit_id)
      return u ? [u] : []
    }
  }
  return []
})

// Options for Dropdowns
const saleOptions = computed(() =>
  displayedSales.value.map((s) => {
    const statusTag = s.is_undelivered ? ' [Belum Diantar]' : ' [Terkirim]'
    const unitCount = s.units?.length ? ` - ${s.units.length} Unit` : ''
    return {
      value: s.id,
      label: `[${s.sale_no}] ${s.customer_name || 'Customer'}${unitCount}${statusTag}`,
    }
  }),
)

const rentalOptions = computed(() =>
  displayedRentals.value.map((r) => {
    const statusTag = r.is_undelivered ? ' [Belum Diantar]' : ' [Berjalan]'
    const unitCount = r.units?.length ? ` - ${r.units.length} Unit` : ''
    return {
      value: r.id,
      label: `[${r.rental_no}] ${r.customer_name || 'Customer'}${unitCount}${statusTag}`,
    }
  }),
)

const customerOptions = computed(() =>
  (customers.value as any[]).map((c: any) => ({
    value: c.id,
    label: c.company_name || c.name || 'Unnamed Customer',
  })),
)

const serviceReportOptions = computed(() =>
  (serviceReports.value as any[]).map((sr: any) => ({
    value: sr.id,
    label: `[${sr.report_no || sr.service_report_no || 'SR'}] ${sr.customer?.company_name || sr.customer?.name || 'Customer'}`,
  })),
)

const unitOptions = computed(() => {
  const specificUnits = availableUnits.value.map((u: any) => ({
    value: u.id,
    label: `[Unit Transaksi] ${u.name || u.model || 'Unit'}${u.serial_no ? ` (SN: ${u.serial_no})` : ''}`,
  }))

  const otherUnits = (units.value as any[])
    .filter((u: any) => !availableUnits.value.some((au: any) => au.id === u.id))
    .map((u: any) => ({
      value: u.id,
      label: `${u.name || u.model || 'Unit'}${u.serial_no ? ` (SN: ${u.serial_no})` : ''}`,
    }))

  return [
    { value: '', label: '-- Semua Unit Terkait / Belum Ditentukan --' },
    ...specificUnits,
    ...otherUnits,
  ]
})

const allUnitOptions = computed(() => [
  { value: '', label: '-- Pilih Unit (Opsional) --' },
  ...(units.value as any[]).map((u: any) => ({
    value: u.id,
    label: `${u.name || u.model || 'Unit'}${u.serial_no ? ` (SN: ${u.serial_no})` : ''}`,
  })),
])

const productOptions = computed(() =>
  (products.value as any[]).map((p: any) => ({
    value: p.id,
    label: `${p.name} (Stok: ${p.stock ?? 0} ${p.uom?.name || p.unit || 'pcs'})`,
  })),
)

// Selected transaction details preview
const selectedTransactionPreview = computed(() => {
  if (form.reference_type === 'sale' && form.sale_id) {
    const sl = undeliveredSales.value.find((s) => s.id === form.sale_id)
    if (!sl) return null
    return {
      title: `Penjualan (Sales) ${sl.sale_no}`,
      customer: sl.customer_name,
      address: sl.installation_address || '-',
      unitCount: sl.units?.length || 0,
      badge: sl.is_undelivered ? 'Sales (Belum Diantar - Otomatis Ikut DO)' : 'Sales (Sudah Diantar)',
      badgeClass: sl.is_undelivered ? 'badge-sale' : 'badge-completed',
    }
  }
  if (form.reference_type === 'rental' && form.rental_id) {
    const r = undeliveredRentals.value.find((rn) => rn.id === form.rental_id)
    if (!r) return null
    return {
      title: `Sewa Mesin (Rental) ${r.rental_no}`,
      customer: r.customer_name,
      address: r.installation_address || '-',
      unitCount: r.units?.length || 0,
      badge: r.is_undelivered ? 'Rental (Belum Diantar - Otomatis Ikut DO)' : 'Rental (Sedang Berjalan)',
      badgeClass: r.is_undelivered ? 'badge-rental' : 'badge-completed',
    }
  }
  if (form.reference_type === 'service_report' && form.service_report_id) {
    const sr = (serviceReports.value as any[]).find((s) => s.id === form.service_report_id)
    if (!sr) return null
    return {
      title: `Service Report ${sr.report_no || sr.service_report_no}`,
      customer: sr.customer?.company_name || sr.customer?.name || '-',
      address: sr.address || '-',
      unitCount: sr.unit ? 1 : 0,
      badge: 'Service Report',
      badgeClass: 'badge-service',
    }
  }
  if (form.reference_type === 'general' && form.customer_id) {
    const c = (customers.value as any[]).find((cust: any) => cust.id === form.customer_id)
    return {
      title: 'Permintaan Sparepart Langsung',
      customer: c?.company_name || c?.name || '-',
      address: c?.address || '-',
      unitCount: form.unit_id ? 1 : 0,
      badge: 'Permintaan Langsung',
      badgeClass: 'badge-service',
    }
  }
  return null
})

// Auto-select unit when transaction changes
watch(
  () => form.sale_id,
  (newVal) => {
    if (newVal && form.reference_type === 'sale') {
      const sl = undeliveredSales.value.find((s) => s.id === newVal)
      if (sl?.customer_id) form.customer_id = sl.customer_id
      if (sl?.units?.length === 1) {
        form.unit_id = sl.units[0].id
      } else {
        form.unit_id = ''
      }
    }
  },
)

watch(
  () => form.rental_id,
  (newVal) => {
    if (newVal && form.reference_type === 'rental') {
      const r = undeliveredRentals.value.find((rn) => rn.id === newVal)
      if (r?.customer_id) form.customer_id = r.customer_id
      if (r?.units?.length === 1) {
        form.unit_id = r.units[0].id
      } else {
        form.unit_id = ''
      }
    }
  },
)

watch(
  () => form.service_report_id,
  (newVal) => {
    if (newVal && form.reference_type === 'service_report') {
      const sr = (serviceReports.value as any[]).find((s) => s.id === newVal)
      if (sr?.customer_id) form.customer_id = sr.customer_id
      if (sr?.unit_id) form.unit_id = sr.unit_id
    }
  },
)

// Actions
function openAdd() {
  editingRequest.value = null
  form.reference_type = 'sale'
  form.sale_id = ''
  form.rental_id = ''
  form.service_report_id = ''
  form.customer_id = ''
  form.unit_id = ''
  form.general_notes = ''
  form.items = [createNewItem()]

  void loadUndeliveredSources()
  showModal.value = true
}

function openEdit(row: any) {
  editingRequest.value = row
  editForm.source_type = row.product_id ? 'db' : 'manual'
  editForm.product_id = row.product_id || ''
  editForm.item_name = row.item_name || row.product?.name || ''
  editForm.qty = row.qty || 1
  editForm.status = row.status || 'pending'
  editForm.notes = row.notes || ''
  showModal.value = true
}

async function handleDelete(row: any) {
  if (!confirm(`Hapus sparepart request ${row.request_no || ''}?`)) return
  try {
    await resources.serviceSpareparts.remove(row.id)
    await master.refreshInBackground()
    toast.success('Sparepart request berhasil dihapus')
  } catch (err: any) {
    toast.error(toast.fromError(err, 'Gagal menghapus sparepart request'))
  }
}

async function handleSubmit() {
  // If Edit Mode
  if (editingRequest.value) {
    let finalProductId: string | null = null
    let finalItemName = editForm.item_name.trim()

    if (editForm.source_type === 'db') {
      if (!editForm.product_id) {
        toast.warning('Pilih sparepart dari database')
        return
      }
      finalProductId = editForm.product_id
      const p = (products.value as any[]).find((x: any) => String(x.id) === String(finalProductId))
      if (p) finalItemName = p.name
    } else {
      if (!finalItemName) {
        toast.warning('Ketik nama sparepart manual')
        return
      }
      finalProductId = null
    }

    if (editForm.qty < 1) {
      toast.warning('Jumlah (qty) minimal 1')
      return
    }

    saving.value = true
    try {
      await resources.serviceSpareparts.update(editingRequest.value.id, {
        product_id: finalProductId,
        item_name: finalItemName,
        qty: Number(editForm.qty),
        status: editForm.status,
        notes: editForm.notes,
      })
      toast.success('Sparepart request berhasil diperbarui')
      await master.refreshInBackground()
      showModal.value = false
    } catch (err) {
      toast.error(toast.fromError(err, 'Gagal memperbarui sparepart request'))
    } finally {
      saving.value = false
    }
    return
  }

  // --- Add Mode (Multi-Item Request) ---
  if (form.reference_type === 'sale' && !form.sale_id) {
    toast.warning('Pilih dokumen Penjualan (Sales)')
    return
  }
  if (form.reference_type === 'rental' && !form.rental_id) {
    toast.warning('Pilih dokumen Rental Mesin')
    return
  }
  if (form.reference_type === 'service_report' && !form.service_report_id) {
    toast.warning('Pilih dokumen Service Report')
    return
  }
  if (form.reference_type === 'general' && !form.customer_id) {
    toast.warning('Pilih Customer / Perusahaan')
    return
  }

  // Validate items
  const validItems: any[] = []
  for (let idx = 0; idx < form.items.length; idx++) {
    const it = form.items[idx]
    let pId: string | null = null
    let name = it.item_name.trim()

    if (it.source_type === 'db') {
      if (!it.product_id) {
        toast.warning(`Pilih produk/sparepart pada baris ke-${idx + 1}`)
        return
      }
      pId = it.product_id
      const p = (products.value as any[]).find((x: any) => String(x.id) === String(pId))
      if (p) name = p.name
    } else {
      if (!name) {
        toast.warning(`Masukkan nama sparepart manual pada baris ke-${idx + 1}`)
        return
      }
      pId = null
    }

    const qty = Number(it.qty) || 1
    if (qty < 1) {
      toast.warning(`Jumlah (qty) baris ke-${idx + 1} minimal 1`)
      return
    }

    validItems.push({
      product_id: pId,
      item_name: name,
      qty,
      notes: it.notes || '',
    })
  }

  if (validItems.length === 0) {
    toast.warning('Tambahkan minimal 1 item sparepart')
    return
  }

  saving.value = true
  try {
    const payload = {
      reference_type: form.reference_type,
      sale_id: form.reference_type === 'sale' ? form.sale_id : null,
      rental_id: form.reference_type === 'rental' ? form.rental_id : null,
      service_report_id: form.reference_type === 'service_report' ? form.service_report_id : null,
      customer_id: form.customer_id || null,
      unit_id: form.unit_id || null,
      notes: form.general_notes || '',
      items: validItems,
    }

    await resources.serviceSpareparts.create(payload)
    toast.success(`Berhasil membuat permintaan ${validItems.length} sparepart!`)
    await master.refreshInBackground()
    showModal.value = false
  } catch (err) {
    toast.error(toast.fromError(err, 'Gagal membuat permintaan sparepart'))
  } finally {
    saving.value = false
  }
}

// --- Display Helpers ---
function getProduct(row: any) {
  if (row?.item_name) return row.item_name
  const id = row?.product_id ?? row
  return (row as any)?.product?.name || findProduct(id as any)?.name || '-'
}

function getReferenceNo(row: any) {
  if (row?.reference_type === 'sale' || row?.sale_id) {
    return row?.sale?.sale_no || 'Sales'
  }
  if (row?.reference_type === 'rental' || row?.rental_id) {
    return row?.rental?.rental_no || 'Rental'
  }
  const sr = row?.service_report || (row?.service_report_id ? findServiceReport(row.service_report_id) : null)
  return sr?.report_no || (sr as any)?.service_report_no || (row?.service_report_id ? 'Service Report' : '-')
}

function getCustomerName(row: any) {
  if (row?.customer?.company_name) return row.customer.company_name
  if (row?.customer?.name) return row.customer.name
  if (row?.sale?.customer?.company_name) return row.sale.customer.company_name
  if (row?.rental?.customer?.company_name) return row.rental.customer.company_name
  if (row?.service_report?.customer?.company_name) return row.service_report.customer.company_name
  if (row?.customer_id) {
    const c = findCustomer(row.customer_id)
    if (c?.company_name) return c.company_name
    if (c?.name) return c.name
  }
  return '-'
}

function getUnitName(row: any) {
  const u = row?.unit || (row?.unit_id ? findUnit(row.unit_id) : null) || row?.service_report?.unit
  if (!u) return '-'
  const model = u.model || u.name || 'Unit'
  const sn = u.serial_no ? `SN: ${u.serial_no}` : ''
  return sn ? `${model} (${sn})` : model
}

function getRequester(row: any) {
  if (row?.user?.name || row?.user?.username) {
    return `${row.user.name || row.user.username} (Admin)`
  }
  const tech = row?.technician || (row?.technician_id ? findTechnician(row.technician_id) : null)
  if (tech) {
    return tech.user?.name || tech.user?.username || tech.name || 'Teknisi'
  }
  return '-'
}
</script>

<template>
  <div class="sparepart-requests-page">
    <PageHeader
      title="Sparepart Requests"
      button-label="+ Request Sparepart"
      permission="service_sparepart:create"
      @add="openAdd"
    />

    <!-- Filter Bar & Tabs -->
    <div class="filter-bar-wrapper">
      <div class="tabs-group">
        <button
          type="button"
          class="tab-pill"
          :class="{ active: activeTab === 'all' }"
          @click="activeTab = 'all'"
        >
          Semua Referensi
          <span class="tab-badge">{{ countAll }}</span>
        </button>
        <button
          type="button"
          class="tab-pill tab-pill--sale"
          :class="{ active: activeTab === 'sale' }"
          @click="activeTab = 'sale'"
        >
          🛒 Penjualan (Sales)
          <span class="tab-badge">{{ countSale }}</span>
        </button>
        <button
          type="button"
          class="tab-pill tab-pill--rental"
          :class="{ active: activeTab === 'rental' }"
          @click="activeTab = 'rental'"
        >
          🏢 Rental Mesin
          <span class="tab-badge">{{ countRental }}</span>
        </button>
        <button
          type="button"
          class="tab-pill tab-pill--service"
          :class="{ active: activeTab === 'service_report' }"
          @click="activeTab = 'service_report'"
        >
          🔧 Service Report
          <span class="tab-badge">{{ countService }}</span>
        </button>
      </div>

      <div class="filter-controls">
        <div class="control-item">
          <label class="control-label">Status:</label>
          <select v-model="filterStatus" class="form-select filter-select">
            <option value="">-- Semua Status --</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="ordered">Ordered</option>
            <option value="po_created">PO Created</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div class="control-item search-box">
          <input
            v-model="searchQuery"
            type="search"
            class="form-input search-input"
            placeholder="Cari Request No, Item, Customer..."
          />
        </div>
      </div>
    </div>

    <!-- Data Table -->
    <DataTable
      :columns="columns"
      :data="filteredRequests"
      permission="service_sparepart"
      :show-hard-delete="hardDelete.isSuperadmin"
      search-placeholder=""
      @edit="openEdit"
      @delete="handleDelete"
      @hard-delete="hardDelete.open"
    >
      <template #cell-request_no="{ row }">
        <div class="font-semibold text-slate-800">
          {{ row.request_no }}
        </div>
        <div v-if="row.group_no" class="batch-tag" title="Nomor Batch Multi-Item">
          Batch: {{ row.group_no }}
        </div>
      </template>

      <template #cell-reference="{ row }">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span
            v-if="row.reference_type === 'sale' || row.sale_id"
            class="ref-badge ref-badge--sale"
          >
            Sales
          </span>
          <span
            v-else-if="row.reference_type === 'rental' || row.rental_id"
            class="ref-badge ref-badge--rental"
          >
            Rental
          </span>
          <span
            v-else
            class="ref-badge ref-badge--service"
          >
            Service
          </span>
          <span class="font-mono text-sm font-medium text-slate-700">
            {{ getReferenceNo(row) }}
          </span>
        </div>
      </template>

      <template #cell-customer="{ row }">
        <div class="font-medium text-slate-800">
          {{ getCustomerName(row) }}
        </div>
      </template>

      <template #cell-unit="{ row }">
        <div class="text-sm text-slate-700">
          {{ getUnitName(row) }}
        </div>
      </template>

      <template #cell-product_id="{ row }">
        <div class="font-medium text-slate-900">
          {{ getProduct(row) }}
        </div>
        <div v-if="row.notes" class="text-xs text-slate-500 italic mt-0.5">
          "{{ row.notes }}"
        </div>
      </template>

      <template #cell-qty="{ row }">
        <span class="qty-badge">{{ row.qty || 1 }} pcs</span>
      </template>

      <template #cell-requester="{ row }">
        <div class="text-xs font-medium text-slate-700">
          {{ getRequester(row) }}
        </div>
      </template>

      <template #cell-status="{ value }">
        <span
          class="status-badge"
          :class="{
            'status-badge--success': value === 'po_created' || value === 'completed' || value === 'approved',
            'status-badge--warning': value === 'pending' || !value || value === 'ordered',
            'status-badge--danger': value === 'rejected',
          }"
        >
          {{ (value || 'pending').toUpperCase() }}
        </span>
      </template>

      <template #cell-created_at="{ value }">
        <span class="text-xs text-slate-500 font-mono">
          {{ value ? new Date(value).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }) : '-' }}
        </span>
      </template>
    </DataTable>

    <HardDeleteDialog
      :open="hardDelete.show"
      title="Hapus Permanen Sparepart Request"
      :item-label="hardDelete.expected"
      :expected="hardDelete.expected"
      :confirm-valid="hardDelete.confirmed"
      :show-cascade-option="true"
      :cascade="hardDelete.cascade"
      @update:cascade="hardDelete.cascade = $event"
      @update:input="hardDelete.input = $event"
      @confirm="hardDelete.confirm"
      @close="hardDelete.close"
    />

    <!-- ======================================================== -->
    <!-- MODAL: ADD / EDIT REQUEST SPAREPART                     -->
    <!-- ======================================================== -->
    <FormModal
      :title="editingRequest ? `Edit Sparepart Request (${editingRequest.request_no})` : 'Buat Permintaan Sparepart (Multi-Item)'"
      :open="showModal"
      :max-width="editingRequest ? '620px' : '980px'"
      @close="showModal = false"
      @submit="handleSubmit"
    >
      <!-- ================= EDIT MODE (Single Item) ================= -->
      <div v-if="editingRequest" class="modal-form-body">
        <div class="form-group mb-4">
          <label class="form-label font-semibold text-slate-700">Referensi Transaksi</label>
          <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm">
            <div><strong>No. Dokumen:</strong> {{ getReferenceNo(editingRequest) }}</div>
            <div><strong>Customer:</strong> {{ getCustomerName(editingRequest) }}</div>
            <div><strong>Unit Mesin:</strong> {{ getUnitName(editingRequest) }}</div>
          </div>
        </div>

        <div class="form-group mb-3">
          <label class="form-label font-semibold text-slate-700">Metode Input Sparepart</label>
          <div class="mode-toggle">
            <button
              type="button"
              class="btn btn-sm"
              :class="editForm.source_type === 'db' ? 'btn-primary' : 'btn-outline'"
              @click="editForm.source_type = 'db'"
            >
              Pilih dari Database
            </button>
            <button
              type="button"
              class="btn btn-sm"
              :class="editForm.source_type === 'manual' ? 'btn-primary' : 'btn-outline'"
              @click="editForm.source_type = 'manual'"
            >
              Input Manual
            </button>
          </div>
        </div>

        <div v-if="editForm.source_type === 'db'" class="form-group mb-3">
          <label class="form-label font-semibold text-slate-700">Pilih Produk / Sparepart <span class="text-danger">*</span></label>
          <CustomSelect
            v-model="editForm.product_id"
            :options="productOptions"
            placeholder="Pilih sparepart..."
            class="form-select"
          />
        </div>

        <div v-else class="form-group mb-3">
          <label class="form-label font-semibold text-slate-700">Nama Sparepart Manual <span class="text-danger">*</span></label>
          <input
            v-model="editForm.item_name"
            type="text"
            class="form-input"
            placeholder="Ketik nama sparepart..."
          />
        </div>

        <div class="grid grid-cols-2 gap-4 mb-3">
          <div class="form-group">
            <label class="form-label font-semibold text-slate-700">Jumlah (Qty) <span class="text-danger">*</span></label>
            <input v-model.number="editForm.qty" type="number" min="1" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label font-semibold text-slate-700">Status</label>
            <select v-model="editForm.status" class="form-select">
              <option value="pending">PENDING</option>
              <option value="approved">APPROVED</option>
              <option value="ordered">ORDERED</option>
              <option value="completed">COMPLETED</option>
              <option value="rejected">REJECTED</option>
            </select>
          </div>
        </div>

        <div class="form-group mb-2">
          <label class="form-label font-semibold text-slate-700">Catatan / Alasan</label>
          <textarea
            v-model="editForm.notes"
            class="form-input"
            rows="2"
            placeholder="Keterangan peruntukan..."
          ></textarea>
        </div>
      </div>

      <!-- ================= ADD MODE (Multi-Item & Undelivered Sales/Rentals) ================= -->
      <div v-else class="modal-form-body">
        <!-- 1. Pemilihan Tipe Referensi -->
        <div class="section-box mb-4">
          <label class="section-title">1. Pilih Tipe Referensi Transaksi</label>
          <p class="section-subtitle">
            Admin dapat me-request sparepart untuk transaksi penjualan, rental mesin, laporan servis, atau langsung per customer.
          </p>
          <div class="ref-type-selector">
            <label
              class="ref-type-card"
              :class="{ selected: form.reference_type === 'sale' }"
            >
              <input
                v-model="form.reference_type"
                type="radio"
                value="sale"
                class="sr-only"
              />
              <div class="ref-card-icon">🛒</div>
              <div class="ref-card-info">
                <div class="ref-card-title">Penjualan (Sales)</div>
                <div class="ref-card-desc">{{ undeliveredSales.length }} transaksi ({{ undeliveredSales.filter(s => s.is_undelivered).length }} belum diantar)</div>
              </div>
            </label>

            <label
              class="ref-type-card"
              :class="{ selected: form.reference_type === 'rental' }"
            >
              <input
                v-model="form.reference_type"
                type="radio"
                value="rental"
                class="sr-only"
              />
              <div class="ref-card-icon">🏢</div>
              <div class="ref-card-info">
                <div class="ref-card-title">Rental Mesin</div>
                <div class="ref-card-desc">{{ undeliveredRentals.length }} transaksi ({{ undeliveredRentals.filter(r => r.is_undelivered).length }} belum diantar)</div>
              </div>
            </label>

            <label
              class="ref-type-card"
              :class="{ selected: form.reference_type === 'service_report' }"
            >
              <input
                v-model="form.reference_type"
                type="radio"
                value="service_report"
                class="sr-only"
              />
              <div class="ref-card-icon">🔧</div>
              <div class="ref-card-info">
                <div class="ref-card-title">Service Report</div>
                <div class="ref-card-desc">Laporan servis lapangan teknisi</div>
              </div>
            </label>

            <label
              class="ref-type-card"
              :class="{ selected: form.reference_type === 'general' }"
            >
              <input
                v-model="form.reference_type"
                type="radio"
                value="general"
                class="sr-only"
              />
              <div class="ref-card-icon">📦</div>
              <div class="ref-card-info">
                <div class="ref-card-title">Customer Langsung</div>
                <div class="ref-card-desc">Request langsung per customer &amp; unit</div>
              </div>
            </label>
          </div>
        </div>

        <!-- 2. Dokumen Transaksi & Pilihan Unit -->
        <div class="section-box mb-4">
          <div class="section-header-row mb-3">
            <div>
              <label class="section-title mb-0">2. Pilih Dokumen &amp; Unit Mesin Terkait</label>
              <p class="section-subtitle mb-0">
                {{ form.reference_type === 'general' ? 'Pilih customer dan unit mesin tujuan sparepart.' : 'Pilih dokumen transaksi acuan untuk melacak peruntukan sparepart ini.' }}
              </p>
            </div>
            <!-- Checkbox filter cepat yang belum diantar -->
            <label
              v-if="form.reference_type === 'sale' || form.reference_type === 'rental'"
              class="filter-pill-toggle"
              :class="{ 'filter-active': filterOnlyUndelivered }"
            >
              <input type="checkbox" v-model="filterOnlyUndelivered" class="pill-checkbox" />
              <span>Hanya yang belum diantar ({{ form.reference_type === 'sale' ? undeliveredSales.filter(s => s.is_undelivered).length : undeliveredRentals.filter(r => r.is_undelivered).length }})</span>
            </label>
          </div>

          <!-- Dropdown Sales -->
          <div v-if="form.reference_type === 'sale'" class="form-group mb-3">
            <label class="form-label font-semibold text-slate-700">
              Pilih Dokumen Penjualan (Sales) <span class="text-danger">*</span>
            </label>
            <CustomSelect
              v-model="form.sale_id"
              :options="saleOptions"
              placeholder="-- Pilih Dokumen Sales --"
              class="form-select"
            />
            <div v-if="displayedSales.length === 0 && !loadingSources" class="text-xs text-amber-600 mt-1">
              ⚠️ Tidak ada transaksi sales yang sesuai dengan filter.
            </div>
          </div>

          <!-- Dropdown Rental -->
          <div v-else-if="form.reference_type === 'rental'" class="form-group mb-3">
            <label class="form-label font-semibold text-slate-700">
              Pilih Dokumen Rental Mesin <span class="text-danger">*</span>
            </label>
            <CustomSelect
              v-model="form.rental_id"
              :options="rentalOptions"
              placeholder="-- Pilih Dokumen Rental --"
              class="form-select"
            />
            <div v-if="displayedRentals.length === 0 && !loadingSources" class="text-xs text-amber-600 mt-1">
              ⚠️ Tidak ada transaksi rental yang sesuai dengan filter.
            </div>
          </div>

          <!-- Dropdown Service Report -->
          <div v-else-if="form.reference_type === 'service_report'" class="form-group mb-3">
            <label class="form-label font-semibold text-slate-700">
              Pilih Service Report <span class="text-danger">*</span>
            </label>
            <CustomSelect
              v-model="form.service_report_id"
              :options="serviceReportOptions"
              placeholder="-- Pilih Service Report --"
              class="form-select"
            />
          </div>

          <!-- Dropdown Customer Langsung -->
          <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div class="form-group">
              <label class="form-label font-semibold text-slate-700">Customer / Perusahaan <span class="text-danger">*</span></label>
              <CustomSelect
                v-model="form.customer_id"
                :options="customerOptions"
                placeholder="-- Pilih Customer --"
                class="form-select"
              />
            </div>
            <div class="form-group">
              <label class="form-label font-semibold text-slate-700">Unit Mesin Terkait (Opsional)</label>
              <CustomSelect
                v-model="form.unit_id"
                :options="allUnitOptions"
                placeholder="-- Pilih Unit Mesin --"
                class="form-select"
              />
            </div>
          </div>

          <!-- Detail Preview Card jika dokumen dipilih -->
          <div v-if="selectedTransactionPreview" class="preview-card mb-3">
            <div class="preview-header">
              <span class="preview-title">{{ selectedTransactionPreview.title }}</span>
              <span class="preview-badge" :class="selectedTransactionPreview.badgeClass">
                {{ selectedTransactionPreview.badge }}
              </span>
            </div>
            <div class="preview-body grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-700">
              <div class="preview-info-item">
                <span class="info-label">Customer</span>
                <span class="info-val">{{ selectedTransactionPreview.customer }}</span>
              </div>
              <div class="preview-info-item">
                <span class="info-label">Unit Mesin</span>
                <span class="info-val">{{ selectedTransactionPreview.unitCount }} unit terdaftar</span>
              </div>
              <div class="preview-info-item">
                <span class="info-label">Alamat / Lokasi</span>
                <span class="info-val">{{ selectedTransactionPreview.address || '-' }}</span>
              </div>
            </div>
          </div>

          <!-- Pilihan Unit Mesin Spesifik -->
          <div v-if="form.reference_type !== 'general'" class="form-group">
            <label class="form-label font-semibold text-slate-700">Unit Mesin Terkait (Peruntukan Sparepart)</label>
            <CustomSelect
              v-model="form.unit_id"
              :options="unitOptions"
              placeholder="-- Pilih Unit Mesin (Opsional) --"
              class="form-select"
            />
            <span class="text-xs text-slate-500 mt-1 block">
              Pilih unit spesifik yang akan dipasangkan sparepart ini jika sudah diketahui.
            </span>
          </div>
        </div>

        <!-- 3. Daftar Sparepart (Bisa Banyak / Multi-Item) -->
        <div class="section-box mb-4">
          <div class="section-header-row mb-2">
            <div>
              <label class="section-title mb-0">3. Daftar Item Sparepart yang Direquest</label>
              <p class="section-subtitle mb-0">Item yang direquest bisa banyak sekaligus dalam satu kali pengajuan.</p>
            </div>
            <div class="badge-item-count">
              {{ form.items.length }} Baris Item
            </div>
          </div>

          <!-- Tabel Baris Multi-Item -->
          <div class="items-table-wrapper">
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 44px; text-align: center;">#</th>
                  <th style="width: 150px;">Sumber</th>
                  <th style="min-width: 260px;">Sparepart / Nama Item <span class="text-danger">*</span></th>
                  <th style="width: 85px; text-align: center;">Qty <span class="text-danger">*</span></th>
                  <th style="min-width: 220px;">Catatan / Keterangan</th>
                  <th style="width: 48px; text-align: center;">Aksi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in form.items" :key="item.id">
                  <td class="text-center font-mono text-xs text-slate-500">{{ idx + 1 }}</td>
                  <td>
                    <select
                      v-model="item.source_type"
                      class="form-select text-xs item-source-select"
                      @change="item.source_type === 'manual' ? (item.product_id = '') : (item.item_name = '')"
                    >
                      <option value="db">📦 Katalog Stok</option>
                      <option value="manual">✍️ Tulis Manual</option>
                    </select>
                  </td>
                  <td>
                    <div v-if="item.source_type === 'db'">
                      <CustomSelect
                        v-model="item.product_id"
                        :options="productOptions"
                        placeholder="Cari sparepart dari katalog stok..."
                        class="form-select text-xs table-custom-select"
                      />
                    </div>
                    <div v-else>
                      <input
                        v-model="item.item_name"
                        type="text"
                        class="form-input text-xs table-input"
                        placeholder="Ketik nama sparepart yang diminta..."
                      />
                    </div>
                  </td>
                  <td>
                    <input
                      v-model.number="item.qty"
                      type="number"
                      min="1"
                      class="form-input text-xs text-center font-bold table-input item-qty-input"
                    />
                  </td>
                  <td>
                    <input
                      v-model="item.notes"
                      type="text"
                      class="form-input text-xs table-input"
                      placeholder="Contoh: untuk drum unit, ganti roller..."
                    />
                  </td>
                  <td class="text-center">
                    <button
                      type="button"
                      class="btn-remove-row"
                      :disabled="form.items.length <= 1"
                      title="Hapus baris ini"
                      @click="removeItem(idx)"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Action Footer di bawah tabel -->
          <div class="table-action-footer">
            <button
              type="button"
              class="btn-add-item-dashed"
              @click="addItem"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>+ Tambah Baris Sparepart Lainnya</span>
            </button>
            <div class="items-summary-tag">
              Total: <strong>{{ form.items.length }}</strong> Jenis Item &bull; <strong>{{ form.items.reduce((acc, i) => acc + (Number(i.qty) || 0), 0) }}</strong> Pcs
            </div>
          </div>
        </div>

        <!-- 4. Catatan Umum -->
        <div class="section-box">
          <label class="section-title">4. Catatan / Alasan Permintaan (Opsional)</label>
          <p class="section-subtitle">Tuliskan catatan tambahan untuk tim gudang atau purchasing jika ada.</p>
          <textarea
            v-model="form.general_notes"
            class="form-input mt-1"
            rows="2"
            placeholder="Tuliskan catatan untuk tim gudang / purchasing (contoh: Unit akan dikirim lusa, perlu sparepart untuk persiapan sebelum dikirim)..."
          ></textarea>
        </div>
      </div>

      <template #footer>
        <button class="btn btn-outline" type="button" @click="showModal = false">Batal</button>
        <button
          class="btn btn-accent"
          type="button"
          :disabled="saving"
          @click="handleSubmit"
        >
          <span v-if="saving">Menyimpan...</span>
          <span v-else-if="editingRequest">Simpan Perubahan</span>
          <span v-else>Kirim Permintaan ({{ form.items.length }} Item)</span>
        </button>
      </template>
    </FormModal>
  </div>
</template>

<style scoped>
.sparepart-requests-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-md, 16px);
}

/* Filter Bar */
.filter-bar-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md, 16px);
  background: white;
  padding: 12px 16px;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-border, #e2e8f0);
  flex-wrap: wrap;
}

.tabs-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tab-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 20px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-pill:hover {
  background: #e2e8f0;
}

.tab-pill.active {
  background: #2563eb;
  border-color: #2563eb;
  color: white;
}

.tab-pill--sale.active {
  background: #0284c7;
  border-color: #0284c7;
}

.tab-pill--rental.active {
  background: #059669;
  border-color: #059669;
}

.tab-pill--service.active {
  background: #7c3aed;
  border-color: #7c3aed;
}

.tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.08);
}

.tab-pill.active .tab-badge {
  background: rgba(255, 255, 255, 0.25);
  color: white;
}

.filter-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.control-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-label {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}

.filter-select {
  height: 36px;
  font-size: 13px;
  min-width: 150px;
}

.search-input {
  height: 36px;
  font-size: 13px;
  min-width: 240px;
}

/* Badges */
.batch-tag {
  display: inline-block;
  font-size: 10px;
  font-family: monospace;
  background: #f1f5f9;
  color: #475569;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid #cbd5e1;
  margin-top: 2px;
}

.ref-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  text-transform: uppercase;
}

.ref-badge--sale {
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #bae6fd;
}

.ref-badge--rental {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #bbf7d0;
}

.ref-badge--service {
  background: #f3e8ff;
  color: #7e22ce;
  border: 1px solid #e9d5ff;
}

.qty-badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  background: #fef3c7;
  color: #b45309;
  padding: 2px 8px;
  border-radius: 12px;
  border: 1px solid #fde68a;
}

.status-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
}

.status-badge--success {
  background: #dcfce7;
  color: #166534;
}

.status-badge--warning {
  background: #fef3c7;
  color: #92400e;
}

.status-badge--danger {
  background: #fee2e2;
  color: #991b1b;
}

/* Modal Styling */
.modal-form-body {
  display: flex;
  flex-direction: column;
}

.section-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 14px;
}

.section-title {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
  display: block;
}

.section-subtitle {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
  margin-bottom: 10px;
}

.section-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-pill-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
  white-space: nowrap;
}

.filter-pill-toggle:hover {
  border-color: #3b82f6;
  color: #1e40af;
  background: #f8fafc;
}

.filter-pill-toggle.filter-active {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #1d4ed8;
  box-shadow: 0 1px 2px rgba(59, 130, 246, 0.1);
}

.pill-checkbox {
  width: 14px;
  height: 14px;
  accent-color: #2563eb;
  cursor: pointer;
}

.badge-item-count {
  font-size: 11px;
  font-weight: 700;
  color: #1d4ed8;
  background: #dbeafe;
  padding: 3px 10px;
  border-radius: 12px;
  letter-spacing: 0.3px;
}

.ref-type-selector {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

@media (max-width: 820px) {
  .ref-type-selector {
    grid-template-columns: repeat(2, 1fr);
  }
}

.ref-type-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: white;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.ref-type-card:hover {
  border-color: #94a3b8;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
}

.ref-type-card.selected {
  border-color: #2563eb;
  background: #eff6ff;
  box-shadow: 0 0 0 1px #2563eb;
}

.ref-card-icon {
  font-size: 22px;
  line-height: 1;
  flex-shrink: 0;
}

.ref-card-info {
  min-width: 0;
}

.ref-card-title {
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ref-card-desc {
  font-size: 10px;
  color: #64748b;
  margin-top: 2px;
  line-height: 1.3;
}

/* Preview Card */
.preview-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-left: 4px solid #2563eb;
  border-radius: 8px;
  padding: 12px 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  border-bottom: 1px dashed #e2e8f0;
  padding-bottom: 6px;
}

.preview-title {
  font-weight: 700;
  font-size: 13px;
  color: #0f172a;
}

.preview-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
}

.preview-info-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  color: #64748b;
}

.info-val {
  font-size: 12px;
  font-weight: 600;
  color: #1e293b;
}

.badge-sale {
  background: #e0f2fe;
  color: #0369a1;
}

.badge-rental {
  background: #dcfce7;
  color: #15803d;
}

.badge-service {
  background: #f3e8ff;
  color: #7e22ce;
}

/* Items Table */
.items-table-wrapper {
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  overflow-x: auto;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.items-table {
  width: 100%;
  border-collapse: collapse;
}

.items-table th {
  background: #f8fafc;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #475569;
  padding: 10px 12px;
  border-bottom: 1px solid #cbd5e1;
}

.items-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #e2e8f0;
  vertical-align: middle;
  background: #ffffff;
}

.items-table tr:hover td {
  background: #f8fafc;
}

.item-source-select {
  width: 100%;
  height: 38px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  padding: 0 8px;
}

.items-table .table-input {
  width: 100%;
  height: 38px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  padding: 0 10px;
}

.items-table .table-input:focus,
.item-source-select:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
  outline: none;
}

.items-table :deep(.custom-select__trigger) {
  min-height: 38px;
  height: 38px;
  padding: 6px 10px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
}

.items-table :deep(.custom-select__value) {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-qty-input {
  width: 100%;
  text-align: center;
}

.table-action-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.btn-add-item-dashed {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border: 1.5px dashed #3b82f6;
  background: #eff6ff;
  color: #1d4ed8;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease-in-out;
}

.btn-add-item-dashed:hover {
  background: #dbeafe;
  border-color: #2563eb;
  color: #1e40af;
}

.items-summary-tag {
  font-size: 12px;
  color: #64748b;
  background: #f1f5f9;
  padding: 6px 14px;
  border-radius: 20px;
}

.items-summary-tag strong {
  color: #0f172a;
}

.btn-remove-row {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: 1px solid #fecaca;
  background: #fff1f2;
  color: #e11d48;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-remove-row:hover:not(:disabled) {
  background: #fee2e2;
  color: #be123c;
}

.btn-remove-row:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.mode-toggle {
  display: flex;
  gap: 8px;
}
</style>
