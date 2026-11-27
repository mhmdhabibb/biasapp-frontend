<script setup lang="ts">
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import CustomSelect from "@/components/ui/CustomSelect.vue";
import CustomerTrackingModal from "@/components/ui/CustomerTrackingModal.vue";
import DataTable from "@/components/ui/DataTable.vue";
import PageSkeleton from "@/components/ui/PageSkeleton.vue";
import ExcelImportButtons from "@/components/ui/ExcelImportButtons.vue";
import FormModal from "@/components/ui/FormModal.vue";
import HardDeleteDialog from "@/components/ui/HardDeleteDialog.vue";
import PageHeader from "@/components/ui/PageHeader.vue";
import { useAuth } from "@/composables/useAuth";
import { useHardDelete } from "@/composables/useHardDelete";
import { usePermission } from "@/composables/usePermission";
import { useToast } from "@/composables/useToast";
import { resources } from "@/services/resource.service";
import type { TableColumn, Unit, UOM } from "@/types";
import { computed, reactive, ref, onMounted, watch, onUnmounted } from "vue";
import { formatUnitDisplayName as utilFormatUnitDisplayName } from "@/utils/format";
import {
  downloadStyledExcel,
  NUMFMT_COUNT,
  NUMFMT_RP,
  type StyledCell,
} from "@/utils/exportHelpers";
import { BIAS_LOGO_DATA_URL } from "@/utils/logoData";

const toast = useToast();
const { currentUser } = useAuth();
const { can } = usePermission();
const isTechnician = computed(() => currentUser.value?.role === "technician");

const columns: TableColumn[] = [
  { key: "name", label: "Name / Unit Description", wrap: true },
  { key: "serial_no", label: "SN", width: "160px", nowrap: true },
  { key: "price", label: "Price", width: "120px", nowrap: true },
  { key: "status", label: "Status", width: "115px", nowrap: true },
  { key: "is_copier", label: "Copier", width: "70px", nowrap: true },
];

const brands = ref<{ id: string; name: string }[]>([]);
const unitTypes = ref<{ id: string; name: string }[]>([]);
const paperSizes = ref<{ id: string; name: string }[]>([]);
const uoms = ref<UOM[]>([]);

const brandOptions = computed(() =>
  brands.value.map((b) => ({ value: b.id, label: b.name })),
);
const typeOptions = computed(() =>
  unitTypes.value.map((t) => ({ value: t.id, label: t.name })),
);
const paperSizeOptions = computed(() =>
  paperSizes.value.map((p) => ({ value: p.id, label: p.name })),
);
const uomOptions = computed(() =>
  uoms.value.map((u) => ({ value: u.id, label: u.name })),
);

const data = ref<Unit[]>([]);
const isLoading = ref(true);

async function fetchData() {
  isLoading.value = true;
  try {
    const [resUnits, resBrands, resTypes, resPaperSizes, resUoms] =
      await Promise.all([
        resources.units.list(),
        resources.brands.list(),
        resources.unitTypes.list(),
        resources.paperSizes.list(),
        resources.uoms.list(),
      ]);
    data.value = resUnits.data as any;
    brands.value = resBrands.data as any;
    unitTypes.value = resTypes.data as any;
    paperSizes.value = resPaperSizes.data as any;
    uoms.value = resUoms.data as any;
  } catch (error: any) {
    console.error("Failed to fetch data:", error);
    toast.error(
      "Failed to fetch data from server: " + (error.message || "Error"),
    );
  } finally {
    isLoading.value = false;
  }
}

const totalUnitCount = computed(() => (data.value || []).length);
const totalAvailableCount = computed(
  () =>
    (data.value || []).filter(
      (u) => (u.status || "").toLowerCase() === "available",
    ).length,
);
const totalLockCount = computed(
  () =>
    (data.value || []).filter((u) =>
      ["lock", "locked"].includes((u.status || "").toLowerCase()),
    ).length,
);
const totalRentedCount = computed(
  () =>
    (data.value || []).filter(
      (u) => (u.status || "").toLowerCase() === "rented",
    ).length,
);
const totalMaintenanceCount = computed(
  () =>
    (data.value || []).filter(
      (u) => (u.status || "").toLowerCase() === "maintenance",
    ).length,
);
const totalBrokenCount = computed(
  () =>
    (data.value || []).filter(
      (u) => (u.status || "").toLowerCase() === "broken",
    ).length,
);
const totalSoldCount = computed(
  () =>
    (data.value || []).filter((u) => (u.status || "").toLowerCase() === "sold")
      .length,
);
const totalUnitValue = computed(() =>
  (data.value || []).reduce(
    (acc, u) => acc + (Number((u as any).price) || 0),
    0,
  ),
);

const selectedStatus = ref<string>("all");
const searchSN = ref<string>("");

// Multi-select & bulk delete
const selectedKeys = ref<(string | number)[]>([]);
const showBulkDeleteConfirm = ref(false);
const isBulkDeleting = ref(false);

const selectedCount = computed(() => selectedKeys.value.length);

async function handleBulkDelete() {
  if (selectedKeys.value.length === 0) return;
  isBulkDeleting.value = true;
  try {
    await Promise.all(
      selectedKeys.value.map((id) => resources.units.remove(String(id))),
    );
    toast.success(`${selectedKeys.value.length} unit berhasil dihapus!`);
    selectedKeys.value = [];
    await fetchData();
    window.dispatchEvent(
      new CustomEvent("bias:data-mutated", { detail: { path: "/units" } }),
    );
  } catch (error: any) {
    console.error("Failed to bulk delete:", error);
    toast.error("Gagal menghapus unit: " + (error.message || "Error"));
  } finally {
    isBulkDeleting.value = false;
    showBulkDeleteConfirm.value = false;
  }
}

const filteredData = computed(() => {
  let list = data.value || [];
  if (selectedStatus.value && selectedStatus.value !== "all") {
    const filterVal = selectedStatus.value.toLowerCase();
    list = list.filter((u) => {
      const st = (u.status || "").toLowerCase();
      if (filterVal === "lock" || filterVal === "locked") {
        return st === "lock" || st === "locked";
      }
      return st === filterVal;
    });
  }
  if (searchSN.value && searchSN.value.trim()) {
    const raw = searchSN.value.trim().toLowerCase();
    const terms = raw
      .split(/[\s,;\n]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (terms.length > 0) {
      list = list.filter((u) => {
        const sn = (u.serial_no || "").toLowerCase();
        return terms.some((term) => sn.includes(term));
      });
    }
  }
  return list;
});

let unitTimer: any = null;
async function silentRefresh() {
  if (showModal.value || showConfirm.value || hardDelete.show) return;
  try {
    const resUnits = await resources.units.list();
    data.value = Array.isArray(resUnits.data) ? (resUnits.data as any) : [];
  } catch {}
}

onMounted(() => {
  fetchData();
  unitTimer = setInterval(silentRefresh, 30000);
  window.addEventListener("focus", silentRefresh);
  window.addEventListener("bias:data-mutated", silentRefresh);
});

onUnmounted(() => {
  if (unitTimer) clearInterval(unitTimer);
  window.removeEventListener("focus", silentRefresh);
  window.removeEventListener("bias:data-mutated", silentRefresh);
});

const showModal = ref(false);
const showTrackingModal = ref(false);
const trackingItem = ref<any>(null);
const showConfirm = ref(false);
const editingItem = ref<Unit | null>(null);
const deletingItem = ref<Unit | null>(null);

function openTracking(item: any) {
  trackingItem.value = item;
  showTrackingModal.value = true;
}

function getCleanSpecsString(item: any): string {
  if (!item || !item.specs) return "";
  const raw = item.specs;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "{}" || trimmed === "[]") return "";
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const obj = JSON.parse(trimmed);
        if (obj && typeof obj === "object") {
          return formatSpecsObjectToString(obj);
        }
      } catch {}
    }
    return trimmed;
  }
  if (typeof raw === "object" && raw !== null) {
    return formatSpecsObjectToString(raw);
  }
  return "";
}

function formatSpecsObjectToString(obj: Record<string, any>): string {
  const parts: string[] = [];

  const storage = obj.storage ? String(obj.storage).trim() : "";
  const storageType = obj.storage_type ? String(obj.storage_type).trim() : "";
  const combinedStorage =
    storage && storageType
      ? `${storage} ${storageType}`
      : storage || storageType;

  const keyMap: Record<string, string> = {
    cpu: "CPU",
    processor: "Processor",
    ram: "RAM",
    os: "OS",
    vga: "VGA",
    graphic: "Graphic",
    office: "Office",
  };

  for (const [k, v] of Object.entries(obj)) {
    if (!v || k === "print_tech" || k === "storage_type") continue;
    const valStr = String(v).trim();
    if (!valStr) continue;

    if (k === "storage") {
      parts.push(combinedStorage ? `Storage: ${combinedStorage}` : "");
      continue;
    }

    const label =
      keyMap[k.toLowerCase()] ||
      k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    if (valStr.toLowerCase().startsWith(label.toLowerCase())) {
      parts.push(valStr);
    } else {
      parts.push(`${label}: ${valStr}`);
    }
  }

  return parts.filter(Boolean).join("\n");
}
// type_id is the json key expected by backend, frontend had unit_type_id
const form = reactive({
  serial_no: "",
  serial_numbers: [] as string[],
  temp_serial: "",
  brand_id: null as string | null,
  type_id: null as string | null,
  print_tech: "" as string,
  uom_id: "" as string | null,
  model: "",
  name: "",
  specs_text: "",
  price: null as number | null,
  is_copier: false,
  is_computer: false,
  current_meter_bw: 0,
  current_meter_color: 0,
  free_quota_color: 0,
  free_quota_bw: 0,
  rates: [] as {
    paper_size_id: string;
    paper_type_id: string | null;
    rate_per_page_bw: number;
    rate_per_page_color: number;
    free_quota_bw: number;
    free_quota_color: number;
    quota_applies_to: string;
  }[],
  specsData: {
    cpu: "",
    ram: "",
    storage: "",
    storage_type: "",
    os: "",
    vga: "",
    office: "",
  },
});

const printTechOptions = [
  { value: "Laser", label: "Laser" },
  { value: "Inject", label: "Inject" },
];

function getTypeName(id: string | null): string {
  if (!id) return "";
  const t = unitTypes.value.find((t) => String(t.id) === String(id));
  return t ? t.name : "";
}

const isPrinterOrCopier = computed(() => {
  const tName = getTypeName(form.type_id).toLowerCase().trim();
  return (
    tName === "printer" ||
    tName.includes("printer") ||
    tName === "photocopy machine" ||
    tName.includes("photocopy") ||
    tName.includes("copier") ||
    Boolean(form.is_copier)
  );
});

function computeUnitName(
  typeId: string | null,
  printTech: string,
  brandId: string | null,
  model: string,
  isCopier = false,
): string {
  const typeName = getTypeName(typeId).trim();
  const brandName = getBrandName(brandId);
  const validBrand = brandName && brandName !== "-" ? brandName.trim() : "";
  const validModel = (model || "").trim();

  const tLower = typeName.toLowerCase();
  const isPrintOrCopy =
    tLower.includes("printer") ||
    tLower.includes("copier") ||
    tLower.includes("photocopy") ||
    isCopier;

  if (isPrintOrCopy) {
    const tech = (printTech || "").trim();
    return [typeName, tech, validBrand, validModel]
      .filter(Boolean)
      .join(" ")
      .trim();
  } else {
    return [typeName, validBrand, validModel].filter(Boolean).join(" ").trim();
  }
}

function formatUnitDisplayName(row: any): string {
  return utilFormatUnitDisplayName(row, {
    findBrand: (id) => brands.value.find((b) => String(b.id) === String(id)),
    findUnitType: (id) =>
      unitTypes.value.find((t) => String(t.id) === String(id)),
  });
}

const isDescriptionCustom = ref(false);

watch(
  [
    () => form.type_id,
    () => form.print_tech,
    () => form.brand_id,
    () => form.model,
    () => form.is_copier,
  ],
  ([newType, newTech, newBrand, newModel, newCopier]) => {
    if (!isPrinterOrCopier.value && form.print_tech) {
      form.print_tech = "";
    }
    const autoName = computeUnitName(
      newType,
      form.print_tech,
      newBrand,
      newModel,
      newCopier,
    );
    if (!isDescriptionCustom.value) {
      form.name = autoName;
    }
  },
);

function addRate() {
  form.rates.push({
    paper_size_id: "",
    paper_type_id: null,
    rate_per_page_bw: 0,
    rate_per_page_color: 0,
    free_quota_bw: 0,
    free_quota_color: 0,
    quota_applies_to: "color",
  });
}

function removeRate(index: number) {
  form.rates.splice(index, 1);
}

function openAdd() {
  editingItem.value = null;
  isDescriptionCustom.value = false;
  Object.assign(form, {
    serial_no: "",
    serial_numbers: [],
    temp_serial: "",
    brand_id: null,
    type_id: null,
    print_tech: "",
    uom_id: "",
    model: "",
    name: "",
    specs_text: "",
    price: null,
    is_copier: false,
    is_computer: false,
    current_meter_bw: 0,
    current_meter_color: 0,
    free_quota_color: 0,
    free_quota_bw: 0,
    rates: [],
    specsData: {
      cpu: "",
      ram: "",
      storage: "",
      storage_type: "",
      os: "",
      vga: "",
      office: "",
    },
  });
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  editingItem.value = null;
  form.serial_numbers = [];
  form.temp_serial = "";
  form.serial_no = "";
}

function parseSpecsData(raw: any): {
  cpu: string;
  ram: string;
  storage: string;
  storage_type: string;
  os: string;
  vga: string;
  office: string;
} {
  const defaultSpecs = {
    cpu: "",
    ram: "",
    storage: "",
    storage_type: "",
    os: "",
    vga: "",
    office: "",
  };
  if (!raw) return defaultSpecs;
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return { ...defaultSpecs, ...raw };
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const obj = JSON.parse(trimmed);
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
          return { ...defaultSpecs, ...obj };
        }
      } catch {}
    }
  }
  return defaultSpecs;
}

function openEdit(item: any) {
  if (!item) return;
  editingItem.value = item;
  isDescriptionCustom.value = true;
  let detectedTech = item.print_tech || "";
  if (!detectedTech && item.specs) {
    try {
      const s =
        typeof item.specs === "string" ? JSON.parse(item.specs) : item.specs;
      detectedTech = s?.print_tech || "";
    } catch {}
  }
  if (!detectedTech && item.name) {
    if (/\bLaser\b/i.test(item.name)) detectedTech = "Laser";
    else if (/\bInject\b/i.test(item.name) || /\bInkjet\b/i.test(item.name))
      detectedTech = "Inject";
  }

  const validRates = Array.isArray(item.rates)
    ? item.rates.map((r: any) => ({
        paper_size_id: r.paper_size_id || "",
        paper_type_id: r.paper_type_id ?? null,
        rate_per_page_bw: Number(r.rate_per_page_bw) || 0,
        rate_per_page_color: Number(r.rate_per_page_color) || 0,
        free_quota_bw: Number(r.free_quota_bw) || 0,
        free_quota_color: Number(r.free_quota_color) || 0,
        quota_applies_to:
          r.quota_applies_to === "bw"
            ? "bw"
            : r.quota_applies_to === "both"
              ? "both"
              : "color",
      }))
    : [];

  Object.assign(form, {
    serial_no: item.serial_no || "",
    serial_numbers: [],
    temp_serial: "",
    brand_id: item.brand_id || item.brand?.id || null,
    type_id: item.type_id || item.type?.id || null,
    print_tech: detectedTech,
    uom_id: item.uom_id || item.uom?.id || "",
    model: item.model || "",
    name: item.name || "",
    specs_text: getCleanSpecsString(item),
    price: (item as any).price != null ? Number((item as any).price) : null,
    is_copier: !!item.is_copier,
    is_computer: !!item.is_computer,
    current_meter_bw: Number(item.current_meter_bw) || 0,
    current_meter_color: Number(item.current_meter_color) || 0,
    free_quota_color: Number(item.free_quota_color) || 0,
    free_quota_bw: Number((item as any).free_quota_bw) || 0,
    rates: validRates,
    specsData: parseSpecsData(item.specs),
  });
  showModal.value = true;
}

function generateRandomSN(): string {
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  return `NONSN-${dateStr}-${rand}`;
}

function addAutoSN() {
  const sn = generateRandomSN();
  form.serial_numbers.push(sn);
}

function isNoSN(val: string): boolean {
  const v = (val || "").trim().toUpperCase();
  return (
    v === "-" ||
    v === "NONE" ||
    v === "N/A" ||
    v === "TANPA SN" ||
    v === "NO SN"
  );
}

async function handleSubmit() {
  if (form.temp_serial && form.temp_serial.trim()) {
    addSerialNumber();
  }

  if (editingItem.value) {
    if (
      !form.brand_id ||
      !form.type_id ||
      !form.model?.trim() ||
      !form.serial_no.trim()
    ) {
      toast.warning(
        "Silakan lengkapi kolom Item / Kategori, Merek, Type / Model, dan Serial Number.",
      );
      return;
    }
  } else {
    if (!form.brand_id || !form.type_id || !form.model?.trim()) {
      toast.warning(
        "Silakan lengkapi kolom Item / Kategori, Merek, dan Type / Model.",
      );
      return;
    }
    if (form.serial_numbers.length === 0 && form.serial_no.trim()) {
      let sn = form.serial_no.trim().toUpperCase();
      if (isNoSN(sn)) sn = generateRandomSN();
      form.serial_numbers.push(sn);
    }
    if (form.serial_numbers.length === 0) {
      toast.warning(
        'Silakan masukkan minimal satu Serial Number (SN) atau klik "+ Tanpa SN".',
      );
      return;
    }
  }

  if (isPrinterOrCopier.value && !form.print_tech) {
    toast.warning(
      "Silakan pilih tipe Laser atau Inject untuk Printer / Copier Machine.",
    );
    return;
  }

  try {
    const cleanUomId =
      form.uom_id && form.uom_id.trim() ? form.uom_id.trim() : null;
    const cleanPrice =
      typeof form.price === "number"
        ? form.price
        : form.price
          ? Number(form.price)
          : null;

    const cleanRates = form.is_copier
      ? (form.rates || [])
          .filter(
            (r: any) => r && r.paper_size_id && String(r.paper_size_id).trim(),
          )
          .map((r: any) => ({
            paper_size_id: String(r.paper_size_id).trim(),
            paper_type_id: r.paper_type_id
              ? String(r.paper_type_id).trim()
              : null,
            rate_per_page_bw: Number(r.rate_per_page_bw) || 0,
            rate_per_page_color: Number(r.rate_per_page_color) || 0,
            free_quota_bw: Number(r.free_quota_bw) || 0,
            free_quota_color: Number(r.free_quota_color) || 0,
            quota_applies_to:
              r.quota_applies_to === "bw"
                ? "bw"
                : r.quota_applies_to === "both"
                  ? "both"
                  : "color",
          }))
      : [];

    const payload: any = {
      ...form,
      model: (form.model || "").trim() || "-",
      uom_id: cleanUomId,
      price: cleanPrice,
      print_tech: form.print_tech || undefined,
      specs: form.specs_text
        ? form.specs_text.trim()
        : form.is_computer
          ? JSON.stringify(form.specsData)
          : (editingItem.value as any)?.specs || "",
    };
    delete (payload as any).serial_numbers;
    delete (payload as any).temp_serial;
    delete (payload as any).specsData;
    delete (payload as any).specs_text;

    if (form.is_copier) {
      payload.rates = cleanRates;
    } else {
      delete payload.rates;
    }

    if (editingItem.value) {
      if (isNoSN(payload.serial_no)) {
        payload.serial_no = generateRandomSN();
      }
      await resources.units.update(String(editingItem.value.id), payload);
      toast.success("Unit updated successfully!");
    } else {
      const serials = Array.from(
        new Set(
          form.serial_numbers
            .map((s) => {
              const trimmed = s.trim().toUpperCase();
              return isNoSN(trimmed) ? generateRandomSN() : trimmed;
            })
            .filter(Boolean),
        ),
      );
      if (serials.length === 0) {
        toast.warning("Silakan masukkan Serial Number yang valid.");
        return;
      }

      const promises = serials.map((sn) => {
        return resources.units.create({ ...payload, serial_no: sn });
      });
      await Promise.all(promises);
      toast.success(
        serials.length > 1
          ? `${serials.length} unit berhasil disimpan!`
          : "Unit berhasil disimpan!",
      );
    }
    await fetchData();
    window.dispatchEvent(
      new CustomEvent("bias:data-mutated", { detail: { path: "/units" } }),
    );
    closeModal();
  } catch (error: any) {
    console.error("Failed to save unit:", error);
    toast.error(
      "Failed to save Unit data: " + (error.message || "An error occurred"),
    );
  }
}

function addSerialNumber() {
  let sn = (form.temp_serial || "").trim().toUpperCase();
  if (!sn) return;
  if (isNoSN(sn)) {
    sn = generateRandomSN();
  }
  if (sn && !form.serial_numbers.includes(sn)) {
    form.serial_numbers.push(sn);
  }
  form.temp_serial = "";
}

function handlePasteSerial(e: ClipboardEvent) {
  const text = e.clipboardData?.getData("text") || "";
  if (!text) return;
  if (/[\n,;\t]/.test(text)) {
    e.preventDefault();
    const parts = text
      .split(/[\r\n,;\t]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    let addedCount = 0;
    parts.forEach((sn) => {
      let cleanSN = isNoSN(sn) ? generateRandomSN() : sn;
      if (cleanSN && !form.serial_numbers.includes(cleanSN)) {
        form.serial_numbers.push(cleanSN);
        addedCount++;
      }
    });
    form.temp_serial = "";
    if (addedCount > 0) {
      toast.success(
        `${addedCount} Serial Number berhasil ditambahkan dari clipboard!`,
      );
    }
  }
}

// ── MULTI INPUT UNIT (TAMBAH MASSAL) ──
const showMultiInputModal = ref(false);
const multiInputMode = ref<"paste" | "auto">("paste");
const multiInputSNText = ref("");
const multiInputAutoQty = ref<number>(5);
const isSubmittingMulti = ref(false);

const multiInputForm = reactive({
  brand_id: null as string | null,
  type_id: null as string | null,
  print_tech: "" as string,
  model: "",
  name: "",
  specs_text: "",
  uom_id: "" as string | null,
  price: null as number | null,
  is_copier: false,
});

const isMultiPrinterOrCopier = computed(() => {
  const tName = getTypeName(multiInputForm.type_id).toLowerCase().trim();
  return (
    tName === "printer" ||
    tName.includes("printer") ||
    tName === "photocopy machine" ||
    tName.includes("photocopy") ||
    tName.includes("copier") ||
    Boolean(multiInputForm.is_copier)
  );
});

const isMultiDescriptionCustom = ref(false);

watch(
  [
    () => multiInputForm.type_id,
    () => multiInputForm.print_tech,
    () => multiInputForm.brand_id,
    () => multiInputForm.model,
    () => multiInputForm.is_copier,
  ],
  ([newType, newTech, newBrand, newModel, newCopier]) => {
    if (!isMultiPrinterOrCopier.value && multiInputForm.print_tech) {
      multiInputForm.print_tech = "";
    }
    const autoName = computeUnitName(
      newType,
      multiInputForm.print_tech,
      newBrand,
      newModel,
      newCopier,
    );
    if (!isMultiDescriptionCustom.value) {
      multiInputForm.name = autoName;
    }
  },
);

const parsedMultiSerials = computed(() => {
  if (multiInputMode.value === "auto") {
    const qty = Math.max(
      1,
      Math.min(100, Number(multiInputAutoQty.value) || 1),
    );
    return Array.from({ length: qty }, (_, i) => `(Auto Generate #${i + 1})`);
  }
  const text = multiInputSNText.value || "";
  if (!text.trim()) return [];
  const rawList = text
    .split(/[\r\n,;\t]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return Array.from(new Set(rawList));
});

const multiSerialsCount = computed(() => {
  if (multiInputMode.value === "auto") {
    return Math.max(1, Math.min(100, Number(multiInputAutoQty.value) || 1));
  }
  return parsedMultiSerials.value.length;
});

function openMultiInput() {
  isMultiDescriptionCustom.value = false;
  multiInputMode.value = "paste";
  multiInputSNText.value = "";
  multiInputAutoQty.value = 5;
  Object.assign(multiInputForm, {
    brand_id: null,
    type_id: null,
    print_tech: "",
    model: "",
    name: "",
    specs_text: "",
    uom_id: uoms.value[0]?.id || "",
    price: null,
    is_copier: false,
  });
  showMultiInputModal.value = true;
}

function closeMultiInput() {
  showMultiInputModal.value = false;
}

async function handleMultiInputSubmit() {
  if (
    !multiInputForm.brand_id ||
    !multiInputForm.type_id ||
    !multiInputForm.model?.trim()
  ) {
    toast.warning(
      "Silakan lengkapi kolom Item / Kategori, Merek, dan Type / Model.",
    );
    return;
  }
  if (isMultiPrinterOrCopier.value && !multiInputForm.print_tech) {
    toast.warning(
      "Silakan pilih tipe Laser atau Inject untuk Printer / Copier Machine.",
    );
    return;
  }

  let serialsToCreate: string[] = [];
  if (multiInputMode.value === "auto") {
    const qty = Math.max(
      1,
      Math.min(100, Number(multiInputAutoQty.value) || 1),
    );
    for (let i = 0; i < qty; i++) {
      serialsToCreate.push(generateRandomSN());
    }
  } else {
    serialsToCreate = parsedMultiSerials.value.map((sn) =>
      isNoSN(sn) ? generateRandomSN() : sn,
    );
    if (serialsToCreate.length === 0) {
      toast.warning(
        "Silakan masukkan minimal satu Serial Number pada kotak input.",
      );
      return;
    }
  }

  isSubmittingMulti.value = true;
  try {
    const cleanUomId =
      multiInputForm.uom_id && multiInputForm.uom_id.trim()
        ? multiInputForm.uom_id.trim()
        : null;
    const cleanPrice =
      typeof multiInputForm.price === "number"
        ? multiInputForm.price
        : multiInputForm.price
          ? Number(multiInputForm.price)
          : null;

    const basePayload = {
      brand_id: multiInputForm.brand_id,
      type_id: multiInputForm.type_id,
      model: multiInputForm.model.trim() || "-",
      name: multiInputForm.name.trim(),
      specs: multiInputForm.specs_text ? multiInputForm.specs_text.trim() : "",
      uom_id: cleanUomId,
      price: cleanPrice,
      print_tech: multiInputForm.print_tech || undefined,
      is_copier: Boolean(multiInputForm.is_copier),
    };

    const chunkSize = 5;
    let successCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < serialsToCreate.length; i += chunkSize) {
      const chunk = serialsToCreate.slice(i, i + chunkSize);
      const results = await Promise.allSettled(
        chunk.map((sn) =>
          resources.units.create({ ...basePayload, serial_no: sn }),
        ),
      );
      results.forEach((res, idx) => {
        if (res.status === "fulfilled") {
          successCount++;
        } else {
          errors.push(
            `${chunk[idx]}: ${res.reason?.message || "Gagal menyimpan"}`,
          );
        }
      });
    }

    if (errors.length > 0) {
      if (successCount > 0) {
        toast.warning(
          `${successCount} unit berhasil disimpan, namun ${errors.length} unit gagal: ${errors[0]}`,
        );
      } else {
        toast.error(`Gagal menyimpan unit: ${errors[0]}`);
        return;
      }
    } else {
      toast.success(`Berhasil menambahkan ${successCount} unit sekaligus!`);
    }

    await fetchData();
    window.dispatchEvent(
      new CustomEvent("bias:data-mutated", { detail: { path: "/units" } }),
    );
    closeMultiInput();
  } catch (error: any) {
    console.error("Failed to submit multi input:", error);
    toast.error("Gagal menyimpan unit: " + (error.message || "Error"));
  } finally {
    isSubmittingMulti.value = false;
  }
}

function openDelete(item: Unit) {
  deletingItem.value = item;
  showConfirm.value = true;
}

const hardDelete = useHardDelete(
  (id: string) => resources.units.hardRemove(id),
  fetchData,
);

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.units.remove(String(deletingItem.value.id));
      await fetchData();
      toast.success("Unit deleted successfully!");
    } catch (error) {
      console.error("Failed to delete unit:", error);
      toast.error("Failed to delete Unit data");
    }
  }
  showConfirm.value = false;
}

function getBrandName(id: string | null): string {
  if (!id) return "-";
  const b = brands.value.find((b) => b.id === id);
  return b ? b.name : "-";
}

function statusBadgeClass(status: string | null | undefined): string {
  switch ((status || "").toLowerCase()) {
    case "available":
      return "badge-success";
    case "lock":
    case "locked":
      return "badge-warning";
    case "rented":
      return "badge-info";
    case "maintenance":
      return "badge-warning";
    case "broken":
      return "badge-danger";
    case "sold":
      return "badge-neutral";
    default:
      return "badge-neutral";
  }
}

function formatStatus(status: string | null | undefined): string {
  if (!status) return "-";
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatRupiah(val: number | null | undefined): string {
  if (val === null || val === undefined) return "-";
  return "Rp " + Number(val).toLocaleString("id-ID");
}

const badgeTrue = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "24px",
  height: "24px",
  borderRadius: "50%",
  backgroundColor: "#dcfce7",
  color: "#16a34a",
};

const badgeFalse = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "24px",
  height: "24px",
  borderRadius: "50%",
  backgroundColor: "#fee2e2",
  color: "#dc2626",
};

async function exportStockExcel() {
  const exportItems = filteredData.value;
  if (!exportItems.length) {
    toast.error("Tidak ada data stok unit untuk diekspor");
    return;
  }

  const dateStr = new Date().toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const totalItems = exportItems.length;
  const availableItems = exportItems.filter(
    (u) => (u.status || "").toLowerCase() === "available",
  ).length;
  const rentedItems = exportItems.filter(
    (u) => (u.status || "").toLowerCase() === "rented",
  ).length;
  const exportTotalVal = exportItems.reduce(
    (acc, u) => acc + (Number((u as any).price) || 0),
    0,
  );

  const rows: StyledCell[][] = [
    [{ v: "PT. BIAS SURYA TEKNOLOGI", mergeAcross: 8, style: "titleCell" }],
    [
      {
        v: "LAPORAN STOK & DAFTAR ASET UNIT (PRINTER, COPIER, PC / LAPTOP)",
        mergeAcross: 8,
        style: "plainBoldCenter",
      },
    ],
    [
      {
        v: "Ruko Purimas Blok A No.47 Kota Batam, Kepulauan Riau - Indonesia | Phone: +62 811 7045 657",
        mergeAcross: 8,
        style: "subTitleCell",
      },
    ],
    [
      {
        v: `Tanggal Cetak: ${dateStr}${selectedStatus.value !== "all" ? ` | Filter Status: ${formatStatus(selectedStatus.value)}` : ""}`,
        mergeAcross: 8,
        style: "subTitleCell",
      },
    ],
    [],
    [
      {
        v: "RINGKASAN STATUS & VALUASI UNIT",
        mergeAcross: 8,
        style: "plainBoldCenter",
      },
    ],
    [
      { v: "Total Unit Terdaftar", style: "headerCell", mergeAcross: 1 },
      {},
      { v: "Unit Available (Siap)", style: "headerCell", mergeAcross: 1 },
      {},
      { v: "Unit Rented (Disewa)", style: "headerCell", mergeAcross: 1 },
      {},
      {
        v: "Total Estimasi Nilai Unit (Rp)",
        style: "headerCell",
        mergeAcross: 2,
      },
      {},
      {},
    ],
    [
      { v: `${totalItems} Unit`, style: "grandTotalCell", mergeAcross: 1 },
      {},
      { v: `${availableItems} Unit`, style: "grandTotalCell", mergeAcross: 1 },
      {},
      { v: `${rentedItems} Unit`, style: "grandTotalCell", mergeAcross: 1 },
      {},
      {
        v: exportTotalVal,
        style: "grandTotalCell",
        mergeAcross: 2,
        numFmt: NUMFMT_RP,
      },
      {},
      {},
    ],
    [],
    [
      { v: "No", style: "headerCell" },
      { v: "Serial Number (SN)", style: "headerCell" },
      { v: "Nama Lengkap Unit", style: "headerCell" },
      { v: "Brand", style: "headerCell" },
      { v: "Model", style: "headerCell" },
      { v: "Tipe / Kategori", style: "headerCell" },
      { v: "Status", style: "headerCell" },
      { v: "Meter (BW / Color)", style: "headerCell" },
      { v: "Nilai Unit (Rp)", style: "headerCell" },
    ],
  ];

  exportItems.forEach((u, idx) => {
    const priceVal = Number((u as any).price) || 0;
    const meterStr = u.is_copier
      ? `${u.current_meter_bw || 0} / ${u.current_meter_color || 0}`
      : "-";
    const brandName = getBrandName(u.brand_id);
    const typeName = getTypeName(u.type_id);

    rows.push([
      { v: idx + 1, style: "borderCenter" },
      { v: u.serial_no || "-", style: "borderCenter" },
      { v: formatUnitDisplayName(u), style: "border" },
      { v: brandName, style: "border" },
      { v: u.model || "-", style: "border" },
      { v: typeName || "-", style: "border" },
      { v: formatStatus(u.status), style: "borderCenter" },
      { v: meterStr, style: "borderCenter" },
      { v: priceVal, style: "borderBoldRight", numFmt: NUMFMT_RP },
    ]);
  });

  // Grand Total row
  rows.push([
    { v: "GRAND TOTAL", mergeAcross: 7, style: "grandTotalCell" },
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    { v: exportTotalVal, style: "grandTotalCell", numFmt: NUMFMT_RP },
  ]);

  const columnWidths = [6, 20, 36, 16, 18, 18, 16, 20, 22];
  await downloadStyledExcel(
    [{ name: "Stok Unit BiAS", columnWidths, rows }],
    `Laporan_Stok_Unit_BiAS_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
  toast.success("Laporan stok unit berhasil diekspor ke Excel!");
}

function exportStockPdf() {
  const exportItems = filteredData.value;
  if (!exportItems.length) {
    toast.error("Tidak ada data stok unit untuk diekspor");
    return;
  }
  const dateStr = new Date().toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const totalItems = exportItems.length;
  const availableItems = exportItems.filter(
    (u) => (u.status || "").toLowerCase() === "available",
  ).length;
  const rentedItems = exportItems.filter(
    (u) => (u.status || "").toLowerCase() === "rented",
  ).length;
  const exportTotalVal = exportItems.reduce(
    (acc, u) => acc + (Number((u as any).price) || 0),
    0,
  );
  const totalValStr = formatRupiah(exportTotalVal);

  const rowsHtml = exportItems
    .map((u, idx) => {
      const priceVal = Number((u as any).price) || 0;
      const meterStr = u.is_copier
        ? `${(u.current_meter_bw || 0).toLocaleString("id-ID")} / ${(u.current_meter_color || 0).toLocaleString("id-ID")}`
        : "-";
      const brandName = getBrandName(u.brand_id);
      const typeName = getTypeName(u.type_id);
      const statusText = formatStatus(u.status);

      let statusColor = "#64748b";
      if ((u.status || "").toLowerCase() === "available")
        statusColor = "#16a34a";
      else if ((u.status || "").toLowerCase() === "rented")
        statusColor = "#0284c7";
      else if ((u.status || "").toLowerCase() === "maintenance")
        statusColor = "#d97706";

      return `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td style="text-align: center; font-family: monospace; font-weight: 600;">${u.serial_no || "-"}</td>
        <td style="font-weight: 500;">${formatUnitDisplayName(u)}</td>
        <td>${brandName}</td>
        <td>${u.model || "-"}</td>
        <td>${typeName || "-"}</td>
        <td style="text-align: center; font-weight: 600; color: ${statusColor};">${statusText}</td>
        <td style="text-align: center;">${meterStr}</td>
        <td style="text-align: right; font-weight: 700;">${priceVal > 0 ? "Rp " + priceVal.toLocaleString("id-ID") : "-"}</td>
      </tr>
    `;
    })
    .join("");

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Laporan Stok & Daftar Unit - BiAS</title>
  <style>
    @media print {
      @page { margin: 8mm; size: landscape; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1e293b; margin: 0; padding: 15px; }
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; border-bottom: 2px solid #003366; padding-bottom: 10px; }
    .logo { width: 70px; height: 70px; object-fit: contain; }
    .company-title h1 { margin: 0; font-size: 18px; font-weight: 800; color: #003366; letter-spacing: 0.5px; }
    .company-title h2 { margin: 2px 0 4px 0; font-size: 12px; font-style: italic; color: #64748b; font-weight: normal; }
    .company-title p { margin: 0; font-size: 10px; color: #475569; line-height: 1.4; }
    .doc-title { text-align: right; vertical-align: top; }
    .doc-title h2 { margin: 0; font-size: 18px; font-weight: 800; color: #003366; }
    .doc-title p { margin: 4px 0 0 0; font-size: 11px; color: #64748b; }
    
    .kpi-container { display: flex; gap: 12px; margin-bottom: 16px; }
    .kpi-card { flex: 1; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 14px; }
    .kpi-label { font-size: 10px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 3px; }
    .kpi-val { font-size: 16px; font-weight: 800; color: #0f172a; }

    table.data-table { width: 100%; border-collapse: collapse; margin-top: 5px; }
    table.data-table thead { display: table-header-group; }
    table.data-table tr { page-break-inside: avoid; }
    table.data-table th { background-color: #003366; color: #ffffff; border: 1px solid #002244; padding: 7px 8px; text-align: left; font-size: 10.5px; }
    table.data-table td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 10.5px; vertical-align: middle; }
    table.data-table tr:nth-child(even) { background-color: #f8fafc; }
    table.data-table tfoot td { background-color: #e2e8f0; font-weight: 800; border: 1px solid #94a3b8; }
  </style>
</head>
<body>
  <table class="header-table">
    <tr>
      <td style="width: 80px; vertical-align: top;">
        <img src="${BIAS_LOGO_DATA_URL}" class="logo" alt="BiAS Logo" />
      </td>
      <td style="vertical-align: top; padding-left: 10px;">
        <div class="company-title">
          <h1>PT. BIAS SURYA TEKNOLOGI</h1>
          <h2>The shape of smart</h2>
          <p>Ruko Purimas Blok A No.47 Kota Batam, Kepulauan Riau - Indonesia<br>
          Phone: +62811 704 5657 | Email: admin@biasbst.com | Web: www.biassuryateknologi.com</p>
        </div>
      </td>
      <td class="doc-title">
        <h2>LAPORAN STOK & DAFTAR UNIT</h2>
        <p>Tanggal Cetak: <strong>${dateStr}</strong></p>
      </td>
    </tr>
  </table>

  <div class="kpi-container">
    <div class="kpi-card">
      <div class="kpi-label">Total Unit Aset</div>
      <div class="kpi-val">${totalItems} Unit</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Unit Available (Siap)</div>
      <div class="kpi-val" style="color: #16a34a;">${availableItems} Unit</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Unit Rented (Disewa)</div>
      <div class="kpi-val" style="color: #0284c7;">${rentedItems} Unit</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total Estimasi Nilai Unit</div>
      <div class="kpi-val" style="color: #003366;">${totalValStr}</div>
    </div>
  </div>

  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 35px; text-align: center;">No</th>
        <th style="width: 110px; text-align: center;">Serial Number (SN)</th>
        <th>Nama Unit / Produk</th>
        <th style="width: 100px;">Brand</th>
        <th style="width: 100px;">Model</th>
        <th style="width: 110px;">Tipe Unit</th>
        <th style="width: 90px; text-align: center;">Status</th>
        <th style="width: 100px; text-align: center;">Meter (BW/Col)</th>
        <th style="width: 130px; text-align: right;">Estimasi Nilai</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="6" style="text-align: center;">GRAND TOTAL UNIT: ${totalItems}</td>
        <td colspan="2" style="text-align: right;">Total Nilai Aset:</td>
        <td style="text-align: right; color: #003366;">${totalValStr}</td>
      </tr>
    </tfoot>
  </table>

  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 400);
    };
  <\/script>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(fullHtml);
    w.document.close();
  } else {
    toast.error(
      "Pop-up terblokir oleh browser. Izinkan pop-up untuk mencetak PDF.",
    );
  }
}
</script>

<template>
  <div>
    <!-- Skeleton Screen -->
    <PageSkeleton
      v-if="isLoading"
      :cards="5"
      :columns="10"
      :rows="8"
      :show-header-actions="true"
    />

    <!-- Real Content -->
    <div v-show="!isLoading">
      <PageHeader
        title="Products"
        :button-label="isTechnician ? undefined : 'Add Product'"
        permission="unit:create"
        @add="openAdd"
      >
        <template #actions>
          <button
            v-if="!isTechnician"
            class="btn btn-primary"
            style="
              display: flex;
              align-items: center;
              gap: 6px;
              background: #0284c7;
              border-color: #0284c7;
            "
            @click="openMultiInput"
            title="Input banyak unit / serial number sekaligus"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="2" y="7" width="16" height="14" rx="2"></rect>
              <path d="M18 3H6a2 2 0 0 0-2 2v2h16V5a2 2 0 0 0-2-2z"></path>
              <line x1="10" y1="12" x2="10" y2="16"></line>
              <line x1="8" y1="14" x2="12" y2="14"></line>
            </svg>
            + Multi Input Unit
          </button>
          <button
            class="btn btn-outline"
            @click="exportStockPdf"
            style="display: flex; align-items: center; gap: 6px"
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
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
              ></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            Export Unit Stock PDF
          </button>
          <button
            class="btn btn-outline"
            @click="exportStockExcel"
            style="display: flex; align-items: center; gap: 6px"
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
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
              ></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="8" y1="13" x2="16" y2="17"></line>
              <line x1="16" y1="13" x2="8" y2="17"></line>
            </svg>
            Export Unit Stock Excel
          </button>
        </template>
      </PageHeader>

      <!-- Summary Cards -->
      <div
        style="
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 16px;
          margin-bottom: 20px;
        "
      >
        <div
          class="card p-md summary-card"
          :class="{ 'card-active': selectedStatus === 'all' }"
          title="Klik untuk menampilkan semua unit"
          @click="selectedStatus = 'all'"
        >
          <div
            style="
              font-size: 12px;
              color: var(--color-text-muted);
              font-weight: 600;
              text-transform: uppercase;
            "
          >
            Total Unit Aset
          </div>
          <div
            style="
              font-size: 24px;
              font-weight: bold;
              margin-top: 4px;
              color: var(--color-text);
            "
          >
            {{ totalUnitCount }} Unit
          </div>
        </div>
        <div
          class="card p-md summary-card"
          :class="{ 'card-active': selectedStatus === 'available' }"
          title="Klik untuk memfilter unit Available (Siap)"
          @click="
            selectedStatus =
              selectedStatus === 'available' ? 'all' : 'available'
          "
        >
          <div
            style="
              font-size: 12px;
              color: var(--color-text-muted);
              font-weight: 600;
              text-transform: uppercase;
            "
          >
            Unit Available (Siap)
          </div>
          <div
            style="
              font-size: 24px;
              font-weight: bold;
              margin-top: 4px;
              color: #16a34a;
            "
          >
            {{ totalAvailableCount }} Unit
          </div>
        </div>
        <div
          class="card p-md summary-card"
          :class="{ 'card-active': selectedStatus === 'lock' }"
          title="Klik untuk memfilter unit Lock (Terkunci)"
          @click="selectedStatus = selectedStatus === 'lock' ? 'all' : 'lock'"
        >
          <div
            style="
              font-size: 12px;
              color: var(--color-text-muted);
              font-weight: 600;
              text-transform: uppercase;
            "
          >
            Unit Lock (Terkunci)
          </div>
          <div
            style="
              font-size: 24px;
              font-weight: bold;
              margin-top: 4px;
              color: #d97706;
            "
          >
            {{ totalLockCount }} Unit
          </div>
        </div>
        <div
          class="card p-md summary-card"
          :class="{ 'card-active': selectedStatus === 'rented' }"
          title="Klik untuk memfilter unit Rented (Disewa)"
          @click="
            selectedStatus = selectedStatus === 'rented' ? 'all' : 'rented'
          "
        >
          <div
            style="
              font-size: 12px;
              color: var(--color-text-muted);
              font-weight: 600;
              text-transform: uppercase;
            "
          >
            Unit Rented (Disewa)
          </div>
          <div
            style="
              font-size: 24px;
              font-weight: bold;
              margin-top: 4px;
              color: #0284c7;
            "
          >
            {{ totalRentedCount }} Unit
          </div>
        </div>
        <div
          class="card p-md"
          style="
            background: var(--color-surface, #fff);
            border: 1px solid var(--color-border-light);
            border-radius: 8px;
            padding: 16px;
          "
        >
          <div
            style="
              font-size: 12px;
              color: var(--color-text-muted);
              font-weight: 600;
              text-transform: uppercase;
            "
          >
            Total Nilai Aset Unit
          </div>
          <div
            style="
              font-size: 24px;
              font-weight: bold;
              margin-top: 4px;
              color: #003366;
            "
          >
            {{ formatRupiah(totalUnitValue) }}
          </div>
        </div>
      </div>
      <!-- Bulk Action Bar -->
      <transition name="fade">
        <div
          v-if="selectedCount > 0"
          class="bulk-action-bar"
        >
          <div class="bulk-left">
            <span class="bulk-badge">{{ selectedCount }}</span>
            <span class="bulk-label">unit terpilih</span>
          </div>
          <div class="bulk-right">
            <button
              type="button"
              class="btn btn-sm btn-outline"
              @click="selectedKeys = []"
            >
              Batal Pilihan
            </button>
            <button
              v-if="can('unit:delete')"
              type="button"
              class="btn btn-sm btn-danger"
              style="display: inline-flex; align-items: center; gap: 6px;"
              @click="showBulkDeleteConfirm = true"
              :disabled="isBulkDeleting"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="3 6 5 6 21 6"></polyline>
                <path
                  d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"
                ></path>
              </svg>
              Hapus {{ selectedCount }} Unit Terpilih
            </button>
          </div>
        </div>
      </transition>

      <DataTable
        :columns="columns"
        :data="filteredData"
        :loading="isLoading"
        search-placeholder="Search products..."
        permission="unit"
        :show-detail="true"
        detail-title="Tracking Customer"
        detail-icon="tracking"
        @detail="openTracking"
        @row-click="openTracking"
        @edit="openEdit"
        @delete="openDelete"
        :show-hard-delete="hardDelete.isSuperadmin"
        @hard-delete="hardDelete.open"
        :selectable="true"
        v-model:selectedKeys="selectedKeys"
      >
        <template #toolbar>
          <div class="unit-toolbar-filters">
            <!-- Multi SN Search -->
            <div class="search-sn-box">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="search-sn-icon"
              >
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                v-model="searchSN"
                type="text"
                class="form-input search-sn-input"
                placeholder="Cari SN... (contoh: SN1, SN2)"
              />
              <button
                v-if="searchSN"
                type="button"
                class="btn-clear-sn"
                title="Hapus pencarian SN"
                @click="searchSN = ''"
              >
                &times;
              </button>
            </div>

            <!-- Status Filter -->
            <div class="status-filter-box">
              <select
                v-model="selectedStatus"
                class="form-select status-select"
              >
                <option value="all">Semua Status ({{ totalUnitCount }})</option>
                <option value="available">
                  Available / Siap ({{ totalAvailableCount }})
                </option>
                <option value="lock">
                  Lock / Terkunci ({{ totalLockCount }})
                </option>
                <option value="rented">
                  Rented / Disewa ({{ totalRentedCount }})
                </option>
                <option value="maintenance">
                  Maintenance ({{ totalMaintenanceCount }})
                </option>
                <option value="broken">Broken ({{ totalBrokenCount }})</option>
                <option value="sold">Sold ({{ totalSoldCount }})</option>
              </select>
              <button
                v-if="selectedStatus !== 'all'"
                type="button"
                class="btn btn-outline btn-reset-filter"
                title="Reset filter status"
                @click="selectedStatus = 'all'"
              >
                Reset
              </button>
            </div>
          </div>
          <ExcelImportButtons master-key="unit" @imported="fetchData" />
        </template>

        <template #cell-name="{ row }">
          <div class="unit-name-cell">
            <span class="unit-title">{{ row.name || formatUnitDisplayName(row) }}</span>
            <span
              v-if="row.is_external"
              class="badge badge-warning badge-external"
              >External</span
            >
          </div>
        </template>

        <template #cell-serial_no="{ value }">
          <span class="sn-badge" :title="value">
            {{ value || "-" }}
          </span>
        </template>

        <template #cell-uom.name="{ row }">
          {{ row.uom?.name ?? "-" }}
        </template>
        <template #cell-price="{ value }">
          {{ formatRupiah(value) }}
        </template>
        <template #cell-status="{ value }">
          <span class="badge" :class="statusBadgeClass(value)" style="white-space: nowrap;">
            {{ formatStatus(value) }}
          </span>
        </template>
        <template #cell-is_copier="{ value }">
          <div style="display: flex; justify-content: center;">
            <span :style="value ? badgeTrue : badgeFalse" :title="value ? 'Photocopy Machine' : 'Non-Copier'">
              <svg
                v-if="value"
                xmlns="http://www.w3.org/2000/svg"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <svg
                v-else
                xmlns="http://www.w3.org/2000/svg"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
          </div>
        </template>
      </DataTable>
    </div>
    <FormModal
      v-if="!isTechnician"
      :open="showModal"
      :title="editingItem ? 'Edit Product' : 'Add Product'"
      @close="closeModal"
      @submit="handleSubmit"
    >
      <!-- 1. Item / Kategori -->
      <div class="form-group" style="position: relative">
        <label for="unit-type" class="form-label">
          Item / Kategori
          <span class="text-danger" style="color: var(--color-danger, #ef4444)"
            >*</span
          >
        </label>
        <CustomSelect
          id="unit-type"
          v-model="form.type_id"
          :options="typeOptions"
          placeholder="Pilih Item / Kategori"
        />
      </div>
      <div
        v-if="isPrinterOrCopier"
        class="form-group"
        style="position: relative"
      >
        <label for="unit-print-tech" class="form-label">
          Kategori Cetak (Laser / Inject)
          <span class="text-danger" style="color: var(--color-danger, #ef4444)"
            >*</span
          >
        </label>
        <CustomSelect
          id="unit-print-tech"
          v-model="form.print_tech"
          :options="printTechOptions"
          placeholder="-- Pilih Laser atau Inject --"
        />
      </div>

      <!-- 2. Merek -->
      <div class="form-group" style="position: relative">
        <label for="unit-brand" class="form-label">
          Merek
          <span class="text-danger" style="color: var(--color-danger, #ef4444)"
            >*</span
          >
        </label>
        <CustomSelect
          id="unit-brand"
          v-model="form.brand_id"
          :options="brandOptions"
          placeholder="Pilih Merek"
        />
      </div>

      <!-- 3. Type / Model -->
      <div class="form-group">
        <label for="unit-model" class="form-label">
          Type / Model
          <span class="text-danger" style="color: var(--color-danger, #ef4444)"
            >*</span
          >
        </label>
        <input
          id="unit-model"
          v-model="form.model"
          type="text"
          class="form-input"
          placeholder="Unit type / model (Contoh: IR 2520, L3110, dll)"
        />
      </div>

      <!-- 4. Description (sebelumnya Product Name) -->
      <div class="form-group">
        <label for="unit-name" class="form-label">Description</label>
        <textarea
          id="unit-name"
          v-model="form.name"
          class="form-textarea"
          rows="2"
          @input="isDescriptionCustom = form.name.trim().length > 0"
        ></textarea>
      </div>

      <!-- Spesifikasi (Optional - teks bebas) -->
      <div class="form-group">
        <label for="unit-specs" class="form-label">
          Spesifikasi
          <span
            style="
              font-weight: normal;
              font-size: 12px;
              color: var(--color-text-muted);
            "
          >
            (Optional - teks bebas)</span
          >
        </label>
        <textarea
          id="unit-specs"
          v-model="form.specs_text"
          class="form-textarea"
          rows="2"
          placeholder="Contoh: Core i5, RAM 8GB, SSD 512GB, Windows 11"
        ></textarea>
      </div>

      <!-- 5. SN (Serial Number) -->
      <div class="form-group">
        <div
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
          "
        >
          <label for="unit-serial" class="form-label" style="margin-bottom: 0">
            SN (Serial Number)
            <span
              v-if="!editingItem"
              style="
                font-weight: normal;
                font-size: 0.85em;
                color: var(--color-text-light);
              "
              >(Tekan enter atau koma untuk menambah)</span
            >
          </label>
          <button
            v-if="!editingItem"
            type="button"
            class="btn btn-xs btn-outline"
            style="
              font-size: 0.75rem;
              padding: 2px 8px;
              border-radius: 4px;
              cursor: pointer;
              border-color: var(--color-primary);
              color: var(--color-primary);
            "
            @click="addAutoSN"
            title="Generate SN otomatis untuk unit yang tidak memiliki serial number pabrik (Lampu, Kabel, Modul, dll)"
          >
            + Tanpa SN (Auto Generate)
          </button>
        </div>

        <div
          v-if="!editingItem"
          class="tags-input-container"
          style="
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            padding: 6px 12px;
            border: 1px solid var(--color-border);
            border-radius: 6px;
            min-height: 42px;
            align-items: center;
            background: var(--color-surface);
            transition: border-color 0.2s;
          "
        >
          <span
            v-for="(sn, index) in form.serial_numbers"
            :key="index"
            class="badge"
            style="
              background-color: var(--color-primary);
              color: white;
              display: flex;
              align-items: center;
              gap: 6px;
              padding: 4px 8px;
              border-radius: 4px;
              font-size: 0.85rem;
            "
          >
            {{ sn }}
            <button
              type="button"
              @click="form.serial_numbers.splice(index, 1)"
              style="
                background: transparent;
                border: none;
                color: white;
                cursor: pointer;
                padding: 0;
                display: flex;
                align-items: center;
                font-size: 1.1rem;
                line-height: 1;
              "
            >
              &times;
            </button>
          </span>
          <input
            type="text"
            v-model="form.temp_serial"
            @input="
              form.temp_serial = (
                $event.target as HTMLInputElement
              ).value.toUpperCase()
            "
            @paste="handlePasteSerial"
            @keydown.enter.prevent="addSerialNumber"
            @keydown.comma.prevent="addSerialNumber"
            @blur="addSerialNumber"
            style="
              flex: 1;
              min-width: 140px;
              border: none;
              outline: none;
              background: transparent;
              text-transform: uppercase;
              padding: 2px 0;
              font-size: 0.875rem;
              color: var(--color-text);
            "
            placeholder="KETIK SN LALU ENTER, ATAU PASTE BANYAK SN"
          />
        </div>

        <div v-else style="display: flex; gap: 8px">
          <input
            id="unit-serial"
            v-model="form.serial_no"
            @input="
              form.serial_no = (
                $event.target as HTMLInputElement
              ).value.toUpperCase()
            "
            type="text"
            class="form-input flex-1"
            style="text-transform: uppercase"
            placeholder="Product serial number (SN)"
          />
          <button
            type="button"
            class="btn btn-xs btn-outline"
            @click="form.serial_no = generateRandomSN()"
            title="Generate SN unik otomatis"
          >
            Auto SN
          </button>
        </div>
      </div>

      <!-- 6. Satuan -->
      <div class="form-group" style="position: relative">
        <label for="uom" class="form-label">Satuan</label>
        <CustomSelect
          id="uom"
          v-model="form.uom_id"
          :options="uomOptions"
          placeholder="Pilih Satuan"
        />
      </div>

      <!-- 7. Price (Optional) -->
      <div class="form-group">
        <label for="unit-price" class="form-label">Price (Optional)</label>
        <input
          id="unit-price"
          v-model.number="form.price"
          type="number"
          class="form-input"
          placeholder="e.g. 15000000"
          min="0"
        />
      </div>

      <!-- 8. Is a Photocopy Machine -->
      <div class="form-group" style="margin-top: 1rem">
        <label
          class="form-label"
          style="
            display: flex;
            align-items: center;
            gap: 0.5rem;
            cursor: pointer;
          "
        >
          <input
            type="checkbox"
            v-model="form.is_copier"
            style="width: 1rem; height: 1rem"
          />
          Is a Photocopy Machine
        </label>
      </div>
    </FormModal>

    <!-- Customer Tracking Modal -->
    <CustomerTrackingModal
      :open="showTrackingModal"
      target-kind="unit"
      :item="trackingItem"
      :display-title="
        trackingItem
          ? trackingItem.name || formatUnitDisplayName(trackingItem)
          : ''
      "
      code-label="SN"
      :code-value="trackingItem?.serial_no || ''"
      :item-type-label="
        trackingItem
          ? trackingItem.type?.name || getTypeName(trackingItem.type_id)
          : ''
      "
      :brand-name="
        trackingItem
          ? trackingItem.brand?.name || getBrandName(trackingItem.brand_id)
          : ''
      "
      :can-edit="!isTechnician && can('unit:update')"
      @close="showTrackingModal = false"
      @edit="
        (item) => {
          openEdit(item);
          showTrackingModal = false;
        }
      "
    />
    <ConfirmDialog
      :open="showConfirm"
      title="Delete Product"
      :message="`Are you sure you want to delete this product?`"
      @close="showConfirm = false"
      @confirm="handleDelete"
    />
    <ConfirmDialog
      :open="showBulkDeleteConfirm"
      title="Hapus Unit Terpilih"
      :message="`Yakin ingin menghapus ${selectedCount} unit yang dipilih? Tindakan ini tidak dapat dibatalkan.`"
      @close="showBulkDeleteConfirm = false"
      @confirm="handleBulkDelete"
    />
    <HardDeleteDialog
      :open="hardDelete.show"
      title="Hapus Permanen Product"
      :item-label="hardDelete.expected"
      :expected="hardDelete.expected"
      :confirm-valid="hardDelete.confirmed"
      @close="hardDelete.close"
      @confirm="hardDelete.confirm"
      @update:input="hardDelete.input = $event"
    />

    <!-- Multi Input Modal -->
    <FormModal
      v-if="!isTechnician"
      :open="showMultiInputModal"
      title="Multi Input Products / Units (Tambah Massal)"
      max-width="640px"
      @close="closeMultiInput"
      @submit="handleMultiInputSubmit"
    >
      <!-- Item / Kategori -->
      <div class="form-group" style="position: relative">
        <label for="multi-unit-type" class="form-label">
          Item / Kategori
          <span class="text-danger" style="color: var(--color-danger, #ef4444)"
            >*</span
          >
        </label>
        <CustomSelect
          id="multi-unit-type"
          v-model="multiInputForm.type_id"
          :options="typeOptions"
          placeholder="Pilih Item / Kategori"
        />
      </div>

      <!-- Kategori Cetak (Laser / Inject) -->
      <div
        v-if="isMultiPrinterOrCopier"
        class="form-group"
        style="position: relative"
      >
        <label for="multi-unit-print-tech" class="form-label">
          Kategori Cetak (Laser / Inject)
          <span class="text-danger" style="color: var(--color-danger, #ef4444)"
            >*</span
          >
        </label>
        <CustomSelect
          id="multi-unit-print-tech"
          v-model="multiInputForm.print_tech"
          :options="printTechOptions"
          placeholder="-- Pilih Laser atau Inject --"
        />
      </div>

      <!-- Merek -->
      <div class="form-group" style="position: relative">
        <label for="multi-unit-brand" class="form-label">
          Merek
          <span class="text-danger" style="color: var(--color-danger, #ef4444)"
            >*</span
          >
        </label>
        <CustomSelect
          id="multi-unit-brand"
          v-model="multiInputForm.brand_id"
          :options="brandOptions"
          placeholder="Pilih Merek"
        />
      </div>

      <!-- Type / Model -->
      <div class="form-group">
        <label for="multi-unit-model" class="form-label">
          Type / Model
          <span class="text-danger" style="color: var(--color-danger, #ef4444)"
            >*</span
          >
        </label>
        <input
          id="multi-unit-model"
          v-model="multiInputForm.model"
          type="text"
          class="form-input"
          placeholder="Unit type / model (Contoh: IR 2520, L3110, dll)"
        />
      </div>

      <!-- Description -->
      <div class="form-group">
        <label for="multi-unit-name" class="form-label">Description</label>
        <textarea
          id="multi-unit-name"
          v-model="multiInputForm.name"
          class="form-textarea"
          rows="2"
          @input="
            isMultiDescriptionCustom = multiInputForm.name.trim().length > 0
          "
        ></textarea>
      </div>

      <!-- Satuan & Price Grid -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px">
        <div class="form-group" style="position: relative; margin-bottom: 0">
          <label for="multi-uom" class="form-label">Satuan</label>
          <CustomSelect
            id="multi-uom"
            v-model="multiInputForm.uom_id"
            :options="uomOptions"
            placeholder="Pilih Satuan"
          />
        </div>
        <div class="form-group" style="margin-bottom: 0">
          <label for="multi-price" class="form-label">Price (Optional)</label>
          <input
            id="multi-price"
            v-model.number="multiInputForm.price"
            type="number"
            class="form-input"
            placeholder="e.g. 15000000"
            min="0"
          />
        </div>
      </div>

      <!-- Is Copier -->
      <div class="form-group" style="margin-top: 10px; margin-bottom: 12px">
        <label
          class="form-label"
          style="
            display: flex;
            align-items: center;
            gap: 0.5rem;
            cursor: pointer;
          "
        >
          <input
            type="checkbox"
            v-model="multiInputForm.is_copier"
            style="width: 1rem; height: 1rem"
          />
          Is a Photocopy Machine
        </label>
      </div>

      <!-- Spesifikasi -->
      <div class="form-group">
        <label for="multi-specs" class="form-label">
          Spesifikasi
          <span
            style="
              font-weight: normal;
              font-size: 12px;
              color: var(--color-text-muted);
            "
          >
            (Optional)</span
          >
        </label>
        <textarea
          id="multi-specs"
          v-model="multiInputForm.specs_text"
          class="form-textarea"
          rows="2"
          placeholder="Contoh: Core i5, RAM 8GB, SSD 512GB"
        ></textarea>
      </div>

      <!-- SECTION: SERIAL NUMBERS MULTI INPUT -->
      <div
        style="
          background: var(--color-background-soft, #f8fafc);
          border: 1px solid var(--color-border-light, #e2e8f0);
          border-radius: 8px;
          padding: 14px;
          margin-top: 10px;
        "
      >
        <div
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 10px;
          "
        >
          <label class="form-label" style="margin-bottom: 0; font-weight: 700">
            Metode Multi Serial Number (SN)
          </label>
          <div
            style="
              display: flex;
              gap: 4px;
              background: var(--color-surface, #fff);
              padding: 2px;
              border-radius: 6px;
              border: 1px solid var(--color-border);
            "
          >
            <button
              type="button"
              class="btn btn-xs"
              :class="{
                'btn-primary': multiInputMode === 'paste',
                'btn-ghost': multiInputMode !== 'paste',
              }"
              style="padding: 3px 8px; font-size: 11px"
              @click="multiInputMode = 'paste'"
            >
              📋 Paste / Ketik Daftar SN
            </button>
            <button
              type="button"
              class="btn btn-xs"
              :class="{
                'btn-primary': multiInputMode === 'auto',
                'btn-ghost': multiInputMode !== 'auto',
              }"
              style="padding: 3px 8px; font-size: 11px"
              @click="multiInputMode = 'auto'"
            >
              ⚡ Massal Tanpa SN (Auto)
            </button>
          </div>
        </div>

        <!-- Mode A: Paste SN list -->
        <div v-if="multiInputMode === 'paste'">
          <div
            style="
              font-size: 12px;
              color: var(--color-text-muted);
              margin-bottom: 6px;
            "
          >
            Tempel (paste) daftar serial number dari Excel atau barcode scanner.
            Pisahkan dengan <strong>enter baris baru</strong>,
            <strong>koma</strong>, atau <strong>spasi</strong>.
          </div>
          <textarea
            v-model="multiInputSNText"
            class="form-textarea"
            rows="5"
            style="
              font-family: monospace;
              font-size: 13px;
              text-transform: uppercase;
            "
            placeholder="Contoh:&#10;SN-A1001&#10;SN-A1002&#10;SN-A1003&#10;SN-A1004"
          ></textarea>

          <!-- Live Count & Preview Badges -->
          <div
            style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-top: 8px;
              flex-wrap: wrap;
              gap: 6px;
            "
          >
            <div style="display: flex; align-items: center; gap: 8px">
              <span
                class="badge badge-info"
                style="font-size: 12px; font-weight: 600"
              >
                {{ parsedMultiSerials.length }} Serial Number Terdeteksi
              </span>
              <button
                v-if="multiInputSNText"
                type="button"
                class="btn btn-xs btn-outline"
                @click="multiInputSNText = ''"
                style="font-size: 11px"
              >
                Bersihkan
              </button>
            </div>
            <button
              type="button"
              class="btn btn-xs btn-outline"
              style="font-size: 11px"
              @click="
                multiInputSNText =
                  (multiInputSNText ? multiInputSNText + '\n' : '') +
                  generateRandomSN()
              "
            >
              + Tambah 1 Auto SN
            </button>
          </div>

          <!-- Preview chips -->
          <div
            v-if="parsedMultiSerials.length > 0"
            style="
              margin-top: 8px;
              max-height: 90px;
              overflow-y: auto;
              display: flex;
              flex-wrap: wrap;
              gap: 4px;
              padding: 6px;
              background: var(--color-surface, #fff);
              border-radius: 6px;
              border: 1px solid var(--color-border-light);
            "
          >
            <span
              v-for="(sn, idx) in parsedMultiSerials.slice(0, 30)"
              :key="idx"
              class="badge"
              style="
                background: #e0f2fe;
                color: #0369a1;
                font-family: monospace;
                font-size: 11px;
                padding: 2px 6px;
              "
            >
              {{ sn }}
            </span>
            <span
              v-if="parsedMultiSerials.length > 30"
              style="
                font-size: 11px;
                color: var(--color-text-muted);
                align-self: center;
              "
            >
              ...+{{ parsedMultiSerials.length - 30 }} lainnya
            </span>
          </div>
        </div>

        <!-- Mode B: Auto Generate Bulk -->
        <div v-else>
          <div
            style="
              font-size: 12px;
              color: var(--color-text-muted);
              margin-bottom: 8px;
            "
          >
            Gunakan mode ini untuk unit yang tidak memiliki serial number pabrik
            (misal: kabel, aksesoris, modul umum). Sistem akan membuat SN acak
            otomatis berformat <code>NONSN-YYYYMMDD-XXXXX</code>.
          </div>
          <div style="display: flex; align-items: center; gap: 10px">
            <label
              style="
                font-size: 13px;
                font-weight: 600;
                color: var(--color-text);
                white-space: nowrap;
              "
            >
              Jumlah Unit (Qty):
            </label>
            <input
              v-model.number="multiInputAutoQty"
              type="number"
              class="form-input"
              style="
                width: 100px;
                text-align: center;
                font-size: 15px;
                font-weight: bold;
              "
              min="1"
              max="100"
            />
            <span style="font-size: 13px; color: var(--color-text-muted)"
              >Unit akan dibuat</span
            >
          </div>
        </div>
      </div>

      <template #footer>
        <div
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
          "
        >
          <div style="font-size: 13px; color: var(--color-text-muted)">
            Total Unit:
            <strong style="color: #0284c7; font-size: 15px"
              >{{ multiSerialsCount }} Unit</strong
            >
          </div>
          <div style="display: flex; gap: 8px">
            <button
              type="button"
              class="btn btn-outline"
              :disabled="isSubmittingMulti"
              @click="closeMultiInput"
            >
              Batal
            </button>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="isSubmittingMulti || multiSerialsCount === 0"
              style="background-color: #0284c7; border-color: #0284c7"
              @click="handleMultiInputSubmit"
            >
              <span v-if="isSubmittingMulti"
                >Menyimpan {{ multiSerialsCount }} Unit...</span
              >
              <span v-else>Simpan {{ multiSerialsCount }} Unit</span>
            </button>
          </div>
        </div>
      </template>
    </FormModal>
  </div>
</template>

<style scoped>
.summary-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border-light);
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  user-select: none;
}
.summary-card:hover {
  border-color: #2563eb;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.08);
}
.summary-card.card-active {
  border-color: #2563eb !important;
  background: #f0f7ff !important;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2) !important;
}
.filter-status-select:focus {
  border-color: #2563eb;
  outline: none;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
}

/* Bulk Action Bar */
.bulk-action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  padding: 10px 16px;
  margin-bottom: 14px;
}
.bulk-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.bulk-badge {
  background: #2563eb;
  color: #fff;
  font-weight: 700;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 12px;
}
.bulk-label {
  font-weight: 600;
  color: var(--color-text, #1e293b);
  font-size: 13.5px;
}
.bulk-right {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* Toolbar Filters */
.unit-toolbar-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.search-sn-box {
  position: relative;
  display: flex;
  align-items: center;
}
.search-sn-icon {
  position: absolute;
  left: 10px;
  color: var(--color-text-muted, #94a3b8);
  pointer-events: none;
}
.search-sn-input {
  width: 210px;
  height: 36px;
  padding-left: 30px;
  padding-right: 26px;
  font-size: 13px;
  border-radius: 8px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #cbd5e1);
  transition: all 0.2s ease;
}
.search-sn-input:focus {
  border-color: #2563eb;
  outline: none;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}
.btn-clear-sn {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-muted, #94a3b8);
  font-size: 16px;
  line-height: 1;
  padding: 0;
  display: flex;
  align-items: center;
}
.btn-clear-sn:hover {
  color: var(--color-danger, #ef4444);
}

.status-filter-box {
  display: flex;
  align-items: center;
  gap: 6px;
}
.status-select {
  height: 36px;
  padding: 0 10px;
  font-size: 13px;
  border-radius: 8px;
  border: 1px solid var(--color-border, #cbd5e1);
  background: var(--color-surface, #fff);
  color: var(--color-text, #1e293b);
  cursor: pointer;
  min-width: 175px;
}
.status-select:focus {
  border-color: #2563eb;
  outline: none;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}
.btn-reset-filter {
  height: 36px;
  padding: 0 10px;
  font-size: 12px;
  border-radius: 8px;
}

/* Table Cells */
.unit-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  line-height: 1.45;
}
.unit-title {
  font-weight: 600;
  color: var(--color-text, #1e293b);
  word-break: break-word;
}
.badge-external {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
  white-space: nowrap;
}
.sn-badge {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  font-weight: 600;
  color: #0369a1;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  padding: 2px 8px;
  border-radius: 5px;
  letter-spacing: 0.3px;
  display: inline-block;
  white-space: nowrap;
}
</style>
