import type { Contract } from "@/types";
import { api, type ApiResponse, type PaginatedResponse } from "./api";

export interface ContractListParams {
  page?: number;
  limit?: number;
  search?: string;
  orderBy?: string;
  orderDir?: "asc" | "desc";
}

export const contractService = {
  list(params: ContractListParams = {}) {
    const { page = 1, limit = 20, search, orderBy, orderDir } = params;
    const query = new URLSearchParams();
    query.set("page", String(page));
    query.set("limit", String(limit));
    if (search) query.set("search", search);
    if (orderBy) query.set("order_by", orderBy);
    if (orderDir) query.set("order_dir", orderDir);
    return api.get<PaginatedResponse<Contract>>(`/contracts/?${query.toString()}`);
  },
  create(data: Partial<Contract>) {
    return api.post<ApiResponse<null>>("/contracts/", data);
  },
  update(id: string, data: Partial<Contract>) {
    return api.put<ApiResponse<null>>(`/contracts/${id}`, data);
  },
  remove(id: string, reason?: string) {
    const q = reason ? `?reason=${encodeURIComponent(reason)}` : "";
    return api.delete<ApiResponse<null>>(`/contracts/${id}${q}`);
  },
  hardRemove(id: string, reason?: string) {
    const q = reason ? `&reason=${encodeURIComponent(reason)}` : "";
    return api.delete<ApiResponse<null>>(`/contracts/${id}?permanent=true${q}`);
  },
  renew(id: string, data: { end_date: string }) {
    return api.post<ApiResponse<null>>(`/contracts/${id}/renew`, data);
  },
};
