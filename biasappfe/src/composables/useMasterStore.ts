// @ts-nocheck
import { useResourcesStore } from "@/stores/resources.store";
import { useAuthStore } from "@/stores/auth.store";
import type {
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
    if (authStore.currentUser?.role === 'admin' || authStore.currentUser?.role === 'superadmin') return true;
    const perms = authStore.currentUser?.permissions || [];
    const resBase = resourceName.toLowerCase().replace(/[^a-z]/g, '').replace(/s/g, '');
    return perms.some(p => {
      const pMod = p.split(':')[0].toLowerCase();
      const pBase = pMod.replace(/[^a-z]/g, '').replace(/s/g, '');
      return pBase === resBase;
    });
  }

  function syncFromApi(force = false) {
    if (syncPromise && !force) return syncPromise;
    
    const safeFetch = (fetchPromise: Promise<any>, assignCallback: (items: any) => void) => {
      return fetchPromise
        .then(items => { if (items) assignCallback(items); })
        .catch(err => { console.warn("Failed to fetch data:", err); });
    };

    const tasks: Promise<void>[] = [
      safeFetch(resources.fetchAll("customers"), items => store.customers = items),
      safeFetch(resources.fetchAll("technicians"), items => store.technicians = items),
      safeFetch(resources.fetchAll("units"), items => store.units = items),
      safeFetch(resources.fetchAll("products"), items => store.products = items),
      safeFetch(resources.fetchAll("warranties"), items => store.warranties = items),
      safeFetch(resources.fetchAll("contractItems"), items => store.contractItems = items),
      safeFetch(resources.fetchAll("serviceReports"), items => store.serviceReports = items),
      safeFetch(resources.fetchAll("serviceRequests"), items => store.serviceRequests = items),
      safeFetch(resources.fetchAll("jobOrders"), items => store.jobOrders = items),
      safeFetch(resources.fetchAll("monthlyMeterReadings"), items => store.monthlyMeterReadings = items),
      safeFetch(resources.fetchAll("sales"), items => store.sales = items),
      safeFetch(resources.fetchAll("rentalInvoices"), items => store.rentalInvoices = items),
      safeFetch(resources.fetchAll("salesInvoices"), items => store.salesInvoices = items),
      safeFetch(resources.fetchAll("payments"), items => store.payments = items),
      safeFetch(resources.fetchAll("warrantyClaims"), items => store.warrantyClaims = items),
      safeFetch(resources.fetchAll("serviceSpareparts"), items => { if (items.length > 0) store.sparepartRequests = items; }),
      safeFetch(resources.fetchAll("deliveryOrders"), items => store.deliveryOrders = items)
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

  function findProduct(id: number | string | null): Product | undefined {
    return store.products.find((p) => (p.id as any) == id);
  }

  function findWarranty(id: number | string | null): Warranty | undefined {
    return store.warranties.find((w) => (w.id as any) == id);
  }

  function findContractItem(id: number | null): ContractItem | undefined {
    return store.contractItems.find((ci) => ci.id === id);
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

  function getContractsByCustomer(customerId: number | string | null): ContractItem[] {
    if (!customerId) return [];
    return store.contractItems.filter((c) => (c.customer_id as any) == customerId);
  }

  function getServiceReportsByTechnician(
    technicianId: number | null,
  ): ServiceReport[] {
    if (!technicianId) return [];
    return store.serviceReports.filter(
      (sr) => sr.technician_id === technicianId,
    );
  }

  return {
    ...toRefs(store),
    refresh: syncFromApi,
    findCustomer,
    findTechnician,
    findUnit,
    findProduct,
    findWarranty,
    findContractItem,
    findServiceReport,
    findRentalInvoice,
    findSale,
    findSalesInvoice,
    getUnitsByCustomer,
    getContractsByCustomer,
    getServiceReportsByTechnician,
  };
}
