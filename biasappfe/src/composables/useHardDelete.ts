import { useAuthStore } from "@/stores/auth.store";
import { computed, reactive, ref } from "vue";
import { useToast } from "./useToast";

/**
 * True only for a real superadmin. The auth store normalizes
 * "superadmin" to "admin" for UI purposes, so the raw JWT payload
 * (which keeps the real role) is decoded instead. `token` is read
 * through the store to stay reactive across login/logout.
 */
export function useIsSuperadmin() {
  const { token } = useAuthStore();
  return computed(() => {
    // Track the store token so this recomputes on login/logout.
    const activeToken = token.value;
    void activeToken;
    try {
      const raw = sessionStorage.getItem("bias_token");
      if (!raw) return false;
      const payload = JSON.parse(atob(raw.split(".")[1] || "")) as {
        role?: string;
      };
      return String(payload.role || "").trim().toLowerCase() === "superadmin";
    } catch {
      return false;
    }
  });
}

/** Best-effort display name used as the type-to-confirm text. */
export function displayNameOf(item: any): string {
  if (!item) return "";
  const v =
    item.name ??
    item.username ??
    item.title ??
    item.company_name ??
    item.serial_no ??
    item.code ??
    item.no ??
    item.id ??
    "";
  return String(v);
}

/**
 * Shared hard-delete (permanent delete) state machine for master pages.
 * The backend only honors `?permanent=true` for superadmin; the dialog
 * additionally requires typing the item name to confirm.
 */
export function useHardDelete(
  removeFn: (id: string) => Promise<unknown>,
  refresh: () => Promise<void> | void,
) {
  const toast = useToast();
  const isSuperadmin = useIsSuperadmin();

  const show = ref(false);
  const target = ref<any>(null);
  const input = ref("");
  const expected = computed(() => displayNameOf(target.value));
  const confirmed = computed(
    () =>
      expected.value.trim() !== "" &&
      input.value.trim() === expected.value.trim(),
  );

  function open(item: any) {
    target.value = item;
    input.value = "";
    show.value = true;
  }

  function close() {
    show.value = false;
  }

  async function confirm() {
    if (!target.value) return;
    if (!confirmed.value) {
      toast.error("Teks konfirmasi tidak cocok. Hapus permanen dibatalkan.");
      return;
    }
    try {
      await removeFn(String(target.value.id));
      await refresh();
      toast.success("Data dihapus permanen dari database.");
    } catch (reason: any) {
      toast.error(
        "Gagal menghapus permanen: " + (reason?.message || "Terjadi kesalahan"),
      );
    } finally {
      show.value = false;
    }
  }

  // Wrapped in reactive() so refs auto-unwrap when accessed
  // as hardDelete.show / hardDelete.isSuperadmin in templates.
  return reactive({ isSuperadmin, show, target, input, expected, confirmed, open, close, confirm });
}
