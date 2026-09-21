import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/pages/LoginPage.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/',
      redirect: '/master/users',
    },
    {
      path: '/master/users',
      name: 'users',
      component: () => import('@/pages/master/UsersPage.vue'),
    },
    {
      path: '/master/roles',
      name: 'roles',
      component: () => import('@/pages/master/RolesPage.vue'),
    },
    {
      path: '/master/permissions',
      name: 'permissions',
      component: () => import('@/pages/master/PermissionsPage.vue'),
    },
    {
      path: '/master/modules',
      name: 'modules',
      component: () => import('@/pages/master/ModulesPage.vue'),
    },
    {
      path: '/master/customers',
      name: 'customers',
      component: () => import('@/pages/master/CustomersPage.vue'),
    },
    {
      path: '/master/technicians',
      name: 'technicians',
      component: () => import('@/pages/master/TechniciansPage.vue'),
    },
    {
      path: '/master/unit-types',
      name: 'unitTypes',
      component: () => import('@/pages/master/UnitTypesPage.vue'),
    },
    {
      path: '/master/brands',
      name: 'brands',
      component: () => import('@/pages/master/BrandsPage.vue'),
    },
    {
      path: '/master/paper-size',
      name: 'paperSize',
      component: () => import('@/pages/master/PaperSizePage.vue'),
    },
    {
      path: '/master/paper-type',
      name: 'paperType',
      component: () => import('@/pages/master/PaperTypePage.vue'),
    },
    {
      path: '/master/product-categories',
      name: 'productCategories',
      component: () => import('@/pages/master/ProductCategoriesPage.vue'),
    },
    {
      path: '/master/products',
      name: 'products',
      component: () => import('@/pages/master/ProductPage.vue'),
    },
    {
      path: '/master/units',
      name: 'units',
      component: () => import('@/pages/master/UnitPage.vue'),
    },
    {
      path: '/master/warranties',
      name: 'warranties',
      component: () => import('@/pages/master/WarrantiesPage.vue'),
    },
    {
      path: '/customer-service/contract-items',
      name: 'contractItems',
      component: () => import('@/pages/customer-service/ContractItemsPage.vue'),
    },
    {
      path: '/customer-service/service-reports',
      name: 'serviceReports',
      component: () => import('@/pages/customer-service/ServiceReportsPage.vue'),
    },
    {
      path: '/customer-service/monthly-meter-readings',
      name: 'monthlyMeterReadings',
      component: () => import('@/pages/customer-service/MonthlyMeterReadingsPage.vue'),
    },
    {
      path: '/customer-service/sales',
      name: 'sales',
      component: () => import('@/pages/customer-service/SalesPage.vue'),
    },
    {
      path: '/customer-service/rental-invoices',
      name: 'rentalInvoices',
      component: () => import('@/pages/customer-service/RentalInvoicesPage.vue'),
    },
    {
      path: '/customer-service/sales-invoices',
      name: 'salesInvoices',
      component: () => import('@/pages/customer-service/SalesInvoicesPage.vue'),
    },
    {
      path: '/customer-service/payments',
      name: 'payments',
      component: () => import('@/pages/customer-service/PaymentsPage.vue'),
    },
    {
      path: '/customer-service/warranty-claims',
      name: 'warrantyClaims',
      component: () => import('@/pages/customer-service/WarrantyClaimsPage.vue'),
    },
  ],
})

router.beforeEach((to) => {
  const { isAuthenticated, currentUser } = useAuth()

  if (to.meta.requiresAuth === false) {
    if (isAuthenticated.value) {
      return { name: currentUser.value?.role === 'customer_service' ? 'contractItems' : 'users' }
    }
    return true
  }

  if (!isAuthenticated.value) {
    return { name: 'login' }
  }

  const role = currentUser.value?.role
  if (role === 'customer_service' && to.path.startsWith('/master')) {
    return { name: 'contractItems' }
  }
  if (role === 'admin' && to.path.startsWith('/customer-service')) {
    return { name: 'users' }
  }

  return true
})

export default router
