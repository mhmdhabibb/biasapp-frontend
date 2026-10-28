<script setup lang="ts">
// @ts-nocheck
import { ref, computed, onMounted, watch } from "vue";
import { useAuth } from "@/composables/useAuth";
import { useMasterStore } from "@/composables/useMasterStore";
import { useAutoRefresh } from "@/composables/useAutoRefresh";
import { useToast } from "@/composables/useToast";
import { usePermission } from "@/composables/usePermission";
import { api } from "@/services/api";
import { resources } from "@/services/resource.service";
import PageHeader from "@/components/ui/PageHeader.vue";
import CustomSelect from "@/components/ui/CustomSelect.vue";
import { useRoute } from "vue-router";

const toast = useToast();
const { can } = usePermission();
const route = useRoute();
const { ensureResourcesLoaded } = useMasterStore();
const { currentUser } = useAuth();
const {
  monthlyMeterReadings,
  contractItems,
  technicians,
  serviceReports,
  findCustomer,
  findUnit,
  findServiceReport,
  getTechnicianIdByUser,
  refreshInBackground,
} = useMasterStore();

onMounted(() => {
  ensureResourcesLoaded(route.path);
});

useAutoRefresh(10000, [
  "monthlyMeterReadings",
  "contractItems",
  "units",
  "customers",
  "technicians",
  "serviceReports",
]);

const isAdminOrSuperadmin = computed(() => {
  const role = (currentUser.value?.role || "").toLowerCase();
  return role === "admin" || role === "superadmin";
});

// Technician record belonging to currentUser
const myTechnician = computed(() => {
  if (!currentUser.value?.id) return null;
  return (technicians.value || []).find(
    (t: any) =>
      String(t.user_id) === String(currentUser.value?.id) ||
      (t.user && String(t.user.id) === String(currentUser.value?.id))
  );
});

const myTechId = computed(() => {
  if (myTechnician.value?.id) return String(myTechnician.value.id);
  return getTechnicianIdByUser(currentUser.value?.id || null);
});

// Filter controls
const techFilter = ref<string>("mine");
const searchQuery = ref<string>("");

function isReadingByTechnician(
  reading: any,
  targetUserId: string,
  targetTechId: string | null
): boolean {
  if (!targetUserId && !targetTechId) return false;

  // 1. Direct match on user_id on reading
  if (targetUserId) {
    if (reading.user_id && String(reading.user_id) === targetUserId) return true;
    if (reading.user?.id && String(reading.user.id) === targetUserId) return true;
  }

  // 2. Direct match on technician_id on reading
  if (targetTechId && reading.technician_id && String(reading.technician_id) === targetTechId) {
    return true;
  }

  // 3. Match via linked Service Report
  const srId = reading.service_report_id || reading.service_report?.id;
  const sr = reading.service_report || (srId ? findServiceReport(srId) : null);
  if (sr) {
    if (targetTechId && sr.technician_id && String(sr.technician_id) === targetTechId) {
      return true;
    }
    if (targetUserId) {
      if (sr.user_id && String(sr.user_id) === targetUserId) return true;
      if (sr.technician?.user_id && String(sr.technician.user_id) === targetUserId) return true;
    }
    const currentName = (currentUser.value?.name || "").trim().toLowerCase();
    if (currentName) {
      if (sr.technician_name && sr.technician_name.trim().toLowerCase() === currentName) return true;
      if (sr.technician_name_copier && sr.technician_name_copier.trim().toLowerCase() === currentName) return true;
      if (sr.technician_name_technical && sr.technician_name_technical.trim().toLowerCase() === currentName) return true;
    }
  }

  return false;
}

const filteredData = computed(() => {
  let list = monthlyMeterReadings.value || [];

  const uid = currentUser.value?.id ? String(currentUser.value.id) : "";
  const tid = myTechId.value ? String(myTechId.value) : null;

  // Filter by technician
  if (!isAdminOrSuperadmin.value || techFilter.value === "mine") {
    list = list.filter((r) => isReadingByTechnician(r, uid, tid));
  } else if (techFilter.value !== "all") {
    const selectedTech = (technicians.value || []).find((t: any) => String(t.id) === techFilter.value);
    const targetUid = selectedTech?.user_id ? String(selectedTech.user_id) : "";
    list = list.filter((r) => isReadingByTechnician(r, targetUid, String(techFilter.value)));
  }

  // Filter by search query
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    list = list.filter((r) => {
      const cust = getCustomerName(r.contract_item_id).toLowerCase();
      const unit = getUnitName(r.contract_item_id).toLowerCase();
      const sn = getSerialNumber(r.contract_item_id).toLowerCase();
      const ps = getPaperSizeName(r).toLowerCase();
      return cust.includes(q) || unit.includes(q) || sn.includes(q) || ps.includes(q);
    });
  }

  return list;
});

const data = computed(() => filteredData.value);

const currentPage = ref(1);
const perPage = 10;
const totalPages = computed(() => Math.max(1, Math.ceil(data.value.length / perPage)));
const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * perPage;
  return data.value.slice(start, start + perPage);
});

watch(() => data.value.length, () => {
  if (currentPage.value > totalPages.value) {
    currentPage.value = Math.max(1, totalPages.value);
  }
});

const paperSizes = ref<any[]>([]);
const paperTypes = ref<any[]>([]);
onMounted(async () => {
  try {
    paperSizes.value = (await resources.paperSizes.list()).data;
  } catch (err) {
    console.warn("Failed to load paper sizes:", err);
  }
  try {
    paperTypes.value = (await (resources as any).paperTypes.list()).data;
  } catch (err) {
    console.warn("Failed to load paper types:", err);
  }
});

const showAddModal = ref(false);
const form = ref({
  contract_item_id: null as any,
  paper_size_id: null as any,
  paper_type_id: null as any,
  color_mode: "bw",
  end_meter: 0,
  reading_date: new Date().toISOString().slice(0, 10),
});

const selectedContract = computed(() =>
  contractItems.value.find((c) => c.id === form.value.contract_item_id),
);

// Paper sizes of this contract (from rates = rental copy).
// Input form split per size: each size has its own Previous + Current.
const contractSizes = computed(() => {
  const rates: any[] = (selectedContract.value as any)?.rates || [];
  const sized = rates.filter((r) => r.paper_size_id);
  const general = rates.filter((r) => !r.paper_size_id);
  const combos = sized.map((r) => ({
    paper_size_id: r.paper_size_id,
    paper_type_id: r.paper_type_id ?? null,
    quota_applies_to: r.quota_applies_to === "bw" ? "bw" : "color",
    name:
      r.paper_size?.name ||
      paperSizes.value.find((p) => String(p.id) === String(r.paper_size_id))
        ?.name ||
      String(r.paper_size_id).slice(0, 8),
    type_name:
      r.paper_type?.name ||
      (r.paper_type_id
        ? paperTypes.value.find((p) => String(p.id) === String(r.paper_type_id))
            ?.name || ""
        : ""),
  }));
  if (general.length > 0) {
    const g = general[0] as any;
    combos.push({
      paper_size_id: "",
      paper_type_id: g?.paper_type_id ?? null,
      quota_applies_to: g?.quota_applies_to === "bw" ? "bw" : "color",
      name: "Tanpa ukuran (umum)",
      type_name: "",
    });
  }
  return combos;
});

// Input per size x kind x mode: { [size|type|mode]: { end_meter } }
const sizeInputs = ref<Record<string, { end_meter: number | null }>>({});
watch(
  () => form.value.contract_item_id,
  () => {
    sizeInputs.value = {};
    form.value.paper_size_id = null;
    form.value.paper_type_id = null;
    form.value.end_meter = 0;
  },
);

function comboKey(paperSizeId: any, paperTypeId: any, mode: string): string {
  return String(paperSizeId) + "|" + String(paperTypeId ?? "") + "|" + mode;
}

function sameType(a: any, b: any): boolean {
  return String(a ?? "") === String(b ?? "");
}

function prevFor(paperSizeId: any, paperTypeId: any, mode: string): number {
  if (!selectedContract.value) return 0;
  const m = String(mode).toLowerCase();
  const sized = (monthlyMeterReadings.value || []).filter(
    (r) =>
      r.contract_item_id === selectedContract.value?.id &&
      String(r.paper_size_id) === String(paperSizeId) &&
      sameType(r.paper_type_id, paperTypeId) &&
      String(r.color_mode || "").toLowerCase() === m,
  );
  if (sized.length === 0) {
    if (m === "color") return selectedContract.value.start_meter_color || 0;
    return selectedContract.value.start_meter_bw || 0;
  }
  const latest = sized.reduce((prev, curr) =>
    new Date(prev.created_at).getTime() > new Date(curr.created_at).getTime()
      ? prev
      : curr,
  );
  return latest.end_meter || 0;
}

function rowInput(paperSizeId: any, paperTypeId: any, mode: string) {
  const key = comboKey(paperSizeId, paperTypeId, mode);
  if (!sizeInputs.value[key]) sizeInputs.value[key] = { end_meter: null };
  return sizeInputs.value[key]!;
}
// Previous meter is calculated PER paper size, because one contract/unit
// can have more than one size (A4, F4, ...). If no size is
// selected, use the latest reading of that contract as reference.
const previousReading = computed(() => {
  if (!selectedContract.value) return 0;
  let readings = (monthlyMeterReadings.value || []).filter(
    (r) => r.contract_item_id === selectedContract.value?.id,
  );
  if (form.value.paper_size_id) {
    const sized = readings.filter(
      (r) => String(r.paper_size_id) === String(form.value.paper_size_id),
    );
    if (sized.length > 0) readings = sized;
    else return selectedContract.value.start_meter_bw || 0;
  }
  if (readings.length === 0) return selectedContract.value.start_meter_bw || 0;
  const latest = readings.reduce((prev, curr) =>
    new Date(prev.created_at).getTime() > new Date(curr.created_at).getTime()
      ? prev
      : curr,
  );
  return latest.end_meter || 0;
});

function getReadingAuthor(reading: any): string {
  if (reading.user?.name) return reading.user.name;
  if (reading.user?.username) return reading.user.username;
  const srId = reading.service_report_id || reading.service_report?.id;
  const sr = reading.service_report || (srId ? findServiceReport(srId) : null);
  if (sr) {
    if (sr.technician_name) return sr.technician_name;
    if (sr.technician_name_copier) return sr.technician_name_copier;
    if (sr.technician?.name) return sr.technician.name;
    if (sr.technician_id) {
      const tech = (technicians.value || []).find((t: any) => String(t.id) === String(sr.technician_id));
      if (tech?.name) return tech.name;
    }
  }
  return "-";
}

function getCustomerName(contractId: number | null) {
  const ci = contractItems.value.find((c) => c.id === contractId);
  return ci ? findCustomer(ci.customer_id)?.company_name || "-" : "-";
}

function getUnitName(contractId: number | null) {
  const ci = contractItems.value.find((c) => c.id === contractId);
  return ci ? findUnit(ci.unit_id)?.model || "-" : "-";
}

function getSerialNumber(contractId: number | null) {
  const ci = contractItems.value.find((c) => c.id === contractId);
  return ci ? findUnit(ci.unit_id)?.serial_no || "-" : "-";
}

function getPaperSizeName(reading: any) {
  if (reading?.paper_size?.name) return reading.paper_size.name;
  const found = paperSizes.value.find(
    (p) => String(p.id) === String(reading?.paper_size_id),
  );
  return found ? found.name : "-";
}

const contractItemOptions = computed(() =>
  contractItems.value.map((c: any) => ({
    value: c.id,
    label: `${getCustomerName(c.id)} - ${getUnitName(c.id)} (${getSerialNumber(c.id)})`,
  })),
);

const paperSizeOptions = computed(() =>
  paperSizes.value.map((p: any) => ({ value: p.id, label: p.name })),
);

const paperTypeOptions = computed(() =>
  paperTypes.value.map((p: any) => ({ value: p.id, label: p.name })),
);

const colorModeOptions = [
  { value: "bw", label: "BW" },
  { value: "color", label: "Color" },
];

async function submitReading() {
  if (!form.value.contract_item_id)
    return toast.warning("Select a contract/unit!");
  if (!form.value.reading_date)
    return toast.warning("Reading date is required!");
  const readingDate = new Date(
    `${form.value.reading_date}T00:00:00`,
  ).toISOString();
  const ci = selectedContract.value;

  // Multi-size mode: BW + Color rows per filled size x kind.
  if (contractSizes.value.length > 0) {
    const payloads: any[] = [];
    for (const s of contractSizes.value) {
      for (const mode of ["bw", "color"]) {
        const row = rowInput(s.paper_size_id, s.paper_type_id, mode);
        if (
          row.end_meter === null ||
          row.end_meter === undefined ||
          String(row.end_meter) === ""
        )
          continue;
        const startMeter = prevFor(s.paper_size_id, s.paper_type_id, mode);
        const endMeter = Number(row.end_meter);
        if (endMeter < startMeter) {
          return toast.warning(
            `Size ${s.name} (${mode.toUpperCase()}): Current Meter (${endMeter}) must not be smaller than Previous (${startMeter})!`,
          );
        }
        payloads.push({
          user_id: currentUser.value?.id,
          contract_item_id: ci.id,
          unit_id: ci.unit_id,
          paper_size_id: s.paper_size_id,
          paper_type_id: s.paper_type_id,
          color_mode: mode,
          start_meter: startMeter,
          end_meter: endMeter,
          total_usage: Math.max(0, endMeter - startMeter),
          reading_date: readingDate,
        });
      }
    }
    if (payloads.length === 0)
      return toast.warning(
        "Fill in Current Meter for at least one paper size!",
      );
    try {
      for (const p of payloads) {
        await api.post("/monthly-meter-readings/", p);
      }
      await refreshInBackground();
      showAddModal.value = false;
      toast.success(`${payloads.length} Meter Readings saved successfully!`);
      sizeInputs.value = {};
      form.value.end_meter = 0;
    } catch (err: any) {
      toast.error(err.message || "Failed to save meter reading");
    }
    return;
  }

  // Single mode (contract without rates): legacy single-size form.
  // Reuse `ci` from the top of submitReading().
  // paper size optional: empty = flat reading without size breakdown

  const startMeter = previousReading.value || 0;
  const endMeter = form.value.end_meter;
  if (endMeter < startMeter) {
    return toast.warning(
      "Current Meter must not be smaller than the previous value!",
    );
  }

  try {
    await api.post("/monthly-meter-readings/", {
      user_id: currentUser.value?.id,
      contract_item_id: ci.id,
      unit_id: ci.unit_id,
      paper_size_id: form.value.paper_size_id || "",
      paper_type_id: form.value.paper_type_id,
      color_mode:
        String(form.value.color_mode).toLowerCase() === "color"
          ? "color"
          : "bw",
      start_meter: startMeter,
      end_meter: endMeter,
      total_usage: Math.max(0, endMeter - startMeter),
      reading_date: readingDate,
    });
    await refreshInBackground();
    showAddModal.value = false;
    toast.success("Meter Reading saved successfully!");
    form.value.end_meter = 0;
    form.value.paper_size_id = null;
  } catch (err: any) {
    toast.error(err.message || "Failed to save meter reading");
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="Meter Reading"
      button-label="Input Meter Reading"
      permission="monthly_meter_reading:create"
      @add="showAddModal = true"
    />

    <!-- Technician Context & Filters Bar -->
    <div class="card p-md mb-md tech-filter-bar">
      <div class="tech-info-pill">
        <div class="tech-avatar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
        <div>
          <div class="tech-label">Teknisi Login</div>
          <div class="tech-name">{{ currentUser?.name || currentUser?.username || 'Teknisi' }}</div>
        </div>
      </div>

      <div class="filter-controls">
        <!-- Admin selector if admin/superadmin -->
        <div v-if="isAdminOrSuperadmin" class="admin-select-wrapper">
          <label class="filter-label">Filter View:</label>
          <select v-model="techFilter" class="form-select filter-select">
            <option value="mine">Hanya Saya ({{ currentUser?.name || 'Admin' }})</option>
            <option value="all">Semua Teknisi</option>
            <option v-for="t in technicians" :key="t.id" :value="String(t.id)">
              {{ t.name || t.employee_code || ('Teknisi ' + String(t.id).slice(0, 6)) }}
            </option>
          </select>
        </div>

        <!-- Search Bar -->
        <div class="search-wrapper">
          <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            class="form-input search-input"
            placeholder="Cari customer, unit, SN, ukuran..."
          />
          <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''" title="Clear search">×</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Period / Date</th>
              <th>Customer</th>
              <th>Unit</th>
              <th>Serial Number</th>
              <th>Paper Size</th>
              <th>Prev Meter</th>
              <th>Curr Meter</th>
              <th>Total Usage</th>
              <th v-if="isAdminOrSuperadmin && techFilter === 'all'">Input By</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="reading in paginatedData" :key="reading.id">
              <td>
                {{
                  reading.reading_date || reading.created_at
                    ? new Date(reading.reading_date || reading.created_at).toLocaleDateString("en-GB", {
                        year: "numeric",
                        month: "short",
                        day: "2-digit",
                      })
                    : "-"
                }}
              </td>
              <td><b>{{ getCustomerName(reading.contract_item_id) }}</b></td>
              <td>{{ getUnitName(reading.contract_item_id) }}</td>
              <td><code>{{ getSerialNumber(reading.contract_item_id) }}</code></td>
              <td>
                <span class="badge badge-subtle">
                  {{ getPaperSizeName(reading) }}
                  <span v-if="reading.color_mode">({{ reading.color_mode.toUpperCase() }})</span>
                </span>
              </td>
              <td>{{ reading.start_meter }}</td>
              <td><b>{{ reading.end_meter }}</b></td>
              <td>
                <span class="usage-pill">+{{ reading.total_usage }}</span>
              </td>
              <td v-if="isAdminOrSuperadmin && techFilter === 'all'">
                <span class="text-sm text-muted">{{ getReadingAuthor(reading) }}</span>
              </td>
            </tr>
            <tr v-if="data.length === 0">
              <td :colspan="isAdminOrSuperadmin && techFilter === 'all' ? 9 : 8" class="text-center py-xl text-muted">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.4;">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  <div>Belum ada riwayat meter reading untuk teknisi ini.</div>
                  <button v-if="can('monthly_meter_reading:create')" class="btn btn-outline btn-sm" @click="showAddModal = true">
                    + Input Meter Reading Sekarang
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile Cards View -->
      <div class="mobile-readings-list">
        <div v-for="reading in paginatedData" :key="reading.id" class="mobile-reading-card">
          <div class="m-mr-header">
            <div>
              <span class="m-mr-title font-bold">{{ getCustomerName(reading.contract_item_id) }}</span>
              <div v-if="isAdminOrSuperadmin && techFilter === 'all'" class="text-xs text-muted" style="margin-top: 2px;">
                Oleh: {{ getReadingAuthor(reading) }}
              </div>
            </div>
            <span class="badge badge-info">
              {{ reading.reading_date || reading.created_at ? new Date(reading.reading_date || reading.created_at).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" }) : "-" }}
            </span>
          </div>

          <div class="m-mr-body">
            <div class="m-row">
              <span class="m-label">Unit:</span>
              <span class="m-val">{{ getUnitName(reading.contract_item_id) }} ({{ getSerialNumber(reading.contract_item_id) }})</span>
            </div>
            <div class="m-row" v-if="getPaperSizeName(reading) !== '-'">
              <span class="m-label">Paper Size:</span>
              <span class="m-val">{{ getPaperSizeName(reading) }} <span v-if="reading.color_mode">({{ reading.color_mode.toUpperCase() }})</span></span>
            </div>
            <div class="m-meter-box">
              <div class="m-meter-item">
                <span class="m-label">Start:</span>
                <span class="m-val font-semibold">{{ reading.start_meter }}</span>
              </div>
              <div class="m-meter-arrow">→</div>
              <div class="m-meter-item">
                <span class="m-label">End:</span>
                <span class="m-val font-semibold">{{ reading.end_meter }}</span>
              </div>
              <div class="m-usage-badge">
                +{{ reading.total_usage }}
              </div>
            </div>
          </div>
        </div>
        <div v-if="data.length === 0" class="text-center py-xl text-muted">
          <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.4;">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            <div>Belum ada riwayat meter reading untuk teknisi ini.</div>
            <button v-if="can('monthly_meter_reading:create')" class="btn btn-outline btn-sm" @click="showAddModal = true">
              + Input Meter Reading Sekarang
            </button>
          </div>
        </div>
      </div>

      <div v-if="totalPages > 1" class="pagination" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-top: 1px solid var(--color-border-light);">
        <div class="pagination-info" style="font-size: 13px; color: var(--color-text-muted);">
          Showing {{ (currentPage - 1) * perPage + 1 }}-{{ Math.min(currentPage * perPage, data.length) }} of {{ data.length }} entries
        </div>
        <div class="pagination-buttons" style="display: flex; gap: 6px;">
          <button class="btn btn-outline btn-sm" :disabled="currentPage === 1" @click="currentPage--">Prev</button>
          <button v-for="p in totalPages" :key="p" class="btn btn-sm" :class="p === currentPage ? 'btn-primary' : 'btn-outline'" @click="currentPage = p">{{ p }}</button>
          <button class="btn btn-outline btn-sm" :disabled="currentPage === totalPages" @click="currentPage++">Next</button>
        </div>
      </div>
    </div>

    <!-- Add Modal -->
    <div v-if="showAddModal" class="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">Input Meter Reading</h2>
          <button class="btn-close" @click="showAddModal = false">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label"
              >Unit / Customer <span class="text-danger">*</span></label
            >
            <CustomSelect v-model="form.contract_item_id" class="form-select" :options="contractItemOptions" placeholder="-- Select Unit / Contract --" />
          </div>

          <div class="form-group">
            <label class="form-label"
              >Reading Date <span class="text-danger">*</span></label
            >
            <input
              v-model="form.reading_date"
              type="date"
              class="form-input"
              required
            />
            <small class="text-muted"
              >Used to determine the billing period on the invoice.</small
            >
          </div>

          <div
            v-if="selectedContract && contractSizes.length > 0"
            class="meter-inputs"
          >
            <p class="text-sm text-muted mb-md">
              This contract has {{ contractSizes.length }} paper size/kind
              combos — fill BW + Color meter per combo:
            </p>
            <div
              v-for="s in contractSizes"
              :key="s.paper_size_id + '|' + String(s.paper_type_id ?? '')"
              class="size-block"
            >
              <div class="size-title">
                Size: <b>{{ s.name }}</b
                ><span v-if="s.type_name"> / {{ s.type_name }}</span>
                <span class="text-muted"
                  >(free:
                  {{ s.quota_applies_to === "bw" ? "BW" : "Color" }})</span
                >
              </div>
              <div
                v-for="mode in ['bw', 'color']"
                :key="mode"
                class="flex gap-md"
                style="margin-bottom: 0.5rem"
              >
                <div class="form-group flex-1 mb-0">
                  <label class="form-label text-muted"
                    >Prev {{ mode.toUpperCase() }}</label
                  >
                  <input
                    type="number"
                    :value="prevFor(s.paper_size_id, s.paper_type_id, mode)"
                    class="form-input"
                    disabled
                  />
                </div>
                <div class="form-group flex-1 mb-0">
                  <label class="form-label"
                    >Curr {{ mode.toUpperCase() }}</label
                  >
                  <input
                    type="number"
                    v-model.number="
                      rowInput(s.paper_size_id, s.paper_type_id, mode).end_meter
                    "
                    class="form-input"
                    :min="prevFor(s.paper_size_id, s.paper_type_id, mode)"
                    placeholder="Empty = skip"
                  />
                </div>
              </div>
            </div>
          </div>
          <div v-else-if="selectedContract" class="meter-inputs">
            <div class="form-group">
              <label class="form-label"
                >Paper Size <span class="text-danger">*</span></label
              >
              <CustomSelect v-model="form.paper_size_id" class="form-select" :options="paperSizeOptions" placeholder="-- No specific size (optional) --" />
            </div>
            <div class="form-group">
              <label class="form-label">Paper Kind (optional)</label>
              <CustomSelect v-model="form.paper_type_id" class="form-select" :options="paperTypeOptions" placeholder="-- Select Paper Kind --" />
            </div>
            <div class="form-group">
              <label class="form-label"
                >Color Mode <span class="text-danger">*</span></label
              >
              <CustomSelect v-model="form.color_mode" class="form-select" :options="colorModeOptions" />
            </div>
            <div class="flex gap-md">
              <div class="form-group flex-1 mb-0">
                <label class="form-label text-muted">Previous Meter</label>
                <input
                  type="number"
                  :value="previousReading"
                  class="form-input"
                  disabled
                />
              </div>
              <div class="form-group flex-1 mb-0">
                <label class="form-label"
                  >Current Meter <span class="text-danger">*</span></label
                >
                <input
                  type="number"
                  v-model.number="form.end_meter"
                  class="form-input"
                />
              </div>
            </div>
          </div>
          <div v-else class="text-center py-md text-muted text-sm">
            Select a unit first to see the previous meter.
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" @click="showAddModal = false">
            Cancel
          </button>
          <button
            v-if="can('monthly_meter_reading:create')"
            class="btn btn-primary"
            @click="submitReading"
          >
            Save Data
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal {
  background: var(--color-surface);
  width: 90%;
  max-width: 500px;
  border-radius: var(--radius-lg);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
}
.modal-header {
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--color-border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.modal-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
}
.btn-close {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}
.btn-close:hover {
  background: var(--color-surface-sunken);
  color: var(--color-text);
}
.modal-body {
  padding: var(--space-lg);
}
.modal-footer {
  padding: var(--space-md) var(--space-lg);
  border-top: 1px solid var(--color-border-light);
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}
.meter-inputs {
  background: var(--color-surface-sunken);
  padding: var(--space-md);
  border-radius: var(--radius-md);
}
.size-block {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  margin-bottom: var(--space-md);
}
.size-block:last-child {
  margin-bottom: 0;
}
.size-title {
  font-size: var(--font-size-sm);
  margin-bottom: var(--space-sm);
}
.mb-md {
  margin-bottom: var(--space-md);
}

.mobile-readings-list {
  display: none;
}

@media (max-width: 768px) {
  .table-responsive {
    display: none;
  }

  .mobile-readings-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
  }

  .mobile-reading-card {
    background: var(--color-surface, #ffffff);
    border: 1px solid var(--color-border-light, #e2e8f0);
    border-radius: var(--radius-md, 10px);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04));
  }

  .m-mr-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }

  .m-mr-title {
    font-size: 14px;
    color: var(--color-text, #0f172a);
  }

  .m-mr-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
  }

  .m-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .m-label {
    color: var(--color-text-muted, #64748b);
  }

  .m-val {
    text-align: right;
  }

  .m-meter-box {
    margin-top: 4px;
    padding: 10px 12px;
    background: var(--color-surface-raised, #f8fafc);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
  }

  .m-meter-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .m-meter-arrow {
    color: var(--color-text-muted, #94a3b8);
    font-weight: 700;
  }

  .m-usage-badge {
    padding: 3px 8px;
    background: rgba(16, 185, 129, 0.12);
    color: #059669;
    font-weight: 700;
    border-radius: 6px;
    font-size: 12px;
  }
}

.tech-filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: var(--radius-md, 8px);
}

.tech-info-pill {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tech-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(0, 51, 102, 0.08);
  color: #003366;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tech-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-text-muted, #64748b);
  letter-spacing: 0.5px;
}

.tech-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text, #0f172a);
}

.filter-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.admin-select-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.filter-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted, #64748b);
  white-space: nowrap;
}

.filter-select {
  height: 36px;
  padding: 0 10px;
  font-size: 13px;
  border-radius: 6px;
  border: 1px solid var(--color-border, #cbd5e1);
  background: var(--color-surface, #fff);
  color: var(--color-text, #0f172a);
  cursor: pointer;
}

.search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 10px;
  color: var(--color-text-muted, #94a3b8);
  pointer-events: none;
}

.search-input {
  height: 36px;
  padding-left: 32px;
  padding-right: 28px;
  min-width: 220px;
  font-size: 13px;
  border-radius: 6px;
}

.search-clear {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  font-size: 16px;
  color: var(--color-text-muted, #94a3b8);
  cursor: pointer;
  padding: 2px 6px;
}

.usage-pill {
  display: inline-block;
  padding: 2px 8px;
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
  font-weight: 700;
  border-radius: 12px;
  font-size: 12px;
}

.badge-subtle {
  background: var(--color-surface-raised, #f1f5f9);
  color: var(--color-text, #334155);
  border: 1px solid var(--color-border-light, #e2e8f0);
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 11px;
}
</style>
