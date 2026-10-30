<script setup lang="ts">
import DataTable from "@/components/ui/DataTable.vue";
import CustomSelect from "@/components/ui/CustomSelect.vue";
import FormModal from "@/components/ui/FormModal.vue";
import HardDeleteDialog from "@/components/ui/HardDeleteDialog.vue";
import PageHeader from "@/components/ui/PageHeader.vue";
import { useAuth } from "@/composables/useAuth";
import { useHardDelete } from "@/composables/useHardDelete";
import { useMasterStore } from "@/composables/useMasterStore";
import { usePermission } from "@/composables/usePermission";
import { useToast } from "@/composables/useToast";
import { api } from "@/services/api";
import { resources } from "@/services/resource.service";
import { invalidateCache } from "@/utils/requestCache";
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
import { computed, onActivated, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { normalizeRole } from "@/router/role-access";

const toast = useToast();
const { can, isAdmin } = usePermission();
const { currentUser } = useAuth();
const masterStore = useMasterStore();
const {
  customers,
  units,
  products,
  brands,
  unitTypes,
  payments,
  technicians,
  deliveryOrders,
  findCustomer,
  findUnit,
  findProduct,
  refreshOnly,
  ensureResourcesLoaded,
  formatUnitDisplayName,
  formatProductDisplayName,
} = masterStore;

// CS (dan teknisi) tidak boleh melihat nominal: rate, total amount invoice items.
const canSeeAmount = computed(() => {
  if (isAdmin.value) return true;
  const role = normalizeRole((currentUser.value as any)?.role);
  return role === "accounting" || role === "admin";
});
const { t } = useI18n();
const route = useRoute();

const hardDelete = useHardDelete(
  (id, cascade) => resources.rentals.hardRemove(id, cascade),
  async () => {
    invalidateCache("units");
    invalidateCache("rents");
    invalidateCache("contracts");
    await fetchRentals();
    await refreshOnly(["units", "contracts", "products"], true);
  },
  "rental:delete",
);

const showDeleteRentalModal = ref(false);
const deletingRental = ref<any>(null);
const rentalDeleteReason = ref("");
const rentalConfirmAgree = ref(false);
const isDeletingRental = ref(false);

function openDeleteRentalModal(row: any) {
  deletingRental.value = row;
  rentalDeleteReason.value = "";
  rentalConfirmAgree.value = false;
  showDeleteRentalModal.value = true;
}

async function handleConfirmDeleteRental() {
  if (!deletingRental.value || !rentalDeleteReason.value.trim() || !rentalConfirmAgree.value) return;
  isDeletingRental.value = true;
  try {
    await resources.rentals.remove(deletingRental.value.id, false, rentalDeleteReason.value.trim());
    toast.success("Rental berhasil dihapus dan unit telah kembali menjadi available.");
    showDeleteRentalModal.value = false;
    invalidateCache("units");
    invalidateCache("rents");
    invalidateCache("contracts");
    await fetchRentals();
    await refreshOnly(["units", "contracts", "products"], true);
  } catch (err: any) {
    toast.error("Gagal menghapus rental: " + (err?.message || "Error"));
  } finally {
    isDeletingRental.value = false;
  }
}


const columns = computed<TableColumn[]>(() => [
  { key: "rental_no", label: t("rentals.no") },
  { key: "company", label: t("rentals.company") },
  { key: "pic_name", label: t("rentals.pic_name") },
  { key: "start_date", label: t("rentals.start") },
  { key: "end_date", label: t("rentals.end") },
  { key: "do_number", label: "DO No." },
  { key: "total", label: t("rentals.total") },
  { key: "invoice_actions", label: "Invoices" },
  { key: "status", label: t("rentals.status") },
]);

const rentals = ref<any[]>([]);

const customerOptions = computed(() => [
  { value: null, label: 'All Customers' },
  ...(customers.value as any[]).map((c: any) => ({
    value: c.id,
    label: `${c.company_name || c.name}${c.pic_name ? ' - ' + c.pic_name : ''}`,
  }))
]);

const filterCustomer = ref<string | null>(null);
const filteredRentals = computed(() => {
  if (!filterCustomer.value) return rentals.value;
  return rentals.value.filter((r: any) => String(r.customer_id) === String(filterCustomer.value));
});

const showModal = ref(false);
const isLoading = ref(false);
const isLoadingRentals = ref(true);
const showInvoiceModal = ref(false);
const isLoadingRentalInvoices = ref(false);
const selectedRental = ref<any>(null);
const selectedInvoice = ref<any>(null);
const expandedInvoiceId = ref<string | null>(null);
const selectedMeterDetail = ref<any>(null);
const showMeterDetail = ref(false);
const isSavingPayment = ref(false);
const showDetailModal = ref(false);
const detailRental = ref<any>(null);

const showCreateDOModal = ref(false);
const targetRentalForDO = ref<any>(null);
const isSubmittingDO = ref(false);
const doForm = reactive({
  do_number: '',
  project_name: '',
  delivery_date: '',
  delivery_address: '',
  recipient_name: '',
  recipient_phone: '',
  technician_id: '',
  notes: '',
});

const technicianOptions = computed(() => [
  { value: '', label: '-- Pilih Teknisi (Opsional) --' },
  ...((technicians.value as any[]) || []).map((t: any) => ({
    value: t.id,
    label: t.name || t.user?.name || `Teknisi ${t.id}`,
  }))
]);

function hasActiveRentalDO(rental: any): boolean {
  if (!rental) return false;
  if (rental.delivery_order && rental.delivery_order.status !== 'cancelled' && !rental.delivery_order.deleted_at) {
    return true;
  }
  if (Array.isArray(rental.delivery_orders) && rental.delivery_orders.length > 0) {
    return rental.delivery_orders.some((d: any) => d && d.status !== 'cancelled' && !d.deleted_at);
  }
  const found = ((deliveryOrders.value as any[]) || []).find(
    (d: any) => String(d.rental_id) === String(rental.id) && d.status !== 'cancelled' && !d.deleted_at
  );
  return !!found;
}

function getRentalDONumber(rental: any): string {
  if (!rental) return '-';
  if (rental.delivery_order && rental.delivery_order.status !== 'cancelled') {
    return rental.delivery_order.do_number || '-';
  }
  if (Array.isArray(rental.delivery_orders) && rental.delivery_orders.length > 0) {
    const activeDO = rental.delivery_orders.find((d: any) => d && d.status !== 'cancelled' && !d.deleted_at);
    if (activeDO?.do_number) return activeDO.do_number;
  }
  const found = ((deliveryOrders.value as any[]) || []).find(
    (d: any) => String(d.rental_id) === String(rental.id) && d.status !== 'cancelled' && !d.deleted_at
  );
  return found?.do_number || '-';
}

function openCreateRentalDOModal(rental: any) {
  if (hasActiveRentalDO(rental)) {
    toast.error('Surat Jalan (DO) sudah ada dan aktif untuk transaksi rental ini.');
    return;
  }
  targetRentalForDO.value = rental;
  const cust = rental?.customer || findCustomer(rental?.customer_id);

  const itemNames = (rental?.rental_items || []).map((ri: any) => {
    const u = ri.unit || findUnit(ri.unit_id);
    if (u) return formatUnitDisplayName(u);
    const p = ri.product || findProduct(ri.product_id);
    if (p) return formatProductDisplayName(p);
    return '';
  }).filter(Boolean);
  const productOrUnitName = itemNames.length > 0 ? itemNames.join(', ') : 'Unit';
  const recipientAddress = rental?.installation_address || cust?.address || '';

  doForm.do_number = '';
  doForm.project_name = recipientAddress ? `Pengantaran ${productOrUnitName} ke ${recipientAddress}` : `Pengantaran ${productOrUnitName}`;
  doForm.delivery_date = new Date().toISOString().slice(0, 10);
  doForm.delivery_address = recipientAddress;
  doForm.recipient_name = cust?.pic_name || cust?.company_name || '';
  doForm.recipient_phone = cust?.phone || '';
  doForm.technician_id = '';
  doForm.notes = `Pengantaran unit rental ${rental?.rental_no || ''}`.trim();

  showCreateDOModal.value = true;
}

async function submitCreateRentalDO() {
  if (!targetRentalForDO.value || isSubmittingDO.value) return;
  isSubmittingDO.value = true;
  try {
    const payload = {
      do_number: doForm.do_number ? doForm.do_number.trim() : undefined,
      project_name: doForm.project_name ? doForm.project_name.trim() : undefined,
      delivery_date: doForm.delivery_date ? new Date(doForm.delivery_date).toISOString() : new Date().toISOString(),
      delivery_address: doForm.delivery_address,
      recipient_name: doForm.recipient_name,
      recipient_phone: doForm.recipient_phone,
      technician_id: doForm.technician_id || undefined,
      notes: doForm.notes,
    };
    await api.post(`/rents/${targetRentalForDO.value.id}/delivery-order`, payload);
    toast.success('Surat Jalan (DO) berhasil dibuat!');
    showCreateDOModal.value = false;
    await fetchRentals();
    await refreshOnly(['deliveryOrders']);
  } catch (err: any) {
    toast.error(toast.fromError(err, 'Gagal membuat Surat Jalan (DO)'));
  } finally {
    isSubmittingDO.value = false;
  }
}

async function openRentalDetail(rental: any) {
  detailRental.value = rental;
  showDetailModal.value = true;
  try {
    const response = await api.get<{ data: any }>(`/rents/${rental.id}`, false);
    detailRental.value = response.data;
  } catch {
    // Keep list-row data if the full payload fails to load.
  }
}

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
const productCategories = ref<any[]>([]);

const rentalItems = ref<
  {
    id?: string;
    selected_item: string;
    create_mode: "existing" | "unit" | "product";
    new_unit: {
      brand_id: string;
      type_id: string;
      model: string;
      serial_no: string;
      is_copier: boolean;
      current_meter_bw: number;
      current_meter_color: number;
    };
    new_product: {
      name: string;
      category_id: string;
      price: number;
      stock: number;
      is_computer: boolean;
    };
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
      paper_size_id: string | null;
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
  technician_id: "",
  is_new: true,
});

watch(() => form.is_new, (isNew) => {
  const newMode = isNew ? "existing" : "unit";
  for (const item of rentalItems.value) {
    item.create_mode = newMode;
    if (typeof onItemModeChange === "function") {
      try { onItemModeChange(item); } catch (e) {}
    }
  }
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

const rentPaymentMethodOptions = [
  { value: "transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
];
const rentCustomerOptions = computed(() =>
  (customers.value as any[]).map((c: any) => ({
    value: c.id,
    label:
      `${(c as any).company_name || (c as any).name}` +
      `${(c as any).pic_name ? " - " + (c as any).pic_name : ""}`,
  })),
);
const rentUnitOptions = computed(() => {
  const currentEditingUnitIds = new Set<string>();
  if (editingRental.value) {
    const rawItems = editingRental.value.rental_items || editingRental.value.rentalItems || [];
    rawItems.forEach((it: any) => {
      if (it.unit_id) currentEditingUnitIds.add(String(it.unit_id));
    });
  }

  return [
    // 1. Machines / Units (Available or attached to current rental being edited)
    ...(units.value as any[])
      .filter((u: any) => {
        const s = unitStatusOf(u);
        return s === "available" || s === "" || currentEditingUnitIds.has(String(u.id));
      })
      .map((u: any) => {
        const isCurrent = currentEditingUnitIds.has(String(u.id));
        return {
          value: "unit_" + u.id,
          label: `[Unit/Mesin] ${formatUnitDisplayName(u)} — S/N: ${u.serial_no || "N/A"}${isCurrent ? " (Unit Saat Ini)" : ""}`,
        };
      }),
    // 2. Unavailable units (attached to other rentals, broken, etc.)
    ...(unavailableUnits.value as any[])
      .filter((u: any) => !currentEditingUnitIds.has(String(u.id)))
      .map((u: any) => ({
        value: "unit_" + u.id,
        label: `[Unit/Mesin] ${formatUnitDisplayName(u)} — S/N: ${u.serial_no || "N/A"} — ${unitStatusOf(u)}`,
        disabled: true,
      })),
    // 3. Consumables / Spareparts (Products)
    ...(products.value as any[]).map((p: any) => ({
      value: "prod_" + p.id,
      label: `[Consumable/Sparepart] ${formatProductDisplayName(p)}${p.sku ? " (" + p.sku + ")" : ""}${p.price ? " — " + fmtRp(p.price) : ""}`,
    })),
  ];
});
const rentPaperSizeOptions = computed(() => [
  { value: "", label: "— Semua ukuran —" },
  ...(paperSizes.value as any[]).map((p: any) => ({
    value: p.id,
    label: p.name,
  })),
]);
const rentPaperTypeOptions = computed(() =>
  (paperTypes.value as any[]).map((p: any) => ({
    value: p.id,
    label: p.name,
  })),
);
const rentQuotaAppliesToOptions = [
  { value: "color", label: "Warna (BW ditagih penuh)" },
  { value: "bw", label: "BW (Warna ditagih penuh)" },
];

function addRentalItem(mode?: "existing" | "unit" | "product") {
  const defaultMode = mode || (form.is_new ? "existing" : "unit");
  rentalItems.value.push({
    selected_item: "",
    create_mode: defaultMode,
    new_unit: {
      brand_id: "",
      type_id: "",
      model: "",
      serial_no: "",
      is_copier: false,
      current_meter_bw: 0,
      current_meter_color: 0,
    },
    new_product: {
      name: "",
      category_id: "",
      price: 0,
      stock: 0,
      is_computer: false,
    },
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
      if (p.price && !item.monthly_rent) {
        item.monthly_rent = p.price;
      }
      item.rates = [];
      item.start_meter_bw = 0;
      item.start_meter_color = 0;
      item.free_quota_bw = 0;
      item.free_quota_color = 0;
    }
  }
}

function onItemModeChange(item: any) {
  if (item.create_mode === "existing") {
    item.selected_item = "";
    item.is_copier = false;
    item.is_computer = false;
  } else if (item.create_mode === "unit") {
    item.selected_item = "";
    item.is_copier = !!item.new_unit.is_copier;
    item.start_meter_bw = item.new_unit.current_meter_bw || 0;
    item.start_meter_color = item.new_unit.current_meter_color || 0;
  } else if (item.create_mode === "product") {
    item.selected_item = "";
    item.is_copier = false;
    item.is_computer = !!item.new_product.is_computer;
    if (item.new_product.price && !item.monthly_rent) {
      item.monthly_rent = item.new_product.price;
    }
  }
}

function syncNewUnitMeter(item: any) {
  if (item.create_mode === "unit" && item.new_unit.is_copier) {
    item.is_copier = true;
    item.start_meter_bw = item.new_unit.current_meter_bw || 0;
    item.start_meter_color = item.new_unit.current_meter_color || 0;
  } else if (item.create_mode === "unit") {
    item.is_copier = false;
  }
}

const editingRental = ref<any>(null);

async function openAdd() {
  editingRental.value = null;
  await refreshOnly(["customers", "units", "products", "brands", "unitTypes"]);
  try {
    const res = await resources.productCategories.list();
    const list = Array.isArray((res as any)?.data)
      ? (res as any).data
      : Array.isArray(res)
        ? res
        : [];
    productCategories.value = list as any;
  } catch (e) {
    console.warn("Could not load product categories:", e);
  }
  Object.assign(form, {
    customer_id: "",
    start_date: new Date().toISOString().slice(0, 10),
    duration_months: 12,
    duration_days: 0,
    po_no: "",
    notes: "",
    installation_address: "",
    technician_id: "",
    is_new: true,
  });
  rentalItems.value = [
    {
      selected_item: "",
      create_mode: "existing",
      new_unit: {
        brand_id: "",
        type_id: "",
        model: "",
        serial_no: "",
        is_copier: false,
        current_meter_bw: 0,
        current_meter_color: 0,
      },
      new_product: {
        name: "",
        category_id: "",
        price: 0,
        stock: 0,
        is_computer: false,
      },
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

async function openEdit(row: any) {
  await refreshOnly(["customers", "units", "products"]);
  let rentalData = row;
  try {
    const res = await api.get<{ data: any }>(`/rents/${row.id}`, false);
    if (res?.data) {
      rentalData = res.data;
    }
  } catch (err) {
    console.warn("Could not fetch full rental data, using row:", err);
  }

  editingRental.value = rentalData;

  Object.assign(form, {
    customer_id: rentalData.customer_id || "",
    start_date: rentalData.start_date ? String(rentalData.start_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    duration_months: rentalData.duration_months ?? 12,
    duration_days: rentalData.duration_days ?? 0,
    po_no: rentalData.po_no || "",
    notes: rentalData.notes || "",
    installation_address: rentalData.installation_address || "",
  });

  const rawItems = rentalData.rental_items || rentalData.rentalItems || [];
  if (rawItems.length > 0) {
    rentalItems.value = rawItems.map((item: any) => {
      let selectedItem = "";
      if (item.unit_id) {
        selectedItem = `unit_${item.unit_id}`;
      } else if (item.product_id) {
        selectedItem = `prod_${item.product_id}`;
      }

      const unit = item.unit_id ? findUnit(item.unit_id) : null;
      const isCopier = unit ? !!unit.is_copier : false;
      const isComputer = unit ? !!(unit as any).is_computer : false;

       return {
        id: item.id,
        selected_item: selectedItem,
        create_mode: "existing",
        new_unit: {
          brand_id: "",
          type_id: "",
          model: "",
          serial_no: "",
          is_copier: false,
          current_meter_bw: 0,
          current_meter_color: 0,
        },
        new_product: {
          name: "",
          category_id: "",
          price: 0,
          stock: 0,
          is_computer: false,
        },
        unit_id: item.unit_id || null,
        product_id: item.product_id || null,
        qty: item.qty || 1,
        monthly_rent: item.monthly_rent || 0,
        start_meter_bw: item.start_meter_bw || 0,
        start_meter_color: item.start_meter_color || 0,
        free_quota_color: item.free_quota_color || 0,
        free_quota_bw: item.free_quota_bw || 0,
        placement_location: item.placement_location || "",
        is_copier: isCopier,
        is_computer: isComputer,
        specs: item.specs || {
          cpu: "",
          ram: "",
          storage: "",
          storage_type: "",
          os: "",
          vga: "",
          office: "",
        },
        description: item.description || "",
        rates: (item.rates || []).map((r: any) => ({
          paper_size_id: r.paper_size_id || null,
          paper_type_id: r.paper_type_id || null,
          rate_per_page_bw: r.rate_per_page_bw || 0,
          rate_per_page_color: r.rate_per_page_color || 0,
          free_quota_bw: r.free_quota_bw || 0,
          free_quota_color: r.free_quota_color || 0,
          quota_applies_to: r.quota_applies_to || "color",
        })),
      };
    });
  } else {
    rentalItems.value = [
      {
        id: undefined,
        selected_item: "",
        create_mode: "existing",
        new_unit: {
          brand_id: "",
          type_id: "",
          model: "",
          serial_no: "",
          is_copier: false,
          current_meter_bw: 0,
          current_meter_color: 0,
        },
        new_product: {
          name: "",
          category_id: "",
          price: 0,
          stock: 0,
          is_computer: false,
        },
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
        specs: { cpu: "", ram: "", storage: "", storage_type: "", os: "", vga: "", office: "" },
        description: "",
        rates: [],
      },
    ];
  }

  showModal.value = true;
}

async function fetchRentals(silent = false) {
  if (!silent) isLoadingRentals.value = true;
  try {
    const res = await api.get<any>("/rents?limit=200&order_by=created_at&order_dir=desc", !silent, true);
    const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
    rentals.value = list.map((r: any) => {
      const c = (customers.value || []).find((cust: any) => cust.id === r.customer_id);
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
    if (!silent) {
      console.error("Failed to fetch rentals data", error);
      toast.error("Gagal memuat data rental. Silakan refresh halaman.");
    }
  } finally {
    if (!silent) isLoadingRentals.value = false;
  }
}

async function handleSubmit() {
  if (!form.customer_id) {
    toast.error("Pilih Customer terlebih dahulu.");
    return;
  }

  if (rentalItems.value.length === 0) {
    toast.error("Tambahkan minimal 1 item/unit rental.");
    return;
  }

  // Validation: copier requires an initial meter (paper size/kind rates are optional)
  for (let idx = 0; idx < rentalItems.value.length; idx++) {
    const item = rentalItems.value[idx]!;
    if (item.create_mode !== "unit" && item.create_mode !== "product" && !item?.selected_item) {
      toast.error(`Item #${idx + 1}: pilih Unit / Produk terlebih dahulu.`);
      return;
    }
    if (item.is_copier) {
      if ((item.start_meter_bw ?? 0) < 0 || (item.start_meter_color ?? 0) < 0) {
        toast.error(
          `Item #${idx + 1}: meteran awal BW / Warna tidak boleh negatif.`,
        );
        return;
      }
    }
  }

  // Refresh paper sizes in background if possible, but do not block form if fails
  try {
    const latestPaperSizes = await resources.paperSizes.list();
    const list = Array.isArray(latestPaperSizes?.data)
      ? latestPaperSizes.data
      : Array.isArray(latestPaperSizes)
        ? latestPaperSizes
        : [];
    if (list.length > 0) {
      paperSizes.value = list as any;
    }
  } catch (err) {
    console.warn("Could not refresh paper sizes, using cached lookups:", err);
  }

  const validPaperSizeIDs = new Set(
    (paperSizes.value || []).map((paperSize) => String(paperSize.id)),
  );
  for (let itemIndex = 0; itemIndex < rentalItems.value.length; itemIndex++) {
    const rates = rentalItems.value[itemIndex]?.rates || [];
    for (let rateIndex = 0; rateIndex < rates.length; rateIndex++) {
      const paperSizeID = rates[rateIndex]?.paper_size_id;
      if (paperSizeID && validPaperSizeIDs.size > 0 && !validPaperSizeIDs.has(String(paperSizeID))) {
        toast.error(
          `Item #${itemIndex + 1}, harga #${rateIndex + 1}: ukuran kertas yang dipilih tidak ditemukan. Silakan pilih kembali.`,
        );
        return;
      }
    }
  }

  const createdUnitIds: string[] = [];
  const createdProductIds: string[] = [];

  // Validasi item baru sebelum create
  for (let idx = 0; idx < rentalItems.value.length; idx++) {
    const it = rentalItems.value[idx]!;
    if (it.create_mode === "unit") {
      if (!it.new_unit.brand_id || !it.new_unit.type_id || !String(it.new_unit.model || "").trim() || !String(it.new_unit.serial_no || "").trim()) {
        toast.error(`Item #${idx + 1}: lengkapi Brand, Tipe, Model, dan Serial No untuk unit baru.`);
        return;
      }
    } else if (it.create_mode === "product") {
      if (!String(it.new_product.name || "").trim() || !it.new_product.category_id) {
        toast.error(`Item #${idx + 1}: lengkapi Nama dan Kategori untuk produk baru.`);
        return;
      }
    } else if (!it.selected_item) {
      toast.error(`Item #${idx + 1}: pilih Unit / Produk terlebih dahulu.`);
      return;
    }
  }

  isLoading.value = true;

  // Buat unit/produk baru terlebih dahulu
  try {
    for (const item of rentalItems.value) {
      if (item.create_mode === "unit") {
        const serialUpper = String(item.new_unit.serial_no || "").trim().toUpperCase();
        let existingUnit = (units.value || []).find(
          (u: any) => String(u.serial_no || "").trim().toUpperCase() === serialUpper,
        );
        let newId = existingUnit ? String(existingUnit.id || "") : "";
        if (!newId) {
          try {
            const res: any = await resources.units.create({
              name: item.new_unit.model || "Unit",
              brand_id: item.new_unit.brand_id,
              type_id: item.new_unit.type_id,
              model: item.new_unit.model,
              serial_no: serialUpper,
              is_copier: !!item.new_unit.is_copier,
              is_external: true,
              status: "available",
              current_meter_bw: Number(item.new_unit.current_meter_bw) || 0,
              current_meter_color: Number(item.new_unit.current_meter_color) || 0,
            });
            newId = String(res?.data?.id || res?.id || "");
            if (!newId) throw new Error("Gagal membuat unit baru");
            createdUnitIds.push(newId);
          } catch (createErr: any) {
            await refreshOnly(["units"], true);
            const found = (units.value || []).find(
              (u: any) => String(u.serial_no || "").trim().toUpperCase() === serialUpper,
            );
            if (found) {
              newId = String(found.id || "");
            } else {
              throw createErr;
            }
          }
        }
        if (!newId) throw new Error("Gagal membuat unit baru");
        item.selected_item = "unit_" + newId;
        item.is_copier = !!item.new_unit.is_copier;
        item.start_meter_bw = Number(item.new_unit.current_meter_bw) || 0;
        item.start_meter_color = Number(item.new_unit.current_meter_color) || 0;
      } else if (item.create_mode === "product") {
        const res: any = await resources.products.create({
          name: item.new_product.name,
          category_id: item.new_product.category_id,
          price: Number(item.new_product.price) || 0,
          stock: Number(item.new_product.stock) || 0,
          is_computer: !!item.new_product.is_computer,
        });
        const newId = String(res?.data?.id || res?.id || "");
        if (!newId) throw new Error("Gagal membuat produk baru");
        item.selected_item = "prod_" + newId;
        createdProductIds.push(newId);
        item.is_computer = !!item.new_product.is_computer;
        if (item.new_product.price && !item.monthly_rent) {
          item.monthly_rent = item.new_product.price;
        }
      }
    }
  } catch (err: any) {
    for (const id of createdUnitIds) {
      try {
        await resources.units.remove(id);
      } catch (e) {}
    }
    for (const id of createdProductIds) {
      try {
        await resources.products.remove(id);
      } catch (e) {}
    }
    isLoading.value = false;
    toast.error("Gagal membuat unit/produk baru: " + (err?.message || "Error"));
    return;
  }

  const startDateObj = form.start_date ? new Date(form.start_date) : new Date();
  const startDateIso = isNaN(startDateObj.getTime())
    ? new Date().toISOString()
    : startDateObj.toISOString();

  const payload = {
    customer_id: String(form.customer_id),
    start_date: startDateIso,
    duration_months: Math.max(0, Math.round(Number(form.duration_months) || 0)),
    duration_days: Math.max(0, Math.round(Number(form.duration_days) || 0)),
    tax: 0,
    deposit: 0,
    po_no: form.po_no ? String(form.po_no).trim() : "",
    notes: form.notes ? String(form.notes).trim() : "",
    installation_address: form.installation_address ? String(form.installation_address).trim() : "",
    technician_id: form.technician_id || undefined,
    is_new: Boolean(form.is_new),
    items: rentalItems.value.map((item) => {
      const isUnit = item.selected_item.startsWith("unit_");
      const isProduct = item.selected_item.startsWith("prod_");
      const unitId = isUnit ? item.selected_item.replace("unit_", "").trim() : null;
      const productId = isProduct ? item.selected_item.replace("prod_", "").trim() : null;

      return {
        id: item.id || undefined,
        unit_id: unitId || null,
        product_id: productId || null,
        qty: Math.max(1, Math.round(Number(item.qty) || 1)),
        monthly_rent: Math.max(0, Math.round(Number(item.monthly_rent) || 0)),
        start_meter_bw: Math.max(0, Math.round(Number(item.start_meter_bw) || 0)),
        start_meter_color: Math.max(0, Math.round(Number(item.start_meter_color) || 0)),
        free_quota_color: Math.max(0, Math.round(Number(item.free_quota_color) || 0)),
        free_quota_bw: Math.max(0, Math.round(Number(item.free_quota_bw) || 0)),
        placement_location: (item.placement_location || "").trim() || "",
        specs: item.specs || {},
        description: item.description ? String(item.description).trim() : "",
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
            paper_size_id: r.paper_size_id ? String(r.paper_size_id) : null,
            paper_type_id: r.paper_type_id ? String(r.paper_type_id) : null,
            rate_per_page_bw: Math.max(0, Math.round(Number(r.rate_per_page_bw) || 0)),
            rate_per_page_color: Math.max(0, Math.round(Number(r.rate_per_page_color) || 0)),
            free_quota_bw: Math.max(0, Math.round(Number(r.free_quota_bw) || 0)),
            free_quota_color: Math.max(0, Math.round(Number(r.free_quota_color) || 0)),
            quota_applies_to: r.quota_applies_to === "bw" ? "bw" : "color",
          })),
      };
    }),
  };

  try {
    if (editingRental.value) {
      await api.put(`/rents/${editingRental.value.id}`, payload);
      invalidateCache("/rents");
      window.dispatchEvent(new CustomEvent("bias:data-mutated", { detail: { path: "/rents" } }));
      toast.success("Rental berhasil diperbarui.");
      showModal.value = false;
      editingRental.value = null;
    } else {
      await api.post("/rents", payload);
      invalidateCache("/rents");
      invalidateCache("/delivery-orders");
      window.dispatchEvent(new CustomEvent("bias:data-mutated", { detail: { path: "/rents" } }));
      toast.success("Transaksi sewa rental dan Surat Jalan (DO) berhasil dibuat!");
      showModal.value = false;
    }
  } catch (error: any) {
    console.error("Failed to save rental:", error);
    for (const id of createdUnitIds) {
      try {
        await resources.units.remove(id);
      } catch (e) {}
    }
    for (const id of createdProductIds) {
      try {
        await resources.products.remove(id);
      } catch (e) {}
    }
    let errMessage = error.message || t("rentals.network_error");
    if (error.response?.data?.message) {
      errMessage = error.response.data.message;
    }
    if (error.response?.data?.error) {
      errMessage = `${errMessage}: ${error.response.data.error}`;
    }
    if (error.response?.data?.errors && typeof error.response.data.errors === "object") {
      const details = Object.entries(error.response.data.errors)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      errMessage = `${errMessage} (${details})`;
    }
    toast.error(t("rentals.failed", { error: errMessage }));
    return;
  } finally {
    isLoading.value = false;
  }

  // Refresh data secara aman setelah modal tertutup
  try {
    await fetchRentals();
    await refreshOnly(["units", "products", "deliveryOrders"]);
  } catch (refreshErr) {
    console.warn("Background refresh after rental save encountered an issue:", refreshErr);
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

// Rental ini punya unit copier (dari rental_items yang ter-preload).
function rentalHasCopier(): boolean {
  const items = (selectedRental.value as any)?.rental_items || [];
  return items.some((item: any) => item?.unit?.is_copier);
}

// Invoice rental unit copier yang meter report-nya belum diisi teknisi
// belum boleh dibayar: status masih pending_meter_reading, atau rental
// copier tapi invoice belum difinalisasi report (data lama / status drift).
function isWaitingMeterReport(invoice: any): boolean {
  if (String(invoice?.status || "").toLowerCase() === "pending_meter_reading")
    return true;
  return rentalHasCopier() && !invoice?.is_finalized;
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

async function loadPaperLookups() {
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
}

function hydrateRentalLookups() {
  void refreshOnly(["customers", "units", "products", "payments"]);
  void loadPaperLookups();
}

let skipNextRentalActivate = true;
let rentalPollTimer: any = null;

function silentSyncRentals() {
  if (document.visibilityState === "visible") {
    fetchRentals(true);
  }
}

onMounted(() => {
  fetchRentals();
  hydrateRentalLookups();
  rentalPollTimer = setInterval(silentSyncRentals, 30000);
  window.addEventListener("focus", silentSyncRentals);
  window.addEventListener("bias:data-mutated", () => {
    fetchRentals(true);
    hydrateRentalLookups();
  });
});

onUnmounted(() => {
  if (rentalPollTimer) clearInterval(rentalPollTimer);
  window.removeEventListener("focus", silentSyncRentals);
  window.removeEventListener("bias:data-mutated", silentSyncRentals);
});

onActivated(() => {
  if (skipNextRentalActivate) {
    skipNextRentalActivate = false;
    return;
  }
  fetchRentals();
});
async function exportToExcel() {
  const XLSX = await import("xlsx");
  const exportData = filteredRentals.value.map((j: any, index: number) => ({
    'No': index + 1,
    'Rental No': j.rental_no || '-',
    'Company': j.customer?.company_name || j.customer?.name || '-',
    'PIC Name': j.customer?.pic_name || '-',
    'Start Date': j.start_date ? new Date(j.start_date).toLocaleDateString('en-GB') : '-',
    'End Date': j.end_date ? new Date(j.end_date).toLocaleDateString('en-GB') : '-',
    'Total': j.total || 0,
    'Status': j.status || '-'
  }))
  if (!exportData.length) {
    toast.error('No data to export')
    return
  }
  const ws = XLSX.utils.json_to_sheet(exportData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Rentals")
  XLSX.writeFile(wb, `Rentals_${Date.now()}.xlsx`)
}

async function exportToPdf() {
  const { default: html2pdf } = await import("html2pdf.js");
  const exportData = filteredRentals.value.map((j: any, index: number) => ({
    'No': index + 1,
    'Rental No': j.rental_no || '-',
    'Company': j.customer?.company_name || j.customer?.name || '-',
    'PIC Name': j.customer?.pic_name || '-',
    'Start Date': j.start_date ? new Date(j.start_date).toLocaleDateString('en-GB') : '-',
    'End Date': j.end_date ? new Date(j.end_date).toLocaleDateString('en-GB') : '-',
    'Total': (j.total || 0).toLocaleString('id-ID'),
    'Status': String(j.status || '-').toUpperCase()
  }))
  if (!exportData.length) {
    toast.error('No data to export')
    return
  }
  
  let html = '<h2 style="font-family: sans-serif; text-align: center;">Rentals Report</h2><table border="1" cellpadding="8" cellspacing="0" style="width:100%; border-collapse: collapse; font-family: sans-serif; font-size: 11px; text-align: center;">'
  html += '<thead><tr style="background-color: #5b9bd5; color: white;">'
  const keys = Object.keys(exportData[0]!)
  keys.forEach(k => html += `<th>${k}</th>`)
  html += '</tr></thead><tbody>'
  exportData.forEach(row => {
    html += '<tr>'
    keys.forEach(k => html += `<td>${(row as any)[k]}</td>`)
    html += '</tr>'
  })
  html += '</tbody></table>'

  const wrapper = document.createElement('div')
  wrapper.innerHTML = html

  const opt = {
    margin: 0.5,
    filename: `Rentals_Report_${Date.now()}.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'landscape' as const }
  }
  html2pdf().set(opt).from(wrapper).save()
}
</script>

<template>
  <div>
    <PageHeader
      :title="t('rentals.title')"
      :button-label="t('rentals.create_new')"
      permission="rental:create"
      @add="openAdd"
    >
      <template #actions>
        <div style="display: flex; gap: 10px; align-items: center;">
          <CustomSelect v-model="filterCustomer" :options="customerOptions" placeholder="Filter by Customer" style="min-width: 200px;" />
          <button class="btn btn-outline" @click="exportToPdf" style="display: flex; align-items: center; gap: 6px;">
            Export PDF
          </button>
          <button class="btn btn-outline" @click="exportToExcel" style="display: flex; align-items: center; gap: 6px;">
            Export Excel
          </button>
        </div>
      </template>
    </PageHeader>

    <DataTable
      :columns="columns"
      :data="filteredRentals"
      :loading="isLoadingRentals"
      permission="rental"
      :show-hard-delete="hardDelete.isSuperadmin"
      :search-placeholder="t('rentals.search')"
      @edit="openEdit"
      @delete="handleConfirmDeleteRental"
      @hard-delete="hardDelete.open"
    >
      <template #cell-rental_no="{ row, value }">
        <a
          href="#"
          @click.prevent="openRentalDetail(row)"
          style="color: var(--color-primary); text-decoration: underline; font-weight: 500;"
        >
          {{ value || '-' }}
        </a>
      </template>
      <template #cell-company="{ row }">
        {{
          findCustomer(row.customer_id)?.company_name ||
          findCustomer(row.customer_id)?.name ||
          row.customer?.company_name ||
          row.customer?.name ||
          "-"
        }}
      </template>
      <template #cell-pic_name="{ row }">
        {{
          findCustomer(row.customer_id)?.pic_name ||
          row.customer?.pic_name ||
          "-"
        }}
      </template>
      <template #cell-start_date="{ value }">{{
        value ? new Date(value).toLocaleDateString("en-GB") : '-'
      }}</template>
      <template #cell-end_date="{ value }">{{
        value ? new Date(value).toLocaleDateString("en-GB") : '-'
      }}</template>
      <template #cell-total="{ value }">{{ formatRupiah(value) }}</template>
      <template #cell-do_number="{ row }">
        <span v-if="hasActiveRentalDO(row)" class="badge badge-info" style="font-family: monospace; font-size: 0.78rem;">
          {{ getRentalDONumber(row) }}
        </span>
        <span v-else class="text-muted" style="font-size: 0.78rem; font-style: italic;">
          No DO
        </span>
      </template>
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
      <template #actions="{ row }">
        <div style="display: flex; align-items: center; gap: 6px;">
          <button
            v-if="!hasActiveRentalDO(row) && can('rental:update')"
            class="action-btn action-btn--edit"
            title="Buat Surat Jalan (DO)"
            @click.stop="openCreateRentalDOModal(row)"
            style="color: #e67e22; width: 32px; height: 32px;"
          >
            <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="1" y="3" width="15" height="13"></rect>
              <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
              <circle cx="5.5" cy="18.5" r="2.5"></circle>
              <circle cx="18.5" cy="18.5" r="2.5"></circle>
            </svg>
          </button>
          <button
            v-if="can('rental:delete')"
            class="action-btn action-btn--delete"
            title="Delete Rental"
            @click.stop="openDeleteRentalModal(row)"
            style="width: 32px; height: 32px;"
          >
            <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
          <button
            v-if="hardDelete.isSuperadmin"
            class="action-btn action-btn--hard"
            title="Hapus permanen dari database (superadmin)"
            @click.stop="hardDelete.open(row)"
            style="width: 32px; height: 32px;"
          >
            <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"></path>
            </svg>
          </button>
        </div>
      </template>
    </DataTable>

    <HardDeleteDialog
      :open="hardDelete.show"
      title="Hapus Permanen Rental"
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

    <!-- Modal Hapus Rental (Standar Keuangan) -->
    <FormModal
      :open="showDeleteRentalModal"
      title="Hapus Rental (Standar Kepatuhan Keuangan)"
      max-width="580px"
      @close="showDeleteRentalModal = false"
    >
      <div v-if="deletingRental" class="delete-rental-modal">
        <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
          <div style="font-weight: 600; color: #dc2626; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
            ⚠️ Perhatian Standar Keuangan
          </div>
          <div style="font-size: 0.88em; color: var(--color-text-secondary); line-height: 1.5;">
            Sistem tidak mengizinkan fitur edit data transaksi rental untuk menjaga kepatuhan dan integritas audit keuangan. Menghapus rental ini akan <strong>otomatis menghapus seluruh invoice terkait beserta riwayat pembayaran dan meter details</strong>, melepaskan unit yang disewa kembali ke status <strong>available</strong>, serta membersihkan kontrak otomatis terkait. Nomor kontrak setelahnya akan mengisi nomor kontrak yang dihapus agar selalu berurutan tanpa loncat.
          </div>
        </div>

        <div style="background: var(--color-surface-sunken); border: 1px solid var(--color-border); border-radius: 8px; padding: 14px; margin-bottom: 16px; font-size: 0.9em; display: grid; gap: 8px;">
          <div>
            <span style="color: var(--color-text-secondary);">No. Rental:</span>
            <strong style="margin-left: 8px; color: var(--color-primary);">{{ deletingRental.rental_no }}</strong>
          </div>
          <div>
            <span style="color: var(--color-text-secondary);">No. Kontrak:</span>
            <span style="margin-left: 8px; font-weight: 500;">{{ deletingRental.contract?.contract_no || deletingRental.contract_no || '-' }}</span>
          </div>
          <div>
            <span style="color: var(--color-text-secondary);">Customer:</span>
            <span style="margin-left: 8px; font-weight: 500;">{{ deletingRental.company || deletingRental.customer?.company_name || '-' }}</span>
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label" style="font-weight: 600;">
            Alasan Penghapusan <span style="color: #dc2626;">*</span>
          </label>
          <textarea
            v-model="rentalDeleteReason"
            class="form-input"
            rows="3"
            placeholder="Wajib diisi, contoh: Salah pemilihan customer / transaksi sewa dibatalkan klien"
            required
            style="resize: vertical;"
          ></textarea>
        </div>

        <div class="form-group" style="margin-bottom: 20px;">
          <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; font-size: 0.9em; color: var(--color-text);">
            <input
              type="checkbox"
              v-model="rentalConfirmAgree"
              style="margin-top: 3px;"
            />
            <span>
              Saya menyetujui untuk menghapus data <strong>{{ deletingRental.rental_no }}</strong> dan contract <strong>{{ deletingRental.contract?.contract_no || deletingRental.contract_no || '-' }}</strong> beserta seluruh invoice terkait, dan memahami bahwa persetujuan ini akan otomatis dicatat dalam log audit keuangan.
            </span>
          </label>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button
            type="button"
            class="btn btn-secondary"
            @click="showDeleteRentalModal = false"
            :disabled="isDeletingRental"
          >
            Batal
          </button>
          <button
            type="button"
            class="btn btn-danger"
            @click="handleConfirmDeleteRental"
            :disabled="!rentalDeleteReason.trim() || !rentalConfirmAgree || isDeletingRental"
            style="background: #dc2626; color: white;"
          >
            <span v-if="isDeletingRental">Menghapus...</span>
            <span v-else>Setujui & Hapus Rental</span>
          </button>
        </div>
      </div>
    </FormModal>

    <!-- Modal Detail Rental Items -->
    <FormModal
      :open="showDetailModal"
      :title="`Rental Detail - ${detailRental?.rental_no || ''}`"
      max-width="800px"
      @close="showDetailModal = false; detailRental = null;"
    >
      <div v-if="detailRental">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 1rem; padding: 12px; background: var(--color-surface-hover); border-radius: 8px;">
          <div>
            <p style="margin: 0; font-size: 0.9em; color: var(--color-text-secondary);">Customer:</p>
            <p style="margin: 0 0 10px 0; font-weight: 500;">
              {{
                customers.find((c: any) => c.id === detailRental.customer_id)?.company_name ||
                customers.find((c: any) => c.id === detailRental.customer_id)?.name ||
                detailRental.customer?.company_name ||
                detailRental.customer?.name ||
                "-"
              }}
            </p>
            <p style="margin: 0; font-size: 0.9em; color: var(--color-text-secondary);">Period:</p>
            <p style="margin: 0 0 10px 0; font-weight: 500;">
              {{ detailRental.start_date ? new Date(detailRental.start_date).toLocaleDateString("en-GB") : '-' }} - 
              {{ detailRental.end_date ? new Date(detailRental.end_date).toLocaleDateString("en-GB") : '-' }}
              ({{ detailRental.duration_months }} months)
            </p>
            <p style="margin: 0; font-size: 0.9em; color: var(--color-text-secondary);">Status:</p>
            <p style="margin: 0; font-weight: 500;">
              <span class="status-badge" :class="'status-' + (detailRental.status || 'unknown').toLowerCase()">
                {{ detailRental.status || "-" }}
              </span>
            </p>
          </div>
          <div>
            <p v-if="detailRental.po_no" style="margin: 0; font-size: 0.9em; color: var(--color-text-secondary);">PO No:</p>
            <p v-if="detailRental.po_no" style="margin: 0 0 10px 0; font-weight: 500;">{{ detailRental.po_no }}</p>
            
            <p v-if="detailRental.installation_address" style="margin: 0; font-size: 0.9em; color: var(--color-text-secondary);">Installation Address:</p>
            <p v-if="detailRental.installation_address" style="margin: 0 0 10px 0; font-weight: 500; font-size: 0.95em;">{{ detailRental.installation_address }}</p>
            
            <p v-if="detailRental.notes" style="margin: 0; font-size: 0.9em; color: var(--color-text-secondary);">Notes:</p>
            <p v-if="detailRental.notes" style="margin: 0; font-weight: 500; font-size: 0.95em; white-space: pre-wrap;">{{ detailRental.notes }}</p>
          </div>
        </div>
        
        <h4 style="margin: 1rem 0 0.5rem; font-size: 1rem; color: var(--color-primary);">Rented Items</h4>
        <div v-if="!detailRental.rental_items || detailRental.rental_items.length === 0" style="padding: 1rem; text-align: center; color: var(--color-text-secondary); background: var(--color-surface-sunken); border-radius: 8px;">
          No items found.
        </div>
        <div v-else style="display: grid; gap: 10px;">
          <div v-for="(item, idx) in detailRental.rental_items" :key="idx" style="padding: 12px; background: var(--color-surface-sunken); border: 1px solid var(--color-border); border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
              <div>
                <strong style="font-size: 1.05em; display: block; color: var(--color-text);">
                  <span v-if="item.unit || findUnit(item.unit_id)">Unit: {{ formatUnitDisplayName(item.unit || findUnit(item.unit_id)) }} (S/N: {{ (item.unit || findUnit(item.unit_id))?.serial_no || '-' }})</span>
                  <span v-else-if="item.product || findProduct(item.product_id)">Consumable / Sparepart: {{ formatProductDisplayName(item.product || findProduct(item.product_id)) }}</span>
                  <span v-else>Item (Unknown)</span>
                </strong>
                <span v-if="item.placement_location" style="font-size: 0.85em; color: var(--color-text-secondary); display: inline-block; margin-top: 4px; padding: 2px 6px; background: var(--color-surface); border-radius: 4px; border: 1px solid var(--color-border-light);">
                  📍 {{ item.placement_location }}
                </span>
              </div>
              <div style="text-align: right;">
                <div style="font-weight: 500; color: var(--color-primary);">Qty: {{ item.qty }}</div>
                <div v-if="canSeeAmount" style="font-size: 0.9em; color: var(--color-text-secondary);">{{ formatRupiah(item.monthly_rent) }} / mo</div>
              </div>
            </div>
            
            <div style="display: flex; gap: 24px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--color-border-light);">
              <div v-if="item.start_meter_bw > 0 || item.start_meter_color > 0">
                <span style="font-size: 0.85em; color: var(--color-text-secondary); display: block; margin-bottom: 2px;">Starting Meter</span>
                <div style="font-size: 0.9em; font-weight: 500;">
                  <span v-if="item.start_meter_bw > 0">BW: {{ item.start_meter_bw.toLocaleString('id-ID') }}</span>
                  <span v-if="item.start_meter_bw > 0 && item.start_meter_color > 0"> | </span>
                  <span v-if="item.start_meter_color > 0">Color: {{ item.start_meter_color.toLocaleString('id-ID') }}</span>
                </div>
              </div>
              <div v-if="item.free_quota_bw > 0 || item.free_quota_color > 0">
                <span style="font-size: 0.85em; color: var(--color-text-secondary); display: block; margin-bottom: 2px;">Free Quota (mo)</span>
                <div style="font-size: 0.9em; font-weight: 500;">
                  <span v-if="item.free_quota_bw > 0">BW: {{ item.free_quota_bw.toLocaleString('id-ID') }}</span>
                  <span v-if="item.free_quota_bw > 0 && item.free_quota_color > 0"> | </span>
                  <span v-if="item.free_quota_color > 0">Color: {{ item.free_quota_color.toLocaleString('id-ID') }}</span>
                </div>
              </div>
            </div>

            <div v-if="item.rates && item.rates.length > 0" style="margin-top: 12px; padding: 8px; background: var(--color-surface); border-radius: 6px; border: 1px solid var(--color-border-light);">
              <span style="font-size: 0.85em; font-weight: 600; color: var(--color-text-secondary); display: block; margin-bottom: 4px; text-transform: uppercase;">Rates</span>
              <div style="display: grid; gap: 4px;">
                <div v-for="rate in item.rates" :key="rate.id" style="font-size: 0.85em; display: flex; justify-content: space-between;">
                  <span>{{ rate.paper_size?.name || 'Any Size' }} ({{ rate.paper_type?.name || 'Any Type' }})</span>
                  <span style="font-weight: 500;">
                    <span v-if="rate.rate_per_page_bw > 0">BW: {{ formatRupiah(rate.rate_per_page_bw) }}</span>
                    <span v-if="rate.rate_per_page_bw > 0 && rate.rate_per_page_color > 0"> | </span>
                    <span v-if="rate.rate_per_page_color > 0">Color: {{ formatRupiah(rate.rate_per_page_color) }}</span>
                  </span>
                </div>
              </div>
            </div>
            
            <div v-if="item.description" style="font-size: 0.9em; color: var(--color-text-secondary); margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--color-border-light);">
              <strong style="display: block; font-size: 0.9em; margin-bottom: 4px;">Description / Specs:</strong>
              <div style="white-space: pre-wrap;">{{ item.description }}</div>
            </div>
          </div>
        </div>

        <div v-if="canSeeAmount" style="margin-top: 1rem; padding: 16px; background: var(--color-surface-hover); border-radius: 8px;">
          <div style="display: flex; justify-content: flex-end; gap: 32px; font-size: 0.95em;">
            <div style="text-align: right;">
              <div style="color: var(--color-text-secondary); margin-bottom: 4px;">Subtotal</div>
              <div style="color: var(--color-text-secondary); margin-bottom: 4px;">Tax (11%)</div>
              <div v-if="detailRental.deposit > 0" style="color: var(--color-text-secondary); margin-bottom: 4px;">Deposit</div>
              <div style="font-weight: 600; color: var(--color-text); margin-top: 8px; font-size: 1.1em;">Total / Month</div>
            </div>
            <div style="text-align: right; font-weight: 500;">
              <div style="margin-bottom: 4px;">{{ formatRupiah(detailRental.subtotal) }}</div>
              <div style="margin-bottom: 4px;">{{ formatRupiah(detailRental.tax) }}</div>
              <div v-if="detailRental.deposit > 0" style="margin-bottom: 4px;">{{ formatRupiah(detailRental.deposit) }}</div>
              <div style="color: var(--color-primary); margin-top: 8px; font-size: 1.1em; font-weight: 700;">{{ formatRupiah(detailRental.total) }}</div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <button
          v-if="can('rental:update') && detailRental && !hasActiveRentalDO(detailRental)"
          type="button"
          class="btn btn-warning"
          style="background: #e67e22; color: #fff;"
          @click="openCreateRentalDOModal(detailRental)"
        >
          🚚 Buat Surat Jalan (DO)
        </button>
        <button
          v-else-if="detailRental && hasActiveRentalDO(detailRental)"
          type="button"
          class="btn btn-outline"
          disabled
        >
          ✅ DO: {{ getRentalDONumber(detailRental) }}
        </button>
        <button
          v-if="can('rental:update') && detailRental"
          type="button"
          class="btn btn-primary"
          @click="showDetailModal = false; openEdit(detailRental)"
        >
          Edit Rental
        </button>
        <button type="button" class="btn btn-outline" @click="showDetailModal = false">Close</button>
      </template>
    </FormModal>

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
            <!-- Approval dimatikan: badge menunggu approval dihapus, payment langsung approved. -->
            <span
              v-if="isWaitingMeterReport(invoice)"
              class="badge badge-warning"
              title="Tombol Payment muncul setelah teknisi mengisi copier service report"
            >
              Menunggu teknisi isi copier report
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
              v-if="
                invoice.payment_status !== 'paid' &&
                !isWaitingMeterReport(invoice) &&
                can('payment:create')
              "
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
        <CustomSelect v-model="paymentForm.payment_method" :options="rentPaymentMethodOptions" class="form-select" />
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
      :title="editingRental ? ('Edit Rental - ' + (editingRental.rental_no || '')) : t('rentals.modal_title')"
      :submit-label="editingRental ? 'Simpan Perubahan' : undefined"
      @close="showModal = false"
      @submit="handleSubmit"
    >
      <div class="form-group">
        <label for="rent-customer" class="form-label">{{
          t("rentals.customer_label")
        }}</label>
        <CustomSelect
          id="rent-customer"
          v-model="form.customer_id"
          :options="rentCustomerOptions"
          :placeholder="t('rentals.customer_select')"
          class="form-select"
        />
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

      <div class="form-group" style="margin-bottom: var(--space-md)">
        <label class="form-label" style="display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" v-model="form.is_new" />
          isNew (rental baru)
        </label>
      </div>

      <div v-if="!form.is_new" class="form-group" style="margin-bottom: var(--space-md)">
        <label class="form-label">Assign Teknisi (draft visit copier)</label>
        <CustomSelect v-model="form.technician_id" :options="technicianOptions" placeholder="-- Pilih Teknisi (Opsional) --" />
        <p style="font-size: 0.75rem; color: var(--color-text-muted); margin-top: 4px;">
          Untuk rental yang sudah berjalan sebelum sistem: assign teknisi langsung ke draft visit copier.
        </p>
      </div>

      <div class="form-section-title">
        Rented Machines & Initial Meter Input
      </div>

      <div
        v-for="(item, idx) in rentalItems"
        :key="idx"
        class="rental-item-box"
      >
        <div class="form-group" style="margin-bottom: var(--space-md)">
          <label class="form-label">Sumber Item</label>
          <select
            v-model="item.create_mode"
            class="form-input"
            @change="onItemModeChange(item)"
          >
            <option value="existing">Pilih existing (Produk)</option>
            <option value="unit">Input Produk baru</option>
          </select>
        </div>

        <div
          v-if="item.create_mode === 'existing'"
          class="form-group"
          style="margin-bottom: var(--space-md)"
        >
          <label class="form-label">Select Item (Unit / Mesin or Consumable / Sparepart)</label>
          <CustomSelect
            v-model="item.selected_item"
            :options="rentUnitOptions"
            placeholder="-- Select Unit or Consumable / Sparepart --"
            class="form-select"
            @update:modelValue="onItemSelectChange(item)"
          />
        </div>

        <div
          v-if="item.create_mode === 'unit'"
          style="margin-bottom: var(--space-md); padding: 10px; border: 1px dashed var(--color-border-light); border-radius: 8px;"
        >
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Brand</label>
              <select v-model="item.new_unit.brand_id" class="form-input" required>
                <option value="">-- Brand --</option>
                <option
                  v-for="b in (brands as any)"
                  :key="b.id"
                  :value="b.id"
                >
                  {{ b.name }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Tipe Unit</label>
              <select v-model="item.new_unit.type_id" class="form-input" required>
                <option value="">-- Tipe --</option>
                <option
                  v-for="t in (unitTypes as any)"
                  :key="t.id"
                  :value="t.id"
                >
                  {{ t.name }}
                </option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Model</label>
              <input
                v-model="item.new_unit.model"
                type="text"
                class="form-input"
                required
              />
            </div>
            <div class="form-group">
              <label class="form-label">Serial No (SN)</label>
              <input
                v-model="item.new_unit.serial_no"
                @input="item.new_unit.serial_no = ($event.target as HTMLInputElement).value.toUpperCase()"
                type="text"
                class="form-input"
                required
                style="text-transform: uppercase;"
              />
            </div>
          </div>
          <div class="form-group" style="margin-bottom: var(--space-md)">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input
                v-model="item.new_unit.is_copier"
                type="checkbox"
                @change="syncNewUnitMeter(item)"
              />
              <span>Copier Machine (perlu meter awal)</span>
            </label>
          </div>
          <div
            v-if="item.new_unit.is_copier"
            class="form-row"
          >
            <div class="form-group">
              <label class="form-label">Current Meter BW</label>
              <input
                v-model.number="item.new_unit.current_meter_bw"
                type="number"
                class="form-input"
                min="0"
              />
            </div>
            <div class="form-group">
              <label class="form-label">Current Meter Color</label>
              <input
                v-model.number="item.new_unit.current_meter_color"
                type="number"
                class="form-input"
                min="0"
              />
            </div>
          </div>
        </div>

        <div
          v-if="item.create_mode === 'product'"
          style="margin-bottom: var(--space-md); padding: 10px; border: 1px dashed var(--color-border-light); border-radius: 8px;"
        >
          <div class="form-group">
            <label class="form-label">Nama Produk</label>
            <input
              v-model="item.new_product.name"
              type="text"
              class="form-input"
              required
            />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Kategori</label>
              <select
                v-model="item.new_product.category_id"
                class="form-input"
                required
              >
                <option value="">-- Kategori --</option>
                <option
                  v-for="c in productCategories"
                  :key="c.id"
                  :value="c.id"
                >
                  {{ c.name }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Harga</label>
              <input
                v-model.number="item.new_product.price"
                type="number"
                class="form-input"
                min="0"
                required
              />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Stok</label>
              <input
                v-model.number="item.new_product.stock"
                type="number"
                class="form-input"
                min="0"
                required
              />
            </div>
            <div class="form-group">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 24px;">
                <input
                  v-model="item.new_product.is_computer"
                  type="checkbox"
                  @change="item.is_computer = item.new_product.is_computer"
                />
                <span>Computer</span>
              </label>
            </div>
          </div>
        </div>

        <div
          v-if="!item.selected_item.startsWith('prod_')"
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
                  <CustomSelect
                    v-model="rate.paper_size_id"
                    :options="rentPaperSizeOptions"
                    class="form-select"
                    style="font-size: 0.8rem"
                  />
                </div>
                <div class="form-group" style="margin: 0">
                  <label class="form-label"
                    >Jenis Kertas
                    <span class="text-muted">(opsional)</span></label
                  >
                  <CustomSelect
                    v-model="rate.paper_type_id"
                    :options="rentPaperTypeOptions"
                    placeholder="— Semua jenis —"
                    class="form-select"
                    style="font-size: 0.8rem"
                  />
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
                  <CustomSelect
                    v-model="rate.quota_applies_to"
                    :options="rentQuotaAppliesToOptions"
                    class="form-select"
                    style="font-size: 0.8rem"
                    title="Free quota applies to"
                  />
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
        @click="addRentalItem()"
      >
        + Add Another Machine
      </button>
      <button
        type="button"
        class="btn btn-outline btn-sm mb-4"
        style="margin-left: 8px"
        @click="addRentalItem('unit')"
      >
        + Add New Machine (isNew)
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

    <!-- Modal Buat Surat Jalan (DO) untuk Rental -->
    <FormModal
      :open="showCreateDOModal"
      title="Buat Surat Jalan (DO) Pengantaran Rental"
      max-width="640px"
      :submit-label="isSubmittingDO ? 'Membuat DO...' : 'Buat Surat Jalan (DO)'"
      :is-loading="isSubmittingDO"
      @close="showCreateDOModal = false; targetRentalForDO = null;"
      @submit="submitCreateRentalDO"
    >
      <div v-if="targetRentalForDO">
        <div style="background: var(--color-surface-sunken); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--color-border-light);">
          <div style="font-weight: 600; color: var(--color-primary); margin-bottom: 4px;">
            {{ targetRentalForDO.rental_no }} — {{ findCustomer(targetRentalForDO.customer_id)?.company_name || targetRentalForDO.customer?.company_name || 'Customer' }}
          </div>
          <div style="font-size: 0.85rem; color: var(--color-text-muted);">
            Periode: {{ targetRentalForDO.start_date ? new Date(targetRentalForDO.start_date).toLocaleDateString("en-GB") : '-' }} s/d {{ targetRentalForDO.end_date ? new Date(targetRentalForDO.end_date).toLocaleDateString("en-GB") : '-' }}
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 12px;">
          <label class="form-label">Nomor DO (Opsional - Kosongkan untuk Auto-Generate)</label>
          <input
            v-model="doForm.do_number"
            type="text"
            class="form-input"
            placeholder="Contoh: Bi/DO/0001/X-2026 (kosongkan jika otomatis)"
          />
        </div>

        <div class="form-group" style="margin-bottom: 12px;">
          <label class="form-label">Project Name</label>
          <input
            v-model="doForm.project_name"
            type="text"
            class="form-input"
            placeholder="Pengantaran [Nama Produk/Unit] ke [Alamat Penerima]"
          />
          <span class="form-hint" style="font-size: 0.8rem; color: var(--color-text-muted);">Otomatis: Pengantaran Nama Unit ke Alamat Penerima.</span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div class="form-group">
            <label class="form-label">Tanggal Pengantaran <span class="text-danger">*</span></label>
            <input
              v-model="doForm.delivery_date"
              type="date"
              class="form-input"
              required
            />
          </div>
          <div class="form-group">
            <label class="form-label">No. HP Penerima / PIC</label>
            <input
              v-model="doForm.recipient_phone"
              type="text"
              class="form-input"
              placeholder="08xx..."
            />
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 12px;">
          <label class="form-label">Nama Penerima / PIC</label>
          <input
            v-model="doForm.recipient_name"
            type="text"
            class="form-input"
            placeholder="Nama Penerima Unit"
          />
        </div>

        <div class="form-group" style="margin-bottom: 12px;">
          <label class="form-label">Alamat Pengantaran / Lokasi Instalasi <span class="text-danger">*</span></label>
          <textarea
            v-model="doForm.delivery_address"
            class="form-textarea"
            rows="2"
            placeholder="Alamat lengkap tujuan instalasi mesin..."
            required
          ></textarea>
        </div>

        <div class="form-group" style="margin-bottom: 12px;">
          <label class="form-label">Teknisi Pengantar (Opsional)</label>
          <CustomSelect
            v-model="doForm.technician_id"
            :options="technicianOptions"
            class="form-select"
          />
        </div>

        <div class="form-group" style="margin-bottom: 12px;">
          <label class="form-label">Catatan Pengantaran</label>
          <input
            v-model="doForm.notes"
            type="text"
            class="form-input"
            placeholder="Catatan tambahan (opsional)"
          />
        </div>

        <!-- Rented Units to Deliver Preview -->
        <div v-if="targetRentalForDO.rental_items?.length" class="form-group">
          <label class="form-label" style="font-weight: 600;">Unit / Barang yang Akan Diantar ({{ targetRentalForDO.rental_items.length }})</label>
          <div style="max-height: 140px; overflow-y: auto; border: 1px solid var(--color-border); border-radius: 6px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
              <thead>
                <tr style="background: var(--color-surface-sunken); text-align: left;">
                  <th style="padding: 6px 10px;">Item / Unit</th>
                  <th style="padding: 6px 10px; text-align: center;">Qty</th>
                  <th style="padding: 6px 10px;">Lokasi / Penempatan</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(it, i) in targetRentalForDO.rental_items" :key="i" style="border-top: 1px solid var(--color-border-light);">
                  <td style="padding: 6px 10px;">
                    <span v-if="it.unit || findUnit(it.unit_id)">{{ formatUnitDisplayName(it.unit || findUnit(it.unit_id)) }} (SN: {{ (it.unit || findUnit(it.unit_id))?.serial_no || '-' }})</span>
                    <span v-else-if="it.product || findProduct(it.product_id)">{{ formatProductDisplayName(it.product || findProduct(it.product_id)) }}</span>
                    <span v-else>Item</span>
                  </td>
                  <td style="padding: 6px 10px; text-align: center;">{{ it.qty || 1 }}</td>
                  <td style="padding: 6px 10px; color: var(--color-text-muted);">{{ it.placement_location || '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
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
