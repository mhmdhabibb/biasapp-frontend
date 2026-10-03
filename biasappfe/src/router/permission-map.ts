// Single source of truth for the `view` permission behind each route.
//
// Semantics (kept in sync with the backend seeder):
//   <key>:view  -> the role may SEE the page (sidebar menu + route access)
//   <key>:read  -> the role may call the API only (no menu, no page)
//
// Routes without an entry are intentionally open to every authenticated role
// that passes the role allowlist in role-access.ts (dashboards, technician
// menus, shared/public detail pages).

export const routePermission: Record<string, string[]> = {
  // Master data
  users: ['user'],
  roles: ['role'],
  permissions: ['permission'],
  modules: ['app_module', 'module'],
  customers: ['customer'],
  technicians: ['technician'],
  suppliers: ['supplier'],
  unitTypes: ['unit_type'],
  brands: ['brand'],
  paperSize: ['paper_size'],
  paperType: ['paper_type'],
productCategories: ['product_category'],
uoms: ['uom'],
products: ['product'],
  units: ['unit'],
  warranties: ['warranty'],
  contracts: ['contract'],
  systemSettings: ['system_setting'],
  notifications: ['notification'],

  // Customer service / transactions
  contractItems: ['contract', 'contract_item'],
  serviceRequests: ['service_request'],
  jobOrders: ['job_order'],
  serviceReports: ['service_report'],
  monthlyMeterReadings: ['monthly_meter_reading'],
  rentals: ['rental'],
  sales: ['sale'],
  rentalInvoices: ['rental_invoice'],
  salesInvoices: ['sales_invoice'],
  payments: ['payment'],
  warrantyClaims: ['warranty_claim'],
  csSparepartRequest: ['service_sparepart'],
  csMonitoringService: ['service_report'],
  csDelivery: ['delivery_order'],

  // Accounting
  accSparepartRequests: ['service_sparepart'],
  accPurchaseOrders: ['purchase_order'],
  accDeliveryOrders: ['delivery_order'],
}

/** Route names in menu order, used to pick a fallback redirect target. */
export const routeNamesByMenuOrder: string[] = [
  'users', 'roles', 'permissions', 'modules', 'customers', 'technicians', 'suppliers',
  'unitTypes', 'brands', 'paperSize', 'paperType', 'productCategories', 'uoms', 'products',
  'units', 'warranties',
  'contractItems', 'serviceRequests', 'jobOrders', 'serviceReports', 'monthlyMeterReadings',
  'rentals', 'sales', 'csSparepartRequest', 'accPurchaseOrders', 'accDeliveryOrders',
  'rentalInvoices', 'salesInvoices', 'payments', 'warrantyClaims',
  'csMonitoringService', 'csDelivery',
]

export function permissionKeysFor(routeName: string | null | undefined): string[] | null {
  if (!routeName) return null
  return routePermission[routeName] ?? null
}

/** True when `permissions` (role permission names) includes `<key>:view` for one of the keys. */
export function canView(routeName: string | null | undefined, permissions: string[]): boolean {
  const keys = permissionKeysFor(routeName)
  if (!keys) return true
  return keys.some(key => permissions.includes(`${key}:view`))
}
