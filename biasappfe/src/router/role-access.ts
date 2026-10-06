// Role-based access helpers shared by the router guard (index.ts) and
// Sidebar.vue so they never drift apart.
//
// Visibility philosophy (dynamic by permission):
//   - Every menu/route EXCEPT the items below is driven by the role's live
//     `<key>:view` permissions (see permission-map.ts). Granting/revoking a
//     `:view` permission in the backend immediately shows/hides the menu -
//     no frontend change needed, including for custom roles.
//   - Dashboards are pinned: each built-in role always keeps its own
//     dashboard (admin sees all three). They are never granted via permissions.
//   - Technician operational pages are role-locked (no permission keys exist
//     for them): only the technician role may open them.
// Keep in sync when adding routes.
export const dashboardRouteNames: string[] = [
  'csDashboard',
  'techDashboard',
  'accDashboard',
];

// Each built-in role always keeps its own dashboard in the sidebar
// (and may only open that dashboard). Admin is unrestricted (see callers).
export const dashboardRouteByRole: Record<string, string> = {
  customer_service: 'csDashboard',
  accounting: 'accDashboard',
  technician: 'techDashboard',
};

// Technician operational pages (dashboards excluded - see above, shared pages
// excluded - open to every authenticated role). Only `technician` may open these.
export const technicianOnlyRouteNames: string[] = [
  'techCallServices',
  'techCallServiceDetail',
  'techMaintenance',
  'techSparepartRequest',
  'techMeterReadings',
  'techServiceHistory',
  'techFormServiceReport',
  'techFormTechnicalReport',
  'techFormCopierReport',
];

// Role home routes used when a role hits a page it cannot access (or the login page while authed).
export const homeRouteNameByRole: Record<string, string> = {
  customer_service: "csDashboard",
  technician: "techDashboard",
  accounting: "accDashboard",
};

// Backend accepts both 'technician' and 'teknisi' (auth/service.go, user/service.go);
// role names may also arrive capitalized from the DB.
export function normalizeRole(role: string | null | undefined): string {
  const r = (role || "").trim().toLowerCase();
  if (r === "superadmin") return "admin";
  if (r === "teknisi") return "technician";
  return r;
}
