<script setup lang="ts">
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useResourcesStore } from '@/stores/resources.store'
import type { TableColumn, Payment } from '@/types'

const {
  payments: data,
  rentalInvoices,
  salesInvoices,
  customers,
  findRentalInvoice,
  findSalesInvoice,
  findCustomer,
} = useMasterStore()

const resources = useResourcesStore()

const columns: TableColumn[] = [
  { key: 'payment_no', label: 'No. Pembayaran' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'invoice_type', label: 'Jenis Invoice' },
  { key: 'invoice_no', label: 'No. Invoice' },
  { key: 'payment_date', label: 'Tanggal Bayar' },
  { key: 'amount', label: 'Jumlah' },
  { key: 'tax_deduction', label: 'Potongan Pajak' },
  { key: 'balance', label: 'Saldo' },
  { key: 'reference_no', label: 'No. Referensi' },
  { key: 'status', label: 'Status' },
]

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Payment | null>(null)
const deletingItem = ref<Payment | null>(null)
const form = reactive({
  payment_no: '',
  invoice_type: 'rental' as 'rental' | 'sales',
  rental_invoice_id: null as any,
  sales_invoice_id: null as any,
  customer_id: null as any,
  payment_date: '',
  amount: 0,
  tax_deduction: 0,
  balance: 0,
  reference_no: '',
  status: 'pending',
})

const defaultForm = { ...form }

function onInvoiceChange() {
  if (form.invoice_type === 'rental') {
    const inv = findRentalInvoice(form.rental_invoice_id)
    if (inv) {
      form.customer_id = (inv as any).customer_id
      form.amount = (inv as any).total_pay || (inv as any).total || (inv as any).total_amount || 0
    }
  } else {
    const inv = findSalesInvoice(form.sales_invoice_id)
    if (inv) {
      form.customer_id = inv.customer_id
      form.amount = inv.total || 0
    }
  }
}

function openAdd() {
  editingItem.value = null
  Object.assign(form, { ...defaultForm, payment_no: `PAY-${Date.now().toString().slice(-6)}`, payment_date: new Date().toISOString().slice(0, 10) })
  showModal.value = true
}

function openEdit(item: any) {
  editingItem.value = item
  Object.assign(form, {
    payment_no: item.payment_no,
    invoice_type: item.sales_invoice_id ? 'sales' : 'rental',
    rental_invoice_id: item.rental_invoice_id,
    sales_invoice_id: item.sales_invoice_id,
    customer_id: item.customer_id,
    payment_date: item.payment_date,
    amount: item.amount,
    tax_deduction: item.tax_deduction,
    balance: item.balance,
    reference_no: item.reference_no,
    status: item.status || 'pending',
  })
  showModal.value = true
}

async function handleSubmit() {
  if (!form.payment_no.trim()) return
  form.balance = form.amount - form.tax_deduction
  try {
    let savedItem;
    if (editingItem.value) {
      savedItem = await resources.update("payments", editingItem.value.id as any, form)
    } else {
      savedItem = await resources.create("payments", form)
    }
    useMasterStore().refresh(true)
    showModal.value = false

    // Auto-print receipt when approved
    if (form.status === 'approved') {
      setTimeout(() => {
        printReceipt((savedItem || form) as any)
      }, 500)
    }
  } catch (error) {
    alert("Gagal menyimpan pembayaran!")
  }
}

function openDelete(item: any) { deletingItem.value = item; showConfirm.value = true }
async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.remove("payments", deletingItem.value.id as any)
      useMasterStore().refresh(true)
    } catch (error) {
      alert("Gagal menghapus pembayaran!")
    }
  }
  showConfirm.value = false
}

function customerName(id: any): string {
  const c = findCustomer(id as any)
  return c ? c.company_name || c.name || '-' : '-'
}

function invoiceNo(item: any): string {
  if (item.sales_invoice_id) {
    const inv = findSalesInvoice(item.sales_invoice_id)
    return inv ? inv.invoice_no : '-'
  }
  const inv = findRentalInvoice(item.rental_invoice_id)
  return inv ? inv.invoice_no : '-'
}

function formatRupiah(val: number): string {
  return 'Rp ' + val.toLocaleString('id-ID')
}

const spellNumber = (n: number): string => {
  const words = ['Nol', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  if (n < 12) return words[n] || '';
  if (n < 20) return spellNumber(n - 10) + ' Belas';
  if (n < 100) return spellNumber(Math.floor(n / 10)) + ' Puluh' + (n % 10 ? ' ' + spellNumber(n % 10) : '');
  if (n < 200) return 'Seratus' + (n % 100 ? ' ' + spellNumber(n % 100) : '');
  if (n < 1000) return spellNumber(Math.floor(n / 100)) + ' Ratus' + (n % 100 ? ' ' + spellNumber(n % 100) : '');
  if (n < 2000) return 'Seribu' + (n % 1000 ? ' ' + spellNumber(n % 1000) : '');
  if (n < 1000000) return spellNumber(Math.floor(n / 1000)) + ' Ribu' + (n % 1000 ? ' ' + spellNumber(n % 1000) : '');
  if (n < 1000000000) return spellNumber(Math.floor(n / 1000000)) + ' Juta' + (n % 1000000 ? ' ' + spellNumber(n % 1000000) : '');
  return n.toString();
};

function printReceipt(item: Payment) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const invNo = invoiceNo(item);
  const custName = customerName(item.customer_id);
  const payDateStr = new Date(item.payment_date).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
  const amountStr = formatRupiah(item.amount);
  const spelledOut = spellNumber(item.amount) + ' Rupiah';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Tanda Terima - ${item.payment_no}</title>
        <style>
          @page { size: A5 landscape; margin: 1.5cm; }
          body { font-family: "Arial", sans-serif; font-size: 11pt; color: #000; margin: 0; padding: 0; }
          .receipt-container { border: 2px solid #000; padding: 20px; border-radius: 8px; position: relative; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
          .header-left h1 { margin: 0; font-size: 16pt; color: #004d99; font-weight: 900; }
          .header-left h2 { margin: 0; font-size: 10pt; font-style: italic; }
          .header-right { text-align: right; font-weight: bold; font-size: 14pt; color: #333; }
          .row { display: flex; margin-bottom: 10px; }
          .label { width: 140px; font-weight: bold; }
          .value { flex: 1; border-bottom: 1px dotted #000; padding-left: 10px; }
          .value-box { background: #f0f0f0; border: 1px solid #000; padding: 5px 10px; font-weight: bold; font-size: 14pt; display: inline-block; min-width: 150px; text-align: center; margin-top: 10px; }
          .footer { display: flex; justify-content: space-between; margin-top: 30px; }
          .sign-box { text-align: center; width: 200px; }
          .sign-line { border-top: 1px solid #000; margin-top: 60px; padding-top: 5px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="header">
            <div class="header-left">
              <h1>PT. BIAS SURYA TEKNOLOGI</h1>
              <h2>Kwitansi / Tanda Terima</h2>
            </div>
            <div class="header-right">
              No. ${item.payment_no}
            </div>
          </div>
          
          <div class="row">
            <div class="label">Telah terima dari</div>
            <div class="value">${custName}</div>
          </div>
          <div class="row">
            <div class="label">Uang sejumlah</div>
            <div class="value" style="font-style: italic;"># ${spelledOut} #</div>
          </div>
          <div class="row">
            <div class="label">Untuk pembayaran</div>
            <div class="value">Pembayaran Invoice No: ${invNo}</div>
          </div>
          <div class="row">
            <div class="label">Catatan / Ref</div>
            <div class="value">${item.reference_no || '-'}</div>
          </div>
          
          <div class="footer">
            <div>
              <div class="value-box">${amountStr}</div>
            </div>
            <div class="sign-box">
              <div>Batam, ${payDateStr}</div>
              <div class="sign-line">Penerima</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
  
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 500);
}
</script>

<template>
  <div>
    <PageHeader title="Payments" button-label="Add Payment" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari pembayaran..." @edit="openEdit" @delete="openDelete">
      <template #cell-customer_id="{ value }">{{ customerName(value as any) }}</template>
      <template #cell-invoice_type="{ row }">{{ row.sales_invoice_id ? 'Sales' : 'Rental' }}</template>
      <template #cell-invoice_no="{ row }">{{ invoiceNo(row) }}</template>
      <template #cell-amount="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-tax_deduction="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-balance="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-status="{ value }">
        <span :class="value === 'approved' ? 'badge badge-success' : value === 'rejected' ? 'badge badge-danger' : 'badge badge-warning'">
          {{ value === 'approved' ? 'Approved' : value === 'rejected' ? 'Rejected' : 'Pending' }}
        </span>
      </template>
      
      <template #actions="{ row }">
        <button class="action-btn" title="Print Kwitansi" @click="printReceipt(row)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
        </button>
        <button class="action-btn action-btn--edit" title="Edit" @click="openEdit(row)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="action-btn action-btn--delete" title="Delete" @click="openDelete(row)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Payment' : 'Add Payment'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="pay-no" class="form-label">No. Pembayaran</label>
        <input id="pay-no" v-model="form.payment_no" type="text" class="form-input" placeholder="PAY-XXXXXX">
      </div>
      <div class="form-group">
        <label for="pay-inv-type" class="form-label">Jenis Invoice</label>
        <select id="pay-inv-type" v-model="form.invoice_type" class="form-select" @change="onInvoiceChange">
          <option value="rental">Rental / Sewa</option>
          <option value="sales">Sales / Penjualan</option>
        </select>
      </div>
      <div class="form-group" v-if="form.invoice_type === 'rental'">
        <label for="pay-invoice" class="form-label">Pilih Invoice Sewa</label>
        <select id="pay-invoice" v-model="form.rental_invoice_id" class="form-select" @change="onInvoiceChange">
          <option :value="null">-- Pilih Invoice --</option>
          <option v-for="inv in rentalInvoices" :key="inv.id" :value="inv.id">{{ inv.invoice_no }} — {{ formatRupiah((inv as any).total_pay || (inv as any).total || 0) }}</option>
        </select>
      </div>
      <div class="form-group" v-else>
        <label for="pay-invoice-sales" class="form-label">Pilih Invoice Penjualan</label>
        <select id="pay-invoice-sales" v-model="form.sales_invoice_id" class="form-select" @change="onInvoiceChange">
          <option :value="null">-- Pilih Invoice --</option>
          <option v-for="inv in salesInvoices" :key="inv.id" :value="inv.id">{{ inv.invoice_no }} — {{ formatRupiah(inv.total || 0) }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="pay-customer" class="form-label">Customer</label>
        <select id="pay-customer" v-model="form.customer_id" class="form-select">
          <option :value="null">-- Pilih Customer --</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.company_name || c.name || '-' }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="pay-date" class="form-label">Tanggal Pembayaran</label>
        <input id="pay-date" v-model="form.payment_date" type="date" class="form-input">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="pay-amount" class="form-label">Jumlah (Rp)</label>
          <input id="pay-amount" v-model.number="form.amount" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="pay-tax" class="form-label">Potongan Pajak (Rp)</label>
          <input id="pay-tax" v-model.number="form.tax_deduction" type="number" class="form-input" min="0">
        </div>
      </div>
      <div class="form-group">
        <label for="pay-ref" class="form-label">No. Referensi</label>
        <input id="pay-ref" v-model="form.reference_no" type="text" class="form-input" placeholder="No. transfer / kwitansi">
      </div>
      <div class="form-group">
        <label for="pay-status" class="form-label">Status (Approval Finance)</label>
        <select id="pay-status" v-model="form.status" class="form-select">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Pembayaran" :message="`Yakin ingin menghapus pembayaran '${deletingItem?.payment_no}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-base);
}
</style>
