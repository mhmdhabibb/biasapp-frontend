<script setup lang="ts">
// @ts-nocheck
import { ref, reactive, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useResourcesStore } from '@/stores/resources.store'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { useAuth } from '@/composables/useAuth'
import { useRouter } from 'vue-router'
import type { TableColumn, PurchaseOrder } from '@/types'

import { printPurchaseOrder } from '@/utils/printPurchaseOrder'

const { can } = usePermission()
const store = useMasterStore()
const resources = useResourcesStore()
const toast = useToast()
const router = useRouter()
const { currentUser } = useAuth()
const route = useRoute()
const { ensureResourcesLoaded } = store

onMounted(() => {
  ensureResourcesLoaded(route.path)
})

const resolvedRequests = reactive<Record<string, any>>({})
const resolvedServiceReports = reactive<Record<string, any>>({})
const resolvedCustomers = reactive<Record<string, any>>({})
const pendingFetches = new Set<string>()

function isUuid(val: any): boolean {
  if (!val || typeof val !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim())
}

// Auto-index master data into resolved caches whenever store updates
watch(() => store.sparepartRequests.value, (newReqs) => {
  if (Array.isArray(newReqs)) {
    for (const r of newReqs) {
      if (r.id) resolvedRequests[String(r.id).toLowerCase()] = r
      if (r.request_no) resolvedRequests[String(r.request_no).toLowerCase()] = r
      if (r.service_report_id) {
        resolvedRequests[String(r.service_report_id).toLowerCase()] = r
      }
      if (r.service_report) {
        const srId = String(r.service_report.id || r.service_report_id || '').toLowerCase()
        if (srId) resolvedServiceReports[srId] = r.service_report
        if (r.service_report.customer) {
          const cId = String(r.service_report.customer.id || r.service_report.customer_id || '').toLowerCase()
          if (cId) resolvedCustomers[cId] = r.service_report.customer
        }
      }
    }
  }
}, { immediate: true, deep: true })

watch(() => store.serviceReports.value, (newSrs) => {
  if (Array.isArray(newSrs)) {
    for (const sr of newSrs) {
      if (sr.id) resolvedServiceReports[String(sr.id).toLowerCase()] = sr
      if (sr.report_no) resolvedServiceReports[String(sr.report_no).toLowerCase()] = sr
      if (sr.customer) {
        const cId = String(sr.customer.id || sr.customer_id || '').toLowerCase()
        if (cId) resolvedCustomers[cId] = sr.customer
      }
      if (Array.isArray(sr.service_spareparts)) {
        for (const sp of sr.service_spareparts) {
          if (sp.id) resolvedRequests[String(sp.id).toLowerCase()] = sp
          if (sp.request_no) resolvedRequests[String(sp.request_no).toLowerCase()] = sp
        }
      }
    }
  }
}, { immediate: true, deep: true })

watch(() => store.customers.value, (newCusts) => {
  if (Array.isArray(newCusts)) {
    for (const c of newCusts) {
      if (c.id) resolvedCustomers[String(c.id).toLowerCase()] = c
    }
  }
}, { immediate: true, deep: true })

watch(() => store.purchaseOrders.value, (newPOs) => {
  if (Array.isArray(newPOs) && newPOs.length > 0) {
    resolveAllPORelations(newPOs)
  }
}, { immediate: true, deep: true })

async function triggerFetchRequest(id: string) {
  if (!id || !isUuid(id)) return
  const key = id.toLowerCase().trim()
  if (pendingFetches.has(`spr_${key}`)) return
  pendingFetches.add(`spr_${key}`)
  try {
    const res = await resources.serviceSpareparts.get(id)
    if (res?.data) {
      resolvedRequests[key] = res.data
      if (res.data.id) resolvedRequests[String(res.data.id).toLowerCase()] = res.data
      if (res.data.request_no) resolvedRequests[String(res.data.request_no).toLowerCase()] = res.data
      if (res.data.service_report) {
        const sr = res.data.service_report
        resolvedServiceReports[String(sr.id).toLowerCase()] = sr
        if (sr.customer) {
          resolvedCustomers[String(sr.customer.id).toLowerCase()] = sr.customer
          resolvedCustomers[key] = sr.customer
        } else if (sr.customer_id) {
          triggerFetchCustomer(String(sr.customer_id))
        }
      } else if (res.data.service_report_id) {
        triggerFetchServiceReport(String(res.data.service_report_id))
      }
      return
    }
  } catch (err) {
    // serviceSpareparts failed -> could be a Service Report ID
  }

  // Fallback 1: Try fetching as a Service Report
  try {
    const resSr = await resources.serviceReports.get(id)
    if (resSr?.data) {
      const sr = resSr.data
      resolvedServiceReports[key] = sr
      if (sr.id) resolvedServiceReports[String(sr.id).toLowerCase()] = sr
      if (sr.report_no) resolvedServiceReports[String(sr.report_no).toLowerCase()] = sr
      if (sr.customer) {
        resolvedCustomers[key] = sr.customer
        resolvedCustomers[String(sr.customer.id).toLowerCase()] = sr.customer
      } else if (sr.customer_id) {
        triggerFetchCustomer(String(sr.customer_id))
      }
      if (Array.isArray(sr.service_spareparts) && sr.service_spareparts.length > 0) {
        resolvedRequests[key] = sr.service_spareparts[0]
      }
      return
    }
  } catch (err) {
    // serviceReports failed -> could be a Customer ID
  }

  // Fallback 2: Try fetching as a Customer
  try {
    const resCust = await resources.customers.get(id)
    if (resCust?.data) {
      resolvedCustomers[key] = resCust.data
      if (resCust.data.id) resolvedCustomers[String(resCust.data.id).toLowerCase()] = resCust.data
    }
  } catch (err) {
    console.warn(`Could not resolve UUID ${id}:`, err)
  }
}

async function triggerFetchServiceReport(id: string) {
  if (!id) return
  const key = id.toLowerCase().trim()
  if (pendingFetches.has(`sr_${key}`)) return
  pendingFetches.add(`sr_${key}`)
  try {
    const res = await resources.serviceReports.get(id)
    if (res?.data) {
      resolvedServiceReports[key] = res.data
      if (res.data.id) resolvedServiceReports[String(res.data.id).toLowerCase()] = res.data
      if (res.data.customer) {
        resolvedCustomers[key] = res.data.customer
        resolvedCustomers[String(res.data.customer.id).toLowerCase()] = res.data.customer
      } else if (res.data.customer_id) {
        triggerFetchCustomer(String(res.data.customer_id))
      }
      return
    }
  } catch (err) {
    // Try serviceSpareparts if this was an SPR ID
    try {
      const resSp = await resources.serviceSpareparts.get(id)
      if (resSp?.data) {
        resolvedRequests[key] = resSp.data
        if (resSp.data.service_report) {
          resolvedServiceReports[key] = resSp.data.service_report
          if (resSp.data.service_report.customer) {
            resolvedCustomers[key] = resSp.data.service_report.customer
          }
        }
      }
    } catch {
      // ignore
    }
  }
}

async function triggerFetchCustomer(id: string) {
  if (!id) return
  const key = id.toLowerCase().trim()
  if (pendingFetches.has(`cust_${key}`)) return
  pendingFetches.add(`cust_${key}`)
  try {
    const res = await resources.customers.get(id)
    if (res?.data) {
      resolvedCustomers[key] = res.data
      if (res.data.id) resolvedCustomers[String(res.data.id).toLowerCase()] = res.data
    }
  } catch (err) {
    console.warn(`Could not fetch customer ${id}:`, err)
  }
}

function resolveAllPORelations(poList: any[]) {
  if (!Array.isArray(poList)) return
  for (const po of poList) {
    if (po.sparepart_request_id) triggerFetchRequest(String(po.sparepart_request_id))
    if (po.service_report_id) triggerFetchServiceReport(String(po.service_report_id))
    if (po.customer_id) triggerFetchCustomer(String(po.customer_id))
  }
}

onMounted(async () => {
  await store.refreshOnly([
    'purchaseOrders',
    'serviceSpareparts',
    'serviceReports',
    'customers',
    'units',
    'technicians',
    'products'
  ])
  resolveAllPORelations(store.purchaseOrders.value || [])
})

/** PO dari sparepart request tidak punya customer_id langsung:
 *  fallback lewat service report terkait agar data customer tetap muncul. */
function resolvePORequest(po: any) {
  if (!po) return null
  if (po.sparepart_request) return po.sparepart_request
  const requests = (store.sparepartRequests.value as any[]) || []
  const id = po.sparepart_request_id
  if (id != null) {
    const strId = String(id).trim().toLowerCase()
    if (resolvedRequests[strId]) return resolvedRequests[strId]
    const found = requests.find((r: any) =>
      String(r.id).trim().toLowerCase() === strId ||
      String(r.service_report_id || '').trim().toLowerCase() === strId ||
      String(r.request_no || '').trim().toLowerCase() === strId
    )
    if (found) return found
    triggerFetchRequest(strId)
  }
  if (po.service_report_id) {
    const srStr = String(po.service_report_id).trim().toLowerCase()
    const foundBySR = requests.find((r: any) =>
      String(r.service_report_id || '').trim().toLowerCase() === srStr ||
      String(r.id || '').trim().toLowerCase() === srStr
    )
    if (foundBySR) return foundBySR
  }
  return null
}

function resolvePOServiceReport(po: any) {
  if (!po) return null
  if (po.service_report) return po.service_report
  const req: any = resolvePORequest(po)
  if (req?.service_report) return req.service_report

  const requests = (store.sparepartRequests.value as any[]) || []
  const reports = (store.serviceReports.value as any[]) || []

  const candidateIds = [
    req?.service_report_id,
    po.service_report_id,
    po.sparepart_request_id,
  ].filter(Boolean).map((x) => String(x).trim().toLowerCase())

  for (const cId of candidateIds) {
    if (resolvedServiceReports[cId]) return resolvedServiceReports[cId]

    const matchedReq = requests.find((r: any) =>
      String(r.id || '').trim().toLowerCase() === cId ||
      String(r.service_report_id || '').trim().toLowerCase() === cId
    )
    if (matchedReq?.service_report) return matchedReq.service_report

    const foundReport = reports.find((s: any) =>
      String(s.id || '').trim().toLowerCase() === cId ||
      String(s.report_no || '').trim().toLowerCase() === cId
    )
    if (foundReport) return foundReport

    const fromStore = (store as any).findServiceReport ? (store as any).findServiceReport(cId) : null
    if (fromStore) return fromStore
  }

  if (po.service_report_id) {
    triggerFetchServiceReport(String(po.service_report_id).trim().toLowerCase())
  }
  return null
}

function resolvePOCustomer(po: any) {
  if (!po) return null
  if (po.customer) return po.customer
  const customers = (store.customers.value as any[]) || []
  const requests = (store.sparepartRequests.value as any[]) || []

  // 1. Direct po.customer_id
  if (po.customer_id) {
    const custIdStr = String(po.customer_id).trim().toLowerCase()
    if (resolvedCustomers[custIdStr]) return resolvedCustomers[custIdStr]
    const direct = store.findCustomer(po.customer_id as any)
    if (direct) return direct
    const direct2 = customers.find((c: any) => String(c.id).trim().toLowerCase() === custIdStr)
    if (direct2) return direct2
    triggerFetchCustomer(custIdStr)
  }

  // 2. Via resolved sparepart request
  const req: any = resolvePORequest(po)
  if (req?.customer) return req.customer
  if (req?.service_report?.customer) return req.service_report.customer
  if (req?.service_report?.customer_id) {
    const srCustId = String(req.service_report.customer_id).trim().toLowerCase()
    if (resolvedCustomers[srCustId]) return resolvedCustomers[srCustId]
    const viaReq = store.findCustomer(srCustId as any)
      || customers.find((c: any) => String(c.id).trim().toLowerCase() === srCustId)
    if (viaReq) return viaReq
    triggerFetchCustomer(srCustId)
  }

  // 3. Via resolved service report
  const sr = resolvePOServiceReport(po)
  if (sr?.customer) return sr.customer
  if (sr?.customer_id) {
    const srCustId = String(sr.customer_id).trim().toLowerCase()
    if (resolvedCustomers[srCustId]) return resolvedCustomers[srCustId]
    const viaSr = store.findCustomer(sr.customer_id as any)
      || customers.find((c: any) => String(c.id).trim().toLowerCase() === srCustId)
    if (viaSr) return viaSr
    triggerFetchCustomer(srCustId)
  }

  // 4. Check if po.sparepart_request_id matches a customer directly
  if (po.sparepart_request_id) {
    const sprIdStr = String(po.sparepart_request_id).trim().toLowerCase()
    if (resolvedCustomers[sprIdStr]) return resolvedCustomers[sprIdStr]
    const viaSpr = store.findCustomer(sprIdStr as any)
      || customers.find((c: any) => String(c.id).trim().toLowerCase() === sprIdStr)
    if (viaSpr) return viaSpr
  }

  // 5. Check if any sparepartRequest in store has customer matching PO
  const candidateIds = [po.sparepart_request_id, po.service_report_id].filter(Boolean).map((x) => String(x).toLowerCase().trim())
  for (const r of requests) {
    const rId = String(r.id || '').toLowerCase().trim()
    const rSrId = String(r.service_report_id || '').toLowerCase().trim()
    if (candidateIds.includes(rId) || candidateIds.includes(rSrId)) {
      if (r.service_report?.customer) return r.service_report.customer
      if (r.customer) return r.customer
      if (r.service_report?.customer_id) {
        const c = store.findCustomer(r.service_report.customer_id as any)
          || customers.find((c: any) => String(c.id).trim().toLowerCase() === String(r.service_report.customer_id).trim().toLowerCase())
        if (c) return c
      }
    }
  }

  // 6. Name string fallback on service report
  if (sr?.customer_name || sr?.customer_name_copier || sr?.customer_name_technical) {
    const name = sr.customer_name || sr.customer_name_copier || sr.customer_name_technical
    return {
      company_name: name,
      name,
      address: sr.customer_address || '-',
      phone: sr.customer_phone || '-',
      pic_name: sr.pic_name || '-',
    }
  }

  // 7. If still null and resolvedCustomers has matching key
  if (po.sparepart_request_id && resolvedCustomers[String(po.sparepart_request_id).toLowerCase()]) {
    return resolvedCustomers[String(po.sparepart_request_id).toLowerCase()]
  }

  return null
}

function resolvePOUnit(po: any) {
  if (!po) return null
  if (po.unit) return po.unit
  if (po.unit_id) {
    const u = store.findUnit(po.unit_id as any)
    if (u) return u
  }
  const sr = resolvePOServiceReport(po)
  if (sr?.unit) return sr.unit
  if (sr?.unit_id) {
    const u = store.findUnit(sr.unit_id as any)
    if (u) return u
  }
  return null
}

function resolvePOTechnician(po: any) {
  if (!po) return null
  const req = resolvePORequest(po)
  if (req?.technician) return req.technician
  if (req?.technician_id) {
    const t = store.findTechnician(req.technician_id as any)
    if (t) return t
  }
  const sr = resolvePOServiceReport(po)
  if (sr?.technician) return sr.technician
  if (sr?.technician_id) {
    const t = store.findTechnician(sr.technician_id as any)
    if (t) return t
  }
  return null
}

function getServiceReportNo(po: any) {
  const sr = resolvePOServiceReport(po)
  return sr ? (sr.report_no || sr.service_report_no || (sr.id ? `SR-${sr.id}` : '-')) : null
}

function getUnitInfo(po: any) {
  const u = resolvePOUnit(po)
  if (!u) return null
  const model = u.model || u.name || ''
  const sn = u.serial_no ? `(S/N: ${u.serial_no})` : ''
  const res = `${model} ${sn}`.trim()
  return res || null
}

function getTechnicianName(po: any) {
  const t = resolvePOTechnician(po)
  if (!t) return null
  return t.user?.name || t.user?.username || t.name || null
}

function getPOReason(po: any): string {
  if (po?.reason && po.reason.trim() && po.reason.trim() !== '-') return po.reason.trim()
  const req = resolvePORequest(po)
  if (req?.reason && req.reason.trim() && req.reason.trim() !== '-') return req.reason.trim()
  const sr = resolvePOServiceReport(po)
  if (sr?.remarks && sr.remarks.trim() && sr.remarks.trim() !== '-') return sr.remarks.trim()
  if (sr?.machine_problem && sr.machine_problem.trim()) return sr.machine_problem.trim()
  return '-'
}

const busyId = ref<string | number | null>(null)
const detailPO = ref<PurchaseOrder | null>(null)
const showDetail = ref(false)

function openDetail(po: PurchaseOrder) {
  detailPO.value = po
  showDetail.value = true
}

function closeDetail() {
  showDetail.value = false
}

function rp(value: number) {
  return `Rp ${(value || 0).toLocaleString('id-ID')}`
}

function getCustomerName(po: any) {
  const customer = resolvePOCustomer(po)
  if (customer) {
    return customer.company_name || customer.name || '-'
  }
  const sr = resolvePOServiceReport(po)
  if (sr?.customer_name) return sr.customer_name
  if (sr?.customer_name_copier) return sr.customer_name_copier
  if (sr?.customer_name_technical) return sr.customer_name_technical
  return '-'
}

function detailTotals(po: PurchaseOrder | null) {
  if (!po) return { subtotal: 0, tax: 0, grand: 0 }
  const subtotal = lineItems(po).reduce((sum: number, item: any) => sum + item.total, 0)
  const tax = subtotal * 0.11
  return { subtotal, tax, grand: subtotal + tax }
}

const columns: TableColumn[] = [
  { key: 'po_no', label: 'Form Number' },
  { key: 'order_date', label: 'Date' },
  { key: 'sparepart_request_id', label: 'Request Ref' },
  { key: 'customer', label: 'Customer' },
  { key: 'reason', label: 'Reason' },
  { key: 'status', label: 'Status' }
]

function getRequestNo(id: number | string | null, po?: any) {
  if (po?.sparepart_request?.request_no) return po.sparepart_request.request_no
  const req = resolvePORequest(po || (id ? { sparepart_request_id: id } : null))
  if (req?.request_no) return req.request_no

  const sr = resolvePOServiceReport(po || (id ? { sparepart_request_id: id } : null))
  if (sr?.service_spareparts?.[0]?.request_no) return sr.service_spareparts[0].request_no
  if (sr?.report_no) return sr.report_no

  const reqId = id || po?.sparepart_request_id || po?.service_report_id
  if (reqId) {
    const str = String(reqId).trim()
    const strLower = str.toLowerCase()

    const allRequests = (store.sparepartRequests.value as any[]) || []
    const match = allRequests.find((r: any) =>
      String(r.id || '').toLowerCase() === strLower ||
      String(r.service_report_id || '').toLowerCase() === strLower ||
      String(r.request_no || '').toLowerCase() === strLower
    )
    if (match?.request_no) return match.request_no
    if (match?.service_report?.report_no) return match.service_report.report_no

    if (resolvedRequests[strLower]?.request_no) return resolvedRequests[strLower].request_no
    if (resolvedServiceReports[strLower]?.report_no) return resolvedServiceReports[strLower].report_no

    if (isUuid(str)) {
      triggerFetchRequest(str)
      return '-'
    }
    if (str.startsWith('SPR')) return str
    return `SPR-${str}`
  }
  return '-'
}

async function run(id: string | number, action: () => Promise<unknown>) {
  if (busyId.value !== null) return
  busyId.value = id
  try {
    await action()
    await store.refreshInBackground()
  } catch (err) {
    toast.error(toast.fromError(err, 'Failed to update purchase order'))
  } finally {
    busyId.value = null
  }
}

function updateStatus(po: PurchaseOrder, newStatus: string) {
  return run(po.id, () => resources.update('purchaseOrders', String(po.id), { status: newStatus }))
}

async function handleGenerateDO(po: PurchaseOrder) {
  await run(po.id, async () => {
    await resources.create('deliveryOrders', {
      do_type: 'inbound',
      purchase_order_id: po.id,
      delivery_date: new Date().toISOString(),
      status: 'draft',
      notes: `Inbound spareparts from ${po.po_no}`,
      delivery_order_items: (po.purchase_order_items || []).map((item: any) => ({
        product_id: item.product_id,
        qty: item.qty,
        remarks: po.po_no
      }))
    })
    await resources.update('purchaseOrders', String(po.id), { status: 'do_created' })
    toast.success(`Delivery order created for ${po.po_no}`)
    router.push('/accounting/delivery-orders')
  })
}

function lineItems(po: any) {
  if (po.purchase_order_items && po.purchase_order_items.length > 0) {
    return po.purchase_order_items.map((item: any) => ({
      name: item.product?.name || item.item_name || store.findProduct(item.product_id)?.name || (po.reason ? `Sparepart (${po.reason})` : 'Sparepart'),
      qty: item.qty || 1,
      price: item.unit_price || 0,
      total: item.total_price || (item.qty || 1) * (item.unit_price || 0)
    }))
  }

  const req: any = resolvePORequest(po)
  if (!req) return []
  const product = req.product || store.findProduct(req.product_id as any)
  const price = req.unit_price || product?.price || 0
  return [{ name: req.item_name || product?.name || (po.reason ? `Sparepart (${po.reason})` : 'Sparepart'), qty: req.qty || 1, price, total: price * (req.qty || 1) }]
}

async function printPO(po: any) {
  let cust = resolvePOCustomer(po)
  let req = resolvePORequest(po)
  let sr = resolvePOServiceReport(po)

  const targetId = po.sparepart_request_id || po.service_report_id
  if ((!cust || !req) && targetId) {
    await triggerFetchRequest(String(targetId))
    req = resolvePORequest(po) || req
    sr = resolvePOServiceReport(po) || sr
    cust = resolvePOCustomer(po) || cust
  }
  if ((!cust || !sr) && (po.service_report_id || req?.service_report_id || targetId)) {
    const srId = po.service_report_id || req?.service_report_id || targetId
    await triggerFetchServiceReport(String(srId))
    sr = resolvePOServiceReport(po) || sr
    cust = resolvePOCustomer(po) || cust
  }
  if (!cust && (po.customer_id || sr?.customer_id || targetId)) {
    const cId = po.customer_id || sr?.customer_id || targetId
    await triggerFetchCustomer(String(cId))
    cust = resolvePOCustomer(po) || cust
  }

  const enrichedPO = {
    ...po,
    customer: cust || po.customer,
    sparepart_request: req || po.sparepart_request,
    service_report: sr || po.service_report,
  }

  await printPurchaseOrder(enrichedPO, currentUser)
}
const printInvoice = printPO
</script>

<template>
  <div>
    <PageHeader title="Request Form" />

    <div class="info-alert mb-4">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span>Manage Request Forms generated from Sparepart Requests. Approved Request Forms can be converted to Delivery Orders for receiving.</span>
    </div>

    <DataTable :columns="columns" :data="store.purchaseOrders.value" search-placeholder="Search request forms...">
      <template #cell-order_date="{ value }">
        {{ value ? new Date(value).toLocaleDateString() : '-' }}
      </template>
      <template #cell-sparepart_request_id="{ value, row }">
        <span class="font-mono text-sm">{{ getRequestNo(value, row) }}</span>
      </template>
      <template #cell-customer="{ row }">
        <span>{{ getCustomerName(row) }}</span>
      </template>
      <template #cell-reason="{ row }">
        <span class="reason-cell" :title="getPOReason(row)">
          {{ getPOReason(row) }}
        </span>
      </template>
      <template #cell-status="{ value }">
        <span class="badge"
              :class="{
                'badge-warning': value === 'draft' || value === 'submitted',
                'badge-success': value === 'approved' || value === 'do_created' || value === 'completed',
                'badge-danger': value === 'rejected' || value === 'cancelled'
              }">
          {{ (value || '').toUpperCase() }}
        </span>
      </template>
      <template #actions="{ row }">
        <div style="display: flex; align-items: center; gap: 6px;">
          <button
            v-if="can('purchase_order:read')"
            class="action-btn action-btn--edit"
            title="Detail"
            @click="openDetail(row)"
            style="color: var(--color-text-muted); width: 36px; height: 36px;"
          >
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button
            v-if="row.status === 'draft' && can('purchase_order:submit')"
            class="action-btn action-btn--edit"
            :disabled="busyId === row.id"
            title="Submit"
            @click="updateStatus(row, 'submitted')"
            style="color: var(--color-primary); width: 36px; height: 36px;"
          >
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
          <button
            v-if="row.status === 'submitted' && can('purchase_order:approve')"
            class="action-btn action-btn--edit"
            :disabled="busyId === row.id"
            title="Approve"
            @click="updateStatus(row, 'approved')"
            style="color: var(--color-success); width: 36px; height: 36px;"
          >
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </button>
          <button
            v-if="row.status === 'submitted' && can('purchase_order:approve')"
            class="action-btn action-btn--delete"
            :disabled="busyId === row.id"
            title="Reject"
            @click="updateStatus(row, 'rejected')"
            style="width: 36px; height: 36px;"
          >
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
          <button
            v-if="(row.status === 'approved' || row.status === 'do_created' || row.status === 'completed') && can('purchase_order:read')"
            class="action-btn action-btn--edit"
            title="Print Request Form"
            @click="printPO(row)"
            style="color: var(--color-primary); width: 36px; height: 36px;"
          >
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"></polyline>
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"></path>
              <rect x="6" y="14" width="12" height="8"></rect>
            </svg>
          </button>
          <button
            v-if="row.status === 'approved' && can('delivery_order:create')"
            class="action-btn action-btn--edit"
            :disabled="busyId === row.id"
            title="Generate DO"
            @click="handleGenerateDO(row)"
            style="color: var(--color-success); width: 36px; height: 36px;"
          >
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
          <span v-if="['do_created', 'completed'].includes(row.status)" class="text-muted text-sm">
            DO Generated
          </span>
        </div>
      </template>
    </DataTable>

    <FormModal
      :open="showDetail"
      :title="detailPO ? `Request Form ${detailPO.po_no}` : 'Request Form Detail'"
      max-width="680px"
      @close="closeDetail"
    >
      <template v-if="detailPO">
        <div class="detail-panel">
          <div class="detail-grid">
            <div class="detail-field">
              <span class="detail-label">Form Number</span>
              <span class="detail-value font-mono">{{ detailPO.po_no }}</span>
            </div>
            <div class="detail-field">
              <span class="detail-label">Date</span>
              <span class="detail-value">{{ detailPO.order_date ? new Date(detailPO.order_date).toLocaleDateString() : '-' }}</span>
            </div>
            <div class="detail-field">
              <span class="detail-label">Request Ref</span>
              <span class="detail-value font-mono">{{ getRequestNo(detailPO.sparepart_request_id, detailPO) }}</span>
            </div>
            <div class="detail-field" v-if="getServiceReportNo(detailPO)">
              <span class="detail-label">Service Report</span>
              <span class="detail-value font-mono">{{ getServiceReportNo(detailPO) }}</span>
            </div>
            <div class="detail-field">
              <span class="detail-label">Customer</span>
              <span class="detail-value">{{ getCustomerName(detailPO) }}</span>
            </div>
            <div class="detail-field" v-if="getUnitInfo(detailPO)">
              <span class="detail-label">Machine / Unit</span>
              <span class="detail-value">{{ getUnitInfo(detailPO) }}</span>
            </div>
            <div class="detail-field" v-if="getTechnicianName(detailPO)">
              <span class="detail-label">Requested By</span>
              <span class="detail-value">{{ getTechnicianName(detailPO) }}</span>
            </div>
            <div class="detail-field" v-if="detailPO.installation_date">
              <span class="detail-label">Target Installation Date</span>
              <span class="detail-value">{{ new Date(detailPO.installation_date).toLocaleDateString() }}</span>
            </div>
            <div class="detail-field">
              <span class="detail-label">Created</span>
              <span class="detail-value">{{ detailPO.created_at ? new Date(detailPO.created_at).toLocaleString() : '-' }}</span>
            </div>
            <div class="detail-field">
              <span class="detail-label">Status</span>
              <span class="badge"
                    :class="{
                      'badge-warning': detailPO.status === 'draft' || detailPO.status === 'submitted',
                      'badge-success': detailPO.status === 'approved' || detailPO.status === 'do_created' || detailPO.status === 'completed',
                      'badge-danger': detailPO.status === 'rejected' || detailPO.status === 'cancelled'
                    }">
                {{ (detailPO.status || '').toUpperCase() }}
              </span>
            </div>
            <div class="detail-field detail-field--full">
              <span class="detail-label">Reason</span>
              <div class="detail-reason-box">
                {{ getPOReason(detailPO) }}
              </div>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h4 class="detail-section-title">Items</h4>
          <table class="detail-table">
            <thead>
              <tr>
                <th class="detail-th-no">No</th>
                <th>Item</th>
                <th class="detail-th-qty">Qty</th>
                <th class="detail-th-num">Unit Price</th>
                <th class="detail-th-num">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, idx) in lineItems(detailPO)" :key="idx">
                <td class="detail-td-no">{{ idx + 1 }}</td>
                <td>{{ item.name }}</td>
                <td class="detail-td-qty">{{ item.qty }}</td>
                <td class="detail-td-num">{{ rp(item.price) }}</td>
                <td class="detail-td-num">{{ rp(item.total) }}</td>
              </tr>
              <tr v-if="lineItems(detailPO).length === 0">
                <td colspan="5" class="detail-empty">No item details</td>
              </tr>
            </tbody>
          </table>

          <div class="detail-totals">
            <div class="detail-total-row">
              <span>Subtotal</span>
              <span>{{ rp(detailTotals(detailPO).subtotal) }}</span>
            </div>
            <div class="detail-total-row">
              <span>Tax (11%)</span>
              <span>{{ rp(detailTotals(detailPO).tax) }}</span>
            </div>
            <div class="detail-total-row detail-total-grand">
              <span>Grand Total</span>
              <span>{{ rp(detailTotals(detailPO).grand) }}</span>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <button class="btn btn-outline" @click="closeDetail">Close</button>
        <button
          v-if="detailPO && can('purchase_order:read')"
          class="btn btn-accent"
          @click="printPO(detailPO)"
        >
          Print Request Form
        </button>
      </template>
    </FormModal>
  </div>
</template>

<style scoped>
.mb-4 {
  margin-bottom: var(--space-lg);
}

.info-alert {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: var(--color-info-surface, #e0f2fe);
  color: var(--color-info, #0284c7);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

.info-alert svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.action-group {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
}

.font-mono {
  font-family: monospace;
}

.text-muted {
  color: var(--color-text-muted);
}
.text-sm {
  font-size: var(--font-size-xs);
}

.detail-panel {
  padding: var(--space-base);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-base) var(--space-lg);
}

.detail-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-width: 0;
}

.detail-label {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.detail-value {
  font-size: var(--font-size-sm);
  color: var(--color-text);
  font-weight: var(--font-weight-medium);
  overflow-wrap: anywhere;
}

.detail-section {
  padding-top: var(--space-base);
  border-top: 1px solid var(--color-border-light);
}

.detail-section-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
  margin-bottom: var(--space-sm);
}

.detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

.detail-table th {
  text-align: left;
  padding: var(--space-sm);
  color: var(--color-text-muted);
  font-weight: var(--font-weight-medium);
  background: var(--color-surface-raised);
  border-bottom: 1px solid var(--color-border);
}

.detail-table th:first-child {
  border-top-left-radius: var(--radius-sm);
}

.detail-table th:last-child {
  border-top-right-radius: var(--radius-sm);
}

.detail-table td {
  padding: var(--space-sm);
  border-bottom: 1px solid var(--color-border-light);
  color: var(--color-text);
}

.detail-th-no,
.detail-td-no {
  width: 32px;
  text-align: center;
}

.detail-th-qty,
.detail-td-qty {
  width: 48px;
  text-align: center;
}

.detail-th-num,
.detail-td-num {
  width: 110px;
  text-align: right;
}

.detail-empty {
  text-align: center;
  color: var(--color-text-muted);
  padding: var(--space-md) !important;
}

.detail-totals {
  margin-top: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  align-items: flex-end;
}

.detail-total-row {
  display: flex;
  justify-content: space-between;
  gap: var(--space-xl);
  width: 240px;
  font-size: var(--font-size-sm);
  color: var(--color-text);
}

.detail-total-grand {
  font-weight: var(--font-weight-semibold);
  padding-top: var(--space-xs);
  border-top: 2px solid var(--color-primary, #305CFF);
}

.reason-cell {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 250px;
  line-height: 1.4;
  font-size: var(--font-size-sm);
  color: var(--color-text);
}

.detail-field--full {
  grid-column: 1 / -1;
}

.detail-reason-box {
  margin-top: 4px;
  padding: 10px 12px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-left: 3px solid var(--color-primary, #305cff);
  border-radius: var(--radius-sm, 4px);
  font-size: var(--font-size-sm);
  line-height: 1.5;
  color: var(--color-text);
  white-space: pre-wrap;
}
</style>
