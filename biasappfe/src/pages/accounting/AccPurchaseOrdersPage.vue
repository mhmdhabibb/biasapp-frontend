<script setup lang="ts">
// @ts-nocheck
import { ref } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useResourcesStore } from '@/stores/resources.store'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { useRouter } from 'vue-router'
import type { TableColumn, PurchaseOrder } from '@/types'

const { can } = usePermission()
const store = useMasterStore()
const resources = useResourcesStore()
const toast = useToast()
const router = useRouter()

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
  if (!po?.customer_id) return '-'
  const customer = store.findCustomer(po.customer_id)
  return customer ? customer.company_name : '-'
}

function detailTotals(po: PurchaseOrder | null) {
  if (!po) return { subtotal: 0, tax: 0, grand: 0 }
  const subtotal = lineItems(po).reduce((sum: number, item: any) => sum + item.total, 0)
  const tax = subtotal * 0.11
  return { subtotal, tax, grand: subtotal + tax }
}

const columns: TableColumn[] = [
  { key: 'po_no', label: 'PO Number' },
  { key: 'order_date', label: 'Date' },
  { key: 'sparepart_request_id', label: 'Request Ref' },
  { key: 'status', label: 'Status' }
]

function getRequestNo(id: number | null) {
  const req = store.sparepartRequests.value.find(r => r.id === id)
  return req ? req.request_no : '-'
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
      name: item.item_name || store.findProduct(item.product_id)?.name || 'Sparepart',
      qty: item.qty,
      price: item.unit_price,
      total: item.total_price || item.qty * item.unit_price
    }))
  }

  const req = store.sparepartRequests.value.find(r => r.id === po.sparepart_request_id)
  if (!req) return []
  const product = store.findProduct(req.product_id as any)
  const price = product?.price || 0
  return [{ name: product?.name || 'Sparepart', qty: req.qty, price, total: price * req.qty }]
}

function printInvoice(po: any) {
  const customer = store.findCustomer(po.customer_id as any)
  const custName = customer?.company_name || customer?.name || '-'
  const custAddress = customer?.address || '-'
  const custPhone = customer?.phone || '-'
  const pic = customer?.pic_name || '-'
  const gender = customer?.pic_gender
  let prefix = 'Mr./Ms. '
  if (gender === 'L') prefix = 'Mr. '
  if (gender === 'P') prefix = 'Ms. '
  const picDisplay = pic !== '-' ? prefix + pic : '-'

  const invoiceDate = po.order_date || po.created_at
  const dateStr = invoiceDate ? new Date(invoiceDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'

  const items = lineItems(po)
  const subTotal = items.reduce((sum: number, item: any) => sum + item.total, 0)
  const tax = subTotal * 0.11
  const grandTotal = subTotal + tax

  const itemsHtml = items.length > 0
    ? items.map((item: any, idx: number) => `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td>${item.name}</td>
          <td style="text-align: center;">${item.qty}</td>
          <td style="text-align: center;">unit</td>
          <td class="rp-col">Rp</td><td class="val-col">${(item.price || 0).toLocaleString('id-ID')}</td>
          <td class="rp-col">Rp</td><td class="val-col">${(item.total || 0).toLocaleString('id-ID')}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="8" style="text-align: center; color: #666;">Item data unavailable</td></tr>`

  const subTotalStr = subTotal.toLocaleString('id-ID')
  const taxStr = tax.toLocaleString('id-ID')
  const amountStr = grandTotal.toLocaleString('id-ID')

  const html = `
    <html>
      <head>
        <title>Invoice - ${po.po_no}</title>
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
                <div style="font-size: 20px; font-weight: bold; text-align: right; margin-bottom: 10px; font-family: monospace;">PO NO. : ${po.po_no}</div>
                <table class="meta-table">
                  <tr>
                    <td class="label">Date :</td>
                    <td>${dateStr}</td>
                  </tr>
                  <tr>
                    <td class="label">Request :</td>
                    <td>${getRequestNo(po.sparepart_request_id)}</td>
                  </tr>
                  <tr>
                    <td colspan="2" class="bg-blue">To :</td>
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
                    <td class="label">Attn.:</td>
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
              <td class="label">Tax (11%)</td>
              <td class="rp-col" style="border-right: none; padding-right: 0;">Rp</td>
              <td class="val-col" style="border-left: none; text-align: right;">${taxStr}</td>
            </tr>
            <tr>
              <td class="label">Amount</td>
              <td class="rp-col" style="border-right: none; padding-right: 0;">Rp</td>
              <td class="val-col" style="border-left: none; text-align: right;">${amountStr}</td>
            </tr>
          </table>

          <div class="payment-info">
            Payment via bank transfer to:<br>
            BANK BRKSYARIAH Cabang Batam<br>
            Account No. 106-08-85757<br>
            Account Name : PT. BIAS SURYA TEKNOLOGI<br>
            NPWP : 0941.8395.0822.5000
          </div>

          <div class="signatures">
            <div class="sig-box">
              Received By,
              <div class="sig-line"></div>
            </div>
            <div class="sig-box">
              Sincerely,
              <div class="sig-line">Grace</div>
            </div>
          </div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(() => { window.print(); }, 500);
          }
        \x3C/script>
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
    <PageHeader title="Purchase Orders" />

    <div class="info-alert mb-4">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span>Manage Purchase Orders generated from Sparepart Requests. Approved POs can be converted to Delivery Orders for receiving.</span>
    </div>

    <DataTable :columns="columns" :data="store.purchaseOrders.value" search-placeholder="Search purchase orders...">
      <template #cell-order_date="{ value }">
        {{ value ? new Date(value).toLocaleDateString() : '-' }}
      </template>
      <template #cell-sparepart_request_id="{ value }">
        <span class="font-mono text-sm">{{ getRequestNo(value) }}</span>
      </template>
      <template #cell-status="{ value }">
        <span class="badge"
              :class="{
                'badge-warning': value === 'draft' || value === 'submitted',
                'badge-success': value === 'approved' || value === 'do_created' || value === 'completed',
                'badge-danger': value === 'cancelled'
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
            title="Print Invoice"
            @click="printInvoice(row)"
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
      :title="detailPO ? `Purchase Order ${detailPO.po_no}` : 'Purchase Order Detail'"
      max-width="680px"
      @close="closeDetail"
    >
      <template v-if="detailPO">
        <div class="detail-panel">
          <div class="detail-grid">
            <div class="detail-field">
              <span class="detail-label">PO Number</span>
              <span class="detail-value font-mono">{{ detailPO.po_no }}</span>
            </div>
            <div class="detail-field">
              <span class="detail-label">Date</span>
              <span class="detail-value">{{ detailPO.order_date ? new Date(detailPO.order_date).toLocaleDateString() : '-' }}</span>
            </div>
            <div class="detail-field">
              <span class="detail-label">Request Ref</span>
              <span class="detail-value font-mono">{{ getRequestNo(detailPO.sparepart_request_id) }}</span>
            </div>
            <div class="detail-field">
              <span class="detail-label">Customer</span>
              <span class="detail-value">{{ getCustomerName(detailPO) }}</span>
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
                      'badge-danger': detailPO.status === 'cancelled'
                    }">
                {{ (detailPO.status || '').toUpperCase() }}
              </span>
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
          @click="printInvoice(detailPO)"
        >
          Print Invoice
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
</style>
