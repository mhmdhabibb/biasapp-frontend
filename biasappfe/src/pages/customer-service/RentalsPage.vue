<script setup lang="ts">
import DataTable from "@/components/ui/DataTable.vue";
import FormModal from "@/components/ui/FormModal.vue";
import PageHeader from "@/components/ui/PageHeader.vue";
import { useAuth } from "@/composables/useAuth";
import { useMasterStore } from "@/composables/useMasterStore";
import { usePermission } from "@/composables/usePermission";
import { useToast } from "@/composables/useToast";
import { api } from "@/services/api";
import { resources } from "@/services/resource.service";
import {
  buildPaymentTimestamp,
  buildPaymentVerifyUrl,
  generatePaymentQrDataUrl,
  paymentMethodOf,
  printPaymentReceipt,
  printPaymentSlip,
  printPaymentStruk,
} from "@/utils/paymentReceipt";
import type { TableColumn } from "@/types";
import type { PaymentReceiptData } from "@/utils/paymentReceipt";
import { computed, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { normalizeRole } from "@/router/role-access";

const toast = useToast();
const { can, isAdmin } = usePermission();
const { currentUser } = useAuth();
const { customers, units, products, payments, refreshInBackground } = useMasterStore();

// CS (dan teknisi) tidak boleh melihat nominal: rate, total amount invoice items.
const canSeeAmount = computed(() => {
  if (isAdmin.value) return true;
  const role = normalizeRole((currentUser.value as any)?.role);
  return role === "accounting" || role === "admin";
});
const { t } = useI18n();

const columns = computed<TableColumn[]>(() => [
  { key: "rental_no", label: t("rentals.no") },
  { key: "company", label: t("rentals.company") },
  { key: "pic_name", label: t("rentals.pic_name") },
  { key: "start_date", label: t("rentals.start") },
  { key: "end_date", label: t("rentals.end") },
  { key: "total", label: t("rentals.total") },
  { key: "invoice_actions", label: "Invoices" },
  { key: "status", label: t("rentals.status") },
]);

const rentals = ref<any[]>([]);

const showModal = ref(false);
const isLoading = ref(false);
const showInvoiceModal = ref(false);
const isLoadingRentalInvoices = ref(false);
const selectedRental = ref<any>(null);
const selectedInvoice = ref<any>(null);
const expandedInvoiceId = ref<string | null>(null);
const selectedMeterDetail = ref<any>(null);
const showMeterDetail = ref(false);
const isSavingPayment = ref(false);

function meterDetailsOf(invoice: any): any[] {
  return invoice?.meter_details || invoice?.meterDetails || [];
}
function meterCount(invoice: any): number {
  return meterDetailsOf(invoice).length;
}
function toggleInvoiceItems(invoice: any) {
  const id = String(invoice.id);
  expandedInvoiceId.value = expandedInvoiceId.value === id ? null : id;
}
function isExpanded(invoice: any): boolean {
  return expandedInvoiceId.value === String(invoice.id);
}
function openMeterDetail(detail: any) {
  selectedMeterDetail.value = detail;
  showMeterDetail.value = true;
}
function closeMeterDetail() {
  showMeterDetail.value = false;
  selectedMeterDetail.value = null;
}
function meterPaperSizeName(detail: any): string {
  return detail?.paper_size?.name || (paperSizes.value as any[]).find((p: any) => String(p.id) === String(detail?.paper_size_id))?.name || detail?.paper_size_id || '-';
}
function meterPaperTypeName(detail: any): string {
  return detail?.paper_type?.name || (paperTypes.value as any[]).find((p: any) => String(p.id) === String(detail?.paper_type_id))?.name || '-';
}
function isColorDetail(detail: any): boolean {
  return /colou?r/i.test(String(detail?.color_mode || ''));
}
function colorModeLabel(detail: any): string {
  const raw = String(detail?.color_mode || '').toLowerCase();
  if (/colou?r/.test(raw)) return 'COLOR';
  if (/bw|b\/w|mono|black/.test(raw)) return 'BW';
  return String(detail?.color_mode || '-').toUpperCase();
}
function invoiceItemsTotal(invoice: any): number {
  return meterDetailsOf(invoice).reduce((sum: number, d: any) => sum + (Number(d.total_amount) || 0), 0);
}
function meterFormulaHint(detail: any): string {
  const start = detail?.start_meter_reading || 0;
  const last = detail?.last_meter_reading || 0;
  const total = detail?.total_copies ?? (last - start);
  const free = detail?.free_quota ?? 0;
  const mode = colorModeLabel(detail);
  const net = total - free;
  const fmt = (n: number) => n.toLocaleString('id-ID');
  const netStr = net < 0 ? `(${fmt(Math.abs(net))})` : fmt(net);
  return `Pemakaian ${fmt(total)} (${fmt(start)}−${fmt(last)}) − Jatah ${mode} ${fmt(free)} = ${netStr}`;
}
const paymentForm = reactive({
  amount: 0,
  payment_date: new Date().toISOString().slice(0, 10),
  payment_method: "transfer",
  bank_name: "",
  account_number: "",
  sender_name: "",
  reference_no: "",
});

const visibleRentalInvoices = computed(() => {
  return [...(selectedRental.value?.rental_invoices || [])].sort(
    (a: any, b: any) =>
      new Date(a.period_start).getTime() - new Date(b.period_start).getTime(),
  );
});

const paperSizes = ref<{ id: string; name: string }[]>([]);
const paperTypes = ref<{ id: string; name: string }[]>([]);

const rentalItems = ref<
  {
    selected_item: string;
    unit_id: string | null;
    product_id: string | null;
    qty: number;
    monthly_rent: number;
    start_meter_bw: number;
    start_meter_color: number;
    free_quota_color: number;
    free_quota_bw: number;
    placement_location: string;
    is_copier: boolean;
    is_computer: boolean;
    specs: {
      cpu: string;
      ram: string;
      storage: string;
      storage_type: string;
      os: string;
      vga: string;
      office: string;
    };
    description: string;
    rates: {
      paper_size_id: string;
      paper_type_id: string | null;
      rate_per_page_bw: number;
      rate_per_page_color: number;
      free_quota_bw: number;
      free_quota_color: number;
      quota_applies_to: string;
    }[];
  }[]
>([]);

const form = reactive({
  customer_id: "",
  start_date: new Date().toISOString().slice(0, 10),
  duration_months: 12,
  duration_days: 0,
  notes: "",
  po_no: "",
  installation_address: "",
});

const calcSubtotal = computed(() => {
  let sub = 0;
  for (const item of rentalItems.value) {
    sub += item.qty * item.monthly_rent * form.duration_months;
  }
  return sub;
});

const calcTotal = computed(() => calcSubtotal.value);

// Unit bersifat unik: yang sedang rented/sold/maintenance/broken tidak bisa
// dipilih lagi. Unit rented tetap ditampilkan (disabled) agar CS tahu statusnya.
function unitStatusOf(u: any): string {
  return String(u?.status || "available").toLowerCase();
}

const availableUnits = computed(() =>
  (units.value as any[]).filter((u: any) => {
    const s = unitStatusOf(u);
    return s === "available" || s === "";
  }),
);

const unavailableUnits = computed(() =>
  (units.value as any[]).filter((u: any) => {
    const s = unitStatusOf(u);
    return s !== "available" && s !== "";
  }),
);

function addRentalItem() {
  rentalItems.value.push({
    selected_item: "",
    unit_id: null,
    product_id: null,
    qty: 1,
    monthly_rent: 0,
    start_meter_bw: 0,
    start_meter_color: 0,
    free_quota_color: 0,
    free_quota_bw: 0,
    placement_location: "",
    is_copier: false,
    is_computer: false,
    specs: {
      cpu: "",
      ram: "",
      storage: "",
      storage_type: "",
      os: "",
      vga: "",
      office: "",
    },
    description: "",
    rates: [],
  });
}

function removeRentalItem(idx: number) {
  rentalItems.value.splice(idx, 1);
}

function addItemRate(item: any) {
  if (!item.rates) item.rates = [];
  item.rates.push({
    paper_size_id: "",
    paper_type_id: null,
    rate_per_page_bw: 0,
    rate_per_page_color: 0,
    free_quota_bw: 0,
    free_quota_color: 0,
    quota_applies_to: "color",
  });
}

function removeItemRate(item: any, index: number) {
  if (item.rates) item.rates.splice(index, 1);
}

function paperSizeName(id: any): string {
  if (!id) return "";
  const found = (paperSizes.value as any[]).find(
    (x: any) => String(x.id) === String(id),
  );
  return found ? found.name : String(id).slice(0, 8);
}

function paperTypeName(id: any): string {
  if (!id) return "";
  const found = (paperTypes.value as any[]).find(
    (x: any) => String(x.id) === String(id),
  );
  return found ? found.name : String(id).slice(0, 8);
}

function rateTitle(rate: any): string {
  const size = rate.paper_size_id
    ? paperSizeName(rate.paper_size_id)
    : "Semua ukuran";
  const kind = rate.paper_type_id
    ? " / " + paperTypeName(rate.paper_type_id)
    : "";
  return size + kind;
}

function fmtRp(n: any): string {
  return "Rp " + (Number(n) || 0).toLocaleString("id-ID");
}

function rateSummary(rate: any): string {
  const isBW = rate.quota_applies_to === "bw";
  const free = Number(isBW ? rate.free_quota_bw : rate.free_quota_color) || 0;
  const mode = isBW ? "BW" : "Warna";
  const bw = fmtRp(rate.rate_per_page_bw);
  const color = fmtRp(rate.rate_per_page_color);
  if (!free)
    return `Tanpa free — semua ditagih penuh (BW ${bw}/lbr, Warna ${color}/lbr).`;
  return `Free ${free} lbr ${mode} per bulan, selebihnya BW ${bw}/lbr, Warna ${color}/lbr.`;
}

function onItemSelectChange(item: any) {
  if (item.selected_item.startsWith("unit_")) {
    const unitId = item.selected_item.replace("unit_", "");
    const u = units.value.find(
      (target: any) => String(target.id) === String(unitId),
    );
    if (u) {
      item.is_copier = !!u.is_copier;
      item.is_computer = !!(u as any).is_computer;
      // NOTE: Initial meter is NOT auto-filled from the master unit.
      // Admin must enter it manually on the first rental to keep reports accurate.
      if (u.free_quota_color !== undefined)
        item.free_quota_color = u.free_quota_color;
      if ((u as any).free_quota_bw !== undefined)
        item.free_quota_bw = (u as any).free_quota_bw;
      if (Array.isArray(u.rates) && u.rates.length > 0) {
        item.rates = u.rates.map((r: any) => ({
          paper_size_id: r.paper_size_id,
          paper_type_id: r.paper_type_id ?? null,
          rate_per_page_bw: r.rate_per_page_bw,
          rate_per_page_color: r.rate_per_page_color,
          free_quota_bw: r.free_quota_bw ?? 0,
          free_quota_color: r.free_quota_color ?? 0,
          quota_applies_to: r.quota_applies_to === "bw" ? "bw" : "color",
        }));
      }
    }
  } else if (item.selected_item.startsWith("prod_")) {
    const prodId = item.selected_item.replace("prod_", "");
    const p = products.value.find(
      (target: any) => String(target.id) === String(prodId),
    );
    if (p) {
      item.is_copier = false;
      item.is_computer = !!(p as any).is_computer;
    }
  }
}

async function openAdd() {
  await refreshInBackground();
  Object.assign(form, {
    customer_id: "",
    start_date: new Date().toISOString().slice(0, 10),
    duration_months: 12,
    duration_days: 0,
    po_no: "",
    notes: "",
    installation_address: "",
  });
  rentalItems.value = [
    {
      selected_item: "",
      unit_id: null,
      product_id: null,
      qty: 1,
      monthly_rent: 0,
      start_meter_bw: 0,
      start_meter_color: 0,
      free_quota_color: 0,
      free_quota_bw: 0,
      placement_location: "",
      is_copier: false,
      is_computer: false,
      specs: {
        cpu: "",
        ram: "",
        storage: "",
        storage_type: "",
        os: "",
        vga: "",
        office: "",
      },
      description: "",
      rates: [],
    },
  ];
  showModal.value = true;
}

async function fetchRentals() {
  try {
    const data = await api.get<{ data: any[] }>("/rents");
    rentals.value = data.data.map((r: any) => {
      const c = customers.value.find((cust: any) => cust.id === r.customer_id);
      const companyName = c
        ? c.company_name || c.name || "-"
        : r.customer?.company_name || r.customer?.name || "-";
      const picName = c ? c.pic_name || "-" : r.customer?.pic_name || "-";
      return {
        ...r,
        company: companyName,
        pic_name: picName,
      };
    });
  } catch (error) {
    console.error("Failed to fetch rentals data", error);
  }
}

async function handleSubmit() {
  if (!form.customer_id) return;

  // Validation: copier requires an initial meter (paper size/kind rates are optional)
  for (let idx = 0; idx < rentalItems.value.length; idx++) {
    const item = rentalItems.value[idx]!;
    if (!item!.selected_item) {
      toast.error(`Item #${idx + 1}: select a Unit / Product first.`);
      return;
    }
    if (item.is_copier) {
      if ((item.start_meter_bw ?? 0) < 0 || (item.start_meter_color ?? 0) < 0) {
        toast.error(
          `Item #${idx + 1}: initial BW / Colour meter cannot be negative.`,
        );
        return;
      }
    }
  }

  try {
    const latestPaperSizes = await resources.paperSizes.list();
    paperSizes.value = latestPaperSizes.data as any;
  } catch {
    toast.error("Failed to validate paper sizes. Please try again.");
    return;
  }

  const validPaperSizeIDs = new Set(
    paperSizes.value.map((paperSize) => String(paperSize.id)),
  );
  for (let itemIndex = 0; itemIndex < rentalItems.value.length; itemIndex++) {
    const rates = rentalItems.value[itemIndex]?.rates || [];
    for (let rateIndex = 0; rateIndex < rates.length; rateIndex++) {
      const paperSizeID = rates[rateIndex]?.paper_size_id;
      if (paperSizeID && !validPaperSizeIDs.has(String(paperSizeID))) {
        toast.error(
          `Item #${itemIndex + 1}, price #${rateIndex + 1}: selected paper size no longer exists. Please select it again.`,
        );
        return;
      }
    }
  }

  isLoading.value = true;

  const payload = {
    customer_id: form.customer_id,
    start_date: new Date(form.start_date).toISOString(),
    duration_months: form.duration_months,
    duration_days: form.duration_days,
    tax: 0,
    deposit: 0,
    po_no: form.po_no,
    notes: form.notes,
    installation_address: form.installation_address,
    items: rentalItems.value.map((item) => {
      const isUnit = item.selected_item.startsWith("unit_");
      const isProduct = item.selected_item.startsWith("prod_");
      return {
        unit_id: isUnit ? item.selected_item.replace("unit_", "") : null,
        product_id: isProduct ? item.selected_item.replace("prod_", "") : null,
        qty: item.qty,
        monthly_rent: item.monthly_rent,
        start_meter_bw: item.start_meter_bw,
        start_meter_color: item.start_meter_color,
        free_quota_color: item.free_quota_color,
        free_quota_bw: (item as any).free_quota_bw ?? 0,
        placement_location: (item as any).placement_location || "",
        specs: item.specs || {},
        description: item.description,
        rates: (item.rates || [])
          .filter(
            (r: any) =>
              r.paper_size_id ||
              Number(r.rate_per_page_bw) ||
              Number(r.rate_per_page_color) ||
              Number(r.free_quota_bw) ||
              Number(r.free_quota_color),
          )
          .map((r: any) => ({
            paper_size_id: r.paper_size_id || null,
            paper_type_id: r.paper_type_id || null,
            rate_per_page_bw: Number(r.rate_per_page_bw) || 0,
            rate_per_page_color: Number(r.rate_per_page_color) || 0,
            free_quota_bw: Number(r.free_quota_bw) || 0,
            free_quota_color: Number(r.free_quota_color) || 0,
            quota_applies_to: r.quota_applies_to === "bw" ? "bw" : "color",
          })),
      };
    }),
  };

  try {
    const token = sessionStorage.getItem("bias_token");
    const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/rents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success(t("rentals.success"));
      showModal.value = false;
      fetchRentals(); // refresh
    } else {
      const err = await res.json();
      toast.error(
        t("rentals.failed", { error: err.message || JSON.stringify(err) }),
      );
    }
  } catch (error) {
    console.error(error);
    toast.error(t("rentals.network_error"));
  } finally {
    isLoading.value = false;
  }
}

function formatRupiah(val: number): string {
  return "Rp " + (val || 0).toLocaleString("id-ID");
}

async function openRentalInvoices(rental: any) {
  selectedRental.value = rental;
  expandedInvoiceId.value = null;
  closeMeterDetail();
  showInvoiceModal.value = true;
  isLoadingRentalInvoices.value = true;
  try {
    await api.post(`/rents/${rental.id}/generate-invoices`, {});
    const response = await api.get<{ data: any }>(`/rents/${rental.id}`);
    selectedRental.value = response.data;
  } catch (error: any) {
    toast.error(toast.fromError(error, "Failed to prepare rental invoices"));
  } finally {
    isLoadingRentalInvoices.value = false;
  }
}

function openInvoicePayment(invoice: any) {
  selectedInvoice.value = invoice;
  paymentForm.amount = Number(invoice.total_pay || invoice.subtotal || 0);
  paymentForm.payment_date = new Date().toISOString().slice(0, 10);
  paymentForm.payment_method = "transfer";
  paymentForm.bank_name = "";
  paymentForm.account_number = "";
  paymentForm.sender_name = "";
  paymentForm.reference_no = "";
}

async function submitInvoicePayment() {
  if (!selectedInvoice.value || paymentForm.amount <= 0) {
    toast.warning("Payment amount must be greater than 0.");
    return;
  }
  if (
    paymentForm.payment_method === "transfer" &&
    (!paymentForm.bank_name.trim() ||
      !paymentForm.account_number.trim() ||
      !paymentForm.sender_name.trim())
  ) {
    toast.warning("Please complete the bank, account number, and sender name.");
    return;
  }

  isSavingPayment.value = true;
  const invoiceId = String(selectedInvoice.value.id);
  const invNo = selectedInvoice.value.invoice_no || "-";
  const payNo = `PAY-${Date.now()}`;
  const paymentTs = buildPaymentTimestamp(paymentForm.payment_date);
  try {
    const bankName =
      paymentForm.payment_method === "cash"
        ? "CASH"
        : `${paymentForm.bank_name} - ${paymentForm.account_number} (A/N: ${paymentForm.sender_name})`;
    await api.post("/payments", {
      payment_no: payNo,
      rental_invoice_id: invoiceId,
      payment_date: paymentTs,
      amount: paymentForm.amount,
      bank_name: bankName,
      reference_no: paymentForm.reference_no.trim() || "-",
    });
    toast.success("Payment recorded and pending approval.");
    const customer =
      customers.value.find(
        (item: any) => String(item.id) === String(selectedRental.value.customer_id),
      ) || selectedRental.value?.customer;
    const opened = printPaymentSlip({
      payment_no: payNo,
      invoice_no: invNo,
      customer_name: customer?.company_name || customer?.name || "-",
      payment_date: paymentTs,
      amount: Number(paymentForm.amount || 0),
      reference_no: paymentForm.reference_no.trim() || "-",
      status: "pending",
      method: paymentForm.payment_method === "cash" ? "Tunai" : "Transfer",
    });
    if (!opened)
      toast.warning("Izinkan pop-up browser untuk mencetak tanda terima.");
    selectedInvoice.value = null;
    const rentalResponse = await api.get<{ data: any }>(
      `/rents/${selectedRental.value.id}`,
    );
    selectedRental.value = rentalResponse.data;
  } catch (error: any) {
    toast.error(toast.fromError(error, "Failed to record payment"));
  } finally {
    isSavingPayment.value = false;
  }
}

function approvedPayments(invoice: any): any[] {
  if (!can("payment:read")) return [];
  return invoicePayments(invoice).filter(
    (payment: any) => payment.status === "approved",
  );
}

function hasPendingPaymentApproval(invoice: any): boolean {
  return invoicePayments(invoice).some(
    (payment: any) => payment.status === "pending",
  );
}

function invoicePayments(invoice: any): any[] {
  const currentPayments = payments.value.filter(
    (payment: any) => String(payment.rental_invoice_id) === String(invoice.id),
  );
  return currentPayments.length ? currentPayments : invoice.payments || [];
}

function rentalReceiptPayload(invoice: any, payment: any): PaymentReceiptData {
  const customer =
    customers.value.find(
      (item: any) => String(item.id) === String(invoice.customer_id),
    ) || (selectedRental.value as any)?.customer;
  const ps = String(invoice.payment_status || "").toLowerCase();
  const sender =
    (payment as any).sender_name ||
    payment.bank_name?.match(/\bA\/N\s*:\s*([^)]*)\)?/i)?.[1]?.trim() ||
    "";
  return {
    payment_no: payment.payment_no,
    invoice_no: invoice.invoice_no,
    customer_name: customer?.company_name || customer?.name || "-",
    payment_date: payment.payment_date,
    amount: Number(payment.amount || 0),
    reference_no: payment.reference_no,
    sender_name: sender,
    status: payment.status,
    lunas: ps === "paid",
    partial: ps === "partially_paid" || ps === "partial",
    method: paymentMethodOf(payment.bank_name),
    cs_name:
      (payment as any).user?.name ||
      (payment as any).user?.username ||
      "-",
  };
}

async function printRentalPaymentReceipt(invoice: any, payment: any) {
  const payload = rentalReceiptPayload(invoice, payment);
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

function printRentalPaymentReceiptA5(invoice: any, payment: any) {
  const opened = printPaymentReceipt(rentalReceiptPayload(invoice, payment));
  if (!opened)
    toast.warning("Izinkan pop-up browser untuk mencetak bukti pembayaran.");
}

onMounted(async () => {
  await refreshInBackground();
  fetchRentals();
  try {
    const res = await resources.paperSizes.list();
    paperSizes.value = res.data as any;
    try {
      const pt = await (resources as any).paperTypes.list();
      paperTypes.value = pt.data as any;
    } catch {
      paperTypes.value = [];
    }
  } catch (e) {
    console.error("Failed to fetch paper sizes:", e);
  }
});
</script>

<template>
  <div>
    <PageHeader
      :title="t('rentals.title')"
      :button-label="t('rentals.create_new')"
      permission="rental:create"
      @add="openAdd"
    />

    <DataTable
      :columns="columns"
      :data="rentals"
      permission="rental"
      :search-placeholder="t('rentals.search')"
    >
      <template #cell-company="{ row }">
        {{
          customers.find((c: any) => c.id === row.customer_id)?.company_name ||
          customers.find((c: any) => c.id === row.customer_id)?.name ||
          row.customer?.company_name ||
          row.customer?.name ||
          "-"
        }}
      </template>
      <template #cell-pic_name="{ row }">
        {{
          customers.find((c: any) => c.id === row.customer_id)?.pic_name ||
          row.customer?.pic_name ||
          "-"
        }}
      </template>
      <template #cell-start_date="{ value }">{{
        new Date(value).toLocaleDateString("en-GB")
      }}</template>
      <template #cell-end_date="{ value }">{{
        new Date(value).toLocaleDateString("en-GB")
      }}</template>
      <template #cell-total="{ value }">{{ formatRupiah(value) }}</template>
      <template #cell-status="{ value }">
        <span
          class="status-badge"
          :class="'status-' + (value || 'unknown').toLowerCase()"
        >
          {{ value || "-" }}
        </span>
      </template>
      <template #cell-invoice_actions="{ row }">
        <button
          type="button"
          class="btn btn-sm btn-outline"
          @click="openRentalInvoices(row)"
        >
          Invoice Details
        </button>
      </template>
    </DataTable>

    <FormModal
      :open="showInvoiceModal"
      :title="
        selectedRental
          ? `Rental Invoices ${selectedRental.rental_no}`
          : 'Rental Invoices'
      "
      max-width="900px"
      @close="
        showInvoiceModal = false;
        selectedInvoice = null;
        expandedInvoiceId = null;
      "
    >
      <div v-if="isLoadingRentalInvoices" class="text-muted text-center py-lg">
        Loading rental invoices...
      </div>
      <div v-else-if="selectedRental" class="rental-invoice-list">
        <article
          v-for="invoice in visibleRentalInvoices"
          :key="invoice.id"
          class="rental-invoice-row"
        >
          <div class="rental-invoice-info">
            <strong>{{ invoice.invoice_no }}</strong>
            <span
              >{{
                invoice.period_start
                  ? new Date(invoice.period_start).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })
                  : "-"
              }}
              –
              {{
                invoice.period_end
                  ? new Date(invoice.period_end).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })
                  : "-"
              }}</span
            >
          </div>
          <div class="rental-invoice-total">
            <strong>{{
              formatRupiah(invoice.total_pay || invoice.subtotal || 0)
            }}</strong>
            <span
              class="badge"
              :class="
                invoice.payment_status === 'paid'
                  ? 'badge-success'
                  : invoice.payment_status === 'partially_paid'
                    ? 'badge-info'
                    : 'badge-warning'
              "
            >
              {{
                invoice.payment_status === "paid"
                  ? "Paid"
                  : invoice.payment_status === "partially_paid"
                    ? "Partial"
                    : "Unpaid"
              }}
            </span>
          </div>
          <div class="rental-invoice-actions">
            <span
              v-if="hasPendingPaymentApproval(invoice)"
              class="badge badge-warning"
            >
              Menunggu approval accounting
            </span>
            <button
              v-if="meterCount(invoice) > 0"
              type="button"
              class="btn btn-sm btn-outline"
              title="Lihat detail invoice items"
              @click="toggleInvoiceItems(invoice)"
            >
              {{ isExpanded(invoice) ? 'Tutup Items' : `Detail Items (${meterCount(invoice)})` }}
            </button>
            <button
              v-for="payment in approvedPayments(invoice)"
              :key="payment.id"
              type="button"
              class="btn btn-sm btn-outline"
              @click="printRentalPaymentReceipt(invoice, payment)"
            >
              Struk Bukti Bayar
            </button>
            <button
              v-for="payment in approvedPayments(invoice)"
              :key="'a5-' + payment.id"
              type="button"
              class="btn btn-sm btn-outline"
              @click="printRentalPaymentReceiptA5(invoice, payment)"
            >
              Kwitansi A5
            </button>
            <button
              v-if="invoice.payment_status !== 'paid' && can('payment:create')"
              type="button"
              class="btn btn-sm btn-primary"
              :disabled="isSavingPayment"
              @click="openInvoicePayment(invoice)"
            >
              Payment
            </button>
          </div>
          <div v-if="isExpanded(invoice)" class="rental-invoice-items">
            <div style="overflow-x: auto;">
              <table class="meter-table">
                <thead>
                  <tr>
                    <th class="col-no">No</th>
                    <th class="col-paper">Paper</th>
                    <th class="col-meter">Meter</th>
                    <th v-if="canSeeAmount" class="col-amount">Amount</th>
                    <th class="col-aksi">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="meterCount(invoice) === 0">
                    <td :colspan="canSeeAmount ? 5 : 4" class="empty-cell">Tidak ada detail items untuk invoice ini.</td>
                  </tr>
                  <tr v-for="(md, mdIdx) in meterDetailsOf(invoice)" :key="md.id || mdIdx" class="meter-row">
                    <td class="cell-no">{{ mdIdx + 1 }}</td>
                    <td class="cell-paper">
                      <span class="paper-badge">{{ meterPaperSizeName(md) }}</span>
                      <span class="color-pill" :class="isColorDetail(md) ? 'is-color' : 'is-bw'">{{ colorModeLabel(md) }}</span>
                    </td>
                    <td class="cell-meter">
                      <div class="meter-range">{{ (md.start_meter_reading || 0).toLocaleString('id-ID') }} → {{ (md.last_meter_reading || 0).toLocaleString('id-ID') }}</div>
                      <div class="meter-sub">Billable {{ (md.billable_copies ?? 0).toLocaleString('id-ID') }} · Free {{ (md.free_quota ?? 0) === 0 ? '-' : (md.free_quota ?? 0).toLocaleString('id-ID') }} ({{ colorModeLabel(md) }})</div>
                    </td>
                    <td v-if="canSeeAmount" class="cell-amount" :class="{ 'is-zero': !(md.total_amount > 0) }">{{ formatRupiah(md.total_amount || 0) }}</td>
                    <td class="cell-aksi">
                      <button type="button" class="action-btn action-btn--edit meter-eye" title="Lihat detail item" @click="openMeterDetail(md)">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      </button>
                    </td>
                  </tr>
                </tbody>
                <tfoot v-if="canSeeAmount && meterCount(invoice) > 0">
                  <tr>
                    <td colspan="3" class="total-label">Total ({{ meterCount(invoice) }} items)</td>
                    <td class="total-value">{{ formatRupiah(invoiceItemsTotal(invoice)) }}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </article>
        <div v-if="!visibleRentalInvoices.length" class="rental-invoice-empty">
          <strong>{{
            selectedRental.rental_items?.some(
              (item: any) => item.unit?.is_copier,
            )
              ? "No invoices for this period yet."
              : "No invoices with a started period yet."
          }}</strong>
          <span
            v-if="
              selectedRental.rental_items?.some(
                (item: any) => item.unit?.is_copier,
              )
            "
            >Enter the copier meter reading first to generate invoices.</span
          >
        </div>
      </div>
      <template #footer>
        <button
          type="button"
          class="btn btn-outline"
          @click="
            showInvoiceModal = false;
            selectedInvoice = null;
            expandedInvoiceId = null;
          "
        >
          Close
        </button>
      </template>
    </FormModal>

    <FormModal
      :open="showMeterDetail"
      :title="selectedMeterDetail ? `Detail Item — ${meterPaperSizeName(selectedMeterDetail)} / ${selectedMeterDetail.color_mode || '-'}` : 'Detail Item'"
      max-width="520px"
      @close="closeMeterDetail"
    >
      <template v-if="selectedMeterDetail">
        <div class="meter-detail-head">
          <span class="paper-badge">{{ meterPaperSizeName(selectedMeterDetail) }}</span>
          <span class="color-pill" :class="isColorDetail(selectedMeterDetail) ? 'is-color' : 'is-bw'">{{ colorModeLabel(selectedMeterDetail) }}</span>
          <span v-if="meterPaperTypeName(selectedMeterDetail) !== '-'" class="paper-type-text">{{ meterPaperTypeName(selectedMeterDetail) }}</span>
        </div>
        <div class="meter-stat-grid">
          <div class="meter-stat">
            <span class="meter-stat-label">Start Meter</span>
            <span class="meter-stat-value">{{ (selectedMeterDetail.start_meter_reading || 0).toLocaleString('id-ID') }}</span>
          </div>
          <div class="meter-stat">
            <span class="meter-stat-label">Last Meter</span>
            <span class="meter-stat-value">{{ (selectedMeterDetail.last_meter_reading || 0).toLocaleString('id-ID') }}</span>
          </div>
          <div class="meter-stat">
            <span class="meter-stat-label">Total Copies</span>
            <span class="meter-stat-value">{{ (selectedMeterDetail.total_copies ?? 0).toLocaleString('id-ID') }}</span>
          </div>
          <div class="meter-stat">
            <span class="meter-stat-label">Free Quota ({{ colorModeLabel(selectedMeterDetail) }})</span>
            <span class="meter-stat-value">{{ (selectedMeterDetail.free_quota ?? 0).toLocaleString('id-ID') }}</span>
          </div>
          <div class="meter-stat highlight">
            <span class="meter-stat-label">Billable</span>
            <span class="meter-stat-value">{{ (selectedMeterDetail.billable_copies ?? 0).toLocaleString('id-ID') }}</span>
          </div>
          <div v-if="canSeeAmount" class="meter-stat">
            <span class="meter-stat-label">Rate / Page</span>
            <span class="meter-stat-value">{{ formatRupiah(selectedMeterDetail.rate_per_page || 0) }}</span>
          </div>
        </div>
        <div class="meter-formula-hint">{{ meterFormulaHint(selectedMeterDetail) }}</div>
        <div v-if="canSeeAmount" class="meter-detail-total">
          <span>Total Amount</span>
          <strong>{{ formatRupiah(selectedMeterDetail.total_amount || 0) }}</strong>
        </div>
      </template>
      <template #footer>
        <button type="button" class="btn btn-outline" @click="closeMeterDetail">Close</button>
      </template>
    </FormModal>

    <FormModal
      :open="!!selectedInvoice"
      :title="
        selectedInvoice ? `Payment ${selectedInvoice.invoice_no}` : 'Payment'
      "
      @close="selectedInvoice = null"
      @submit="submitInvoicePayment"
    >
      <div class="form-group">
        <label class="form-label">Payment Date</label>
        <input
          v-model="paymentForm.payment_date"
          type="date"
          class="form-input"
          required
        />
      </div>
      <div class="form-group">
        <label class="form-label">Payment Method</label>
        <select v-model="paymentForm.payment_method" class="form-select">
          <option value="transfer">Bank Transfer</option>
          <option value="cash">Cash</option>
        </select>
      </div>
      <template v-if="paymentForm.payment_method === 'transfer'">
        <div class="form-group">
          <label class="form-label">Bank Name</label>
          <input
            v-model="paymentForm.bank_name"
            type="text"
            class="form-input"
            placeholder="BCA, Mandiri, BRI"
            required
          />
        </div>
        <div class="form-group">
          <label class="form-label">Account Number</label>
          <input
            v-model="paymentForm.account_number"
            type="text"
            class="form-input"
            required
          />
        </div>
        <div class="form-group">
          <label class="form-label">Sender Name</label>
          <input
            v-model="paymentForm.sender_name"
            type="text"
            class="form-input"
            required
          />
        </div>
      </template>
      <div class="form-group">
        <label class="form-label">Payment Amount</label>
        <input
          :value="Number(paymentForm.amount || 0).toLocaleString('id-ID')"
          type="text"
          class="form-input"
          readonly
          title="Otomatis dari total invoice"
          style="background: var(--color-surface-raised); cursor: not-allowed;"
        />
      </div>
      <div class="form-group">
        <label class="form-label">Reference No.</label>
        <input
          v-model="paymentForm.reference_no"
          type="text"
          class="form-input"
          placeholder="Optional"
        />
      </div>
      <template #footer>
        <button
          type="button"
          class="btn btn-outline"
          :disabled="isSavingPayment"
          @click="selectedInvoice = null"
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="isSavingPayment"
          @click="submitInvoicePayment"
        >
          {{ isSavingPayment ? "Saving..." : "Record Payment" }}
        </button>
      </template>
    </FormModal>

    <FormModal
      :open="showModal"
      :title="t('rentals.modal_title')"
      @close="showModal = false"
      @submit="handleSubmit"
    >
      <div class="form-group">
        <label for="rent-customer" class="form-label">{{
          t("rentals.customer_label")
        }}</label>
        <select
          id="rent-customer"
          v-model="form.customer_id"
          class="form-select"
          required
        >
          <option value="">{{ t("rentals.customer_select") }}</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">
            {{ (c as any).company_name || (c as any).name
            }}{{ (c as any).pic_name ? " - " + (c as any).pic_name : "" }}
          </option>
        </select>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="start-date" class="form-label">{{
            t("rentals.start_date_label")
          }}</label>
          <input
            id="start-date"
            v-model="form.start_date"
            type="date"
            class="form-input"
            required
          />
        </div>
        <div class="form-group">
          <label for="duration" class="form-label">{{
            t("rentals.duration_label")
          }}</label>
          <input
            id="duration"
            v-model.number="form.duration_months"
            type="number"
            class="form-input"
            min="0"
            required
          />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="duration-days" class="form-label">Additional Days</label>
          <input
            id="duration-days"
            v-model.number="form.duration_days"
            type="number"
            class="form-input"
            min="0"
          />
        </div>
        <div class="form-group">
          <label for="po-no" class="form-label">PO No (Optional)</label>
          <input
            id="po-no"
            v-model="form.po_no"
            type="text"
            class="form-input"
            placeholder="E.g. PO-2024-001"
          />
        </div>
        <div class="form-group">
          <label for="notes" class="form-label">Notes</label>
          <textarea
            id="notes"
            v-model="form.notes"
            class="form-input"
            placeholder="Optional"
            rows="2"
          ></textarea>
        </div>
      </div>

      <div class="form-group" style="margin-bottom: var(--space-md)">
        <label for="install-address" class="form-label"
          >Installation / Delivery Address (DO Auto-Generated)</label
        >
        <textarea
          id="install-address"
          v-model="form.installation_address"
          class="form-input"
          placeholder="Enter the full unit delivery address..."
          rows="2"
          required
        ></textarea>
      </div>

      <div class="form-group" style="margin-bottom: var(--space-md)">
        <label class="form-label" style="font-size: 0.8rem"
          >Note: each machine below may use its own delivery address (one DO is
          auto-generated per distinct address). Leave empty to follow the
          address above.</label
        >
      </div>

      <div class="form-section-title">
        Rented Machines & Initial Meter Input
      </div>

      <div
        v-for="(item, idx) in rentalItems"
        :key="idx"
        class="rental-item-box"
      >
        <div
          style="
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 8px;
            margin-bottom: var(--space-md);
            padding-bottom: 8px;
            border-bottom: 1px dashed var(--color-border-light);
          "
        >
          <input
            :id="'is-copier-' + idx"
            v-model="item.is_copier"
            type="checkbox"
            style="width: 16px; height: 16px; cursor: pointer; margin: 0"
          />
          <label
            :for="'is-copier-' + idx"
            style="
              margin-bottom: 0;
              cursor: pointer;
              user-select: none;
              font-size: var(--font-size-sm);
              color: var(--color-primary);
              font-weight: var(--font-weight-bold);
            "
          >
            Check if this item is a Copier Machine (Requires Initial Meter
            Input)
          </label>
        </div>

        <div class="form-group" style="margin-bottom: var(--space-md)">
          <label class="form-label">Select Unit</label>
          <select
            v-model="item.selected_item"
            class="form-select"
            required
            @change="onItemSelectChange(item)"
          >
            <option value="">-- Select Unit --</option>
            <option
              v-for="u in availableUnits"
              :key="u.id"
              :value="'unit_' + u.id"
            >
              {{ u.model }} ({{ (u as any).brand?.name }}) — S/N:
              {{ u.serial_no || "N/A" }}
            </option>
            <option
              v-for="u in unavailableUnits"
              :key="u.id"
              :value="'unit_' + u.id"
              disabled
            >
              {{ u.model }} ({{ (u as any).brand?.name }}) — S/N:
              {{ u.serial_no || "N/A" }} — {{ unitStatusOf(u) }}
            </option>
          </select>
        </div>

        <div class="form-group" style="margin-bottom: var(--space-md)">
          <label class="form-label" style="font-size: 0.8rem"
            >Delivery Address for this machine (optional — empty follows the
            address above; distinct addresses get separate DOs)</label
          >
          <textarea
            v-model="item.placement_location"
            class="form-input"
            rows="2"
            placeholder="Leave empty to use the installation address above"
          ></textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Rental Fee / Month (Rp)</label>
            <input
              v-model.number="item.monthly_rent"
              type="number"
              class="form-input"
              min="0"
              required
            />
          </div>
          <div class="form-group">
            <label class="form-label">Item Qty</label>
            <input
              v-model.number="item.qty"
              type="number"
              class="form-input"
              min="1"
              required
            />
          </div>
        </div>

        <!-- Copier Section moved from Figure 1 to Figure 2 -->
        <div
          v-if="item.is_copier"
          style="
            margin-top: 1rem;
            border-top: 1px dashed var(--color-border-light);
            padding-top: 1rem;
          "
        >
          <h4
            style="
              margin-bottom: 0.75rem;
              font-weight: 600;
              font-size: 0.95rem;
              color: var(--color-primary);
            "
          >
            Photocopy Machine Details
          </h4>
          <div
            style="
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 0.75rem;
            "
          >
            <div class="form-group">
              <label class="form-label" style="font-size: 0.8rem"
                >Initial BW Meter (Rental Start) *</label
              >
              <input
                v-model.number="item.start_meter_bw"
                type="number"
                class="form-input"
                min="0"
                placeholder="Required on first rental"
                :required="item.is_copier"
              />
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size: 0.8rem"
                >Initial Colour Meter (Rental Start) *</label
              >
              <input
                v-model.number="item.start_meter_color"
                type="number"
                class="form-input"
                min="0"
                placeholder="Required on first rental"
                :required="item.is_copier"
              />
            </div>
          </div>

          <div style="margin-top: 1rem">
            <div
              style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 0.5rem;
              "
            >
              <label
                class="form-label"
                style="margin: 0; font-weight: 600; font-size: 0.85rem"
                >Harga per Lembar — BW & Warna (opsional)</label
              >
              <button
                type="button"
                @click="addItemRate(item)"
                class="btn btn-secondary btn-sm"
                style="padding: 0.2rem 0.5rem; font-size: 0.75rem"
              >
                + Tambah Harga
              </button>
            </div>
            <p
              class="text-muted"
              style="font-size: 0.75rem; margin: 0 0 0.5rem 0"
            >
              Satu kartu = satu aturan harga. Kosongkan ukuran &amp; jenis bila
              tarifnya berlaku umum; isi bila beda ukuran/jenis beda harga.
            </p>

            <div
              v-for="(rate, rIdx) in item.rates"
              :key="rIdx"
              style="
                margin-bottom: 0.75rem;
                background: var(--color-surface, #f8fafc);
                padding: 0.75rem;
                border-radius: 8px;
                border: 1px solid var(--color-border-light, #e2e8f0);
              "
            >
              <div
                style="
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  margin-bottom: 0.5rem;
                "
              >
                <strong style="font-size: 0.85rem"
                  >Harga #{{ rIdx + 1 }} &mdash; {{ rateTitle(rate) }}</strong
                >
                <button
                  type="button"
                  @click="removeItemRate(item, rIdx)"
                  class="btn btn-sm"
                  style="color: #ef4444; font-size: 0.75rem"
                >
                  Hapus
                </button>
              </div>
              <div class="rental-rate-fields">
                <div class="form-group" style="margin: 0">
                  <label class="form-label"
                    >Ukuran Kertas
                    <span class="text-muted">(opsional)</span></label
                  >
                  <select
                    v-model="rate.paper_size_id"
                    class="form-select"
                    style="font-size: 0.8rem"
                  >
                    <option value="">&#8212; Semua ukuran &#8212;</option>
                    <option v-for="p in paperSizes" :key="p.id" :value="p.id">
                      {{ p.name }}
                    </option>
                  </select>
                </div>
                <div class="form-group" style="margin: 0">
                  <label class="form-label"
                    >Jenis Kertas
                    <span class="text-muted">(opsional)</span></label
                  >
                  <select
                    v-model="rate.paper_type_id"
                    class="form-select"
                    style="font-size: 0.8rem"
                  >
                    <option :value="null">&#8212; Semua jenis &#8212;</option>
                    <option v-for="p in paperTypes" :key="p.id" :value="p.id">
                      {{ p.name }}
                    </option>
                  </select>
                </div>
                <div class="form-group" style="margin: 0">
                  <label class="form-label">Tarif BW per lembar (Rp)</label>
                  <input
                    v-model.number="rate.rate_per_page_bw"
                    type="number"
                    class="form-input"
                    min="0"
                    placeholder="Masukkan tarif BW"
                    style="font-size: 0.8rem"
                  />
                </div>
                <div class="form-group" style="margin: 0">
                  <label class="form-label">Tarif warna per lembar (Rp)</label>
                  <input
                    v-model.number="rate.rate_per_page_color"
                    type="number"
                    class="form-input"
                    min="0"
                    placeholder="Masukkan tarif warna"
                    style="font-size: 0.8rem"
                  />
                </div>
                <div class="form-group" style="margin: 0">
                  <label class="form-label"
                    >Kuota gratis BW (lembar/bulan)</label
                  >
                  <input
                    v-model.number="rate.free_quota_bw"
                    type="number"
                    class="form-input"
                    min="0"
                    placeholder="Contoh: 200 lembar"
                    style="font-size: 0.8rem"
                  />
                </div>
                <div class="form-group" style="margin: 0">
                  <label class="form-label"
                    >Kuota gratis warna (lembar/bulan)</label
                  >
                  <input
                    v-model.number="rate.free_quota_color"
                    type="number"
                    class="form-input"
                    min="0"
                    placeholder="Contoh: 200 lembar"
                    style="font-size: 0.8rem"
                  />
                </div>
                <div class="form-group" style="margin: 0">
                  <label class="form-label">Kuota gratis berlaku untuk</label>
                  <select
                    v-model="rate.quota_applies_to"
                    class="form-select"
                    style="font-size: 0.8rem"
                    title="Free quota applies to"
                  >
                    <option value="color">Warna (BW ditagih penuh)</option>
                    <option value="bw">BW (Warna ditagih penuh)</option>
                  </select>
                </div>
              </div>
              <div
                class="text-muted"
                style="
                  font-size: 0.75rem;
                  margin-top: 0.5rem;
                  background: var(--color-surface-sunken, #f1f5f9);
                  padding: 0.4rem 0.6rem;
                  border-radius: 6px;
                "
              >
                {{ rateSummary(rate) }}
              </div>
            </div>
            <div
              v-if="!item.rates || item.rates.length === 0"
              style="
                text-align: center;
                color: var(--color-text-muted, #64748b);
                font-size: 0.8rem;
                padding: 0.75rem;
                border: 1px dashed var(--color-border-light, #cbd5e1);
                border-radius: 6px;
              "
            >
              Belum ada harga per lembar. Klik + Tambah Harga bila ada tarif
              cetak, atau kosongkan bila hanya sewa bulanan.
            </div>
          </div>
        </div>

        <div
          style="
            margin-top: 1rem;
            border-top: 1px dashed var(--color-border-light);
            padding-top: 1rem;
          "
        >
          <div class="form-group">
            <label class="form-label" style="font-size: 0.8rem"
              >Description / Notes (Shown on Invoice)</label
            >
            <textarea
              v-model="item.description"
              class="form-input"
              placeholder="E.g. Good condition, including power cable..."
              rows="2"
            ></textarea>
          </div>
        </div>

        <div
          style="
            display: flex;
            justify-content: flex-end;
            margin-top: 16px;
            padding-top: 12px;
            border-top: 1px solid var(--color-border-light);
          "
        >
          <button
            type="button"
            class="btn-remove-item"
            title="Remove Machine"
            @click="removeRentalItem(idx)"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              style="margin-right: 4px"
            >
              <polyline points="3 6 5 6 21 6"></polyline>
              <path
                d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"
              ></path>
            </svg>
            Remove Machine
          </button>
        </div>
      </div>

      <button
        type="button"
        class="btn btn-outline btn-sm mb-4"
        @click="addRentalItem"
      >
        + Add Another Machine
      </button>

      <div class="sale-summary mt-4">
        <div class="summary-row">
          <span>Total Rental Fee ({{ form.duration_months }} months)</span
          ><span>{{ formatRupiah(calcSubtotal) }}</span>
        </div>

        <div class="summary-row summary-total">
          <span>Total Contract Amount</span
          ><span>{{ formatRupiah(calcTotal) }}</span>
        </div>
      </div>

      <div v-if="isLoading" class="mt-2 text-center text-sm text-gray-500">
        Saving data & generating contract...
      </div>
    </FormModal>
  </div>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-base);
  margin-bottom: var(--space-sm);
}
.rental-rate-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-sm) var(--space-md);
}
.rental-rate-fields .form-group {
  min-width: 0;
}
.rental-rate-fields .form-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  margin-bottom: 4px;
}
@media (max-width: 480px) {
  .rental-rate-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
.form-section-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-primary);
  padding-top: var(--space-md);
  border-top: 1px dashed var(--color-border);
  margin-bottom: var(--space-sm);
  margin-top: var(--space-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.rental-item-box {
  background: var(--color-surface);
  padding: var(--space-md) var(--space-lg);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.05),
    0 2px 4px -1px rgba(0, 0, 0, 0.03);
  margin-bottom: var(--space-md);
  transition:
    transform var(--transition-base),
    box-shadow var(--transition-base);
}
.rental-item-box:hover {
  transform: translateY(-2px);
  box-shadow:
    0 10px 15px -3px rgba(0, 0, 0, 0.08),
    0 4px 6px -2px rgba(0, 0, 0, 0.04);
}
.meter-row {
  background: var(--color-surface-sunken);
  padding: var(--space-md);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-light);
  margin-top: var(--space-sm);
}
.text-meter-label {
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-semibold);
}
.meter-input {
  background: var(--color-surface);
}
.btn-remove-item {
  display: inline-flex;
  align-items: center;
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  background: var(--color-danger-surface);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  padding: 6px 12px;
  transition: all var(--transition-fast);
}
.btn-remove-item:hover {
  background: var(--color-danger);
  color: #fff;
  border-color: var(--color-danger);
}
.sale-summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-lg);
  border-radius: var(--radius-lg);
  background: linear-gradient(
    145deg,
    var(--color-surface-raised) 0%,
    var(--color-surface) 100%
  );
  border: 1px solid var(--color-border);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}
.summary-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
.summary-total {
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-md);
  color: var(--color-primary);
  border-top: 1px dashed var(--color-border);
  padding-top: var(--space-sm);
  margin-top: var(--space-xs);
}
.mb-4 {
  margin-bottom: 1rem;
}
.mt-4 {
  margin-top: 1rem;
}
.mt-2 {
  margin-top: 0.5rem;
}
.text-center {
  text-align: center;
}
.text-sm {
  font-size: 0.875rem;
}
.text-gray-500 {
  color: var(--color-text-muted);
}

.rental-invoice-list {
  display: grid;
  gap: 10px;
}

.rental-invoice-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 18px;
  padding: 14px 16px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.rental-invoice-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}

.rental-invoice-info,
.rental-invoice-total {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.rental-invoice-info strong,
.rental-invoice-total strong {
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}

.rental-invoice-info span {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.rental-invoice-total {
  justify-items: end;
}

.rental-invoice-items {
  grid-column: 1 / -1;
  width: 100%;
  margin-top: 4px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--color-surface);
}

.meter-table {
  width: 100%;
  min-width: 560px;
  border-collapse: collapse;
  text-align: left;
  font-size: 13px;
}

.meter-table thead {
  background: var(--color-surface-raised);
  border-bottom: 1px solid var(--color-border);
}

.meter-table th {
  padding: 10px 14px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.meter-table th.col-no { width: 44px; }
.meter-table th.col-meter { text-align: right; }
.meter-table th.col-amount { text-align: right; }
.meter-table th.col-aksi { text-align: center; width: 60px; }

.meter-table td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--color-border-light);
  vertical-align: middle;
}

.meter-row:hover td {
  background: var(--color-surface-raised);
}

.cell-no {
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.cell-paper {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.paper-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  font-weight: 700;
  font-size: 12px;
  background: var(--color-surface);
  white-space: nowrap;
}

.color-pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.color-pill.is-bw {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
}

.color-pill.is-color {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
}

.cell-meter { text-align: right; }
.meter-range {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.meter-sub {
  margin-top: 2px;
  font-size: 11px;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.cell-amount {
  text-align: right;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.cell-amount.is-zero {
  font-weight: 500;
  color: var(--color-text-muted);
}

.cell-aksi { text-align: center; }
.meter-eye {
  width: 32px;
  height: 32px;
  color: var(--color-text-muted);
}
.meter-eye:hover {
  background: var(--color-surface-raised);
  color: var(--color-text);
}

.meter-table tfoot td {
  padding: 10px 14px;
  background: var(--color-surface-raised);
  border-top: 1px solid var(--color-border);
  font-weight: 700;
}
.total-label { text-align: right; color: var(--color-text-muted); }
.total-value {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.empty-cell {
  padding: 16px;
  text-align: center;
  color: var(--color-text-muted);
}

.meter-detail-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.paper-type-text {
  font-size: 12px;
  color: var(--color-text-muted);
}

.meter-formula-hint {
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--color-surface-raised);
  border: 1px dashed var(--color-border);
  font-size: 12px;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.meter-stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.meter-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--color-border-light);
  border-radius: 8px;
  background: var(--color-surface);
}

.meter-stat.highlight {
  border-color: #bfdbfe;
  background: #eff6ff;
}

.meter-stat-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  font-weight: 600;
}

.meter-stat-value {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-text);
}

.meter-detail-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  font-size: 13px;
}
.meter-detail-total strong {
  font-size: 15px;
  color: var(--color-success);
  font-variant-numeric: tabular-nums;
}

.rental-invoice-empty {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 32px 16px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  text-align: center;
  font-size: var(--font-size-sm);
}

.rental-invoice-empty strong {
  color: var(--color-text);
}

@media (max-width: 640px) {
  .rental-invoice-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
  }

  .rental-invoice-total {
    justify-items: start;
  }

  .rental-invoice-row > button {
    grid-column: 1 / -1;
    width: 100%;
  }

  .rental-invoice-actions {
    grid-column: 1 / -1;
    justify-content: stretch;
  }

  .rental-invoice-actions > * {
    flex: 1 1 100%;
    text-align: center;
  }
}

/* Status Badges */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: capitalize;
  white-space: nowrap;
}
.status-badge::before {
  content: "";
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Active - Green */
.status-active {
  background: rgba(22, 163, 74, 0.12);
  color: #15803d;
}
.status-active::before {
  background: #16a34a;
  box-shadow: 0 0 6px rgba(22, 163, 74, 0.5);
}

/* Pending - Blue */
.status-pending {
  background: rgba(48, 92, 255, 0.1);
  color: #305cff;
}
.status-pending::before {
  background: #305cff;
  box-shadow: 0 0 6px rgba(48, 92, 255, 0.4);
}

/* Expired - Orange */
.status-expired {
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
}
.status-expired::before {
  background: #f59e0b;
  box-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
}

/* Cancelled - Red */
.status-cancelled,
.status-canceled {
  background: rgba(220, 38, 38, 0.1);
  color: #dc2626;
}
.status-cancelled::before,
.status-canceled::before {
  background: #dc2626;
  box-shadow: 0 0 6px rgba(220, 38, 38, 0.4);
}

/* Completed - Teal */
.status-completed {
  background: rgba(13, 148, 136, 0.12);
  color: #0f766e;
}
.status-completed::before {
  background: #0d9488;
  box-shadow: 0 0 6px rgba(13, 148, 136, 0.5);
}

/* Unknown / fallback */
.status-unknown {
  background: rgba(100, 116, 139, 0.1);
  color: #64748b;
}
.status-unknown::before {
  background: #94a3b8;
}
</style>
