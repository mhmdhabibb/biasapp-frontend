<script setup lang="ts">
import FormModal from "@/components/ui/FormModal.vue";
import { useDemoMode } from "@/composables/useDemoMode";
import { useToast } from "@/composables/useToast";
import { ref, watch } from "vue";

const props = defineProps<{
  open: boolean;
  mode?: "toggle" | "change-pin";
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "success"): void;
}>();

const toast = useToast();
const { isDemoMode, toggleDemoMode, changeDemoPin, isLoading } = useDemoMode();

const pin = ref("");
const currentPin = ref("");
const newPin = ref("");
const confirmPin = ref("");
const activeMode = ref<"toggle" | "change-pin">("toggle");

watch(
  () => props.open,
  (val) => {
    if (val) {
      activeMode.value = props.mode || "toggle";
      pin.value = "";
      currentPin.value = "";
      newPin.value = "";
      confirmPin.value = "";
    }
  }
);

async function handleSubmit() {
  if (activeMode.value === "toggle") {
    if (!pin.value.trim()) {
      toast.error("Masukkan PIN keamanan terlebih dahulu.");
      return;
    }
    try {
      const target = !isDemoMode.value;
      await toggleDemoMode(target, pin.value);
      toast.success(
        isDemoMode.value
          ? "🧪 Demo Mode AKTIF — teknisi bisa kerjakan job di tanggal berapapun."
          : "✅ Demo Mode NONAKTIF — kembali mengikuti tanggal assign."
      );
      emit("success");
      emit("close");
    } catch (err: any) {
      toast.error(err?.message || "PIN keamanan salah!");
    }
  } else {
    if (!currentPin.value.trim() || !newPin.value.trim()) {
      toast.error("Lengkapi PIN lama dan PIN baru.");
      return;
    }
    if (newPin.value.trim().length < 4) {
      toast.error("PIN baru minimal 4 karakter.");
      return;
    }
    if (newPin.value !== confirmPin.value) {
      toast.error("Konfirmasi PIN baru tidak cocok.");
      return;
    }
    try {
      await changeDemoPin(currentPin.value, newPin.value);
      toast.success("🔒 PIN keamanan Demo Mode berhasil diubah!");
      emit("close");
    } catch (err: any) {
      toast.error(err?.message || "PIN lama salah!");
    }
  }
}
</script>

<template>
  <FormModal
    :open="open"
    :title="activeMode === 'toggle' ? (isDemoMode ? '🔒 Kunci: Matikan Demo Mode' : '🔒 Kunci: Aktifkan Demo Mode') : '🔑 Ubah PIN Keamanan Demo Mode'"
    max-width="420px"
    :loading="isLoading"
    @close="emit('close')"
    @submit="handleSubmit"
  >
    <template v-if="activeMode === 'toggle'">
      <p style="font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 0.85rem; line-height: 1.45;">
        Tombol Demo Mode dikunci dengan PIN keamanan khusus. Masukkan PIN untuk
        <strong>{{ isDemoMode ? "menonaktifkan" : "mengaktifkan" }}</strong> Demo Mode.
      </p>
      <div class="form-group">
        <label class="form-label">PIN Keamanan Demo Mode <span class="text-danger">*</span></label>
        <input
          v-model="pin"
          type="password"
          class="form-input"
          placeholder="Masukkan PIN keamanan..."
          autocomplete="off"
          autofocus
        />
      </div>
      <div style="margin-top: 0.5rem; text-align: right;">
        <button
          type="button"
          class="btn-link"
          style="background: none; border: none; color: var(--color-primary); font-size: 0.8rem; cursor: pointer; text-decoration: underline;"
          @click="activeMode = 'change-pin'"
        >
          Ubah PIN Keamanan
        </button>
      </div>
    </template>

    <template v-else>
      <div class="form-group">
        <label class="form-label">PIN Lama <span class="text-danger">*</span></label>
        <input v-model="currentPin" type="password" class="form-input" placeholder="Masukkan PIN lama..." autocomplete="off" />
      </div>
      <div class="form-group">
        <label class="form-label">PIN Baru (min. 4 karakter) <span class="text-danger">*</span></label>
        <input v-model="newPin" type="password" class="form-input" placeholder="Masukkan PIN baru..." autocomplete="off" />
      </div>
      <div class="form-group">
        <label class="form-label">Konfirmasi PIN Baru <span class="text-danger">*</span></label>
        <input v-model="confirmPin" type="password" class="form-input" placeholder="Ulangi PIN baru..." autocomplete="off" />
      </div>
      <div style="margin-top: 0.5rem; text-align: right;">
        <button
          type="button"
          style="background: none; border: none; color: var(--color-text-muted); font-size: 0.8rem; cursor: pointer; text-decoration: underline;"
          @click="activeMode = 'toggle'"
        >
          ← Kembali ke Toggle Demo Mode
        </button>
      </div>
    </template>
  </FormModal>
</template>

