<script setup lang="ts">
import { useToast, type ToastType } from "@/composables/useToast";

const { toasts, dismiss } = useToast();

const icons: Record<ToastType, string> = {
  success: "M20 6L9 17l-5-5",
  error: "M18 6L6 18M6 6l12 12",
  warning: "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
  info: "M12 16v-4m0-4h.01",
};
</script>

<template>
  <Teleport to="body">
    <TransitionGroup name="toast" tag="div" class="toast-host" aria-live="polite">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast"
        :class="`toast-${toast.type}`"
        role="alert"
      >
        <span class="toast-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path :d="icons[toast.type]" />
          </svg>
        </span>
        <span class="toast-message">{{ toast.message }}</span>
        <button class="toast-close" aria-label="Close" @click="dismiss(toast.id)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: var(--space-base);
  right: var(--space-base);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  max-width: min(380px, calc(100vw - 32px));
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-text-muted);
  box-shadow: var(--shadow-lg);
  font-size: var(--font-size-sm);
  color: var(--color-text);
  pointer-events: auto;
}

.toast-success {
  border-left-color: var(--color-success);
  background: var(--color-success-surface);
}
.toast-error {
  border-left-color: var(--color-danger);
  background: var(--color-danger-surface);
}
.toast-warning {
  border-left-color: var(--color-warning);
  background: var(--color-warning-surface);
}
.toast-info {
  border-left-color: var(--color-primary);
  background: var(--color-primary-surface);
}

.toast-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}
.toast-success .toast-icon { color: var(--color-success-text); }
.toast-error .toast-icon { color: var(--color-danger); }
.toast-warning .toast-icon { color: var(--color-warning-text); }
.toast-info .toast-icon { color: var(--color-primary); }

.toast-message {
  flex: 1;
  min-width: 0;
  word-break: break-word;
  line-height: 1.45;
}

.toast-close {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin: -2px -4px 0 0;
  border: none;
  background: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.toast-close:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--color-text);
}

.toast-enter-active,
.toast-leave-active {
  transition: all var(--transition-base);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(24px);
}
.toast-move {
  transition: transform var(--transition-base);
}

@media (max-width: 600px) {
  .toast-host {
    top: auto;
    bottom: calc(64px + env(safe-area-inset-bottom, 0px) + var(--space-base));
    left: var(--space-base);
    right: var(--space-base);
    max-width: none;
  }
}
</style>
