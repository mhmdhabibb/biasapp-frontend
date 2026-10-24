import { ref } from "vue";
import axios, { AxiosError, type AxiosRequestConfig } from "axios";
import { getOrFetch, invalidateCache } from "@/utils/requestCache";

const API_BASE_URL = (
  "https://api-app.biassuryateknologi.com/api"
).replace(/\/$/, "");

export const activeApiRequests = ref(0);
export const activeMutationRequests = ref(0);

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    page: number;
    limit: number;
    total_items: number;
    total_pages: number;
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Instance axios bersama: base URL + token dari sessionStorage. */
export const http = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

http.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("bias_token");
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  return config;
});

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const axErr = error as AxiosError<{ message?: string; error?: string }>;
  const status = axErr.response?.status ?? 0;
  if (status === 401) sessionStorage.removeItem("bias_token");
  let message = axErr.response?.data?.message || axErr.response?.data?.error;
  if (!message) {
    if (status === 413) {
      message = "Payload too large! Please check photo sizes.";
    } else if (status) {
      message = `Server error ${status}: ${axErr.response?.statusText || "Unknown"}`;
    } else {
      message = axErr.message || "A network error occurred.";
    }
  }
  return new ApiError(message, status);
}

async function request<T>(
  path: string,
  options: AxiosRequestConfig = {},
  tracksLoading = !options.method || options.method === "GET",
  useCache = true,
): Promise<T> {
  const isGet = !options.method || options.method === "GET";
  const cacheKey = isGet ? `GET:${path}` : "";

  if (isGet && tracksLoading) activeApiRequests.value++;

  const fetcher = async (): Promise<T> => {
    const response = await http.request<T>({ url: path, ...options });
    return response.data;
  };

  try {
    const data = isGet && cacheKey && useCache
      ? await getOrFetch<T>(cacheKey, fetcher, true)
      : await fetcher();
    return data;
  } catch (error) {
    throw toApiError(error);
  } finally {
    if (isGet && tracksLoading) activeApiRequests.value--;
  }
}

export const api = {
  get: <T>(path: string, tracksLoading = true, useCache = true) =>
    request<T>(path, {}, tracksLoading, useCache),
  post: <T>(path: string, data: unknown) => {
    return mutate<T>(path, { method: "POST", data });
  },
  put: <T>(path: string, data: unknown) => {
    return mutate<T>(path, { method: "PUT", data });
  },
  patch: <T>(path: string, data: unknown) => {
    return mutate<T>(path, { method: "PATCH", data });
  },
  delete: <T>(path: string) => {
    return mutate<T>(path, { method: "DELETE" });
  },
};

async function mutate<T>(
  path: string,
  options: AxiosRequestConfig,
): Promise<T> {
  invalidateCache(path.split("?")[0]);
  activeMutationRequests.value++;
  try {
    return await request<T>(path, options);
  } finally {
    activeMutationRequests.value--;
  }
}

/**
 * Panggilan axios mentah (tanpa bungkus ApiResponse). Untuk endpoint yang
 * butuh kontrol penuh, mis. mutasi dengan pengecekan res.data.success sendiri.
 */
export async function apiRequest<T = any>(
  config: AxiosRequestConfig,
): Promise<T> {
  const method = (config.method || "GET").toUpperCase();
  if (method !== "GET" && config.url) {
    invalidateCache(config.url);
  }
  try {
    const response = await http.request<T>(config);
    if (method !== "GET" && config.url) {
      invalidateCache(config.url);
    }
    return response.data;
  } catch (error) {
    throw toApiError(error);
  }
}

/** Upload multipart/form-data (mis. file Excel). Tanpa header JSON. */
export async function uploadFile<T>(
  path: string,
  formData: FormData,
  tracksLoading = false,
): Promise<T> {
  if (tracksLoading) activeApiRequests.value++;
  try {
    const response = await http.post<T>(path, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    invalidateCache();
    return response.data;
  } catch (error) {
    throw toApiError(error);
  } finally {
    if (tracksLoading) activeApiRequests.value--;
  }
}

export async function downloadFile(
  path: string,
  filename: string,
): Promise<void> {
  let blob: Blob;
  try {
    const response = await http.get(path, { responseType: "blob" });
    blob = response.data as Blob;
  } catch (error) {
    throw toApiError(error);
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}