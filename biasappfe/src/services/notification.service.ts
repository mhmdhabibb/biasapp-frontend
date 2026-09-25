import type { Notification } from "@/types";
import { api, type ApiResponse, type PaginatedResponse } from "./api";

export const notificationService = {
  list() {
    return api.get<PaginatedResponse<Notification>>("/notifications/?page=1&limit=100");
  },
  create(data: Partial<Notification>) {
    return api.post<ApiResponse<null>>("/notifications/", data);
  },
  update(id: string, data: Partial<Notification>) {
    return api.put<ApiResponse<null>>(`/notifications/${id}`, data);
  },
  remove(id: string) {
    return api.delete<ApiResponse<null>>(`/notifications/${id}`);
  },
};
