import { reactive, toRefs } from 'vue'
import type {
  Customer,
  Technician,
  Unit,
  Product,
  Warranty,
  ContractItem,
  ServiceReport,
  MonthlyMeterReading,
  Sale,
  RentalInvoice,
  SalesInvoice,
  Payment,
  WarrantyClaim,
  SparepartRequest,
  Indent,
  DeliveryOrder,
} from '@/types'

const store = reactive({
  customers: [] as Customer[],
  technicians: [] as Technician[],
  units: [] as Unit[],
  products: [] as Product[],
  warranties: [] as Warranty[],

  contractItems: [] as ContractItem[],
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
})

export function useMasterStore() {
  function findCustomer(id: number | null): Customer | undefined {
    return store.customers.find((c) => c.id === id)
  }

  function findTechnician(id: number | null): Technician | undefined {
    return store.technicians.find((t) => t.id === id)
  }

  function findUnit(id: number | null): Unit | undefined {
    return store.units.find((u) => u.id === id)
  }

  function findProduct(id: number | null): Product | undefined {
    return store.products.find((p) => p.id === id)
  }

  function findWarranty(id: number | null): Warranty | undefined {
    return store.warranties.find((w) => w.id === id)
  }

  function findContractItem(id: number | null): ContractItem | undefined {
    return store.contractItems.find((ci) => ci.id === id)
  }

  function findServiceReport(id: number | null): ServiceReport | undefined {
    return store.serviceReports.find((sr) => sr.id === id)
  }

  function findRentalInvoice(id: number | null): RentalInvoice | undefined {
    return store.rentalInvoices.find((ri) => ri.id === id)
  }

  function findSale(id: number | null): Sale | undefined {
    return store.sales.find((s) => s.id === id)
  }

  function getUnitsByCustomer(customerId: number | null): Unit[] {
    if (!customerId) return []
    // Find all contract items for this customer
    const customerContracts = store.contractItems.filter(c => c.customer_id === customerId)
    const unitIds = customerContracts.map(c => c.unit_id).filter(id => id !== null) as number[]
    // Return unique units
    return store.units.filter(u => unitIds.includes(u.id))
  }

  function getContractsByCustomer(customerId: number | null): ContractItem[] {
    if (!customerId) return []
    return store.contractItems.filter(c => c.customer_id === customerId)
  }

  function getServiceReportsByTechnician(technicianId: number | null): ServiceReport[] {
    if (!technicianId) return []
    return store.serviceReports.filter(sr => sr.technician_id === technicianId)
  }

  return {
    ...toRefs(store),
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
  }
}
