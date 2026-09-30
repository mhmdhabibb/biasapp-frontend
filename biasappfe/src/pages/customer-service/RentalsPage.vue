<script setup lang="ts">
import DataTable from "@/components/ui/DataTable.vue";
import FormModal from "@/components/ui/FormModal.vue";
import PageHeader from "@/components/ui/PageHeader.vue";
import { useMasterStore } from "@/composables/useMasterStore";
import { usePermission } from "@/composables/usePermission";
import { useToast } from "@/composables/useToast";
import { api } from "@/services/api";
import { resources } from "@/services/resource.service";
import type { TableColumn } from "@/types";
import { computed, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";

const toast = useToast();
const { can } = usePermission();
const { customers, units, products, refresh } = useMasterStore();
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
const isSavingPayment = ref(false);
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const hasCopier = selectedRental.value?.rental_items?.some((item: any) => item.unit?.is_copier);
  return (selectedRental.value?.rental_invoices || []).filter((invoice: any) => {
    const periodStart = new Date(invoice.period_start);
    if (Number.isNaN(periodStart.getTime()) || periodStart > today) return false;
    return !hasCopier || (invoice.meter_details?.length || 0) > 0;
  });
});

const paperSizes = ref<{ id: string; name: string }[]>([]);

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
      rate_per_page_bw: number;
      rate_per_page_color: number;
    }[];
  }[]
>([]);

const form = reactive({
  customer_id: "",
  start_date: new Date().toISOString().slice(0, 10),
  duration_months: 12,
  duration_days: 0,
  tax: 0,
  deposit: 0,
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

const calcTotal = computed(() => calcSubtotal.value + form.tax + form.deposit);

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
    rate_per_page_bw: 0,
    rate_per_page_color: 0,
  });
}

function removeItemRate(item: any, index: number) {
  if (item.rates) item.rates.splice(index, 1);
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
      if (Array.isArray(u.rates) && u.rates.length > 0) {
        item.rates = u.rates.map((r: any) => ({
          paper_size_id: r.paper_size_id,
          rate_per_page_bw: r.rate_per_page_bw,
          rate_per_page_color: r.rate_per_page_color,
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
  await refresh(true);
  Object.assign(form, {
    customer_id: "",
    start_date: new Date().toISOString().slice(0, 10),
    duration_months: 12,
    duration_days: 0,
    tax: 0,
    deposit: 0,
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

  // Validation: copier requires an initial meter + at least 1 paper type (size + rates)
  for (let idx = 0; idx < rentalItems.value.length; idx++) {
    const item = rentalItems.value[idx]!;
    if (!item!.selected_item) {
      toast.error(`Item #${idx + 1}: select a Unit / Product first.`);
      return;
    }
    if (item.is_copier) {
      if ((item.start_meter_bw ?? 0) < 0 || (item.start_meter_color ?? 0) < 0) {
        toast.error(`Item #${idx + 1}: initial BW / Colour meter cannot be negative.`);
        return;
      }
      const validRates = (item.rates || []).filter((r: any) => r.paper_size_id);
      if (validRates.length === 0) {
        toast.error(`Item #${idx + 1}: at least 1 Paper Type (Size) + rate is required on the first rental.`);
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
    tax: form.tax,
    deposit: form.deposit,
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
        specs: item.specs || {},
        description: item.description,
        rates: (item.rates || [])
          .filter((r: any) => r.paper_size_id)
          .map((r: any) => ({
            paper_size_id: r.paper_size_id,
            rate_per_page_bw: Number(r.rate_per_page_bw) || 0,
            rate_per_page_color: Number(r.rate_per_page_color) || 0,
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
      toast.error(t("rentals.failed", { error: JSON.stringify(err) }));
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
  showInvoiceModal.value = true;
  isLoadingRentalInvoices.value = true;
  try {
    const response = await api.get<{ data: any }>(`/rents/${rental.id}`);
    selectedRental.value = response.data;
  } catch (error: any) {
    toast.error(toast.fromError(error, "Failed to load rental invoices"));
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
  if (paymentForm.payment_method === "transfer" && (!paymentForm.bank_name.trim() || !paymentForm.account_number.trim() || !paymentForm.sender_name.trim())) {
    toast.warning("Please complete the bank, account number, and sender name.");
    return;
  }

  isSavingPayment.value = true;
  const invoiceId = String(selectedInvoice.value.id);
  try {
    const bankName = paymentForm.payment_method === "cash"
      ? "CASH"
      : `${paymentForm.bank_name} - ${paymentForm.account_number} (A/N: ${paymentForm.sender_name})`;
    await api.post("/payments", {
      payment_no: `PAY-${Date.now()}`,
      rental_invoice_id: invoiceId,
      payment_date: `${paymentForm.payment_date}T00:00:00Z`,
      amount: paymentForm.amount,
      bank_name: bankName,
      reference_no: paymentForm.reference_no.trim() || "-",
    });
    toast.success("Payment recorded and pending approval.");
    selectedInvoice.value = null;
    const rentalResponse = await api.get<{ data: any }>(`/rents/${selectedRental.value.id}`);
    selectedRental.value = rentalResponse.data;
    selectedInvoice.value = selectedRental.value?.rental_invoices?.find((invoice: any) => String(invoice.id) === invoiceId) || null;
  } catch (error: any) {
    toast.error(toast.fromError(error, "Failed to record payment"));
  } finally {
    isSavingPayment.value = false;
  }
}

onMounted(async () => {
  await refresh(true);
  fetchRentals();
  try {
    const res = await resources.paperSizes.list();
    paperSizes.value = res.data as any;
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
      :title="selectedRental ? `Rental Invoices ${selectedRental.rental_no}` : 'Rental Invoices'"
      max-width="900px"
      @close="showInvoiceModal = false; selectedInvoice = null"
    >
      <div v-if="isLoadingRentalInvoices" class="text-muted text-center py-lg">Loading rental invoices...</div>
      <div v-else-if="selectedRental" class="rental-invoice-list">
        <article v-for="invoice in visibleRentalInvoices" :key="invoice.id" class="rental-invoice-row">
          <div class="rental-invoice-info">
            <strong>{{ invoice.invoice_no }}</strong>
            <span>{{ invoice.period_start ? new Date(invoice.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '-' }} – {{ invoice.period_end ? new Date(invoice.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '-' }}</span>
          </div>
          <div class="rental-invoice-total">
            <strong>{{ formatRupiah(invoice.total_pay || invoice.subtotal || 0) }}</strong>
            <span class="badge" :class="invoice.payment_status === 'paid' ? 'badge-success' : invoice.payment_status === 'partially_paid' ? 'badge-info' : 'badge-warning'">
              {{ invoice.payment_status === 'paid' ? 'Paid' : invoice.payment_status === 'partially_paid' ? 'Partial' : 'Unpaid' }}
            </span>
          </div>
          <button
            v-if="invoice.payment_status !== 'paid' && can('payment:create')"
            type="button"
            class="btn btn-sm btn-primary"
            :disabled="isSavingPayment"
            @click="openInvoicePayment(invoice)"
          >
            Payment
          </button>
        </article>
        <div v-if="!visibleRentalInvoices.length" class="rental-invoice-empty">
          <strong>{{ selectedRental.rental_items?.some((item: any) => item.unit?.is_copier) ? 'No invoices for this period yet.' : 'No invoices with a started period yet.' }}</strong>
          <span v-if="selectedRental.rental_items?.some((item: any) => item.unit?.is_copier)">Enter the copier meter reading first to generate invoices.</span>
        </div>
      </div>
      <template #footer>
        <button type="button" class="btn btn-outline" @click="showInvoiceModal = false; selectedInvoice = null">Close</button>
      </template>
    </FormModal>

    <FormModal
      :open="!!selectedInvoice"
      :title="selectedInvoice ? `Payment ${selectedInvoice.invoice_no}` : 'Payment'"
      @close="selectedInvoice = null"
      @submit="submitInvoicePayment"
    >
      <div class="form-group">
        <label class="form-label">Payment Date</label>
        <input v-model="paymentForm.payment_date" type="date" class="form-input" required>
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
          <input v-model="paymentForm.bank_name" type="text" class="form-input" placeholder="BCA, Mandiri, BRI" required>
        </div>
        <div class="form-group">
          <label class="form-label">Account Number</label>
          <input v-model="paymentForm.account_number" type="text" class="form-input" required>
        </div>
        <div class="form-group">
          <label class="form-label">Sender Name</label>
          <input v-model="paymentForm.sender_name" type="text" class="form-input" required>
        </div>
      </template>
      <div class="form-group">
        <label class="form-label">Payment Amount</label>
        <input v-model.number="paymentForm.amount" type="number" class="form-input" min="1" required>
      </div>
      <div class="form-group">
        <label class="form-label">Reference No.</label>
        <input v-model="paymentForm.reference_no" type="text" class="form-input" placeholder="Optional">
      </div>
      <template #footer>
        <button type="button" class="btn btn-outline" :disabled="isSavingPayment" @click="selectedInvoice = null">Cancel</button>
        <button type="button" class="btn btn-primary" :disabled="isSavingPayment" @click="submitInvoicePayment">
          {{ isSavingPayment ? 'Saving...' : 'Record Payment' }}
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
          <textarea id="notes" v-model="form.notes" class="form-input" placeholder="Optional" rows="2"></textarea>
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

      <div class="form-section-title">Rented Machines & Initial Meter Input</div>

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
            Check if this item is a Copier Machine (Requires Initial Meter Input)
          </label>
        </div>

        <div class="form-group" style="margin-bottom: var(--space-md)">
          <label class="form-label">Select Unit / Product</label>
          <select
            v-model="item.selected_item"
            class="form-select"
            required
            @change="onItemSelectChange(item)"
          >
            <option value="">-- Select Machine or Product --</option>
            <optgroup label="Machines (Units)">
              <option v-for="u in units" :key="u.id" :value="'unit_' + u.id">
                {{ u.model }} ({{ (u as any).brand?.name }})
              </option>
            </optgroup>
            <optgroup label="Products / Others">
              <option v-for="p in products" :key="p.id" :value="'prod_' + p.id">
                {{ p.name }} ({{ (p as any).category?.name || "-" }})
              </option>
            </optgroup>
          </select>
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
              grid-template-columns: 1fr 1fr 1fr;
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
            <div class="form-group">
              <label class="form-label" style="font-size: 0.8rem"
                >Free Quota Color</label
              >
              <input
                v-model.number="item.free_quota_color"
                type="number"
                class="form-input"
                min="0"
                placeholder="0"
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
                >Paper Type / Size (Rates) *</label
              >
              <button
                type="button"
                @click="addItemRate(item)"
                class="btn btn-secondary btn-sm"
                style="padding: 0.2rem 0.5rem; font-size: 0.75rem"
              >
                + Add Price
              </button>
            </div>

            <div
              v-for="(rate, rIdx) in item.rates"
              :key="rIdx"
              style="
                display: grid;
                grid-template-columns: 2fr 1fr 1fr auto;
                gap: 0.5rem;
                margin-bottom: 0.5rem;
                align-items: center;
                background: var(--color-surface, #f8fafc);
                padding: 0.5rem;
                border-radius: 6px;
                border: 1px solid var(--color-border-light, #e2e8f0);
              "
            >
              <div>
                <select
                  v-model="rate.paper_size_id"
                  class="form-select"
                  style="font-size: 0.8rem"
                  required
                >
                  <option value="">-- Select Paper Type / Size * --</option>
                  <option v-for="p in paperSizes" :key="p.id" :value="p.id">
                    {{ p.name }}
                  </option>
                </select>
              </div>
              <div>
                <input
                  v-model.number="rate.rate_per_page_bw"
                  type="number"
                  class="form-input"
                  min="0"
                  placeholder="BW Rate"
                  style="font-size: 0.8rem"
                />
              </div>
              <div>
                <input
                  v-model.number="rate.rate_per_page_color"
                  type="number"
                  class="form-input"
                  min="0"
                  placeholder="Colour Rate"
                  style="font-size: 0.8rem"
                />
              </div>
              <button
                type="button"
                @click="removeItemRate(item, rIdx)"
                style="
                  background: none;
                  border: none;
                  color: #ef4444;
                  cursor: pointer;
                  padding: 0.4rem;
                "
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
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
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  ></path>
                </svg>
              </button>
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
              No paper types added yet. At least 1 is required on first rental.
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

      <div class="form-row">
        <div class="form-group">
          <label for="rent-tax" class="form-label">Tax (Rp)</label>
          <input
            id="rent-tax"
            v-model.number="form.tax"
            type="number"
            class="form-input"
            min="0"
          />
        </div>
        <div class="form-group">
          <label for="rent-deposit" class="form-label"
            >Down Payment / Deposit (Rp)</label
          >
          <input
            id="rent-deposit"
            v-model.number="form.deposit"
            type="number"
            class="form-input"
            min="0"
          />
        </div>
      </div>

      <div class="sale-summary mt-4">
        <div class="summary-row">
          <span>Total Rental Fee ({{ form.duration_months }} months)</span
          ><span>{{ formatRupiah(calcSubtotal) }}</span>
        </div>
        <div class="summary-row">
          <span>Tax</span><span>{{ formatRupiah(form.tax) }}</span>
        </div>
        <div class="summary-row">
          <span>Deposit</span><span>{{ formatRupiah(form.deposit) }}</span>
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
