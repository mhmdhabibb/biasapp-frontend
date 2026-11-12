<script setup lang="ts">
import PageHeader from "@/components/ui/PageHeader.vue";
import DashboardSkeleton from "@/components/ui/DashboardSkeleton.vue";
import { useAuth } from "@/composables/useAuth";
import { useAutoRefresh } from "@/composables/useAutoRefresh";
import { useMasterStore } from "@/composables/useMasterStore";
import { usePermission } from "@/composables/usePermission";
import { useDemoMode } from "@/composables/useDemoMode";
import CreateJobModal from "./CreateJobModal.vue";
import { useRouter, useRoute } from "vue-router";
import { computed, ref, watch, onMounted } from "vue";

// Helper: cek apakah tanggal adalah hari ini
function isToday(dateStr: string | Date): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

const router = useRouter();
const route = useRoute()
const { currentUser } = useAuth();
const { canAny } = usePermission();
const { ensureResourcesLoaded, loadedResources } = useMasterStore()
const dashboardResources = [
  "jobOrders", "serviceReports", "technicians", "customers", "units", "sparepartRequests",
]
const isDashboardLoading = computed(() =>
  dashboardResources.some((resource) => !loadedResources.value.has(resource)),
)
const {
  jobOrders,
  serviceReports,
  technicians,
  sparepartRequests,
  findCustomer,
  findUnit,
  refresh,
} = useMasterStore();

onMounted(() => {
  ensureResourcesLoaded(route.path)
  fetchDemoMode(true)
})

const { isDemoMode, fetchDemoMode } = useDemoMode()
watch(isDemoMode, (val) => {
  dateFilterTab.value = val ? 'all' : 'today'
}, { immediate: true })

useAutoRefresh(10000, [
  "jobOrders",
  "serviceReports",
  "technicians",
  "customers",
  "units",
  "sparepartRequests",
]);

// Find the technician record that belongs to the current logged-in user
const myTechnician = computed(() => {
  if (!currentUser.value?.id) return null;
  return technicians.value.find(
    (t: any) =>
      t.user_id === currentUser.value?.id || t.user_id == currentUser.value?.id,
  );
});

const activeCallServicesCount = computed(() =>
  myJobs.value.filter(
    (j) => j.job_type !== 'maintenance' && j.job_type !== 'meter_reading' && j.status !== 'completed' && j.status !== 'cancelled'
  ).length
);
const activeMaintenanceCount = computed(() =>
  myJobs.value.filter(
    (j) => j.job_type === 'maintenance' && j.status !== 'completed' && j.status !== 'cancelled'
  ).length
);
const pendingSparepartCount = computed(() =>
  (sparepartRequests?.value || []).filter(
    (s: any) => String(s.technician_id) === String(myTechnician.value?.id) && s.status === 'pending'
  ).length
);

const myJobs = computed(() => {
  const techId = myTechnician.value?.id;
  if (!techId) return [];
  return jobOrders.value.filter((j) => j.technician_id === techId);
});

function getJobScheduledDate(job: any): string {
  return (
    job?.scheduled_date ||
    job?.delivery_order?.delivery_date ||
    job?.survey?.scheduled_date ||
    job?.service_report?.service_date ||
    job?.created_at ||
    ''
  );
}

function toLocalDateStr(d: string | Date | null | undefined): string {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const todayStr = computed(() => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
});

const isJobScheduledToday = (job: any) => {
  const d = getJobScheduledDate(job);
  return toLocalDateStr(d) === todayStr.value;
};

// Date filter tab: 'today' | 'upcoming' | 'all' | 'custom'
const dateFilterTab = ref<'today' | 'upcoming' | 'all' | 'custom'>('today');
const customFilterDate = ref('');

const allActiveJobs = computed(() =>
  myJobs.value.filter(
    (j) => j.status !== 'completed' && j.status !== 'cancelled'
  )
);

const jobsForToday = computed(() => {
  return allActiveJobs.value.filter((j) => isJobScheduledToday(j));
});

const jobsUpcoming = computed(() => {
  const tStr = todayStr.value;
  return allActiveJobs.value.filter((j) => {
    const jd = toLocalDateStr(getJobScheduledDate(j));
    return jd > tStr;
  });
});

const getSlaHours = (jobOrDate: any) => {
  const targetStr = typeof jobOrDate === 'string' ? jobOrDate : (getJobScheduledDate(jobOrDate) || jobOrDate?.created_at);
  if (!targetStr) return 0;
  const target = new Date(targetStr).getTime();
  const now = Date.now();
  return (now - target) / (1000 * 60 * 60);
};

const newJobs = computed(
  () =>
    myJobs.value.filter(
      (j) => j.status === "scheduled" || j.status === "assigned",
    ).length,
);
const inProgressJobs = computed(
  () => myJobs.value.filter((j) => j.status === "in_progress").length,
);
const completedToday = computed(
  () =>
    myJobs.value.filter(
      (j) => j.status === "completed" && isToday(j.updated_at),
    ).length,
);
const slaBreached = computed(
  () =>
    myJobs.value.filter((j) => {
      if (j.status === 'completed' || j.status === 'cancelled') return false;
      return getSlaHours(j) > 2;
    }).length,
);

const activeJobs = computed(() => {
  let list = allActiveJobs.value;

  if (dateFilterTab.value === 'today') {
    list = list.filter((j) => isJobScheduledToday(j));
  } else if (dateFilterTab.value === 'upcoming') {
    const tStr = todayStr.value;
    list = list.filter((j) => toLocalDateStr(getJobScheduledDate(j)) > tStr);
  } else if (dateFilterTab.value === 'custom') {
    if (customFilterDate.value) {
      list = list.filter((j) => toLocalDateStr(getJobScheduledDate(j)) === customFilterDate.value);
    }
  }

  // Sort by scheduled date ascending (nearest date first)
  return [...list].sort((a, b) => {
    const da = new Date(getJobScheduledDate(a) || 0).getTime();
    const db = new Date(getJobScheduledDate(b) || 0).getTime();
    return da - db;
  });
});

const formatSla = (job: any) => {
  const schedStr = getJobScheduledDate(job);
  const targetTime = schedStr ? new Date(schedStr).getTime() : new Date(job?.created_at).getTime();
  const now = Date.now();
  if (targetTime > now) {
    const diffHours = (targetTime - now) / (1000 * 60 * 60);
    if (diffHours >= 24) {
      return `Jadwal: H-${Math.ceil(diffHours / 24)} hari`;
    }
    return `Jadwal: ${diffHours.toFixed(1)} jam lagi`;
  }
  const hours = (now - targetTime) / (1000 * 60 * 60);
  if (hours > 2) return `Lewat Jadwal (${hours.toFixed(1)}h)`;
  return `${hours.toFixed(1)}h / 2.0h`;
};

function formatJobScheduledDate(job: any): string {
  const d = getJobScheduledDate(job);
  if (!d) return '-';
  return new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

const showModal = ref(false);

function getCustomerName(id: number | null) {
  return findCustomer(id as any)?.company_name || "-";
}

function getUnitName(unitId: string | null) {
  if (!unitId) return "-";
  const u = findUnit(unitId as any);
  return u ? u.model : "-";
}

function goToDetail(id: number) {
  router.push(`/technician/call-services/${id}`);
}

function getDisplayJobNo(job: any): string {
  if (!job) return "-";
  const isVisit =
    job.job_type === "visit" ||
    job.taskType === "visit" ||
    job.service_report?.service_type === "copier" ||
    String(job.job_order_no || "").startsWith("JOV") ||
    String(job.instructions || "").toLowerCase().includes("copier");

  if (isVisit) {
    if (job.service_report?.report_no) {
      return job.service_report.report_no;
    }
    if (job.job_order_no) {
      return job.job_order_no.replace(/^JOV/, "CPR");
    }
    return "CPR";
  }

  if (job.delivery_order?.do_number && (job.job_type === "delivery" || !job.job_order_no)) {
    return job.delivery_order.do_number;
  }

  if (job.survey?.survey_no && (job.job_type === "survey" || !job.job_order_no)) {
    return job.survey.survey_no;
  }

  return (
    job.job_order_no ||
    job.service_request?.request_no ||
    job.delivery_order?.do_number ||
    job.survey?.survey_no ||
    "-"
  ).replace(/^JOV/, "CPR");
}
</script>

<template>
  <DashboardSkeleton v-if="isDashboardLoading" variant="technician" />
  <div v-else class="tech-dashboard">
    <div class="welcome-header">
      <div class="user-greeting">
        <h1 class="greeting-title">
          Hello, {{ currentUser?.name || "Technician" }}! 👋
        </h1>
        <p class="greeting-subtitle">Here is your job summary for today.</p>
      </div>
    </div>

    <!-- Technician Quick Features Launcher Grid (Mobile & Desktop) -->
    <div class="tech-quick-features">
      <div class="quick-features-header">
        <h2 class="quick-features-title">Technician Services</h2>
        <span class="quick-features-sub">Quick access to all operational features</span>
      </div>
      <div class="quick-features-grid">
        <button class="quick-feature-card" @click="router.push('/technician/call-services')">
          <div class="qf-icon-box" style="background: rgba(59, 130, 246, 0.12); color: #2563eb;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
          </div>
          <div class="qf-info">
            <span class="qf-title">My Jobs</span>
            <span class="qf-badge" v-if="activeCallServicesCount > 0">{{ activeCallServicesCount }} active</span>
          </div>
        </button>

        <button class="quick-feature-card" @click="router.push('/technician/maintenance')">
          <div class="qf-icon-box" style="background: rgba(16, 185, 129, 0.12); color: #059669;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><path d="m9 16 2 2 4-4"></path></svg>
          </div>
          <div class="qf-info">
            <span class="qf-title">Maintenance</span>
            <span class="qf-badge" v-if="activeMaintenanceCount > 0">{{ activeMaintenanceCount }} scheduled</span>
          </div>
        </button>

        <button class="quick-feature-card" @click="router.push('/technician/sparepart-request')">
          <div class="qf-icon-box" style="background: rgba(245, 158, 11, 0.12); color: #d97706;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          </div>
          <div class="qf-info">
            <span class="qf-title">Sparepart</span>
            <span class="qf-badge" v-if="pendingSparepartCount > 0">{{ pendingSparepartCount }} pending</span>
          </div>
        </button>

        <button class="quick-feature-card" @click="router.push('/technician/service-history')">
          <div class="qf-icon-box" style="background: rgba(139, 92, 246, 0.12); color: #7c3aed;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
          </div>
          <div class="qf-info">
            <span class="qf-title">Unit History</span>
          </div>
        </button>

        <button class="quick-feature-card" @click="router.push('/technician/standalone-service-history')">
          <div class="qf-icon-box" style="background: rgba(14, 165, 233, 0.12); color: #0284c7;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          </div>
          <div class="qf-info">
            <span class="qf-title">Standalone Service</span>
          </div>
        </button>

        <button class="quick-feature-card" @click="router.push('/technician/meter-readings')">
          <div class="qf-icon-box" style="background: rgba(236, 72, 153, 0.12); color: #db2777;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
          </div>
          <div class="qf-info">
            <span class="qf-title">Meter Readings</span>
          </div>
        </button>
      </div>
    </div>

    <!-- Summary Grid -->
    <div class="top-cards">
      <div class="card card-primary">
        <div class="card-header">
          <span>New Jobs</span>
          <span class="icon-wrapper">
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
              <line x1="7" y1="17" x2="17" y2="7"></line>
              <polyline points="7 7 17 7 17 17"></polyline>
            </svg>
          </span>
        </div>
        <div class="card-value">{{ newJobs }}</div>
        <div class="card-footer">
          <span class="icon-up"
            ><svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="18 15 12 9 6 15"></polyline></svg
          ></span>
          Waiting for assignment
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span>In Progress</span>
          <span class="icon-wrapper">
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
              <line x1="7" y1="17" x2="17" y2="7"></line>
              <polyline points="7 7 17 7 17 17"></polyline>
            </svg>
          </span>
        </div>
        <div class="card-value">{{ inProgressJobs }}</div>
        <div class="card-footer">
          <span class="icon-up text-success-color"
            ><svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="18 15 12 9 6 15"></polyline></svg
          ></span>
          Assigned and working
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span>Completed Today</span>
          <span class="icon-wrapper">
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
              <line x1="7" y1="17" x2="17" y2="7"></line>
              <polyline points="7 7 17 7 17 17"></polyline>
            </svg>
          </span>
        </div>
        <div class="card-value">{{ completedToday }}</div>
        <div class="card-footer">
          <span class="icon-up text-success-color"
            ><svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="18 15 12 9 6 15"></polyline></svg
          ></span>
          Successfully resolved
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span>Breached SLA</span>
          <span class="icon-wrapper">
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
              <line x1="7" y1="17" x2="17" y2="7"></line>
              <polyline points="7 7 17 7 17 17"></polyline>
            </svg>
          </span>
        </div>
        <div class="card-value text-danger-color">{{ slaBreached }}</div>
        <div class="card-footer">
          <span
            class="icon-up text-danger-color"
            style="background: rgba(239, 68, 68, 0.1)"
            ><svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="6 9 12 15 18 9"></polyline></svg
          ></span>
          Action required immediately
        </div>
      </div>
    </div>

    <!-- Active Jobs Section -->
    <div class="jobs-section">
      <div v-if="isDemoMode" style="background: #fef3c7; border: 1.5px solid #f59e0b; color: #92400e; padding: 0.65rem 1rem; border-radius: 10px; margin-bottom: 1rem; font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem;">
        <span>🧪</span>
        <span><strong>Demo Mode Aktif:</strong> Semua pekerjaan ditampilkan dan dapat dikerjakan tanpa batasan tanggal assign.</span>
      </div>
      <div class="section-header">
        <div>
          <h2 class="section-title">Active Jobs</h2>
          <span class="active-jobs-sub">Pekerjaan berdasarkan tanggal assign</span>
        </div>
        <div class="date-tabs-wrapper">
          <div class="date-tabs">
            <button
              type="button"
              class="date-tab-btn"
              :class="{ active: dateFilterTab === 'today' }"
              @click="dateFilterTab = 'today'"
            >
              Hari Ini ({{ jobsForToday.length }})
            </button>
            <button
              type="button"
              class="date-tab-btn"
              :class="{ active: dateFilterTab === 'upcoming' }"
              @click="dateFilterTab = 'upcoming'"
            >
              Mendatang ({{ jobsUpcoming.length }})
            </button>
            <button
              type="button"
              class="date-tab-btn"
              :class="{ active: dateFilterTab === 'all' }"
              @click="dateFilterTab = 'all'"
            >
              Semua ({{ allActiveJobs.length }})
            </button>
          </div>
          <input
            type="date"
            class="custom-date-picker"
            v-model="customFilterDate"
            @change="dateFilterTab = 'custom'"
            title="Pilih tanggal assign khusus"
          />
        </div>
      </div>

      <div class="jobs-list" v-if="activeJobs.length > 0">
        <div
          v-for="job in activeJobs"
          :key="job.id"
          class="job-card"
          @click="goToDetail(job.id)"
        >
          <div class="job-card-header">
            <span class="job-number">{{ getDisplayJobNo(job) }}</span>
            <span
              class="badge"
              :class="
                'badge-' +
                (job.status === 'in_progress'
                  ? 'info'
                  : job.status === 'scheduled' || job.status === 'assigned'
                    ? 'warning'
                    : 'danger')
              "
            >
              {{ job.status.toUpperCase().replace("_", " ") }}
            </span>
          </div>

          <div class="job-details">
            <div class="detail-row">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
              <span>{{
                job.survey?.customer?.company_name ||
                job.service_report?.customer?.company_name ||
                job.service_request?.customer?.company_name ||
                job.delivery_order?.customer?.company_name ||
                getCustomerName(
                  job.service_request?.customer_id ||
                    job.delivery_order?.customer_id ||
                    job.delivery_order?.customer?.id ||
                    job.service_report?.customer_id ||
                    job.survey?.customer_id ||
                    null,
                )
              }}</span>
            </div>
            <!-- Tanggal Assign / Jadwal Pekerjaan -->
            <div class="detail-row scheduled-row">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              <span><strong>Tanggal Assign:</strong> {{ formatJobScheduledDate(job) }}</span>
            </div>
            <div class="detail-row">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
                <rect x="9" y="9" width="6" height="6"></rect>
                <line x1="9" y1="1" x2="9" y2="4"></line>
                <line x1="15" y1="1" x2="15" y2="4"></line>
                <line x1="9" y1="20" x2="9" y2="23"></line>
                <line x1="15" y1="20" x2="15" y2="23"></line>
                <line x1="20" y1="9" x2="23" y2="9"></line>
                <line x1="20" y1="14" x2="23" y2="14"></line>
                <line x1="1" y1="9" x2="4" y2="9"></line>
                <line x1="1" y1="14" x2="4" y2="14"></line>
              </svg>
              <span v-if="job.job_type === 'survey' || job.survey">{{
                job.survey?.recommended_model || job.survey?.unit?.model || "Survey Lokasi & Unit"
              }}</span>
              <span v-else-if="job.delivery_order || job.job_type === 'delivery'">{{
                (job.delivery_order?.do_number || job.job_order_no || "Delivery") +
                ((job.delivery_order?.delivery_order_items || []).length > 0
                  ? ` • ${(job.delivery_order?.delivery_order_items || []).length} item${(job.delivery_order?.delivery_order_items || []).length > 1 ? "s" : ""}`
                  : "")
              }}</span>
              <span v-else>{{
                job.service_report?.unit?.model ||
                job.service_request?.unit?.model ||
                findUnit(job.service_request?.unit_id || job.service_report?.unit_id || null)?.model || "-"
              }}</span>
            </div>
            <div class="detail-row problem-desc">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span class="truncate">{{
                job.instructions ||
                job.service_request?.problem_description ||
                `No description`
              }}</span>
            </div>
          </div>

          <div class="job-card-footer">
            <div
              class="sla-indicator"
              :class="{ breached: getSlaHours(job) > 2 }"
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
              >
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span>SLA: {{ formatSla(job) }}</span>
            </div>
            <div class="action-arrow">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        <div class="empty-icon">📅</div>
        <h3 v-if="dateFilterTab === 'today'">Tidak Ada Pekerjaan Hari Ini</h3>
        <h3 v-else-if="dateFilterTab === 'upcoming'">Tidak Ada Pekerjaan Mendatang</h3>
        <h3 v-else-if="dateFilterTab === 'custom'">Tidak Ada Pekerjaan Pada Tanggal Ini</h3>
        <h3 v-else>All Caught Up!</h3>
        <p v-if="dateFilterTab === 'today'">
          Tidak ada pekerjaan yang dijadwalkan untuk hari ini.
        </p>
        <p v-else-if="dateFilterTab === 'upcoming'">
          Tidak ada pekerjaan dengan jadwal tanggal mendatang.
        </p>
        <p v-else-if="dateFilterTab === 'custom'">
          Tidak ada pekerjaan yang di-assign untuk tanggal {{ customFilterDate }}.
        </p>
        <p v-else>
          You have no active jobs at the moment.
        </p>
        <div style="display: flex; gap: 8px; justify-content: center; margin-top: 14px;" v-if="dateFilterTab !== 'all'">
          <button
            class="btn btn-sm btn-outline-primary"
            @click="dateFilterTab = 'upcoming'"
            v-if="dateFilterTab === 'today' && jobsUpcoming.length > 0"
          >
            Lihat Jadwal Mendatang ({{ jobsUpcoming.length }})
          </button>
          <button class="btn btn-sm btn-outline" @click="dateFilterTab = 'all'" v-if="allActiveJobs.length > 0">
            Lihat Semua Pekerjaan ({{ allActiveJobs.length }})
          </button>
        </div>
      </div>
    </div>
    <!-- Create Job Modal -->
    <CreateJobModal
      :open="showModal"
      @close="showModal = false"
      @refresh="refresh()"
    />
  </div>
</template>

<style scoped>
.tech-dashboard {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-bottom: 32px;
}

.welcome-header {
  padding: 8px 4px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.greeting-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 4px 0;
}

.greeting-subtitle {
  font-size: 14px;
  color: var(--color-text-muted);
  margin: 0;
}

/* Top Cards (CS Dashboard Style) */
.top-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
}

.card {
  background: var(--color-surface, #fff);
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid var(--color-border);
}

.card-primary {
  background: var(--color-primary);
  color: white;
  border: none;
}

.card-primary .card-subtitle,
.card-primary .icon-wrapper {
  color: rgba(255, 255, 255, 0.8);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 500;
  font-size: 15px;
}

.card:not(.card-primary) .card-header {
  color: var(--color-text);
}

.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid currentColor;
  opacity: 0.6;
}

.card-value {
  font-size: 42px;
  font-weight: 700;
  line-height: 1;
  margin: 8px 0;
}

.card-footer {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.card:not(.card-primary) .card-footer {
  color: var(--color-text-muted);
}

.icon-up {
  width: 20px;
  height: 20px;
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-primary .icon-up {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.text-success-color {
  color: #10b981;
}
.text-danger-color {
  color: #ef4444;
}

/* Jobs Section */
.jobs-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 0 4px;
}

.active-jobs-sub {
  font-size: 12px;
  color: var(--color-text-muted);
  display: block;
  margin-top: 2px;
}

.date-tabs-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.date-tabs {
  display: flex;
  background: var(--color-surface-sunken, #f1f5f9);
  padding: 3px;
  border-radius: 8px;
  gap: 2px;
}

.date-tab-btn {
  border: none;
  background: transparent;
  padding: 6px 12px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--color-text-muted);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.date-tab-btn.active {
  background: var(--color-surface, #ffffff);
  color: var(--color-primary);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.custom-date-picker {
  padding: 5px 8px;
  font-size: 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface, #ffffff);
  color: var(--color-text);
  outline: none;
}

.scheduled-row {
  color: var(--color-primary);
  font-weight: 500;
}
.scheduled-row svg {
  color: var(--color-primary);
  opacity: 1 !important;
}

.section-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: var(--color-text);
}

.jobs-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Mobile App Job Card */
.job-card {
  background: var(--color-surface, #fff);
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  gap: 14px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.2s;
}

.job-card:active {
  background: var(--color-surface-sunken, #f8fafc);
}

.job-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px dashed var(--color-border-light, #e2e8f0);
  padding-bottom: 12px;
}

.job-number {
  font-weight: 700;
  font-size: 14.5px;
  color: var(--color-primary);
  letter-spacing: 0.5px;
}

.job-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 13.5px;
  color: var(--color-text-secondary);
}

.detail-row svg {
  margin-top: 2px;
  flex-shrink: 0;
  opacity: 0.7;
}

.problem-desc {
  color: var(--color-text);
  font-weight: 500;
}

.truncate {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.job-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--color-background, #f1f5f9);
  margin: 2px -16px -16px;
  padding: 12px 16px;
  border-radius: 0 0 16px 16px;
}

.sla-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.sla-indicator.breached {
  color: var(--color-danger, #ef4444);
}

.action-arrow {
  color: var(--color-primary);
  background: rgba(59, 130, 246, 0.1);
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 20px;
  background: var(--color-surface, #fff);
  border-radius: 16px;
  border: 1px dashed var(--color-border, #cbd5e1);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-state h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  color: var(--color-text);
}

.empty-state p {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-muted);
}

/* Quick Features Launcher Styles */
.tech-quick-features {
  margin-bottom: var(--space-lg, 20px);
}

.quick-features-header {
  margin-bottom: 12px;
}

.quick-features-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text, #0f172a);
  margin: 0 0 2px 0;
}

.quick-features-sub {
  font-size: 12px;
  color: var(--color-text-muted, #64748b);
}

.quick-features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 480px) {
  .quick-features-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
}

.quick-feature-card {
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 14px;
  padding: 14px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04));
  -webkit-tap-highlight-color: transparent;
}

.quick-feature-card:active {
  transform: scale(0.96);
  background: var(--color-surface-raised, #f8fafc);
}

.qf-icon-box {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.qf-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.qf-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text, #0f172a);
  line-height: 1.2;
}

.qf-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.12);
  color: #2563eb;
}
</style>
