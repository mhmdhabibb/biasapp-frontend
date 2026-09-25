<script setup lang="ts">
// @ts-nocheck
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useRouter } from 'vue-router'
import type { TableColumn, PurchaseOrder } from '@/types'
import { computed } from 'vue'

const store = useMasterStore()
const router = useRouter()

const columns: TableColumn[] = [
  { key: 'po_no', label: 'PO Number' },
  { key: 'po_date', label: 'Date' },
  { key: 'sparepart_request_id', label: 'Request Ref' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Action' }
]

function getRequestNo(id: number | null) {
  const req = store.sparepartRequests.value.find(r => r.id === id)
  return req ? req.request_no : '-'
}

function handleGenerateDO(po: PurchaseOrder) {
  // Mock logic to create a Delivery Order from the PO
  const newDo = {
    id: Date.now(),
    do_number: `DO-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`,
    purchase_order_id: po.id,
    do_date: new Date().toISOString(),
    status: 'draft',
    receiver_name: '',
    notes: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  store.procurementDeliveryOrders.value.push(newDo)
  
  // Update PO status
  const poIdx = store.purchaseOrders.value.findIndex(p => p.id === po.id)
  if (poIdx !== -1) {
    store.purchaseOrders.value[poIdx].status = 'do_created'
  }

  // Navigate to DO page
  router.push('/accounting/delivery-orders')
}

function updateStatus(po: PurchaseOrder, newStatus: string) {
  const idx = store.purchaseOrders.value.findIndex(p => p.id === po.id)
  if (idx !== -1) {
    store.purchaseOrders.value[idx].status = newStatus
  }
}

function printInvoice(po: any) {
  // Simple print invoice template for Sparepart costs
  const req = store.sparepartRequests.value.find(r => r.id === po.sparepart_request_id) || {}
  
  let totalCost = 0;
  let itemsHtml = '';
  
  // Calculate items
  if (req.items && req.items.length > 0) {
    req.items.forEach((item: any, idx: number) => {
      // Mock price if not available
      const price = item.estimated_price || 150000;
      const subtotal = price * item.qty;
      totalCost += subtotal;
      
      itemsHtml += `
        <tr>
          <td style="text-align: center; border: 1px solid #3399ff; padding: 4px;">${idx + 1}</td>
          <td style="border: 1px solid #3399ff; padding: 4px;">${item.part_name || item.product_id}</td>
          <td style="text-align: center; border: 1px solid #3399ff; padding: 4px;">${item.qty}</td>
          <td style="text-align: right; border: 1px solid #3399ff; padding: 4px;">Rp ${price.toLocaleString('id-ID')}</td>
          <td style="text-align: right; border: 1px solid #3399ff; padding: 4px;">Rp ${subtotal.toLocaleString('id-ID')}</td>
        </tr>
      `;
    })
  } else {
    itemsHtml = `<tr><td colspan="5" style="text-align: center; padding: 10px;">Tidak ada detail item</td></tr>`
  }

  const tax = totalCost * 0.11;
  const grandTotal = totalCost + tax;

  const html = `
    <html>
      <head>
        <title>Invoice Sparepart - ${po.po_no}</title>
        <style>
          @media print {
            @page { margin: 10mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11px; margin: 0; padding: 20px; }
          .inv-container { max-width: 800px; margin: 0 auto; }
          .header-wrap { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .title { color: #3399ff; font-size: 18px; font-weight: bold; margin-bottom: 5px; }
          .invoice-title { text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 2px; margin: 10px 0; border-bottom: 2px solid #3399ff; padding-bottom: 10px; }
          .main-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
          .main-table th { background-color: #3399ff; color: #fff; padding: 8px; border: 1px solid #3399ff; }
          .total-row td { border: 2px solid #3399ff; font-weight: bold; padding: 6px; }
        </style>
      </head>
      <body>
        <div class="inv-container">
          <div class="header-wrap">
            <div>
              <div class="title">PT. BIAS SURYA TEKNOLOGI</div>
              <div>Greenland Housing Blok E6 No. 11<br>Batam Kota - Batam</div>
            </div>
            <div style="text-align: right;">
              <div><b>INVOICE NO:</b> INV-SP-${po.id || Math.floor(Math.random()*1000)}</div>
              <div><b>DATE:</b> ${new Date().toLocaleDateString('id-ID')}</div>
              <div><b>REF PO:</b> ${po.po_no}</div>
            </div>
          </div>
          <div class="invoice-title">SPAREPART INVOICE</div>
          <table class="main-table">
            <thead>
              <tr>
                <th style="width: 30px;">No</th>
                <th>Item Description</th>
                <th style="width: 50px;">Qty</th>
                <th style="width: 120px;">Unit Price</th>
                <th style="width: 120px;">Total Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
              <tr class="total-row">
                <td colspan="4" style="text-align: right;">SUBTOTAL</td>
                <td style="text-align: right;">Rp ${totalCost.toLocaleString('id-ID')}</td>
              </tr>
              <tr class="total-row">
                <td colspan="4" style="text-align: right;">TAX (11%)</td>
                <td style="text-align: right;">Rp ${tax.toLocaleString('id-ID')}</td>
              </tr>
              <tr class="total-row">
                <td colspan="4" style="text-align: right;">GRAND TOTAL</td>
                <td style="text-align: right; color: #000; background-color: #e6f2ff;">Rp ${grandTotal.toLocaleString('id-ID')}</td>
              </tr>
            </tbody>
          </table>
          <div style="margin-top: 50px; display: flex; justify-content: flex-end;">
            <div style="text-align: center; width: 200px;">
              Hormat Kami,
              <br><br><br><br>
              <u>Finance</u>
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
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
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
      <template #cell-po_date="{ value }">
        {{ new Date(value).toLocaleDateString() }}
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
          {{ value.toUpperCase() }}
        </span>
      </template>
      <template #cell-actions="{ row }">
        <div class="action-group">
          <button 
            v-if="row.status === 'draft'"
            class="btn btn-sm btn-outline"
            @click="updateStatus(row, 'submitted')"
          >
            Submit
          </button>
          <button 
            v-if="row.status === 'submitted'"
            class="btn btn-sm btn-primary"
            @click="updateStatus(row, 'approved')"
          >
            Approve
          </button>
          <button 
            v-if="row.status === 'approved' || row.status === 'do_created' || row.status === 'completed'"
            class="btn btn-sm btn-outline"
            style="color: var(--color-primary); border-color: var(--color-primary);"
            @click="printInvoice(row)"
          >
            Print Invoice
          </button>
          <button 
            v-if="row.status === 'approved'"
            class="btn btn-sm btn-accent"
            @click="handleGenerateDO(row)"
          >
            Generate DO
          </button>
          <span v-if="['do_created', 'completed'].includes(row.status)" class="text-muted text-sm">
            DO Generated
          </span>
        </div>
      </template>
    </DataTable>
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
</style>
