<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import router from './router'
import AdminLayout from './components/layout/AdminLayout.vue'
import ToastHost from './components/ui/ToastHost.vue'
import { useAuth } from './composables/useAuth'

const currentRoute = router.currentRoute
const { isAuthenticated, refreshPermissions } = useAuth()
const isPublicPage = computed(() => currentRoute.value.name === 'login' || currentRoute.value.name === 'verifyPayment')

let permissionRefreshInterval: ReturnType<typeof setInterval> | undefined
let lastPermissionRefreshAt = Date.now()
const PERMISSION_REFRESH_MIN_GAP_MS = 25000

function refreshActiveSession() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  if (!isAuthenticated.value || document.visibilityState !== 'visible') return
  // focus + visibilitychange + interval used to fire /auth/me back-to-back;
  // collapse them so the session check never competes with page data.
  if (Date.now() - lastPermissionRefreshAt < PERMISSION_REFRESH_MIN_GAP_MS) return
  lastPermissionRefreshAt = Date.now()
  void refreshPermissions()
}

onMounted(() => {
  permissionRefreshInterval = setInterval(refreshActiveSession, 30000)
  window.addEventListener('focus', refreshActiveSession)
  document.addEventListener('visibilitychange', refreshActiveSession)
})

onUnmounted(() => {
  if (permissionRefreshInterval) clearInterval(permissionRefreshInterval)
  window.removeEventListener('focus', refreshActiveSession)
  document.removeEventListener('visibilitychange', refreshActiveSession)
})
</script>

<template>
  <AdminLayout v-if="!isPublicPage">
    <router-view v-slot="{ Component, route: currentRoute }">
      <component :is="Component" :key="currentRoute.path" />
    </router-view>
  </AdminLayout>
  <router-view v-else />
  <ToastHost />
</template>

<style>
/* Page Transition - Smooth, Lightweight & GPU-Accelerated */
.page-fade-enter-active {
  transition: opacity 0.14s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.14s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform;
}

.page-fade-leave-active {
  transition: opacity 0.06s ease-out;
  will-change: opacity;
}

.page-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.page-fade-leave-to {
  opacity: 0;
}
</style>
