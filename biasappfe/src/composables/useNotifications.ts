import { useNotificationsStore } from "@/stores/notifications.store";

export function useNotifications() {
  return useNotificationsStore();
}
