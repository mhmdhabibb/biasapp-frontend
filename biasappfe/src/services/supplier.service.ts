import type { Supplier } from "@/types";
import { api, type ApiResponse, type PaginatedResponse } from "./api";

export const supplierService = {
  list() {
    return api.get<PaginatedResponse<Supplier>>("/suppliers/?page=1&limit=100");
  },
  create(data: Partial<Supplier>) {
    return api.post<ApiResponse<null>>("/suppliers/", data);
  },
  update(id: string, data: Partial<Supplier>) {
    return api.put<ApiResponse<null>>(`/suppliers/${id}`, data);
  },
  remove(id: string) {
    return api.delete<ApiResponse<null>>(`/suppliers/${id}`);
  },
};
