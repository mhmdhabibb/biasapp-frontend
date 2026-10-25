<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useNotificationsStore } from "@/stores/notifications.store";
import type { Notification } from "@/types";
import { useAuth } from "@/composables/useAuth";
import { useNavigationMenu } from "@/composables/useNavigationMenu";
import { useToast } from "@/composables/useToast";

defineProps<{ title: string; hideHamburger?: boolean }>();
defineEmits<{ (e: "toggle-sidebar"): void }>();

const router = useRouter();
const toast = useToast();
const { notifications, fetchAll, markRead, clearAll } = useNotificationsStore();
const { currentUser } = useAuth();
const showNotif = ref(false);

const { accessibleItems, iconPaths } = useNavigationMenu();

const searchQuery = ref("");
const searchInputRef = ref<HTMLInputElement | null>(null);
const searchContainerRef = ref<HTMLElement | null>(null);
const isDropdownOpen = ref(false);
const selectedIndex = ref(0);

const filteredItems = computed(() => {
  if (!searchQuery.value.trim()) {
    return accessibleItems.value;
  }
  const q = searchQuery.value.trim().toLowerCase();
  return accessibleItems.value.filter((entry) => {
    const label = (entry.label || "").toLowerCase();
    const group = (entry.groupTitle || "").toLowerCase();
    const route = (entry.route || "").toLowerCase();
    const raw = (entry.rawLabel || "").toLowerCase().replace(/sidebar\./g, "").replace(/_/g, " ");
    return label.includes(q) || group.includes(q) || route.includes(q) || raw.includes(q);
  });
});

watch(searchQuery, () => {
  selectedIndex.value = 0;
});

function openDropdown() {
  isDropdownOpen.value = true;
}

function closeDropdown() {
  isDropdownOpen.value = false;
  selectedIndex.value = 0;
}

function clearSearch() {
  searchQuery.value = "";
  selectedIndex.value = 0;
}

function selectItem(entry: { route: string }) {
  router.push(entry.route);
  closeDropdown();
  searchQuery.value = "";
  searchInputRef.value?.blur();
}

function handleKeydown(e: KeyboardEvent) {
  if (!isDropdownOpen.value) {
    if (e.key === "ArrowDown" || e.key === "Enter") {
      isDropdownOpen.value = true;
      return;
    }
  }

  const items = filteredItems.value;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (items.length > 0) {
      selectedIndex.value = (selectedIndex.value + 1) % items.length;
      scrollToSelected();
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (items.length > 0) {
      selectedIndex.value = (selectedIndex.value - 1 + items.length) % items.length;
      scrollToSelected();
    }
  } else if (e.key === "Enter") {
    e.preventDefault();
    const target = items[selectedIndex.value] || items[0];
    if (target) {
      selectItem(target);
    }
  } else if (e.key === "Escape") {
    closeDropdown();
    searchInputRef.value?.blur();
  }
}

function scrollToSelected() {
  nextTick(() => {
    const el = document.querySelector(".topbar-search-dropdown .is-selected");
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
}

function handleClickOutside(e: MouseEvent) {
  if (
    searchContainerRef.value &&
    !searchContainerRef.value.contains(e.target as Node)
  ) {
    closeDropdown();
  }
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    searchInputRef.value?.focus();
    searchInputRef.value?.select();
    openDropdown();
  }
}

const filteredNotifications = computed(() => {
  const user = currentUser.value as any;
  const roleName = typeof user?.role === 'string' ? user.role : user?.role?.name;
  if (roleName?.toLowerCase() === 'technician') {
    return notifications.value.filter((n) => {
      const type = String(n.type || '').toLowerCase();
      const title = String(n.title || '').toLowerCase();
      return type.includes('job') || type.includes('delivery') || type.includes('maintenance') || title.includes('job') || title.includes('delivery') || title.includes('maintenance');
    });
  }
  return notifications.value;
});

const unreadCount = computed(
  () => filteredNotifications.value.filter((item) => !item.is_read).length,
);
let notificationInterval: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  void fetchAll();
  notificationInterval = setInterval(() => {
    if (document.visibilityState === "visible") void fetchAll();
  }, 30000);
  window.addEventListener("click", handleClickOutside);
  window.addEventListener("keydown", handleGlobalKeydown);
});

onUnmounted(() => {
  if (notificationInterval) clearInterval(notificationInterval);
  window.removeEventListener("click", handleClickOutside);
  window.removeEventListener("keydown", handleGlobalKeydown);
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

  const type = String(notification.type || "").toLowerCase();
  const title = String(notification.title || "").toLowerCase();
  const msg = String(notification.message || "").toLowerCase();

  if (type === "payment_approval" || msg.includes("pay-") || title.includes("payment")) {
    const match = String(notification.message || "").match(/PAY-[A-Za-z0-9-]+/);
    if (match) {
      await router.push({
        path: "/customer-service/payments",
        query: { payment_no: match[0] },
      });
    } else {
      await router.push("/customer-service/payments");
    }
  } else if (title.includes("stock") || title.includes("product") || msg.includes("stock") || msg.includes("product")) {
    await router.push("/master/products");
  } else if (title.includes("job") || type.includes("job") || msg.includes("job")) {
    await router.push("/customer-service/job-orders");
  } else if (title.includes("delivery") || type.includes("delivery") || msg.includes("delivery")) {
    await router.push("/customer-service/job-orders");
  } else if (title.includes("service request") || type.includes("service_request") || msg.includes("service request")) {
    await router.push("/customer-service/service-requests");
  } else if (title.includes("purchase order") || title.includes("po") || type.includes("purchase_order")) {
    await router.push("/accounting/purchase-orders");
  } else if (title.includes("sparepart") || type.includes("sparepart")) {
    await router.push("/customer-service/sparepart-requests");
  } else if (title.includes("warranty") || type.includes("warranty")) {
    await router.push("/customer-service/warranty-claims");
  } else if (title.includes("rental") || type.includes("rental")) {
    await router.push("/customer-service/rentals");
  } else if (title.includes("sale") || type.includes("sale")) {
    await router.push("/customer-service/sales");
  }
}

async function handleClearAll() {
  if (!confirm("Apakah Anda yakin ingin membersihkan semua notifikasi?")) return;
  try {
    await clearAll();
    toast.success("Semua notifikasi berhasil dibersihkan");
  } catch (err: any) {
    console.error("Gagal membersihkan notifikasi:", err);
    toast.error("Gagal membersihkan notifikasi: " + (err.message || "Error"));
  }
}

async function handleMarkAllAsRead() {
  const unreadItems = filteredNotifications.value.filter((n) => !n.is_read);
  if (unreadItems.length === 0) return;
  try {
    await Promise.all(unreadItems.map((n) => markRead(String(n.id))));
    toast.success("Semua notifikasi telah ditandai dibaca");
  } catch (err: any) {
    console.warn("Gagal menandai notifikasi dibaca:", err);
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

      <!-- Interactive TopBar Module Search with Dropdown -->
      <div v-if="!hideHamburger" class="topbar-search-container" ref="searchContainerRef">
        <div class="topbar-search-input-box" :class="{ 'is-active': isDropdownOpen }">
          <svg
            class="topbar-search-icon"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            class="topbar-search-input"
            placeholder="Cari modul... (Ctrl K)"
            aria-label="Cari modul"
            @focus="openDropdown"
            @keydown="handleKeydown"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="search-clear-btn"
            title="Hapus pencarian (Esc)"
            aria-label="Hapus"
            @click.stop="clearSearch"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <kbd v-else class="topbar-search-kbd">Ctrl K</kbd>
        </div>

        <!-- Floating Dropdown Command Palette -->
        <div v-if="isDropdownOpen" class="topbar-search-dropdown">
          <div class="dropdown-header">
            <span class="dropdown-header-title">
              {{ searchQuery ? `Hasil Pencarian (${filteredItems.length})` : 'Pilih Modul Cepat' }}
            </span>
            <span class="dropdown-header-hint">
              <kbd class="mini-kbd">↑</kbd> <kbd class="mini-kbd">↓</kbd> Navigasi &nbsp;•&nbsp; <kbd class="mini-kbd">↵</kbd> Buka
            </span>
          </div>

          <div v-if="filteredItems.length === 0" class="dropdown-empty">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
            <p class="empty-title">Modul tidak ditemukan</p>
            <p class="empty-desc">Tidak ada modul yang cocok atau role Anda tidak memiliki hak akses.</p>
          </div>

          <ul v-else class="dropdown-list">
            <li
              v-for="(entry, idx) in filteredItems"
              :key="entry.route"
              class="dropdown-item"
              :class="{ 'is-selected': idx === selectedIndex }"
              @mouseenter="selectedIndex = idx"
              @click="selectItem(entry)"
            >
              <div class="item-icon-wrapper">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path :d="iconPaths[entry.icon] || iconPaths.grid" />
                </svg>
              </div>
              <div class="item-info">
                <span class="item-label">{{ entry.label }}</span>
                <span class="item-badge">{{ entry.groupTitle }}</span>
              </div>
              <span v-if="idx === selectedIndex" class="item-enter-hint">↵ Enter</span>
            </li>
          </ul>
        </div>
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
          <div class="notif-header" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid var(--color-border-light);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <h4 style="margin: 0; font-size: 14px; font-weight: 600;">Notifications</h4>
              <span v-if="unreadCount" class="badge" style="background: var(--color-primary, #3b82f6); color: #fff; font-size: 10px; padding: 1px 6px; border-radius: 10px;">{{ unreadCount }} baru</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <button
                v-if="unreadCount > 0"
                type="button"
                @click.stop="handleMarkAllAsRead"
                style="padding: 2px 6px; font-size: 11px; border: none; background: transparent; color: var(--color-primary); cursor: pointer; text-decoration: underline;"
                title="Tandai semua sudah dibaca"
              >
                Tandai dibaca
              </button>
              <button
                v-if="filteredNotifications.length"
                type="button"
                class="text-danger"
                @click.stop="handleClearAll"
                style="padding: 2px 6px; font-size: 11px; border: none; background: transparent; cursor: pointer; text-decoration: underline;"
                title="Hapus semua notifikasi"
              >
                Clear All
              </button>
            </div>
          </div>
          <div class="notif-body">
            <div v-if="!filteredNotifications.length" class="notif-empty">
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="9" y1="15" x2="15" y2="15"></line>
              </svg>
              <p>No new notifications</p>
            </div>
            <button
              v-for="notification in filteredNotifications"
              :key="notification.id"
              class="notif-item"
              :class="{ 'notif-item-unread': !notification.is_read }"
              @click="openNotification(notification)"
            >
              <div class="notif-icon-wrapper" style="background: rgba(var(--color-primary-rgb, 59, 130, 246), 0.1); color: var(--color-primary); padding: 8px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 01-3.46 0"></path>
                </svg>
              </div>
              <div class="notif-content" style="flex: 1; min-width: 0; text-align: left; display: flex; flex-direction: column; gap: 2px;">
                <span class="notif-item-title" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ notification.title }}</span>
                <span class="notif-item-message" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">{{ notification.message }}</span>
                <time style="margin-top: 4px;">{{ new Date(notification.created_at).toLocaleString("id-ID") }}</time>
              </div>
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

.topbar-search-container {
  position: relative;
  margin-left: var(--space-md);
  width: 250px;
}

@media (min-width: 1024px) {
  .topbar-search-container {
    width: 320px;
  }
}

.topbar-search-input-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  padding: 0 10px;
  height: 36px;
  transition: all var(--transition-fast);
}

.topbar-search-input-box:hover {
  background: var(--color-surface);
  border-color: #cbd5e1;
}

.topbar-search-input-box.is-active,
.topbar-search-input-box:focus-within {
  background: var(--color-surface);
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(48, 92, 255, 0.12);
}

.topbar-search-icon {
  color: var(--color-text-muted);
  flex-shrink: 0;
  transition: color var(--transition-fast);
}

.topbar-search-input-box.is-active .topbar-search-icon,
.topbar-search-input-box:focus-within .topbar-search-icon {
  color: var(--color-primary);
}

.topbar-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
  font-size: 12.5px;
  color: var(--color-text);
  font-family: inherit;
}

.topbar-search-input::placeholder {
  color: var(--color-text-muted);
  font-size: 12px;
}

.topbar-search-kbd {
  font-size: 10px;
  font-weight: 700;
  color: var(--color-text-muted);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 2px 5px;
  line-height: 1;
  flex-shrink: 0;
  pointer-events: none;
}

.search-clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  background: var(--color-surface-sunken);
  color: var(--color-text-secondary);
  border: none;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: all var(--transition-fast);
}

.search-clear-btn:hover {
  background: var(--color-border);
  color: var(--color-text);
}

/* Floating Dropdown Command Palette */
.topbar-search-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  width: 360px;
  max-width: 90vw;
  max-height: 420px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
  z-index: 200;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: dropdownFadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes dropdownFadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.dropdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--color-surface-raised);
  border-bottom: 1px solid var(--color-border-light);
  font-size: 11px;
}

.dropdown-header-title {
  font-weight: 600;
  color: var(--color-text-secondary);
}

.dropdown-header-hint {
  color: var(--color-text-muted);
  font-size: 10px;
}

.mini-kbd {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  padding: 1px 4px;
  font-size: 9px;
  font-weight: 700;
}

.dropdown-list {
  list-style: none;
  padding: 6px;
  margin: 0;
  overflow-y: auto;
  max-height: 360px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.dropdown-item.is-selected {
  background: var(--color-primary-surface);
  color: var(--color-primary);
}

.item-icon-wrapper {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  flex-shrink: 0;
  transition: all var(--transition-fast);
}

.dropdown-item.is-selected .item-icon-wrapper {
  background: var(--color-primary);
  color: #fff;
}

.item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.item-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-item.is-selected .item-label {
  color: var(--color-primary);
}

.item-badge {
  font-size: 10.5px;
  color: var(--color-text-muted);
}

.item-enter-hint {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-primary);
  background: rgba(48, 92, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
}

.dropdown-empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--color-text-muted);
}

.dropdown-empty svg {
  margin-bottom: 6px;
  opacity: 0.7;
}

.dropdown-empty .empty-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 2px;
}

.dropdown-empty .empty-desc {
  font-size: 11.5px;
  color: var(--color-text-muted);
}

@media (max-width: 640px) {
  .topbar-search-container {
    display: none;
  }
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
  max-height: calc(100vh - 100px);
  display: flex;
  flex-direction: column;
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
  flex-shrink: 0;
}

.notif-header h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.notif-body {
  max-height: 400px;
  overflow-y: auto;
  background: var(--color-surface-sunken);
  flex-grow: 1;
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
  display: flex;
  align-items: flex-start;
  width: 100%;
  gap: 12px;
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
