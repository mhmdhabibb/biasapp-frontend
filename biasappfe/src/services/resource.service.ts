import { api, type ApiResponse, type PaginatedResponse } from "./api";

export type ResourceRecord = Record<string, unknown> & { id: string };

export interface ResourceQuery {
  page?: number;
  limit?: number;
  search?: string;
  order_by?: string;
  order_dir?: "asc" | "desc";
}

function toQueryString(query: ResourceQuery = {}) {
  const params = new URLSearchParams({
    page: String(query.page || 1),
    limit: String(query.limit || 1000),
  });
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && key !== "page" && key !== "limit")
      params.set(key, String(value));
  });
  return params.toString();
}

export function createResourceService<T extends ResourceRecord>(
  resource: string,
) {
  const path = `/${resource}`;
  return {
    list(query?: ResourceQuery, tracksLoading = true, useCache = true) {
      return api.get<PaginatedResponse<T>>(
        `${path}/?${toQueryString(query)}`,
        tracksLoading,
        useCache,
      );
    },
    get(id: string) {
      return api.get<ApiResponse<T>>(`${path}/${id}`);
    },
    create(data: Partial<T>) {
      return api.post<ApiResponse<T>>(`${path}/`, data);
    },
    update(id: string, data: Partial<T>) {
      return api.put<ApiResponse<T>>(`${path}/${id}`, data);
    },
    remove(id: string, cascade = false, reason?: string) {
      const params = new URLSearchParams();
      if (cascade) params.set("cascade", "true");
      if (reason) params.set("reason", reason);
      const q = params.toString() ? `?${params.toString()}` : "";
      return api.delete<ApiResponse<null>>(`${path}/${id}${q}`);
    },
    /**
     * Permanent (hard) delete. Backend only honors this when
     * `?permanent=true` is sent by a superadmin; other roles get 403
     * and the row stays soft-deleted at most.
     */
    hardRemove(id: string, cascade = false, reason?: string) {
      const params = new URLSearchParams();
      params.set("permanent", "true");
      if (cascade) params.set("cascade", "true");
      if (reason) params.set("reason", reason);
      return api.delete<ApiResponse<null>>(`${path}/${id}?${params.toString()}`);
    },
  };

}

export const resources = {
  users: createResourceService<ResourceRecord>("users"),
  roles: createResourceService<ResourceRecord>("roles"),
  permissions: createResourceService<ResourceRecord>("permissions"),
  modules: createResourceService<ResourceRecord>("modules"),
  customers: createResourceService<ResourceRecord>("customers"),
  technicians: createResourceService<ResourceRecord>("technicians"),
  brands: createResourceService<ResourceRecord>("brands"),
  unitTypes: createResourceService<ResourceRecord>("unit-types"),
  paperSizes: createResourceService<ResourceRecord>("paper-sizes"),
  paperTypes: createResourceService<ResourceRecord>("paper-types"),
  units: createResourceService<ResourceRecord>("units"),
  productCategories:
    createResourceService<ResourceRecord>("product-categories"),
  uoms: createResourceService<ResourceRecord>("uoms"),
  products: createResourceService<ResourceRecord>("products"),
  contracts: createResourceService<ResourceRecord>("contracts"),
  contractItems: createResourceService<ResourceRecord>("contract-items"),
  rents: createResourceService<ResourceRecord>("rents"),
  rentals: createResourceService<ResourceRecord>("rents"),
  serviceRequests: createResourceService<ResourceRecord>("service-requests"),
  jobOrders: createResourceService<ResourceRecord>("job-orders"),
  serviceReports: createResourceService<ResourceRecord>("service-reports"),
  serviceSpareparts:
    createResourceService<ResourceRecord>("service-spareparts"),
  monthlyMeterReadings: createResourceService<ResourceRecord>(
    "monthly-meter-readings",
  ),
  sales: createResourceService<ResourceRecord>("sales"),
  saleItems: createResourceService<ResourceRecord>("sale-items"),
  deliveryOrders: createResourceService<ResourceRecord>("delivery-orders"),
  deliveryOrderItems: createResourceService<ResourceRecord>(
    "delivery-order-items",
  ),
  warranties: createResourceService<ResourceRecord>("warranties"),
  warrantyClaims: createResourceService<ResourceRecord>("warranty-claims"),
  rentalInvoices: createResourceService<ResourceRecord>("rental-invoices"),
  rentalInvoiceMeterDetails: createResourceService<ResourceRecord>(
    "rental-invoice-meter-details",
  ),
  salesInvoices: createResourceService<ResourceRecord>("sales-invoices"),
  salesInvoiceItems: createResourceService<ResourceRecord>(
    "sales-invoice-items",
  ),
  excelTemplates: createResourceService<ResourceRecord>("excel-templates"),
  purchaseOrders: createResourceService<ResourceRecord>("purchase-orders"),
  purchaseOrderItems: createResourceService<ResourceRecord>(
    "purchase-order-items",
  ),
  payments: createResourceService<ResourceRecord>("payments"),
  surveys: createResourceService<ResourceRecord>("surveys"),
  atlasGreatReadings: {
    ...createResourceService<ResourceRecord>("atlas-great-readings"),
    getLatestMeter: (params: { customer_type?: string; unit_id?: string }) =>
      api.get("/atlas-great-readings/latest-meter", { params }),
  },
  stockMovements: {
    ...createResourceService<ResourceRecord>("stock-movements"),
    applyOpname: (data: { product_id: string; actual_stock: number; notes: string }) =>
      api.post("/stock-movements/adjustment", data),
    getSummary: () => api.get("/stock-movements/summary"),
  },
};
