import type { Contract } from "@/types";
import { api, type ApiResponse, type PaginatedResponse } from "./api";

export const contractService = {
  list() {
    return api.get<PaginatedResponse<Contract>>("/contracts/?page=1&limit=100");
  },
  create(data: Partial<Contract>) {
    return api.post<ApiResponse<null>>("/contracts/", data);
  },
  update(id: string, data: Partial<Contract>) {
    return api.put<ApiResponse<null>>(`/contracts/${id}`, data);
  },
  remove(id: string) {
    return api.delete<ApiResponse<null>>(`/contracts/${id}`);
  },
  hardRemove(id: string) {
    return api.delete<ApiResponse<null>>(`/contracts/${id}?permanent=true`);
  },
  renew(id: string, data: { end_date: string }) {
    return api.post<ApiResponse<null>>(`/contracts/${id}/renew`, data);
  },
};
