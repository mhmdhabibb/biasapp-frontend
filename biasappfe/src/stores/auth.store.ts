import { ApiError } from "@/services/api";
import { authService, type LoginRequest } from "@/services/auth.service";
import { computed, ref } from "vue";

interface AuthUser {
  id?: number;
  name: string;
  username: string;
  role: string;
  permissions: string[];
}

const token = ref(sessionStorage.getItem("bias_token"));
const currentUser = ref<AuthUser | null>(readUser());
const isLoading = ref(false);
const error = ref("");

function readUser(): AuthUser | null {
  const value = sessionStorage.getItem("bias_user");
  if (!value) return null;
  const user = JSON.parse(value) as AuthUser;
  // Fallback if permissions isn't in session storage yet
  if (!user.permissions) {
    const perms = sessionStorage.getItem("bias_permissions");
    user.permissions = perms ? JSON.parse(perms) : [];
  }
  return user;
}

function decodeUser(jwt: string): AuthUser {
  const payload = JSON.parse(atob(jwt.split(".")[1] || "")) as {
    user_id?: number;
    username?: string;
    role?: string;
  };
  const role = payload.role === "superadmin" ? "admin" : payload.role || "";
  return {
    id: payload.user_id,
    name: payload.username || "User",
    username: payload.username || "",
    role,
    permissions: [], // Permissions will be set after login
  };
}

export function useAuthStore() {
  async function login(credentials: LoginRequest): Promise<boolean> {
    error.value = "";
    if (!credentials.username.trim() || !credentials.password.trim()) {
      error.value = "Username dan password harus diisi";
      return false;
    }

    isLoading.value = true;
    try {
      const response = await authService.login(credentials);
      token.value = response.data.token;
      currentUser.value = decodeUser(token.value);
      // Backend now sends permissions in the login response
      const perms = (response.data as any).permissions || [];
      currentUser.value.permissions = perms;

      sessionStorage.setItem("bias_token", token.value);
      sessionStorage.setItem("bias_user", JSON.stringify(currentUser.value));
      sessionStorage.setItem("bias_permissions", JSON.stringify(perms));
      return true;
    } catch (reason) {
      error.value =
        reason instanceof ApiError
          ? reason.message
          : "Tidak dapat terhubung ke server";
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  function logout() {
    token.value = null;
    currentUser.value = null;
    sessionStorage.removeItem("bias_token");
    sessionStorage.removeItem("bias_user");
    sessionStorage.removeItem("bias_permissions");
  }

  function hasPermission(permissionName: string): boolean {
    if (!currentUser.value) return false;
    // Superadmin has all permissions
    if (currentUser.value.role === "admin" || currentUser.value.role === "superadmin") return true;
    
    return currentUser.value.permissions.includes(permissionName);
  }

  return {
    token: computed(() => token.value),
    isAuthenticated: computed(() => Boolean(token.value)),
    currentUser: computed(() => currentUser.value),
    isLoading: computed(() => isLoading.value),
    error: computed(() => error.value),
    login,
    logout,
    hasPermission,
  };
}
