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
  ],
})

router.beforeEach((to) => {
  const { isAuthenticated } = useAuth()

  if (to.meta.requiresAuth === false) {
    if (isAuthenticated.value) {
      return { name: 'users' }
    }
    return true
  }

  if (!isAuthenticated.value) {
    return { name: 'login' }
  }

  return true
})

export default router
