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
import { invalidateCache } from "@/utils/requestCache";

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
  "/customer-service/rentals": ["rents", "rentalInvoices", "contractItems", "units", "customers", "products", "payments", "technicians"],
  "/customer-service/rental-invoices": ["rentalInvoices", "payments", "contractItems", "customers", "units", "rents", "products", "brands", "unitTypes"],
  "/customer-service/sales": ["sales", "salesInvoices", "customers", "units", "products", "brands", "unitTypes"],
  "/customer-service/sales-invoices": ["salesInvoices", "sales", "customers", "units", "products", "brands", "unitTypes"],
  "/customer-service/service-reports": ["serviceReports", "deliveryOrders", "sparepartRequests", "technicians", "units", "customers", "products"],
  "/customer-service/contract-items": ["contractItems", "customers", "units", "brands", "unitTypes"],
  "/customer-service/job-orders": ["jobOrders", "deliveryOrders", "serviceReports", "serviceRequests", "technicians", "units", "customers"],
  "/customer-service/service-requests": ["serviceRequests", "customers", "units", "sales", "deliveryOrders", "jobOrders", "serviceReports", "contractItems", "rents", "products"],
  "/customer-service/monthly-meter-readings": ["monthlyMeterReadings", "contractItems", "units", "customers", "serviceReports", "brands", "unitTypes"],
  "/customer-service/payments": ["payments", "rentalInvoices", "salesInvoices", "customers"],
  "/customer-service/warranty-claims": ["warrantyClaims", "units", "customers", "warranties"],
  "/customer-service/sparepart-request": ["sparepartRequests", "serviceReports", "units", "customers", "products"],
  "/customer-service/maintenance": ["serviceReports", "units", "technicians", "customers"],
  "/customer-service/indent": ["indents", "products", "suppliers"],
  "/customer-service/delivery": ["deliveryOrders", "purchaseOrders", "customers"],
  "/customer-service/call-service": ["serviceRequests", "jobOrders", "technicians", "customers", "units"],
  "/customer-service/monitoring-service": ["serviceRequests", "jobOrders", "serviceReports", "deliveryOrders", "technicians", "customers", "units", "products"],
  "/customer-service/copier-reports": ["serviceReports", "contractItems", "units", "customers", "monthlyMeterReadings"],
  "/customer-service/standalone-service-history": ["serviceReports", "deliveryOrders", "technicians", "units", "customers"],

  // Accounting Operational Pages
  "/accounting/purchase-orders": ["purchaseOrders", "suppliers", "products"],
  "/accounting/delivery-orders": ["deliveryOrders", "purchaseOrders", "customers"],

  // Technician Operational Pages
  "/technician/dashboard": ["jobOrders", "serviceReports", "technicians", "customers", "units", "sparepartRequests"],
  "/technician/call-services": ["jobOrders", "deliveryOrders", "serviceReports", "technicians", "units", "customers"],
  "/technician/maintenance": ["jobOrders", "serviceReports", "units", "technicians", "customers", "brands", "unitTypes"],
  "/technician/sparepart-request": ["sparepartRequests", "serviceReports", "units", "products"],
  "/technician/meter-readings": ["monthlyMeterReadings", "contractItems", "units", "customers", "technicians", "serviceReports"],
  "/technician/service-history": ["serviceReports", "technicians", "units", "customers"],
  "/technician/standalone-service-history": ["serviceReports", "deliveryOrders", "technicians", "units", "customers"],

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
      // Execute all targeted tasks in parallel for instant network throughput
      await Promise.all(picked.map((task) => task()));
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
    // Only load what this active page actually requires instead of flooding
    // the network queue with 8-10 unrelated critical master resources.
    const targetResources = needed.length > 0 ? needed : (CRITICAL_RESOURCES as unknown as string[]);

    const notLoaded = targetResources.filter((r) => !loadedResources.value.has(r));
    if (notLoaded.length > 0) {
      // First visit: load not-yet-cached resources for this page directly in parallel
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

  async function refreshOnly(names: string[], bypassCache = false) {
    if (!names || names.length === 0) return refreshInBackground();
    if (bypassCache) {
      names.forEach((n) => invalidateCache(n));
    }
    const registry = buildSyncTasks(false);
    const tasks = names.map((name) => registry[name]).filter(Boolean);
    await Promise.all(tasks.map((task) => task()));
    names.forEach((n) => loadedResources.value.add(n));
  }

  function refreshIfStale(maxAgeMs = 30000) {
    if (Date.now() - lastFullSyncAt < maxAgeMs) return Promise.resolve();
    return refreshInBackground();
  }

  // Fast Index Caches for O(1) lookups across all pages
  const customerIndex = new Map<string, Customer>();
  let lastCustArr: any = null;
  function getCustomerIndex() {
    if (store.customers !== lastCustArr) {
      customerIndex.clear();
      for (const c of (store.customers || [])) {
        if (c?.id != null) customerIndex.set(String(c.id).trim().toLowerCase(), c);
      }
      lastCustArr = store.customers;
    }
    return customerIndex;
  }

  const techIndex = new Map<string, Technician>();
  let lastTechArr: any = null;
  function getTechIndex() {
    if (store.technicians !== lastTechArr) {
      techIndex.clear();
      for (const t of (store.technicians || [])) {
        if (t?.id != null) techIndex.set(String(t.id).trim().toLowerCase(), t);
        if ((t as any)?.user_id != null) techIndex.set(String((t as any).user_id).trim().toLowerCase(), t);
      }
      lastTechArr = store.technicians;
    }
    return techIndex;
  }

  const unitIndex = new Map<string, Unit>();
  let lastUnitArr: any = null;
  function getUnitIndex() {
    if (store.units !== lastUnitArr) {
      unitIndex.clear();
      for (const u of (store.units || [])) {
        if (u?.id != null) unitIndex.set(String(u.id).trim().toLowerCase(), u);
      }
      lastUnitArr = store.units;
    }
    return unitIndex;
  }

  const productIndex = new Map<string, Product>();
  let lastProductArr: any = null;
  function getProductIndex() {
    if (store.products !== lastProductArr) {
      productIndex.clear();
      for (const p of (store.products || [])) {
        if (p?.id != null) productIndex.set(String(p.id).trim().toLowerCase(), p);
      }
      lastProductArr = store.products;
    }
    return productIndex;
  }

  const contractItemIndex = new Map<string, ContractItem>();
  let lastCIArr: any = null;
  function getContractItemIndex() {
    if (store.contractItems !== lastCIArr) {
      contractItemIndex.clear();
      for (const ci of (store.contractItems || [])) {
        if (ci?.id != null) contractItemIndex.set(String(ci.id).trim().toLowerCase(), ci);
      }
      lastCIArr = store.contractItems;
    }
    return contractItemIndex;
  }

  function findCustomer(id: number | string | null): Customer | undefined {
    if (id == null) return undefined;
    const str = String(id).trim().toLowerCase();
    const hit = getCustomerIndex().get(str);
    if (hit) return hit;
    return (store.customers || []).find((c) => String(c.id).trim().toLowerCase() === str);
  }

  function findTechnician(id: number | string | null): Technician | undefined {
    if (id == null) return undefined;
    const str = String(id).trim().toLowerCase();
    const hit: any = getTechIndex().get(str);
    if (hit) {
      if (!hit.name && hit.user?.name) hit.name = hit.user.name;
      return hit;
    }
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
    const hit = getUnitIndex().get(str);
    if (hit) return hit;
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
    const hit = getProductIndex().get(str);
    if (hit) return hit;
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
    const hit = getContractItemIndex().get(str);
    if (hit) return hit;
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
    const custIdStr = String(customerId).trim().toLowerCase();
    const unitIds = new Set<string>();

    // 1. From Rents / Rentals (Unit yang dirental customer)
    (store.rents || []).forEach((r: any) => {
      const rCust = String(r.customer_id || r.customer?.id || "").trim().toLowerCase();
      if (rCust === custIdStr) {
        if (Array.isArray(r.rental_items)) {
          r.rental_items.forEach((item: any) => {
            if (item.unit_id) unitIds.add(String(item.unit_id).toLowerCase());
          });
        }
      }
    });

    // 2. From Contract Items & Contracts
    (store.contractItems || []).forEach((c: any) => {
      const cCust = String(c.customer_id || c.contract?.customer_id || "").trim().toLowerCase();
      if (cCust === custIdStr && c.unit_id) {
        unitIds.add(String(c.unit_id).toLowerCase());
      }
    });

    // 3. From Delivery Orders
    (store.deliveryOrders || []).forEach((d: any) => {
      const dCust = String(d.customer_id || "").trim().toLowerCase();
      if (dCust === custIdStr) {
        if (d.unit_id) unitIds.add(String(d.unit_id).toLowerCase());
        if (Array.isArray(d.delivery_order_items)) {
          d.delivery_order_items.forEach((doi: any) => {
            if (doi.unit_id) unitIds.add(String(doi.unit_id).toLowerCase());
          });
        }
      }
    });

    // 4. From Service Reports
    (store.serviceReports || []).forEach((sr: any) => {
      const srCust = String(sr.customer_id || "").trim().toLowerCase();
      if (srCust === custIdStr && sr.unit_id) {
        unitIds.add(String(sr.unit_id).toLowerCase());
      }
    });

    // 5. From Sales
    (store.sales || []).forEach((s: any) => {
      const sCust = String(s.customer_id || "").trim().toLowerCase();
      if (sCust === custIdStr) {
        if (s.unit_id) unitIds.add(String(s.unit_id).toLowerCase());
        if (Array.isArray(s.sale_items)) {
          s.sale_items.forEach((si: any) => {
            if (si.unit_id) unitIds.add(String(si.unit_id).toLowerCase());
          });
        }
      }
    });

    if (unitIds.size === 0) return [];
    const allUnits = store.units || [];
    return allUnits.filter((u) => unitIds.has(String(u.id).toLowerCase()));
  }

  async function fetchUnitsByCustomer(customerId: number | string | null): Promise<Unit[]> {
    if (!customerId) return [];
    try {
      const { data } = await import('@/services/api').then(m => m.default.get(`/atlas-great/customer-units?customer_id=${customerId}`));
      const fetched = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      if (fetched.length > 0) {
        const existingMap = new Map((store.units || []).map((u: any) => [String(u.id).toLowerCase(), u]));
        fetched.forEach((u: any) => {
          if (!existingMap.has(String(u.id).toLowerCase())) {
            store.units.push(u);
          }
        });
        return fetched;
      }
    } catch (e) {
      console.warn("fetchUnitsByCustomer fallback:", e);
    }
    return getUnitsByCustomer(customerId);
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
    refreshInBackground,
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
    fetchUnitsByCustomer,
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
