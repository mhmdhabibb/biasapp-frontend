import { useAuth } from "@/composables/useAuth";
import { computed } from "vue";

/**
 * Exact-match permission checks against `module:action` strings
 * (e.g. "customer:create", "job_order:approve").
 * admin/superadmin roles bypass all checks (see auth.store hasPermission).
 */
export function usePermission() {
  const { hasPermission, currentUser } = useAuth();

  function can(permission: string): boolean {
    return hasPermission(permission);
  }

  function canAny(...permissions: string[]): boolean {
    return permissions.some((p) => hasPermission(p));
  }

  function canCreate(module: string) {
    return can(`${module}:create`);
  }
  function canRead(module: string) {
    return can(`${module}:read`);
  }
  /** Page/sidebar visibility grant. `read` only unlocks the API. */
  function canView(module: string) {
    return can(`${module}:view`);
  }
  function canUpdate(module: string) {
    return can(`${module}:update`);
  }
  function canDelete(module: string) {
    return can(`${module}:delete`);
  }
  function canApprove(module: string) {
    return can(`${module}:approve`);
  }

  const isAdmin = computed(
    () =>
      currentUser.value?.role === "admin" ||
      currentUser.value?.role === "superadmin",
  );

  return { can, canAny, canCreate, canRead, canUpdate, canDelete, canApprove, isAdmin };
}
