<script setup lang="ts">
import DataTable from "@/components/ui/DataTable.vue";
import FormModal from "@/components/ui/FormModal.vue";
import PageHeader from "@/components/ui/PageHeader.vue";
import { useMasterStore } from "@/composables/useMasterStore";
import { usePermission } from "@/composables/usePermission";
import { useToast } from "@/composables/useToast";
import { api } from "@/services/api";
import { isCopierReport } from "@/utils/copierReport";
import type { TableColumn } from "@/types";
import { computed, onMounted, reactive, ref, watch } from "vue";

const toast = useToast();
const { can } = usePermission();
const { customers, units, sales, findProduct, getUnitsByCustomer, getContractsByCustomer, deliveryOrders } =
  useMasterStore();

const columns: TableColumn[] = [
  { key: "request_no", label: "Request No" },
  { key: "_company_name", label: "Company" },
  { key: "_pic_name", label: "PIC Name" },
  { key: "request_date", label: "Request Date" },
  { key: "status", label: "Status" },
];

const serviceRequests = ref<any[]>([]);
const showModal = ref(false);
const showRequestDetailModal = ref(false);
const selectedRequest = ref<any>(null);
const isLoading = ref(false);
const rentalsData = ref<any[]>([]);
const warrantiesData = ref<any[]>([]);

const { jobOrders, serviceReports, technicians } = useMasterStore();

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
  problem_description: "",
  request_date: new Date().toISOString().slice(0, 10),
});

// Fetch all rentals to know which units are rented by which customer
async function fetchRentals() {
  try {
    const data = await api.get<{ data: any[] }>("/rents");
    rentalsData.value = data.data || [];
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

// Get units rented AND products purchased by the selected customer
const customerRentalUnits = computed(() => {
  if (!form.customer_id) return [];

  const unitMap = new Map<string, any>();

  // From rental items
  for (const rental of rentalsData.value) {
    if (rental.customer_id === form.customer_id && rental.rental_items) {
      for (const item of rental.rental_items) {
        if (item.unit_id && item.unit) {
          unitMap.set(item.unit_id, {
            id: item.unit_id,
            label:
              `${item.unit.brand || ""} ${item.unit.model || item.unit.unit_name || ""} (SN: ${item.unit.serial_no || "-"})`.trim(),
            source: "rental",
            warranty: { active: false }, // rental units are company-owned, no customer warranty
          });
        }
        if (item.product_id && item.product) {
          const warranty = getWarrantyStatus(
            form.customer_id,
            null,
            item.product_id,
            null,
          );
          unitMap.set("rent_prod_" + item.product_id, {
            id: item.product_id,
            label: `${item.product.name || "Product"} (Qty: ${item.qty || 1})`,
            source: "rental",
            warranty,
          });
        }
      }
    }
  }

  // From sales (purchased products)
  for (const sale of sales.value) {
    if (
      (sale as any).customer_id === form.customer_id &&
      (sale as any).sale_items
    ) {
      for (const si of (sale as any).sale_items) {
        const prod = findProduct(si.product_id);
        const key = "sale_prod_" + si.product_id;
        if (!unitMap.has(key)) {
          // Match by product_id OR sale_id (backend may link warranty to sale, not product)
          const warranty = getWarrantyStatus(
            form.customer_id,
            null,
            si.product_id,
            (sale as any).id,
          );
          unitMap.set(key, {
            id: si.product_id,
            label: `${prod?.name || "Product ID: " + si.product_id} (Qty: ${si.qty || 1})`,
            source: "sale",
            warranty,
          });
        }
      }
    }
  }

  // Also from contract items
  const contractUnits = getUnitsByCustomer(form.customer_id as any);
  for (const u of contractUnits) {
    if (!unitMap.has(u.id as string)) {
      unitMap.set(u.id as string, {
        id: u.id,
        label:
          `${(u as any).brand || ""} ${(u as any).model || ""} (SN: ${(u as any).serial_number || "-"})`.trim(),
        source: "contract",
        warranty: { active: false }, // contract units are company-owned, no customer warranty
      });
    }
  }

  // Tandai tiap barang: delivered boleh diajukan SR, sisanya tampil
  // dengan label "Belum Dikirim" (checkbox terkunci).
  return Array.from(unitMap.values()).map((u: any) => {
    const key = String(u.id);
    const delivered =
      deliveredItemIds.value.unitIds.has(key) ||
      deliveredItemIds.value.productIds.has(key);
    return {
      ...u,
      delivered,
      doStatus: delivered
        ? "delivered"
        : deliveredItemIds.value.statusOf.get(key) || null,
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

function openAdd() {
  Object.assign(form, {
    request_no: `REQ-${Date.now().toString().slice(-6)}`,
    customer_id: "",
    unit_ids: [],
    problem_description: "",
    request_date: new Date().toISOString().slice(0, 10),
  });
  showModal.value = true;
}

async function fetchRequests() {
  try {
    const data = await api.get<{ data: any[] }>("/service-requests");
    serviceRequests.value = data.data.map((r: any) => ({
      ...r,
      customer: r.customer?.name || "-",
      _company_name: r.customer?.company_name || r.customer?.name || "-",
      _pic_name: r.customer?.pic_name || "-",
    }));
  } catch (error) {
    console.error("Failed to fetch data", error);
  }
}

async function handleSubmit() {
  if (!form.customer_id || !form.problem_description) return;
  // Pengaman frontend (backend juga menolak dengan 422 bila lolos dari sini).
  const chosen = form.unit_ids.length > 0 ? form.unit_ids[0] : null;
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
    unit_id: form.unit_ids.length > 0 ? form.unit_ids[0] : null,
    problem_description: form.problem_description,
    request_date: new Date(form.request_date).toISOString(),
  };

  try {
    const res = await fetch(
      `${import.meta.env.VITE_API_BASE_URL}/service-requests`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionStorage.getItem("bias_token")}`,
        },
        body: JSON.stringify(payload),
      },
    );

    if (res.ok) {
      toast.success("Service request created successfully!");
      showModal.value = false;
      fetchRequests();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(
        "Failed: " + ((err as any)?.message || JSON.stringify(err)),
      );
    }
  } catch (error) {
    toast.error("A network error occurred.");
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
    const res = await fetch(
      `${import.meta.env.VITE_API_BASE_URL}/service-requests`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionStorage.getItem("bias_token")}`,
        },
        body: JSON.stringify(payload),
      },
    );

    if (res.ok) {
      toast.success("Technician assigned successfully! Job order created.");
      showAssignModal.value = false;
      fetchRequests(); // To maybe refresh status if backend updates SR status automatically
    } else {
      const err = await res.json();
      toast.error("Failed: " + JSON.stringify(err));
    }
  } catch (error) {
    toast.error("A network error occurred.");
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

function openDetail(row: any) {
  selectedRequest.value = row;
  showRequestDetailModal.value = true;
}

onMounted(() => {
  fetchRequests();
  fetchRentals();
  fetchWarranties();
});
</script>

<template>
  <div>
    <PageHeader
      title="Service Request Management"
      button-label="Create New Request"
      permission="service_request:create"
      @add="openAdd"
    />

    <DataTable
      :columns="columns"
      :data="serviceRequests"
      search-placeholder="Search complaints..."
    >
      <template #cell-request_date="{ value }">{{
        new Date(value).toLocaleDateString("en-GB")
      }}</template>
      <template #cell-status="{ value }">
        <span
          class="badge"
          :class="
            value === 'assigned' || value === 'in_progress'
              ? 'badge-success'
              : 'badge-warning'
          "
        >
          {{ value.toUpperCase() }}
        </span>
      </template>
      <template #actions="{ row }">
        <button
          class="action-btn"
          title="View Detail"
          @click="openDetail(row)"
          style="color: var(--color-primary); border-color: transparent"
        >
          <svg
            class="action-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
      </template>
    </DataTable>

    <FormModal
      :open="showRequestDetailModal"
      title="Service Request Details"
      @close="showRequestDetailModal = false"
    >
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
        <div class="detail-problem-box">
          <span
            class="detail-info-label"
            style="display: block; margin-bottom: 6px"
            >Complaint / Problem</span
          >
          <p class="detail-problem-text">
            {{ selectedRequest.problem_description || "-" }}
          </p>
        </div>

        <!-- History -->
        <div class="detail-section-header">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          Service Report History
        </div>

        <div v-if="relatedReports.length === 0" class="detail-empty-state">
          No service reports for this request yet.
        </div>
        <div v-else class="detail-report-list">
          <div
            v-for="rep in relatedReports"
            :key="rep.id"
            class="detail-report-row"
          >
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
              <span
                :class="
                  rep.status === 'completed'
                    ? 'badge badge-success'
                    : 'badge badge-info'
                "
              >
                {{ rep.status === "completed" ? "Completed" : rep.status }}
              </span>
              <button
                class="detail-look-btn"
                @click="$router.push(`/shared/service-reports/${rep.id}`)"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
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

    <FormModal
      :open="showModal"
      title="Log Complaint (Service Request)"
      @close="showModal = false"
      @submit="handleSubmit"
    >
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Request Number</label>
          <input
            v-model="form.request_no"
            type="text"
            class="form-input"
            required
          />
        </div>
        <div class="form-group">
          <label class="form-label">Received Date</label>
          <input
            v-model="form.request_date"
            type="date"
            class="form-input"
            required
          />
        </div>
      </div>

      <div class="form-group mt-3">
        <label class="form-label">Customer</label>
        <select v-model="form.customer_id" class="form-select" required>
          <option value="">-- Select Customer --</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">
            {{ (c as any).company_name || (c as any).name
            }}{{ (c as any).pic_name ? " - PIC: " + (c as any).pic_name : "" }}
          </option>
        </select>
      </div>

      <div class="form-group mt-3">
        <label class="form-label">Faulty Machine</label>
        <div
          v-if="!form.customer_id"
          style="
            padding: 12px;
            background: var(--color-surface-raised);
            border-radius: var(--radius-sm);
            color: var(--color-text-muted);
            font-size: var(--font-size-sm);
          "
        >
          Select a customer first
        </div>
        <div
          v-else-if="customerRentalUnits.length === 0"
          style="
            padding: 12px;
            background: var(--color-surface-raised);
            border-radius: var(--radius-sm);
            color: var(--color-text-muted);
            font-size: var(--font-size-sm);
          "
        >
          Belum ada unit/barang tercatat untuk customer ini.
        </div>
        <div v-else>
          <div
            v-if="!hasDeliveredUnit"
            style="
              padding: 12px;
              margin-bottom: 8px;
              background: var(--color-surface-raised);
              border-radius: var(--radius-sm);
              color: var(--color-text-muted);
              font-size: var(--font-size-sm);
            "
          >
            Belum ada barang yang dikirim (delivered) untuk customer ini —
            service request baru bisa dibuat setelah barang/DO diterima customer.
          </div>
          <div class="unit-checkbox-list">
          <label
            v-for="u in customerRentalUnits"
            :key="u.id"
            class="unit-checkbox-item"
            :class="{ 'unit-disabled': !u.delivered }"
          >
            <input
              type="checkbox"
              :value="u.id"
              v-model="form.unit_ids"
              :disabled="!u.delivered"
            />
            <span class="unit-checkbox-label">{{ u.label }}</span>
            <span
              v-if="!u.delivered"
              class="delivery-badge delivery-pending"
              :title="
                u.doStatus
                  ? `Status DO: ${u.doStatus}`
                  : 'Belum ada DO untuk barang ini'
              "
            >
              Belum Dikirim{{
                u.doStatus ? ` (DO ${u.doStatus})` : ""
              }}
            </span>
            <span
              class="unit-source-badge"
              :class="
                u.source === 'rental'
                  ? 'badge-rental'
                  : u.source === 'sale'
                    ? 'badge-sale'
                    : 'badge-contract'
              "
            >
              {{
                u.source === "rental"
                  ? "Rental"
                  : u.source === "sale"
                    ? "Purchase"
                    : "Contract"
              }}
            </span>
            <span
              v-if="u.warranty?.active"
              class="warranty-badge warranty-active"
              :title="`Warranty until ${u.warranty.endDate}`"
            >
              ✓ Warranty
            </span>
            <span
              v-else
              class="warranty-badge warranty-none"
              title="No active warranty — charges will apply"
            >
              Billable
            </span>
          </label>
          </div>
        </div>
      </div>

      <div class="form-group mt-3">
        <label class="form-label">Complaint Description (Problem)</label>
        <textarea
          v-model="form.problem_description"
          class="form-input"
          rows="4"
          placeholder="Describe the complaint in detail"
          required
        ></textarea>
      </div>

      <div v-if="isLoading" class="mt-2 text-center text-sm text-gray-500">
        Saving data...
      </div>
    </FormModal>

    <FormModal
      :open="showAssignModal"
      title="Assign Technician (Create Job Order)"
      @close="showAssignModal = false"
      @submit="handleAssignSubmit"
    >
      <div class="form-group mt-3">
        <label class="form-label">Select Technician</label>
        <select v-model="assignForm.technician_id" class="form-select" required>
          <option value="">-- Select Technician --</option>
          <option v-for="t in technicians" :key="t.id" :value="t.id">
            {{ t.name }}
          </option>
        </select>
      </div>
      <div class="form-group mt-3">
        <label class="form-label">Assignment Date</label>
        <input
          v-model="assignForm.scheduled_date"
          type="date"
          class="form-input"
          required
        />
      </div>
      <div class="form-group mt-3">
        <label class="form-label">Instructions / Notes for Technician</label>
        <textarea
          v-model="assignForm.instructions"
          class="form-input"
          rows="4"
          required
        ></textarea>
      </div>
      <div v-if="isLoading" class="mt-2 text-center text-sm text-gray-500">
        Saving data...
      </div>
    </FormModal>
  </div>
</template>

<style scoped>
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
