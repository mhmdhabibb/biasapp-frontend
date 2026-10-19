import { api, type ApiResponse } from "./api";

export interface LoginRequest {
  username: string;
  password: string;
}
export interface LoginResponse {
  token: string;
}

export interface MeResponse {
  id: string;
  name: string;
  username: string;
  role: string;
  permissions: string[];
}

export const authService = {
  login(credentials: LoginRequest) {
    return api.post<ApiResponse<LoginResponse>>("/auth/login", credentials);
  },
  me() {
    return api.get<ApiResponse<MeResponse>>("/auth/me");
  },
};
