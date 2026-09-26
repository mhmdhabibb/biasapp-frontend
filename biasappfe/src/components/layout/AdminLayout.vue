<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from './Sidebar.vue'
import TopBar from './TopBar.vue'
import BottomNav from './BottomNav.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useAuth } from '@/composables/useAuth'

const route = useRoute()
const sidebarOpen = ref(false)

const { refresh } = useMasterStore()
const { currentUser } = useAuth()

let adminInterval: any = null

const isTechnician = computed(() => currentUser.value?.role === 'technician')
const windowWidth = ref(window.innerWidth)

const handleResize = () => {
  windowWidth.value = window.innerWidth
}

const useMobileLayout = computed(() => {
  // Only use mobile app style if it's a technician AND the screen is small (phone/tablet portrait)
  return isTechnician.value && windowWidth.value <= 768
})

onMounted(() => {
  window.addEventListener('resize', handleResize)
  adminInterval = setInterval(() => {
    refresh(true)
  }, 30000)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (adminInterval) clearInterval(adminInterval)
})

const pageTitle = computed(() => {
  const titles: Record<string, string> = {
    '/master/users': 'Users',
    '/master/roles': 'Roles',
    '/master/permissions': 'Permissions',
    '/master/modules': 'Modules',
    '/master/customers': 'Customers',
    '/master/technicians': 'Technicians',
    '/master/unit-types': 'Unit Types',
    '/master/brands': 'Brands',
    '/master/paper-size': 'Paper Size',
    '/master/paper-type': 'Paper Type',
    '/master/product-categories': 'Product Categories',
    '/master/products': 'Products',
    '/master/units': 'Units',
    '/master/warranties': 'Warranties',
    '/customer-service/contract-items': 'Contract Items',
    '/customer-service/service-reports': 'Service Reports',
    '/customer-service/monthly-meter-readings': 'Monthly Meter Readings',
    '/customer-service/sales': 'Sales',
    '/customer-service/rental-invoices': 'Rental Invoices',
    '/customer-service/sales-invoices': 'Sales Invoices',
    '/customer-service/payments': 'Payments',
    '/customer-service/warranty-claims': 'Warranty Claims',
    '/accounting/dashboard': 'Accounting Dashboard',
    '/accounting/sparepart-requests': 'Sparepart Requests (Procurement)',
    '/accounting/purchase-orders': 'Purchase Orders',
    '/accounting/delivery-orders': 'Delivery Orders (Inbound)',
    '/technician/dashboard': 'BIAS Technician'
  }
  return titles[route.path] || 'BIAS App'
})
</script>

<template>
  <div :class="['admin-layout', { 'mobile-layout-wrapper': useMobileLayout }]">
    <!-- Desktop Sidebar: shown unless it's strictly in mobile layout mode -->
    <Sidebar v-if="!useMobileLayout || sidebarOpen" :open="sidebarOpen" @close="sidebarOpen = false" />

    <div class="admin-main" :class="{ 'mobile-app-container': useMobileLayout }">
      <TopBar :title="pageTitle" @toggle-sidebar="sidebarOpen = !sidebarOpen" :hideHamburger="useMobileLayout" />
      <main class="admin-content" :class="{ 'has-bottom-nav': useMobileLayout }">
        <slot />
      </main>
      
      <!-- Mobile Bottom Navigation -->
      <BottomNav v-if="useMobileLayout" />
    </div>
  </div>
</template>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
  background: var(--color-surface-raised, #f8fafc);
}

.admin-layout.mobile-layout-wrapper {
  background: var(--color-surface-raised, #f8fafc); 
}

.admin-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.admin-main.mobile-app-container {
  width: 100%;
  height: 100vh;
  max-height: 100vh;
  position: relative;
  background: var(--color-background, #f1f5f9);
  overflow: hidden;
  flex: none;
}

@media (min-width: 769px) {
  /* Desktop margin for Sidebar */
  .admin-layout:not(.mobile-layout-wrapper) .admin-main {
    margin-left: var(--sidebar-width);
  }
}

.admin-content {
  flex: 1;
  padding: var(--space-lg);
  overflow-y: auto;
}

@media (max-width: 768px) {
  .admin-content {
    padding: var(--space-base);
  }
}

.admin-main.mobile-app-container .admin-content {
  padding: 12px 16px;
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.admin-main.mobile-app-container .admin-content.has-bottom-nav {
  padding-bottom: 80px; 
}
</style>
