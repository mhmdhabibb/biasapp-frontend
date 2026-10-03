// @ts-nocheck
import { onMounted, onUnmounted } from "vue";
import { useMasterStore } from "./useMasterStore";

/**
 * Auto-refresh dashboard tanpa efek loading/skeleton.
 * - Polling silent setiap `intervalMs` (default 30 detik).
 * - Refresh sekali saat tab browser kembali aktif (visibilitychange).
 * Memakai refreshInBackground() -> syncFromApi(force, tracksLoading=false),
 * sehingga flag loading & error store tidak tersentuh dan angka di
 * dashboard berubah dengan smooth.
 */
export function useAutoRefresh(intervalMs = 30000) {
  const { refreshInBackground } = useMasterStore();

  let timer: ReturnType<typeof setInterval> | undefined;

  const onVisible = () => {
    if (document.visibilityState === "visible") {
      void refreshInBackground();
    }
  };

  onMounted(() => {
    void refreshInBackground();
    timer = setInterval(() => {
      void refreshInBackground();
    }, intervalMs);
    document.addEventListener("visibilitychange", onVisible);
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  });
}
