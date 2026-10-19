import { reactive } from "vue";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

const state = reactive<{ toasts: ToastItem[] }>({ toasts: [] });
let nextId = 1;

function show(
  message: string,
  type: ToastType = "info",
  duration = 4000,
): number {
  const id = nextId++;
  state.toasts.push({ id, message, type });
  if (duration > 0) {
    window.setTimeout(() => dismiss(id), duration);
  }
  return id;
}

function dismiss(id: number) {
  const index = state.toasts.findIndex((t) => t.id === id);
  if (index !== -1) state.toasts.splice(index, 1);
}

function success(message: string, duration?: number) {
  return show(message, "success", duration);
}

function error(message: string, duration?: number) {
  return show(message, "error", duration ?? 6000);
}

function warning(message: string, duration?: number) {
  return show(message, "warning", duration);
}

function info(message: string, duration?: number) {
  return show(message, "info", duration);
}

/** Normalizes fetch/api/network errors into a readable message. */
function fromError(err: unknown, fallback = "An error occurred") {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}

export function useToast() {
  return {
    toasts: state.toasts,
    show,
    success,
    error,
    warning,
    info,
    dismiss,
    fromError,
  };
}
