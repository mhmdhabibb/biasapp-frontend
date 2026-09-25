import { ApiError } from "@/services/api";
import { systemSettingService } from "@/services/systemSetting.service";
import type { SystemSetting } from "@/types";
import { ref } from "vue";

const systemSettings = ref<SystemSetting[]>([]);
const isLoading = ref(false);
const error = ref("");

export function useSystemSettingsStore() {
  async function fetchAll() {
    isLoading.value = true;
    error.value = "";
    try {
      systemSettings.value = (await systemSettingService.list()).data;
    } catch (reason) {
      error.value = reason instanceof ApiError ? reason.message : "Gagal memuat data";
    } finally {
      isLoading.value = false;
    }
  }

  async function create(data: Partial<SystemSetting>) {
    await systemSettingService.create(data);
    await fetchAll();
  }

  async function update(id: string, data: Partial<SystemSetting>) {
    await systemSettingService.update(id, data);
    await fetchAll();
  }

  async function remove(id: string) {
    await systemSettingService.remove(id);
    await fetchAll();
  }

  return { systemSettings, isLoading, error, fetchAll, create, update, remove };
}
