<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import type { MenuGroup } from '@/types'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const route = useRoute()
const router = useRouter()
const { currentUser, logout } = useAuth()

const menuGroups: MenuGroup[] = [
  {
    title: 'Akses',
    items: [
      { label: 'Users', icon: 'users', route: '/master/users' },
      { label: 'Roles', icon: 'shield', route: '/master/roles' },
      { label: 'Permissions', icon: 'key', route: '/master/permissions' },
      { label: 'Modules', icon: 'grid', route: '/master/modules' },
    ],
  },
  {
    title: 'Pelanggan',
    items: [
      { label: 'Customers', icon: 'building', route: '/master/customers' },
      { label: 'Technicians', icon: 'wrench', route: '/master/technicians' },
    ],
  },
  {
    title: 'Produk',
    items: [
      { label: 'Unit Types', icon: 'layers', route: '/master/unit-types' },
      { label: 'Brands', icon: 'tag', route: '/master/brands' },
      { label: 'Paper Size', icon: 'file', route: '/master/paper-size' },
      { label: 'Paper Type', icon: 'file-text', route: '/master/paper-type' },
      { label: 'Product Categories', icon: 'folder', route: '/master/product-categories' },
      { label: 'Products', icon: 'box', route: '/master/products' },
    ],
  },
  {
    title: 'Inventaris',
    items: [
      { label: 'Units', icon: 'printer', route: '/master/units' },
      { label: 'Warranties', icon: 'shield-check', route: '/master/warranties' },
    ],
  },
]

const expandedGroups = ref<Set<string>>(new Set(menuGroups.map(g => g.title)))

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
  box: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12',
  printer: 'M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z',
  'shield-check': 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="sidebar-backdrop"
      @click="emit('close')"
    />
  </Teleport>

  <aside class="sidebar" :class="{ 'sidebar-open': open }">
    <div class="sidebar-header">
      <div class="sidebar-logo">BIAS</div>
      <span class="sidebar-app-name">Admin Panel</span>
    </div>

    <nav class="sidebar-nav" aria-label="Menu navigasi utama">
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
            <polyline points="6 9 12 15 18 9"/>
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
          {{ currentUser?.name?.charAt(0) || 'A' }}
        </div>
        <div class="sidebar-user-info">
          <span class="sidebar-user-name">{{ currentUser?.name || 'Admin' }}</span>
          <span class="sidebar-user-role">Superadmin</span>
        </div>
      </div>
      <button class="btn-logout" title="Keluar" @click="handleLogout">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
        </svg>
      </button>
    </div>
  </aside>
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
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.5px;
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
