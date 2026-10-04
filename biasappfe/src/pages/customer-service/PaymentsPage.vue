<script setup lang="ts">
import { computed, ref, reactive, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "@/components/ui/PageHeader.vue";
import DataTable from "@/components/ui/DataTable.vue";
import FormModal from "@/components/ui/FormModal.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import { useMasterStore } from "@/composables/useMasterStore";
import { usePermission } from "@/composables/usePermission";
import { useResourcesStore } from "@/stores/resources.store";
import { useToast } from "@/composables/useToast";
import { useAuth } from "@/composables/useAuth";
import {
  buildPaymentTimestamp,
  buildPaymentVerifyUrl,
  generatePaymentQrDataUrl,
  paymentMethodOf,
  printPaymentReceipt,
  printPaymentSlip,
  printPaymentStruk,
} from "@/utils/paymentReceipt";
import type { TableColumn, Payment } from "@/types";
import type { PaymentReceiptData } from "@/utils/paymentReceipt";

const toast = useToast();
const { can, canApprove } = usePermission();
const { currentUser } = useAuth();
const route = useRoute();
const pageRouter = useRouter();

// Deep-link dari notifikasi: ?payment_no=PAY-... langsung buka modal
// transaksinya begitu data payments termuat.
const deepLinkDone = ref(false);
function tryDeepLink() {
  if (deepLinkDone.value) return;
  const no = String(route.query.payment_no || "").trim();
  if (!no) return;
  const list = (data.value || []) as any[];
  if (list.length === 0) return; // tunggu data termuat
  deepLinkDone.value = true;
  const found = list.find((p) => String(p.payment_no) === no);
  if (found) {
    openPaymentDetails(found);
  } else {
    toast.warning(`Payment ${no} tidak ditemukan.`);
  }
  pageRouter.replace({ query: {} });
}
onMounted(() => {
  tryDeepLink();
  // Batas aman: bila data tak kunjung ada, beri pesan lalu bersihkan query.
  setTimeout(() => {
    const no = String(route.query.payment_no || "").trim();
    if (no && !deepLinkDone.value) {
      deepLinkDone.value = true;
      toast.warning(`Payment ${no} tidak ditemukan.`);
      pageRouter.replace({ query: {} });
    }
  }, 8000);
});
watch(
  [() => route.query.payment_no, () => (data.value || []).length],
  () => {
    deepLinkDone.value = false;
    tryDeepLink();
  },
);
const canManageApprovals = computed(
  () =>
    canApprove("payment") ||
    currentUser.value?.role?.trim().toLowerCase() === "accounting",
);
const {
  payments: data,
  rentalInvoices,
  salesInvoices,
  customers,
  findRentalInvoice,
  findSalesInvoice,
  findCustomer,
} = useMasterStore();

const resources = useResourcesStore();

const columns: TableColumn[] = [
  { key: "payment_no", label: "Payment No." },
  { key: "customer_id", label: "Customer" },
  { key: "sender_name", label: "Sender Name" },
  { key: "invoice_no", label: "Invoice No." },
  { key: "payment_date", label: "Payment Date" },
  { key: "amount", label: "Amount" },
  { key: "status", label: "Status" },
];

const showModal = ref(false);
const showConfirm = ref(false);
const editingItem = ref<Payment | null>(null);
const deletingItem = ref<Payment | null>(null);
const selectedPayment = ref<Payment | null>(null);
const form = reactive({
  payment_no: "",
  invoice_type: "rental" as "rental" | "sales",
  rental_invoice_id: null as any,
  sales_invoice_id: null as any,
  customer_id: null as any,
  payment_date: "",
  amount: 0,
  tax_deduction: 0,
  balance: 0,
  reference_no: "",
  sender_name: "",
  status: "pending",
});

const defaultForm = { ...form };

function onInvoiceChange() {
  if (form.invoice_type === "rental") {
    const inv = findRentalInvoice(form.rental_invoice_id);
    if (inv) {
      form.customer_id = (inv as any).customer_id;
      form.amount =
        (inv as any).total_pay ||
        (inv as any).total ||
        (inv as any).total_amount ||
        0;
    }
  } else {
    const inv = findSalesInvoice(form.sales_invoice_id);
    if (inv) {
      form.customer_id = inv.customer_id;
      form.amount = inv.total || 0;
    }
  }
}

function openAdd() {
  editingItem.value = null;
  Object.assign(form, {
    ...defaultForm,
    payment_no: `PAY-${Date.now().toString().slice(-6)}`,
    payment_date: new Date().toISOString().slice(0, 10),
  });
  showModal.value = true;
}

function openEdit(item: any) {
  editingItem.value = item;
  Object.assign(form, {
    payment_no: item.payment_no,
    invoice_type: item.sales_invoice_id ? "sales" : "rental",
    rental_invoice_id: item.rental_invoice_id,
    sales_invoice_id: item.sales_invoice_id,
    customer_id: item.customer_id,
    payment_date: item.payment_date,
    amount: item.amount,
    tax_deduction: item.tax_deduction,
    balance: item.balance,
    reference_no: item.reference_no,
    sender_name: item.sender_name || "",
    status: item.status || "pending",
  });
  showModal.value = true;
}

async function handleSubmit() {
  if (!form.payment_no.trim()) return;
  form.balance = form.amount - form.tax_deduction;
  const isNew = !editingItem.value;
  // Simpan jam transaksi asli bila tanggalnya hari ini.
  const paymentTs = isNew
    ? buildPaymentTimestamp(form.payment_date)
    : form.payment_date;
  try {
    if (editingItem.value) {
      await resources.update("payments", editingItem.value.id as any, form);
    } else {
      await resources.create("payments", {
        ...form,
        payment_date: paymentTs,
      });
    }
    useMasterStore().refreshInBackground();
    showModal.value = false;
    toast.success(
      editingItem.value
        ? "Payment successfully updated!"
        : "Payment successfully saved!",
    );
    // Bukti langsung untuk customer: tanda terima sementara (pending verifikasi).
    if (isNew) {
      const invNo =
        form.invoice_type === "sales"
          ? findSalesInvoice(form.sales_invoice_id)?.invoice_no || "-"
          : findRentalInvoice(form.rental_invoice_id)?.invoice_no || "-";
      const opened = printPaymentSlip({
        payment_no: form.payment_no,
        invoice_no: invNo,
        customer_name: customerName(form.customer_id),
        payment_date: paymentTs,
        amount: form.amount,
        reference_no: form.reference_no,
        sender_name: form.sender_name,
        status: "pending",
        cs_name: currentUser.value?.name?.trim() || "-",
      });
      if (!opened)
        toast.warning("Izinkan pop-up browser untuk mencetak tanda terima.");
    }
  } catch (error) {
    toast.error("Failed to save payment!");
  }
}

function openDelete(item: any) {
  deletingItem.value = item;
  showConfirm.value = true;
}
async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.remove("payments", deletingItem.value.id as any);
      useMasterStore().refreshInBackground();
      toast.success("Payment successfully deleted!");
    } catch (error) {
      toast.error("Failed to delete payment!");
    }
  }
  showConfirm.value = false;
}

async function updateApprovalStatus(
  item: Payment,
  status: "approved" | "rejected",
) {
  if (
    status === "rejected" &&
    !window.confirm(`Reject payment ${item.payment_no}?`)
  ) {
    return;
  }
  if (
    status === "approved" &&
    !window.confirm(
      `Setujui pembayaran ${item.payment_no}?\n\nTunai: pastikan uang SUDAH DITERIMA dari CS.\nTransfer: cek mutasi bank / bukti transfer.\n\nApprove = kwitansi LUNAS terbit. Jika dana belum masuk, pilih Reject.`,
    )
  ) {
    return;
  }
  try {
    await resources.update("payments", String(item.id), { status });
    await useMasterStore().refreshInBackground();
    toast.success(
      status === "approved" ? "Payment approved." : "Payment rejected.",
    );
  } catch (error) {
    toast.error(
      `Failed to ${status === "approved" ? "approve" : "reject"} payment.`,
    );
  }
}

function customerName(id: any): string {
  const c = findCustomer(id as any) as any;
  return c ? c.company_name || c.name || "-" : "-";
}

function paymentCustomerName(item: Payment): string {
  const invoice = item.sales_invoice_id
    ? findSalesInvoice(item.sales_invoice_id)
    : findRentalInvoice(item.rental_invoice_id as any);
  const relatedInvoice = item.sales_invoice_id
    ? (item as any).sales_invoice
    : (item as any).rental_invoice;
  const customerId =
    item.customer_id ||
    relatedInvoice?.customer_id ||
    (invoice as any)?.customer_id;
  const nestedCustomer = relatedInvoice?.customer || (invoice as any)?.customer;
  if (nestedCustomer) {
    return nestedCustomer.company_name || nestedCustomer.name || "-";
  }
  return customerName(customerId);
}

function senderName(item: Payment): string {
  if ((item as any).sender_name) return (item as any).sender_name;
  const match = item.bank_name?.match(/\bA\/N\s*:\s*([^)]*)\)?/i);
  return match?.[1]?.trim() || "-";
}

/** Nama CS pembuat payment (dikunci). Fallback ke login saat ini untuk data lama. */
function csNameOf(item: any): string {
  const fromRecord =
    (item as any)?.user?.name || (item as any)?.user?.username || "";
  if (String(fromRecord).trim()) return String(fromRecord).trim();
  return currentUser.value?.name?.trim() || "-";
}

function invoiceNo(item: any): string {
  if (item.sales_invoice_id) {
    const inv = findSalesInvoice(item.sales_invoice_id);
    return inv?.invoice_no || item.sales_invoice?.invoice_no || "-";
  }
  const inv = findRentalInvoice(item.rental_invoice_id);
  return inv?.invoice_no || item.rental_invoice?.invoice_no || "-";
}

function openPaymentDetails(item: Payment) {
  selectedPayment.value = item;
}

function formatRupiah(val: number): string {
  return "Rp " + val.toLocaleString("id-ID");
}

function invoicePaidState(item: Payment): { lunas: boolean; partial: boolean } {
  const inv: any = item.sales_invoice_id
    ? findSalesInvoice(item.sales_invoice_id)
    : findRentalInvoice(item.rental_invoice_id as any);
  const nested = (item as any).sales_invoice || (item as any).rental_invoice;
  const ps = String(
    inv?.payment_status || nested?.payment_status || "",
  ).toLowerCase();
  return { lunas: ps === "paid", partial: ps === "partially_paid" || ps === "partial" };
}

function receiptPayload(item: Payment): PaymentReceiptData {
  const { lunas, partial } = invoicePaidState(item);
  const s = senderName(item);
  return {
    payment_no: item.payment_no,
    invoice_no: invoiceNo(item),
    customer_name: paymentCustomerName(item),
    payment_date: item.payment_date,
    amount: item.amount,
    reference_no: item.reference_no,
    sender_name: s && s !== "-" ? s : "",
    status: item.status,
    lunas,
    partial,
    method: paymentMethodOf((item as any).bank_name),
    cs_name: csNameOf(item),
  };
}

/** Struk 80mm — cetak default untuk payment approved. */
async function printReceipt(item: Payment) {
  if (item.status !== "approved") {
    toast.warning(
      "Kwitansi hanya bisa dicetak setelah ACC menyetujui pembayaran (approved).",
    );
    return;
  }
  const payload = receiptPayload(item);
  // Buka window dulu (sinkron) agar tidak diblokir pop-up blocker,
  // baru generate QR lalu isi konten.
  const win = window.open("", "_blank");
  if (!win) {
    toast.warning("Izinkan pop-up browser untuk mencetak bukti pembayaran.");
    return;
  }
  payload.qr_data_url = await generatePaymentQrDataUrl(
    buildPaymentVerifyUrl(payload),
  );
  const opened = printPaymentStruk(payload, win);
  if (!opened)
    toast.warning("Izinkan pop-up browser untuk mencetak bukti pembayaran.");
}

/** Kwitansi A5 — opsi kedua untuk payment approved. */
function printReceiptA5(item: Payment) {
  if (item.status !== "approved") {
    toast.warning(
      "Kwitansi hanya bisa dicetak setelah ACC menyetujui pembayaran (approved).",
    );
    return;
  }
  const opened = printPaymentReceipt(receiptPayload(item));
  if (!opened)
    toast.warning("Izinkan pop-up browser untuk mencetak bukti pembayaran.");
}

/** Tanda terima sementara untuk payment yang belum diverifikasi (pending). */
function printSlip(item: any) {
  if (item.status === "rejected") {
    toast.warning("Pembayaran ditolak — tanda terima tidak dapat dicetak.");
    return;
  }
  if (item.status === "approved") {
    printReceipt(item as Payment);
    return;
  }
  const slipSender = (() => {
    const s = senderName(item);
    return s && s !== "-" ? s : "";
  })();
  const opened = printPaymentSlip({
    payment_no: item.payment_no,
    invoice_no: invoiceNo(item),
    customer_name: paymentCustomerName(item as Payment),
    payment_date: item.payment_date,
    amount: item.amount,
    reference_no: item.reference_no,
    sender_name: slipSender,
    status: item.status,
    method: paymentMethodOf((item as any).bank_name),
    cs_name: csNameOf(item),
  });
  if (!opened)
    toast.warning("Izinkan pop-up browser untuk mencetak tanda terima.");
}
</script>

<template>
  <div>
    <PageHeader title="Payments" />
    <DataTable
      :columns="columns"
      :data="data"
      search-placeholder="Search payments..."
      @edit="openEdit"
      @delete="openDelete"
    >
      <template #cell-customer_id="{ row }">{{
        paymentCustomerName(row)
      }}</template>
      <template #cell-sender_name="{ row }">{{ senderName(row) }}</template>
      <template #cell-invoice_no="{ row }">{{ invoiceNo(row) }}</template>
      <template #cell-amount="{ value }">{{
        formatRupiah(value || 0)
      }}</template>
      <template #cell-status="{ value }">
        <span
          :class="
            value === 'approved'
              ? 'badge badge-success'
              : value === 'rejected'
                ? 'badge badge-danger'
                : 'badge badge-warning'
          "
        >
          {{
            value === "approved"
              ? "Approved"
              : value === "rejected"
                ? "Rejected"
                : "Pending"
          }}
        </span>
      </template>

      <template #actions="{ row }">
        <button
          v-if="can('payment:read')"
          class="action-btn"
          title="View payment transaction"
          aria-label="View payment transaction"
          @click="openPaymentDetails(row)"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
        <button
          v-if="canManageApprovals && row.status === 'pending'"
          class="action-btn action-btn--edit"
          title="Approve payment"
          aria-label="Approve payment"
          style="width: 36px; height: 36px"
          @click="updateApprovalStatus(row, 'approved')"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
        <button
          v-if="canManageApprovals && row.status === 'pending'"
          class="action-btn action-btn--delete"
          title="Reject payment"
          aria-label="Reject payment"
          style="width: 36px; height: 36px"
          @click="updateApprovalStatus(row, 'rejected')"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <button
          v-if="can('payment:read') && row.status === 'pending'"
          class="action-btn"
          title="Print Tanda Terima (Menunggu Verifikasi)"
          aria-label="Print payment slip"
          @click="printSlip(row)"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="9" y1="13" x2="15" y2="13"></line>
            <line x1="9" y1="17" x2="13" y2="17"></line>
          </svg>
        </button>
        <button
          v-if="can('payment:read') && row.status === 'approved'"
          class="action-btn"
          title="Print Struk (Approved)"
          @click="printReceipt(row)"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z M8 10h8 M8 14h8 M8 18h5"></path>
          </svg>
        </button>
        <button
          v-if="can('payment:read') && row.status === 'approved'"
          class="action-btn"
          title="Print Kwitansi A5 (Approved)"
          @click="printReceiptA5(row)"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path
              d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"
            ></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
        </button>
        <button
          v-if="can('payment:update')"
          class="action-btn action-btn--edit"
          title="Edit"
          @click="openEdit(row)"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
            ></path>
            <path
              d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
            ></path>
          </svg>
        </button>
        <button
          v-if="can('payment:delete')"
          class="action-btn action-btn--delete"
          title="Delete"
          @click="openDelete(row)"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="3 6 5 6 21 6"></polyline>
            <path
              d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"
            ></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </template>
    </DataTable>
    <FormModal
      :open="!!selectedPayment"
      :title="
        selectedPayment
          ? `Payment ${selectedPayment.payment_no}`
          : 'Payment details'
      "
      @close="selectedPayment = null"
    >
      <div v-if="selectedPayment" class="payment-detail-grid">
        <div>
          <span>Customer</span
          ><strong>{{ paymentCustomerName(selectedPayment) }}</strong>
        </div>
        <div>
          <span>Sender Name</span
          ><strong>{{ senderName(selectedPayment) }}</strong>
        </div>
        <div>
          <span>Invoice</span><strong>{{ invoiceNo(selectedPayment) }}</strong>
        </div>
        <div>
          <span>Payment Date</span
          ><strong>{{
            new Date(selectedPayment.payment_date).toLocaleString("id-ID")
          }}</strong>
        </div>
        <div>
          <span>Amount</span
          ><strong>{{ formatRupiah(selectedPayment.amount) }}</strong>
        </div>
        <div>
          <span>Tax Deduction</span
          ><strong>{{
            formatRupiah(selectedPayment.tax_deduction || 0)
          }}</strong>
        </div>
        <div>
          <span>Balance</span
          ><strong>{{ formatRupiah(selectedPayment.balance || 0) }}</strong>
        </div>
        <div>
          <span>Bank / Account</span
          ><strong>{{ selectedPayment.bank_name || "-" }}</strong>
        </div>
        <div>
          <span>Reference No.</span
          ><strong>{{ selectedPayment.reference_no || "-" }}</strong>
        </div>
        <div>
          <span>Status</span><strong>{{ selectedPayment.status }}</strong>
        </div>
      </div>
      <template #footer>
        <button
          type="button"
          class="btn btn-outline"
          @click="selectedPayment = null"
        >
          Close
        </button>
      </template>
    </FormModal>
    <FormModal
      :open="showModal"
      :title="editingItem ? 'Edit Payment' : 'Add Payment'"
      @close="showModal = false"
      @submit="handleSubmit"
    >
      <div class="form-group">
        <label for="pay-no" class="form-label">Payment No.</label>
        <input
          id="pay-no"
          v-model="form.payment_no"
          type="text"
          class="form-input"
          placeholder="PAY-XXXXXX"
        />
      </div>
      <div class="form-group">
        <label for="pay-inv-type" class="form-label">Invoice Type</label>
        <select
          id="pay-inv-type"
          v-model="form.invoice_type"
          class="form-select"
          @change="onInvoiceChange"
        >
          <option value="rental">Rental</option>
          <option value="sales">Sales</option>
        </select>
      </div>
      <div class="form-group" v-if="form.invoice_type === 'rental'">
        <label for="pay-invoice" class="form-label"
          >Select Rental Invoice</label
        >
        <select
          id="pay-invoice"
          v-model="form.rental_invoice_id"
          class="form-select"
          @change="onInvoiceChange"
        >
          <option :value="null">-- Select Invoice --</option>
          <option v-for="inv in rentalInvoices" :key="inv.id" :value="inv.id">
            {{ inv.invoice_no }} —
            {{
              formatRupiah((inv as any).total_pay || (inv as any).total || 0)
            }}
          </option>
        </select>
      </div>
      <div class="form-group" v-else>
        <label for="pay-invoice-sales" class="form-label"
          >Select Sales Invoice</label
        >
        <select
          id="pay-invoice-sales"
          v-model="form.sales_invoice_id"
          class="form-select"
          @change="onInvoiceChange"
        >
          <option :value="null">-- Select Invoice --</option>
          <option v-for="inv in salesInvoices" :key="inv.id" :value="inv.id">
            {{ inv.invoice_no }} — {{ formatRupiah(inv.total || 0) }}
          </option>
        </select>
      </div>
      <div class="form-group">
        <label for="pay-customer" class="form-label">Customer</label>
        <select
          id="pay-customer"
          v-model="form.customer_id"
          class="form-select"
        >
          <option :value="null">-- Select Customer --</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">
            {{ c.company_name || c.name || "-" }}
          </option>
        </select>
      </div>
      <div class="form-group">
        <label for="pay-date" class="form-label">Payment Date</label>
        <input
          id="pay-date"
          v-model="form.payment_date"
          type="date"
          class="form-input"
        />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="pay-amount" class="form-label">Amount (Rp)</label>
          <input
            id="pay-amount"
            :value="Number(form.amount || 0).toLocaleString('id-ID')"
            type="text"
            class="form-input"
            readonly
            title="Otomatis dari total invoice"
            style="background: var(--color-surface-raised); cursor: not-allowed;"
          />
        </div>
        <div class="form-group">
          <label for="pay-tax" class="form-label">Tax Deduction (Rp)</label>
          <input
            id="pay-tax"
            v-model.number="form.tax_deduction"
            type="number"
            class="form-input"
            min="0"
          />
        </div>
      </div>
      <div class="form-group">
        <label for="pay-ref" class="form-label">Reference No.</label>
        <input
          id="pay-ref"
          v-model="form.reference_no"
          type="text"
          class="form-input"
          placeholder="Transfer / receipt no."
        />
      </div>
      <div class="form-group">
        <label for="pay-sender" class="form-label">Sender Name (Nama Pengirim)</label>
        <input
          id="pay-sender"
          v-model="form.sender_name"
          type="text"
          class="form-input"
          placeholder="Nama pengirim dana — tampil di tanda terima"
        />
      </div>
      <div class="form-group">
        <label for="pay-status" class="form-label"
          >Status (Finance Approval)</label
        >
        <select id="pay-status" v-model="form.status" class="form-select">
          <option value="pending">Pending</option>
          <option v-if="canManageApprovals" value="approved">Approved</option>
          <option v-if="canManageApprovals" value="rejected">Rejected</option>
        </select>
      </div>
    </FormModal>
    <ConfirmDialog
      :open="showConfirm"
      title="Delete Payment"
      :message="`Are you sure you want to delete payment '${deletingItem?.payment_no}'?`"
      @close="showConfirm = false"
      @confirm="handleDelete"
    />
  </div>
</template>

<style scoped>
.payment-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-base);
}

.payment-detail-grid > div {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border-light);
}

.payment-detail-grid span {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.payment-detail-grid strong {
  overflow-wrap: anywhere;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-base);
}

@media (max-width: 520px) {
  .payment-detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
