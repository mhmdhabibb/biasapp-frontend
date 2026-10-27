<script setup lang="ts">
import FormModal from "@/components/ui/FormModal.vue";
import { useAuth } from "@/composables/useAuth";
import { useToast } from "@/composables/useToast";
import { allMenuGroups, useNavigationMenu } from "@/composables/useNavigationMenu";
import { api } from "@/services/api";
import { normalizeRole } from "@/router/role-access";
import { reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "close"): void }>();

const route = useRoute();
const router = useRouter();
const { currentUser, logout } = useAuth();
const { t } = useI18n();
const { success: toastSuccess, error: toastError } = useToast();

const { menuGroups, panelName, iconPaths } = useNavigationMenu();

const showPwdModal = ref(false);
const pwdForm = reactive({
  old_password: "",
  new_password: "",
  confirm_password: "",
});
const isSavingPwd = ref(false);

function openPwdModal() {
  pwdForm.old_password = "";
  pwdForm.new_password = "";
  pwdForm.confirm_password = "";
  showPwdModal.value = true;
}

async function submitPwdChange() {
  if (!pwdForm.old_password || !pwdForm.new_password) {
    toastError("Complete Current Password and New Password!.");
    return;
  }
  if (pwdForm.new_password.length < 6) {
    toastError("New Password must be more than 6 characters!.");
    return;
  }
  if (pwdForm.new_password !== pwdForm.confirm_password) {
    toastError("Confirm Password not matching!.");
    return;
  }
  isSavingPwd.value = true;
  try {
    await api.post("/auth/change-password", {
      old_password: pwdForm.old_password,
      new_password: pwdForm.new_password,
    });
    showPwdModal.value = false;
    toastSuccess("Password has been changed!.");
  } catch (err: any) {
    toastError(err?.message || "Failed to change password!.");
  } finally {
    isSavingPwd.value = false;
  }
}

const expandedGroups = ref<Set<string>>(
  new Set(
    allMenuGroups.map((g) => (g.title.includes(".") ? t(g.title) : g.title)),
  ),
);

function toggleGroup(title: string) {
  if (expandedGroups.value.has(title)) {
    expandedGroups.value.delete(title);
  } else {
    expandedGroups.value.add(title);
  }
}

function isActive(itemRoute: string): boolean {
  return route.path === itemRoute;
}

function navigate(itemRoute: string) {
  router.push(itemRoute);
  emit("close");
}

function handleLogout() {
  logout();
  toastSuccess("Logout successful");
  router.push("/login");
}

watch(
  () => route.path,
  (currentPath) => {
    menuGroups.value.forEach((group) => {
      if ((group?.items || []).some((item) => item.route === currentPath)) {
        expandedGroups.value.add(group.title);
      }
    });
    if (window.innerWidth < 769) {
      emit("close");
    }
  },
  { immediate: true },
);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="sidebar-backdrop" @click="emit('close')" />
  </Teleport>

  <aside class="sidebar" :class="{ 'sidebar-open': open }">
    <div class="sidebar-header">
      <img class="sidebar-logo" src="@/assets/bias-logo.png" alt="BIAS" />
      <span class="sidebar-app-name">{{ panelName }}</span>
    </div>

    <nav class="sidebar-nav" aria-label="Main navigation menu">
      <div v-for="group in menuGroups" :key="group.title" class="menu-group">
        <button
          class="menu-group-toggle"
          :aria-expanded="expandedGroups.has(group.title)"
          @click="toggleGroup(group.title)"
        >
          <span class="menu-group-title">{{ group.title }}</span>
          <svg
            class="menu-group-chevron"
            :class="{ 'chevron-open': expandedGroups.has(group.title) }"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <ul v-show="expandedGroups.has(group.title)" class="menu-list">
          <li v-for="item in group.items" :key="item.route">
            <button
              class="menu-item"
              :class="{ 'menu-item-active': isActive(item.route) }"
              @click="navigate(item.route)"
            >
              <svg
                class="menu-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path :d="iconPaths[item.icon] || iconPaths.grid" />
              </svg>
              <span>{{ item.label }}</span>
            </button>
          </li>
        </ul>
      </div>
    </nav>

    <div class="sidebar-footer">
      <div class="sidebar-user">
        <div class="sidebar-user-avatar">
          {{ currentUser?.name?.charAt(0) || "A" }}
        </div>
        <div class="sidebar-user-info">
          <span class="sidebar-user-name">{{
            currentUser?.name || "Admin"
          }}</span>
          <span class="sidebar-user-role">{{
            currentUser?.role
              ? normalizeRole(currentUser.role)
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (c) => c.toUpperCase())
              : "Superadmin"
          }}</span>
        </div>
      </div>
      <button class="btn-logout" title="Change Password" @click="openPwdModal">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0110 0v4"></path>
        </svg>
      </button>
      <button class="btn-logout" title="Logout" @click="handleLogout">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
          />
        </svg>
      </button>
    </div>
  </aside>

  <FormModal
    :open="showPwdModal"
    title="Change Password"
    max-width="420px"
    @close="showPwdModal = false"
    @submit="submitPwdChange"
  >
    <div class="form-group">
      <label class="form-label">Current Password</label>
      <input
        v-model="pwdForm.old_password"
        type="password"
        class="form-input"
        placeholder="Current password"
        autocomplete="current-password"
      />
    </div>
    <div class="form-group">
      <label class="form-label">New Password (min. 6 characters)</label>
      <input
        v-model="pwdForm.new_password"
        type="password"
        class="form-input"
        placeholder="New password"
        autocomplete="new-password"
      />
    </div>
    <div class="form-group">
      <label class="form-label">Confirm New Password</label>
      <input
        v-model="pwdForm.confirm_password"
        type="password"
        class="form-input"
        placeholder="Repeat new password"
        autocomplete="new-password"
      />
    </div>
  </FormModal>
</template>

<style scoped>
.sidebar-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 90;
}

.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: var(--sidebar-width);
  background: var(--color-surface);
  color: var(--color-text);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  z-index: 100;
  transform: translateX(-100%);
  transition: transform var(--transition-slow);
}

.sidebar-open {
  transform: translateX(0);
}

@media (min-width: 769px) {
  .sidebar-backdrop {
    display: none;
  }

  .sidebar {
    transform: translateX(0);
  }
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-lg) var(--space-base);
  border-bottom: 1px solid var(--color-border-light);
}

.sidebar-logo {
  width: 32px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.sidebar-app-name {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-md) 0;
}

.menu-group {
  margin-bottom: var(--space-xs);
}

.menu-group-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--space-sm) var(--space-lg);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  transition: color var(--transition-fast);
}

.menu-group-toggle:hover {
  color: var(--color-text);
}

.menu-group-chevron {
  transition: transform var(--transition-fast);
}

.chevron-open {
  transform: rotate(180deg);
}

.menu-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  width: calc(100% - 32px);
  margin: 2px 16px;
  padding: 8px 16px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  border-radius: var(--radius-full);
  transition:
    background 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    color 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.16s cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  text-align: left;
}

.menu-item:hover {
  background: var(--color-surface-sunken);
  color: var(--color-text);
  transform: translateX(3px);
}

.menu-item:active {
  transform: scale(0.98);
}

.menu-item-active {
  background: var(--color-primary);
  color: #fff;
  font-weight: var(--font-weight-semibold);
  box-shadow: 0 2px 8px rgba(48, 92, 255, 0.25);
  transform: translateX(0);
}

.menu-icon {
  flex-shrink: 0;
  opacity: 0.72;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}

.menu-item:hover .menu-icon {
  opacity: 0.95;
  transform: scale(1.08);
}

.menu-item-active .menu-icon {
  opacity: 1;
  transform: scale(1);
}

.sidebar-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-base);
  border-top: 1px solid var(--color-border-light);
}

.sidebar-user {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  min-width: 0;
}

.sidebar-user-avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: var(--color-primary-surface);
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  flex-shrink: 0;
}

.sidebar-user-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sidebar-user-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-user-role {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.btn-logout {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  transition:
    background var(--transition-fast),
    color var(--transition-fast);
  flex-shrink: 0;
}

.btn-logout:hover {
  background: var(--color-surface-sunken);
  color: var(--color-danger);
}
</style>
