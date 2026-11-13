<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from "vue";
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

// Module-level cache for instant zero-latency page transitions
let cachedSurveys: any[] = [];

const toast = useToast();
const { can } = usePermission();
const router = useRouter();
const { customers, units, technicians, ensureResourcesLoaded } = useMasterStore();

const columns: TableColumn[] = [
  { key: "survey_no", label: "Survey No" },
  { key: "_customer", label: "Customer" },
  { key: "_technician", label: "Teknisi Ditugaskan" },
  { key: "_scheduled_date", label: "Jadwal Survey" },
  { key: "_unit", label: "Unit / Minat" },
  { key: "price", label: "Perkiraan Harga" },
  { key: "status", label: "Status" },
  { key: "_field_findings", label: "Hasil Lapangan" },
];

const data = ref<any[]>(cachedSurveys);
const isLoading = ref(cachedSurveys.length === 0);
const isLoadingDetail = ref(false);
const showModal = ref(false);
const showConfirm = ref(false);
const showDetailModal = ref(false);
const selectedDetailItem = ref<any>(null);
const zoomPhoto = ref<string | null>(null);
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

const technicianOptions = computed(() => [
  { value: "", label: "-- Belum Ditugaskan / Pilih Nanti --" },
  ...(technicians.value as any[]).map((t: any) => ({
    value: t.id,
    label: t.user?.name || t.name || `Teknisi ${t.employee_code || t.id}`,
  })),
]);

const statusOptions = [
  { value: "pending", label: "Pending" },
  { value: "matched", label: "Cocok (Matched)" },
  { value: "cancelled", label: "Dibatalkan (Cancelled)" },
];

const form = reactive({
  customer_id: "",
  unit_id: null as string | null,
  price: null as number | null,
  technician_id: "",
  scheduled_date: "",
  survey_address: "",
  contact_person: "",
  contact_phone: "",
  result: "pending",
  status: "pending",
  remarks: "",
});

watch(() => form.customer_id, (cId) => {
  if (!cId) return;
  const cust = (customers.value as any[]).find((c: any) => String(c.id) === String(cId));
  if (cust) {
    if (!form.survey_address || form.survey_address === "") {
      form.survey_address = cust.address || "";
    }
    if (!form.contact_person || form.contact_person === "") {
      form.contact_person = cust.pic_name || "";
    }
    if (!form.contact_phone || form.contact_phone === "") {
      form.contact_phone = cust.phone || "";
    }
  }
});

watch(() => form.unit_id, (uId) => {
  if (!uId) return;
  const found = (units.value as any[]).find((u: any) => u.id === uId);
  if (found && found.price != null && Number(found.price) > 0) {
    form.price = Number(found.price);
  }
});

const selectedUnitHasPrice = computed(() => {
  if (!form.unit_id) return false;
  const found = (units.value as any[]).find((u: any) => u.id === form.unit_id);
  return !!(found && found.price != null && Number(found.price) > 0);
});

async function fetchData() {
  if (data.value.length === 0) {
    isLoading.value = true;
  }
  try {
    const res = await resources.surveys.list();
    const list = Array.isArray((res as any)?.data)
      ? (res as any).data
      : Array.isArray(res)
        ? res
        : [];
    const formatted = (list as any[]).map((r: any) => {
      const techName = r.technician?.user?.name || r.technician?.name;
      const hasFindings = !!(r.electrical_condition || r.access_condition || r.recommended_model || r.photo_location || r.technician_notes);
      return {
        ...r,
        price: r.price != null ? r.price : (r.unit?.price != null ? r.unit.price : null),
        _customer: r.customer?.company_name || r.customer?.name || "-",
        _technician: techName || (r.technician_id ? `Teknisi Terpilih` : "-"),
        _scheduled_date: r.scheduled_date ? new Date(r.scheduled_date).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }) : "-",
        _unit: r.unit ? `${r.unit.model || r.unit.name} (SN: ${r.unit.serial_no})` : (r.recommended_model ? `Rekomendasi: ${r.recommended_model}` : "-"),
        _field_findings: hasFindings ? "Sudah Survey" : "Belum Survey",
        _hasFindings: hasFindings,
      };
    });
    data.value = formatted;
    cachedSurveys = formatted;
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
    price: null,
    technician_id: "",
    scheduled_date: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    survey_address: "",
    contact_person: "",
    contact_phone: "",
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
    price: item.price != null ? Number(item.price) : (item.unit?.price != null ? Number(item.unit.price) : null),
    technician_id: item.technician_id || "",
    scheduled_date: item.scheduled_date ? new Date(item.scheduled_date).toISOString().slice(0, 16) : "",
    survey_address: item.survey_address || item.customer?.address || "",
    contact_person: item.contact_person || item.customer?.pic_name || "",
    contact_phone: item.contact_phone || item.customer?.phone || "",
    result: item.result || "pending",
    status: item.status || "pending",
    remarks: item.remarks || "",
  });
  showModal.value = true;
}

async function openDetail(item: any) {
  selectedDetailItem.value = { ...item };
  showDetailModal.value = true;
  if (item.id && (item.photo_location === 'has_photo' || item._hasFindings)) {
    try {
      isLoadingDetail.value = true;
      const res = await resources.surveys.get(String(item.id));
      const full = (res as any)?.data || res;
      if (full && selectedDetailItem.value?.id === item.id) {
        selectedDetailItem.value = {
          ...selectedDetailItem.value,
          ...full,
          _customer: item._customer,
          _technician: item._technician,
          _scheduled_date: item._scheduled_date,
        };
      }
    } catch (err) {
      console.warn("Gagal memuat detail lengkap survey:", err);
    } finally {
      isLoadingDetail.value = false;
    }
  }
}

async function handleSubmit() {
  if (!form.customer_id) {
    toast.warning("Customer wajib diisi.");
    return;
  }
  const payload: any = {
    customer_id: form.customer_id,
    unit_id: form.unit_id || null,
    price: form.price != null && form.price !== '' && Number(form.price) > 0 ? Number(form.price) : null,
    technician_id: form.technician_id || undefined,
    scheduled_date: form.scheduled_date ? new Date(form.scheduled_date).toISOString() : undefined,
    survey_address: form.survey_address,
    contact_person: form.contact_person,
    contact_phone: form.contact_phone,
    result: form.result || "pending",
    status: form.status || "pending",
    remarks: form.remarks || "",
  };
  try {
    if (form.price && form.unit_id) {
      const targetUnit = (units.value as any[]).find((u: any) => u.id === form.unit_id);
      if (targetUnit && (!targetUnit.price || Number(targetUnit.price) === 0)) {
        try {
          await resources.units.update(form.unit_id, { price: Number(form.price) });
          targetUnit.price = Number(form.price);
        } catch (err) {
          console.warn("Could not update unit price:", err);
        }
      }
    }
    if (editingItem.value) {
      await resources.surveys.update(String(editingItem.value.id), payload);
      toast.success("Survey berhasil diupdate" + (form.technician_id ? " dan Job Order teknisi diperbarui!" : "."));
    } else {
      await resources.surveys.create(payload);
      toast.success("Survey berhasil dibuat" + (form.technician_id ? " dan Job Order teknisi otomatis dibuat!" : "."));
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

async function handleNextSurvey(item: any) {
  try {
    isLoading.value = true;
    await resources.surveys.update(String(item.id), { status: "matched", result: "matched" });
    toast.success("Survey disetujui. Mengarahkan ke form Sale...");
    createSaleFromSurvey(item);
  } catch (e: any) {
    toast.error("Gagal memproses survey: " + (e?.message || "Error"));
  } finally {
    isLoading.value = false;
  }
}

async function cancelSurvey(item: any) {
  if (!confirm("Apakah Anda yakin ingin membatalkan survey ini?")) {
    return;
  }
  try {
    isLoading.value = true;
    await resources.surveys.update(String(item.id), { status: "cancelled", result: "not_matched" });
    toast.success("Survey dibatalkan.");
    await fetchData();
  } catch (e: any) {
    toast.error("Gagal membatalkan survey: " + (e?.message || "Error"));
  } finally {
    isLoading.value = false;
  }
}

function openZoom(photo: string) {
  if (photo && photo !== 'has_photo') {
    zoomPhoto.value = photo;
  }
}

function createSaleFromSurvey(item: any) {
  showDetailModal.value = false;
  const q = new URLSearchParams();
  if (item.customer_id) q.set("customer_id", String(item.customer_id));
  if (item.unit_id) q.set("unit_id", String(item.unit_id));
  if (item.price != null && Number(item.price) > 0) q.set("price", String(item.price));
  router.push(`/customer-service/sales?${q.toString()}`);
}

onMounted(() => {
  // Run master resource sync and survey list concurrently for rapid render
  void Promise.all([
    ensureResourcesLoaded("/customer-service/surveys"),
    fetchData(),
  ]);
});
</script>

<template>
  <div>
    <PageHeader title="Survey" button-label="Add Survey" permission="survey:create" @add="openAdd" />
    <DataTable :columns="columns" :data="data" :loading="isLoading" search-placeholder="Search surveys..." permission="survey">
      <template #cell-_technician="{ row, value }">
        <span v-if="row.technician_id" class="badge badge-info" style="font-size: 0.8rem;">
          👷 {{ value }}
        </span>
        <span v-else class="text-muted" style="font-size: 0.8rem; font-style: italic;">
          Belum Ditugaskan
        </span>
      </template>
      <template #cell-price="{ value }">
        <span class="font-medium" style="font-weight: 600; color: #1e3a8a;">
          {{ value ? 'Rp ' + Number(value).toLocaleString('id-ID') : '-' }}
        </span>
      </template>
      <template #cell-status="{ value }">
        <span class="badge" :class="value === 'matched' ? 'badge-success' : value === 'cancelled' ? 'badge-danger' : 'badge-warning'">
          {{ value === 'matched' ? 'Cocok (Matched)' : value === 'cancelled' ? 'Batal' : 'Pending' }}
        </span>
      </template>
      <template #cell-_field_findings="{ row }">
        <button v-if="row._hasFindings" class="btn btn-xs btn-outline" style="gap: 4px; display: inline-flex; align-items: center;" @click="openDetail(row)">
          📋 Lihat Hasil
        </button>
        <span v-else class="text-muted" style="font-size: 0.75rem;">-</span>
      </template>
      <template #actions="{ row }">
        <button class="btn btn-sm btn-outline" title="Lihat Detail Survey" @click="openDetail(row)">
          Detail
        </button>
        <!-- Status pending: tampilkan tombol Next dan Cancel -->
        <template v-if="row.status === 'pending' || (!row.status && row.result === 'pending')">
          <button class="btn btn-sm btn-primary" title="Lanjut ke Sale" @click="handleNextSurvey(row)">
            Next
          </button>
          <button class="btn btn-sm btn-outline" title="Cancel Survey" @click="cancelSurvey(row)">
            Cancel
          </button>
        </template>
        <!-- Status matched: otomatis ada tombol Buat Sale -->
        <template v-else-if="row.status === 'matched' || row.result === 'matched'">
          <button class="btn btn-sm btn-primary" title="Buat Sale berdasarkan survey ini" @click="createSaleFromSurvey(row)">
            Buat Sale
          </button>
        </template>
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

    <!-- Create / Edit Survey Modal -->
    <FormModal :open="showModal" :title="editingItem ? 'Edit Survey' : 'Add Survey'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label class="form-label">Customer <span class="text-danger">*</span></label>
        <CustomSelect v-model="form.customer_id" :options="customerOptions" placeholder="-- Select Customer --" />
      </div>

      <div class="form-group mt-3">
        <label class="form-label">Alamat Survey</label>
        <textarea v-model="form.survey_address" class="form-input" rows="2" placeholder="Alamat lokasi customer yang akan disurvey..."></textarea>
      </div>

      <div class="responsive-flex mt-3">
        <div class="form-group" style="flex: 1;">
          <label class="form-label">PIC / Kontak Lapangan</label>
          <input v-model="form.contact_person" type="text" class="form-input" placeholder="Nama PIC..." />
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label">No. Telepon / HP</label>
          <input v-model="form.contact_phone" type="text" class="form-input" placeholder="08..." />
        </div>
      </div>

      <div class="card p-md mt-3" style="background: var(--color-surface-sunken); border: 1px dashed var(--color-primary);">
        <h4 class="text-sm font-bold mb-2" style="color: var(--color-primary);">👷 Penugasan Teknisi / Surveyor</h4>
        <div class="form-group">
          <label class="form-label">Tugaskan Teknisi (Job Order)</label>
          <CustomSelect v-model="form.technician_id" :options="technicianOptions" placeholder="-- Pilih Teknisi --" />
          <p class="text-xs text-muted mt-1">Saat teknisi dipilih, Job Order survey akan otomatis muncul di aplikasi teknisi.</p>
        </div>
        <div class="form-group mt-2">
          <label class="form-label">Tanggal & Waktu Jadwal Survey</label>
          <input v-model="form.scheduled_date" type="datetime-local" class="form-input" />
        </div>
      </div>

      <div class="form-group mt-3">
        <label class="form-label">Unit Minat (Opsional)</label>
        <CustomSelect v-model="form.unit_id" :options="unitOptions" placeholder="-- Pilih Unit (Jika sudah ada perkiraan) --" />
      </div>

      <div class="form-group mt-3">
        <label class="form-label">
          Perkiraan Harga (Rp) <span class="text-muted" style="font-size: 11px; font-weight: normal;">(Opsional)</span>
        </label>
        <input
          v-model.number="form.price"
          type="number"
          class="form-input"
          placeholder="Opsional — Masukkan nominal harga jika ingin ditentukan"
        />
      </div>

      <div class="form-group mt-3">
        <label class="form-label">Status</label>
        <CustomSelect v-model="form.status" :options="statusOptions" placeholder="-- Select Status --" />
      </div>

      <div class="form-group mt-3">
        <label class="form-label">Remarks / Instruksi Survey</label>
        <textarea v-model="form.remarks" class="form-input" rows="2" placeholder="Catatan instruksi khusus untuk teknisi survey..."></textarea>
      </div>
    </FormModal>

    <!-- Survey Detail Modal (Hasil Survey Lapangan) -->
    <FormModal :open="showDetailModal" title="Detail Hasil Survey Lapangan" @close="showDetailModal = false">
      <div v-if="selectedDetailItem" class="survey-detail-content">
        <div class="p-md mb-md" style="background: var(--color-surface-sunken); border-radius: var(--radius-md);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span class="font-bold text-md">{{ selectedDetailItem.survey_no }}</span>
            <span class="badge" :class="selectedDetailItem.status === 'matched' ? 'badge-success' : selectedDetailItem.status === 'cancelled' ? 'badge-danger' : 'badge-warning'">
              {{ selectedDetailItem.status.toUpperCase() }}
            </span>
          </div>
          <div class="text-sm"><strong>Customer:</strong> {{ selectedDetailItem._customer }}</div>
          <div class="text-sm"><strong>Alamat:</strong> {{ selectedDetailItem.survey_address || selectedDetailItem.customer?.address || '-' }}</div>
          <div class="text-sm"><strong>Kontak:</strong> {{ selectedDetailItem.contact_person || '-' }} ({{ selectedDetailItem.contact_phone || '-' }})</div>
          <div class="text-sm"><strong>Teknisi:</strong> {{ selectedDetailItem._technician }}</div>
          <div class="text-sm"><strong>Jadwal:</strong> {{ selectedDetailItem._scheduled_date }}</div>
          <div v-if="selectedDetailItem.remarks" class="text-sm mt-1"><strong>Catatan CS:</strong> {{ selectedDetailItem.remarks }}</div>
        </div>

        <h4 class="font-bold mb-sm text-sm" style="color: var(--color-primary);">📋 Laporan Hasil Temuan Teknisi</h4>
        <div class="info-grid p-md" style="border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface);">
          <div class="mb-sm">
            <span class="text-xs text-muted block">Rekomendasi Tipe Unit / Mesin:</span>
            <span class="text-sm font-semibold">{{ selectedDetailItem.recommended_model || selectedDetailItem.unit?.model || 'Belum dilaporkan' }}</span>
          </div>
          <div class="mb-sm">
            <span class="text-xs text-muted block">Catatan Tambahan Teknisi:</span>
            <p class="text-sm mt-1" style="white-space: pre-line;">{{ selectedDetailItem.technician_notes || '-' }}</p>
          </div>
          <div v-if="selectedDetailItem.photo_location && selectedDetailItem.photo_location !== 'has_photo'">
            <span class="text-xs text-muted block mb-1">Dokumentasi Foto Lokasi Survey:</span>
            <div
              style="cursor: pointer; max-width: 260px; border-radius: 6px; overflow: hidden; border: 1px solid var(--color-border); box-shadow: 0 1px 3px rgba(0,0,0,0.1);"
              @click="openZoom(selectedDetailItem.photo_location)"
              title="Klik untuk melihat foto ukuran penuh"
            >
              <img :src="selectedDetailItem.photo_location" alt="Foto Lokasi" style="width: 100%; height: 160px; object-fit: cover; display: block;" />
              <div style="background: rgba(15, 23, 42, 0.75); color: #fff; font-size: 11px; text-align: center; padding: 5px 8px; display: flex; align-items: center; justify-content: center; gap: 4px;">
                <span>🔍</span> <span>Klik untuk perbesar</span>
              </div>
            </div>
          </div>
          <div v-else-if="selectedDetailItem.photo_location === 'has_photo' || isLoadingDetail" class="text-xs text-muted p-2" style="background: var(--color-surface-sunken); border-radius: 4px; display: inline-flex; align-items: center; gap: 6px;">
            <span>⏳ Memuat foto survey...</span>
          </div>
        </div>
      </div>
      <template #footer>
        <button class="btn btn-outline" @click="showDetailModal = false">Tutup</button>
        <button v-if="selectedDetailItem && selectedDetailItem.status === 'matched'" class="btn btn-primary" @click="createSaleFromSurvey(selectedDetailItem)">
          Buat Sale dari Survey Ini
        </button>
      </template>
    </FormModal>

    <!-- Zoom Photo Lightbox Modal -->
    <Teleport to="body">
      <div
        v-if="zoomPhoto"
        style="position: fixed; inset: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.85); z-index: 999999; display: flex; align-items: center; justify-content: center; padding: 16px; backdrop-filter: blur(2px);"
        @click="zoomPhoto = null"
      >
        <div
          style="position: relative; max-width: 90vw; max-height: 90vh; background: #ffffff; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);"
          @click.stop
        >
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
            <span style="font-weight: 700; font-size: 13px; color: #0f172a;">🔍 Dokumentasi Foto Survey</span>
            <button
              type="button"
              class="btn btn-xs btn-outline"
              style="padding: 2px 8px; font-weight: bold; font-size: 14px; cursor: pointer;"
              @click="zoomPhoto = null"
            >
              ✕
            </button>
          </div>
          <div style="padding: 12px; display: flex; align-items: center; justify-content: center; overflow: auto; max-height: calc(85vh - 90px); background: #0b0f19;">
            <img
              :src="zoomPhoto"
              alt="Zoom Foto Survey"
              style="max-width: 85vw; max-height: 75vh; object-fit: contain; border-radius: 6px;"
            />
          </div>
          <div style="padding: 10px 16px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; background: #f8fafc;">
            <button type="button" class="btn btn-primary btn-sm" @click="zoomPhoto = null">Tutup</button>
          </div>
        </div>
      </div>
    </Teleport>

    <ConfirmDialog :open="showConfirm" title="Delete Survey" :message="`Are you sure you want to delete this survey?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>

<style scoped>
.mt-3 { margin-top: 1rem; }
.responsive-flex {
  display: flex;
  gap: 12px;
}
@media (max-width: 640px) {
  .responsive-flex {
    flex-direction: column;
  }
}
</style>
