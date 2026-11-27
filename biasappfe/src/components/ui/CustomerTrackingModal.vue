<script setup lang="ts">
import FormModal from "@/components/ui/FormModal.vue";
import { resources } from "@/services/resource.service";
import type {
  CustomerTrackingResponse,
  TrackedActivityItem,
  TrackedCustomerSummary,
} from "@/types";
import { buildClientFallbackTracking } from "@/utils/customerTrackingFallback";
import { formatDateDDMMYYYY } from "@/utils/format";
import { computed, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    targetKind: "unit" | "product";
    item: any | null;
    displayTitle: string;
    codeLabel?: string;
    codeValue?: string;
    itemTypeLabel?: string;
    brandName?: string;
    canEdit?: boolean;
  }>(),
  {
    codeLabel: "SN",
    codeValue: "",
    itemTypeLabel: "",
    brandName: "",
    canEdit: false,
  },
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "edit", item: any): void;
}>();

const activeTab = ref<"tracking" | "info">("tracking");
const isLoading = ref(false);
const errorMsg = ref("");
const tracking = ref<CustomerTrackingResponse | null>(null);
const selectedCustomerId = ref("");
const relationFilter = ref<
  "all" | "rental_contract" | "sale" | "delivery" | "service" | "other"
>("all");
const searchText = ref("");

async function fetchTracking() {
  if (!props.item?.id) return;
  isLoading.value = true;
  errorMsg.value = "";
  try {
    const id = String(props.item.id);
    const res =
      props.targetKind === "unit"
        ? await resources.units.getCustomerTracking(id)
        : await resources.products.getCustomerTracking(id);
    tracking.value = (res?.data || null) as CustomerTrackingResponse | null;
  } catch (err: any) {
    const status = Number(err?.status || 0);
    // Remote API may not have `/customer-tracking` deployed yet; aggregate from existing endpoints.
    if (status === 404 || status === 405 || status === 0) {
      try {
        tracking.value = await buildClientFallbackTracking(
          props.targetKind,
          props.item,
          props.displayTitle || "",
        );
        return;
      } catch (fallbackErr: any) {
        errorMsg.value =
          fallbackErr?.message || "Gagal memuat data tracking customer.";
        tracking.value = null;
        return;
      }
    }
    errorMsg.value =
      err?.message || "Gagal memuat data tracking customer.";
    tracking.value = null;
  } finally {
    isLoading.value = false;
  }
}

watch(
  [() => props.open, () => props.item?.id],
  ([isOpen]) => {
    if (isOpen && props.item?.id) {
      activeTab.value = "tracking";
      selectedCustomerId.value = "";
      relationFilter.value = "all";
      searchText.value = "";
      tracking.value = null;
      void fetchTracking();
    }
  },
  { immediate: true },
);

function toggleCustomerFilter(cid: string) {
  selectedCustomerId.value = selectedCustomerId.value === cid ? "" : cid;
}

function getRelationBucket(
  relType: string,
): "rental_contract" | "sale" | "delivery" | "service" | "other" {
  switch (relType) {
    case "rental":
    case "contract":
      return "rental_contract";
    case "sale":
    case "sales_invoice":
      return "sale";
    case "delivery_order":
      return "delivery";
    case "service_report":
    case "service_request":
    case "service_sparepart":
      return "service";
    default:
      return "other";
  }
}

const bucketCounts = computed(() => {
  const counts = {
    all: 0,
    rental_contract: 0,
    sale: 0,
    delivery: 0,
    service: 0,
    other: 0,
  };
  const acts = tracking.value?.activities || [];
  for (const a of acts) {
    if (selectedCustomerId.value && a.customer_id !== selectedCustomerId.value) {
      continue;
    }
    counts.all++;
    counts[getRelationBucket(a.relation_type)]++;
  }
  return counts;
});

const selectedCustomerSummary = computed<TrackedCustomerSummary | null>(() => {
  if (!selectedCustomerId.value || !tracking.value?.customers) return null;
  return (
    tracking.value.customers.find(
      (c) => c.customer_id === selectedCustomerId.value,
    ) || null
  );
});

const filteredActivities = computed<TrackedActivityItem[]>(() => {
  const acts = tracking.value?.activities || [];
  const q = searchText.value.trim().toLowerCase();
  return acts.filter((a) => {
    if (selectedCustomerId.value && a.customer_id !== selectedCustomerId.value) {
      return false;
    }
    if (
      relationFilter.value !== "all" &&
      getRelationBucket(a.relation_type) !== relationFilter.value
    ) {
      return false;
    }
    if (q) {
      const hay = [
        a.company_name,
        a.ref_no,
        a.relation_label,
        a.location,
        a.technician,
        a.related_unit,
        a.notes,
        a.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
});

const activeCustomerNames = computed(() => {
  const list = tracking.value?.customers || [];
  return list.filter((c) => c.is_currently_active).map((c) => c.company_name);
});

function formatRupiah(val: number | null | undefined): string {
  if (val === null || val === undefined) return "-";
  return "Rp " + Number(val).toLocaleString("id-ID");
}

function formatStatusLabel(status: string | null | undefined): string {
  if (!status) return "-";
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function unitStatusBadgeClass(status: string | null | undefined): string {
  switch ((status || "").toLowerCase()) {
    case "available":
      return "badge-success";
    case "lock":
    case "locked":
    case "maintenance":
      return "badge-warning";
    case "rented":
      return "badge-info";
    case "broken":
      return "badge-danger";
    default:
      return "badge-neutral";
  }
}

function activityStatusClass(status: string | null | undefined): string {
  const s = (status || "").toLowerCase();
  if (
    s === "active" ||
    s === "completed" ||
    s === "delivered" ||
    s === "approved" ||
    s === "paid" ||
    s === "recorded"
  ) {
    return "status-pill--success";
  }
  if (
    s === "pending" ||
    s === "in_progress" ||
    s === "in_transit" ||
    s === "shipped" ||
    s === "assigned" ||
    s === "po_created" ||
    s === "partially_paid"
  ) {
    return "status-pill--info";
  }
  if (s === "cancelled" || s === "rejected" || s === "broken" || s === "void" || s === "expired") {
    return "status-pill--danger";
  }
  return "status-pill--neutral";
}

function relationPillStyle(relType: string): {
  bg: string;
  color: string;
  border: string;
} {
  switch (relType) {
    case "rental":
    case "contract":
      return { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" };
    case "sale":
    case "sales_invoice":
      return { bg: "#ecfdf5", color: "#047857", border: "#a7f3d0" };
    case "delivery_order":
      return { bg: "#f0f9ff", color: "#0369a1", border: "#bae6fd" };
    case "service_report":
    case "service_request":
      return { bg: "#fef3c7", color: "#b45309", border: "#fde68a" };
    case "service_sparepart":
      return { bg: "#f5f3ff", color: "#6d28d9", border: "#ddd6fe" };
    case "warranty":
      return { bg: "#fff1f2", color: "#be123c", border: "#fecdd3" };
    default:
      return { bg: "#f1f5f9", color: "#475569", border: "#cbd5e1" };
  }
}

function formatSpecsObject(obj: Record<string, any>): string {
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
    parts.push(
      valStr.toLowerCase().startsWith(label.toLowerCase())
        ? valStr
        : `${label}: ${valStr}`,
    );
  }
  return parts.filter(Boolean).join("\n");
}

const parsedSpecLines = computed<{ label?: string; value: string }[]>(() => {
  const raw = props.item?.specs;
  if (!raw) return [];
  let str = "";
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "{}" || trimmed === "[]") return [];
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const obj = JSON.parse(trimmed);
        if (obj && typeof obj === "object") str = formatSpecsObject(obj);
      } catch {
        str = trimmed;
      }
    } else {
      str = trimmed;
    }
  } else if (typeof raw === "object") {
    str = formatSpecsObject(raw);
  }
  if (!str) return [];

  let lines = str
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 1) {
    const first = lines[0] ?? "";
    if (first.includes("•")) {
      lines = first.split("•").map((s) => s.trim()).filter(Boolean);
    } else if (first.includes(";")) {
      lines = first.split(";").map((s) => s.trim()).filter(Boolean);
    } else if (first.includes(",") && first.split(",").length >= 3) {
      lines = first.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return lines.map((line) => {
    const clean = line.replace(/^[-•*]\s*/, "").trim();
    const colonIdx = clean.indexOf(":");
    if (colonIdx > 0 && colonIdx < 30) {
      const label = clean.slice(0, colonIdx).trim();
      const value = clean.slice(colonIdx + 1).trim();
      if (value) return { label, value };
    }
    return { value: clean };
  });
});

const isComputerItem = computed(() => {
  if (!props.item) return false;
  if (props.item.is_computer) return true;
  const check = `${props.itemTypeLabel || ""} ${props.displayTitle || ""}`.toLowerCase();
  return (
    check.includes("laptop") ||
    check.includes("komputer") ||
    check.includes("computer") ||
    check.includes("desktop") ||
    /\bpc\b/.test(check)
  );
});
</script>

<template>
  <FormModal
    :open="open"
    :title="
      item
        ? `Tracking Customer - ${displayTitle || (targetKind === 'unit' ? 'Unit' : 'Produk')}`
        : 'Tracking Customer'
    "
    max-width="960px"
    @close="emit('close')"
  >
    <div v-if="item" class="tracking-modal-body">
      <!-- Compact Item Summary Strip -->
      <div class="target-strip">
        <div class="target-strip-main">
          <div class="target-strip-title-row">
            <span class="target-strip-name">{{ displayTitle || "-" }}</span>
            <span v-if="codeValue" class="target-code-pill">
              {{ codeLabel }}: {{ codeValue }}
            </span>
          </div>
          <div class="target-strip-meta">
            <span
              v-if="targetKind === 'unit'"
              class="badge"
              :class="unitStatusBadgeClass(item.status)"
            >
              {{ formatStatusLabel(item.status) }}
            </span>
            <span
              v-if="targetKind === 'unit' && item.is_external"
              class="badge badge-warning"
            >
              External
            </span>
            <span
              v-if="targetKind === 'unit' && item.is_copier"
              class="badge-soft-blue"
            >
              Photocopy Machine
            </span>
            <span
              v-if="targetKind === 'product' && item.is_sparepart"
              class="badge-soft-green"
            >
              Sparepart
            </span>
            <span
              v-else-if="targetKind === 'product'"
              class="badge-soft-slate"
            >
              Consumable
            </span>
            <span v-if="itemTypeLabel" class="target-meta-text">
              Kategori: <strong>{{ itemTypeLabel }}</strong>
            </span>
            <span v-if="targetKind === 'product'" class="target-meta-text">
              Stok: <strong>{{ (item.stock ?? 0).toLocaleString("id-ID") }} {{ item.uom?.name || "" }}</strong>
            </span>
          </div>
        </div>
        <div class="target-strip-right">
          <div v-if="item.price != null" class="target-price">
            {{ formatRupiah(item.price) }}
          </div>
          <button
            v-if="activeTab === 'tracking'"
            type="button"
            class="btn btn-sm btn-outline"
            :disabled="isLoading"
            title="Muat ulang data tracking"
            @click="fetchTracking"
          >
            {{ isLoading ? "Memuat..." : "Refresh" }}
          </button>
        </div>
      </div>

      <!-- Modal Navigation Tabs -->
      <div class="modal-tabs">
        <button
          type="button"
          class="btn btn-sm"
          :class="activeTab === 'tracking' ? 'btn-primary' : 'btn-outline'"
          @click="activeTab = 'tracking'"
        >
          Tracking Customer ({{ tracking?.total_customers ?? 0 }})
        </button>
        <button
          type="button"
          class="btn btn-sm"
          :class="activeTab === 'info' ? 'btn-primary' : 'btn-outline'"
          @click="activeTab = 'info'"
        >
          Info &amp; Spesifikasi
        </button>
      </div>

      <!-- TAB 1: TRACKING CUSTOMER -->
      <div v-if="activeTab === 'tracking'" class="tracking-content">
        <div v-if="isLoading" class="state-box">
          <div class="state-title">Melacak riwayat customer terkait...</div>
          <div class="state-sub">
            Mengambil data dari rental, kontrak, penjualan, surat jalan, service, sparepart, dan garansi.
          </div>
        </div>

        <div v-else-if="errorMsg" class="state-box state-box--error">
          <div class="state-title">{{ errorMsg }}</div>
          <button
            type="button"
            class="btn btn-sm btn-outline"
            style="margin-top: 8px"
            @click="fetchTracking"
          >
            Coba Lagi
          </button>
        </div>

        <div
          v-else-if="!tracking || tracking.total_customers === 0"
          class="state-box"
        >
          <div class="state-title">
            Belum ada customer yang terhubung dengan {{ targetKind === "unit" ? "unit" : "produk" }} ini
          </div>
          <div class="state-sub">
            Belum ditemukan transaksi penjualan, penyewaan, kontrak, surat jalan, garansi, atau riwayat service untuk item ini.
          </div>
        </div>

        <template v-else>
          <!-- Summary Cards -->
          <div class="summary-grid">
            <div class="stat-card">
              <div class="stat-label">Customer Terhubung</div>
              <div class="stat-value stat-value--blue">
                {{ tracking.total_customers }} Customer
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Total Aktivitas / Dokumen</div>
              <div class="stat-value">
                {{ tracking.total_activities }} Aktivitas
              </div>
            </div>
            <div v-if="targetKind === 'unit'" class="stat-card">
              <div class="stat-label">Status Pemakaian Saat Ini</div>
              <div
                class="stat-value"
                :class="activeCustomerNames.length ? 'stat-value--green' : 'stat-value--muted'"
                style="font-size: 14px; line-height: 1.35"
              >
                {{
                  activeCustomerNames.length > 0
                    ? activeCustomerNames.join(", ")
                    : "Tidak sedang dalam rental/kontrak aktif"
                }}
              </div>
            </div>
            <div v-else class="stat-card">
              <div class="stat-label">Total Qty Keluar / Terpakai</div>
              <div class="stat-value stat-value--green">
                {{ tracking.total_qty.toLocaleString("id-ID") }} {{ item.uom?.name || "pcs" }}
              </div>
            </div>
          </div>

          <!-- Section 1: Customer Summary List -->
          <div class="section-block">
            <div class="section-header">
              <span class="section-title">
                Daftar Customer Terkait ({{ tracking.customers.length }})
              </span>
              <span class="section-hint">
                Klik customer untuk memfilter riwayat transaksi di bawah
              </span>
            </div>

            <div class="customer-cards-grid">
              <button
                v-for="cust in tracking.customers"
                :key="cust.customer_id"
                type="button"
                class="customer-card"
                :class="{
                  'customer-card--selected': selectedCustomerId === cust.customer_id,
                  'customer-card--active-rental': cust.is_currently_active,
                }"
                @click="toggleCustomerFilter(cust.customer_id)"
              >
                <div class="customer-card-top">
                  <div class="customer-name-wrap">
                    <span class="customer-name">{{ cust.company_name }}</span>
                    <span
                      v-if="cust.category"
                      class="cust-cat-badge"
                      :class="
                        cust.category === 'Government'
                          ? 'cust-cat-badge--gov'
                          : 'cust-cat-badge--corp'
                      "
                    >
                      {{ cust.category }}
                    </span>
                    <span v-if="cust.is_currently_active" class="active-rental-pill">
                      Aktif Disewa / Kontrak
                    </span>
                  </div>
                  <span class="cust-act-count">
                    {{ cust.activity_count }} aktivitas
                  </span>
                </div>

                <div
                  v-if="cust.pic_name || cust.phone"
                  class="customer-contact"
                >
                  <span v-if="cust.pic_name">PIC: {{ cust.pic_name }}</span>
                  <span v-if="cust.pic_name && cust.phone"> · </span>
                  <span v-if="cust.phone">{{ cust.phone }}</span>
                </div>

                <div class="customer-card-bottom">
                  <div class="relation-tags">
                    <span
                      v-for="(lbl, idx) in cust.relation_labels"
                      :key="`${cust.customer_id}-lbl-${idx}`"
                      class="rel-tag"
                      :style="{
                        backgroundColor: relationPillStyle(cust.relation_types[idx] || '').bg,
                        color: relationPillStyle(cust.relation_types[idx] || '').color,
                        borderColor: relationPillStyle(cust.relation_types[idx] || '').border,
                      }"
                    >
                      {{ lbl }}
                    </span>
                  </div>
                  <div class="cust-last-date">
                    <template v-if="targetKind === 'product' && cust.total_qty > 0">
                      {{ cust.total_qty }} qty ·
                    </template>
                    Terakhir: {{ formatDateDDMMYYYY(cust.last_interaction) }}
                  </div>
                </div>
              </button>
            </div>
          </div>

          <!-- Section 2: Activity Timeline -->
          <div class="section-block">
            <div class="timeline-toolbar">
              <div class="timeline-title-row">
                <span class="section-title">
                  Riwayat Hubungan &amp; Transaksi
                </span>
                <span
                  v-if="selectedCustomerSummary"
                  class="active-filter-chip"
                >
                  Filter: {{ selectedCustomerSummary.company_name }}
                  <button
                    type="button"
                    class="chip-clear"
                    title="Tampilkan semua customer"
                    @click="selectedCustomerId = ''"
                  >
                    &times;
                  </button>
                </span>
              </div>

              <input
                v-model="searchText"
                type="search"
                class="form-input timeline-search"
                placeholder="Cari no. ref, customer, teknisi, keterangan..."
              />
            </div>

            <div class="relation-filter-pills">
              <button
                type="button"
                class="btn btn-sm"
                :class="relationFilter === 'all' ? 'btn-primary' : 'btn-outline'"
                @click="relationFilter = 'all'"
              >
                Semua ({{ bucketCounts.all }})
              </button>
              <button
                v-if="bucketCounts.rental_contract > 0"
                type="button"
                class="btn btn-sm"
                :class="relationFilter === 'rental_contract' ? 'btn-primary' : 'btn-outline'"
                @click="relationFilter = 'rental_contract'"
              >
                Sewa / Kontrak ({{ bucketCounts.rental_contract }})
              </button>
              <button
                v-if="bucketCounts.sale > 0"
                type="button"
                class="btn btn-sm"
                :class="relationFilter === 'sale' ? 'btn-primary' : 'btn-outline'"
                @click="relationFilter = 'sale'"
              >
                Penjualan ({{ bucketCounts.sale }})
              </button>
              <button
                v-if="bucketCounts.delivery > 0"
                type="button"
                class="btn btn-sm"
                :class="relationFilter === 'delivery' ? 'btn-primary' : 'btn-outline'"
                @click="relationFilter = 'delivery'"
              >
                Surat Jalan ({{ bucketCounts.delivery }})
              </button>
              <button
                v-if="bucketCounts.service > 0"
                type="button"
                class="btn btn-sm"
                :class="relationFilter === 'service' ? 'btn-primary' : 'btn-outline'"
                @click="relationFilter = 'service'"
              >
                Service &amp; Sparepart ({{ bucketCounts.service }})
              </button>
              <button
                v-if="bucketCounts.other > 0"
                type="button"
                class="btn btn-sm"
                :class="relationFilter === 'other' ? 'btn-primary' : 'btn-outline'"
                @click="relationFilter = 'other'"
              >
                Garansi &amp; Lainnya ({{ bucketCounts.other }})
              </button>
            </div>

            <div class="timeline-table-wrap">
              <table class="tracking-table">
                <thead>
                  <tr>
                    <th style="width: 105px">Tanggal</th>
                    <th style="width: 190px">Customer</th>
                    <th style="width: 185px">Aktivitas &amp; No. Ref</th>
                    <th>Detail / Keterangan</th>
                    <th style="width: 110px">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="filteredActivities.length === 0">
                    <td colspan="5" class="empty-row">
                      Tidak ada aktivitas yang cocok dengan filter.
                    </td>
                  </tr>
                  <tr v-for="act in filteredActivities" :key="act.id">
                    <td class="td-date">
                      <div>{{ formatDateDDMMYYYY(act.date) }}</div>
                      <div v-if="act.end_date" class="sub-muted">
                        s/d {{ formatDateDDMMYYYY(act.end_date) }}
                      </div>
                    </td>
                    <td>
                      <div class="cell-customer-name">{{ act.company_name }}</div>
                      <div v-if="act.customer_category" class="sub-muted">
                        {{ act.customer_category }}
                      </div>
                    </td>
                    <td>
                      <span
                        class="rel-tag"
                        :style="{
                          backgroundColor: relationPillStyle(act.relation_type).bg,
                          color: relationPillStyle(act.relation_type).color,
                          borderColor: relationPillStyle(act.relation_type).border,
                        }"
                      >
                        {{ act.relation_label }}
                      </span>
                      <div class="ref-no-row">
                        <span class="ref-no">{{ act.ref_no || "-" }}</span>
                        <span v-if="act.qty > 1 || targetKind === 'product'" class="qty-pill">
                          {{ act.qty }} qty
                        </span>
                      </div>
                    </td>
                    <td class="td-detail">
                      <div v-if="act.related_unit" class="detail-line">
                        <strong>Unit:</strong> {{ act.related_unit }}
                      </div>
                      <div v-if="act.location" class="detail-line">
                        <strong>Lokasi / Ref:</strong> {{ act.location }}
                      </div>
                      <div v-if="act.technician" class="detail-line">
                        <strong>Teknisi:</strong> {{ act.technician }}
                      </div>
                      <div v-if="act.unit_price && act.unit_price > 0" class="detail-line">
                        <strong>Harga / Sewa:</strong> {{ formatRupiah(act.unit_price) }}
                      </div>
                      <div v-if="act.notes" class="detail-notes">
                        {{ act.notes }}
                      </div>
                      <span
                        v-if="!act.related_unit && !act.location && !act.technician && !act.notes && !(act.unit_price && act.unit_price > 0)"
                        class="sub-muted"
                      >
                        -
                      </span>
                    </td>
                    <td>
                      <span
                        class="status-pill"
                        :class="activityStatusClass(act.status)"
                      >
                        {{ formatStatusLabel(act.status) }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </div>

      <!-- TAB 2: INFO & SPESIFIKASI -->
      <div v-else class="info-tab-content">
        <div class="info-grid">
          <div style="grid-column: span 2">
            <div class="info-label">
              {{ targetKind === "unit" ? "Description / Unit Name" : "Name" }}
            </div>
            <div class="info-val info-val--bold">{{ displayTitle || "-" }}</div>
          </div>
          <div>
            <div class="info-label">{{ codeLabel }}</div>
            <div class="info-val info-val--mono">{{ codeValue || "-" }}</div>
          </div>
          <div>
            <div class="info-label">Item / Kategori</div>
            <div class="info-val">{{ itemTypeLabel || "-" }}</div>
          </div>
          <div v-if="targetKind === 'unit' && brandName">
            <div class="info-label">Merek / Brand</div>
            <div class="info-val">{{ brandName }}</div>
          </div>
          <div v-if="targetKind === 'unit'">
            <div class="info-label">Type / Model</div>
            <div class="info-val">{{ item.model || "-" }}</div>
          </div>
          <div>
            <div class="info-label">Satuan / UOM</div>
            <div class="info-val">{{ item.uom?.name || "-" }}</div>
          </div>
          <div>
            <div class="info-label">Harga</div>
            <div class="info-val">
              {{ item.price != null ? formatRupiah(item.price) : "-" }}
            </div>
          </div>
          <div v-if="targetKind === 'product'">
            <div class="info-label">Stock Qty</div>
            <div class="info-val info-val--blue">
              {{ (item.stock ?? 0).toLocaleString("id-ID") }} {{ item.uom?.name || "" }}
            </div>
          </div>
          <div v-if="targetKind === 'unit' && item.print_tech">
            <div class="info-label">Kategori Cetak</div>
            <div class="info-val">{{ item.print_tech }}</div>
          </div>
        </div>

        <div
          v-if="parsedSpecLines.length > 0 || isComputerItem"
          class="specs-card"
        >
          <div class="specs-card-title">Spesifikasi</div>
          <div v-if="parsedSpecLines.length > 0" class="specs-list">
            <div v-for="(spec, i) in parsedSpecLines" :key="i" class="spec-line">
              <span class="spec-dot"></span>
              <span v-if="spec.label" class="spec-label">{{ spec.label }}:</span>
              <span>{{ spec.value }}</span>
            </div>
          </div>
          <div v-else class="specs-empty">
            Belum ada data spesifikasi untuk item ini.
          </div>
        </div>

        <div
          v-if="
            targetKind === 'unit' &&
            (item.is_copier || item.current_meter_bw || item.current_meter_color)
          "
          class="specs-card"
        >
          <div class="specs-card-title">Meter Readings &amp; Quota</div>
          <div class="meter-grid">
            <div>
              <div class="info-label">Meter B/W</div>
              <div class="info-val info-val--bold">
                {{ item.current_meter_bw ?? 0 }}
              </div>
            </div>
            <div>
              <div class="info-label">Meter Color</div>
              <div class="info-val info-val--bold">
                {{ item.current_meter_color ?? 0 }}
              </div>
            </div>
            <div>
              <div class="info-label">Free Quota Color</div>
              <div class="info-val info-val--bold">
                {{ item.free_quota_color ?? 0 }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <button type="button" class="btn btn-outline" @click="emit('close')">
        Tutup
      </button>
      <button
        v-if="canEdit && item"
        type="button"
        class="btn btn-primary"
        @click="emit('edit', item)"
      >
        {{ targetKind === "unit" ? "Edit Product" : "Edit Consumable / Sparepart" }}
      </button>
    </template>
  </FormModal>
</template>

<style scoped>
.tracking-modal-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.target-strip {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  background: var(--color-background-soft, #f8fafc);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 10px;
  flex-wrap: wrap;
}
.target-strip-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  flex: 1;
}
.target-strip-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.target-strip-name {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--color-text, #1e293b);
  word-break: break-word;
}
.target-code-pill {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11.5px;
  font-weight: 600;
  color: #0369a1;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  padding: 2px 8px;
  border-radius: 5px;
  white-space: nowrap;
}
.target-strip-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.target-meta-text {
  font-size: 12px;
  color: var(--color-text-secondary, #475569);
}
.target-strip-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.target-price {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.badge-soft-blue {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(14, 165, 233, 0.12);
  color: #0284c7;
}
.badge-soft-green {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
}
.badge-soft-slate {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
}

.modal-tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--color-border-light, #e2e8f0);
  padding-bottom: 10px;
  flex-wrap: wrap;
}

.tracking-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.state-box {
  text-align: center;
  padding: 36px 20px;
  background: var(--color-background-soft, #f8fafc);
  border: 1px dashed var(--color-border, #cbd5e1);
  border-radius: 10px;
}
.state-box--error {
  border-color: #fca5a5;
  background: #fef2f2;
}
.state-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
}
.state-sub {
  font-size: 12.5px;
  color: var(--color-text-muted, #64748b);
  margin-top: 4px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}
.stat-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 8px;
  padding: 12px 14px;
}
.stat-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-text-muted, #64748b);
}
.stat-value {
  font-size: 18px;
  font-weight: 700;
  margin-top: 4px;
  color: var(--color-text, #1e293b);
}
.stat-value--blue {
  color: #2563eb;
}
.stat-value--green {
  color: #16a34a;
}
.stat-value--muted {
  color: var(--color-text-muted, #64748b);
  font-weight: 500;
}

.section-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.section-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.section-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text, #1e293b);
}
.section-hint {
  font-size: 11.5px;
  color: var(--color-text-muted, #64748b);
}

.customer-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
  max-height: 240px;
  overflow-y: auto;
  padding: 2px;
}
.customer-card {
  text-align: left;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: all 0.15s ease;
}
.customer-card:hover {
  border-color: #3b82f6;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.08);
}
.customer-card--selected {
  border-color: #2563eb;
  background: #eff6ff;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.16);
}
.customer-card--active-rental {
  border-left: 3px solid #16a34a;
}
.customer-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}
.customer-name-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.customer-name {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--color-text, #1e293b);
  word-break: break-word;
}
.cust-cat-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
}
.cust-cat-badge--corp {
  background: #e0f2fe;
  color: #0369a1;
}
.cust-cat-badge--gov {
  background: #ede9fe;
  color: #6d28d9;
}
.active-rental-pill {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  background: #dcfce7;
  color: #15803d;
}
.cust-act-count {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted, #64748b);
  white-space: nowrap;
}
.customer-contact {
  font-size: 11.5px;
  color: var(--color-text-secondary, #475569);
}
.customer-card-bottom {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 2px;
}
.relation-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.rel-tag {
  display: inline-block;
  font-size: 10.5px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  border: 1px solid transparent;
  white-space: nowrap;
}
.cust-last-date {
  font-size: 11px;
  color: var(--color-text-muted, #64748b);
  white-space: nowrap;
}

.timeline-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.timeline-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.active-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 600;
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
  padding: 2px 8px;
  border-radius: 12px;
}
.chip-clear {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  color: #1d4ed8;
  padding: 0;
}
.timeline-search {
  height: 34px;
  font-size: 12.5px;
  width: 260px;
  max-width: 100%;
}
.relation-filter-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.timeline-table-wrap {
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 8px;
  max-height: 340px;
  overflow-y: auto;
  overflow-x: hidden;
}
.tracking-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 12.5px;
}
.tracking-table th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--color-surface, #f8fafc);
  border-bottom: 1px solid var(--color-border-light, #e2e8f0);
  padding: 9px 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-text-muted, #64748b);
  white-space: nowrap;
}
.tracking-table td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
  vertical-align: top;
  word-break: break-word;
  overflow-wrap: break-word;
}
.tracking-table tbody tr:last-child td {
  border-bottom: none;
}
.td-date {
  white-space: nowrap;
  font-size: 12px;
}
.sub-muted {
  font-size: 11px;
  color: var(--color-text-muted, #64748b);
  margin-top: 2px;
}
.cell-customer-name {
  font-weight: 600;
  color: var(--color-text, #1e293b);
}
.ref-no-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  flex-wrap: wrap;
}
.ref-no {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-weight: 600;
  font-size: 12px;
  color: var(--color-text, #1e293b);
}
.qty-pill {
  font-size: 10.5px;
  font-weight: 600;
  background: #f1f5f9;
  color: #334155;
  padding: 1px 6px;
  border-radius: 4px;
}
.td-detail {
  line-height: 1.45;
}
.detail-line {
  font-size: 12px;
  color: var(--color-text-secondary, #334155);
}
.detail-notes {
  font-size: 12px;
  color: var(--color-text, #1e293b);
  margin-top: 2px;
}
.empty-row {
  text-align: center;
  padding: 28px 12px !important;
  color: var(--color-text-muted, #64748b);
}

.status-pill {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}
.status-pill--success {
  background: #dcfce7;
  color: #15803d;
}
.status-pill--info {
  background: #e0f2fe;
  color: #0369a1;
}
.status-pill--danger {
  background: #fee2e2;
  color: #b91c1c;
}
.status-pill--neutral {
  background: #f1f5f9;
  color: #475569;
}

/* Info & Specs Tab */
.info-tab-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 20px;
}
.info-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted, #64748b);
  text-transform: uppercase;
}
.info-val {
  font-size: 14px;
  color: var(--color-text, #1e293b);
  margin-top: 2px;
  word-break: break-word;
}
.info-val--bold {
  font-weight: 600;
}
.info-val--mono {
  font-family: monospace;
  font-weight: 600;
  color: #0284c7;
}
.info-val--blue {
  font-weight: 600;
  color: #2563eb;
}
.specs-card {
  padding: 14px 16px;
  background: var(--color-background-soft, #f8fafc);
  border-radius: 8px;
  border: 1px solid var(--color-border-light, #e2e8f0);
}
.specs-card-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text, #1e293b);
  margin-bottom: 10px;
}
.specs-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.spec-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text, #1e293b);
}
.spec-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #0284c7;
  flex-shrink: 0;
  transform: translateY(-2px);
}
.spec-label {
  font-weight: 600;
  min-width: 60px;
}
.specs-empty {
  font-size: 13px;
  color: var(--color-text-muted, #64748b);
  font-style: italic;
}
.meter-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
</style>
