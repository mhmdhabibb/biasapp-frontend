<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import AdminLayout from './components/layout/AdminLayout.vue'
import ToastHost from './components/ui/ToastHost.vue'
import { useAuth } from './composables/useAuth'

const route = useRoute()
const { isAuthenticated, refreshPermissions } = useAuth()
const isPublicPage = computed(() => route.name === 'login' || route.name === 'verifyPayment')

let permissionRefreshInterval: ReturnType<typeof setInterval> | undefined

function refreshActiveSession() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  if (isAuthenticated.value && document.visibilityState === 'visible') {
    void refreshPermissions()
  }
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
      <transition name="page-fade" mode="out-in">
        <component :is="Component" :key="currentRoute.path" />
      </transition>
    </router-view>
  </AdminLayout>
  <router-view v-else />
  <ToastHost />
</template>

<style>
/* Page Transition - Smooth, Lightweight & GPU-Accelerated */
.page-fade-enter-active {
  transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform;
}

.page-fade-leave-active {
  transition: opacity 0.12s ease-in;
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
