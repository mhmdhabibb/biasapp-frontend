import { api, type ApiResponse } from "./api";

export interface LoginRequest {
  username: string;
  password: string;
}
export interface LoginResponse {
  token: string;
}

export const authService = {
  login(credentials: LoginRequest) {
    return api.post<ApiResponse<LoginResponse>>("/auth/login", credentials);
  },
};
