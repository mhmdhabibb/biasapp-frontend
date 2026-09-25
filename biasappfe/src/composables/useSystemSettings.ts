import { useSystemSettingsStore } from "@/stores/systemSettings.store";

export function useSystemSettings() {
  return useSystemSettingsStore();
}
