<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from './Sidebar.vue'
import TopBar from './TopBar.vue'

const route = useRoute()
const sidebarOpen = ref(false)

import { useMasterStore } from '@/composables/useMasterStore'
import { onMounted, onUnmounted } from 'vue'

const { refresh } = useMasterStore()
let adminInterval: any = null

onMounted(() => {
  adminInterval = setInterval(() => {
    refresh(true)
  }, 30000)
})

onUnmounted(() => {
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
  }
  return titles[route.path] || 'BIAS App'
})
</script>

<template>
  <div class="admin-layout">
    <Sidebar :open="sidebarOpen" @close="sidebarOpen = false" />

    <div class="admin-main">
      <TopBar :title="pageTitle" @toggle-sidebar="sidebarOpen = !sidebarOpen" />
      <main class="admin-content">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
  background: var(--color-surface-raised);
}

.admin-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

@media (min-width: 769px) {
  .admin-main {
    margin-left: var(--sidebar-width);
  }
}

.admin-content {
  flex: 1;
  padding: var(--space-lg);
}

@media (max-width: 768px) {
  .admin-content {
    padding: var(--space-base);
  }
}
</style>
