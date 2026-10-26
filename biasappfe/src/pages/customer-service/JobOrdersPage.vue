<script setup lang="ts">
import FormModal from "@/components/ui/FormModal.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import CustomSelect from "@/components/ui/CustomSelect.vue";
import SignaturePad from "@/components/ui/SignaturePad.vue";
import { useAuthStore } from "@/stores/auth.store";
import { useMasterStore } from "@/composables/useMasterStore";
import { useIsSuperadmin } from "@/composables/useHardDelete";
import { useToast } from "@/composables/useToast";
import { api, apiRequest } from "@/services/api";
import { invalidateCache } from "@/utils/requestCache";
import { isCopierReport } from "@/utils/copierReport";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";

const toast = useToast();
const authStore = useAuthStore();
const isSuperadmin = useIsSuperadmin();
const route = useRoute();
const masterStore = useMasterStore();
const { technicians, units, products, serviceReports } = masterStore;

const showDeleteJobModal = ref(false);
const jobToDelete = ref<any | null>(null);
const showDeleteTechModal = ref(false);
const techToDelete = ref<any | null>(null);
const isDeleting = ref(false);

function extractArray(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.data?.items)) return res.data.items;
  if (Array.isArray(res.data?.data)) return res.data.data;
  if (Array.isArray(res.items)) return res.items;
  return [];
}

const jobOrders = ref<any[]>([]);
const serviceRequests = ref<any[]>([]);
const deliveryOrders = ref<any[]>([]);
const activeTab = ref("do");
const draggedTask = ref<any | null>(null);

const searchUnassigned = ref("");
const searchTech = ref("");
const dragOverTechId = ref<string | number | null>(null);

const jobTypeFilter = ref<"all" | "sr" | "do" | "visit" | "maintenance">("all");
const VISIT_JOB_TYPES = ["visit", "maintenance_visit", "meter_reading"];
const VISIT_TERMINAL = ["completed", "done", "cancelled", "canceled"];

function visitUnitLabel(visit: any): string {
  const u = visit?.unit || visit?.service_report?.unit;
  if (u) return `${u.model || "Unit"}${u.serial_no ? ` (${u.serial_no})` : ""}`;
  return "-";
}

function visitDateOf(visit: any): string {
  return (
    visit?.service_date || visit?.created_at || visit?.scheduled_date || ""
  );
}

function isVisitJob(job: any): boolean {
  return job?.taskType === "visit";
}

async function fetchJobOrders(silent = false) {
  try {
    const res = await api.get<any>("/job-orders?page=1&limit=100", true, true);
    const rawList = extractArray(res);

    jobOrders.value = rawList.map((j: any) => {
      const isDelivery =
        j.job_type === "delivery" ||
        !!j.delivery_order_id ||
        !!j.delivery_order;
      const isVisit =
        j.job_type === "visit" ||
        VISIT_JOB_TYPES.includes(String(j.job_type || "").toLowerCase());
      const isMaintenance =
        (j.job_type === "service" || j.job_type === "maintenance_visit") &&
        (j.instructions?.includes("Rutin Maintenance") ||
          j.service_request?.problem_description?.includes(
            "[MAINTENANCE_VISIT]",
          ));

      const sr = j.service_request || null;
      const srpt = j.service_report || null;
      let doObj = j.delivery_order || null;
      const doTargetId = j.delivery_order_id || doObj?.id;
      if (doTargetId) {
        const fullDo = deliveryOrders.value.find(
          (d: any) => String(d.id) === String(doTargetId),
        );
        if (fullDo) {
          doObj = { ...fullDo, ...doObj };
        }
      }
      const customer =
        sr?.customer || doObj?.customer || srpt?.customer || j.customer || null;

      let taskType = "sr";
      if (isDelivery) taskType = "do";
      else if (isMaintenance) taskType = "maintenance";
      else if (isVisit) taskType = "visit";

      const doNum = doObj?.do_number || doObj?.delivery_no || j.do_number;
      const resolvedTechId =
        j.technician_id ||
        j.technician?.id ||
        j.technician?.technician_id ||
        j.technician?.user_id ||
        null;

      return {
        ...j,
        technician_id: resolvedTechId,
        taskType,
        delivery_order: doObj || j.delivery_order,
        do_number: doNum || j.do_number,
        service_request_no: isDelivery
          ? doNum || j.job_order_no || "-"
          : sr?.request_no || srpt?.report_no || j.job_order_no || "-",
        customer_name:
          customer?.company_name ||
          customer?.name ||
          j.customer_name ||
          doObj?.customer_name ||
          doObj?.recipient_name ||
          "-",
        problem:
          sr?.problem_description ||
          doObj?.notes ||
          j.notes ||
          srpt?.machine_problem ||
          j.instructions ||
          "-",
      };
    });
  } catch (error) {
    console.error("Failed to fetch data JO", error);
    if (!silent) {
      toast.error("Gagal memuat job orders.");
    }
  }
}

async function fetchServiceRequests() {
  try {
    const res = await api.get<any>("/service-requests?page=1&limit=100", true, true);
    serviceRequests.value = extractArray(res);
  } catch (error) {
    console.error("Failed to fetch data SR", error);
  }
}

async function fetchDeliveryOrders() {
  try {
    const res = await api.get<any>("/delivery-orders?page=1&limit=100", true, true);
    const rawList = extractArray(res);
    deliveryOrders.value = rawList.filter((d: any) =>
      ["rental", "sale", "inbound"].includes(
        String(d.do_type || d.delivery_type || "").toLowerCase(),
      ),
    );
  } catch (error) {
    console.error("Failed to fetch data DO", error);
  }
}

const AUTO_RELOAD_INTERVAL_MS = 30000; // 30 seconds auto-refresh
let autoReloadTimer: any = null;
const isReloading = ref(false);

async function reloadSilently() {
  if (isReloading.value || draggedRequest || showAssignModal.value || isAssigning.value) {
    return;
  }
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return;
  }
  isReloading.value = true;
  try {
    await loadAllData(true);
  } catch (e) {
    console.warn("Auto-reload silent warning:", e);
  } finally {
    isReloading.value = false;
  }
}

function onVisibilityOrFocus() {
  if (typeof document !== "undefined" && document.visibilityState === "visible") {
    void reloadSilently();
  }
}

async function loadAllData(silent = false) {
  try {
    // Fetch all datasets in parallel for instant, flicker-free rendering
    const results = await Promise.allSettled([
      api.get<any>("/delivery-orders?page=1&limit=100", true, true),
      api.get<any>("/job-orders?page=1&limit=100", true, true),
      api.get<any>("/service-requests?page=1&limit=100", true, true),
      masterStore.refreshOnly(['serviceReports', 'technicians']),
    ]);

    const doRes = results[0].status === "fulfilled" ? results[0].value : null;
    const joRes = results[1].status === "fulfilled" ? results[1].value : null;
    const srRes = results[2].status === "fulfilled" ? results[2].value : null;

    if (!joRes && results[1].status === "rejected") {
      throw (results[1] as PromiseRejectedResult).reason;
    }

    const rawDos = extractArray(doRes);
    const filteredDos = rawDos.filter((d: any) =>
      ["rental", "sale", "inbound"].includes(
        String(d.do_type || d.delivery_type || "").toLowerCase(),
      ),
    );

    const rawJos = extractArray(joRes);
    const mappedJos = rawJos.map((j: any) => {
      const isDelivery =
        j.job_type === "delivery" ||
        !!j.delivery_order_id ||
        !!j.delivery_order;
      const isVisit =
        j.job_type === "visit" ||
        VISIT_JOB_TYPES.includes(String(j.job_type || "").toLowerCase());
      const isMaintenance =
        (j.job_type === "service" || j.job_type === "maintenance_visit") &&
        (j.instructions?.includes("Rutin Maintenance") ||
          j.service_request?.problem_description?.includes(
            "[MAINTENANCE_VISIT]",
          ));

      const sr = j.service_request || null;
      const srpt = j.service_report || null;
      let doObj = j.delivery_order || null;
      const doTargetId = j.delivery_order_id || doObj?.id;
      if (doTargetId) {
        const fullDo = filteredDos.find(
          (d: any) => String(d.id) === String(doTargetId),
        );
        if (fullDo) {
          doObj = { ...fullDo, ...doObj };
        }
      }
      const customer =
        sr?.customer || doObj?.customer || srpt?.customer || j.customer || null;

      let taskType = "sr";
      if (isDelivery) taskType = "do";
      else if (isMaintenance) taskType = "maintenance";
      else if (isVisit) taskType = "visit";

      const doNum = doObj?.do_number || doObj?.delivery_no || j.do_number;
      const resolvedTechId =
        j.technician_id ||
        j.technician?.id ||
        j.technician?.technician_id ||
        j.technician?.user_id ||
        null;

      return {
        ...j,
        technician_id: resolvedTechId,
        taskType,
        delivery_order: doObj || j.delivery_order,
        do_number: doNum || j.do_number,
        service_request_no: isDelivery
          ? doNum || j.job_order_no || "-"
          : sr?.request_no || srpt?.report_no || j.job_order_no || "-",
        customer_name:
          customer?.company_name ||
          customer?.name ||
          j.customer_name ||
          doObj?.customer_name ||
          doObj?.recipient_name ||
          "-",
        problem:
          sr?.problem_description ||
          doObj?.notes ||
          j.notes ||
          srpt?.machine_problem ||
          j.instructions ||
          "-",
      };
    });

    // Atomic assignment: all collections update in the same render pass
    deliveryOrders.value = filteredDos;
    jobOrders.value = mappedJos;
    serviceRequests.value = extractArray(srRes);
  } catch (err) {
    console.error("Failed to load kanban data", err);
    if (!silent) toast.error("Gagal memuat job orders.");
  }
}

onMounted(() => {
  // Load data Kanban langsung secara paralel tanpa menunggu master store
  void loadAllData();

  if (masterStore.ensureResourcesLoaded) {
    masterStore.ensureResourcesLoaded(route.path).catch((e) => {
      console.warn("Master store loaded with warnings", e);
    });
  }

  // Setup auto-reload interval dan listener
  autoReloadTimer = setInterval(reloadSilently, AUTO_RELOAD_INTERVAL_MS);
  document.addEventListener("visibilitychange", onVisibilityOrFocus);
  window.addEventListener("focus", onVisibilityOrFocus);
  window.addEventListener("bias:data-mutated", reloadSilently);
});

onUnmounted(() => {
  if (autoReloadTimer) {
    clearInterval(autoReloadTimer);
    autoReloadTimer = null;
  }
  document.removeEventListener("visibilitychange", onVisibilityOrFocus);
  window.removeEventListener("focus", onVisibilityOrFocus);
  window.removeEventListener("bias:data-mutated", reloadSilently);
});

// Watch technicians jika terisi belakangan agar data tetap sinkron
watch(
  () => technicians.value,
  () => {
    // Re-evaluate tanpa mengosongkan state
  },
  { deep: true },
);

watch(
  () => deliveryOrders.value,
  () => {
    if (jobOrders.value.length > 0) {
      jobOrders.value = jobOrders.value.map((j: any) => {
        let doObj = j.delivery_order;
        const doTargetId = j.delivery_order_id || doObj?.id;
        if (
          (!doObj ||
            !doObj.delivery_order_items ||
            doObj.delivery_order_items.length === 0) &&
          doTargetId
        ) {
          const fullDo = deliveryOrders.value.find(
            (d: any) => String(d.id) === String(doTargetId),
          );
          if (fullDo) {
            return {
              ...j,
              delivery_order: { ...fullDo, ...doObj },
            };
          }
        }
        return j;
      });
    }
  },
  { deep: true },
);

const unassignedRequests = computed<any[]>(() => {
  const assignedSrIds = new Set(
    jobOrders.value
      .filter((j: any) => !!j.technician_id)
      .map((j: any) => String(j.service_request_id || ""))
      .filter(Boolean),
  );
  return serviceRequests.value
    .map((sr: any) => ({ ...sr, taskType: "sr" }))
    .filter(
      (sr: any) =>
        (sr.status === "pending" || sr.status === "open") &&
        !assignedSrIds.has(String(sr.id)) &&
        !(sr.problem_description || "").includes("[MAINTENANCE_VISIT]") &&
        ((sr.request_no || "")
          .toLowerCase()
          .includes(searchUnassigned.value.toLowerCase()) ||
          (
            sr.customer?.name ||
            sr.customer?.company_name ||
            sr.customer_name ||
            ""
          )
            .toLowerCase()
            .includes(searchUnassigned.value.toLowerCase())),
    );
});

const assignedDeliveryIds = computed(() => {
  return new Set(
    jobOrders.value
      .filter((j: any) => !!j.technician_id)
      .map((j: any) => j.delivery_order_id || j.delivery_order?.id)
      .filter(Boolean)
      .map(String),
  );
});

const unassignedDeliveries = computed<any[]>(() => {
  return deliveryOrders.value
    .map((d: any) => ({ ...d, taskType: "do" }))
    .filter(
      (d: any) =>
        !assignedDeliveryIds.value.has(String(d.id)) &&
        !d.technician_id &&
        d.status !== "delivered" &&
        d.status !== "completed" &&
        d.status !== "cancelled" &&
        ((d.do_number || d.delivery_no || "")
          .toLowerCase()
          .includes(searchUnassigned.value.toLowerCase()) ||
          (
            d.customer?.name ||
            d.customer?.company_name ||
            d.customer_name ||
            d.recipient_name ||
            ""
          )
            .toLowerCase()
            .includes(searchUnassigned.value.toLowerCase())),
    );
});

const unassignedVisits = computed<any[]>(() => {
  return jobOrders.value
    .filter((j: any) => j.taskType === "visit" && !j.technician_id)
    .map((j: any) => ({
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
    .filter(
      (v: any) =>
        (v.service_request_no || "")
          .toLowerCase()
          .includes(searchUnassigned.value.toLowerCase()) ||
        (v.customer_name || "")
          .toLowerCase()
          .includes(searchUnassigned.value.toLowerCase()),
    );
});

const unassignedMaintenance = computed<any[]>(() => {
  const joMaintenance = jobOrders.value
    .filter(
      (j: any) =>
        !j.technician_id &&
        (j.job_type === "service" || j.job_type === "maintenance_visit") &&
        (j.instructions?.includes("Rutin Maintenance") ||
          j.service_request?.problem_description?.includes(
            "[MAINTENANCE_VISIT]",
          )),
    )
    .map((j: any) => ({
      ...j,
      taskType: "maintenance",
      is_jo: true,
      service_request_no: (
        j.job_order_no ||
        j.service_request?.request_no ||
        "-"
      ).replace("REQ-", "MT-"),
      customer_name:
        j.customer_name ||
        j.service_request?.customer?.company_name ||
        j.service_request?.customer?.name ||
        "-",
    }));

  const assignedSrIds = new Set(
    jobOrders.value
      .filter((j: any) => !!j.technician_id)
      .map((j: any) => String(j.service_request_id || ""))
      .filter(Boolean),
  );
  const srMaintenance = serviceRequests.value
    .filter(
      (sr: any) =>
        (sr.status === "pending" || sr.status === "open") &&
        !assignedSrIds.has(String(sr.id)) &&
        (sr.problem_description || "").includes("[MAINTENANCE_VISIT]"),
    )
    .map((sr: any) => ({
      ...sr,
      taskType: "maintenance",
      is_sr: true,
      service_request_no: (sr.request_no || "-").replace("REQ-", "MT-"),
      customer_name:
        sr.customer?.company_name ||
        sr.customer?.name ||
        sr.customer_name ||
        "-",
      problem: (sr.problem_description || "Maintenance Visit")
        .replace("[MAINTENANCE_VISIT]", "")
        .trim(),
    }));

  return [...joMaintenance, ...srMaintenance].filter(
    (m: any) =>
      (m.service_request_no || "")
        .toLowerCase()
        .includes(searchUnassigned.value.toLowerCase()) ||
      (m.customer_name || "")
        .toLowerCase()
        .includes(searchUnassigned.value.toLowerCase()),
  );
});

const displayedUnassigned = computed<any[]>(() => {
  if (activeTab.value === "sr") return unassignedRequests.value;
  if (activeTab.value === "do") return unassignedDeliveries.value;
  if (activeTab.value === "visit") return unassignedVisits.value;
  if (activeTab.value === "maintenance") return unassignedMaintenance.value;
  return [];
});

const filteredTechs = computed(() => {
  const list = technicians.value || [];
  if (!searchTech.value) return list;
  return list.filter(
    (t: any) =>
      t &&
      (t.name || t.user?.name || "")
        .toLowerCase()
        .includes(searchTech.value.toLowerCase()),
  );
});

// Normalisasi pencocokan ID teknisi agar fleksibel
function getJobsForTech(techId: string | number): any[] {
  const techObj = ((technicians.value as any[]) || []).find(
    (t: any) => String(t?.id) === String(techId),
  );

  const validTechIds = new Set<string>(
    [
      String(techId),
      techObj?.user_id != null ? String(techObj.user_id) : "",
      techObj?.user?.id != null ? String(techObj.user.id) : "",
      techObj?.technician_id != null ? String(techObj.technician_id) : "",
    ].filter(Boolean),
  );

  const jobs = jobOrders.value
    .filter((j: any) => {
      const techIdVal =
        j.technician_id ||
        j.technician?.id ||
        j.technician?.technician_id ||
        j.technician?.user_id ||
        "";
      const userVal = j.technician?.user?.id || "";
      return (
        validTechIds.has(String(techIdVal)) ||
        (userVal !== "" && validTechIds.has(String(userVal)))
      );
    })
    .map((j: any) => {
      let doObj = j.delivery_order;
      const doTargetId = j.delivery_order_id || doObj?.id;
      if (
        (!doObj ||
          !doObj.delivery_order_items ||
          doObj.delivery_order_items.length === 0) &&
        doTargetId
      ) {
        const fullDo = deliveryOrders.value.find(
          (d: any) => String(d.id) === String(doTargetId),
        );
        if (fullDo) {
          doObj = { ...fullDo, ...doObj };
        }
      }
      return {
        ...j,
        delivery_order: doObj || j.delivery_order,
        taskType: j.taskType || (j.job_type === "delivery" ? "do" : "sr"),
      };
    });

  const covered = new Set(
    jobs
      .map((j: any) => j.delivery_order_id || j.delivery_order?.id)
      .filter(Boolean)
      .map(String),
  );

  const dos = deliveryOrders.value
    .filter(
      (d: any) =>
        validTechIds.has(String(d.technician_id || "")) &&
        !covered.has(String(d.id)) &&
        !assignedDeliveryIds.value.has(String(d.id)),
    )
    .map((d: any) => ({ ...d, taskType: "do" }));

  const coveredReportIds = new Set(
    jobs
      .map((j: any) => j.service_report_id || j.service_report?.id)
      .filter(Boolean)
      .map(String),
  );
  const laneJobIds = new Set(jobs.map((j: any) => String(j.id)));

  const visits = (serviceReports.value || [])
    .filter(
      (r: any) =>
        isCopierReport(r) &&
        validTechIds.has(String(r.technician_id || "")) &&
        !VISIT_TERMINAL.includes(String(r.status || "").toLowerCase()) &&
        !coveredReportIds.has(String(r.id)) &&
        !(r.job_order_id && laneJobIds.has(String(r.job_order_id))),
    )
    .map((r: any) => ({ ...r, taskType: "visit" }));

  return [...jobs, ...dos, ...visits];
}

function getJobKind(job: any): "sr" | "do" | "visit" | "maintenance" {
  if (job?.taskType === "maintenance") return "maintenance";
  const isMaintenance =
    (job?.job_type === "service" || job?.job_type === "maintenance_visit") &&
    (job?.instructions?.includes("Rutin Maintenance") ||
      job?.service_request?.problem_description?.includes(
        "[MAINTENANCE_VISIT]",
      ));
  if (isMaintenance) return "maintenance";

  const jt = String(job?.job_type || "").toLowerCase();
  if (VISIT_JOB_TYPES.includes(jt)) return "visit";
  if (job?.taskType === "visit") return "visit";
  return isDeliveryJob(job) ? "do" : "sr";
}

const getFilteredJobsForTech = (techId: string | number) => {
  const jobs = getJobsForTech(techId);
  if (jobTypeFilter.value === "all") return jobs;
  return jobs.filter((j) => getJobKind(j) === jobTypeFilter.value);
};

function jobTypeLabel(kind: string) {
  switch (kind) {
    case "sr":
      return "Requests";
    case "do":
      return "Deliveries";
    case "visit":
      return "Visits";
    case "maintenance":
      return "Maintenance";
    default:
      return "jobs";
  }
}

const jobTypeCounts = computed(() => {
  const counts = { all: 0, sr: 0, do: 0, visit: 0, maintenance: 0 };
  const seen = new Set<string>();
  for (const t of (technicians.value as any[]) || []) {
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
  if (!d) return "-";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "-";
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
  const t = ((technicians.value as any[]) || []).find(
    (x: any) =>
      x &&
      (String(x.id) === String(techId) ||
        String(x.user_id) === String(techId) ||
        String(x.user?.id) === String(techId)),
  );
  return t ? techName(t) : "Unknown";
}

const detailCustomer = computed(() => {
  const sr = selectedJob.value?.service_request || selectedRequest.value;
  if (sr?.customer) return sr.customer;
  return (
    selectedJob.value?.customer ||
    selectedJob.value?.delivery_order?.customer ||
    selectedJob.value?.service_report?.customer ||
    selectedRequest.value?.customer ||
    null
  );
});

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
  return [
    "completed",
    "complete",
    "done",
    "cancelled",
    "canceled",
    "received",
    "delivered",
  ].includes(String(status || "").toLowerCase());
}

function isTechnicianBusy(technicianId: string | number) {
  const targetDate = dateKey(
    draggedTask.value?.delivery_date ||
      draggedTask.value?.scheduled_date ||
      draggedTask.value?.service_date ||
      new Date(),
  );
  if (!targetDate) return false;

  const techObj = ((technicians.value as any[]) || []).find(
    (t: any) => String(t?.id) === String(technicianId),
  );
  const validTechIds = new Set<string>(
    [
      String(technicianId),
      techObj?.user_id != null ? String(techObj.user_id) : "",
      techObj?.user?.id != null ? String(techObj.user.id) : "",
    ].filter(Boolean),
  );

  const hasSameDayJob = jobOrders.value.some(
    (job: any) =>
      validTechIds.has(String(job.technician_id || "")) &&
      dateKey(job.scheduled_date) === targetDate &&
      !isTerminalStatus(job.status),
  );
  const hasSameDayDelivery = deliveryOrders.value.some(
    (delivery: any) =>
      validTechIds.has(String(delivery.technician_id || "")) &&
      dateKey(delivery.delivery_date) === targetDate &&
      !isTerminalStatus(delivery.status),
  );
  const hasSameDayVisit = (serviceReports.value || []).some(
    (report: any) =>
      validTechIds.has(String(report.technician_id || "")) &&
      dateKey(report.service_date) === targetDate &&
      !VISIT_TERMINAL.includes(String(report.status || "").toLowerCase()),
  );
  return hasSameDayJob || hasSameDayDelivery || hasSameDayVisit;
}

function deliveryTypeLabel(type: string | undefined) {
  switch (String(type || "").toLowerCase()) {
    case "inbound":
      return "Sparepart Delivery";
    case "sale":
      return "Sales Delivery";
    default:
      return "Rental Delivery";
  }
}

function isDeliveryJob(job: any): boolean {
  return (
    job?.taskType === "do" ||
    job?.job_type === "delivery" ||
    !!job?.delivery_order_id ||
    !!job?.delivery_order
  );
}

function jobDoType(job: any): string {
  return (
    job?.do_type || job?.delivery_order?.do_type || job?.delivery_type || ""
  );
}

function jobDeliveryDate(job: any): string {
  return (
    job?.delivery_order?.delivery_date ||
    job?.delivery_date ||
    job?.scheduled_date ||
    ""
  );
}

function getTaskAddress(task: any): string {
  return (
    task?.delivery_order?.delivery_address ||
    task?.delivery_address ||
    task?.customer?.address ||
    task?.delivery_order?.customer?.address ||
    task?.service_report?.customer?.address ||
    task?.address ||
    ""
  );
}

function doCustomerName(d: any): string {
  const job = d?.delivery_order || d;
  return (
    job?.customer?.company_name ||
    job?.customer?.name ||
    job?.customer_name ||
    job?.recipient_name ||
    (typeof job?.customer === "string" ? job.customer : "") ||
    ""
  );
}

function doItemsCount(job: any): number {
  const items =
    job?.delivery_order?.delivery_order_items ||
    job?.delivery_order_items ||
    job?.items ||
    [];
  return Array.isArray(items) ? items.length : 0;
}

function doItemLabel(item: any): string {
  if (item?.unit_id || item?.unit) {
    const u = ((units.value as any[]) || []).find(
      (x: any) => String(x.id) === String(item.unit_id),
    );
    const name = item.unit?.model || u?.model || "Unit";
    const sn = item.unit?.serial_no || u?.serial_no || "";
    return `${name}${sn ? ` (${sn})` : ""} x${item.qty || 1}`;
  }
  if (item?.product_id || item?.product) {
    const p = ((products.value as any[]) || []).find(
      (x: any) => String(x.id) === String(item.product_id),
    );
    return `${item.product?.name || p?.name || "Product"} x${item.qty || 1}`;
  }
  return item?.name
    ? `${item.name} x${item.qty || 1}`
    : `Item x${item?.qty || 1}`;
}

function jobDisplayNo(job: any): string {
  if (!job) return "-";
  if (isDeliveryJob(job)) {
    return (
      job.delivery_order?.do_number ||
      job.do_number ||
      job.delivery_no ||
      job.service_request_no ||
      job.job_order_no ||
      "-"
    );
  }
  return (
    job.service_request_no ||
    job.job_order_no ||
    job.service_request?.request_no ||
    job.report_no ||
    "-"
  );
}

function onDragOver(techId: string | number) {
  dragOverTechId.value = techId;
}

function onDragLeave() {
  dragOverTechId.value = null;
}

const showAssignModal = ref(false);
const assignTarget = ref<{ task: any; techId: string | number } | null>(null);
const assignDeliveryDate = ref("");
const assignScheduledDate = ref("");
const assignVisitDate = ref("");
const assignSignature = ref("");
const isAssigning = ref(false);
const sigFileInput = ref<HTMLInputElement | null>(null);

function handleSignatureFileUpload(ev: Event) {
  const target = ev.target as HTMLInputElement;
  const file = target?.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    toast.error("File harus berupa gambar (JPG, PNG, atau WEBP)");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    assignSignature.value = (e.target?.result as string) || "";
  };
  reader.readAsDataURL(file);
}

function toLocalDatetimeStr(d?: string | Date) {
  const date = d ? new Date(d) : new Date();
  if (isNaN(date.getTime())) return new Date().toISOString().slice(0, 16);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

const visitMinDate = computed(() => {
  const d = new Date(assignVisitDate.value || Date.now());
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = d.getMonth();
  const minD = new Date(year, month, 25, 0, 0, 0);
  return toLocalDatetimeStr(minD);
});

const visitMaxDate = computed(() => {
  const d = new Date(assignVisitDate.value || Date.now());
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = d.getMonth();
  const maxD = new Date(year, month + 1, 0, 23, 59, 59);
  return toLocalDatetimeStr(maxD);
});

async function onDrop(techId: string | number) {
  lastDragEnd = Date.now();
  if (!draggedRequest) return;
  dragOverTechId.value = null;

  assignTarget.value = { task: { ...draggedRequest }, techId };

  if (draggedRequest.taskType === "do") {
    assignDeliveryDate.value = toLocalDatetimeStr(
      draggedRequest.delivery_date || new Date().toISOString(),
    );
  } else if (draggedRequest.taskType === "visit") {
    assignVisitDate.value = toLocalDatetimeStr(
      draggedRequest.scheduled_date || new Date().toISOString(),
    );
  } else if (draggedRequest.taskType === "maintenance") {
    assignScheduledDate.value = toLocalDatetimeStr(
      draggedRequest.scheduled_date || new Date().toISOString(),
    );
  } else {
    assignScheduledDate.value = toLocalDatetimeStr(new Date().toISOString());
  }

  draggedRequest = null;
  showAssignModal.value = true;
}

function cancelAssign() {
  showAssignModal.value = false;
  assignTarget.value = null;
  assignSignature.value = "";
  if (sigFileInput.value) sigFileInput.value.value = "";
}

async function confirmAssign() {
  if (!assignTarget.value || isAssigning.value) return;

  if (assignTarget.value.task.taskType === "do" && !assignSignature.value) {
    toast.error(
      "Wajib upload gambar tanda tangan sebelum assign delivery order.",
    );
    return;
  }

  isAssigning.value = true;
  const { task, techId } = assignTarget.value;
  const assignerName = authStore.currentUser.value?.name || "Admin/CS";

  if (task.taskType === "visit") {
    const dateObj = new Date(assignVisitDate.value);
    const day = dateObj.getDate();
    if (day < 25 || day > 31) {
      toast.error("Visit Date hanya bisa dipilih pada tanggal 25 hingga 31.");
      isAssigning.value = false;
      return;
    }

    const payload = {
      technician_id: techId,
      scheduled_date: dateObj.toISOString(),
      status: "scheduled",
      assigner_signature: assignSignature.value,
      assigner_name: assignerName,
    };
    try {
      await apiRequest({
        url: `/job-orders/${task.id}`,
        method: "PUT",
        data: payload,
      });
      invalidateCache();
      await loadAllData();
      toast.success("Visit assigned to technician.");
    } catch (error) {
      toast.error(toast.fromError(error, "Something went wrong"));
    }
  } else if (task.taskType === "maintenance") {
    if (task.is_jo) {
      const payload = {
        technician_id: techId,
        scheduled_date: new Date(assignScheduledDate.value).toISOString(),
        status: "scheduled",
        assigner_signature: assignSignature.value,
        assigner_name: assignerName,
      };
      try {
        await apiRequest({
          url: `/job-orders/${task.id}`,
          method: "PUT",
          data: payload,
        });
        invalidateCache();
        await loadAllData();
        toast.success("Maintenance assigned to technician.");
      } catch (error) {
        toast.error("Something went wrong");
      }
    } else {
      const payload = {
        job_order_no: `JO-${Date.now().toString().slice(-6)}`,
        service_request_id: task.id,
        technician_id: techId,
        scheduled_date: new Date(assignScheduledDate.value).toISOString(),
        instructions: task.problem_description || "Rutin Maintenance",
        assigner_signature: assignSignature.value,
        assigner_name: assignerName,
      };
      try {
        await apiRequest({ url: `/job-orders`, method: "POST", data: payload });
        invalidateCache();
        await loadAllData();
        toast.success(
          "Maintenance Job order successfully created and assigned.",
        );
      } catch (error) {
        toast.error("Failed to assign maintenance job order");
      }
    }
  } else if (task.taskType === "do") {
    const doNumber =
      task.do_number || task.delivery_no || task.delivery_order?.do_number;
    const existingJob = jobOrders.value.find(
      (j: any) =>
        !j.technician_id &&
        String(j.delivery_order_id || j.delivery_order?.id || "") === String(task.id)
    );
    if (existingJob) {
      const payload = {
        technician_id: techId,
        scheduled_date: new Date(assignDeliveryDate.value).toISOString(),
        status: "scheduled",
        assigner_signature: assignSignature.value,
        assigner_name: assignerName,
      };
      try {
        await apiRequest({ url: `/job-orders/${existingJob.id}`, method: "PUT", data: payload });
        invalidateCache();
        await loadAllData();
        toast.success("Delivery order successfully assigned to technician.");
      } catch (error) {
        toast.error(toast.fromError(error, "Failed to assign delivery order"));
      }
    } else {
      const payload = {
        job_order_no: doNumber || `DO-${Date.now().toString().slice(-6)}`,
        delivery_order_id: task.id,
        job_type: "delivery",
        technician_id: techId,
        scheduled_date: new Date(assignDeliveryDate.value).toISOString(),
        instructions: task.notes || `Delivery ${doNumber || ""}`.trim(),
        assigner_signature: assignSignature.value,
        assigner_name: assignerName,
      };
      try {
        await apiRequest({ url: `/job-orders`, method: "POST", data: payload });
        invalidateCache();
        await loadAllData();
        toast.success("Delivery order successfully assigned to technician.");
      } catch (error) {
        toast.error(toast.fromError(error, "Failed to assign delivery order"));
      }
    }
  } else {
    const existingJob = jobOrders.value.find(
      (j: any) =>
        !j.technician_id &&
        String(j.service_request_id || "") === String(task.id)
    );
    if (existingJob) {
      const payload = {
        technician_id: techId,
        scheduled_date: new Date(assignScheduledDate.value).toISOString(),
        status: "scheduled",
        assigner_signature: assignSignature.value,
        assigner_name: assignerName,
      };
      try {
        await apiRequest({ url: `/job-orders/${existingJob.id}`, method: "PUT", data: payload });
        invalidateCache();
        await loadAllData();
        toast.success("Job order successfully assigned to technician.");
      } catch (error) {
        toast.error("Failed to assign job order");
      }
    } else {
      const payload = {
        job_order_no: `JO-${Date.now().toString().slice(-6)}`,
        service_request_id: task.id,
        technician_id: techId,
        scheduled_date: new Date(assignScheduledDate.value).toISOString(),
        instructions: task.problem_description || "Please check the unit",
        assigner_signature: assignSignature.value,
        assigner_name: assignerName,
      };

      try {
        await apiRequest({ url: `/job-orders`, method: "POST", data: payload });
        invalidateCache();
        await loadAllData();
        toast.success("Job order successfully assigned to technician.");
      } catch (error) {
        toast.error("Failed to assign job order");
      }
    }
  }

  showAssignModal.value = false;
  assignTarget.value = null;
  assignSignature.value = "";
  isAssigning.value = false;
}

async function cancelJobAssignment(jobId: string) {
  if (
    !confirm(
      "Are you sure you want to cancel the technician assignment for this job?",
    )
  ) {
    return;
  }
  try {
    await apiRequest({
      url: `/job-orders/${jobId}/cancel-assign`,
      method: "POST",
    });
    toast.success("Technician assignment cancelled successfully");
    invalidateCache();
    await loadAllData();
    closeDetail();
  } catch (error) {
    toast.error(toast.fromError(error, "Failed to cancel assignment"));
  }
}

function openDeleteJob(job: any) {
  jobToDelete.value = job;
  showDeleteJobModal.value = true;
}

async function handleDeleteJob() {
  if (!jobToDelete.value) return;
  const job = jobToDelete.value;
  try {
    isDeleting.value = true;
    if (job.taskType === 'visit') {
      const targetReportId = job.service_report_id || job.id;
      if (job.id && job.id !== targetReportId) {
        try {
          await api.delete(`/job-orders/${job.id}?permanent=true`);
        } catch {}
      }
      try {
        await api.delete(`/service-reports/${targetReportId}?permanent=true`);
      } catch {
        if (job.id) {
          await api.delete(`/job-orders/${job.id}?permanent=true`);
        }
      }
    } else if (job.taskType === 'do' && !job.job_order_no && job.do_number) {
      await api.delete(`/delivery-orders/${job.id}?permanent=true`);
    } else {
      try {
        await api.delete(`/job-orders/${job.id}?permanent=true`);
      } catch (err: any) {
        if (job.delivery_order_id || job.do_number) {
          await api.delete(`/delivery-orders/${job.id}?permanent=true`);
        } else if (job.service_report_id || job.report_no) {
          await api.delete(`/service-reports/${job.id}?permanent=true`);
        } else {
          throw err;
        }
      }
    }
    toast.success(`Job ${jobDisplayNo(job)} berhasil dihapus!`);
    showDeleteJobModal.value = false;
    jobToDelete.value = null;
    closeDetail();
    invalidateCache();
    await loadAllData(true);
    masterStore.refreshOnly(['serviceReports']);
  } catch (err: any) {
    console.error('Failed to delete job:', err);
    toast.error('Gagal menghapus job: ' + (err.response?.data?.message || err.message || 'Error'));
  } finally {
    isDeleting.value = false;
  }
}

function openDeleteTech(t: any) {
  techToDelete.value = t;
  showDeleteTechModal.value = true;
}

async function handleDeleteTech() {
  if (!techToDelete.value) return;
  const t = techToDelete.value;
  try {
    isDeleting.value = true;
    await api.delete(`/technicians/${t.id}?permanent=true`);
    toast.success(`Teknisi ${techName(t)} berhasil dihapus!`);
    showDeleteTechModal.value = false;
    techToDelete.value = null;
    invalidateCache();
    await loadAllData(true);
    masterStore.refreshOnly(['technicians']);
  } catch (err: any) {
    console.error('Failed to delete technician:', err);
    toast.error('Gagal menghapus teknisi: ' + (err.response?.data?.message || err.message || 'Error'));
  } finally {
    isDeleting.value = false;
  }
}
</script>

<template>
  <div class="jo-page">
    <header class="jo-header">
      <div>
        <h1 class="jo-title">Job Orders</h1>
        <p class="jo-subtitle">
          Drag a service request, delivery, or visit onto a technician lane to
          assign it
        </p>
      </div>
      <div class="jo-summary" style="display: flex; align-items: center; gap: 10px;">
        <button
          class="btn btn-outline btn-sm"
          style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; font-size: 0.82rem;"
          :disabled="isReloading"
          @click="reloadSilently"
          title="Refresh Job Orders"
        >
          <span :style="{ display: 'inline-block', transform: isReloading ? 'rotate(360deg)' : 'none', transition: 'transform 0.5s ease' }">🔄</span>
          <span>{{ isReloading ? 'Refreshing...' : 'Refresh' }}</span>
        </button>
        <div class="summary-chip">
          <span class="summary-value">{{
            unassignedRequests.length +
            unassignedDeliveries.length +
            unassignedVisits.length +
            unassignedMaintenance.length
          }}</span>
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

        <div
          class="sidebar-tabs"
          style="display: flex; gap: 8px; margin-top: -8px; flex-wrap: wrap"
        >
          <button
            class="btn btn-sm"
            :class="activeTab === 'sr' ? 'btn-primary' : 'btn-outline'"
            style="
              flex: 1 1 calc(50% - 8px);
              padding: 4px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            "
            @click="activeTab = 'sr'"
          >
            Requests ({{ unassignedRequests.length }})
          </button>
          <button
            class="btn btn-sm"
            :class="activeTab === 'do' ? 'btn-primary' : 'btn-outline'"
            style="
              flex: 1 1 calc(50% - 8px);
              padding: 4px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            "
            @click="activeTab = 'do'"
          >
            Deliveries ({{ unassignedDeliveries.length }})
          </button>
          <button
            class="btn btn-sm"
            :class="activeTab === 'visit' ? 'btn-primary' : 'btn-outline'"
            style="
              flex: 1 1 calc(50% - 8px);
              padding: 4px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            "
            @click="activeTab = 'visit'"
          >
            Visits ({{ unassignedVisits.length }})
          </button>
          <button
            class="btn btn-sm"
            :class="activeTab === 'maintenance' ? 'btn-primary' : 'btn-outline'"
            style="
              flex: 1 1 calc(50% - 8px);
              padding: 4px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            "
            @click="activeTab = 'maintenance'"
          >
            Maintenance ({{ unassignedMaintenance.length }})
          </button>
        </div>

        <div class="sidebar-search">
          <input
            v-model="searchUnassigned"
            type="text"
            placeholder="Search code or customer..."
            class="form-input search-input"
          />
          <button
            class="btn-icon refresh-btn"
            title="Refresh"
            @click="() => loadAllData()"
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
                <span class="ref-no">{{
                  req.service_request_no ||
                  req.request_no ||
                  req.do_number ||
                  req.delivery_no ||
                  req.job_order_no
                }}</span>
                <span class="date-tag">{{
                  formatDateDisplay(
                    req.delivery_date || req.scheduled_date || req.created_at,
                  )
                }}</span>
              </div>
              <div class="card-body">
                <!-- Delivery Orders -->
                <template v-if="req.taskType === 'do'">
                  <div class="card-customer">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
                      />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <span>{{ doCustomerName(req) || "-" }}</span>
                  </div>

                  <div class="card-address" v-if="getTaskAddress(req)">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
                      />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span>{{ getTaskAddress(req) }}</span>
                  </div>

                  <div
                    class="card-type"
                    style="
                      margin-top: 4px;
                      display: flex;
                      align-items: center;
                      gap: 6px;
                      font-size: 11px;
                      color: var(--color-text-muted);
                    "
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                    <span
                      style="font-weight: 500; color: var(--color-primary)"
                      >{{
                        deliveryTypeLabel(req.do_type || req.delivery_type)
                      }}</span
                    >
                    <template v-if="doItemsCount(req) > 0">
                      <span>·</span>
                      <span
                        >{{ doItemsCount(req) }} item{{
                          doItemsCount(req) > 1 ? "s" : ""
                        }}</span
                      >
                    </template>
                  </div>

                  <div
                    class="card-address"
                    v-if="
                      doItemsCount(req) > 0 &&
                      (req.delivery_order_items ||
                        req.delivery_order?.delivery_order_items ||
                        req.items ||
                        [])[0]
                    "
                    style="font-size: 11px; margin-top: 2px"
                  >
                    <span style="color: var(--color-text-muted)">{{
                      doItemLabel(
                        (req.delivery_order_items ||
                          req.delivery_order?.delivery_order_items ||
                          req.items ||
                          [])[0],
                      )
                    }}</span>
                  </div>
                </template>

                <!-- Visit/Copier Reports -->
                <template v-else-if="req.taskType === 'visit'">
                  <div class="card-customer">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
                      />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <span>{{
                      req.customer_name ||
                      req.customer?.company_name ||
                      req.customer?.name ||
                      req.service_report?.customer?.company_name ||
                      req.service_report?.customer?.name ||
                      "-"
                    }}</span>
                  </div>

                  <div
                    class="card-address"
                    v-if="req.service_report?.unit || req.unit"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                    <span
                      >{{
                        (req.service_report?.unit || req.unit)?.model || "Unit"
                      }}{{
                        (req.service_report?.unit || req.unit)?.serial_no
                          ? ` (${(req.service_report?.unit || req.unit).serial_no})`
                          : ""
                      }}</span
                    >
                  </div>

                  <div class="card-address" v-if="getTaskAddress(req)">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
                      />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span>{{ getTaskAddress(req) }}</span>
                  </div>

                  <div
                    class="card-type"
                    style="
                      margin-top: 4px;
                      display: flex;
                      align-items: center;
                      gap: 6px;
                      font-size: 11px;
                      color: var(--color-text-muted);
                    "
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 9.36l-7.1 7.1a1 1 0 0 1-1.4 0l-2.8-2.8a1 1 0 0 1 0-1.4l7.1-7.1a6 6 0 0 1 9.36-7.94l-3.77 3.77z"
                      />
                    </svg>
                    <span style="font-weight: 500; color: var(--color-primary)"
                      >Copier Visit</span
                    >
                  </div>
                </template>

                <!-- Maintenance -->
                <template v-else-if="req.taskType === 'maintenance'">
                  <div class="card-customer">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
                      />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <span>{{
                      req.customer?.company_name ||
                      req.customer?.name ||
                      req.customer_name ||
                      "-"
                    }}</span>
                  </div>

                  <div class="card-address" v-if="getTaskAddress(req)">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
                      />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span>{{ getTaskAddress(req) }}</span>
                  </div>

                  <div
                    class="card-type"
                    style="
                      margin-top: 4px;
                      display: flex;
                      align-items: center;
                      gap: 6px;
                      font-size: 11px;
                      color: var(--color-text-muted);
                    "
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
                      ></path>
                    </svg>
                    <span style="font-weight: 500; color: var(--color-primary)"
                      >Maintenance</span
                    >
                  </div>

                  <div
                    class="problem-text"
                    style="
                      margin-top: 6px;
                      font-size: 11px;
                      color: var(--color-text-secondary);
                    "
                    v-if="req.problem || req.instructions"
                  >
                    {{
                      (req.problem || req.instructions || "Rutin Maintenance")
                        .replace("[MAINTENANCE_VISIT]", "")
                        .trim()
                    }}
                  </div>
                </template>

                <!-- Service Requests -->
                <template v-else>
                  <div class="card-customer">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
                      />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <span>{{
                      req.customer?.company_name ||
                      req.customer?.name ||
                      req.customer_name ||
                      "-"
                    }}</span>
                  </div>

                  <div class="card-address" v-if="getTaskAddress(req)">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
                      />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span>{{ getTaskAddress(req) }}</span>
                  </div>

                  <div
                    class="card-type"
                    style="
                      margin-top: 4px;
                      display: flex;
                      align-items: center;
                      gap: 6px;
                      font-size: 11px;
                      color: var(--color-text-muted);
                    "
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 9.36l-7.1 7.1a1 1 0 0 1-1.4 0l-2.8-2.8a1 1 0 0 1 0-1.4l7.1-7.1a6 6 0 0 1 9.36-7.94l-3.77 3.77z"
                      ></path>
                    </svg>
                    <span style="font-weight: 500; color: var(--color-primary)"
                      >Service Request</span
                    >
                  </div>

                  <div
                    class="problem-text"
                    style="
                      margin-top: 6px;
                      font-size: 11px;
                      color: var(--color-text-secondary);
                    "
                  >
                    {{ req.problem_description || "No description" }}
                  </div>
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
            <button
              class="btn btn-sm"
              :class="
                jobTypeFilter === 'maintenance' ? 'btn-primary' : 'btn-outline'
              "
              @click="jobTypeFilter = 'maintenance'"
            >
              Maintenance ({{ jobTypeCounts.maintenance }})
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
                  online:
                    !isTechnicianBusy(t.id) &&
                    String((t as any).status || 'AVAILABLE').toLowerCase() ===
                      'available',
                  busy: isTechnicianBusy(t.id),
                }"
              >
                {{
                  isTechnicianBusy(t.id)
                    ? "BUSY"
                    : (t as any).status || "AVAILABLE"
                }}
              </span>
              <span class="tech-count"
                >{{ getFilteredJobsForTech(t.id).length
                }}<template v-if="jobTypeFilter !== 'all'"
                  >/{{ getJobsForTech(t.id).length }}</template
                >
                {{
                  getFilteredJobsForTech(t.id).length === 1 ? "job" : "jobs"
                }}</span
              >
              <button
                v-if="isSuperadmin"
                type="button"
                class="btn-tech-delete"
                :title="`Hapus Teknisi ${techName(t)} (Khusus Superadmin)`"
                @click.stop="openDeleteTech(t)"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>

            <div
              class="tech-lane"
              :class="{ 'drag-over': dragOverTechId === t.id }"
              @dragover.prevent="onDragOver(t.id)"
              @dragleave="onDragLeave"
              @drop="onDrop(t.id)"
            >
              <div
                class="lane-empty"
                v-if="getFilteredJobsForTech(t.id).length === 0"
              >
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
                  <span class="ref-no">{{ jobDisplayNo(job) }}</span>
                  <div class="ac-badge-actions">
                    <span class="badge" :class="statusBadgeClass(job.status)">
                      {{ String(job.status || "new").replace("_", " ") }}
                    </span>
                    <button
                      v-if="isSuperadmin"
                      type="button"
                      class="btn-job-card-delete"
                      title="Hapus Job Ini (Khusus Superadmin)"
                      @click.stop="openDeleteJob(job)"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- Customer Name -->
                <div class="ac-row muted" style="margin-top: 6px">
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
                  <span class="ac-company">{{
                    job.customer_name ||
                    job.customer?.company_name ||
                    job.customer?.name ||
                    job.delivery_order?.customer?.company_name ||
                    job.delivery_order?.customer?.name ||
                    job.service_request?.customer?.company_name ||
                    job.service_request?.customer?.name ||
                    job.service_report?.customer?.company_name ||
                    job.service_report?.customer?.name ||
                    "-"
                  }}</span>
                </div>

                <!-- Address for Delivery Orders -->
                <div
                  v-if="isDeliveryJob(job) && getTaskAddress(job)"
                  class="ac-row muted"
                  style="margin-top: 4px"
                >
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
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span class="ac-company">{{ getTaskAddress(job) }}</span>
                </div>

                <!-- Product/Items Info for Delivery Orders -->
                <div
                  v-if="isDeliveryJob(job)"
                  class="ac-row muted"
                  style="margin-top: 4px"
                >
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
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                  <span v-if="doItemsCount(job) > 0">
                    {{ doItemsCount(job) }} item{{
                      doItemsCount(job) > 1 ? "s" : ""
                    }}
                    <template
                      v-if="
                        (job.delivery_order?.delivery_order_items ||
                          job.delivery_order_items ||
                          job.items ||
                          [])[0]
                      "
                    >
                      ·
                      {{
                        doItemLabel(
                          (job.delivery_order?.delivery_order_items ||
                            job.delivery_order_items ||
                            job.items ||
                            [])[0],
                        )
                      }}
                    </template>
                  </span>
                  <span v-else>{{ deliveryTypeLabel(jobDoType(job)) }}</span>
                </div>

                <!-- Unit Info for Visits -->
                <div
                  v-if="isVisitJob(job)"
                  class="ac-row muted"
                  style="margin-top: 4px"
                >
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
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                  <span>{{ visitUnitLabel(job) }}</span>
                </div>

                <!-- Date & Job Type -->
                <div class="ac-row muted" style="margin-top: 4px">
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
                  <span v-if="isDeliveryJob(job)"
                    >Delivery {{ formatFullDate(jobDeliveryDate(job)) }}</span
                  >
                  <span v-else-if="isVisitJob(job)"
                    >Visit {{ formatFullDate(visitDateOf(job)) }}</span
                  >
                  <span v-else
                    >Scheduled {{ formatFullDate(job.scheduled_date) }}</span
                  >
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
      :title="
        selectedJob
          ? selectedJob.taskType === 'maintenance'
            ? 'Maintenance Details'
            : 'Job Order Details'
          : selectedRequest?.taskType === 'maintenance'
            ? 'Maintenance Details'
            : 'Service Request Details'
      "
      max-width="560px"
      @close="closeDetail"
    >
      <template v-if="selectedJob">
        <div class="detail-hero">
          <div class="detail-hero-main">
            <span class="detail-hero-id">{{ jobDisplayNo(selectedJob) }}</span>
            <span class="badge" :class="statusBadgeClass(selectedJob.status)">
              {{ String(selectedJob.status || "new").replace("_", " ") }}
            </span>
          </div>
          <span class="detail-hero-scheduled">
            <template v-if="isDeliveryJob(selectedJob)"
              >🚚 Delivery
              {{ formatFullDate(jobDeliveryDate(selectedJob)) }}</template
            >
            <template v-else-if="isVisitJob(selectedJob)"
              >🔧 Visit {{ formatFullDate(visitDateOf(selectedJob)) }}</template
            >
            <template v-else
              >🗓 Scheduled
              {{ formatFullDate(selectedJob.scheduled_date) }}</template
            >
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
            <span class="detail-label">{{
              isDeliveryJob(selectedJob)
                ? "Delivery Date"
                : isVisitJob(selectedJob)
                  ? "Visit Date"
                  : "Scheduled Date"
            }}</span>
            <span class="detail-value">{{
              isDeliveryJob(selectedJob)
                ? formatFullDate(jobDeliveryDate(selectedJob))
                : isVisitJob(selectedJob)
                  ? formatFullDate(visitDateOf(selectedJob))
                  : formatFullDate(selectedJob.scheduled_date)
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

        <div class="detail-section" v-if="isVisitJob(selectedJob)">
          <div class="detail-section-title">Visit (Copier Report)</div>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">Report No</span>
              <span class="detail-value detail-link">{{
                selectedJob.report_no
              }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Unit</span>
              <span class="detail-value">{{
                visitUnitLabel(selectedJob)
              }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Report Status</span>
              <span class="detail-value">{{
                String(selectedJob.status || "-").replace("_", " ")
              }}</span>
            </div>
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
                String(selectedJob.service_report.service_type || "-").replace(
                  "_",
                  " ",
                )
              }}</span>
            </div>
            <div class="detail-item" v-if="selectedJob.service_report.unit">
              <span class="detail-label">Unit</span>
              <span class="detail-value">{{
                selectedJob.service_report.unit.model
                  ? `${selectedJob.service_report.unit.model} (${selectedJob.service_report.unit.serial_no || "-"})`
                  : "-"
              }}</span>
            </div>
            <div
              class="detail-item"
              v-if="selectedJob.service_report.service_date"
            >
              <span class="detail-label">Visit Date</span>
              <span class="detail-value">{{
                formatFullDate(selectedJob.service_report.service_date)
              }}</span>
            </div>
          </div>
        </div>

        <div class="detail-section" v-if="selectedJob.delivery_order">
          <div class="detail-section-title">Delivery Order</div>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">DO Number</span>
              <span class="detail-value detail-link">{{
                selectedJob.delivery_order.do_number ||
                selectedJob.delivery_order.delivery_no
              }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">DO Type</span>
              <span class="detail-value">{{
                deliveryTypeLabel(
                  selectedJob.delivery_order.do_type ||
                    selectedJob.delivery_order.delivery_type,
                )
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
            <div
              class="detail-item"
              v-if="selectedJob.delivery_order.recipient_name"
            >
              <span class="detail-label">Recipient</span>
              <span class="detail-value"
                >{{ selectedJob.delivery_order.recipient_name
                }}{{
                  selectedJob.delivery_order.recipient_phone
                    ? ` (${selectedJob.delivery_order.recipient_phone})`
                    : ""
                }}</span
              >
            </div>
            <div
              class="detail-item wide"
              v-if="getTaskAddress(selectedJob.delivery_order)"
            >
              <span class="detail-label">Delivery Address</span>
              <span class="detail-value">{{
                getTaskAddress(selectedJob.delivery_order)
              }}</span>
            </div>
          </div>
          <div
            v-if="
              (
                selectedJob.delivery_order.delivery_order_items ||
                selectedJob.delivery_order.items ||
                []
              ).length > 0
            "
            style="margin-top: 8px"
          >
            <div class="detail-label" style="margin-bottom: 6px">
              Items ({{
                (
                  selectedJob.delivery_order.delivery_order_items ||
                  selectedJob.delivery_order.items ||
                  []
                ).length
              }})
            </div>
            <div
              v-for="(it, iIdx) in selectedJob.delivery_order
                .delivery_order_items || selectedJob.delivery_order.items"
              :key="iIdx"
              class="detail-item"
              style="
                padding: 6px 0;
                border-top: 1px dashed var(--color-border-light);
              "
            >
              <span class="detail-value"
                >{{ Number(iIdx) + 1 }}. {{ doItemLabel(it) }}</span
              >
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
            {{
              selectedJob.service_request?.problem_description ||
              selectedJob.notes ||
              selectedJob.problem ||
              selectedJob.machine_problem ||
              "-"
            }}
          </p>
        </div>

        <div
          class="detail-section"
          v-if="selectedJob.instructions || selectedJob.action"
        >
          <div class="detail-section-title">Instructions / Action</div>
          <p class="detail-text">
            {{ selectedJob.instructions || selectedJob.action }}
          </p>
        </div>
      </template>

      <template v-else-if="selectedRequest">
        <div class="detail-hero">
          <div class="detail-hero-main">
            <span class="detail-hero-id">{{
              selectedRequest.service_request_no ||
              selectedRequest.request_no ||
              selectedRequest.do_number ||
              selectedRequest.delivery_no ||
              selectedRequest.report_no
            }}</span>
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
              formatFullDate(
                selectedRequest.request_date ||
                  selectedRequest.delivery_date ||
                  selectedRequest.service_date,
              )
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

        <div
          class="detail-section"
          v-if="selectedRequest.taskType === 'visit' && selectedRequest.unit"
        >
          <div class="detail-section-title">Unit</div>
          <p class="detail-text">
            {{ selectedRequest.unit.model || "Unit"
            }}{{
              selectedRequest.unit.serial_no
                ? ` (${selectedRequest.unit.serial_no})`
                : ""
            }}
          </p>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">Problem / Notes</div>
          <p class="detail-text">
            {{
              selectedRequest.problem ||
              selectedRequest.problem_description ||
              selectedRequest.notes ||
              selectedRequest.machine_problem ||
              "-"
            }}
          </p>
        </div>
      </template>

      <template #footer>
        <button class="btn btn-outline" @click="closeDetail">Close</button>
        <button
          v-if="selectedJob && selectedJob.technician_id"
          class="btn btn-outline"
          style="color: var(--color-warning, #d97706); border-color: rgba(217, 119, 6, 0.4);"
          @click="cancelJobAssignment(selectedJob.id)"
        >
          Cancel Assignment
        </button>
        <button
          v-if="isSuperadmin && selectedJob"
          class="btn btn-danger"
          style="display: inline-flex; align-items: center; gap: 6px;"
          @click="openDeleteJob(selectedJob)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Hapus Job Order
        </button>
      </template>
    </FormModal>

    <!-- Assign Confirmation Modal -->
    <FormModal
      :open="showAssignModal"
      :title="
        assignTarget?.task?.taskType === 'do'
          ? 'Assign Delivery Order'
          : assignTarget?.task?.taskType === 'visit'
            ? 'Assign Visit'
            : 'Assign Service Request'
      "
      max-width="480px"
      @close="cancelAssign"
    >
      <div v-if="assignTarget" class="assign-modal-body">
        <div class="assign-info">
          <div class="assign-info-row">
            <span class="assign-label">Task</span>
            <span class="assign-value font-bold">{{
              assignTarget.task.request_no ||
              assignTarget.task.do_number ||
              assignTarget.task.delivery_no ||
              assignTarget.task.report_no ||
              assignTarget.task.job_order_no ||
              assignTarget.task.service_request_no
            }}</span>
          </div>
          <div class="assign-info-row">
            <span class="assign-label">Technician</span>
            <span class="assign-value">{{
              technicianLabel(assignTarget.techId)
            }}</span>
          </div>
          <div
            class="assign-info-row"
            v-if="assignTarget.task.customer || assignTarget.task.customer_name"
          >
            <span class="assign-label">Customer</span>
            <span class="assign-value">{{
              assignTarget.task.customer?.company_name ||
              assignTarget.task.customer?.name ||
              assignTarget.task.customer_name ||
              "-"
            }}</span>
          </div>
        </div>

        <div
          class="form-group mt-lg"
          v-if="assignTarget.task.taskType === 'do'"
        >
          <label class="form-label"
            >Delivery Date <span class="text-danger">*</span></label
          >
          <input
            type="datetime-local"
            v-model="assignDeliveryDate"
            class="form-input"
          />
          <p class="assign-hint">
            Atur tanggal dan waktu pengantaran. Default: tanggal DO yang sudah
            ada.
          </p>
        </div>

        <div
          class="form-group mt-lg"
          v-else-if="assignTarget.task.taskType === 'visit'"
        >
          <label class="form-label"
            >Visit Date <span class="text-danger">*</span></label
          >
          <input
            type="datetime-local"
            v-model="assignVisitDate"
            :min="visitMinDate"
            :max="visitMaxDate"
            class="form-input"
          />
          <p class="assign-hint">
            Atur tanggal kunjungan teknisi untuk pengisian copier report.
            <strong class="text-danger"
              >Hanya bisa dijadwalkan pada tanggal 25 s.d 31 setiap
              bulannya.</strong
            >
          </p>
        </div>

        <div class="form-group mt-lg" v-else>
          <label class="form-label"
            >Scheduled Date <span class="text-danger">*</span></label
          >
          <input
            type="datetime-local"
            v-model="assignScheduledDate"
            class="form-input"
          />
          <p class="assign-hint">
            Atur tanggal dan waktu penjadwalan servis. Default: hari ini.
          </p>
        </div>

        <div
          class="form-group mt-lg"
          v-if="assignTarget?.task?.taskType === 'do'"
        >
          <label
            class="form-label"
            style="
              display: block;
              font-weight: 500;
              font-size: 13px;
              margin-bottom: 6px;
            "
          >
            Upload Tanda Tangan CS / Admin (Gambar)
            <span class="text-danger">*</span>
          </label>
          <div
            v-if="assignSignature"
            class="sig-preview-wrapper"
            style="
              border: 1px dashed var(--color-border);
              border-radius: var(--radius-md);
              padding: 12px;
              text-align: center;
              background: var(--color-surface-raised, #f8fafc);
            "
          >
            <img
              :src="assignSignature"
              alt="Preview Tanda Tangan"
              style="
                max-height: 120px;
                max-width: 100%;
                object-fit: contain;
                margin-bottom: 8px;
                display: inline-block;
              "
            />
            <div>
              <button
                type="button"
                class="btn btn-sm btn-outline text-danger"
                @click="
                  assignSignature = '';
                  if (sigFileInput) sigFileInput.value = '';
                "
              >
                Hapus / Ganti Gambar
              </button>
            </div>
          </div>
          <div
            v-else
            class="sig-upload-box"
            style="
              border: 2px dashed var(--color-border);
              border-radius: var(--radius-md);
              padding: 20px;
              text-align: center;
              background: var(--color-surface-sunken, #f1f5f9);
              cursor: pointer;
            "
            @click="sigFileInput?.click()"
          >
            <input
              ref="sigFileInput"
              type="file"
              accept="image/*"
              style="display: none"
              @change="handleSignatureFileUpload"
            />
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              style="
                margin: 0 auto 8px;
                color: var(--color-text-muted);
                display: block;
              "
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <div
              style="
                font-weight: 500;
                font-size: 13px;
                color: var(--color-text);
              "
            >
              Klik untuk upload gambar tanda tangan
            </div>
            <div
              style="
                font-size: 11px;
                color: var(--color-text-muted);
                margin-top: 4px;
              "
            >
              Format JPG, PNG, atau WEBP
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <button
          class="btn btn-outline"
          :disabled="isAssigning"
          @click="cancelAssign"
        >
          Cancel
        </button>
        <button
          class="btn btn-primary"
          :disabled="isAssigning"
          @click="confirmAssign"
        >
          {{ isAssigning ? "Assigning..." : "Confirm Assign" }}
        </button>
      </template>
    </FormModal>

    <!-- Superadmin Delete Job Order Confirmation Modal -->
    <ConfirmDialog
      :open="showDeleteJobModal"
      title="Hapus Job Order (Permanen)"
      :message="`Apakah Anda yakin ingin menghapus job ${jobToDelete ? jobDisplayNo(jobToDelete) : ''} secara permanen? Data job order dan relasi terkait akan dihapus dari sistem.`"
      confirm-text="Hapus Permanen"
      cancel-text="Batal"
      variant="danger"
      :loading="isDeleting"
      @confirm="handleDeleteJob"
      @cancel="showDeleteJobModal = false; jobToDelete = null"
    />

    <!-- Superadmin Delete Technician Lane Confirmation Modal -->
    <ConfirmDialog
      :open="showDeleteTechModal"
      title="Hapus Teknisi / Lane (Permanen)"
      :message="`Apakah Anda yakin ingin menghapus data teknisi '${techToDelete ? techName(techToDelete) : ''}' secara permanen? Semua penugasan job akan otomatis dilepas.`"
      confirm-text="Hapus Teknisi"
      cancel-text="Batal"
      variant="danger"
      :loading="isDeleting"
      @confirm="handleDeleteTech"
      @cancel="showDeleteTechModal = false; techToDelete = null"
    />
  </div>
</template>

<style scoped>
.jo-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-base);
}

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

.sidebar {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: var(--space-base);
  gap: var(--space-sm);
  height: 100%;
  min-height: 0;
  overflow: hidden;
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
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding-right: 4px;
}

.unassigned-list::-webkit-scrollbar {
  width: 6px;
}

.unassigned-list::-webkit-scrollbar-track {
  background: transparent;
}

.unassigned-list::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: var(--radius-full);
}

.unassigned-list::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-muted);
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

.job-card {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 12px 14px;
  width: 100%;
  box-shadow: var(--shadow-xs);
  transition:
    transform var(--transition-base),
    box-shadow var(--transition-base),
    border-color var(--transition-base);
  position: relative;
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

.ac-badge-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-tech-delete {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid rgba(239, 68, 68, 0.25);
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-tech-delete:hover {
  background: #ef4444;
  color: #ffffff;
  border-color: #ef4444;
}

.btn-job-card-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 4px;
  border: 1px solid rgba(239, 68, 68, 0.25);
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-job-card-delete:hover {
  background: #ef4444;
  color: #ffffff;
  border-color: #ef4444;
  transform: scale(1.08);
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
  margin-bottom: 8px;
}

.ref-no {
  color: var(--color-primary);
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-sm);
  white-space: nowrap;
}

.date-tag {
  margin-left: auto;
  background: var(--color-surface-sunken);
  color: var(--color-text-secondary);
  padding: 3px 8px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
}

.card-body {
  font-size: var(--font-size-sm);
  line-height: 1.4;
  border-top: 1px solid var(--color-border-light);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.problem-text {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-customer,
.card-address {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.card-customer svg,
.card-address svg {
  flex-shrink: 0;
  margin-top: 2px;
  opacity: 0.55;
}

.card-customer {
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
}

.card-address span {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.card-body > .card-customer + .card-address {
  margin-top: 0;
}

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
