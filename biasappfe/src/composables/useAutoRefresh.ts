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
export function useAutoRefresh(intervalMs = 15000, resourceKeys?: string[]) {
  const { refreshInBackground, refreshOnly } = useMasterStore();

  let timer: ReturnType<typeof setInterval> | undefined;

  const doRefresh = () => {
    if (resourceKeys && resourceKeys.length > 0) {
      void refreshOnly(resourceKeys);
    } else {
      void refreshInBackground();
    }
  };

  const poll = () => {
    if (document.visibilityState !== "visible") return;
    doRefresh();
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") {
      doRefresh();
    }
  };

  onMounted(() => {
    doRefresh();
    timer = setInterval(poll, intervalMs);
    document.addEventListener("visibilitychange", onVisible);
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  });
}
