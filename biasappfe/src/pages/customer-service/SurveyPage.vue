<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import PageHeader from "@/components/ui/PageHeader.vue";
import DataTable from "@/components/ui/DataTable.vue";
import FormModal from "@/components/ui/FormModal.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import CustomSelect from "@/components/ui/CustomSelect.vue";
import { useMasterStore } from "@/composables/useMasterStore";
import { usePermission } from "@/composables/usePermission";
import { useToast } from "@/composables/useToast";
import { resources } from "@/services/resource.service";
import { useRouter } from "vue-router";
import type { TableColumn } from "@/types";

const toast = useToast();
const { can } = usePermission();
const router = useRouter();
const { customers, units, ensureResourcesLoaded } = useMasterStore();

const columns: TableColumn[] = [
  { key: "survey_no", label: "Survey No" },
  { key: "_customer", label: "Customer" },
  { key: "_unit", label: "Unit" },
  { key: "result", label: "Result" },
  { key: "status", label: "Status" },
  { key: "remarks", label: "Remarks" },
];

const data = ref<any[]>([]);
const isLoading = ref(false);
const showModal = ref(false);
const showConfirm = ref(false);
const editingItem = ref<any>(null);
const deletingItem = ref<any>(null);

const customerOptions = computed(() =>
  (customers.value as any[]).map((c: any) => ({
    value: c.id,
    label: c.company_name || c.name,
  })),
);

const unitOptions = computed(() =>
  (units.value as any[]).map((u: any) => ({
    value: u.id,
    label: `${u.model || u.name} (SN: ${u.serial_no})`,
  })),
);

const resultOptions = [
  { value: "matched", label: "Cocok (Matched)" },
  { value: "not_matched", label: "Tidak Cocok" },
  { value: "pending", label: "Pending" },
];

const statusOptions = [
  { value: "pending", label: "Pending" },
  { value: "matched", label: "Matched" },
  { value: "cancelled", label: "Cancelled" },
];

const form = reactive({
  customer_id: "",
  unit_id: null as string | null,
  result: "pending",
  status: "pending",
  remarks: "",
});

async function fetchData() {
  isLoading.value = true;
  try {
    const res = await resources.surveys.list();
    const list = Array.isArray((res as any)?.data)
      ? (res as any).data
      : Array.isArray(res)
        ? res
        : [];
    data.value = (list as any[]).map((r: any) => ({
      ...r,
      _customer: r.customer?.company_name || r.customer?.name || "-",
      _unit: r.unit ? `${r.unit.model || r.unit.name} (SN: ${r.unit.serial_no})` : "-",
    }));
  } catch (e: any) {
    toast.error("Gagal memuat survey: " + (e?.message || "Error"));
  } finally {
    isLoading.value = false;
  }
}

function openAdd() {
  editingItem.value = null;
  Object.assign(form, {
    customer_id: "",
    unit_id: null,
    result: "pending",
    status: "pending",
    remarks: "",
  });
  showModal.value = true;
}

function openEdit(item: any) {
  editingItem.value = item;
  Object.assign(form, {
    customer_id: item.customer_id || "",
    unit_id: item.unit_id || null,
    result: item.result || "pending",
    status: item.status || "pending",
    remarks: item.remarks || "",
  });
  showModal.value = true;
}

async function handleSubmit() {
  if (!form.customer_id) {
    toast.warning("Customer wajib diisi.");
    return;
  }
  const payload: any = {
    customer_id: form.customer_id,
    unit_id: form.unit_id,
    result: form.result,
    status: form.status,
    remarks: form.remarks,
  };
  try {
    if (editingItem.value) {
      await resources.surveys.update(String(editingItem.value.id), payload);
      toast.success("Survey updated.");
    } else {
      await resources.surveys.create(payload);
      toast.success("Survey created.");
    }
    showModal.value = false;
    await fetchData();
  } catch (e: any) {
    toast.error("Gagal menyimpan survey: " + (e?.message || "Error"));
  }
}

function openDelete(item: any) {
  deletingItem.value = item;
  showConfirm.value = true;
}

async function handleDelete() {
  if (!deletingItem.value) return;
  try {
    await resources.surveys.remove(String(deletingItem.value.id));
    toast.success("Survey deleted.");
    await fetchData();
  } catch (e: any) {
    toast.error("Gagal menghapus survey: " + (e?.message || "Error"));
  } finally {
    showConfirm.value = false;
    deletingItem.value = null;
  }
}

async function cancelSurvey(item: any) {
  try {
    await resources.surveys.update(String(item.id), { status: "cancelled", result: "not_matched" });
    toast.success("Survey cancelled.");
    await fetchData();
  } catch (e: any) {
    toast.error("Gagal cancel survey: " + (e?.message || "Error"));
  }
}

function createSaleFromSurvey(item: any) {
  const q = new URLSearchParams();
  if (item.customer_id) q.set("customer_id", String(item.customer_id));
  if (item.unit_id) q.set("unit_id", String(item.unit_id));
  router.push(`/customer-service/sales?${q.toString()}`);
}

onMounted(async () => {
  await ensureResourcesLoaded("/customer-service/surveys");
  await fetchData();
});
</script>

<template>
  <div>
    <PageHeader title="Survey" button-label="Add Survey" permission="survey:create" @add="openAdd" />
    <DataTable :columns="columns" :data="data" :loading="isLoading" search-placeholder="Search surveys..." permission="survey">
      <template #cell-result="{ value }">
        <span class="badge" :class="value === 'matched' ? 'badge-success' : value === 'not_matched' ? 'badge-danger' : 'badge-warning'">
          {{ value || 'pending' }}
        </span>
      </template>
      <template #cell-status="{ value }">
        <span class="badge" :class="value === 'matched' ? 'badge-success' : value === 'cancelled' ? 'badge-danger' : 'badge-warning'">
          {{ value || 'pending' }}
        </span>
      </template>
      <template #actions="{ row }">
        <button v-if="row.result === 'matched' || row.status === 'matched'" class="btn btn-sm btn-primary" @click="createSaleFromSurvey(row)">
          Buat Sale Baru
        </button>
        <button v-if="row.status !== 'cancelled' && row.result !== 'matched'" class="btn btn-sm btn-outline" @click="cancelSurvey(row)">
          Cancel
        </button>
        <button class="action-btn" title="Edit" @click="openEdit(row)">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="action-btn" title="Delete" @click="openDelete(row)">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </template>
    </DataTable>

    <FormModal :open="showModal" :title="editingItem ? 'Edit Survey' : 'Add Survey'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label class="form-label">Customer</label>
        <CustomSelect v-model="form.customer_id" :options="customerOptions" placeholder="-- Select Customer --" />
      </div>
      <div class="form-group mt-3">
        <label class="form-label">Unit</label>
        <CustomSelect v-model="form.unit_id" :options="unitOptions" placeholder="-- Select Unit --" />
      </div>
      <div class="form-group mt-3">
        <label class="form-label">Result</label>
        <CustomSelect v-model="form.result" :options="resultOptions" placeholder="-- Select Result --" />
      </div>
      <div class="form-group mt-3">
        <label class="form-label">Status</label>
        <CustomSelect v-model="form.status" :options="statusOptions" placeholder="-- Select Status --" />
      </div>
      <div class="form-group mt-3">
        <label class="form-label">Remarks</label>
        <textarea v-model="form.remarks" class="form-input" rows="3"></textarea>
      </div>
    </FormModal>

    <ConfirmDialog :open="showConfirm" title="Delete Survey" :message="`Are you sure you want to delete this survey?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>

<style scoped>
.mt-3 { margin-top: 1rem; }
</style>
