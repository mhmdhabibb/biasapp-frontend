<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  modelValue: string;
  min?: string;
  max?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

const parsed = computed(() => {
  const raw = String(props.modelValue || "");
  const [datePart = "", timePart = ""] = raw.split("T");
  const [hh = "09", mm = "00"] = timePart.split(":");
  return {
    date: datePart,
    hour: hours.includes(hh.slice(0, 2)) ? hh.slice(0, 2) : "09",
    minute: minutes.includes(mm.slice(0, 2)) ? mm.slice(0, 2) : "00",
  };
});

const minDate = computed(() => (props.min ? props.min.split("T")[0] : undefined));
const maxDate = computed(() => (props.max ? props.max.split("T")[0] : undefined));

function updatePart(part: "date" | "hour" | "minute", val: string) {
  const next = { ...parsed.value, [part]: val };
  if (!next.date) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    next.date = `${y}-${m}-${d}`;
  }
  emit("update:modelValue", `${next.date}T${next.hour}:${next.minute}`);
}
</script>

<template>
  <div style="display: flex; gap: 8px; align-items: center;">
    <input
      type="date"
      class="form-input"
      style="flex: 1;"
      :value="parsed.date"
      :min="minDate"
      :max="maxDate"
      @input="updatePart('date', ($event.target as HTMLInputElement).value)"
    />
    <div style="display: flex; align-items: center; gap: 4px;">
      <select
        class="form-input"
        style="width: 68px; text-align: center; padding-left: 6px; padding-right: 6px;"
        aria-label="Jam (24 jam)"
        :value="parsed.hour"
        @change="updatePart('hour', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="h in hours" :key="h" :value="h">{{ h }}</option>
      </select>
      <span style="font-weight: 600; color: var(--color-text-muted);">:</span>
      <select
        class="form-input"
        style="width: 68px; text-align: center; padding-left: 6px; padding-right: 6px;"
        aria-label="Menit"
        :value="parsed.minute"
        @change="updatePart('minute', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="m in minutes" :key="m" :value="m">{{ m }}</option>
      </select>
    </div>
  </div>
</template>
