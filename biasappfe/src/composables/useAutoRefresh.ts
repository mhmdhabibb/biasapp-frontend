// @ts-nocheck
import { onMounted, onUnmounted } from "vue";
import { useMasterStore } from "./useMasterStore";

/**
 * Auto-refresh dashboard tanpa efek loading/skeleton.
 * - Polling silent setiap `intervalMs` (default 15 detik) — dilewati saat
 *   tab disembunyikan (browser me-throttle interval; refresh dijalankan
 *   ulang saat tab kembali aktif via visibilitychange).
 * - Refresh sekali saat mount dan saat tab browser kembali aktif.
 * Memakai refreshOnly(resourceKeys) bila diisi (refresh ringan, hanya
 * resource yang ditampilkan) atau refreshInBackground() bila tidak.
 * sehingga flag loading & error store tidak tersentuh dan angka di
 * dashboard berubah dengan smooth.
 */
export function useAutoRefresh(intervalMs = 10000, resourceKeys?: string[]) {
  const { refreshInBackground, refreshOnly } = useMasterStore();

  let timer: ReturnType<typeof setInterval> | undefined;
  let debounceTimeout: ReturnType<typeof setTimeout> | undefined;

  // maxAgeMs > 0 skips resources that were fetched more recently than that
  // (by the router on navigation, the layout poller, or another page), so the
  // dashboard no longer re-downloads everything right after it just loaded.
  const doRefresh = (maxAgeMs = 0) => {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      if (resourceKeys && resourceKeys.length > 0) {
        void refreshOnly(resourceKeys, true, maxAgeMs);
      } else {
        void refreshInBackground();
      }
    }, 250);
  };

  const freshWindow = Math.max(1000, intervalMs - 1000);

  const poll = () => {
    if (document.visibilityState !== "visible") return;
    doRefresh(freshWindow);
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") {
      doRefresh(freshWindow);
    }
  };

  const onMutation = () => {
    doRefresh(0);
  };

  onMounted(() => {
    doRefresh(freshWindow);
    timer = setInterval(poll, intervalMs);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("bias:data-mutated", onMutation);
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
    if (debounceTimeout) clearTimeout(debounceTimeout);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
    window.removeEventListener("bias:data-mutated", onMutation);
  });
}
