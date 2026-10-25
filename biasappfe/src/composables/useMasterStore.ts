// @ts-nocheck
import { useResourcesStore } from "@/stores/resources.store";
import { useAuthStore } from "@/stores/auth.store";
import type {
  Brand,
  ContractItem,
  Customer,
  DeliveryOrder,
  Indent,
  MonthlyMeterReading,
  Payment,
  Product,
  RentalInvoice,
  Sale,
  SalesInvoice,
  ServiceReport,
  SparepartRequest,
  Technician,
  Unit,
  UnitType,
  Warranty,
  WarrantyClaim,
  PurchaseOrder,
  PurchaseOrderItem,
  ProcurementDeliveryOrder,
} from "@/types";
import { reactive, toRefs, ref } from "vue";
import {
  formatUnitDisplayName as utilFormatUnitDisplayName,
  formatProductDisplayName as utilFormatProductDisplayName,
  isCopierOrPrinter,
  resolvePrintTech,
} from "@/utils/format";

const store = reactive({
  customers: [] as Customer[],
  technicians: [] as Technician[],
  brands: [] as Brand[],
  unitTypes: [] as UnitType[],
  units: [] as Unit[],
  products: [] as Product[],
  warranties: [] as Warranty[],

  contractItems: [] as ContractItem[],
  serviceRequests: [] as any[],
  jobOrders: [] as any[],
  serviceReports: [] as ServiceReport[],
  monthlyMeterReadings: [] as MonthlyMeterReading[],
  sales: [] as Sale[],
  rentalInvoices: [] as RentalInvoice[],
  salesInvoices: [] as SalesInvoice[],
  payments: [] as Payment[],
  warrantyClaims: [] as WarrantyClaim[],
  sparepartRequests: [] as SparepartRequest[],
  indents: [] as Indent[],
  rents: [] as any[],
  deliveryOrders: [] as DeliveryOrder[],
  purchaseOrders: [] as PurchaseOrder[],
  procurementDeliveryOrders: [] as ProcurementDeliveryOrder[],
});

const loadedResources = ref<Set<string>>(new Set());
let syncPromise: Promise<void> | null = null;
let syncing = false;
let lastFullSyncAt = 0;

const CRITICAL_RESOURCES = [
  "customers",
  "technicians",
  "brands",
  "unitTypes",
  "units",
  "products",
  "warranties",
  "contractItems",
] as const;

const PAGE_RESOURCE_MAP: Record<string, string[]> = {
  // Dashboards (All Roles)
  "/customer-service/dashboard": ["serviceRequests", "jobOrders", "serviceReports", "contractItems", "serviceSpareparts", "warrantyClaims", "rents"],
  "/accounting/dashboard": ["serviceSpareparts", "purchaseOrders", "deliveryOrders", "rentalInvoices", "salesInvoices", "payments"],
  "/technician/dashboard": ["jobOrders", "serviceReports", "technicians", "customers", "units"],

  // Customer Service Operational Pages
  "/customer-service/rentals": ["rents", "rentalInvoices", "contractItems", "units", "customers", "products", "payments"],
  "/customer-service/rental-invoices": ["rentalInvoices", "payments", "contractItems", "customers", "units"],
  "/customer-service/sales": ["sales", "salesInvoices", "customers", "units", "products", "brands", "unitTypes"],
  "/customer-service/sales-invoices": ["salesInvoices", "sales", "customers", "units", "products", "brands", "unitTypes"],
  "/customer-service/service-reports": ["serviceReports", "deliveryOrders", "sparepartRequests", "technicians", "units", "customers", "products"],
  "/customer-service/contract-items": ["contractItems", "customers", "units", "brands", "unitTypes"],
  "/customer-service/job-orders": ["jobOrders", "deliveryOrders", "serviceReports", "serviceRequests", "technicians", "units", "customers"],
  "/customer-service/service-requests": ["serviceRequests", "customers", "units", "sales", "deliveryOrders", "jobOrders", "serviceReports", "contractItems", "rents", "products"],
  "/customer-service/monthly-meter-readings": ["monthlyMeterReadings", "contractItems", "units", "customers"],
  "/customer-service/payments": ["payments", "rentalInvoices", "salesInvoices", "customers"],
  "/customer-service/warranty-claims": ["warrantyClaims", "units", "customers", "warranties"],
  "/customer-service/sparepart-request": ["sparepartRequests", "serviceReports", "units", "customers", "products"],
  "/customer-service/maintenance": ["jobOrders", "serviceReports", "units", "technicians", "customers"],
  "/customer-service/indent": ["indents", "products", "suppliers"],
  "/customer-service/delivery": ["deliveryOrders", "purchaseOrders", "customers"],
  "/customer-service/call-service": ["serviceRequests", "jobOrders", "technicians", "customers", "units"],
  "/customer-service/monitoring-service": ["serviceRequests", "jobOrders", "serviceReports", "technicians", "customers", "units", "products"],
  "/customer-service/copier-reports": ["serviceReports", "contractItems", "units", "customers", "monthlyMeterReadings"],
  "/customer-service/standalone-service-history": ["serviceReports", "deliveryOrders", "technicians", "units", "customers"],

  // Accounting Operational Pages
  "/accounting/purchase-orders": ["purchaseOrders", "suppliers", "products"],
  "/accounting/delivery-orders": ["deliveryOrders", "purchaseOrders", "customers"],

  // Technician Operational Pages
  "/technician/call-services": ["jobOrders", "deliveryOrders", "serviceReports", "technicians", "units", "customers"],
  "/technician/maintenance": ["jobOrders", "serviceReports", "units", "technicians", "customers"],
  "/technician/sparepart-request": ["sparepartRequests", "serviceReports", "units", "products"],
  "/technician/meter-readings": ["monthlyMeterReadings", "contractItems", "units"],
  "/technician/service-history": ["serviceReports", "technicians", "units"],
  "/technician/standalone-service-history": ["serviceReports", "deliveryOrders", "technicians", "units"],

  // Master Data Pages
  "/master/users": ["users"],
  "/master/roles": ["roles"],
  "/master/permissions": ["permissions"],
  "/master/modules": ["modules"],
  "/master/customers": ["customers"],
  "/master/technicians": ["technicians"],
  "/master/unit-types": ["unitTypes"],
  "/master/brands": ["brands"],
  "/master/paper-size": ["paperSizes"],
  "/master/paper-type": ["paperTypes"],
  "/master/product-categories": ["productCategories"],
  "/master/uoms": ["uoms"],
  "/master/products": ["products"],
  "/master/units": ["units", "customers", "contractItems", "brands", "unitTypes"],
  "/master/warranties": ["warranties", "sales", "units", "products", "customers"],
  "/master/excel-templates": ["excelTemplates"],
  "/master/suppliers": ["suppliers"],
  "/master/contracts": ["contracts", "contractItems", "customers"],
  "/master/system-settings": ["systemSettings"],
  "/master/notifications": ["notifications"],
};

export function useMasterStore() {
  const resources = useResourcesStore();
  const authStore = useAuthStore();

  function hasPerm(resourceName: string) {
    if (
      authStore.currentUser?.role === "admin" ||
      authStore.currentUser?.role === "superadmin"
    )
      return true;
    const perms = authStore.currentUser?.permissions || [];
    const resBase = resourceName
      .toLowerCase()
      .replace(/[^a-z]/g, "")
      .replace(/s/g, "");
    return perms.some((p) => {
      const pMod = p.split(":")[0].toLowerCase();
      const pBase = pMod.replace(/[^a-z]/g, "").replace(/s/g, "");
      return pBase === resBase;
    });
  }

  const safeFetch = (
    fetchPromise: Promise<any>,
    assignCallback: (items: any) => void,
  ) => {
    return fetchPromise
      .then((items) => {
        if (items) assignCallback(items);
      })
      .catch((err) => {
        console.warn("Failed to fetch data:", err);
      });
  };

  function buildSyncTasks(
    tracksLoading: boolean,
  ): Record<string, () => Promise<void>> {
    const DROPDOWN_LIMIT = 200;
    const fetchAll = (name: keyof typeof resources, limit?: number) =>
      tracksLoading
        ? resources.fetchAll(name, limit ? { limit } : undefined, true)
        : resources.fetchAllSilent(name, limit ? { limit } : undefined);
    const baseTasks: Record<string, () => Promise<void>> = {
      customers: () =>
        safeFetch(
          fetchAll("customers", DROPDOWN_LIMIT),
          (items) => (store.customers = items || []),
        ),
      technicians: () =>
        safeFetch(
          fetchAll("technicians", DROPDOWN_LIMIT),
          (items) => {
            store.technicians = (items || []).map((t: any) => ({
              ...t,
              name: t.name || t.user?.name || t.user?.username || "",
            }));
          },
        ),
      brands: () =>
        safeFetch(
          fetchAll("brands", DROPDOWN_LIMIT),
          (items) => (store.brands = items || []),
        ),
      unitTypes: () =>
        safeFetch(
          fetchAll("unitTypes", DROPDOWN_LIMIT),
          (items) => (store.unitTypes = items || []),
        ),
      units: () =>
        safeFetch(
          fetchAll("units", DROPDOWN_LIMIT),
          (items) => (store.units = items || []),
        ),
      products: () =>
        safeFetch(
          fetchAll("products", DROPDOWN_LIMIT),
          (items) => (store.products = items || []),
        ),
      warranties: () =>
        safeFetch(
          fetchAll("warranties", DROPDOWN_LIMIT),
          (items) => (store.warranties = items || []),
        ),
      contractItems: () =>
        safeFetch(
          fetchAll("contractItems", DROPDOWN_LIMIT),
          (items) => (store.contractItems = items || []),
        ),
      serviceReports: () =>
        safeFetch(
          fetchAll("serviceReports", DROPDOWN_LIMIT),
          (items) => (store.serviceReports = items || []),
        ),
      serviceRequests: () =>
        safeFetch(
          fetchAll("serviceRequests", DROPDOWN_LIMIT),
          (items) => (store.serviceRequests = items || []),
        ),
      jobOrders: () =>
        safeFetch(
          fetchAll("jobOrders", DROPDOWN_LIMIT),
          (items) => (store.jobOrders = items || []),
        ),
      monthlyMeterReadings: () =>
        safeFetch(
          fetchAll("monthlyMeterReadings", DROPDOWN_LIMIT),
          (items) => (store.monthlyMeterReadings = items || []),
        ),
      sales: () =>
        safeFetch(
          fetchAll("sales", DROPDOWN_LIMIT),
          (items) => (store.sales = items || []),
        ),
      rents: () =>
        safeFetch(
          fetchAll("rents", DROPDOWN_LIMIT),
          (items) => ((store as any).rents = items || []),
        ),
      rentals: () =>
        safeFetch(
          fetchAll("rents", DROPDOWN_LIMIT),
          (items) => ((store as any).rents = items || []),
        ),
      rentalInvoices: () =>
        safeFetch(
          fetchAll("rentalInvoices", DROPDOWN_LIMIT),
          (items) => (store.rentalInvoices = items || []),
        ),
      salesInvoices: () =>
        safeFetch(
          fetchAll("salesInvoices", DROPDOWN_LIMIT),
          (items) => (store.salesInvoices = items || []),
        ),
      payments: () =>
        safeFetch(
          fetchAll("payments", DROPDOWN_LIMIT),
          (items) => (store.payments = items || []),
        ),
      warrantyClaims: () =>
        safeFetch(
          fetchAll("warrantyClaims", DROPDOWN_LIMIT),
          (items) => (store.warrantyClaims = items || []),
        ),
      serviceSpareparts: () =>
        safeFetch(
          fetchAll("serviceSpareparts", DROPDOWN_LIMIT),
          (items) => (store.sparepartRequests = items || []),
        ),
      sparepartRequests: () =>
        safeFetch(
          fetchAll("serviceSpareparts", DROPDOWN_LIMIT),
          (items) => (store.sparepartRequests = items || []),
        ),
      purchaseOrders: () =>
        safeFetch(
          fetchAll("purchaseOrders", DROPDOWN_LIMIT),
          (items) => (store.purchaseOrders = items || []),
        ),
      deliveryOrders: () =>
        safeFetch(fetchAll("deliveryOrders", DROPDOWN_LIMIT), (items) => {
          const validItems = items || [];
          store.deliveryOrders = validItems;
          store.procurementDeliveryOrders = validItems.filter(
            (d: any) => d.purchase_order_id || d.do_type === "inbound",
          );
        }),
      suppliers: () =>
        safeFetch(
          fetchAll("suppliers", DROPDOWN_LIMIT),
          (items) => (store as any).suppliers = items || [],
        ),
      indents: () =>
        safeFetch(
          fetchAll("indents", DROPDOWN_LIMIT),
          (items) => (store.indents = items || []),
        ),
    };

    return new Proxy(baseTasks, {
      get(target, prop: string) {
        if (prop in target) return (target as any)[prop];
        if (prop in resources) {
          return () =>
            safeFetch(
              fetchAll(prop as any, DROPDOWN_LIMIT),
              (items) => ((store as any)[prop] = items || []),
            );
        }
        return undefined;
      },
    });
  }

  function runSyncTasks(names: string[] | null, tracksLoading: boolean) {
    const isFullSync = !names || names.length === 0;
    const registry = buildSyncTasks(tracksLoading);
    const picked = (
      names && names.length > 0
        ? names.map((name) => registry[name]).filter(Boolean)
        : Object.values(registry)
    ) as Array<() => Promise<void>>;

    if (picked.length === 0) return Promise.resolve();

    return (async () => {
      const concurrency = 6;
      const queue = picked.slice();
      const workers: Promise<void>[] = [];
      async function worker() {
        while (queue.length) {
          const task = queue.shift();
          if (task) await task();
        }
      }
      for (let i = 0; i < Math.min(concurrency, queue.length); i++) workers.push(worker());
      await Promise.all(workers);
      if (names) names.forEach((n) => loadedResources.value.add(n));
      if (isFullSync) lastFullSyncAt = Date.now();
    })();
  }

  function syncFromApi(force = false, tracksLoading = true) {
    return runSyncTasks(null, tracksLoading);
  }

  function loadCriticalResources(tracksLoading = true, force = false) {
    const notLoaded = force
      ? (CRITICAL_RESOURCES as unknown as string[])
      : (CRITICAL_RESOURCES as unknown as string[]).filter(
          (r) => !loadedResources.value.has(r),
        );
    if (notLoaded.length === 0) return Promise.resolve();
    return runSyncTasks(notLoaded, tracksLoading);
  }

  function loadResourcesForPage(path: string, tracksLoading = true) {
    let needed = PAGE_RESOURCE_MAP[path];
    if (!needed || needed.length === 0) {
      for (const [key, val] of Object.entries(PAGE_RESOURCE_MAP)) {
        if (path.startsWith(key)) {
          needed = val;
          break;
        }
      }
    }
    if (!needed || needed.length === 0) return Promise.resolve();
    const notLoaded = needed.filter((r) => !loadedResources.value.has(r));
    if (notLoaded.length === 0) return Promise.resolve();
    return runSyncTasks(notLoaded, tracksLoading);
  }

  function getResourcesForPath(path: string): string[] {
    let needed = PAGE_RESOURCE_MAP[path];
    if (!needed || needed.length === 0) {
      for (const [key, val] of Object.entries(PAGE_RESOURCE_MAP)) {
        if (path.startsWith(key)) {
          needed = val;
          break;
        }
      }
    }
    return needed || [];
  }

  function ensureResourcesLoaded(path: string) {
    const needed = getResourcesForPath(path);
    const combined = Array.from(new Set([
      ...(CRITICAL_RESOURCES as unknown as string[]),
      ...needed,
    ]));

    const notLoaded = combined.filter((r) => !loadedResources.value.has(r));
    if (notLoaded.length > 0) {
      // First visit: load not-yet-cached critical & needed resources
      return runSyncTasks(notLoaded, false);
    }

    // Resources already in memory: page renders INSTANTLY (0ms)
    // Silently revalidate only if data is older than 30 seconds
    if (Date.now() - lastFullSyncAt > 30000) {
      void refreshIfStale(30000);
    }
    return Promise.resolve();
  }

  function refreshInBackground() {
    // Refresh only resources needed for current page instead of flooding all 25 resources across the browser socket pool
    const route = typeof window !== 'undefined' ? window.location.pathname : '';
    let needed = (route && PAGE_RESOURCE_MAP[route]) || [];
    if (!needed || needed.length === 0) {
      for (const [key, val] of Object.entries(PAGE_RESOURCE_MAP)) {
        if (route && route.startsWith(key)) {
          needed = val;
          break;
        }
      }
    }
    if (needed && needed.length > 0) {
      return refreshOnly(needed.slice(0, 3));
    }
    return Promise.resolve();
  }

  async function refreshOnly(names: string[]) {
    if (!names || names.length === 0) return refreshInBackground();
    const registry = buildSyncTasks(false);
    const tasks = names.map((name) => registry[name]).filter(Boolean);
    await Promise.all(tasks.map((task) => task()));
    names.forEach((n) => loadedResources.value.add(n));
  }

  function refreshIfStale(maxAgeMs = 30000) {
    if (Date.now() - lastFullSyncAt < maxAgeMs) return Promise.resolve();
    return refreshInBackground();
  }

  function findCustomer(id: number | string | null): Customer | undefined {
    if (id == null) return undefined;
    const str = String(id).trim().toLowerCase();
    return (store.customers || []).find((c) => String(c.id).trim().toLowerCase() === str);
  }

  function findTechnician(id: number | string | null): Technician | undefined {
    if (id == null) return undefined;
    const str = String(id).trim().toLowerCase();
    const found: any = (store.technicians || []).find(
      (t: any) =>
        String(t.id).trim().toLowerCase() === str ||
        String(t.user_id || "").trim().toLowerCase() === str,
    );
    if (found && !found.name && found.user?.name) {
      found.name = found.user.name;
    }
    return found;
  }

  function findUnit(id: number | string | null): Unit | undefined {
    if (id == null) return undefined;
    const str = String(id).trim().toLowerCase();
    return (store.units || []).find((u) => String(u.id).trim().toLowerCase() === str);
  }

  function findBrand(
    id: number | string | null | undefined,
  ): Brand | undefined {
    if (id == null) return undefined;
    const str = String(id).trim().toLowerCase();
    return (store.brands || []).find((b) => String(b.id).trim().toLowerCase() === str);
  }

  function findUnitType(
    id: number | string | null | undefined,
  ): UnitType | undefined {
    if (id == null) return undefined;
    const str = String(id).trim().toLowerCase();
    return ((store.unitTypes as UnitType[]) || []).find(
      (u) => String(u.id).trim().toLowerCase() === str,
    );
  }

  function findProduct(id: number | string | null): Product | undefined {
    if (id == null) return undefined;
    const str = String(id).trim().toLowerCase();
    return (store.products || []).find((p) => String(p.id).trim().toLowerCase() === str);
  }

  function findWarranty(id: number | string | null): Warranty | undefined {
    if (id == null) return undefined;
    const str = String(id).trim().toLowerCase();
    return (store.warranties || []).find((w) => String(w.id).trim().toLowerCase() === str);
  }

  function findContractItem(
    id: number | string | null | undefined,
  ): ContractItem | undefined {
    if (id == null) return undefined;
    const str = String(id).trim().toLowerCase();
    return (store.contractItems || []).find((ci) => String(ci.id).trim().toLowerCase() === str);
  }

  function findServiceReport(
    id: number | string | null,
  ): ServiceReport | undefined {
    if (id == null) return undefined;
    const str = String(id).trim().toLowerCase();
    return (store.serviceReports || []).find((sr) => String(sr.id).trim().toLowerCase() === str);
  }

  function findSparepartRequest(
    id: number | string | null,
  ): SparepartRequest | undefined {
    if (id == null) return undefined;
    const str = String(id).trim().toLowerCase();
    return (store.sparepartRequests || []).find((r) => String(r.id).trim().toLowerCase() === str);
  }

  function findRentalInvoice(id: any): RentalInvoice | undefined {
    if (id == null) return undefined;
    const str = String(id).trim().toLowerCase();
    return (store.rentalInvoices || []).find((ri) => String(ri.id).trim().toLowerCase() === str);
  }

  function findSale(id: any): Sale | undefined {
    if (id == null) return undefined;
    const str = String(id).trim().toLowerCase();
    return (store.sales || []).find((s) => String(s.id).trim().toLowerCase() === str);
  }

  function findSalesInvoice(id: any): SalesInvoice | undefined {
    if (id == null) return undefined;
    const str = String(id).trim().toLowerCase();
    return (store.salesInvoices || []).find((si) => String(si.id).trim().toLowerCase() === str);
  }

  function getUnitsByCustomer(customerId: number | string | null): Unit[] {
    if (!customerId) return [];
    const relevantContracts = (store.contractItems || []).filter((c) => {
      const custIdStr = String(customerId);
      const cCustId = c.customer_id ? String(c.customer_id) : undefined;
      const cCustIdNested = c.contract?.customer_id
        ? String(c.contract.customer_id)
        : undefined;
      return cCustId === custIdStr || cCustIdNested === custIdStr;
    });
    const unitIds = [
      ...new Set(
        relevantContracts
          .map((c) => c.unit_id)
          .filter((id): id is number | string => id != null),
      ),
    ];
    if (unitIds.length === 0) return [];
    const allUnits = store.units || [];
    return allUnits.filter((u) => unitIds.includes(u.id as number | string));
  }

  function getContractsByCustomer(
    customerId: number | string | null,
  ): ContractItem[] {
    if (!customerId) return [];
    const custIdStr = String(customerId);
    return (store.contractItems || []).filter((c) => {
      const cCustId = c.customer_id ? String(c.customer_id) : undefined;
      const cCustIdNested = c.contract?.customer_id
        ? String(c.contract.customer_id)
        : undefined;
      return cCustId === custIdStr || cCustIdNested === custIdStr;
    });
  }

  function getTechnicianIdByUser(
    userId: number | string | null,
  ): string | null {
    if (!userId) return null;
    const tech = (store.technicians || []).find(
      (t: any) => t.user_id == userId,
    );
    return tech ? String(tech.id) : null;
  }

  function getServiceReportsByTechnician(
    technicianId: number | string | null,
  ): ServiceReport[] {
    if (!technicianId) return [];
    return (store.serviceReports || []).filter(
      (sr) => (sr.technician_id as any) == technicianId,
    );
  }

  function formatUnitDisplayName(u: any): string {
    return utilFormatUnitDisplayName(u, { findBrand, findUnitType });
  }

  function formatProductDisplayName(p: any): string {
    return utilFormatProductDisplayName(p, { findBrand });
  }

  return {
    ...toRefs(store),
    refresh: syncFromApi,
    refreshInBackground: () => syncFromApi(true, false),
    refreshOnly,
    refreshIfStale,
    loadCriticalResources,
    loadResourcesForPage,
    ensureResourcesLoaded,
    findCustomer,
    findTechnician,
    findUnit,
    findBrand,
    findUnitType,
    findProduct,
    findWarranty,
    findContractItem,
    findServiceReport,
    findSparepartRequest,
    findRentalInvoice,
    findSale,
    findSalesInvoice,
    getUnitsByCustomer,
    getContractsByCustomer,
    getTechnicianIdByUser,
    getServiceReportsByTechnician,
    formatUnitDisplayName,
    formatProductDisplayName,
    isCopierOrPrinter,
    resolvePrintTech,
    getResourcesForPath,
  };
}
