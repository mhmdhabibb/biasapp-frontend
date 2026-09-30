<script setup lang="ts">
import FormModal from "@/components/ui/FormModal.vue";
import { useMasterStore } from "@/composables/useMasterStore";
import { useToast } from "@/composables/useToast";
import { api } from "@/services/api";
import { computed, onMounted, ref } from "vue";

const toast = useToast();
const { technicians } = useMasterStore();

const jobOrders = ref<any[]>([]);
const serviceRequests = ref<any[]>([]);

const searchUnassigned = ref("");
const searchTech = ref("");
const dragOverTechId = ref<string | number | null>(null);

async function fetchJobOrders() {
  try {
    const data = await api.get<{ data: any[] }>("/job-orders");
    jobOrders.value = data.data.map((j: any) => ({
      ...j,
      service_request_no: j.service_request?.request_no || "-",
      customer_name:
        j.service_request?.customer?.company_name ||
        j.service_request?.customer?.name ||
        "-",
      problem: j.service_request?.problem_description || "-",
    }));
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

onMounted(() => {
  fetchJobOrders();
  fetchServiceRequests();
});

const unassignedRequests = computed(() => {
  // Find SRs that don't have a job order yet (or just show all pending/open)
  const assignedSrIds = new Set(
    jobOrders.value.map((j) => j.service_request_id),
  );
  return serviceRequests.value.filter(
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
  return jobOrders.value.filter((j) => j.technician_id === techId);
}

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
  return sr?.customer || null;
});

// Drag and drop logic
let draggedRequest: any = null;

function onDragStart(req: any) {
  draggedRequest = req;
}

function onDragOver(techId: string | number) {
  dragOverTechId.value = techId;
}

function onDragLeave() {
  dragOverTechId.value = null;
}

async function onDrop(techId: string | number) {
  lastDragEnd = Date.now();
  if (!draggedRequest) return;
  dragOverTechId.value = null;

  const payload = {
    job_order_no: `JO-${Date.now().toString().slice(-6)}`,
    service_request_id: draggedRequest.id,
    technician_id: techId,
    scheduled_date: new Date().toISOString(),
    instructions: draggedRequest.problem_description || "Please check the unit",
  };

  try {
    const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/job-orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionStorage.getItem("bias_token")}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      draggedRequest = null;
      fetchJobOrders();
      toast.success("Job order berhasil di-assign ke teknisi.");
    } else {
      toast.error("Failed to assign job order");
    }
  } catch (error) {
    toast.error("Something went wrong");
  }
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
            <h3 class="title">Service Requests</h3>
            <span class="count-pill">{{ unassignedRequests.length }}</span>
          </div>
          <button class="btn btn-accent btn-sm">Action</button>
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
            @click="fetchServiceRequests"
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
          <div v-if="unassignedRequests.length === 0" class="empty-state">
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
            <span>No new requests yet</span>
          </div>
          <div
            v-for="req in unassignedRequests"
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
                <span class="ref-no">{{ req.request_no }}</span>
                <span class="date-tag">{{
                  formatDateDisplay(req.created_at)
                }}</span>
              </div>
              <div class="card-body">
                <div class="problem-text">{{ req.problem_description }}</div>
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
          <select class="form-select filter-select">
            <option>All</option>
          </select>
          <button class="btn btn-primary btn-sm filter-btn">ALL</button>
        </div>

        <div class="tech-lanes">
          <div v-for="t in filteredTechs" :key="t.id" class="tech-row">
            <div class="tech-name">
              <span class="tech-avatar">{{ techInitials(t) }}</span>
              <span class="tech-label">{{ techName(t) }}</span>
              <span
                class="tech-status"
                :class="{
                  online:
                    String((t as any).status || 'AVAILABLE').toLowerCase() ===
                    'available',
                }"
              >
                {{ (t as any).status || "AVAILABLE" }}
              </span>
              <span class="tech-count"
                >{{ getJobsForTech(t.id).length }}
                {{ getJobsForTech(t.id).length === 1 ? "job" : "jobs" }}</span
              >
            </div>

            <div
              class="tech-lane"
              :class="{ 'drag-over': dragOverTechId === t.id }"
              @dragover.prevent="onDragOver(t.id)"
              @dragleave="onDragLeave"
              @drop="onDrop(t.id)"
            >
              <div class="lane-empty" v-if="getJobsForTech(t.id).length === 0">
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
                    : "Drag a request here to assign to this technician"
                }}</span>
              </div>

              <div
                v-for="job in getJobsForTech(t.id)"
                :key="job.id"
                class="job-card assigned"
                role="button"
                tabindex="0"
                @click="openJobDetail(job)"
                @keydown.enter="openJobDetail(job)"
              >
                <div class="ac-row">
                  <span class="ref-no">{{
                    job.service_request_no || job.job_order_no
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
                  <span>{{ formatDateDisplay(job.scheduled_date) }}</span>
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
                  <span class="ac-company">{{ job.customer_name || "-" }}</span>
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
            <span class="detail-hero-id">{{ selectedJob.job_order_no }}</span>
            <span class="badge" :class="statusBadgeClass(selectedJob.status)">
              {{ String(selectedJob.status || "new").replace("_", " ") }}
            </span>
          </div>
          <span class="detail-hero-scheduled"
            >Scheduled {{ formatFullDate(selectedJob.scheduled_date) }}</span
          >
        </div>

        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">Technician</span>
            <span class="detail-value">{{
              technicianLabel(selectedJob.technician_id)
            }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Scheduled Date</span>
            <span class="detail-value">{{
              formatFullDate(selectedJob.scheduled_date)
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
          <div class="detail-section-title">Problem</div>
          <p class="detail-text">
            {{ selectedJob.service_request?.problem_description || "-" }}
          </p>
        </div>

        <div class="detail-section" v-if="selectedJob.instructions">
          <div class="detail-section-title">Instructions</div>
          <p class="detail-text">{{ selectedJob.instructions }}</p>
        </div>
      </template>

      <template v-else-if="selectedRequest">
        <div class="detail-hero">
          <div class="detail-hero-main">
            <span class="detail-hero-id">{{ selectedRequest.request_no }}</span>
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
            <span class="detail-label">Request Date</span>
            <span class="detail-value">{{
              formatFullDate(selectedRequest.request_date)
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
          <div class="detail-section-title">Problem</div>
          <p class="detail-text">
            {{ selectedRequest.problem_description || "-" }}
          </p>
        </div>
      </template>

      <template #footer>
        <button class="btn btn-outline" @click="closeDetail">Close</button>
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

.filter-select {
  min-height: 38px;
  padding: 8px 12px;
  font-size: var(--font-size-sm);
  border-radius: var(--radius-md);
  min-width: 100px;
}

.filter-btn {
  min-height: 38px;
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
</style>
