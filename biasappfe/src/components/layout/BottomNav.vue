<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const route = useRoute()
const router = useRouter()
const { logout } = useAuth()

function navigate(path: string) {
  router.push(path)
}

function handleLogout() {
  logout()
  router.push('/login')
}
</script>

<template>
  <nav class="bottom-nav">
    <button 
      class="nav-item" 
      :class="{ active: route.path === '/technician/dashboard' }"
      @click="navigate('/technician/dashboard')"
    >
      <svg class="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
      <span class="nav-label">Beranda</span>
    </button>
    
    <button 
      class="nav-item" 
      :class="{ active: route.path.includes('/service-reports') }"
      @click="navigate('/customer-service/service-reports')"
    >
      <svg class="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
      <span class="nav-label">Servis</span>
    </button>

    <button 
      class="nav-item" 
      :class="{ active: route.path.includes('/monthly-meter-readings') }"
      @click="navigate('/customer-service/monthly-meter-readings')"
    >
      <svg class="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
      <span class="nav-label">Meteran</span>
    </button>

    <button 
      class="nav-item" 
      :class="{ active: route.path.includes('/sparepart-requests') }"
      @click="navigate('/accounting/sparepart-requests')"
    >
      <svg class="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
      <span class="nav-label">Sparepart</span>
    </button>

    <button class="nav-item text-danger" @click="handleLogout">
      <svg class="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
      <span class="nav-label">Keluar</span>
    </button>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  background: var(--color-surface, #fff);
  border-top: 1px solid var(--color-border-light, #e2e8f0);
  display: flex;
  justify-content: space-around;
  align-items: center;
  z-index: 50;
  padding-bottom: env(safe-area-inset-bottom);
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 20%;
  height: 100%;
  border: none;
  background: none;
  color: var(--color-text-muted, #94a3b8);
  cursor: pointer;
  transition: color 0.2s;
  -webkit-tap-highlight-color: transparent;
}

.nav-item.active {
  color: var(--color-primary, #3b82f6);
}

.nav-item.text-danger {
  color: var(--color-danger, #ef4444);
  opacity: 0.8;
}

.nav-icon {
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.nav-item:active .nav-icon {
  transform: scale(0.9);
}

.nav-item.active .nav-icon {
  transform: translateY(-2px);
}

.nav-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
</style>
