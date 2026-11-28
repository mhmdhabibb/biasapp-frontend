import { ApiError } from "@/services/api";
import { notificationService } from "@/services/notification.service";
import type { Notification } from "@/types";
import { ref } from "vue";

const notifications = ref<Notification[]>([]);
const isLoading = ref(false);
const error = ref("");
let inflightFetch: Promise<void> | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("bias:auth-logout", () => {
    notifications.value = [];
    error.value = "";
    isLoading.value = false;
  });
}

export function useNotificationsStore() {
  async function fetchAll() {
    if (inflightFetch) return inflightFetch;
    isLoading.value = true;
    error.value = "";
    inflightFetch = (async () => {
      try {
        notifications.value = (await notificationService.list()).data;
      } catch (reason) {
        error.value =
          reason instanceof ApiError ? reason.message : "Failed to load data";
      } finally {
        isLoading.value = false;
        inflightFetch = null;
      }
    })();
    return inflightFetch;
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

  async function clearAll() {
    await notificationService.clearAll();
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
    clearAll,
    markRead,
  };
}
