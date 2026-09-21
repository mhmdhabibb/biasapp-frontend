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
  }
}
