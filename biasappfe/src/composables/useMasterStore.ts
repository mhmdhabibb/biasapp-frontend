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
  units: [] as Unit[],
  products: [] as Product[],
  warranties: [] as Warranty[],

  contractItems: [] as ContractItem[],
  serviceRequests: [] as any[], // Using any[] to bypass types for now
  jobOrders: [] as any[], // Using any[] to bypass types for now
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

  function syncFromApi(force = false, tracksLoading = true) {
    if (syncPromise && !force) return syncPromise;

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

    const fetchAll = (name: keyof typeof resources) =>
      resources.fetchAll(name, undefined, tracksLoading);

    const tasks: Promise<void>[] = [
      safeFetch(fetchAll("customers"), (items) => (store.customers = items)),
      safeFetch(
        fetchAll("technicians"),
        (items) => (store.technicians = items),
      ),
      safeFetch(fetchAll("brands"), (items) => (store.brands = items)),
      safeFetch(fetchAll("units"), (items) => (store.units = items)),
      safeFetch(fetchAll("products"), (items) => (store.products = items)),
      safeFetch(fetchAll("warranties"), (items) => (store.warranties = items)),
      safeFetch(
        fetchAll("contractItems"),
        (items) => (store.contractItems = items),
      ),
      safeFetch(
        fetchAll("serviceReports"),
        (items) => (store.serviceReports = items),
      ),
      safeFetch(
        fetchAll("serviceRequests"),
        (items) => (store.serviceRequests = items),
      ),
      safeFetch(fetchAll("jobOrders"), (items) => (store.jobOrders = items)),
      safeFetch(
        fetchAll("monthlyMeterReadings"),
        (items) => (store.monthlyMeterReadings = items),
      ),
      safeFetch(fetchAll("sales"), (items) => (store.sales = items)),
      safeFetch(
        fetchAll("rentalInvoices"),
        (items) => (store.rentalInvoices = items),
      ),
      safeFetch(
        fetchAll("salesInvoices"),
        (items) => (store.salesInvoices = items),
      ),
      safeFetch(fetchAll("payments"), (items) => (store.payments = items)),
      safeFetch(
        fetchAll("warrantyClaims"),
        (items) => (store.warrantyClaims = items),
      ),
      safeFetch(
        fetchAll("serviceSpareparts"),
        (items) => (store.sparepartRequests = items),
      ),
      safeFetch(
        fetchAll("purchaseOrders"),
        (items) => (store.purchaseOrders = items),
      ),
      safeFetch(fetchAll("deliveryOrders"), (items) => {
        store.deliveryOrders = items;
        // Inbound (procurement) shipments are the ones linked to a purchase order.
        store.procurementDeliveryOrders = items.filter(
          (d: any) => d.purchase_order_id || d.do_type === "inbound",
        );
      }),
    ];

    syncPromise = Promise.all(tasks).then(() => undefined);
    return syncPromise;
  }

  syncFromApi();

  function findCustomer(id: number | string | null): Customer | undefined {
    return store.customers.find((c) => (c.id as any) == id);
  }

  function findTechnician(id: number | string | null): Technician | undefined {
    return store.technicians.find((t) => (t.id as any) == id);
  }

  function findUnit(id: number | string | null): Unit | undefined {
    return store.units.find((u) => (u.id as any) == id);
  }

  function findBrand(
    id: number | string | null | undefined,
  ): Brand | undefined {
    if (id == null) return undefined;
    return store.brands.find((b) => (b.id as any) == id);
  }

  function findProduct(id: number | string | null): Product | undefined {
    return store.products.find((p) => (p.id as any) == id);
  }

  function findWarranty(id: number | string | null): Warranty | undefined {
    return store.warranties.find((w) => (w.id as any) == id);
  }

  function findContractItem(
    id: number | string | null,
  ): ContractItem | undefined {
    if (id == null) return undefined;
    return store.contractItems.find((ci) => (ci.id as any) == id);
  }

  function findServiceReport(id: number | null): ServiceReport | undefined {
    return store.serviceReports.find((sr) => sr.id === id);
  }

  function findRentalInvoice(id: number | null): RentalInvoice | undefined {
    return store.rentalInvoices.find((ri) => ri.id === id);
  }

  function findSale(id: number | null): Sale | undefined {
    return store.sales.find((s) => s.id === id);
  }

  function findSalesInvoice(id: any): SalesInvoice | undefined {
    return store.salesInvoices.find((si) => si.id === id);
  }

  function getUnitsByCustomer(customerId: number | string | null): Unit[] {
    if (!customerId) return [];
    // Find all contract items for this customer
    const customerContracts = store.contractItems.filter(
      (c) => (c.customer_id as any) == customerId,
    );
    const unitIds = customerContracts
      .map((c) => c.unit_id)
      .filter((id) => id !== null) as any[];
    // Return unique units
    return store.units.filter((u) => unitIds.includes(u.id));
  }

  function getContractsByCustomer(
    customerId: number | string | null,
  ): ContractItem[] {
    if (!customerId) return [];
    return store.contractItems.filter(
      (c) => (c.customer_id as any) == customerId,
    );
  }

  // service_report.technician_id references technicians.id (not users.id),
  // so pages must resolve the logged-in user -> technicians row first.
  function getTechnicianIdByUser(
    userId: number | string | null,
  ): string | null {
    if (!userId) return null;
    const tech = store.technicians.find((t: any) => t.user_id == userId);
    return tech ? String(tech.id) : null;
  }

  function getServiceReportsByTechnician(
    technicianId: number | string | null,
  ): ServiceReport[] {
    if (!technicianId) return [];
    return store.serviceReports.filter(
      (sr) => (sr.technician_id as any) == technicianId,
    );
  }

  return {
    ...toRefs(store),
    refresh: syncFromApi,
    refreshInBackground: () => syncFromApi(true, false),
    findCustomer,
    findTechnician,
    findUnit,
    findBrand,
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
