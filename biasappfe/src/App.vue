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
    <router-view v-slot="{ Component }">
      <component :is="Component" />
    </router-view>
  </AdminLayout>
  <router-view v-else />
  <ToastHost />
</template>
