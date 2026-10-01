// Single source of truth for which route names each built-in role may access.
// Used by BOTH the router guard (index.ts) and Sidebar.vue so they never drift apart.
// Keep in sync when adding routes.
export const allowedRouteNamesByRole: Record<string, string[]> = {
  customer_service: [
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
    // No master-data routes: technicians only consume master APIs (dropdowns/lookups)
    // through useMasterStore — they must never open /master/* pages.
  ],
  accounting: [
    'accDashboard', 'accSparepartRequests', 'accPurchaseOrders', 'accDeliveryOrders',
    'salesInvoices'
  ],
}

// Role home routes used when a role hits a page it cannot access (or the login page while authed).
export const homeRouteNameByRole: Record<string, string> = {
  customer_service: 'csDashboard',
  technician: 'techDashboard',
  accounting: 'accDashboard',
}

// Backend accepts both 'technician' and 'teknisi' (auth/service.go, user/service.go);
// role names may also arrive capitalized from the DB.
export function normalizeRole(role: string | null | undefined): string {
  const r = (role || "").trim().toLowerCase();
  if (r === "superadmin") return "admin";
  if (r === "teknisi") return "technician";
  return r;
}
