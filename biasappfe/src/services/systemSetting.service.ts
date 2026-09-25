import type { SystemSetting } from "@/types";
import { api, type ApiResponse, type PaginatedResponse } from "./api";

export const systemSettingService = {
  list() {
    return api.get<PaginatedResponse<SystemSetting>>("/system-settings/?page=1&limit=100");
  },
  create(data: Partial<SystemSetting>) {
    return api.post<ApiResponse<null>>("/system-settings/", data);
  },
  update(id: string, data: Partial<SystemSetting>) {
    return api.put<ApiResponse<null>>(`/system-settings/${id}`, data);
  },
  remove(id: string) {
    return api.delete<ApiResponse<null>>(`/system-settings/${id}`);
  },
};
