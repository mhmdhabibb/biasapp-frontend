// @ts-nocheck
import { useResourcesStore } from "@/stores/resources.store";
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
  sparepartRequests: [
    {
      id: 1,
      request_no: 'SR-2026-001',
      service_report_id: 1,
      product_id: 1,
      qty: 2,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 2,
      request_no: 'SR-2026-002',
      service_report_id: 2,
      product_id: 2,
      qty: 1,
      status: 'po_created',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  ] as SparepartRequest[],
  indents: [] as Indent[],
  deliveryOrders: [] as DeliveryOrder[],
  purchaseOrders: [
    {
      id: 1,
      po_no: 'PO-2026-001',
      sparepart_request_id: 2,
      po_date: new Date().toISOString(),
      status: 'approved',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  ] as PurchaseOrder[],
  procurementDeliveryOrders: [] as ProcurementDeliveryOrder[],
});

let syncPromise: Promise<void> | null = null;

export function useMasterStore() {
  const resources = useResourcesStore();

  function syncFromApi() {
    if (syncPromise) return syncPromise;
    syncPromise = Promise.all([
      resources.fetchAll("customers").then((items) => {
        store.customers = items as unknown as Customer[];
      }),
      resources.fetchAll("technicians").then((items) => {
        store.technicians = items as unknown as Technician[];
      }),
      resources.fetchAll("units").then((items) => {
        store.units = items as unknown as Unit[];
      }),
      resources.fetchAll("products").then((items) => {
        store.products = items as unknown as Product[];
      }),
      resources.fetchAll("warranties").then((items) => {
        store.warranties = items as unknown as Warranty[];
      }),
      resources.fetchAll("contractItems").then((items) => {
        store.contractItems = items as unknown as ContractItem[];
      }),
      resources.fetchAll("serviceReports").then((items) => {
        store.serviceReports = items as unknown as ServiceReport[];
      }),
      resources.fetchAll("serviceRequests").then((items) => {
        store.serviceRequests = items as any[];
      }),
      resources.fetchAll("jobOrders").then((items) => {
        store.jobOrders = items as any[];
      }),
      resources.fetchAll("monthlyMeterReadings").then((items) => {
        store.monthlyMeterReadings = items as unknown as MonthlyMeterReading[];
      }),
      resources.fetchAll("sales").then((items) => {
        store.sales = items as unknown as Sale[];
      }),
      resources.fetchAll("rentalInvoices").then((items) => {
        store.rentalInvoices = items as unknown as RentalInvoice[];
      }),
      resources.fetchAll("salesInvoices").then((items) => {
        store.salesInvoices = items as unknown as SalesInvoice[];
      }),
      resources.fetchAll("payments").then((items) => {
        store.payments = items as unknown as Payment[];
      }),
      resources.fetchAll("warrantyClaims").then((items) => {
        store.warrantyClaims = items as unknown as WarrantyClaim[];
      }),
      resources.fetchAll("serviceSpareparts").then((items) => {
        // Keep mock data intact if api returns empty
        if (items.length > 0) store.sparepartRequests = items as unknown as SparepartRequest[];
      }),
      resources.fetchAll("deliveryOrders").then((items) => {
        store.deliveryOrders = items as unknown as DeliveryOrder[];
      }),
    ]).then(() => undefined);
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
    getUnitsByCustomer,
    getContractsByCustomer,
    getServiceReportsByTechnician,
  };
}
