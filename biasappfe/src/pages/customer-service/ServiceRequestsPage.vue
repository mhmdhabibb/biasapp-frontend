<script setup lang="ts">
import DataTable from "@/components/ui/DataTable.vue";
import CustomSelect from "@/components/ui/CustomSelect.vue";
import FormModal from "@/components/ui/FormModal.vue";
import PageHeader from "@/components/ui/PageHeader.vue";
import { useMasterStore } from "@/composables/useMasterStore";
import { usePermission } from "@/composables/usePermission";
import { useToast } from "@/composables/useToast";
import { api, apiRequest } from "@/services/api";
import { isCopierReport } from "@/utils/copierReport";
import type { TableColumn } from "@/types";
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";

const toast = useToast();
const { can } = usePermission();
const route = useRoute()
const { ensureResourcesLoaded } = useMasterStore()
const { customers, units, products, sales, brands, findProduct, findUnit, findCustomer, getUnitsByCustomer, getContractsByCustomer, deliveryOrders, formatUnitDisplayName, formatProductDisplayName } =
  useMasterStore();

const columns: TableColumn[] = [
  { key: "request_no", label: "Request No" },
  { key: "_company_name", label: "Company" },
  { key: "_pic_name", label: "PIC Name" },
  { key: "request_date", label: "Request Date" },
  { key: "status", label: "Status" },
];

const externalColumns: TableColumn[] = [
  { key: "request_no", label: "Request No" },
  { key: "_company_name", label: "Company" },
  { key: "_external_unit", label: "Unit Luar" },
  { key: "request_date", label: "Request Date" },
  { key: "status", label: "Status" },
];

const serviceRequests = ref<any[]>([]);
const showModal = ref(false);
const listTab = ref<"internal" | "external">("internal");
const formTab = ref<"internal" | "external">("internal");

const tableColumns = computed(() =>
  listTab.value === "internal" ? columns : externalColumns,
);
const showRequestDetailModal = ref(false);
const selectedRequest = ref<any>(null);
const isLoading = ref(false);
const rentalsData = ref<any[]>([]);
const warrantiesData = ref<any[]>([]);

const { jobOrders, serviceReports, technicians } = useMasterStore();

const customerOptions = computed(() =>
  (customers.value as any[]).map((c: any) => ({
    value: c.id,
    label: `${c.company_name || c.name}${c.pic_name ? " - PIC: " + c.pic_name : ""}`,
  })),
);

const EXTERNAL_BRAND_OTHER = "__other__";

const brandOptions = computed(() =>
  (brands.value as any[]).map((b: any) => ({
    value: b.name,
    label: b.name,
  })),
);

const brandSelectOptions = computed(() => [
  ...brandOptions.value,
  {
    value: EXTERNAL_BRAND_OTHER,
    label: "Lainnya — brand di luar daftar",
  },
]);

const externalBrandSelect = ref<string | null>(null);

const externalTypeOptions = [
  { value: "legacy_rental", label: "Rental yang sudah berjalan sebelum ada sistem" },
  { value: "external_purchase", label: "Unit dibeli dari toko lain (service di tempat kita)" },
];

const externalTypeFilter = ref<string>("all");
const productSourceFilter = ref<string>("all");

const isExternalBrandOther = computed(
  () => externalBrandSelect.value === EXTERNAL_BRAND_OTHER,
);

const technicianOptions = computed(() =>
  (technicians.value as any[]).map((t: any) => ({
    value: t.id,
    label: t.name,
  })),
);

// Check if a unit, product, or sale item is still under warranty for a given customer
function getWarrantyStatus(
  customerId: string,
  unitId?: string | null,
  productId?: string | null,
  saleId?: string | number | null,
): { active: boolean; endDate?: string } {
  const today = new Date();
  const match = warrantiesData.value.find((w) => {
    if (w.customer_id !== customerId) return false;
    if (unitId && w.unit_id === unitId) return true;
    if (productId && w.product_id === productId) return true;
    if (
      saleId != null &&
      w.sale_id != null &&
      String(w.sale_id) === String(saleId)
    )
      return true;
    return false;
  });
  if (!match) return { active: false };
  const end = new Date(match.end_date);
  return {
    active:
      end >= today && match.status !== "expired" && match.status !== "void",
    endDate: end.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
  };
}

const form = reactive({
  request_no: `REQ-${Date.now().toString().slice(-6)}`,
  customer_id: "",
  unit_ids: [] as string[],
  project_name: "",
  problem_description: "",
  request_date: new Date().toISOString().slice(0, 10),
  external_brand: "",
  external_model: "",
  external_serial_no: "",
  external_note: "",
  external_type: "legacy_rental",
});

watch(externalBrandSelect, (val) => {
  if (!val) {
    form.external_brand = "";
    return;
  }
  if (val !== EXTERNAL_BRAND_OTHER) {
    form.external_brand = String(val);
  } else {
    form.external_brand = "";
  }
});

const internalRequests = computed(() =>
  serviceRequests.value.filter((r: any) => !r.is_external),
);
const externalRequests = computed(() => {
  let list = serviceRequests.value.filter((r: any) => r.is_external);
  if (externalTypeFilter.value !== "all") {
    list = list.filter(
      (r: any) => (r.external_type || "legacy_rental") === externalTypeFilter.value,
    );
  }
  return list;
});
const displayedRequests = computed(() =>
  listTab.value === "internal" ? internalRequests.value : externalRequests.value,
);

const filteredCustomerRentalUnits = computed(() => {
  const list = customerRentalUnits.value;
  if (productSourceFilter.value === "all") return list;
  return list.filter((u: any) => {
    if (productSourceFilter.value === "unit") return u.itemType === "unit";
    if (productSourceFilter.value === "product") return u.itemType === "product";
    return u.source === productSourceFilter.value;
  });
});

const isEditing = ref(false);
const editId = ref<string | null>(null);

function newRequestNo(tab: "internal" | "external") {
  const suffix = Date.now().toString().slice(-6);
  return tab === "external" ? `REQ-EXT-${suffix}` : `REQ-${suffix}`;
}

function resetCreateForm(tab: "internal" | "external" = listTab.value) {
  formTab.value = tab;
  Object.assign(form, {
    request_no: newRequestNo(tab),
    customer_id: "",
    unit_ids: [],
    project_name: "",
    problem_description: "",
    request_date: new Date().toISOString().slice(0, 10),
    external_brand: "",
    external_model: "",
    external_serial_no: "",
    external_note: "",
    external_type: "legacy_rental",
  });
  externalBrandSelect.value = null;
}

watch(formTab, (tab) => {
  form.request_no = newRequestNo(tab);
  form.unit_ids = [];
});

function externalUnitLabel(row: any): string {
  if (!row?.is_external) return "-";
  const parts = [row.external_brand, row.external_model].filter(Boolean);
  const base = parts.length > 0 ? parts.join(" ") : "External Unit";
  return row.external_serial_no ? `${base} (SN: ${row.external_serial_no})` : base;
}

async function submitExternalRequest() {
  if (!form.customer_id || !form.problem_description) return;
  if (
    !form.external_brand &&
    !form.external_model &&
    !form.external_serial_no
  ) {
    toast.error("Isi minimal brand, model, atau serial number unit luar.");
    return;
  }
  isLoading.value = true;
  const payload = {
    request_no: form.request_no,
    customer_id: form.customer_id,
    unit_id: null,
    is_external: true,
    external_brand: form.external_brand,
    external_model: form.external_model,
    external_serial_no: form.external_serial_no,
    external_note: form.external_note,
    external_type: form.external_type,
    project_name: form.project_name,
    problem_description: form.problem_description,
    request_date: new Date(form.request_date).toISOString(),
  };
  try {
    await apiRequest({
      url: isEditing.value ? `/service-requests/${editId.value}` : "/service-requests",
      method: isEditing.value ? "PATCH" : "POST",
      data: payload,
    });
    toast.success("Service request (unit luar) berhasil dibuat!");
    showModal.value = false;
    listTab.value = "external";
    fetchRequests();
  } catch (error) {
    toast.error(toast.fromError(error, "A network error occurred."));
  } finally {
    isLoading.value = false;
  }
}

function handleModalSubmit() {
  if (formTab.value === "external") {
    submitExternalRequest();
  } else {
    handleSubmit();
  }
}

// Fetch all rentals to know which units are rented by which customer
async function fetchRentals() {
  try {
    const data = await api.get<any>("/rents?limit=200&order_by=created_at&order_dir=desc");
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    rentalsData.value = list;
  } catch (e) {
    console.warn("Could not fetch rentals for unit list", e);
  }
}

async function fetchWarranties() {
  try {
    const data = await api.get<{ data: any[] }>("/warranties");
    warrantiesData.value = data.data || [];
  } catch (e) {
    console.warn("Could not fetch warranties", e);
  }
}

// Get units rented, products purchased, and consumables/spareparts delivered for the selected customer
const customerRentalUnits = computed(() => {
  if (!form.customer_id) return [];

  const cid = String(form.customer_id);
  const unitMap = new Map<string, any>();

  // 1. From rental items (units rented + consumables/spareparts)
  for (const rental of rentalsData.value) {
    if (String(rental.customer_id) === cid && (rental.rental_items || rental.items)) {
      const rItems = rental.rental_items || rental.items || [];
      for (const item of rItems) {
        if (item.unit_id) {
          const u = item.unit || findUnit(item.unit_id);
          const fullName = u ? formatUnitDisplayName(u) : "Unit";
          const sn = u?.serial_no || "-";
          unitMap.set(String(item.unit_id), {
            id: item.unit_id,
            label: `[Unit/Mesin] ${fullName} (SN: ${sn})`.trim(),
            itemType: "unit",
            source: "rental",
            warranty: { active: false }, // rental units are company-owned, no customer warranty
          });
        }
        if (item.product_id) {
          const prod = item.product || findProduct(item.product_id);
          const pName = prod ? formatProductDisplayName(prod) : "Product";
          const warranty = getWarrantyStatus(
            form.customer_id,
            null,
            item.product_id,
            null,
          );
          unitMap.set("rent_prod_" + item.product_id, {
            id: item.product_id,
            label: `[Consumable/Sparepart] ${pName} (Qty: ${item.qty || 1})`,
            itemType: "product",
            source: "rental",
            warranty,
          });
        }
      }
    }
  }

  // 2. From sales (purchased machines & purchased consumables/spareparts)
  for (const sale of sales.value) {
    if (
      String((sale as any).customer_id) === cid &&
      ((sale as any).sale_items || (sale as any).items)
    ) {
      const sItems = (sale as any).sale_items || (sale as any).items || [];
      for (const si of sItems) {
        if (si.unit_id) {
          const key = String(si.unit_id);
          if (!unitMap.has(key)) {
            const u = si.unit || findUnit(si.unit_id);
            const warranty = getWarrantyStatus(
              form.customer_id,
              null,
              null,
              (sale as any).id,
            );
            const fullName = u ? formatUnitDisplayName(u) : "Unit";
            const sn = u?.serial_no || "-";
            unitMap.set(key, {
              id: key,
              label: `[Unit/Mesin] ${fullName} (SN: ${sn})`.trim(),
              itemType: "unit",
              source: "sale",
              warranty,
            });
          }
        }
        if (si.product_id) {
          const prod = findProduct(si.product_id);
          const key = "sale_prod_" + si.product_id;
          if (!unitMap.has(key)) {
            const warranty = getWarrantyStatus(
              form.customer_id,
              null,
              si.product_id,
              (sale as any).id,
            );
            const pName = prod ? formatProductDisplayName(prod) : ("Product ID: " + si.product_id);
            unitMap.set(key, {
              id: si.product_id,
              label: `[Consumable/Sparepart] ${pName} (Qty: ${si.qty || 1})`,
              itemType: "product",
              source: "sale",
              warranty,
            });
          }
        }
      }
    }
  }

  // 3. From delivery orders (delivered machines and consumables/spareparts for this customer)
  for (const delivery of (deliveryOrders.value as any[])) {
    if (String(delivery.customer_id) === cid && delivery.delivery_order_items) {
      for (const item of delivery.delivery_order_items) {
        if (item.unit_id) {
          const key = String(item.unit_id);
          if (!unitMap.has(key)) {
            const u = item.unit || findUnit(item.unit_id);
            const fullName = u ? formatUnitDisplayName(u) : "Unit";
            const sn = u?.serial_no || "-";
            unitMap.set(key, {
              id: item.unit_id,
              label: `[Unit/Mesin] ${fullName} (SN: ${sn})`.trim(),
              itemType: "unit",
              source: "delivery",
              warranty: { active: false },
            });
          }
        }
        if (item.product_id) {
          const key = "do_prod_" + item.product_id;
          if (!unitMap.has(key)) {
            const prod = item.product || findProduct(item.product_id);
            unitMap.set(key, {
              id: item.product_id,
              label: `[Consumable/Sparepart] ${prod?.name || "Product ID: " + item.product_id} (Qty: ${item.qty || 1})`,
              itemType: "product",
              source: "delivery",
              warranty: { active: false },
            });
          }
        }
      }
    }
  }

  // 4. From contract items
  const contractUnits = getUnitsByCustomer(form.customer_id as any);
  for (const u of contractUnits) {
    const key = String(u.id);
    if (!unitMap.has(key)) {
      const brandName = (u as any).brand?.name || (u as any).brand || "";
      const modelName = (u as any).model || (u as any).name || "Unit";
      const sn = (u as any).serial_no || (u as any).serial_number || "-";
      unitMap.set(key, {
        id: u.id,
        label: `[Unit/Mesin] ${brandName} ${modelName} (SN: ${sn})`.trim(),
        itemType: "unit",
        source: "contract",
        warranty: { active: false }, // contract units are company-owned, no customer warranty
      });
    }
  }

  // 5. Also check units directly belonging to customer in store.units
  for (const u of (units.value || []) as any[]) {
    if (String(u.customer_id) === cid) {
      const key = String(u.id);
      if (!unitMap.has(key)) {
        const brandName = u.brand?.name || u.brand || "";
        const modelName = u.model || u.name || "Unit";
        const sn = u.serial_no || "-";
        unitMap.set(key, {
          id: u.id,
          label: `[Unit/Mesin] ${brandName} ${modelName} (SN: ${sn})`.trim(),
          itemType: "unit",
          source: "assigned",
          warranty: { active: false },
        });
      }
    }
  }

  // Tandai tiap barang: delivered boleh diajukan SR, sisanya tampil
  // dengan label "Belum Dikirim" (checkbox terkunci).
  return Array.from(unitMap.values()).map((u: any) => {
    const key = String(u.id);
    const isDeliveredByDO =
      deliveredItemIds.value.unitIds.has(key) ||
      deliveredItemIds.value.productIds.has(key);
    return {
      ...u,
      delivered: Boolean(isDeliveredByDO),
      doStatus: isDeliveredByDO
        ? "delivered"
        : deliveredItemIds.value.statusOf.get(key) || "belum dikirim",
    };
  });
});

// Reset unit selection when customer changes
watch(
  () => form.customer_id,
  () => {
    form.unit_ids = [];
  },
);

// Status DO yang dihitung sebagai "barang sudah dikirim": hanya delivered.
const DELIVERED_DO_STATUS = new Set(["delivered"]);

// ID unit/produk yang sudah dikirim (DO delivered) untuk customer terpilih,
// mengikuti aturan backend: langsung di DO items, atau via rental/sale/
// contract yang terhubung ke DO delivered.
const deliveredItemIds = computed(() => {
  const unitIds = new Set<string>();
  const productIds = new Set<string>();
  // Status DO per barang (untuk label "Belum Dikirim"), mencakup semua DO
  // customer (status apa pun). Status "delivered" selalu menang.
  const statusOf = new Map<string, string>();
  if (!form.customer_id) return { unitIds, productIds, statusOf };
  const cid = String(form.customer_id);

  const saleIds = new Set(
    sales.value
      .filter((s: any) => String(s.customer_id) === cid)
      .map((s: any) => String(s.id)),
  );
  const rentalIds = new Set(
    rentalsData.value
      .filter((r: any) => String(r.customer_id) === cid)
      .map((r: any) => String(r.id)),
  );
  const contractIds = new Set(
    getContractsByCustomer(form.customer_id).map((c: any) =>
      String(c.contract_id || c.id),
    ),
  );

  const markStatus = (id: unknown, status: string) => {
    const key = String(id || "");
    if (!key) return;
    if (!statusOf.has(key) || status === "delivered") statusOf.set(key, status);
  };

  for (const delivery of deliveryOrders.value as any[]) {
    const status = String(delivery.status || "").toLowerCase();
    const linked =
      String(delivery.customer_id || "") === cid ||
      (delivery.sale_id && saleIds.has(String(delivery.sale_id))) ||
      (delivery.rental_id && rentalIds.has(String(delivery.rental_id))) ||
      (delivery.contract_id && contractIds.has(String(delivery.contract_id)));
    if (!linked) continue;

    for (const item of delivery.delivery_order_items || []) {
      markStatus(item.unit_id, status || "-");
      markStatus(item.product_id, status || "-");
    }
    if (!DELIVERED_DO_STATUS.has(status)) continue;

    for (const item of delivery.delivery_order_items || []) {
      if (item.unit_id) unitIds.add(String(item.unit_id));
      if (item.product_id) productIds.add(String(item.product_id));
    }
    if (delivery.rental_id) {
      const rental = rentalsData.value.find(
        (r: any) => String(r.id) === String(delivery.rental_id),
      );
      for (const item of rental?.rental_items || []) {
        if (item.unit_id) unitIds.add(String(item.unit_id));
        if (item.product_id) productIds.add(String(item.product_id));
      }
    }
    if (delivery.sale_id) {
      const sale = sales.value.find(
        (s: any) => String(s.id) === String(delivery.sale_id),
      );
      for (const item of (sale as any)?.sale_items || []) {
        if (item.unit_id) unitIds.add(String(item.unit_id));
        if (item.product_id) productIds.add(String(item.product_id));
      }
    }
    if (delivery.contract_id) {
      for (const contract of getContractsByCustomer(form.customer_id)) {
        if (
          String((contract as any).contract_id) ===
          String(delivery.contract_id) &&
          (contract as any).unit_id
        ) {
          unitIds.add(String((contract as any).unit_id));
        }
      }
    }
  }
  return { unitIds, productIds, statusOf };
});

const hasDeliveredUnit = computed(() =>
  customerRentalUnits.value.some((u: any) => u.delivered),
);

// Auto-fill project_name if selected unit comes from a delivery order
watch(
  () => [form.unit_ids, form.customer_id] as const,
  ([unitIds, customerId]) => {
    if (isEditing.value) return;
    if (!unitIds || unitIds.length === 0) return;

    const selectedUnits = customerRentalUnits.value.filter((u: any) =>
      unitIds.includes(u.id),
    );
    const deliveryUnits = selectedUnits.filter(
      (u: any) => u.source === "delivery",
    );

    if (deliveryUnits.length > 0) {
      const names = deliveryUnits.map((u: any) => {
        let clean = u.label || "";
        clean = clean
          .replace(/^\[.*?\]\s*/, "")
          .replace(/\s*\(SN:.*?\)/, "")
          .replace(/\s*\(Qty:.*?\)/, "")
          .trim();
        return clean || "Unit";
      });
      const productOrUnitName = names.join(", ");
      const cust = findCustomer(customerId as any);
      const address = (cust as any)?.address || "";
      form.project_name = address
        ? `Pengantaran ${productOrUnitName} ke ${address}`
        : `Pengantaran ${productOrUnitName}`;
    }
  },
  { deep: true },
);

async function fetchRequests() {
  try {
    const data = await api.get<{ data: any[] }>("/service-requests");
    serviceRequests.value = data.data.map((r: any) => {
      const row = {
        ...r,
        customer: r.customer?.name || "-",
        _company_name: r.customer?.company_name || r.customer?.name || "-",
        _pic_name: r.customer?.pic_name || "-",
      };
      return {
        ...row,
        _external_unit: externalUnitLabel(row),
      };
    });
  } catch (error) {
    console.error("Failed to fetch data", error);
    toast.error("Gagal memuat service requests. Silakan refresh halaman.");
  }
}

async function handleSubmit() {
  if (!form.customer_id || !form.problem_description) return;
  // Pengaman frontend (backend juga menolak dengan 422 bila lolos dari sini).
  const chosen = form.unit_ids.length > 0 ? form.unit_ids?.[0] : null;
  if (
    chosen &&
    !deliveredItemIds.value.unitIds.has(String(chosen)) &&
    !deliveredItemIds.value.productIds.has(String(chosen))
  ) {
    toast.error(
      "Barang belum dikirim: service request hanya bisa dibuat setelah barang/DO berstatus delivered.",
    );
    return;
  }
  isLoading.value = true;

  const payload = {
    request_no: form.request_no,
    customer_id: form.customer_id,
    unit_id: form.unit_ids.length > 0 && form.unit_ids?.[0] ? form.unit_ids[0] : null,
    project_name: form.project_name,
    problem_description: form.problem_description,
    request_date: new Date(form.request_date).toISOString(),
  };

  try {
    await apiRequest({
      url: isEditing.value ? `/service-requests/${editId.value}` : "/service-requests",
      method: isEditing.value ? "PATCH" : "POST",
      data: payload,
    });
    toast.success("Service request created successfully!");
    showModal.value = false;
    listTab.value = "internal";
    fetchRequests();
  } catch (error) {
    toast.error(toast.fromError(error, "A network error occurred."));
  } finally {
    isLoading.value = false;
  }
}

const showAssignModal = ref(false);
const assignItem = ref<any>(null);
const assignForm = reactive({
  technician_id: "",
  scheduled_date: new Date().toISOString().slice(0, 10),
  instructions: "",
});

function openAssign(row: any) {
  assignItem.value = row;
  Object.assign(assignForm, {
    technician_id: "",
    scheduled_date: new Date().toISOString().slice(0, 10),
    instructions: `Follow-up on complaint: ${row.problem_description}`,
  });
  showAssignModal.value = true;
}

async function handleAssignSubmit() {
  if (!assignForm.technician_id) return;
  isLoading.value = true;

  const payload = {
    job_order_no: `JO-${Date.now().toString().slice(-6)}`,
    service_request_id: assignItem.value.id,
    technician_id: assignForm.technician_id,
    scheduled_date: new Date(assignForm.scheduled_date).toISOString(),
    instructions: assignForm.instructions,
  };

  try {
    await apiRequest({ url: "/service-requests", method: "POST", data: payload });
    toast.success("Technician assigned successfully! Job order created.");
    showAssignModal.value = false;
    fetchRequests(); // To maybe refresh status if backend updates SR status automatically
  } catch (error) {
    toast.error(toast.fromError(error, "A network error occurred."));
  } finally {
    isLoading.value = false;
  }
}

const relatedReports = computed(() => {
  if (!selectedRequest.value) return [];
  const requestJobs = jobOrders.value.filter(
    (j) => j.service_request_id === selectedRequest.value.id,
  );
  const jobIds = requestJobs.map((j) => String(j.id));
  // Copier report punya list tersendiri — tidak ditampilkan di sini.
  return serviceReports.value.filter(
    (sr) =>
      jobIds.includes(String(sr.job_order_id)) && !isCopierReport(sr),
  );
});

function openAdd() {
  isEditing.value = false;
  editId.value = null;
  resetCreateForm(listTab.value);
  showModal.value = true;
}

function openEdit(row: any) {
  isEditing.value = true;
  editId.value = row.id;
  formTab.value = row.is_external ? 'external' : 'internal';
  Object.assign(form, {
    request_no: row.request_no,
    customer_id: row.customer_id,
    unit_ids: row.unit_id ? [row.unit_id] : [],
    project_name: row.project_name || '',
    problem_description: row.problem_description || '',
    request_date: row.request_date ? new Date(row.request_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    external_brand: row.external_brand || '',
    external_model: row.external_model || '',
    external_serial_no: row.external_serial_no || '',
    external_note: row.external_note || '',
    external_type: row.external_type || 'legacy_rental',
  });
  externalBrandSelect.value = row.external_brand;
  showModal.value = true;
}

async function confirmDelete(row: any) {
  if (!confirm('Are you sure you want to delete this service request?')) return;
  try {
    await api.delete(`/service-requests/${row.id}`);
    toast.success("Service request deleted!");
    fetchRequests();
  } catch (error) {
    toast.error(toast.fromError(error, "A network error occurred."));
  }
}

function openDetail(row: any) {
  selectedRequest.value = row;
  showRequestDetailModal.value = true;
}

let srTimer: any = null
async function silentRefresh() {
  if (showModal.value || showRequestDetailModal.value) return
  try {
    await fetchRequests()
  } catch {}
}

onMounted(async () => {
  isLoading.value = true;
  try {
    await Promise.all([
      fetchRequests(),
      fetchRentals(),
      fetchWarranties(),
      ensureResourcesLoaded(route.path),
    ]);
  } finally {
    isLoading.value = false;
  }
  srTimer = setInterval(silentRefresh, 30000)
  window.addEventListener('focus', silentRefresh)
  window.addEventListener('bias:data-mutated', silentRefresh)
});

onUnmounted(() => {
  if (srTimer) clearInterval(srTimer)
  window.removeEventListener('focus', silentRefresh)
  window.removeEventListener('bias:data-mutated', silentRefresh)
})
</script>

<template>
  <div>
    <PageHeader title="Service Request Management" button-label="Log Complaint" permission="service_request:create"
      @add="openAdd" />

    <div class="sr-tabs sr-tabs--page" role="tablist" aria-label="Filter daftar service request">
      <button type="button" role="tab" class="sr-tab" :class="{ 'sr-tab--active': listTab === 'internal' }"
        :aria-selected="listTab === 'internal'" @click="listTab = 'internal'">
        Unit Internal ({{ internalRequests.length }})
      </button>
      <button type="button" role="tab" class="sr-tab" :class="{ 'sr-tab--active': listTab === 'external' }"
        :aria-selected="listTab === 'external'" @click="listTab = 'external'">
        Unit Luar / Eksternal ({{ externalRequests.length }})
      </button>
    </div>

    <DataTable :columns="tableColumns" :data="displayedRequests" :loading="isLoading"
       :search-placeholder="listTab === 'internal' ? 'Search complaints...' : 'Search external complaints...'">
       <template #toolbar>
         <div v-if="listTab === 'external'" style="display: flex; align-items: center; gap: 8px;">
           <label style="font-size: 12px; font-weight: 600; color: var(--color-text-muted); white-space: nowrap;">Tipe Pembelian:</label>
           <select v-model="externalTypeFilter" class="form-select" style="min-width: 200px; height: 36px; padding: 0 10px; font-size: 13px; border-radius: 6px; border: 1px solid var(--color-border); background: var(--color-surface, #fff); color: var(--color-text); cursor: pointer;">
             <option value="all">Semua</option>
             <option value="legacy_rental">Rental lama (sebelum sistem)</option>
             <option value="external_purchase">Beli dari toko lain</option>
           </select>
         </div>
       </template>
       <template #cell-request_date="{ value }">{{
        new Date(value).toLocaleDateString("en-GB")
      }}</template>
       <template #cell-request_no="{ value, row }">
         <span class="mono">{{ value }}</span>
         <span v-if="row?.is_external" class="unit-source-badge badge-external"
           title="Unit di luar milik perusahaan">Eksternal</span>
         <span v-if="row?.is_external" class="unit-source-badge"
           :class="(row?.external_type || 'legacy_rental') === 'external_purchase' ? 'badge-outside' : 'badge-running'"
           :title="(row?.external_type || 'legacy_rental') === 'external_purchase' ? 'Unit dibeli dari toko lain' : 'Rental yang sudah berjalan sebelum ada sistem'">
           {{ (row?.external_type || 'legacy_rental') === 'external_purchase' ? 'Beli Toko Lain' : 'Rental Lama' }}
         </span>
       </template>
      <template #cell-status="{ value }">
        <span class="badge" :class="value === 'assigned' || value === 'in_progress'
          ? 'badge-success'
          : 'badge-warning'
          ">
          {{ value.toUpperCase() }}
        </span>
      </template>
      <template #actions="{ row }">
        <button class="action-btn" title="View Detail" @click="openDetail(row)"
          style="color: var(--color-primary); border-color: transparent">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
        <button v-if="can('service_request:update') && (row.status === 'pending' || row.status === 'assigned')"
          class="action-btn" title="Edit" @click="openEdit(row)"
          style="color: var(--color-warning); border-color: transparent">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button v-if="can('service_request:delete') && (row.status === 'pending' || row.status === 'assigned')"
          class="action-btn" title="Delete" @click="confirmDelete(row)"
          style="color: var(--color-danger); border-color: transparent">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </template>
    </DataTable>

    <FormModal :open="showRequestDetailModal" title="Service Request Details" @close="showRequestDetailModal = false">
      <div v-if="selectedRequest">
        <!-- Info Cards -->
        <div class="detail-info-grid">
          <div class="detail-info-card">
            <span class="detail-info-label">Request No</span>
            <span class="detail-info-value mono">{{
              selectedRequest.request_no
            }}</span>
          </div>
          <div class="detail-info-card">
            <span class="detail-info-label">Customer</span>
            <span class="detail-info-value">{{
              selectedRequest._company_name || selectedRequest.customer || "-"
            }}</span>
          </div>
          <div class="detail-info-card">
            <span class="detail-info-label">PIC</span>
            <span class="detail-info-value">{{
              selectedRequest._pic_name || "-"
            }}</span>
          </div>
          <div class="detail-info-card">
            <span class="detail-info-label">Request Date</span>
            <span class="detail-info-value">{{
              selectedRequest.request_date
                ? new Date(selectedRequest.request_date).toLocaleDateString(
                  "en-GB",
                )
                : "-"
            }}</span>
          </div>
        </div>

        <!-- Problem Description -->
        <div v-if="selectedRequest.is_external" class="detail-problem-box"
          style="border-left-color: var(--color-warning, #d97706)">
          <span class="detail-info-label" style="display: block; margin-bottom: 6px">Unit Luar / Eksternal</span>
          <p class="detail-problem-text">
            {{ externalUnitLabel(selectedRequest) }}
            <span v-if="selectedRequest.external_note"> — {{ selectedRequest.external_note }}</span>
          </p>
        </div>

        <!-- Problem Description -->
        <div class="detail-problem-box">
          <span class="detail-info-label" style="display: block; margin-bottom: 6px">Complaint / Problem</span>
          <p class="detail-problem-text">
            {{ selectedRequest.problem_description || "-" }}
          </p>
        </div>

        <!-- History -->
        <div class="detail-section-header">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          Service Report History
        </div>

        <div v-if="relatedReports.length === 0" class="detail-empty-state">
          No service reports for this request yet.
        </div>
        <div v-else class="detail-report-list">
          <div v-for="rep in relatedReports" :key="rep.id" class="detail-report-row">
            <div class="detail-report-main">
              <span class="detail-report-no mono">{{
                rep.report_no || rep.service_report_no || "-"
              }}</span>
              <span class="detail-report-meta">{{
                rep.service_date
                  ? new Date(rep.service_date).toLocaleDateString("en-GB")
                  : "-"
              }}</span>
              <span class="detail-report-type">{{
                rep.service_type || "-"
              }}</span>
            </div>
            <div class="detail-report-actions">
              <span :class="rep.status === 'completed'
                ? 'badge badge-success'
                : 'badge badge-info'
                ">
                {{ rep.status === "completed" ? "Completed" : rep.status }}
              </span>
              <button class="detail-look-btn" @click="$router.push(`/shared/service-reports/${rep.id}`)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                View
              </button>
            </div>
          </div>
        </div>
      </div>
    </FormModal>

    <FormModal :open="showModal" :title="isEditing ? 'Edit Service Request' : 'Log Complaint (Service Request)'" max-width="580px" @close="showModal = false"
      @submit="handleModalSubmit">
      <div class="sr-tabs sr-tabs--modal" role="tablist" aria-label="Jenis unit service request">
        <button type="button" role="tab" class="sr-tab sr-tab--segment"
          :class="{ 'sr-tab--segment-active': formTab === 'internal' }" :aria-selected="formTab === 'internal'"
          @click="formTab = 'internal'">
          Unit Internal
        </button>
        <button type="button" role="tab" class="sr-tab sr-tab--segment"
          :class="{ 'sr-tab--segment-active': formTab === 'external' }" :aria-selected="formTab === 'external'"
          @click="formTab = 'external'">
          Unit Luar / Eksternal
        </button>
      </div>

      <p v-if="formTab === 'external'" class="form-tab-hint">
        Unit milik customer / di luar inventori perusahaan — tanpa validasi DO.
      </p>
      <p v-else class="form-tab-hint">
        Pilih unit rental, penjualan, atau kontrak yang sudah delivered (DO).
      </p>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Request Number</label>
          <input v-model="form.request_no" type="text" readonly class="form-input" required />
        </div>
        <div class="form-group">
          <label class="form-label">Received Date</label>
          <input v-model="form.request_date" type="date" class="form-input" required />
        </div>
      </div>

      <div class="form-group mt-3">
        <label class="form-label">Customer</label>
        <CustomSelect v-model="form.customer_id" :options="customerOptions" placeholder="-- Select Customer --" />
      </div>

      <div v-show="formTab === 'internal'" class="form-group mt-3">
        <label class="form-label">Faulty Unit / Consumable / Sparepart</label>
        <div v-if="!form.customer_id" class="field-placeholder">
          Select a customer first
        </div>
        <div v-else-if="customerRentalUnits.length === 0" class="field-placeholder">
          Belum ada unit mesin, consumable, atau sparepart tercatat untuk customer ini.
        </div>
        <div v-else>
          <div v-if="!hasDeliveredUnit" class="field-placeholder field-placeholder--warn">
            Belum ada barang yang dikirim (delivered) untuk customer ini —
            service request baru bisa dibuat setelah barang/DO diterima customer.
          </div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <label style="font-size: 12px; font-weight: 600; color: var(--color-text-muted); white-space: nowrap;">Filter Product:</label>
            <select v-model="productSourceFilter" class="form-select" style="min-width: 180px; height: 34px; padding: 0 10px; font-size: 12px; border-radius: 6px; border: 1px solid var(--color-border); background: var(--color-surface, #fff); color: var(--color-text); cursor: pointer;">
              <option value="all">Semua</option>
              <option value="unit">Unit / Mesin</option>
              <option value="product">Consumable / Sparepart</option>
              <option value="rental">Rental</option>
              <option value="sale">Purchased</option>
              <option value="delivery">Delivered</option>
              <option value="contract">Contract</option>
            </select>
          </div>
          <div class="unit-checkbox-list">
            <label
              v-for="u in filteredCustomerRentalUnits"
              :key="u.id"
              class="unit-checkbox-item"
              :class="{ 'unit-disabled': !u.delivered }"
              :title="!u.delivered ? 'Barang ini belum bisa dipilih karena belum melakukan pengantaran (status belum delivered)' : ''"
              @click="!u.delivered ? $event.preventDefault() : null"
            >
              <input
                type="checkbox"
                :value="u.id"
                v-model="form.unit_ids"
                :disabled="!u.delivered"
              />
              <span class="unit-checkbox-label" :style="!u.delivered ? 'color: var(--color-text-muted); cursor: not-allowed;' : ''">{{ u.label }}</span>
              <span
                v-if="!u.delivered"
                class="delivery-badge delivery-pending"
                :title="u.doStatus ? `Status DO: ${u.doStatus}` : 'Belum ada pengantaran/DO untuk barang ini'"
              >
                Belum Dikirim{{ u.doStatus && u.doStatus !== 'belum dikirim' && u.doStatus !== '-' ? ` (${u.doStatus})` : '' }}
              </span>
              <span class="unit-source-badge" :class="u.itemType === 'product'
                ? 'badge-product'
                : u.source === 'rental'
                  ? 'badge-rental'
                  : u.source === 'sale'
                    ? 'badge-sale'
                    : u.source === 'delivery'
                      ? 'badge-delivery'
                      : 'badge-contract'
                "
                :style="u.itemType === 'product' ? 'background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd;' : ''"
              >
                {{
                  u.itemType === "product"
                    ? "Consumable / Sparepart"
                    : u.source === "rental"
                      ? "Rental Unit"
                      : u.source === "sale"
                        ? "Purchased Unit"
                        : u.source === "delivery"
                          ? "Delivered Unit"
                          : "Contract Unit"
                }}
              </span>
              <span v-if="u.warranty?.active" class="warranty-badge warranty-active"
                :title="`Warranty until ${u.warranty.endDate}`">
                ✓ Warranty
              </span>
              <span v-else class="warranty-badge warranty-none" title="No active warranty — charges will apply">
                Billable
              </span>
            </label>
          </div>
        </div>
      </div>

      <div v-show="formTab === 'external'" class="form-group mt-3">
        <label class="form-label">Faulty Machine (Unit Luar)</label>
        <div v-if="!form.customer_id" class="field-placeholder">
          Select a customer first
        </div>
        <div v-else class="external-unit-panel">
          <div class="form-group" style="margin-bottom: 10px;">
            <label class="form-label form-label-sm">Tipe Pembelian</label>
            <CustomSelect v-model="form.external_type" :options="externalTypeOptions"
              placeholder="-- Pilih Tipe Pembelian --" />
          </div>
          <div class="form-row external-unit-fields">
            <div class="form-group external-brand-field">
              <label class="form-label form-label-sm">Brand / Merek</label>
              <CustomSelect v-model="externalBrandSelect" :options="brandSelectOptions"
                placeholder="-- Pilih Brand --" />
              <input v-if="isExternalBrandOther" v-model="form.external_brand" type="text"
                class="form-input external-brand-custom" placeholder="Ketik nama brand (cth. Kyocera)" />
            </div>
            <div class="form-group">
              <label class="form-label form-label-sm">Model / Tipe</label>
              <input v-model="form.external_model" type="text" class="form-input" placeholder="cth. imageRUNNER 2525" />
            </div>
          </div>
          <div class="form-row external-unit-fields">
            <div class="form-group">
              <label class="form-label form-label-sm">Serial Number</label>
              <input v-model="form.external_serial_no" @input="form.external_serial_no = ($event.target as HTMLInputElement).value.toUpperCase()" type="text" class="form-input text-uppercase"
                placeholder="Opsional — auto-generate bila kosong" />
            </div>
            <div class="form-group">
              <label class="form-label form-label-sm">Lokasi / Keterangan</label>
              <input v-model="form.external_note" type="text" class="form-input"
                placeholder="cth. lantai 2, ruang arsip" />
            </div>
          </div>
          <div class="external-unit-meta">
            <span class="warranty-badge warranty-none" title="Unit luar tidak ter-cover warranty internal">
              Billable
            </span>
            <span class="external-unit-meta-text">
              Job Order &amp; Service Report mengikuti alur standar.
            </span>
          </div>
        </div>
      </div>

      <div class="form-group mt-3">
        <label class="form-label">Project Name</label>
        <input v-model="form.project_name" type="text" class="form-input"
          placeholder="e.g. Pemeliharaan Printer Kantor A" />
      </div>

      <div class="form-group mt-3">
        <label class="form-label">Complaint Description (Problem)</label>
        <textarea v-model="form.problem_description" class="form-input" rows="4"
          placeholder="Describe the complaint in detail" required></textarea>
      </div>

      <div v-if="isLoading" class="mt-2 text-center text-sm text-gray-500">
        Saving data...
      </div>
    </FormModal>

    <FormModal :open="showAssignModal" title="Assign Technician (Create Job Order)" @close="showAssignModal = false"
      @submit="handleAssignSubmit">
      <div class="form-group mt-3">
        <label class="form-label">Select Technician</label>
        <CustomSelect v-model="assignForm.technician_id" :options="technicianOptions"
          placeholder="-- Select Technician --" />
      </div>
      <div class="form-group mt-3">
        <label class="form-label">Assignment Date</label>
        <input v-model="assignForm.scheduled_date" type="date" class="form-input" required />
      </div>
      <div class="form-group mt-3">
        <label class="form-label">Instructions / Notes for Technician</label>
        <textarea v-model="assignForm.instructions" class="form-input" rows="4" required></textarea>
      </div>
      <div v-if="isLoading" class="mt-2 text-center text-sm text-gray-500">
        Saving data...
      </div>
    </FormModal>

  </div>
</template>

<style scoped>
.sr-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.sr-tab {
  padding: 8px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.sr-tab--active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.sr-tabs--modal {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  padding: 4px;
  margin-bottom: 12px;
  background: var(--color-surface-sunken);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.sr-tab--segment {
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  padding: 10px 12px;
  border-radius: calc(var(--radius-md) - 2px);
  font-size: 0.8rem;
}

.sr-tab--segment-active {
  background: #fff;
  color: var(--color-text);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  font-weight: 700;
}

.form-tab-hint {
  margin: 0 0 14px;
  font-size: 0.78rem;
  color: var(--color-text-muted);
  line-height: 1.45;
}

.field-placeholder {
  padding: 12px;
  background: var(--color-surface-raised);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.field-placeholder--warn {
  margin-bottom: 8px;
}

.badge-external {
  background: #fef3c7;
  color: #92400e;
  margin-left: 8px;
}

.badge-running {
  background: #dbeafe;
  color: #1d4ed8;
  margin-left: 8px;
}

.badge-outside {
  background: #fce7f3;
  color: #be185d;
  margin-left: 8px;
}

.badge-sale {
  background: #dcfce7;
  color: #15803d;
}

.badge-delivery {
  background: #ede9fe;
  color: #6d28d9;
}

.badge-product {
  background: #e0f2fe;
  color: #0284c7;
  border: 1px solid #bae6fd;
}

.badge-rental {
  background: #e0f2fe;
  color: #0369a1;
}

.badge-contract {
  background: #f0fdf4;
  color: #15803d;
}

.external-unit-panel {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 12px;
  background: var(--color-surface-raised);
}

.external-brand-custom {
  margin-top: 8px;
}

.external-brand-field :deep(.custom-select__dropdown) {
  z-index: 60;
}

.external-unit-fields {
  gap: 10px;
}

.external-unit-fields+.external-unit-fields {
  margin-top: 10px;
}

.form-label-sm {
  font-size: 0.72rem;
  margin-bottom: 4px;
}

.external-unit-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--color-border);
}

.external-unit-meta-text {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  line-height: 1.4;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-base);
}

.mt-3 {
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
  color: #6b7280;
}

.unit-checkbox-list {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  max-height: 200px;
  overflow-y: auto;
  padding: 8px;
}

.unit-checkbox-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s;
  font-size: var(--font-size-sm);
}

.unit-checkbox-item:hover {
  background: var(--color-surface-raised);
}

.unit-checkbox-item input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--color-primary);
  flex-shrink: 0;
}

.unit-checkbox-label {
  flex: 1;
  font-weight: var(--font-weight-medium);
}

.unit-source-badge {
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.badge-rental {
  background: #e0f2fe;
  color: #0369a1;
}

.badge-contract {
  background: #f0fdf4;
  color: #15803d;
}

.warranty-badge {
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

.warranty-active {
  background: #dcfce7;
  color: #15803d;
}

.warranty-none {
  background: #fef9c3;
  color: #a16207;
}

.delivery-badge {
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

.delivery-pending {
  background: #fee2e2;
  color: #b91c1c;
}

.unit-disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.unit-disabled:hover {
  background: transparent;
}

/* Detail Modal Styles */
.detail-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
}

.detail-info-card {
  background: var(--color-surface-sunken);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-info-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--color-text-muted);
}

.detail-info-value {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text);
}

.mono {
  font-family: monospace;
  letter-spacing: 0.5px;
}

.detail-problem-box {
  background: var(--color-surface-sunken);
  border-left: 3px solid var(--color-primary);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  margin-bottom: 20px;
}

.detail-problem-text {
  font-size: 0.88rem;
  color: var(--color-text);
  line-height: 1.6;
  margin: 0;
}

.detail-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
}

.detail-empty-state {
  text-align: center;
  padding: 24px;
  color: var(--color-text-muted);
  font-size: 0.85rem;
  background: var(--color-surface-sunken);
  border-radius: var(--radius-md);
}

.detail-report-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-report-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--color-surface-raised, #fff);
  border: 1px solid var(--color-border-light, #f0f0f0);
  border-radius: var(--radius-md);
  transition: background 0.15s;
}

.detail-report-row:hover {
  background: var(--color-surface-sunken);
}

.detail-report-main {
  display: flex;
  align-items: center;
  gap: 16px;
}

.detail-report-no {
  font-weight: 600;
  font-size: 0.85rem;
  min-width: 90px;
}

.detail-report-meta {
  font-size: 0.82rem;
  color: var(--color-text-muted);
}

.detail-report-type {
  font-size: 0.78rem;
  padding: 2px 10px;
  border-radius: 20px;
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  font-weight: 500;
  text-transform: capitalize;
}

.detail-report-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.detail-look-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.detail-look-btn:hover {
  background: var(--color-surface-sunken);
  border-color: var(--color-primary);
}
</style>
