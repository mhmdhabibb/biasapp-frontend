import { ApiError } from "@/services/api";
import { notificationService } from "@/services/notification.service";
import type { Notification } from "@/types";
import { ref } from "vue";

const notifications = ref<Notification[]>([]);
const isLoading = ref(false);
const error = ref("");

export function useNotificationsStore() {
  async function fetchAll() {
    isLoading.value = true;
    error.value = "";
    try {
      notifications.value = (await notificationService.list()).data;
    } catch (reason) {
      error.value =
        reason instanceof ApiError ? reason.message : "Failed to load data";
    } finally {
      isLoading.value = false;
    }
  }

  async function create(data: Partial<Notification>) {
    await notificationService.create(data);
    await fetchAll();
  }

  async function update(id: string, data: Partial<Notification>) {
    await notificationService.update(id, data);
    await fetchAll();
  }

  async function markRead(id: string) {
    await notificationService.markRead(id);
    const notification = notifications.value.find(
      (item) => String(item.id) === id,
    );
    if (notification) notification.is_read = true;
  }

  async function remove(id: string) {
    await notificationService.remove(id);
    await fetchAll();
  }

  async function hardRemove(id: string) {
    await notificationService.hardRemove(id);
    await fetchAll();
  }

  return {
    notifications,
    isLoading,
    error,
    fetchAll,
    create,
    update,
    remove,
    hardRemove,
    markRead,
  };
}
