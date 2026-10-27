import { computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuth } from "@/composables/useAuth";
import { useModules } from "@/composables/useModules";
import { canView, permissionKeysFor } from "@/router/permission-map";
import {
  allowedRouteNamesByRole,
  dashboardRouteByRole,
  dashboardRouteNames,
  normalizeRole,
} from "@/router/role-access";
import type { MenuGroup, MenuItem } from "@/types";

export const allMenuGroups: MenuGroup[] = [
  {
    title: "sidebar.dashboard",
    items: [
      {
        label: "sidebar.cs_dashboard",
        icon: "grid",
        route: "/customer-service/dashboard",
      },
      {
        label: "sidebar.tech_dashboard",
        icon: "grid",
        route: "/technician/dashboard",
      },
      {
        label: "sidebar.acc_dashboard",
        icon: "grid",
        route: "/accounting/dashboard",
      },
    ],
  },
  {
    title: "sidebar.sales_group",
    items: [
      {
        label: "sidebar.customers",
        icon: "building",
        route: "/master/customers",
      },
      {
        label: "sidebar.products",
        icon: "box",
        route: "/master/products",
      },
      {
        label: "sidebar.sales",
        icon: "shopping-cart",
        route: "/customer-service/sales",
      },
      {
        label: "sidebar.sales_invoices",
        icon: "receipt",
        route: "/customer-service/sales-invoices",
      },
      {
        label: "sidebar.warranties",
        icon: "shield-check",
        route: "/master/warranties",
      },
      {
        label: "sidebar.warranty_claims",
        icon: "alert-circle",
        route: "/customer-service/warranty-claims",
      },
    ],
  },
  {
    title: "sidebar.rental_group",
    items: [
      {
        label: "sidebar.units",
        icon: "printer",
        route: "/master/units",
      },
      {
        label: "sidebar.contract_items",
        icon: "clipboard",
        route: "/customer-service/contract-items",
      },
      {
        label: "sidebar.rentals",
        icon: "box",
        route: "/customer-service/rentals",
      },
      {
        label: "sidebar.meter_readings",
        icon: "activity",
        route: "/customer-service/monthly-meter-readings",
      },
      {
        label: "sidebar.rental_invoices",
        icon: "file-invoice",
        route: "/customer-service/rental-invoices",
      },
      {
        label: "Copier Reports",
        icon: "file-text",
        route: "/customer-service/copier-reports",
      },
    ],
  },
  {
    title: "sidebar.service_group",
    items: [
      {
        label: "sidebar.service_requests",
        icon: "alert-circle",
        route: "/customer-service/service-requests",
      },
      {
        label: "sidebar.job_orders",
        icon: "clipboard",
        route: "/customer-service/job-orders",
      },
      {
        label: "sidebar.maintenance_schedules",
        icon: "calendar",
        route: "/customer-service/maintenance",
        module: "maintenance",
      },
      {
        label: "sidebar.service_reports",
        icon: "tool",
        route: "/customer-service/service-reports",
      },
      {
        label: "sidebar.standalone_service_history",
        icon: "file-text",
        route: "/customer-service/standalone-service-history",
      },
      {
        label: "sidebar.monitoring_service",
        icon: "activity",
        route: "/customer-service/monitoring-service",
      },
      {
        label: "sidebar.sparepart_requests",
        icon: "box",
        route: "/customer-service/sparepart-request",
      },
    ],
  },
  {
    title: "sidebar.finance_group",
    items: [
      {
        label: "sidebar.purchase_orders",
        icon: "clipboard",
        route: "/accounting/purchase-orders",
      },
      {
        label: "sidebar.delivery_orders",
        icon: "truck",
        route: "/accounting/delivery-orders",
      },
      {
        label: "sidebar.payments",
        icon: "credit-card",
        route: "/customer-service/payments",
      },
      {
        label: "sidebar.stock_control",
        icon: "box",
        route: "/accounting/stock-control",
        roles: ["accounting", "admin"],
      },
    ],
  },
  {
    title: "sidebar.master_data",
    items: [
      {
        label: "sidebar.product_categories",
        icon: "folder",
        route: "/master/product-categories",
      },
      { label: "sidebar.brands", icon: "tag", route: "/master/brands" },
      {
        label: "sidebar.unit_types",
        icon: "layers",
        route: "/master/unit-types",
      },
      { label: "sidebar.uoms", icon: "ruler", route: "/master/uoms" },
      {
        label: "sidebar.paper_size",
        icon: "file",
        route: "/master/paper-size",
      },
      {
        label: "sidebar.paper_type",
        icon: "file-text",
        route: "/master/paper-type",
      },
      {
        label: "sidebar.excel_templates",
        icon: "upload",
        route: "/master/excel-templates",
        roles: ["admin"],
      },
    ],
  },
  {
    title: "sidebar.system",
    items: [
      { label: "sidebar.users", icon: "users", route: "/master/users" },
      { label: "sidebar.roles", icon: "shield", route: "/master/roles" },
      {
        label: "sidebar.permissions",
        icon: "key",
        route: "/master/permissions",
      },
      { label: "sidebar.modules", icon: "grid", route: "/master/modules" },
    ],
  },
  {
    title: "sidebar.technician_menu",
    items: [
      {
        label: "sidebar.my_jobs",
        icon: "tool",
        route: "/technician/call-services",
        roles: ["technician"],
      },
      {
        label: "sidebar.maintenance",
        icon: "wrench",
        route: "/technician/maintenance",
        roles: ["technician"],
        module: "maintenance",
      },
      {
        label: "sidebar.service_history",
        icon: "file-text",
        route: "/technician/service-history",
        roles: ["technician"],
      },
      {
        label: "sidebar.standalone_service_history",
        icon: "clipboard",
        route: "/technician/standalone-service-history",
        roles: ["technician"],
      },
      {
        label: "sidebar.sparepart_requests",
        icon: "box",
        route: "/technician/sparepart-request",
        roles: ["technician"],
      },
      {
        label: "sidebar.meter_readings",
        icon: "activity",
        route: "/technician/meter-readings",
        roles: ["technician"],
      },
    ],
  },
];

export const iconPaths: Record<string, string> = {
  users:
    "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8m13 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  key: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  building:
    "M3 21h18M3 7v14M21 7v14M6 11h.01M6 15h.01M6 19h.01M10 11h.01M10 15h.01M10 19h.01M14 11h.01M14 15h.01M14 19h.01M18 11h.01M18 15h.01M18 19h.01M3 7l9-4 9 4",
  wrench:
    "M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z",
  layers: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  tag: "M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01",
  file: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6",
  "file-text":
    "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  folder:
    "M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z",
  ruler:
    "M3 17h18v-2H3v2zM3 7h18v2H3V7zm2 4v-2H4v2h1zm2 0v-2H6v2h1zm2 0v-2H8v2h1zm2 0v-2h-1v2h1zm2 0v-2h-1v2h1zm2 0v-2h-1v2h1zm2 0v-2h-1v2h1zm2 0v-2h-1v2h1zm-12 6v-2H2v2h1zm2 0v-2H4v2h1zm2 0v-2H6v2h1zm2 0v-2H8v2h1zm2 0v-2h-1v2h1zm2 0v-2h-1v2h1zm2 0v-2h-1v2h1zm2 0v-2h-1v2h1z",
  box: "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12",
  printer:
    "M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z",
  "shield-check": "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4",
  clipboard:
    "M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2 M9 2h6a1 1 0 011 1v1a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1z",
  tool: "M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  "shopping-cart":
    "M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6 M9 22a1 1 0 100-2 1 1 0 000 2z M20 22a1 1 0 100-2 1 1 0 000 2z",
  "file-invoice":
    "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M8 13h8 M8 17h8 M8 9h2",
  receipt:
    "M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z M8 10h8 M8 14h4",
  "credit-card": "M1 4h22v16H1z M1 10h22",
  "alert-circle":
    "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 8v4 M12 16h.01",
  truck:
    "M1 3h15v13H1z M16 8h4l3 3v5h-7z M5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z M18.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  settings: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M12 8v4 M12 16h.01",
  bell: "M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0",
  upload: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M17 8l-5-5-5 5 M12 3v12",
  download: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3",
  calendar:
    "M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z M16 2v4 M8 2v4 M3 10h18",
};

const moduleKey = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, "_");

export function useNavigationMenu() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { modules } = useModules();
  const { t } = useI18n();

  const menuGroups = computed(() => {
    const role = normalizeRole(currentUser.value?.role);
    const groups: MenuGroup[] = JSON.parse(JSON.stringify(allMenuGroups));

    // Filter dynamically based on role route access, permissions and active database modules
    return groups
      .map((group) => ({
        ...group,
        title: group.title.includes(".") ? t(group.title) : group.title,
        items: group.items
          .filter((item) => {
            const routeName = String(router.resolve(item.route).name || "");

            // 1. Hilangkan tech dashboard jika rolenya bukan technician
            if (
              (routeName === "techDashboard" || item.route === "/technician/dashboard") &&
              role !== "technician"
            ) {
              return false;
            }

            // 2. Hilangkan acc dashboard jika rolenya bukan accounting
            if (
              (routeName === "accDashboard" || item.route === "/accounting/dashboard") &&
              role !== "accounting"
            ) {
              return false;
            }

            // Khusus menu stock control: hanya bisa dilihat oleh user dengan role accounting (dan admin)
            if (
              (routeName === "accStockControl" || item.route === "/accounting/stock-control") &&
              role !== "accounting" &&
              role !== "admin"
            ) {
              return false;
            }

            // 3. Superadmin (admin) sees everything else
            if (role === "admin") return true;

            // 4. Role allowlist: restrict roles with explicit route allowlists (e.g., technician)
            const allowedRoutes = allowedRouteNamesByRole[role];
            if (allowedRoutes && !allowedRoutes.includes(routeName)) {
              return false;
            }

            // 5. Explicit module gate (e.g. maintenance): the menu hides when
            //    the module is deactivated in Master > Modules.
            if (item.module) {
              const mod = (modules.value || []).find(
                (m) => moduleKey(String(m.name)) === item.module,
              );
              if (mod && !mod.is_active) return false;
            }

            // 6. Role-restricted items (technician menu): role decides, no permission checks
            if (item.roles) return item.roles.includes(role);

            const permissions = currentUser.value?.permissions || [];

            // 7. Dashboards are pinned: each built-in role keeps its own dashboard.
            if (dashboardRouteNames.includes(routeName)) {
              const own = dashboardRouteByRole[role];
              return own ? routeName === own : true;
            }

            // 8. Everything else is dynamic: visibility follows the role's live
            //    `<key>:view` permissions (see router/permission-map.ts).
            //    `read` alone never opens a menu.
            if (!canView(routeName, permissions)) return false;

            // Respect a deactivated module that owns this permission key.
            const permKeys = permissionKeysFor(routeName) || [];
            const matches = (modules.value || []).filter((m) =>
              permKeys.includes(moduleKey(String(m.name))),
            );
            if (matches.length > 0 && !matches.some((m) => m.is_active))
              return false;

            return true;
          })
          .map((item) => ({
            ...item,
            rawLabel: item.label,
            label: item.label.includes(".") ? t(item.label) : item.label,
          })),
      }))
      .filter((group) => group.items.length > 0);
  });

  // Flat list of all accessible/permitted items with section/group metadata
  const accessibleItems = computed(() => {
    const list: {
      item: MenuItem & { rawLabel?: string };
      groupTitle: string;
      label: string;
      rawLabel: string;
      route: string;
      icon: string;
    }[] = [];

    for (const group of menuGroups.value) {
      for (const item of group.items) {
        list.push({
          item,
          groupTitle: group.title,
          label: item.label,
          rawLabel: (item as any).rawLabel || item.label,
          route: item.route,
          icon: item.icon,
        });
      }
    }
    return list;
  });

  const panelName = computed(() => {
    const role = normalizeRole(currentUser.value?.role);
    switch (role) {
      case "admin":
        return "Admin Panel";
      case "customer_service":
        return "CS Panel";
      case "accounting":
        return "Accounting Panel";
      case "technician":
        return "Technician Panel";
      default:
        return "BIAS Panel";
    }
  });

  return {
    allMenuGroups,
    menuGroups,
    accessibleItems,
    panelName,
    iconPaths,
  };
}
