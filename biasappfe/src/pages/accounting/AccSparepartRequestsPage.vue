<script setup lang="ts">
// @ts-nocheck
import DataTable from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import FormModal from '@/components/ui/FormModal.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useAuth } from '@/composables/useAuth'
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
const { currentUser } = useAuth()
const toast = useToast()
const router = useRouter()

const creatingId = ref<string | number | null>(null)
const showCreatePOModal = ref(false)
const poTarget = ref<SparepartRequest | null>(null)

interface MRFItem {
  source_type: 'database' | 'manual'
  product_id?: string | number | null
  item_name: string
  qty: number
  uom: string
  unit_price: number
  purpose: string
}

interface MRFStoreGroup {
  store_name: string
  virtual_account: string
  items: MRFItem[]
}

const poForm = reactive({
  editing_po_id: null as string | null,
  request_form_no: '',
  order_date: new Date().toISOString().slice(0, 10),
  installation_date: '',
  priority: 'Normal',
  department: 'Technical / Service',
  requester_name: '',
  stores: [] as MRFStoreGroup[],
  reason: '',
  warehouse_status: 'Pengadaan Baru',
  special_notes: '',
})

const availableProducts = computed(() => {
  const prods = (store.products?.value || store.products || []) as any[]
  return [...prods].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
})

const totalAllItems = computed(() => {
  return (poForm.stores || []).reduce((sum, storeGroup) => {
    return sum + (storeGroup.items || []).reduce((iSum, it) => {
      return iSum + (Number(it.qty) || 0) * (Number(it.unit_price) || 0)
    }, 0)
  }, 0)
})

function addStoreGroup() {
  const defaultPurpose = poForm.stores[0]?.items[0]?.purpose || ''
  poForm.stores.push({
    store_name: '',
    virtual_account: '',
    items: [
      {
        source_type: 'database',
        product_id: null,
        item_name: '',
        qty: 1,
        uom: 'Pcs',
        unit_price: 0,
        purpose: defaultPurpose
      }
    ]
  })
}

function removeStoreGroup(sIdx: number) {
  if (poForm.stores.length > 1) {
    poForm.stores.splice(sIdx, 1)
  }
}

function addItemToStore(sIdx: number) {
  const storeGroup = poForm.stores[sIdx]
  if (!storeGroup) return
  const defaultPurpose = storeGroup.items[0]?.purpose || poForm.stores[0]?.items[0]?.purpose || ''
  storeGroup.items.push({
    source_type: 'database',
    product_id: null,
    item_name: '',
    qty: 1,
    uom: 'Pcs',
    unit_price: 0,
    purpose: defaultPurpose
  })
}

function removeItemFromStore(sIdx: number, iIdx: number) {
  const storeGroup = poForm.stores[sIdx]
  if (storeGroup && storeGroup.items.length > 1) {
    storeGroup.items.splice(iIdx, 1)
  }
}

function onSourceTypeChange(item: MRFItem, type: 'database' | 'manual') {
  item.source_type = type
  if (type === 'manual') {
    item.product_id = null
  }
}

function onProductSelect(item: MRFItem, productId: any) {
  item.product_id = productId || null
  if (!productId) return
  const prods = (store.products?.value || store.products || []) as any[]
  const prod = prods.find((p: any) => String(p.id) === String(productId))
  if (prod) {
    item.item_name = prod.name || ''
    item.unit_price = Number(prod.price) || 0
    item.uom = prod.uom?.name || (prod as any).unit || 'Pcs'
  }
}

function openCreatePOModal(request: SparepartRequest) {
  poTarget.value = request
  const sr = (store.serviceReports.value as any[]).find(
    (s: any) => String(s.id) === String(request.service_report_id)
  ) || request.service_report
  const prod = request.product || store.findProduct(request.product_id)
  const cust = sr?.customer_id ? store.findCustomer(sr.customer_id) : (sr?.customer || null)
  const unit = sr?.unit_id ? store.findUnit(sr.unit_id) : (sr?.unit || null)
  const tech = getTechnician(request)

  poForm.request_form_no = ''
  poForm.order_date = new Date().toISOString().slice(0, 10)
  poForm.installation_date = new Date().toISOString().slice(0, 10)
  poForm.priority = 'Normal'
  poForm.department = 'Technical / Service'
  poForm.requester_name = tech !== '-' ? tech : 'tech'

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
  const defaultPurpose = purposeParts.join(' - ') || 'Penggantian sparepart unit'

  const hasDbProd = !!(request.product_id && prod)
  const initialSource: 'database' | 'manual' = hasDbProd ? 'database' : (request.item_name && request.item_name !== '-' ? 'manual' : 'database')
  const initialName = request.item_name && request.item_name !== '-' ? request.item_name : (prod?.name || '')

  poForm.stores = [
    {
      store_name: '',
      virtual_account: '',
      items: [
        {
          source_type: initialSource,
          product_id: request.product_id || (prod ? prod.id : null),
          item_name: initialName,
          qty: request.qty || 1,
          uom: (request as any).uom || (prod as any)?.uom?.name || 'Pcs',
          unit_price: request.unit_price || prod?.price || 0,
          purpose: defaultPurpose
        }
      ]
    }
  ]

  poForm.reason = request.reason || sr?.remarks || 'Penggantian sparepart sesuai rekomendasi teknisi'
  poForm.warehouse_status = 'Pengadaan Baru'
  poForm.special_notes = ''

  showCreatePOModal.value = true
}

async function openEditPOModal(request: any) {
  poTarget.value = request
  let pos = (store.purchaseOrders.value as any[]) || []
  if (!pos || pos.length === 0) {
    try {
      await store.refreshOnly(['purchaseOrders'], false)
      pos = (store.purchaseOrders.value as any[]) || []
    } catch (_) {}
  }
  const po = pos.find((p: any) =>
    (p.sparepart_request_id && String(p.sparepart_request_id) === String(request.id)) ||
    (p.service_report_id && request.service_report_id && String(p.service_report_id) === String(request.service_report_id))
  )

  const sr = (store.serviceReports.value as any[]).find((s: any) => String(s.id) === String(request.service_report_id))
    || request.service_report
  const prod = request.product || store.findProduct(request.product_id)
  const cust = sr?.customer_id ? store.findCustomer(sr.customer_id) : (sr?.customer || null)
  const unit = sr?.unit_id ? store.findUnit(sr.unit_id) : (sr?.unit || null)
  const tech = getTechnician(request)

  poForm.editing_po_id = po?.id || null
  poForm.request_form_no = po?.po_no || po?.request_form_no || ''
  poForm.order_date = po?.order_date ? String(po.order_date).slice(0, 10) : new Date().toISOString().slice(0, 10)
  poForm.installation_date = po?.installation_date ? String(po.installation_date).slice(0, 10) : new Date().toISOString().slice(0, 10)
  poForm.priority = po?.priority || 'Normal'
  poForm.department = po?.department || 'Technical / Service'
  poForm.requester_name = tech !== '-' ? tech : 'Teknisi'
  poForm.reason = po?.reason || request.reason || sr?.remarks || 'Penggantian sparepart mesin'
  poForm.warehouse_status = po?.warehouse_status || 'Pengadaan Baru'
  poForm.special_notes = po?.special_notes || ''

  const defaultPurposeParts: string[] = []
  if (unit?.model) {
    defaultPurposeParts.push(`Unit ${unit.model}${unit.serial_number ? ` (SN: ${unit.serial_number})` : ''}`)
  }
  if (cust?.company_name || cust?.name) {
    defaultPurposeParts.push(cust.company_name || cust.name)
  }
  if (sr?.report_no || (sr as any)?.service_report_no) {
    defaultPurposeParts.push(`SR: ${sr.report_no || (sr as any).service_report_no}`)
  }
  const defaultPurpose = defaultPurposeParts.join(' - ') || 'Penggantian sparepart unit'

  const existingItems = po?.purchase_order_items || []
  if (existingItems.length > 0) {
    const storeMap = new Map<string, any>()
    for (const it of existingItems) {
      const sKey = (it.store_name || po?.store_name || '') + '___' + (it.virtual_account || po?.virtual_account || '')
      if (!storeMap.has(sKey)) {
        storeMap.set(sKey, {
          store_name: it.store_name || po?.store_name || '',
          virtual_account: it.virtual_account || po?.virtual_account || '',
          items: []
        })
      }
      storeMap.get(sKey).items.push({
        source_type: it.product_id ? 'database' : 'manual',
        product_id: it.product_id || null,
        item_name: it.item_name || '',
        qty: it.qty || 1,
        uom: it.uom || 'Pcs',
        unit_price: it.unit_price || 0,
        purpose: it.purpose || defaultPurpose
      })
    }
    poForm.stores = Array.from(storeMap.values())
  } else {
    poForm.stores = [
      {
        store_name: po?.store_name || '',
        virtual_account: po?.virtual_account || '',
        items: [
          {
            source_type: request.product_id && prod ? 'database' : (request.item_name && request.item_name !== '-' ? 'manual' : 'database'),
            product_id: request.product_id || (prod ? prod.id : null),
            item_name: request.item_name && request.item_name !== '-' ? request.item_name : (prod?.name || ''),
            qty: request.qty || 1,
            uom: (request as any).uom || (prod as any)?.uom?.name || 'Pcs',
            unit_price: request.unit_price || prod?.price || 0,
            purpose: defaultPurpose
          }
        ]
      }
    ]
  }

  showCreatePOModal.value = true
}

function closeCreatePOModal() {
  if (creatingId.value !== null) return
  showCreatePOModal.value = false
  poTarget.value = null
  poForm.editing_po_id = null
}

const columns: TableColumn[] = [
  { key: 'request_no', label: 'Request No' },
  { key: 'service_report_id', label: 'Service No' },
  { key: 'technician_id', label: 'Requested By' },
  { key: 'product_id', label: 'Sparepart' },
  { key: 'qty', label: 'Qty' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Date' }
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
  if (!poForm.installation_date) {
    poForm.installation_date = poForm.order_date || new Date().toISOString().slice(0, 10)
  }
  let reason = poForm.reason.trim()
  if (!reason) {
    const firstItemName = poForm.stores[0]?.items[0]?.item_name || 'sparepart'
    reason = 'Penggantian sparepart ' + firstItemName
    poForm.reason = reason
  }
  creatingId.value = request.id
  try {
    const sr = (store.serviceReports.value as any[]).find(
      (s: any) => String(s.id) === String(request.service_report_id)
    ) || request.service_report
    const customerId = sr?.customer_id || null
    const unitId = sr?.unit_id || null
    const serviceReportId = request.service_report_id || sr?.id || null

    const purchaseOrderItems: any[] = []
    const storeNamesSet = new Set<string>()
    const vaSet = new Set<string>()

    for (const sg of poForm.stores) {
      const sName = (sg.store_name || '').trim()
      const sVa = (sg.virtual_account || '').trim()
      if (sName) storeNamesSet.add(sName)
      if (sVa) vaSet.add(sVa)

      for (const it of sg.items) {
        const qty = Number(it.qty) || 1
        const unitPrice = Number(it.unit_price) || 0
        purchaseOrderItems.push({
          item_name: it.item_name || 'Sparepart',
          product_id: it.product_id || undefined,
          qty,
          uom: it.uom || 'Pcs',
          unit_price: unitPrice,
          total_price: qty * unitPrice,
          purpose: it.purpose || undefined,
          store_name: sName || undefined,
          virtual_account: sVa || undefined,
        })
      }
    }

    const joinedStoreNames = Array.from(storeNamesSet).join(', ')
    const joinedVAs = Array.from(vaSet).join(', ')

    const payload = {
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
      store_name: joinedStoreNames || undefined,
      virtual_account: joinedVAs || undefined,
      purchase_order_items: purchaseOrderItems,
    }

    if (poForm.editing_po_id) {
      await resources.update('purchaseOrders', poForm.editing_po_id, payload)
      toast.success(`Request form updated for ${request.request_no}`)
    } else {
      await resources.create('purchaseOrders', payload)
      toast.success(`Request form created for ${request.request_no}`)
    }

    await store.refreshInBackground()
    showCreatePOModal.value = false
    poTarget.value = null
    poForm.editing_po_id = null
    router.push('/accounting/purchase-orders')
  } catch (err) {
    toast.error(toast.fromError(err, 'Failed to save request form'))
  } finally {
    creatingId.value = null
  }
}

async function handlePrintRequestForm(row: any) {
  let pos = (store.purchaseOrders.value as any[]) || []
  if (!pos || pos.length === 0) {
    try {
      await store.refreshOnly(['purchaseOrders'], false)
      pos = (store.purchaseOrders.value as any[]) || []
    } catch (_) {}
  }
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
    const tech = getTechnician(row)

    po = {
      id: row.id,
      po_no: `MRF-${row.request_no || Date.now().toString().slice(-6)}`,
      sparepart_request_id: row.id,
      sparepart_request: row,
      technician_id: row.technician_id,
      technician: row.technician || (row.technician_id && store.findTechnician ? store.findTechnician(row.technician_id) : null),
      requester_name: tech !== '-' ? tech : 'Teknisi',
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

  await printPurchaseOrder(po, currentUser.value)
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
              v-if="can('purchase_order:update') || can('purchase_order:create')"
              class="action-btn"
              title="Edit Request Form (Toko & VA)"
              @click="openEditPOModal(row)"
              style="color: var(--color-warning); border-color: transparent;"
            >
              <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </button>
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
    <FormModal :open="showCreatePOModal" title="Material Requisition Form (Request Form)" max-width="720px" :submit-label="creatingId !== null ? 'Menyimpan...' : 'Simpan Form'" @close="closeCreatePOModal" @submit="handleCreatePO">
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
        <div class="mrf-section-header" style="margin-top: 14px;">
          B. DETAIL BARANG YANG DIMINTA
        </div>

        <!-- Loop Groups Per Toko -->
        <div class="mrf-stores-list" style="display: flex; flex-direction: column; gap: 14px; margin-top: 8px;">
          <div
            v-for="(storeGroup, sIdx) in poForm.stores"
            :key="sIdx"
            class="mrf-store-card"
            style="border: 1.5px solid #94a3b8; border-radius: 8px; background: #f8fafc; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);"
          >
            <!-- Header Toko -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; background: #1e4e79; color: #fff; border-radius: 4px; font-weight: bold; font-size: 11px;">
                  {{ sIdx + 1 }}
                </span>
                <span style="font-weight: 700; font-size: 13px; color: #1e3a8a;">
                  Toko / Supplier #{{ sIdx + 1 }}
                </span>
              </div>
              <button
                v-if="poForm.stores.length > 1"
                type="button"
                class="btn btn-xs"
                @click="removeStoreGroup(sIdx)"
                title="Hapus toko ini beserta barangnya"
                style="color: #ef4444; border: 1px solid #fecaca; background: #fef2f2; padding: 3px 8px; font-size: 11px; border-radius: 4px; cursor: pointer;"
              >
                ✕ Hapus Toko
              </button>
            </div>

            <!-- Field Toko & VA -->
            <div class="mrf-grid" style="margin-bottom: 12px;">
              <div class="form-group mb-0">
                <label class="form-label">Nama Toko / Supplier <span class="text-danger">*</span></label>
                <input
                  v-model="storeGroup.store_name"
                  type="text"
                  class="form-input"
                  placeholder="e.g. Toko Berkah Batam / Tokopedia..."
                  required
                />
              </div>
              <div class="form-group mb-0">
                <label class="form-label">Virtual Account / No. Rekening</label>
                <input
                  v-model="storeGroup.virtual_account"
                  type="text"
                  class="form-input"
                  placeholder="No. Virtual Account atau rekening pembayaran..."
                />
              </div>
            </div>

            <!-- Header Daftar Barang Toko -->
            <div style="font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
              Daftar Barang dari Toko Ini ({{ storeGroup.items.length }} Item):
            </div>

            <!-- List Barang Toko Ini -->
            <div style="display: flex; flex-direction: column; gap: 10px;">
              <div
                v-for="(item, iIdx) in storeGroup.items"
                :key="iIdx"
                class="mrf-item-card"
                style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; background: #ffffff;"
              >
                <!-- Item Card Header: Item No & Mode Switcher -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; flex-wrap: wrap; gap: 6px;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-weight: 700; font-size: 12px; color: #1e3a8a;">
                      Item #{{ iIdx + 1 }}
                    </span>
                    <!-- Switch Mode Tarik DB / Input Manual -->
                    <div style="display: inline-flex; border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden; background: #f1f5f9;">
                      <button
                        type="button"
                        @click="onSourceTypeChange(item, 'database')"
                        :style="{
                          padding: '3px 8px',
                          fontSize: '11px',
                          fontWeight: item.source_type === 'database' ? '700' : '400',
                          background: item.source_type === 'database' ? '#1e4e79' : 'transparent',
                          color: item.source_type === 'database' ? '#ffffff' : '#475569',
                          border: 'none',
                          cursor: 'pointer'
                        }"
                      >
                        📦 Tarik dari Database
                      </button>
                      <button
                        type="button"
                        @click="onSourceTypeChange(item, 'manual')"
                        :style="{
                          padding: '3px 8px',
                          fontSize: '11px',
                          fontWeight: item.source_type === 'manual' ? '700' : '400',
                          background: item.source_type === 'manual' ? '#1e4e79' : 'transparent',
                          color: item.source_type === 'manual' ? '#ffffff' : '#475569',
                          border: 'none',
                          cursor: 'pointer'
                        }"
                      >
                        ✏️ Input Manual
                      </button>
                    </div>
                  </div>

                  <button
                    v-if="storeGroup.items.length > 1"
                    type="button"
                    class="btn btn-xs"
                    @click="removeItemFromStore(sIdx, iIdx)"
                    title="Hapus barang ini"
                    style="color: #ef4444; border: 1px solid #fecaca; background: #fef2f2; padding: 2px 8px; font-size: 11px; border-radius: 4px; cursor: pointer;"
                  >
                    ✕ Hapus
                  </button>
                </div>

                <!-- Form Fields Barang -->
                <div class="mrf-grid">
                  <!-- Mode Database: Select Product -->
                  <div v-if="item.source_type === 'database'" class="form-group" style="grid-column: span 2;">
                    <label class="form-label">Pilih Barang dari Database <span class="text-danger">*</span></label>
                    <select
                      :value="item.product_id"
                      @change="onProductSelect(item, ($event.target as HTMLSelectElement).value)"
                      class="form-input"
                      required
                    >
                      <option value="">-- Pilih Sparepart / Barang --</option>
                      <option
                        v-for="p in availableProducts"
                        :key="p.id"
                        :value="p.id"
                      >
                        {{ p.name }} {{ p.sku ? `(${p.sku})` : '' }} {{ p.price ? `- Rp ${p.price.toLocaleString('id-ID')}` : '' }}
                      </option>
                    </select>
                    <div v-if="item.item_name" style="font-size: 11px; color: #166534; margin-top: 3px;">
                      ✓ Terpilih: <strong>{{ item.item_name }}</strong>
                    </div>
                  </div>

                  <!-- Mode Manual: Input Text Free -->
                  <div v-else class="form-group" style="grid-column: span 2;">
                    <label class="form-label">Nama Barang &amp; Spesifikasi Teknis <span class="text-danger">*</span></label>
                    <input
                      v-model="item.item_name"
                      type="text"
                      class="form-input"
                      placeholder="Ketik nama sparepart / spesifikasi teknis barang..."
                      required
                    />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Volume (Qty) <span class="text-danger">*</span></label>
                    <input v-model.number="item.qty" type="number" min="1" class="form-input" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Satuan</label>
                    <input v-model="item.uom" type="text" class="form-input" placeholder="Pcs / Unit / Set" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Estimasi Harga Satuan (Rp)</label>
                    <input v-model.number="item.unit_price" type="number" min="0" class="form-input" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Total Estimasi (Rp)</label>
                    <input
                      :value="((Number(item.qty) || 0) * (Number(item.unit_price) || 0)).toLocaleString('id-ID')"
                      type="text"
                      class="form-input"
                      disabled
                      style="background: #f8fafc; font-weight: bold;"
                    />
                  </div>
                  <div class="form-group" style="grid-column: span 2;">
                    <label class="form-label">Keperluan / Peruntukan</label>
                    <input v-model="item.purpose" type="text" class="form-input" placeholder="e.g. Unit IR-2006 SN: 123 - Customer X" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Tombol Tambah Barang dari Toko Ini -->
            <div style="margin-top: 10px; display: flex; justify-content: flex-start;">
              <button
                type="button"
                class="btn btn-sm btn-outline-primary"
                @click="addItemToStore(sIdx)"
                style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; padding: 4px 10px;"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                + Tambah Barang dari Toko Ini
              </button>
            </div>
          </div>
        </div>

        <!-- Tombol Tambah Toko Lain & Total Keseluruhan -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; padding: 12px; background: #f1f5f9; border-radius: 6px; border: 1.5px dashed #94a3b8;">
          <button
            type="button"
            class="btn btn-sm btn-primary"
            @click="addStoreGroup"
            style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600;"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            + Tambah Toko Lain
          </button>
          <div style="text-align: right;">
            <span style="font-size: 11px; color: #64748b; margin-right: 8px;">Total Estimasi Keseluruhan:</span>
            <span style="font-size: 15px; font-weight: 800; color: #0f172a;">Rp {{ totalAllItems.toLocaleString('id-ID') }}</span>
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
