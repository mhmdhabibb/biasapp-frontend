import { ref } from "vue";
import { api } from "@/services/api";

const isDemoMode = ref(false);
const isLoading = ref(false);
let fetched = false;

export function useDemoMode() {
  async function fetchDemoMode(force = false) {
    if (fetched && !force) return;
    isLoading.value = true;
    try {
      const res = await api.get<{ data: { is_demo: boolean } }>("/system-settings/demo-mode");
      isDemoMode.value = !!res?.data?.is_demo;
      fetched = true;
    } catch {
      isDemoMode.value = false;
    } finally {
      isLoading.value = false;
    }
  }

  async function toggleDemoMode(newValue: boolean, pin: string) {
    isLoading.value = true;
    try {
      const res = await api.post<{ data: { is_demo: boolean } }>("/system-settings/demo-mode/toggle", {
        enabled: newValue,
        pin,
      });
      isDemoMode.value = !!res?.data?.is_demo;
      fetched = true;
    } finally {
      isLoading.value = false;
    }
  }

  async function changeDemoPin(currentPin: string, newPin: string) {
    isLoading.value = true;
    try {
      await api.post("/system-settings/demo-mode/change-pin", {
        current_pin: currentPin,
        new_pin: newPin,
      });
    } finally {
      isLoading.value = false;
    }
  }

  return { isDemoMode, isLoading, fetchDemoMode, toggleDemoMode, changeDemoPin };
}
