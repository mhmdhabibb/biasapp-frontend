import { ref } from "vue";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4008/api"
).replace(/\/$/, "");

export const activeApiRequests = ref(0);

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

async function request<T>(
  path: string,
  options: RequestInit = {},
  tracksLoading = !options.method || options.method === "GET",
): Promise<T> {
  if (tracksLoading) activeApiRequests.value++;
  try {
    const headers = new Headers(options.headers);
    headers.set("Content-Type", "application/json");
    const token = sessionStorage.getItem("bias_token");
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;
    if (!response.ok) {
      if (response.status === 401) sessionStorage.removeItem("bias_token");
      
      let errorMsg = body?.message || body?.error;
      if (!errorMsg) {
        if (response.status === 413) {
          errorMsg = "Payload too large! Please check photo sizes.";
        } else {
          errorMsg = `Server error ${response.status}: ${response.statusText || 'Unknown'}`;
        }
      }
      
      throw new ApiError(errorMsg, response.status);
    }
    return body as T;
  } finally {
    if (tracksLoading) activeApiRequests.value--;
  }
}

export const api = {
  get: <T>(path: string, tracksLoading = true) =>
    request<T>(path, {}, tracksLoading),
  post: <T>(path: string, data: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(data) }),
  put: <T>(path: string, data: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Upload multipart/form-data (mis. file Excel). Tanpa header JSON. */
export async function uploadFile<T>(
  path: string,
  formData: FormData,
  tracksLoading = false,
): Promise<T> {
  if (tracksLoading) activeApiRequests.value++;
  try {
    const headers = new Headers();
    const token = sessionStorage.getItem("bias_token");
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      body: formData,
      headers,
    });
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;
    if (!response.ok) {
      if (response.status === 401) sessionStorage.removeItem("bias_token");
      throw new ApiError(
        body?.message || body?.error || "A server error occurred",
        response.status,
      );
    }
    return body as T;
  } finally {
    if (tracksLoading) activeApiRequests.value--;
  }
}

export async function downloadFile(
  path: string,
  filename: string,
): Promise<void> {
  const headers = new Headers();
  const token = sessionStorage.getItem("bias_token");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, { headers });
  if (!response.ok) {
    if (response.status === 401) sessionStorage.removeItem("bias_token");
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;
    throw new ApiError(
      body?.message || body?.error || "A server error occurred",
      response.status,
    );
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
