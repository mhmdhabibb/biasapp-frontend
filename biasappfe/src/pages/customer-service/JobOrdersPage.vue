<script setup lang="ts">
import FormModal from "@/components/ui/FormModal.vue";
import { useMasterStore } from "@/composables/useMasterStore";
import { useToast } from "@/composables/useToast";
import { api } from "@/services/api";
import { computed, onMounted, ref } from "vue";

const toast = useToast();
const { technicians, units, products } = useMasterStore();

const jobOrders = ref<any[]>([]);
const serviceRequests = ref<any[]>([]);
const deliveryOrders = ref<any[]>([]);
const activeTab = ref("sr");
const draggedTask = ref<any | null>(null);

const searchUnassigned = ref("");
const searchTech = ref("");
const dragOverTechId = ref<string | number | null>(null);

// ── Job type filter for technician lanes (Requests / Deliveries / Visits) ──
const jobTypeFilter = ref<"all" | "sr" | "do" | "visit">("all");
const VISIT_JOB_TYPES = ["visit", "maintenance_visit", "meter_reading"];

async function fetchJobOrders() {
  try {
    const data = await api.get<{ data: any[] }>("/job-orders");
    jobOrders.value = data.data.map((j: any) => {
      const isDelivery =
        j.job_type === "delivery" || !!j.delivery_order_id || !!j.delivery_order;
      const isVisit =
        j.job_type === "visit" || VISIT_JOB_TYPES.includes(String(j.job_type || "").toLowerCase());
      const sr = j.service_request || null;
      const srpt = j.service_report || null;
      const customer =
        sr?.customer || j.delivery_order?.customer || srpt?.customer || null;
      let taskType = "sr";
      if (isDelivery) taskType = "do";
      else if (isVisit) taskType = "visit";
      return {
        ...j,
        taskType,
        service_request_no:
          sr?.request_no ||
          j.delivery_order?.do_number ||
          srpt?.report_no ||
          j.job_order_no ||
          "-",
        customer_name:
          customer?.company_name || customer?.name || "-",
        problem:
          sr?.problem_description ||
          j.delivery_order?.notes ||
          srpt?.machine_problem ||
          j.instructions ||
          "-",
      };
    });
  } catch (error) {
    console.error("Failed to fetch data", error);
  }
}

async function fetchServiceRequests() {
  try {
    const data = await api.get<{ data: any[] }>("/service-requests");
    serviceRequests.value = data.data;
  } catch (error) {
    console.error("Failed to fetch data SR", error);
  }
}

async function fetchDeliveryOrders() {
  try {
    const data = await api.get<{ data: any[] }>("/delivery-orders");
    deliveryOrders.value = data.data.filter((d: any) =>
      ['rental', 'sale', 'inbound'].includes(String(d.do_type || '').toLowerCase()),
    );
  } catch (error) {
    console.error("Failed to fetch data DO", error);
  }
}

onMounted(() => {
  fetchJobOrders();
  fetchServiceRequests();
  fetchDeliveryOrders();
});

const unassignedRequests = computed(() => {
  // Find SRs that don't have a job order yet (or just show all pending/open)
  const assignedSrIds = new Set(
    jobOrders.value.map((j) => j.service_request_id),
  );
  return serviceRequests.value.map(sr => ({ ...sr, taskType: 'sr' })).filter(
    (sr) =>
      (sr.status === "pending" || sr.status === "open") &&
      !assignedSrIds.has(sr.id) &&
      (sr.request_no
        .toLowerCase()
        .includes(searchUnassigned.value.toLowerCase()) ||
        (sr.customer?.name || "")
          .toLowerCase()
          .includes(searchUnassigned.value.toLowerCase())),
  );
});

const assignedDeliveryIds = computed(
  () =>
    new Set(
      jobOrders.value
        .map((j: any) => j.delivery_order_id || j.delivery_order?.id)
        .filter(Boolean)
        .map(String),
    ),
);

const unassignedDeliveries = computed(() => {
  return deliveryOrders.value.map(d => ({ ...d, taskType: 'do' })).filter(
    (d) =>
      !assignedDeliveryIds.value.has(String(d.id)) &&
      !d.technician_id &&
      (d.status === 'pending' || d.status === 'draft') &&
      (d.do_number.toLowerCase().includes(searchUnassigned.value.toLowerCase()) ||
        (d.customer?.name || "").toLowerCase().includes(searchUnassigned.value.toLowerCase())),
  );
});

// Visit copier yang belum di-assign teknisi (job_type=visit, technician_id kosong).
const unassignedVisits = computed(() => {
  return jobOrders.value
    .filter((j) => j.taskType === "visit" && !j.technician_id)
    .map((j) => ({
      ...j,
      taskType: "visit",
      service_request_no:
        j.service_request_no ||
        j.service_report?.report_no ||
        j.job_order_no ||
        "-",
      customer_name:
        j.customer_name ||
        j.service_report?.customer?.company_name ||
        j.service_report?.customer?.name ||
        "-",
      problem:
        j.service_report?.machine_problem ||
        j.instructions ||
        "Scheduled copier meter visit",
    }))
    .filter((v) =>
      (v.service_request_no || "")
        .toLowerCase()
        .includes(searchUnassigned.value.toLowerCase()) ||
      (v.customer_name || "")
        .toLowerCase()
        .includes(searchUnassigned.value.toLowerCase()),
    );
});

const displayedUnassigned = computed(() => {
  if (activeTab.value === 'sr') return unassignedRequests.value;
  if (activeTab.value === 'do') return unassignedDeliveries.value;
  if (activeTab.value === 'visit') return unassignedVisits.value;
  return [];
});

const filteredTechs = computed(() => {
  if (!searchTech.value) return technicians.value;
  return technicians.value.filter(
    (t: any) =>
      t &&
      (t.name || (t.user && t.user.name) || "")
        .toLowerCase()
        .includes(searchTech.value.toLowerCase()),
  );
});

function getJobsForTech(techId: string | number) {
  const jobs = jobOrders.value
    .filter((j) => String(j.technician_id) === String(techId))
    .map((j: any) => ({
      ...j,
      taskType: j.taskType || (j.job_type === "delivery" ? "do" : "sr"),
    }));
  // Legacy: DO yang di-assign langsung (technician_id di DO) tapi belum punya baris job_orders.
  const covered = new Set(
    jobs
      .map((j: any) => j.delivery_order_id || j.delivery_order?.id)
      .filter(Boolean)
      .map(String),
  );
  const dos = deliveryOrders.value
    .filter(
      (d) =>
        String(d.technician_id) === String(techId) &&
        !covered.has(String(d.id)) &&
        !assignedDeliveryIds.value.has(String(d.id)),
    )
    .map((d) => ({ ...d, taskType: "do" }));
  return [...jobs, ...dos];
}

function getJobKind(job: any): "sr" | "do" | "visit" {
  const jt = String(job?.job_type || "").toLowerCase();
  if (VISIT_JOB_TYPES.includes(jt)) return "visit";
  if (job?.taskType === "visit") return "visit";
  return isDeliveryJob(job) ? "do" : "sr";
}

function getFilteredJobsForTech(techId: string | number) {
  const jobs = getJobsForTech(techId);
  if (jobTypeFilter.value === "all") return jobs;
  return jobs.filter((j) => getJobKind(j) === jobTypeFilter.value);
}

function jobTypeLabel(kind: string) {
  switch (kind) {
    case "sr":
      return "Requests";
    case "do":
      return "Deliveries";
    case "visit":
      return "Visits";
    default:
      return "jobs";
  }
}

const jobTypeCounts = computed(() => {
  const counts = { all: 0, sr: 0, do: 0, visit: 0 };
  const seen = new Set<string>();
  for (const t of technicians.value as any[]) {
    if (!t?.id) continue;
    for (const j of getJobsForTech(t.id)) {
      const key = String(j.id ?? `${j.job_order_no || j.do_number}-${t.id}`);
      if (seen.has(key)) continue;
      seen.add(key);
      counts.all += 1;
      counts[getJobKind(j)] += 1;
    }
  }
  return counts;
});

function statusBadgeClass(status: string) {
  switch ((status || "").toLowerCase()) {
    case "completed":
    case "done":
      return "badge-success";
    case "in_progress":
    case "in-progress":
    case "progress":
      return "badge-hold";
    case "cancelled":
    case "canceled":
      return "badge-danger";
    case "on_hold":
    case "hold":
      return "badge-warning";
    default:
      return "badge-neutral";
  }
}

function techName(t: any) {
  return t?.name || t?.user?.name || "Unknown";
}

function techInitials(t: any) {
  const name = techName(t);
  return name
    .split(" ")
    .map((w: string) => w[0])
    .filter((_: string, i: number) => i < 2)
    .join("")
    .toUpperCase();
}

function formatDateDisplay(d: string) {
  const date = new Date(d);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatFullDate(d?: string) {
  if (!d) return "-";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(d?: string) {
  if (!d) return "-";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "-";
  return `${formatFullDate(d)} · ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

// Detail modal
const selectedJob = ref<any | null>(null);
const selectedRequest = ref<any | null>(null);
let lastDragEnd = 0;

function markDragEnd() {
  lastDragEnd = Date.now();
  draggedTask.value = null;
}

function openJobDetail(job: any) {
  if (Date.now() - lastDragEnd < 300) return;
  selectedJob.value = job;
  selectedRequest.value = null;
}

function openRequestDetail(req: any) {
  if (Date.now() - lastDragEnd < 300) return;
  selectedRequest.value = req;
  selectedJob.value = null;
}

function closeDetail() {
  selectedJob.value = null;
  selectedRequest.value = null;
}

function technicianLabel(techId?: string | number) {
  if (!techId) return "Unassigned";
  const t = (technicians.value as any[]).find((x: any) => x && x.id === techId);
  return t ? techName(t) : "Unknown";
}

const detailCustomer = computed(() => {
  const sr = selectedJob.value?.service_request || selectedRequest.value;
  if (sr?.customer) return sr.customer;
  return (
    selectedJob.value?.delivery_order?.customer ||
    selectedJob.value?.service_report?.customer ||
    selectedRequest.value?.customer ||
    null
  );
});

// Drag and drop logic
let draggedRequest: any = null;

function onDragStart(req: any) {
  draggedRequest = req;
  draggedTask.value = req;
}

function dateKey(value: string | Date | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function isTerminalStatus(status: string | undefined) {
  return ["completed", "complete", "done", "cancelled", "canceled", "received", "delivered"]
    .includes(String(status || "").toLowerCase());
}

function isTechnicianBusy(technicianId: string | number) {
  const targetDate = dateKey(
    draggedTask.value?.delivery_date || draggedTask.value?.scheduled_date || new Date(),
  );
  if (!targetDate) return false;

  const hasSameDayJob = jobOrders.value.some((job) =>
    String(job.technician_id) === String(technicianId) &&
    dateKey(job.scheduled_date) === targetDate &&
    !isTerminalStatus(job.status),
  );
  const hasSameDayDelivery = deliveryOrders.value.some((delivery) =>
    String(delivery.technician_id) === String(technicianId) &&
    dateKey(delivery.delivery_date) === targetDate &&
    !isTerminalStatus(delivery.status),
  );
  return hasSameDayJob || hasSameDayDelivery;
}

function deliveryTypeLabel(type: string | undefined) {
  switch (String(type || "").toLowerCase()) {
    case "inbound": return "Sparepart Delivery";
    case "sale": return "Sales Delivery";
    default: return "Rental Delivery";
  }
}

function isDeliveryJob(job: any): boolean {
  return job?.taskType === "do" || job?.job_type === "delivery" || !!job?.delivery_order_id || !!job?.delivery_order;
}

function jobDo(job: any): any {
  return job?.delivery_order || (job?.taskType === "do" && job?.do_number ? job : null) || null;
}

function jobDoType(job: any): string {
  return job?.do_type || job?.delivery_order?.do_type || "";
}

function jobDeliveryDate(job: any): string {
  return job?.delivery_order?.delivery_date || job?.delivery_date || job?.scheduled_date || "";
}

function jobDoAddress(job: any): string {
  return job?.delivery_order?.delivery_address || job?.delivery_address || "";
}

function doItemsCount(job: any): number {
  const items = job?.delivery_order?.delivery_order_items || job?.delivery_order_items || [];
  return Array.isArray(items) ? items.length : 0;
}

function doItemLabel(item: any): string {
  if (item?.unit_id) {
    const u = (units.value as any[]).find((x: any) => String(x.id) === String(item.unit_id));
    const name = item.unit?.model || u?.model || "Unit";
    const sn = item.unit?.serial_no || u?.serial_no || "";
    return `${name}${sn ? ` (${sn})` : ""} x${item.qty || 1}`;
  }
  if (item?.product_id) {
    const p = (products.value as any[]).find((x: any) => String(x.id) === String(item.product_id));
    return `${item.product?.name || p?.name || "Product"} x${item.qty || 1}`;
  }
  return `Item x${item?.qty || 1}`;
}

function onDragOver(techId: string | number) {
  dragOverTechId.value = techId;
}

function onDragLeave() {
  dragOverTechId.value = null;
}

// ── Assign modal state ──
const showAssignModal = ref(false);
const assignTarget = ref<{ task: any; techId: string | number } | null>(null);
const assignDeliveryDate = ref("");
const assignScheduledDate = ref("");
const isAssigning = ref(false);

function toLocalDatetimeStr(d?: string | Date) {
  const date = d ? new Date(d) : new Date();
  if (isNaN(date.getTime())) return new Date().toISOString().slice(0, 16);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

async function onDrop(techId: string | number) {
  lastDragEnd = Date.now();
  if (!draggedRequest) return;
  dragOverTechId.value = null;

  // Open the assign modal instead of assigning directly
  assignTarget.value = { task: { ...draggedRequest }, techId };

  if (draggedRequest.taskType === "do") {
    // Default: keep the existing delivery date
    assignDeliveryDate.value = toLocalDatetimeStr(
      draggedRequest.delivery_date || new Date().toISOString(),
    );
  } else if (draggedRequest.taskType === "visit") {
    // Visit copier: default keep scheduled date dari generate.
    assignScheduledDate.value = toLocalDatetimeStr(
      draggedRequest.scheduled_date || new Date().toISOString(),
    );
  } else {
    // SR: default scheduled_date to now
    assignScheduledDate.value = toLocalDatetimeStr(new Date().toISOString());
  }

  draggedRequest = null;
  showAssignModal.value = true;
}

function cancelAssign() {
  showAssignModal.value = false;
  assignTarget.value = null;
}

async function confirmAssign() {
  if (!assignTarget.value || isAssigning.value) return;
  isAssigning.value = true;

  const { task, techId } = assignTarget.value;

  if (task.taskType === "visit") {
    // Visit copier: update JobOrder yang sudah ada (assign teknisi).
    const payload = {
      technician_id: techId,
      scheduled_date: new Date(assignScheduledDate.value).toISOString(),
      status: "scheduled",
    };
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/job-orders/${task.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionStorage.getItem("bias_token")}`,
          },
          body: JSON.stringify(payload),
        },
      );
      if (res.ok) {
        fetchJobOrders();
        toast.success("Visit assigned to technician.");
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.message || "Failed to assign visit");
      }
    } catch (error) {
      toast.error("Something went wrong");
    }
  } else if (task.taskType === "do") {
    // Buat baris job_orders bertipe delivery; backend ikut update
    // delivery_orders.technician_id + status jadi issued.
    const payload = {
      delivery_order_id: task.id,
      job_type: "delivery",
      technician_id: techId,
      scheduled_date: new Date(assignDeliveryDate.value).toISOString(),
      instructions: task.notes || `Delivery ${task.do_number || ""}`.trim(),
    };
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/job-orders`,
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
        fetchJobOrders();
        fetchDeliveryOrders();
        toast.success("Delivery order successfully assigned to technician.");
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.message || "Failed to assign delivery order");
      }
    } catch (error) {
      toast.error("Something went wrong");
    }
  } else {
    const payload = {
      job_order_no: `JO-${Date.now().toString().slice(-6)}`,
      service_request_id: task.id,
      technician_id: techId,
      scheduled_date: new Date(assignScheduledDate.value).toISOString(),
      instructions: task.problem_description || "Please check the unit",
    };

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/job-orders`,
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
        fetchJobOrders();
        toast.success("Job order successfully assigned to technician.");
      } else {
        toast.error("Failed to assign job order");
      }
    } catch (error) {
      toast.error("Something went wrong");
    }
  }

  showAssignModal.value = false;
  assignTarget.value = null;
  isAssigning.value = false;
}
</script>

<template>
  <div class="jo-page">
    <header class="jo-header">
      <div>
        <h1 class="jo-title">Job Orders</h1>
        <p class="jo-subtitle">
          Drag a service request onto a technician lane to create a job order
        </p>
      </div>
      <div class="jo-summary">
        <div class="summary-chip">
          <span class="summary-value">{{ unassignedRequests.length }}</span>
          <span class="summary-label">Unassigned</span>
        </div>
        <div class="summary-chip primary">
          <span class="summary-value">{{ jobOrders.length }}</span>
          <span class="summary-label">Assigned</span>
        </div>
      </div>
    </header>

    <div class="dashboard-layout">
      <!-- Left Sidebar for Unassigned Requests -->
      <aside class="sidebar panel">
        <div class="sidebar-header">
          <div class="panel-title-wrap">
            <h3 class="title">Tasks</h3>
          </div>
        </div>

        <div class="sidebar-tabs" style="display: flex; gap: 8px; margin-top: -8px;">
          <button class="btn btn-sm" :class="activeTab === 'sr' ? 'btn-primary' : 'btn-outline'" style="flex: 1; padding: 4px;" @click="activeTab = 'sr'">
            Requests ({{ unassignedRequests.length }})
          </button>
          <button class="btn btn-sm" :class="activeTab === 'do' ? 'btn-primary' : 'btn-outline'" style="flex: 1; padding: 4px;" @click="activeTab = 'do'">
            Deliveries ({{ unassignedDeliveries.length }})
          </button>
          <button class="btn btn-sm" :class="activeTab === 'visit' ? 'btn-primary' : 'btn-outline'" style="flex: 1; padding: 4px;" @click="activeTab = 'visit'">
            Visits ({{ unassignedVisits.length }})
          </button>
        </div>

        <div class="sidebar-search">
          <input
            v-model="searchUnassigned"
            type="text"
            placeholder="Search code..."
            class="form-input search-input"
          />
          <button
            class="btn-icon refresh-btn"
            title="Refresh"
            @click="activeTab === 'sr' ? fetchServiceRequests() : (activeTab === 'do' ? fetchDeliveryOrders() : (activeTab === 'visit' ? fetchJobOrders() : null))"
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
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
          </button>
        </div>
        <div class="unassigned-list">
          <div v-if="displayedUnassigned.length === 0" class="empty-state">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
            >
              <rect x="3" y="4" width="18" height="17" rx="3" />
              <path d="M8 2v4M16 2v4M3 10h18" />
            </svg>
            <span>No new tasks yet</span>
          </div>
          <div
            v-for="req in displayedUnassigned"
            :key="req.id"
            class="job-card draggble"
            draggable="true"
            @dragstart="onDragStart(req)"
            @dragend="markDragEnd"
            @click="openRequestDetail(req)"
          >
            <div class="card-grip" aria-hidden="true">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <circle cx="9" cy="6" r="1.6" />
                <circle cx="15" cy="6" r="1.6" />
                <circle cx="9" cy="12" r="1.6" />
                <circle cx="15" cy="12" r="1.6" />
                <circle cx="9" cy="18" r="1.6" />
                <circle cx="15" cy="18" r="1.6" />
              </svg>
            </div>
            <div class="card-main">
              <div class="card-header">
                <span class="ref-no">{{ req.request_no || req.do_number || req.service_request_no || req.job_order_no }}</span>
                <span class="date-tag">{{
                  formatDateDisplay(req.created_at)
                }}</span>
              </div>
              <div class="card-body">
                <template v-if="req.taskType === 'do'">
                  <div class="card-customer" v-if="req.customer">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <span>{{ req.customer.company_name || req.customer.name }}</span>
                  </div>
                  <div class="card-address" v-if="req.delivery_address">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span>{{ req.delivery_address }}</span>
                  </div>
                  <div class="card-type" style="margin-top: 4px; display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--color-text-muted);">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                    <span style="font-weight: 500; color: var(--color-primary);">{{ deliveryTypeLabel(req.do_type) }}</span>
                  </div>
                </template>
                <template v-else-if="req.taskType === 'visit'">
                  <div class="card-customer" v-if="req.customer_name">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <span>{{ req.customer_name }}</span>
                  </div>
                  <div class="card-address" v-if="req.service_report?.unit">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                    <span>{{ req.service_report.unit.model }}{{ req.service_report.unit.serial_no ? ` (${req.service_report.unit.serial_no})` : '' }}</span>
                  </div>
                  <div class="card-type" style="margin-top: 4px; display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--color-text-muted);">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 9.36l-7.1 7.1a1 1 0 0 1-1.4 0l-2.8-2.8a1 1 0 0 1 0-1.4l7.1-7.1a6 6 0 0 1 9.36-7.94l-3.77 3.77z" />
                    </svg>
                    <span style="font-weight: 500; color: var(--color-primary);">Copier Visit</span>
                  </div>
                  <div class="problem-text" style="margin-top: 6px;">{{ req.problem }}</div>
                </template>
                <template v-else>
                  <div class="card-customer" v-if="req.customer">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <span>{{ req.customer.company_name || req.customer.name }}</span>
                  </div>
                  <div class="card-address" v-if="req.customer?.address">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span>{{ req.customer.address }}</span>
                  </div>
                  <div class="card-type" style="margin-top: 4px; display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--color-text-muted);">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 9.36l-7.1 7.1a1 1 0 0 1-1.4 0l-2.8-2.8a1 1 0 0 1 0-1.4l7.1-7.1a6 6 0 0 1 9.36-7.94l-3.77 3.77z"></path>
                    </svg>
                    <span style="font-weight: 500; color: var(--color-primary);">Service Request</span>
                  </div>
                  <div class="problem-text" style="margin-top: 6px;">{{ req.problem_description || 'No description' }}</div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- Main Board for Technicians -->
      <section class="main-board panel">
        <div class="board-topbar">
          <div class="topbar-search">
            <svg
              class="topbar-search-icon"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              v-model="searchTech"
              type="text"
              placeholder="Search for Technician Name"
              class="form-input search-input"
            />
          </div>
          <div class="filter-pills" role="tablist" aria-label="Filter job type">
            <button
              class="btn btn-sm"
              :class="jobTypeFilter === 'all' ? 'btn-primary' : 'btn-outline'"
              @click="jobTypeFilter = 'all'"
            >
              All ({{ jobTypeCounts.all }})
            </button>
            <button
              class="btn btn-sm"
              :class="jobTypeFilter === 'sr' ? 'btn-primary' : 'btn-outline'"
              @click="jobTypeFilter = 'sr'"
            >
              Requests ({{ jobTypeCounts.sr }})
            </button>
            <button
              class="btn btn-sm"
              :class="jobTypeFilter === 'do' ? 'btn-primary' : 'btn-outline'"
              @click="jobTypeFilter = 'do'"
            >
              Deliveries ({{ jobTypeCounts.do }})
            </button>
            <button
              class="btn btn-sm"
              :class="jobTypeFilter === 'visit' ? 'btn-primary' : 'btn-outline'"
              @click="jobTypeFilter = 'visit'"
            >
              Visits ({{ jobTypeCounts.visit }})
            </button>
          </div>
        </div>

        <div class="tech-lanes">
          <div v-for="t in filteredTechs" :key="t.id" class="tech-row">
            <div class="tech-name">
              <span class="tech-avatar">{{ techInitials(t) }}</span>
              <span class="tech-label">{{ techName(t) }}</span>
              <span
                class="tech-status"
                :class="{
                  online: !isTechnicianBusy(t.id) &&
                    String((t as any).status || 'AVAILABLE').toLowerCase() ===
                    'available',
                  busy: isTechnicianBusy(t.id),
                }"
              >
                {{ isTechnicianBusy(t.id) ? "BUSY" : (t as any).status || "AVAILABLE" }}
              </span>
              <span class="tech-count"
                >{{ getFilteredJobsForTech(t.id).length }}<template v-if="jobTypeFilter !== 'all'">/{{ getJobsForTech(t.id).length }}</template>
                {{ getFilteredJobsForTech(t.id).length === 1 ? "job" : "jobs" }}</span
              >
            </div>

            <div
              class="tech-lane"
              :class="{ 'drag-over': dragOverTechId === t.id }"
              @dragover.prevent="onDragOver(t.id)"
              @dragleave="onDragLeave"
              @drop="onDrop(t.id)"
            >
              <div class="lane-empty" v-if="getFilteredJobsForTech(t.id).length === 0">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>{{
                  dragOverTechId === t.id
                    ? "Drop here"
                    : jobTypeFilter !== "all"
                      ? `No ${jobTypeLabel(jobTypeFilter)} jobs for this technician`
                      : "Drag a request here to assign to this technician"
                }}</span>
              </div>

              <div
                v-for="job in getFilteredJobsForTech(t.id)"
                :key="job.id"
                class="job-card assigned"
                role="button"
                tabindex="0"
                @click="openJobDetail(job)"
                @keydown.enter="openJobDetail(job)"
              >
                <div class="ac-row">
                  <span class="ref-no">{{
                    job.service_request_no || job.job_order_no || job.do_number
                  }}</span>
                  <span class="badge" :class="statusBadgeClass(job.status)">
                    {{ String(job.status || "new").replace("_", " ") }}
                  </span>
                </div>
                <div class="ac-row muted">
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <rect x="3" y="4" width="18" height="17" rx="2" />
                    <path d="M8 2v4M16 2v4M3 10h18" />
                  </svg>
                  <span v-if="isDeliveryJob(job)">🚚 Delivery {{ formatFullDate(jobDeliveryDate(job)) }}</span>
                  <span v-else>🗓 Scheduled {{ formatFullDate(job.scheduled_date) }}</span>
                  <span class="ac-dot">·</span>
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                  <span class="ac-company">{{ job.customer_name || job.customer?.company_name || job.customer?.name || job.delivery_order?.customer?.company_name || "-" }}</span>
                </div>
                <div class="ac-row muted" style="margin-top: 4px;">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path v-if="isDeliveryJob(job)" d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                    <path v-if="isDeliveryJob(job)" d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                    <path v-if="!isDeliveryJob(job)" d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 9.36l-7.1 7.1a1 1 0 0 1-1.4 0l-2.8-2.8a1 1 0 0 1 0-1.4l7.1-7.1a6 6 0 0 1 9.36-7.94l-3.77 3.77z"></path>
                  </svg>
                  <span>{{ isDeliveryJob(job) ? deliveryTypeLabel(jobDoType(job)) : 'Service Request' }}</span>
                  <span v-if="isDeliveryJob(job) && doItemsCount(job) > 0" class="ac-dot">·</span>
                  <span v-if="isDeliveryJob(job) && doItemsCount(job) > 0">{{ doItemsCount(job) }} item{{ doItemsCount(job) > 1 ? "s" : "" }}</span>
                </div>
                <div v-if="isDeliveryJob(job) && jobDoAddress(job)" class="ac-row muted" style="margin-top: 4px;">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span class="ac-company">{{ jobDoAddress(job) }}</span>
                </div>
                <div class="ac-row muted" style="margin-top: 4px;">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path v-if="job.taskType === 'do'" d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                    <path v-if="job.taskType === 'do'" d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                    <path v-if="job.taskType === 'sr'" d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 9.36l-7.1 7.1a1 1 0 0 1-1.4 0l-2.8-2.8a1 1 0 0 1 0-1.4l7.1-7.1a6 6 0 0 1 9.36-7.94l-3.77 3.77z"></path>
                  </svg>
                  <span>{{ job.taskType === 'do' ? deliveryTypeLabel(job.do_type) : 'Service Request' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- Job Order / Service Request detail -->
    <FormModal
      :open="!!selectedJob || !!selectedRequest"
      :title="selectedJob ? 'Job Order Details' : 'Service Request Details'"
      max-width="560px"
      @close="closeDetail"
    >
      <template v-if="selectedJob">
        <div class="detail-hero">
          <div class="detail-hero-main">
            <span class="detail-hero-id">{{ selectedJob.job_order_no || selectedJob.do_number }}</span>
            <span class="badge" :class="statusBadgeClass(selectedJob.status)">
              {{ String(selectedJob.status || "new").replace("_", " ") }}
            </span>
          </div>
          <span class="detail-hero-scheduled">
            <template v-if="isDeliveryJob(selectedJob)">🚚 Delivery {{ formatFullDate(jobDeliveryDate(selectedJob)) }}</template>
            <template v-else>🗓 Scheduled {{ formatFullDate(selectedJob.scheduled_date) }}</template>
          </span>
        </div>

        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">Technician</span>
            <span class="detail-value">{{
              technicianLabel(selectedJob.technician_id)
            }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">{{ isDeliveryJob(selectedJob) ? "Delivery Date" : "Scheduled Date" }}</span>
            <span class="detail-value">{{
              isDeliveryJob(selectedJob) ? formatFullDate(jobDeliveryDate(selectedJob)) : formatFullDate(selectedJob.scheduled_date)
            }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Created</span>
            <span class="detail-value">{{
              formatDateTime(selectedJob.created_at)
            }}</span>
          </div>
          <div class="detail-item" v-if="selectedJob.service_request">
            <span class="detail-label">Request Date</span>
            <span class="detail-value">{{
              formatFullDate(selectedJob.service_request.request_date)
            }}</span>
          </div>
        </div>

        <div class="detail-section" v-if="selectedJob.service_request">
          <div class="detail-section-title">Service Request</div>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">Request No</span>
              <span class="detail-value detail-link">{{
                selectedJob.service_request.request_no
              }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Request Status</span>
              <span class="detail-value">{{
                String(selectedJob.service_request.status || "-").replace(
                  "_",
                  " ",
                )
              }}</span>
            </div>
          </div>
        </div>

        <div class="detail-section" v-if="selectedJob.service_report">
          <div class="detail-section-title">Copier Visit</div>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">Report No</span>
              <span class="detail-value detail-link">{{
                selectedJob.service_report.report_no
              }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Service Type</span>
              <span class="detail-value">{{
                String(selectedJob.service_report.service_type || "-").replace("_", " ")
              }}</span>
            </div>
            <div class="detail-item" v-if="selectedJob.service_report.unit">
              <span class="detail-label">Unit</span>
              <span class="detail-value">{{
                selectedJob.service_report.unit.model
                  ? `${selectedJob.service_report.unit.model} (${selectedJob.service_report.unit.serial_no || '-'})`
                  : '-'
              }}</span>
            </div>
            <div class="detail-item" v-if="selectedJob.service_report.service_date">
              <span class="detail-label">Visit Date</span>
              <span class="detail-value">{{ formatFullDate(selectedJob.service_report.service_date) }}</span>
            </div>
          </div>
        </div>

        <div class="detail-section" v-if="selectedJob.delivery_order">
          <div class="detail-section-title">Delivery Order</div>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">DO Number</span>
              <span class="detail-value detail-link">{{
                selectedJob.delivery_order.do_number
              }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">DO Type</span>
              <span class="detail-value">{{
                deliveryTypeLabel(selectedJob.delivery_order.do_type)
              }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">DO Status</span>
              <span class="detail-value">{{
                String(selectedJob.delivery_order.status || "-").replace(
                  "_",
                  " ",
                )
              }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Delivery Date</span>
              <span class="detail-value">{{
                formatFullDate(selectedJob.delivery_order.delivery_date)
              }}</span>
            </div>
            <div class="detail-item" v-if="selectedJob.delivery_order.recipient_name">
              <span class="detail-label">Recipient</span>
              <span class="detail-value">{{
                selectedJob.delivery_order.recipient_name
              }}{{ selectedJob.delivery_order.recipient_phone ? ` (${selectedJob.delivery_order.recipient_phone})` : "" }}</span>
            </div>
            <div class="detail-item wide" v-if="selectedJob.delivery_order.delivery_address">
              <span class="detail-label">Delivery Address</span>
              <span class="detail-value">{{
                selectedJob.delivery_order.delivery_address
              }}</span>
            </div>
          </div>
          <div
            v-if="(selectedJob.delivery_order.delivery_order_items || []).length > 0"
            style="margin-top: 8px;"
          >
            <div class="detail-label" style="margin-bottom: 6px;">Items ({{ (selectedJob.delivery_order.delivery_order_items || []).length }})</div>
            <div
              v-for="(it, iIdx) in selectedJob.delivery_order.delivery_order_items"
              :key="iIdx"
              class="detail-item"
              style="padding: 6px 0; border-top: 1px dashed var(--color-border-light);"
            >
              <span class="detail-value">{{ Number(iIdx) + 1 }}. {{ doItemLabel(it) }}</span>
            </div>
          </div>
        </div>

        <div class="detail-section" v-if="detailCustomer">
          <div class="detail-section-title">Customer</div>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">Name</span>
              <span class="detail-value">{{
                detailCustomer.company_name || detailCustomer.name || "-"
              }}</span>
            </div>
            <div class="detail-item" v-if="detailCustomer.pic_name">
              <span class="detail-label">PIC</span>
              <span class="detail-value">{{ detailCustomer.pic_name }}</span>
            </div>
            <div class="detail-item" v-if="detailCustomer.phone">
              <span class="detail-label">Phone</span>
              <span class="detail-value">{{ detailCustomer.phone }}</span>
            </div>
            <div class="detail-item" v-if="detailCustomer.email">
              <span class="detail-label">Email</span>
              <span class="detail-value">{{ detailCustomer.email }}</span>
            </div>
            <div class="detail-item wide" v-if="detailCustomer.address">
              <span class="detail-label">Address</span>
              <span class="detail-value">{{ detailCustomer.address }}</span>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">Problem / Notes</div>
          <p class="detail-text">
            {{ selectedJob.service_request?.problem_description || selectedJob.notes || selectedJob.problem || "-" }}
          </p>
        </div>

        <div class="detail-section" v-if="selectedJob.instructions || selectedJob.action">
          <div class="detail-section-title">Instructions / Action</div>
          <p class="detail-text">{{ selectedJob.instructions || selectedJob.action }}</p>
        </div>
      </template>

      <template v-else-if="selectedRequest">
        <div class="detail-hero">
          <div class="detail-hero-main">
            <span class="detail-hero-id">{{ selectedRequest.request_no || selectedRequest.do_number }}</span>
            <span class="badge badge-neutral">{{
              String(selectedRequest.status || "-").replace("_", " ")
            }}</span>
          </div>
          <span class="detail-hero-scheduled"
            >Created {{ formatFullDate(selectedRequest.created_at) }}</span
          >
        </div>

        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">Date</span>
            <span class="detail-value">{{
              formatFullDate(selectedRequest.request_date || selectedRequest.delivery_date)
            }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Assignment</span>
            <span class="detail-value">Not assigned yet</span>
          </div>
        </div>

        <div class="detail-section" v-if="detailCustomer">
          <div class="detail-section-title">Customer</div>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">Name</span>
              <span class="detail-value">{{
                detailCustomer.company_name || detailCustomer.name || "-"
              }}</span>
            </div>
            <div class="detail-item" v-if="detailCustomer.pic_name">
              <span class="detail-label">PIC</span>
              <span class="detail-value">{{ detailCustomer.pic_name }}</span>
            </div>
            <div class="detail-item" v-if="detailCustomer.phone">
              <span class="detail-label">Phone</span>
              <span class="detail-value">{{ detailCustomer.phone }}</span>
            </div>
            <div class="detail-item" v-if="detailCustomer.email">
              <span class="detail-label">Email</span>
              <span class="detail-value">{{ detailCustomer.email }}</span>
            </div>
            <div class="detail-item wide" v-if="detailCustomer.address">
              <span class="detail-label">Address</span>
              <span class="detail-value">{{ detailCustomer.address }}</span>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">Problem / Notes</div>
          <p class="detail-text">
            {{ selectedRequest.problem_description || selectedRequest.notes || selectedRequest.problem || "-" }}
          </p>
        </div>
      </template>

      <template #footer>
        <button class="btn btn-outline" @click="closeDetail">Close</button>
      </template>
    </FormModal>

    <!-- Assign Confirmation Modal -->
    <FormModal
      :open="showAssignModal"
      :title="assignTarget?.task?.taskType === 'do' ? 'Assign Delivery Order' : 'Assign Service Request'"
      max-width="480px"
      @close="cancelAssign"
    >
      <div v-if="assignTarget" class="assign-modal-body">
        <div class="assign-info">
          <div class="assign-info-row">
            <span class="assign-label">Task</span>
            <span class="assign-value font-bold">{{ assignTarget.task.request_no || assignTarget.task.do_number }}</span>
          </div>
          <div class="assign-info-row">
            <span class="assign-label">Technician</span>
            <span class="assign-value">{{ technicianLabel(assignTarget.techId) }}</span>
          </div>
          <div class="assign-info-row" v-if="assignTarget.task.customer">
            <span class="assign-label">Customer</span>
            <span class="assign-value">{{ assignTarget.task.customer?.company_name || assignTarget.task.customer?.name || '-' }}</span>
          </div>
        </div>

        <div class="form-group mt-lg" v-if="assignTarget.task.taskType === 'do'">
          <label class="form-label">Delivery Date <span class="text-danger">*</span></label>
          <input
            type="datetime-local"
            v-model="assignDeliveryDate"
            class="form-input"
          />
          <p class="assign-hint">Atur tanggal dan waktu pengantaran. Default: tanggal DO yang sudah ada.</p>
        </div>

        <div class="form-group mt-lg" v-else>
          <label class="form-label">Scheduled Date <span class="text-danger">*</span></label>
          <input
            type="datetime-local"
            v-model="assignScheduledDate"
            class="form-input"
          />
          <p class="assign-hint">Atur tanggal dan waktu penjadwalan servis. Default: hari ini.</p>
        </div>
      </div>

      <template #footer>
        <button class="btn btn-outline" :disabled="isAssigning" @click="cancelAssign">Cancel</button>
        <button class="btn btn-primary" :disabled="isAssigning" @click="confirmAssign">
          {{ isAssigning ? 'Assigning...' : 'Confirm Assign' }}
        </button>
      </template>
    </FormModal>
  </div>
</template>

<style scoped>
.jo-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-base);
}

/* Page header */
.jo-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-base);
  flex-wrap: wrap;
}

.jo-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  line-height: 1.2;
}

.jo-subtitle {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  margin-top: var(--space-xs);
}

.jo-summary {
  display: flex;
  gap: var(--space-sm);
}

.summary-chip {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: var(--space-sm) var(--space-base);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xs);
  min-width: 108px;
}

.summary-chip.primary {
  background: var(--color-primary-surface);
  border-color: transparent;
}

.summary-value {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  line-height: 1.1;
}

.summary-chip.primary .summary-value {
  color: var(--color-primary);
}

.summary-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

/* Board layout */
.dashboard-layout {
  display: flex;
  height: calc(100vh - var(--topbar-height, 60px) - 140px);
  min-height: 420px;
  gap: var(--space-base);
}

.panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

/* Sidebar */
.sidebar {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: var(--space-base);
  gap: var(--space-sm);
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-sm);
}

.panel-title-wrap {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.sidebar-header .title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
}

.count-pill {
  background: var(--color-primary-surface);
  color: var(--color-primary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  padding: 2px 9px;
  border-radius: var(--radius-full);
}

.sidebar-search {
  display: flex;
  gap: var(--space-sm);
}

.search-input {
  min-height: 38px;
  padding: 8px 12px;
  font-size: var(--font-size-sm);
  border-radius: var(--radius-md);
}

.sidebar-search .search-input {
  flex: 1;
  min-width: 0;
}

.btn-icon.refresh-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-icon.refresh-btn:hover {
  background: var(--color-primary-surface);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.unassigned-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding-right: 2px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  text-align: center;
  padding: var(--space-xl) var(--space-md);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  margin-top: var(--space-xs);
}

/* Main board */
.main-board {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.board-topbar {
  padding: var(--space-base) var(--space-lg);
  border-bottom: 1px solid var(--color-border-light);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
  background: var(--color-surface);
}

.topbar-search {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.topbar-search-icon {
  position: absolute;
  left: 12px;
  color: var(--color-text-muted);
  pointer-events: none;
}

.topbar-search .search-input {
  width: 100%;
  padding-left: 34px;
}

.filter-pills {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.filter-pills .btn {
  white-space: nowrap;
}

.tech-lanes {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-lg);
  background: var(--color-surface-raised);
  display: flex;
  flex-direction: column;
  gap: var(--space-base);
}

.tech-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.tech-name {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 6px 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
}

.tech-avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  color: var(--color-text-on-primary);
  font-size: 12px;
  font-weight: var(--font-weight-bold);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  letter-spacing: 0.3px;
  flex-shrink: 0;
}

.tech-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
  letter-spacing: 0;
  text-transform: none;
}

.tech-status {
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
  background: var(--color-surface-sunken);
  padding: 2px 10px;
  border-radius: var(--radius-full);
  text-transform: lowercase;
}

.tech-status.online {
  color: var(--color-success);
  background: var(--color-success-surface);
}

.tech-status.busy {
  color: var(--color-danger);
  background: var(--color-danger-surface, #fee2e2);
}

.tech-count {
  margin-left: auto;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  font-weight: var(--font-weight-semibold);
  background: var(--color-surface-sunken);
  padding: 2px 8px;
  border-radius: var(--radius-full);
}

.tech-lane {
  background: var(--color-surface);
  border: 1px dashed var(--color-border);
  min-height: 84px;
  padding: var(--space-sm);
  border-radius: var(--radius-md);
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
  align-items: flex-start;
  transition:
    border-color var(--transition-base),
    background var(--transition-base),
    box-shadow var(--transition-base);
}

.tech-lane.drag-over {
  border-color: var(--color-primary);
  background: var(--color-primary-surface);
  box-shadow: inset 0 0 0 1px var(--color-primary);
}

.lane-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-style: italic;
  width: 100%;
  text-align: center;
  padding: var(--space-base) var(--space-sm);
}

.tech-lane.drag-over .lane-empty {
  color: var(--color-primary);
  font-weight: var(--font-weight-semibold);
}

/* Cards */
.job-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 16px;
  width: 100%;
  box-shadow: var(--shadow-xs);
  transition:
    transform var(--transition-base),
    box-shadow var(--transition-base),
    border-color var(--transition-base);
  position: relative;
  overflow: hidden;
}

.job-card:hover {
  border-color: var(--color-border);
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}

.job-card.draggble {
  cursor: grab;
}

.job-card.draggble:active {
  cursor: grabbing;
}

.job-card.draggble:active .card-grip {
  color: var(--color-primary);
}

.card-grip {
  color: var(--color-text-muted);
  flex-shrink: 0;
  margin-top: 2px;
}

.card-main {
  flex: 1;
  min-width: 0;
}

.job-card.assigned {
  width: 240px;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  cursor: pointer;
}

.job-card.assigned::before {
  display: none;
}

.job-card.assigned:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}

.job-card.assigned:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.ac-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
}

.ac-row.muted {
  font-size: 11px;
  color: var(--color-text-muted);
  gap: 4px;
}

.ac-row.muted svg {
  flex-shrink: 0;
  opacity: 0.5;
}

.ac-dot {
  color: var(--color-border);
}

.ac-company {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.ref-no {
  color: var(--color-primary);
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-base);
  white-space: nowrap;
}

.date-tag {
  margin-left: auto;
  background: var(--color-surface-sunken);
  color: var(--color-text-secondary);
  padding: 4px 8px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
}

.card-body {
  font-size: var(--font-size-sm);
  line-height: 1.5;
  border-top: 1px solid var(--color-border-light);
  padding-top: 12px;
}

.problem-text {
  color: var(--color-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-customer,
.card-address,
.card-recipient {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.card-customer svg,
.card-address svg,
.card-recipient svg {
  flex-shrink: 0;
  margin-top: 1px;
  opacity: 0.55;
}

.card-customer {
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
}

.card-address span,
.card-recipient span {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.card-body > .card-customer + .card-address,
.card-body > .card-customer + .card-recipient,
.card-body > .card-address + .card-recipient {
  margin-top: 4px;
}

.job-card.assigned:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Detail modal */
.detail-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  flex-wrap: wrap;
  padding: var(--space-base);
  background: var(--color-primary-surface);
  border-radius: var(--radius-md);
}

.detail-hero-main {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.detail-hero-id {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--color-primary);
}

.detail-hero-scheduled {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-base);
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.detail-item.wide {
  grid-column: 1 / -1;
}

.detail-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.detail-value {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  word-break: break-word;
}

.detail-link {
  color: var(--color-primary);
  font-weight: var(--font-weight-semibold);
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding-top: var(--space-base);
  border-top: 1px solid var(--color-border-light);
}

.detail-section-title {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-text {
  font-size: var(--font-size-sm);
  color: var(--color-text);
  line-height: 1.55;
}

@media (max-width: 900px) {
  .dashboard-layout {
    flex-direction: column;
    height: auto;
  }

  .sidebar {
    width: 100%;
  }

  .tech-lanes {
    max-height: none;
  }
}

/* Assign modal */
.assign-modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.assign-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-base);
  background: var(--color-surface-sunken);
  border-radius: var(--radius-md);
}

.assign-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-sm);
}

.assign-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.assign-value {
  font-size: var(--font-size-sm);
  color: var(--color-text);
}

.assign-hint {
  margin-top: 6px;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}
</style>
