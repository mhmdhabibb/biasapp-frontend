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
import { reactive, toRefs } from "vue";

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

let syncPromise: Promise<void> | null = null;
let syncing = false;
let lastFullSyncAt = 0;

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
          fetchAll("customers"),
          (items) => (store.customers = items || []),
        ),
      technicians: () =>
        safeFetch(
          fetchAll("technicians"),
          (items) => (store.technicians = items || []),
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
          fetchAll("warranties"),
          (items) => (store.warranties = items || []),
        ),
      contractItems: () =>
        safeFetch(
          fetchAll("contractItems"),
          (items) => (store.contractItems = items || []),
        ),
      serviceReports: () =>
        safeFetch(
          fetchAll("serviceReports"),
          (items) => (store.serviceReports = items || []),
        ),
      serviceRequests: () =>
        safeFetch(
          fetchAll("serviceRequests"),
          (items) => (store.serviceRequests = items || []),
        ),
      jobOrders: () =>
        safeFetch(
          fetchAll("jobOrders"),
          (items) => (store.jobOrders = items || []),
        ),
      monthlyMeterReadings: () =>
        safeFetch(
          fetchAll("monthlyMeterReadings"),
          (items) => (store.monthlyMeterReadings = items || []),
        ),
      sales: () =>
        safeFetch(fetchAll("sales"), (items) => (store.sales = items || [])),
      rentalInvoices: () =>
        safeFetch(
          fetchAll("rentalInvoices"),
          (items) => (store.rentalInvoices = items || []),
        ),
      salesInvoices: () =>
        safeFetch(
          fetchAll("salesInvoices"),
          (items) => (store.salesInvoices = items || []),
        ),
      payments: () =>
        safeFetch(
          fetchAll("payments"),
          (items) => (store.payments = items || []),
        ),
      warrantyClaims: () =>
        safeFetch(
          fetchAll("warrantyClaims"),
          (items) => (store.warrantyClaims = items || []),
        ),
      serviceSpareparts: () =>
        safeFetch(
          fetchAll("serviceSpareparts"),
          (items) => (store.sparepartRequests = items || []),
        ),
      purchaseOrders: () =>
        safeFetch(
          fetchAll("purchaseOrders"),
          (items) => (store.purchaseOrders = items || []),
        ),
      deliveryOrders: () =>
        safeFetch(fetchAll("deliveryOrders"), (items) => {
          const validItems = items || [];
          store.deliveryOrders = validItems;
          store.procurementDeliveryOrders = validItems.filter(
            (d: any) => d.purchase_order_id || d.do_type === "inbound",
          );
        }),
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
      .then(() => undefined)
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

  // --- PEMBETULAN UTAMA: Deklarasi eksplisit fungsi internal agar tidak ReferenceError ---
  function refreshInBackground() {
    return syncFromApi(true, false);
  }

  /** Refresh ringan: hanya resource yang disebut, selalu silent (tanpa loading). */
  function refreshOnly(names: string[]) {
    if (!names || names.length === 0) return refreshInBackground();
    return runSyncTasks(names, false);
  }

  /**
   * Refresh hanya bila data terakhir sudah basi (lebih tua dari maxAgeMs).
   */
  function refreshIfStale(maxAgeMs = 15000) {
    if (Date.now() - lastFullSyncAt < maxAgeMs) return Promise.resolve();
    return refreshInBackground();
  }

  syncFromApi();

  function findCustomer(id: number | string | null): Customer | undefined {
    return (store.customers || []).find((c) => (c.id as any) == id);
  }

  function findTechnician(id: number | string | null): Technician | undefined {
    return (store.technicians || []).find((t) => (t.id as any) == id);
  }

  function findUnit(id: number | string | null): Unit | undefined {
    return (store.units || []).find((u) => (u.id as any) == id);
  }

  function findBrand(
    id: number | string | null | undefined,
  ): Brand | undefined {
    if (id == null) return undefined;
    return (store.brands || []).find((b) => (b.id as any) == id);
  }

  function findUnitType(
    id: number | string | null | undefined,
  ): UnitType | undefined {
    if (id == null) return undefined;
    return ((store.unitTypes as UnitType[]) || []).find(
      (u) => (u.id as any) == id,
    );
  }

  function findProduct(id: number | string | null): Product | undefined {
    return (store.products || []).find((p) => (p.id as any) == id);
  }

  function findWarranty(id: number | string | null): Warranty | undefined {
    return (store.warranties || []).find((w) => (w.id as any) == id);
  }

  function findContractItem(
    id: number | string | null | undefined,
  ): ContractItem | undefined {
    if (id == null) return undefined;
    return (store.contractItems || []).find((ci) => (ci.id as any) == id);
  }

  function findServiceReport(
    id: number | string | null,
  ): ServiceReport | undefined {
    const idNum = typeof id === "string" ? parseInt(id, 10) : id;
    return (store.serviceReports || []).find((sr) => sr.id === idNum);
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
    // First find contracts by customer (support both direct customer_id and nested contract.customer_id)
    const relevantContracts = (store.contractItems || []).filter((c) => {
      const custIdStr = String(customerId);
      const cCustId = c.customer_id ? String(c.customer_id) : undefined;
      const cCustIdNested = c.contract?.customer_id
        ? String(c.contract.customer_id)
        : undefined;
      return cCustId === custIdStr || cCustIdNested === custIdStr;
    });
    // Collect unique unit_ids from these contracts
    const unitIds = [
      ...new Set(
        relevantContracts
          .map((c) => c.unit_id)
          .filter((id): id is number | string => id != null),
      ),
    ];
    // Return units matching those IDs
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

  // service_report.technician_id references technicians.id (not users.id), so pages must resolve the logged-in user -> technicians row first.
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
    findCustomer,
    findTechnician,
    findUnit,
    findBrand,
    findUnitType,
    findProduct,
    findWarranty,
    findContractItem,
    findServiceReport,
    findRentalInvoice,
    findSale,
    findSalesInvoice,
    getUnitsByCustomer,
    getContractsByCustomer,
    getTechnicianIdByUser,
    getServiceReportsByTechnician,
  };
}
