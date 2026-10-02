// Single source of truth for which route names each built-in role may access.
// Used by BOTH the router guard (index.ts) and Sidebar.vue so they never drift apart.
// Keep in sync when adding routes.
export const allowedRouteNamesByRole: Record<string, string[]> = {
  customer_service: [
<<<<<<< HEAD
    "csDashboard",
    "customers",
    "contractItems",
    "units",
    "csCallService",
    "csMonitoringService",
    "csSparepartRequest",
    "csIndent",
    "csDelivery",
    "warrantyClaims",
    "rentalInvoices",
    "csReports",
    "rentals",
    "serviceRequests",
    "jobOrders",
    "sharedServiceReportView",
  ],
  technician: [
    "techDashboard",
    "techCallServices",
    "techCallServiceDetail",
    "techMaintenance",
    "techSparepartRequest",
    "techMeterReadings",
    "techServiceHistory",
    "techFormServiceReport",
    "techFormTechnicalReport",
    "techFormCopierReport",
    "sharedServiceReportView",
=======
    'csDashboard', 'customers', 'contractItems', 'units', 'csCallService',
    'csMonitoringService', 'csSparepartRequest', 'csIndent', 'csDelivery',
    'warrantyClaims', 'rentalInvoices', 'rentals',
    'serviceRequests', 'jobOrders', 'sharedServiceReportView',
  ],
  technician: [
    'techDashboard', 'techCallServices', 'techCallServiceDetail', 'techMaintenance',
    'techSparepartRequest', 'techMeterReadings', 'techServiceHistory',
    'techFormServiceReport', 'techFormTechnicalReport', 'techFormCopierReport',
    'sharedServiceReportView',
>>>>>>> 00e1fed6140254ec55582557c6aa0a22dde427a2
    // No master-data routes: technicians only consume master APIs (dropdowns/lookups)
    // through useMasterStore — they must never open /master/* pages.
  ],
  accounting: [
<<<<<<< HEAD
    "accDashboard",
    "accSparepartRequests",
    "accPurchaseOrders",
    "accDeliveryOrders",
  ],
};
export const homeRouteNameByRole: Record<string, string> = {
  customer_service: "csDashboard",
  technician: "techDashboard",
  accounting: "accDashboard",
};

// Dynamic permission-based route access system.
// Instead of hardcoded allowlists, route access is driven by the
// role_permissions assigned in the admin panel (Roles page).
//
// Each route name maps to a "module" key. The user must have at least
// one permission for that module (e.g. "customer:read") to access the route.
// Routes not listed here are considered "open" (dashboards, settings, etc.)
// and are accessible to any authenticated user.

/**
 * Maps a route name → permission module key.
 * When a user navigates to a route, we check whether their permissions
 * array contains at least one entry starting with `<module>:`.
 *
 * Keep this in sync when adding new routes / modules.
 */
export const routeToModule: Record<string, string> = {
  // Master Data
  users: "user",
  roles: "role",
  permissions: "permission",
  modules: "module",
  customers: "customer",
  technicians: "technician",
  suppliers: "supplier",
  unitTypes: "unit_type",
  brands: "brand",
  paperSize: "paper_size",
  paperType: "paper_type",
  productCategories: "product_category",
  products: "product",
  units: "unit",
  warranties: "warranty",
  contracts: "contract",
  systemSettings: "system_setting",
  notifications: "notification",

  // Transaction / CS
  contractItems: "contract_item",
  serviceRequests: "service_request",
  jobOrders: "job_order",
  serviceReports: "service_report",
  monthlyMeterReadings: "monthly_meter_reading",
  rentals: "rental",
  sales: "sale",
  rentalInvoices: "rental_invoice",
  salesInvoices: "sales_invoice",
  payments: "payment",
  warrantyClaims: "warranty_claim",

  // CS-specific views (map to their underlying module)
  csCallService: "service_request",
  csMonitoringService: "service_report",
  csSparepartRequest: "service_sparepart",
  csIndent: "delivery_order",
  csDelivery: "delivery_order",
  csReports: "service_report",

  // Accounting
  accSparepartRequests: "service_sparepart",
  accPurchaseOrders: "purchase_order",
  accDeliveryOrders: "delivery_order",

  // Technician
  techCallServices: "job_order",
  techCallServiceDetail: "job_order",
  techMaintenance: "service_report",
  techSparepartRequest: "service_sparepart",
  techMeterReadings: "monthly_meter_reading",
  techServiceHistory: "service_report",
};

/**
 * Routes that are always accessible to any authenticated user
 * (dashboards, login, etc.) — no permission check needed.
 */
export const alwaysAllowedRoutes = new Set<string>([
  "login",
  "csDashboard",
  "techDashboard",
  "accDashboard",
]);

/**
 * Check if a user with the given permissions array can access a route.
 * - admin/superadmin always passes.
 * - Routes in `alwaysAllowedRoutes` always pass.
 * - For other routes, the user must have at least one permission
 *   whose module part matches `routeToModule[routeName]`.
 */
export function canAccessRoute(
  routeName: string,
  role: string,
  permissions: string[],
): boolean {
  // Superadmin / admin bypass
  if (role === "admin" || role === "superadmin") return true;

  const builtInRoutes = allowedRouteNamesByRole[role];
  if (builtInRoutes && !builtInRoutes.includes(routeName)) return false;

  // Always-allowed routes (dashboards)
  if (alwaysAllowedRoutes.has(routeName)) return true;

  // Find the required module for this route
  const requiredModule = routeToModule[routeName];

  // If the route has no module mapping, allow it (unprotected route)
  if (!requiredModule) return true;

  // Check if user has at least one permission for this module
  return permissions.some((p) => {
    const modulePart = p.split(":")[0];
    return modulePart === requiredModule;
  });
}

/**
 * Determine the "home" route for a user based on their permissions.
 * Falls back to 'users' for admin or first accessible dashboard.
 */
export function getHomeRoute(role: string, permissions: string[]): string {
  if (role === "admin" || role === "superadmin") return "users";

  const roleHome = homeRouteNameByRole[role];
  if (roleHome && canAccessRoute(roleHome, role, permissions)) return roleHome;

  // Check common dashboard routes by permission patterns
  const dashboardCandidates = [
    {
      route: "csDashboard",
      modules: ["service_request", "contract_item", "customer", "rental"],
    },
    { route: "techDashboard", modules: ["job_order", "service_report"] },
    {
      route: "accDashboard",
      modules: ["purchase_order", "delivery_order", "service_sparepart"],
    },
  ];

  for (const candidate of dashboardCandidates) {
    const hasAny = candidate.modules.some((mod) =>
      permissions.some((p) => p.split(":")[0] === mod),
    );
    if (hasAny && canAccessRoute(candidate.route, role, permissions))
      return candidate.route;
  }

  // Fallback: find the first route the user can access
  for (const [routeName, mod] of Object.entries(routeToModule)) {
    if (
      permissions.some((p) => p.split(":")[0] === mod) &&
      canAccessRoute(routeName, role, permissions)
    ) {
      return routeName;
    }
  }

  // Absolute fallback
  return "users";
=======
    'accDashboard', 'accSparepartRequests', 'accPurchaseOrders', 'accDeliveryOrders',
  ],
}

// Role home routes used when a role hits a page it cannot access (or the login page while authed).
export const homeRouteNameByRole: Record<string, string> = {
  customer_service: 'csDashboard',
  technician: 'techDashboard',
  accounting: 'accDashboard',
>>>>>>> 00e1fed6140254ec55582557c6aa0a22dde427a2
}

// Backend accepts both 'technician' and 'teknisi' (auth/service.go, user/service.go);
// role names may also arrive capitalized from the DB.
export function normalizeRole(role: string | null | undefined): string {
  const r = (role || "").trim().toLowerCase();
  if (r === "superadmin") return "admin";
  if (r === "teknisi") return "technician";
  return r;
}
