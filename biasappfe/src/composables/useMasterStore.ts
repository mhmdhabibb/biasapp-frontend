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
  "/customer-service/rentals": ["rentalInvoices", "contractItems", "units", "customers"],
  "/customer-service/rental-invoices": ["rentalInvoices", "payments", "contractItems", "customers", "units"],
  "/customer-service/sales": ["sales", "salesInvoices", "customers", "units"],
  "/customer-service/sales-invoices": ["salesInvoices", "sales", "customers", "units"],
  "/customer-service/service-reports": ["serviceReports", "technicians", "units", "customers"],
  "/customer-service/contract-items": ["contractItems", "customers", "units", "brands", "unitTypes"],
  "/customer-service/job-orders": ["jobOrders", "serviceRequests", "technicians", "units", "customers"],
  "/customer-service/service-requests": ["serviceRequests", "customers", "units"],
  "/customer-service/monthly-meter-readings": ["monthlyMeterReadings", "contractItems", "units", "customers"],
  "/customer-service/payments": ["payments", "rentalInvoices", "salesInvoices", "customers"],
  "/customer-service/warranty-claims": ["warrantyClaims", "units", "customers", "warranties"],
  "/customer-service/sparepart-request": ["sparepartRequests", "serviceReports", "units", "customers"],
  "/customer-service/maintenance": ["jobOrders", "serviceReports", "units", "technicians", "customers"],
  "/customer-service/indent": ["indents", "products", "suppliers"],
  "/customer-service/delivery": ["deliveryOrders", "purchaseOrders", "customers"],
  "/accounting/purchase-orders": ["purchaseOrders", "suppliers", "products"],
  "/accounting/delivery-orders": ["deliveryOrders", "purchaseOrders", "customers"],
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
  "/master/warranties": ["warranties"],
  "/master/excel-templates": ["excelTemplates"],
  "/master/suppliers": ["suppliers"],
  "/master/contracts": ["contracts", "contractItems", "customers"],
  "/technician/call-services": ["serviceReports", "technicians", "units", "customers"],
  "/technician/maintenance": ["jobOrders", "serviceReports", "units", "technicians", "customers"],
  "/technician/sparepart-request": ["sparepartRequests", "serviceReports", "units"],
  "/technician/meter-readings": ["monthlyMeterReadings", "contractItems", "units"],
  "/technician/service-history": ["serviceReports", "technicians", "units"],
  "/technician/standalone-service-history": ["serviceReports", "technicians", "units"],
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
    const DROPDOWN_LIMIT = 1000;
    const fetchAll = (name: keyof typeof resources, limit?: number) =>
      tracksLoading
        ? resources.fetchAll(name, limit ? { limit } : undefined, true)
        : resources.fetchAllSilent(name, limit ? { limit } : undefined);
    return {
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
  }

  function runSyncTasks(names: string[] | null, tracksLoading: boolean) {
    if (syncing && syncPromise) return syncPromise;
    syncing = true;

    const isFullSync = !names || names.length === 0;
    const registry = buildSyncTasks(tracksLoading);
    const picked = (
      names && names.length > 0
        ? names.map((name) => registry[name]).filter(Boolean)
        : Object.values(registry)
    ) as Array<() => Promise<void>>;

    syncPromise = Promise.all(picked.map((task) => task()))
      .then(() => {
        if (names) names.forEach((n) => loadedResources.value.add(n));
      })
      .finally(() => {
        syncing = false;
        if (isFullSync) lastFullSyncAt = Date.now();
      });
    return syncPromise;
  }

  function syncFromApi(force = false, tracksLoading = true) {
    if (syncPromise && !force) return syncPromise;
    return runSyncTasks(null, tracksLoading);
  }

  function loadCriticalResources(tracksLoading = true) {
    return runSyncTasks(CRITICAL_RESOURCES as string[], tracksLoading);
  }

  function loadResourcesForPage(path: string, tracksLoading = true) {
    const needed = PAGE_RESOURCE_MAP[path] || [];
    const notLoaded = needed.filter((r) => !loadedResources.value.has(r));
    if (notLoaded.length === 0) return Promise.resolve();
    return runSyncTasks(notLoaded, tracksLoading);
  }

  function ensureResourcesLoaded(path: string) {
    return loadCriticalResources(false).then(() => loadResourcesForPage(path, false));
  }

  function refreshInBackground() {
    return syncFromApi(true, false);
  }

  async function refreshOnly(names: string[]) {
    if (!names || names.length === 0) return refreshInBackground();
    const registry = buildSyncTasks(false);
    const tasks = names.map((name) => registry[name]).filter(Boolean);
    await Promise.all(tasks.map((task) => task()));
    names.forEach((n) => loadedResources.value.add(n));
  }

  function refreshIfStale(maxAgeMs = 15000) {
    if (Date.now() - lastFullSyncAt < maxAgeMs) return Promise.resolve();
    return refreshInBackground();
  }

  loadCriticalResources();

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

  function findRentalInvoice(id: number | null): RentalInvoice | undefined {
    return (store.rentalInvoices || []).find((ri) => ri.id === id);
  }

  function findSale(id: number | null): Sale | undefined {
    return (store.sales || []).find((s) => s.id === id);
  }

  function findSalesInvoice(id: any): SalesInvoice | undefined {
    return (store.salesInvoices || []).find((si) => si.id === id);
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
  };
}
