import { useAuthStore } from "@/stores/auth.store";
import { computed, reactive, ref } from "vue";
import { useToast } from "./useToast";

/**
 * True only for a real superadmin. The auth store normalizes
 * "superadmin" to "admin" for UI purposes, so the raw JWT payload
 * (which keeps the real role) is decoded instead. `token` is read
 * through the store to stay reactive across login/logout.
 */
function parseJwtPayload(token: string): any {
  try {
    const base64Url = token.split('.')[1]
    if (!base64Url) return null
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4) {
      base64 += '='
    }
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    )
    return JSON.parse(jsonPayload)
  } catch {
    try {
      return JSON.parse(atob(token.split('.')[1] || ''))
    } catch {
      return null
    }
  }
}

/**
 * True for superadmin or admin users.
 */
export function useIsSuperadmin() {
  const authStore = useAuthStore()
  return computed(() => {
    const u = authStore.currentUser.value
    const roleStr = String(u?.role || '').trim().toLowerCase()
    if (roleStr === 'superadmin' || roleStr === 'admin' || u?.username === 'admin') {
      return true
    }
    try {
      const raw = sessionStorage.getItem('bias_token') || authStore.token.value
      if (!raw) return false
      const payload = parseJwtPayload(raw)
      if (!payload) return false
      const r = String(payload.role || '').trim().toLowerCase()
      return r === 'superadmin' || r === 'admin' || payload.username === 'admin'
    } catch {
      return false
    }
  })
}

/** Best-effort display name used as the type-to-confirm text. */
export function displayNameOf(item: any): string {
  if (!item) return ''
  const v =
    item.name ??
    item.username ??
    item.title ??
    item.company_name ??
    item.serial_no ??
    item.code ??
    item.no ??
    item.id ??
    ''
  return String(v)
}

/**
 * Shared hard-delete (permanent delete) state machine for master pages.
 * The backend only honors `?permanent=true` for superadmin; the dialog
 * additionally requires typing the item name to confirm.
 */
export function useHardDelete(
  removeFn: (id: string, cascade?: boolean) => Promise<unknown>,
  refresh: () => Promise<void> | void,
) {
  const toast = useToast()
  const isSuperadmin = useIsSuperadmin()

  const show = ref(false)
  const target = ref<any>(null)
  const input = ref('')
  const cascade = ref(false)
  const expected = computed(() => displayNameOf(target.value))
  const confirmed = computed(
    () =>
      expected.value.trim() !== '' &&
      input.value.trim() === expected.value.trim(),
  )

  function open(item: any) {
    target.value = item
    input.value = ''
    cascade.value = false
    show.value = true
  }

  function close() {
    show.value = false
  }

  async function confirm() {
    if (!target.value) return
    if (!confirmed.value) {
      toast.error('Teks konfirmasi tidak cocok. Hapus permanen dibatalkan.')
      return
    }
    try {
      const allowCascade = Boolean(cascade.value)
      await removeFn(String(target.value.id), allowCascade)
      await refresh()
      toast.success(allowCascade ? 'Data dan seluruh relasi berhasil dihapus permanen.' : 'Data dihapus permanen dari database.')
    } catch (reason: any) {
      toast.error(
        'Gagal menghapus permanen: ' + (reason?.message || 'Terjadi kesalahan'),
      )
    } finally {
      show.value = false
    }
  }

  // Wrapped in reactive() so refs auto-unwrap when accessed
  // as hardDelete.show / hardDelete.isSuperadmin in templates.
  return reactive({ isSuperadmin, show, target, input, cascade, expected, confirmed, open, close, confirm });
}
