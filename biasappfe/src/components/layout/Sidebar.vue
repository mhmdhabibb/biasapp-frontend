<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useModules } from '@/composables/useModules'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import FormModal from '@/components/ui/FormModal.vue'
import type { MenuGroup } from '@/types'
import { dashboardRouteByRole, dashboardRouteNames, normalizeRole } from '@/router/role-access'
import { canView, permissionKeysFor } from '@/router/permission-map'

const moduleKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, '_')

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const route = useRoute()
const router = useRouter()
const { currentUser, logout } = useAuth()
const { modules } = useModules()
const { t } = useI18n()
const { success: toastSuccess, error: toastError } = useToast()

const showPwdModal = ref(false)
const pwdForm = reactive({ old_password: '', new_password: '', confirm_password: '' })
const isSavingPwd = ref(false)

function openPwdModal() {
  pwdForm.old_password = ''
  pwdForm.new_password = ''
  pwdForm.confirm_password = ''
  showPwdModal.value = true
}

async function submitPwdChange() {
  if (!pwdForm.old_password || !pwdForm.new_password) {
    toastError('Complete Current Password and New Password!.')
    return
  }
  if (pwdForm.new_password.length < 6) {
    toastError('New Password must be more than 6 characters!.')
    return
  }
  if (pwdForm.new_password !== pwdForm.confirm_password) {
    toastError('Confirm Password not matching!.')
    return
  }
  isSavingPwd.value = true
  try {
    await api.post('/auth/change-password', {
      old_password: pwdForm.old_password,
      new_password: pwdForm.new_password,
    })
    showPwdModal.value = false
    toastSuccess('Password has been changed!.')
  } catch (err: any) {
    toastError(err?.message || 'Failed to change password!.')
  } finally {
    isSavingPwd.value = false
  }
}

const allMenuGroups: MenuGroup[] = [
  {
    title: 'sidebar.master_data',
    items: [
      { label: 'sidebar.users', icon: 'users', route: '/master/users' },
      { label: 'sidebar.roles', icon: 'shield', route: '/master/roles' },
      { label: 'sidebar.permissions', icon: 'key', route: '/master/permissions' },
      { label: 'sidebar.modules', icon: 'grid', route: '/master/modules' },
      { label: 'sidebar.customers', icon: 'building', route: '/master/customers' },
      // { label: 'sidebar.technicians', icon: 'wrench', route: '/master/technicians' },
      // { label: 'sidebar.suppliers', icon: 'truck', route: '/master/suppliers' },
      { label: 'sidebar.unit_types', icon: 'layers', route: '/master/unit-types' },
      { label: 'sidebar.brands', icon: 'tag', route: '/master/brands' },
      { label: 'sidebar.paper_size', icon: 'file', route: '/master/paper-size' },
      { label: 'sidebar.paper_type', icon: 'file-text', route: '/master/paper-type' },
      { label: 'sidebar.product_categories', icon: 'folder', route: '/master/product-categories' },
      { label: 'sidebar.uoms', icon: 'ruler', route: '/master/uoms' },
      { label: 'sidebar.products', icon: 'box', route: '/master/products' },
      { label: 'sidebar.units', icon: 'printer', route: '/master/units' },
      { label: 'sidebar.warranties', icon: 'shield-check', route: '/master/warranties' },
      { label: 'sidebar.excel_templates', icon: 'upload', route: '/master/excel-templates', roles: ['admin'] },
    ],
  },
  {
    title: 'sidebar.transaction',
    items: [
      { label: 'sidebar.contract_items', icon: 'clipboard', route: '/customer-service/contract-items' },
      { label: 'sidebar.service_requests', icon: 'alert-circle', route: '/customer-service/service-requests' },
      { label: 'sidebar.job_orders', icon: 'clipboard', route: '/customer-service/job-orders' },
      { label: 'sidebar.service_reports', icon: 'tool', route: '/customer-service/service-reports' },
      { label: 'sidebar.copier_reports', icon: 'file-text', route: '/customer-service/copier-reports' },
      { label: 'sidebar.meter_readings', icon: 'activity', route: '/customer-service/monthly-meter-readings' },
      { label: 'sidebar.rentals', icon: 'box', route: '/customer-service/rentals' },
      { label: 'sidebar.sales', icon: 'shopping-cart', route: '/customer-service/sales' },
      { label: 'sidebar.purchase_orders', icon: 'clipboard', route: '/accounting/purchase-orders' },
      { label: 'sidebar.delivery_orders', icon: 'truck', route: '/accounting/delivery-orders' },
      { label: 'sidebar.rental_invoices', icon: 'file-invoice', route: '/customer-service/rental-invoices' },
      { label: 'sidebar.sales_invoices', icon: 'receipt', route: '/customer-service/sales-invoices' },
      { label: 'sidebar.payments', icon: 'credit-card', route: '/customer-service/payments' },
      { label: 'sidebar.warranty_claims', icon: 'alert-circle', route: '/customer-service/warranty-claims' },
    ],
  },
  {
    title: 'sidebar.monitoring',
    items: [
      { label: 'sidebar.cs_dashboard', icon: 'grid', route: '/customer-service/dashboard' },
      { label: 'sidebar.tech_dashboard', icon: 'grid', route: '/technician/dashboard' },
      { label: 'sidebar.acc_dashboard', icon: 'grid', route: '/accounting/dashboard' },
      { label: 'sidebar.monitoring_service', icon: 'activity', route: '/customer-service/monitoring-service' },
      { label: 'sidebar.delivery_monitoring', icon: 'truck', route: '/customer-service/delivery' },
    ],
  },
  {
    title: 'sidebar.technician_menu',
    items: [
      { label: 'sidebar.my_jobs', icon: 'tool', route: '/technician/call-services', roles: ['technician'] },
      { label: 'sidebar.maintenance', icon: 'wrench', route: '/technician/maintenance', roles: ['technician'] },
      { label: 'sidebar.service_history', icon: 'file-text', route: '/technician/service-history', roles: ['technician'] },
    ],
  }
]

const menuGroups = computed(() => {
  const role = normalizeRole(currentUser.value?.role)

  const groups: MenuGroup[] = JSON.parse(JSON.stringify(allMenuGroups))

  // Filter dynamically based on role route access, permissions and active database modules
  return groups.map(group => ({
    ...group,
    title: group.title.includes('.') ? t(group.title) : group.title,
    items: group.items.filter(item => {
      // 1. Superadmin (admin) sees everything
      if (role === 'admin') return true

      // 2. Role-restricted items (technician menu): role decides, no module/permission checks
      if (item.roles) return item.roles.includes(role)

      const routeName = String(router.resolve(item.route).name || '')
      const permissions = currentUser.value?.permissions || []

      // 3. Dashboards are pinned: each built-in role keeps its own dashboard.
      //    Custom roles (no pin) keep seeing dashboards, as before.
      if (dashboardRouteNames.includes(routeName)) {
        const own = dashboardRouteByRole[role]
        return own ? routeName === own : true
      }

      // 4. Everything else is dynamic: visibility follows the role's live
      //    `<key>:view` permissions (see router/permission-map.ts).
      //    `read` alone never opens a menu.
      if (!canView(routeName, permissions)) return false

      // Respect a deactivated module that owns this permission key.
      // Module names are display names ("Job Order") while permission keys use
      // snake_case ("job_order"), so normalize before comparing.
      const permKeys = permissionKeysFor(routeName) || []
      const matches = modules.value.filter(m => permKeys.includes(moduleKey(String(m.name))))
      if (matches.length > 0 && !matches.some(m => m.is_active)) return false

      return true
    }).map(item => ({
      ...item,
      label: item.label.includes('.') ? t(item.label) : item.label
    }))
  })).filter(group => group.items.length > 0)
})

const panelName = computed(() => {
  const role = normalizeRole(currentUser.value?.role)
  switch (role) {
    case 'admin': return 'Admin Panel'
    case 'customer_service': return 'CS Panel'
    case 'accounting': return 'Accounting Panel'
    case 'technician': return 'Technician Panel'
    default: return 'BIAS Panel'
  }
})

const expandedGroups = ref<Set<string>>(new Set(allMenuGroups.map(g => g.title.includes('.') ? t(g.title) : g.title)))

function toggleGroup(title: string) {
  if (expandedGroups.value.has(title)) {
    expandedGroups.value.delete(title)
  } else {
    expandedGroups.value.add(title)
  }
}

function isActive(itemRoute: string): boolean {
  return route.path === itemRoute
}

function navigate(itemRoute: string) {
  router.push(itemRoute)
  emit('close')
}

function handleLogout() {
  logout()
  toastSuccess('Logout successful')
  router.push('/login')
}

watch(() => route.path, () => {
  if (window.innerWidth < 769) {
    emit('close')
  }
})

const iconPaths: Record<string, string> = {
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8m13 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  key: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  building: 'M3 21h18M3 7v14M21 7v14M6 11h.01M6 15h.01M6 19h.01M10 11h.01M10 15h.01M10 19h.01M14 11h.01M14 15h.01M14 19h.01M18 11h.01M18 15h.01M18 19h.01M3 7l9-4 9 4',
  wrench: 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
  layers: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  tag: 'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01',
  file: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6',
  'file-text': 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  folder: 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
  ruler: 'M3 17h18v-2H3v2zM3 7h18v2H3V7zm2 4v-2H4v2h1zm2 0v-2H6v2h1zm2 0v-2H8v2h1zm2 0v-2h-1v2h1zm2 0v-2h-1v2h1zm2 0v-2h-1v2h1zm2 0v-2h-1v2h1zm2 0v-2h-1v2h1zm-12 6v-2H2v2h1zm2 0v-2H4v2h1zm2 0v-2H6v2h1zm2 0v-2H8v2h1zm2 0v-2h-1v2h1zm2 0v-2h-1v2h1zm2 0v-2h-1v2h1zm2 0v-2h-1v2h1z',
  box: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12',
  printer: 'M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z',
  'shield-check': 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
  clipboard: 'M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2 M9 2h6a1 1 0 011 1v1a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1z',
  tool: 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  'shopping-cart': 'M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6 M9 22a1 1 0 100-2 1 1 0 000 2z M20 22a1 1 0 100-2 1 1 0 000 2z',
  'file-invoice': 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M8 13h8 M8 17h8 M8 9h2',
  receipt: 'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z M8 10h8 M8 14h4',
  'credit-card': 'M1 4h22v16H1z M1 10h22',
  'alert-circle': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 8v4 M12 16h.01',
  'truck': 'M1 3h15v13H1z M16 8h4l3 3v5h-7z M5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z M18.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  'settings': 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M12 8v4 M12 16h.01',
  'bell': 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0',
  upload: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3',
}
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
        <button class="menu-group-toggle" :aria-expanded="expandedGroups.has(group.title)"
          @click="toggleGroup(group.title)">
          <span class="menu-group-title">{{ group.title }}</span>
          <svg class="menu-group-chevron" :class="{ 'chevron-open': expandedGroups.has(group.title) }" width="14"
            height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <ul v-show="expandedGroups.has(group.title)" class="menu-list">
          <li v-for="item in group.items" :key="item.route">
            <button class="menu-item" :class="{ 'menu-item-active': isActive(item.route) }"
              @click="navigate(item.route)">
              <svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
          {{ currentUser?.name?.charAt(0) || 'A' }}
        </div>
        <div class="sidebar-user-info">
          <span class="sidebar-user-name">{{ currentUser?.name || 'Admin' }}</span>
          <span class="sidebar-user-role">{{
            currentUser?.role ? normalizeRole(currentUser.role).replace(/_/g, ' ').replace(/\b\w/g, c =>
              c.toUpperCase()) : 'Superadmin'
          }}</span>
        </div>
      </div>
      <button class="btn-logout" title="Ubah Password" @click="openPwdModal">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0110 0v4"></path>
        </svg>
      </button>
      <button class="btn-logout" title="Logout" @click="handleLogout">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
      </button>
    </div>
  </aside>

  <FormModal :open="showPwdModal" title="Ubah Password" max-width="420px" @close="showPwdModal = false"
    @submit="submitPwdChange">
    <div class="form-group">
      <label class="form-label">Password Lama</label>
      <input v-model="pwdForm.old_password" type="password" class="form-input" placeholder="Password saat ini"
        autocomplete="current-password">
    </div>
    <div class="form-group">
      <label class="form-label">Password Baru (min. 6 karakter)</label>
      <input v-model="pwdForm.new_password" type="password" class="form-input" placeholder="Password baru"
        autocomplete="new-password">
    </div>
    <div class="form-group">
      <label class="form-label">Konfirmasi Password Baru</label>
      <input v-model="pwdForm.confirm_password" type="password" class="form-input" placeholder="Ulangi password baru"
        autocomplete="new-password">
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
  transition: background var(--transition-fast), color var(--transition-fast);
  text-align: left;
}

.menu-item:hover {
  background: var(--color-surface-sunken);
  color: var(--color-text);
}

.menu-item-active {
  background: var(--color-primary);
  color: #fff;
  font-weight: var(--font-weight-semibold);
}

.menu-icon {
  flex-shrink: 0;
  opacity: 0.72;
}

.menu-item-active .menu-icon {
  opacity: 1;
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
  transition: background var(--transition-fast), color var(--transition-fast);
  flex-shrink: 0;
}

.btn-logout:hover {
  background: var(--color-surface-sunken);
  color: var(--color-danger);
}
</style>