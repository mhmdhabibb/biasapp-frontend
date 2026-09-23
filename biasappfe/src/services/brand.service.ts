import type { Brand } from "@/types";
import { api, type ApiResponse, type PaginatedResponse } from "./api";

export const brandService = {
  list() {
    return api.get<PaginatedResponse<Brand>>("/brands/?page=1&limit=100");
  },
  create(data: Pick<Brand, "name">) {
    return api.post<ApiResponse<null>>("/brands/", data);
  },
  update(id: string, data: Pick<Brand, "name">) {
    return api.put<ApiResponse<null>>(`/brands/${id}`, data);
  },
  remove(id: string) {
    return api.delete<ApiResponse<null>>(`/brands/${id}`);
  },
};
