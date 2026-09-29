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
      path: '/master/suppliers',
      name: 'suppliers',
      component: () => import('@/pages/master/SuppliersPage.vue'),
    },
    {
      path: '/master/contracts',
      name: 'contracts',
      component: () => import('@/pages/master/ContractsPage.vue'),
    },
    {
      path: '/master/system-settings',
      name: 'systemSettings',
      component: () => import('@/pages/master/SystemSettingsPage.vue'),
    },
    {
      path: '/master/notifications',
      name: 'notifications',
      component: () => import('@/pages/master/NotificationsPage.vue'),
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
      path: '/customer-service/service-requests',
      name: 'serviceRequests',
      component: () => import('@/pages/customer-service/ServiceRequestsPage.vue'),
    },
    {
      path: '/customer-service/job-orders',
      name: 'jobOrders',
      component: () => import('@/pages/customer-service/JobOrdersPage.vue'),
    },
    {
      path: '/customer-service/monthly-meter-readings',
      name: 'monthlyMeterReadings',
      component: () => import('@/pages/customer-service/MonthlyMeterReadingsPage.vue'),
    },
    {
      path: '/customer-service/rentals',
      name: 'rentals',
      component: () => import('@/pages/customer-service/RentalsPage.vue'),
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
    {
      path: '/customer-service/dashboard',
      name: 'csDashboard',
      component: () => import('@/pages/customer-service/CSDashboardPage.vue'),
    },
    {
      path: '/customer-service/call-service',
      name: 'csCallService',
      component: () => import('@/pages/customer-service/CallServicePage.vue'),
    },
    {
      path: '/customer-service/monitoring-service',
      name: 'csMonitoringService',
      component: () => import('@/pages/customer-service/MonitoringServicePage.vue'),
    },
    {
      path: '/customer-service/sparepart-request',
      name: 'csSparepartRequest',
      component: () => import('@/pages/customer-service/SparepartRequestPage.vue'),
    },
    {
      path: '/customer-service/indent',
      name: 'csIndent',
      component: () => import('@/pages/customer-service/IndentPage.vue'),
    },
    {
      path: '/customer-service/delivery',
      name: 'csDelivery',
      component: () => import('@/pages/customer-service/DeliveryMonitoringPage.vue'),
    },
    {
      path: '/customer-service/reports',
      name: 'csReports',
      component: () => import('@/pages/customer-service/CSReportsPage.vue'),
    },
    // Accounting Routes
    {
      path: '/accounting/dashboard',
      name: 'accDashboard',
      component: () => import('@/pages/accounting/AccDashboardPage.vue'),
    },
    {
      path: '/accounting/sparepart-requests',
      name: 'accSparepartRequests',
      component: () => import('@/pages/accounting/AccSparepartRequestsPage.vue'),
    },
    {
      path: '/accounting/purchase-orders',
      name: 'accPurchaseOrders',
      component: () => import('@/pages/accounting/AccPurchaseOrdersPage.vue'),
    },
    {
      path: '/accounting/delivery-orders',
      name: 'accDeliveryOrders',
      component: () => import('@/pages/accounting/AccDeliveryOrdersPage.vue'),
    },
    // Technician Routes
    {
      path: '/technician/dashboard',
      name: 'techDashboard',
      component: () => import('@/pages/technician/TechDashboardPage.vue'),
    },
    {
      path: '/technician/call-services',
      name: 'techCallServices',
      component: () => import('@/pages/technician/TechCallServicesPage.vue'),
    },
    {
      path: '/technician/call-services/:id',
      name: 'techCallServiceDetail',
      component: () => import('@/pages/technician/TechCallServiceDetailPage.vue'),
    },
    {
      path: '/technician/maintenance',
      name: 'techMaintenance',
      component: () => import('@/pages/technician/TechMaintenancePage.vue'),
    },
    {
      path: '/technician/sparepart-request',
      name: 'techSparepartRequest',
      component: () => import('@/pages/technician/TechSparepartRequestPage.vue'),
    },
    {
      path: '/technician/meter-readings',
      name: 'techMeterReadings',
      component: () => import('@/pages/technician/TechMeterReadingsPage.vue'),
    },
    {
      path: '/technician/service-history',
      name: 'techServiceHistory',
      component: () => import('@/pages/technician/TechServiceHistoryPage.vue'),
    },
  ],
})

router.beforeEach((to) => {
  const { isAuthenticated, currentUser } = useAuth()

  if (to.meta.requiresAuth === false) {
    if (isAuthenticated.value) {
      const role = currentUser.value?.role
      if (role === 'customer_service') return { name: 'csDashboard' }
      if (role === 'technician') return { name: 'techDashboard' }
      if (role === 'accounting') return { name: 'accDashboard' }
      return { name: 'users' }
    }
    return true
  }

  if (!isAuthenticated.value) {
    return { name: 'login' }
  }

  const role = currentUser.value?.role
  
  // CS Authorization
  if (role === 'customer_service') {
    const allowedForCS = [
      'csDashboard', 'customers', 'contractItems', 'units', 'csCallService', 
      'csMonitoringService', 'csSparepartRequest', 'csIndent', 'csDelivery', 
      'warrantyClaims', 'rentalInvoices', 'csReports', 'rentals',
      'serviceRequests', 'jobOrders'
    ]
    if (to.name && !allowedForCS.includes(to.name as string)) {
      return { name: 'csDashboard' }
    }
  }
  // Admin can access everything
  if (role === 'technician') {
    const allowedForTechnician = [
      'techDashboard', 'techCallServices', 'techCallServiceDetail', 'techMaintenance', 
      'techSparepartRequest', 'techMeterReadings', 'techServiceHistory', 
      'units', 'customers'
    ]
    if (to.name && !allowedForTechnician.includes(to.name as string)) {
      return { name: 'techDashboard' }
    }
  }
  if (role === 'accounting') {
    const allowedForAccounting = [
      'accDashboard', 'accSparepartRequests', 'accPurchaseOrders', 'accDeliveryOrders'
    ]
    if (to.name && !allowedForAccounting.includes(to.name as string)) {
      return { name: 'accDashboard' }
    }
  }

  return true
})

export default router
