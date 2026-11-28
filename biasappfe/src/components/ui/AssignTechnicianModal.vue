<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import CustomSelect from "@/components/ui/CustomSelect.vue";
import FormModal from "@/components/ui/FormModal.vue";
import { useToast } from "@/composables/useToast";
import { toLocalDateTimeInput } from "@/utils/jobTechnician";

export interface AssignSubmitPayload {
  technician_id: string;
  member_technician_ids: string[];
  scheduled_date: string;
  instructions: string;
}

const props = withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    summaryLines?: Array<{ label: string; value: string }>;
    technicians: any[];
    initialLeadId?: string | number | null;
    initialMemberIds?: Array<string | number>;
    initialScheduledDate?: string | Date | null;
    initialInstructions?: string;
    showInstructions?: boolean;
    instructionsRequired?: boolean;
    loading?: boolean;
    submitLabel?: string;
  }>(),
  {
    title: "Assign Teknisi",
    summaryLines: () => [],
    initialLeadId: "",
    initialMemberIds: () => [],
    initialScheduledDate: null,
    initialInstructions: "",
    showInstructions: true,
    instructionsRequired: false,
    loading: false,
    submitLabel: "Assign Teknisi",
  },
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "submit", payload: AssignSubmitPayload): void;
}>();

const toast = useToast();

const form = reactive({
  technician_id: "",
  member_technician_ids: [] as string[],
  scheduled_date: toLocalDateTimeInput(),
  instructions: "",
});

const technicianOptions = computed(() =>
  (props.technicians || []).map((t: any) => ({
    value: String(t.id),
    label: t.user?.name || t.name || `Teknisi ${t.id}`,
  })),
);

const availableMembers = computed(() =>
  technicianOptions.value.filter(
    (opt) => String(opt.value) !== String(form.technician_id),
  ),
);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    const leadId = props.initialLeadId ? String(props.initialLeadId) : "";
    form.technician_id = leadId;
    form.member_technician_ids = Array.isArray(props.initialMemberIds)
      ? props.initialMemberIds
          .map((id) => String(id))
          .filter((id) => id && id !== leadId)
      : [];
    form.scheduled_date = toLocalDateTimeInput(props.initialScheduledDate);
    form.instructions = props.initialInstructions || "";
  },
  { immediate: true },
);

watch(
  () => form.technician_id,
  (newLead) => {
    if (!newLead) return;
    form.member_technician_ids = form.member_technician_ids.filter(
      (id) => String(id) !== String(newLead),
    );
  },
);

function handleSubmit() {
  if (!form.technician_id) {
    toast.warning("Pilih Kepala Teknisi terlebih dahulu.");
    return;
  }
  if (props.showInstructions && props.instructionsRequired && !form.instructions.trim()) {
    toast.warning("Instruksi / catatan tidak boleh kosong.");
    return;
  }
  const memberIds = (form.member_technician_ids || []).filter(
    (id) => String(id) !== String(form.technician_id),
  );
  emit("submit", {
    technician_id: String(form.technician_id),
    member_technician_ids: memberIds,
    scheduled_date: new Date(form.scheduled_date || Date.now()).toISOString(),
    instructions: form.instructions.trim(),
  });
}
</script>

<template>
  <FormModal
    :open="open"
    :title="title"
    max-width="520px"
    @close="emit('close')"
    @submit="handleSubmit"
  >
    <div v-if="summaryLines.length > 0" class="assign-summary">
      <div v-for="line in summaryLines" :key="line.label">
        <strong>{{ line.label }}:</strong> {{ line.value }}
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">
        Kepala Teknisi <span class="text-danger">*</span>
      </label>
      <CustomSelect
        v-model="form.technician_id"
        :options="technicianOptions"
        placeholder="-- Pilih Kepala Teknisi --"
      />
    </div>

    <div class="form-group mt-3">
      <label class="form-label">Anggota Teknisi (Opsional)</label>
      <div v-if="availableMembers.length === 0" class="text-muted" style="font-size: 12px;">
        Tidak ada teknisi lain tersedia.
      </div>
      <div v-else class="member-chips">
        <label
          v-for="t in availableMembers"
          :key="t.value"
          class="member-chip"
          :class="{ 'member-chip--selected': form.member_technician_ids.includes(t.value) }"
        >
          <input
            type="checkbox"
            :value="t.value"
            v-model="form.member_technician_ids"
          />
          <span>{{ t.label }}</span>
        </label>
      </div>
    </div>

    <div class="form-group mt-3">
      <label class="form-label">Tanggal &amp; Waktu Jadwal</label>
      <input
        v-model="form.scheduled_date"
        type="datetime-local"
        class="form-input"
        required
      />
    </div>

    <div v-if="showInstructions" class="form-group mt-3">
      <label class="form-label">
        Instruksi / Catatan untuk Teknisi
        <span v-if="instructionsRequired" class="text-danger">*</span>
      </label>
      <textarea
        v-model="form.instructions"
        class="form-input"
        rows="3"
        placeholder="Catatan / instruksi pekerjaan..."
        :required="instructionsRequired"
      ></textarea>
    </div>

    <template #footer>
      <button
        type="button"
        class="btn btn-outline"
        :disabled="loading"
        @click="emit('close')"
      >
        Batal
      </button>
      <button
        type="button"
        class="btn btn-primary"
        :disabled="loading"
        @click="handleSubmit"
      >
        {{ loading ? "Menyimpan..." : submitLabel }}
      </button>
    </template>
  </FormModal>
</template>

<style scoped>
.assign-summary {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--color-surface-sunken);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.member-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.member-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  background: var(--color-surface, #fff);
  transition: border-color 0.15s ease, background 0.15s ease;
}

.member-chip--selected {
  border-color: var(--color-primary);
  background: rgba(59, 130, 246, 0.08);
  color: var(--color-primary);
  font-weight: 600;
}

.mt-3 {
  margin-top: 0.75rem;
}
</style>
