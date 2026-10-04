<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useNotificationsStore } from "@/stores/notifications.store";
import type { Notification } from "@/types";

defineProps<{ title: string; hideHamburger?: boolean }>();
defineEmits<{ (e: "toggle-sidebar"): void }>();

const router = useRouter();
const { notifications, fetchAll, markRead } = useNotificationsStore();
const showNotif = ref(false);
const unreadCount = computed(
  () => notifications.value.filter((item) => !item.is_read).length,
);
let notificationInterval: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  void fetchAll();
  notificationInterval = setInterval(() => void fetchAll(), 10000);
});

onUnmounted(() => {
  if (notificationInterval) clearInterval(notificationInterval);
});

async function openNotification(notification: Notification) {
  showNotif.value = false;
  if (!notification.is_read) {
    try {
      await markRead(String(notification.id));
    } catch (error) {
      console.warn("Failed to mark notification as read:", error);
    }
  }
  if (notification.type === "payment_approval") {
    const match = String(notification.message || "").match(/PAY-[A-Za-z0-9-]+/);
    if (match) {
      await router.push({
        path: "/customer-service/payments",
        query: { payment_no: match[0] },
      });
    } else {
      await router.push("/customer-service/payments");
    }
  }
}
</script>

<template>
  <header class="topbar" :class="{ 'mobile-topbar': hideHamburger }">
    <div class="topbar-left">
      <button
        v-if="!hideHamburger"
        class="topbar-hamburger"
        aria-label="Buka menu"
        @click="$emit('toggle-sidebar')"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <div class="topbar-title-area">
        <h1 class="topbar-title">{{ title }}</h1>
      </div>
    </div>

    <div class="topbar-right">
      <div class="notification-container">
        <button
          class="notification-btn"
          @click="showNotif = !showNotif"
          aria-label="Notifications"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 01-3.46 0"></path>
          </svg>
          <span v-if="unreadCount" class="notification-count">{{
            unreadCount > 9 ? "9+" : unreadCount
          }}</span>
        </button>

        <div v-if="showNotif" class="notif-dropdown">
          <div class="notif-header">
            <h4>Notifications</h4>
          </div>
          <div class="notif-body">
            <div v-if="!notifications.length" class="notif-empty">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                style="color: var(--color-text-muted); margin-bottom: 8px"
              >
                <path
                  d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                ></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="9" y1="15" x2="15" y2="15"></line>
              </svg>
              <p>No new notifications</p>
            </div>
            <button
              v-for="notification in notifications"
              :key="notification.id"
              class="notif-item"
              :class="{ 'notif-item-unread': !notification.is_read }"
              @click="openNotification(notification)"
            >
              <span class="notif-item-title">{{ notification.title }}</span>
              <span class="notif-item-message">{{ notification.message }}</span>
              <time>{{
                new Date(notification.created_at).toLocaleString("id-ID")
              }}</time>
            </button>
          </div>
        </div>
      </div>
    </div>
  </header>

  <div v-if="showNotif" class="notif-overlay" @click="showNotif = false"></div>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--topbar-height);
  padding: 0 var(--space-lg);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border-light);
  position: sticky;
  top: 0;
  z-index: 50;
}

.topbar.mobile-topbar {
  position: relative;
  justify-content: center;
  border-bottom: none;
  background: transparent;
  padding-top: 16px;
}

.topbar.mobile-topbar .topbar-right {
  position: absolute;
  right: var(--space-lg);
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.topbar-hamburger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  transition: background var(--transition-fast);
  background: none;
  border: none;
  cursor: pointer;
}

.topbar-hamburger:hover {
  background: var(--color-surface-sunken);
}

@media (min-width: 769px) {
  .admin-layout:not(.mobile-layout-wrapper) .topbar-hamburger {
    display: none;
  }
}

.topbar-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
  margin: 0;
}

.topbar-right {
  display: flex;
  align-items: center;
}

.notification-container {
  position: relative;
  z-index: 101;
}

.notification-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s;
}

.notification-count {
  position: absolute;
  top: 0;
  right: -3px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 9px;
  background: var(--color-danger, #c62828);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 17px;
}

.notification-btn:hover {
  background: var(--color-surface-sunken);
  color: var(--color-primary);
}

.notif-dropdown {
  position: absolute;
  top: calc(100% + 12px);
  right: -8px;
  width: 320px;
  max-width: calc(100vw - 32px);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg, 0 10px 25px rgba(0, 0, 0, 0.1));
  overflow: hidden;
  z-index: 101;
}

.notif-header {
  padding: 16px;
  border-bottom: 1px solid var(--color-border-light);
  background: var(--color-surface);
}

.notif-header h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.notif-body {
  max-height: 320px;
  overflow-y: auto;
  background: var(--color-surface-sunken);
}

.notif-empty {
  padding: 40px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--color-text-secondary);
}

.notif-empty p {
  margin: 8px 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.notif-empty small {
  font-size: 12px;
  color: var(--color-text-muted);
}

.notif-item {
  display: grid;
  width: 100%;
  gap: 5px;
  padding: 12px 16px;
  border: 0;
  border-bottom: 1px solid var(--color-border-light);
  background: var(--color-surface);
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
}

.notif-item:hover,
.notif-item-unread {
  background: var(--color-surface-raised);
}

.notif-item-title {
  font-size: 13px;
  font-weight: 700;
}

.notif-item-message,
.notif-item time {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.notif-item time {
  color: var(--color-text-muted);
  font-size: 11px;
}

.notif-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
}
</style>
