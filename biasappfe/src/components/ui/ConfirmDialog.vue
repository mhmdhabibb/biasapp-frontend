<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

defineProps<{
  open: boolean
  title: string
  message: string
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm'): void
}>()

function handleKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    emit('close')
  }
}
onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm">
      <div v-if="open" class="confirm-overlay" @mousedown.self="emit('close')">
        <div
          class="confirm-dialog"
          role="alertdialog"
          :aria-label="title"
          aria-modal="true"
        >
          <div class="confirm-icon-wrap">
            <div class="confirm-icon-bg">
              <div class="confirm-icon-inner">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <path d="M12 9V13" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
                  <circle cx="12" cy="16.5" r="1.2" fill="currentColor"/>
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </div>
          </div>

          <h3 class="confirm-title">{{ title }}</h3>
          <p class="confirm-message">{{ message }}</p>

          <div class="confirm-actions">
            <button class="confirm-btn confirm-btn--cancel" @click="emit('close')">
              Cancel
            </button>
            <button class="confirm-btn confirm-btn--delete" @click="emit('confirm')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
              Delete
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 210;
  padding: var(--space-base);
}

.confirm-dialog {
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.12),
    0 4px 16px rgba(0, 0, 0, 0.06);
  width: 100%;
  max-width: 400px;
  padding: var(--space-xl) var(--space-xl) var(--space-lg);
  text-align: center;
}

.confirm-icon-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: var(--space-lg);
}

.confirm-icon-bg {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--color-danger-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: icon-pulse 2s ease-in-out infinite;
}

.confirm-icon-inner {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #FEE2E2, #FECACA);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-danger);
  animation: icon-bounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both;
}

.confirm-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  margin-bottom: var(--space-sm);
  letter-spacing: -0.2px;
}

.confirm-message {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-lg);
  line-height: 1.6;
  padding: 0 var(--space-sm);
}

.confirm-actions {
  display: flex;
  gap: var(--space-md);
}

.confirm-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: 11px 20px;
  border-radius: var(--radius-md);
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-sm);
  font-family: var(--font-family);
  line-height: 1.4;
  cursor: pointer;
  transition:
    background var(--transition-fast),
    box-shadow var(--transition-fast),
    transform var(--transition-fast),
    border-color var(--transition-fast);
  min-height: 44px;
}

.confirm-btn:active {
  transform: scale(0.97);
}

.confirm-btn--cancel {
  background: var(--color-surface);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.confirm-btn--cancel:hover {
  background: var(--color-surface-raised);
  border-color: var(--color-text-muted);
  color: var(--color-text);
}

.confirm-btn--delete {
  background: var(--color-danger);
  color: #fff;
  border: 1px solid transparent;
  box-shadow: 0 2px 8px rgba(220, 38, 38, 0.25);
}

.confirm-btn--delete:hover {
  background: var(--color-danger-hover);
  box-shadow: 0 4px 14px rgba(220, 38, 38, 0.35);
}

/* Animations */
@keyframes icon-bounce {
  from {
    transform: scale(0);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes icon-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.12);
  }
  50% {
    box-shadow: 0 0 0 10px rgba(220, 38, 38, 0);
  }
}

/* Transition */
.confirm-enter-active {
  transition: opacity var(--transition-base);
}
.confirm-enter-active .confirm-dialog {
  animation: dialog-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.confirm-leave-active {
  transition: opacity 150ms ease;
}
.confirm-leave-active .confirm-dialog {
  transition: transform 150ms ease, opacity 150ms ease;
}
.confirm-enter-from,
.confirm-leave-to {
  opacity: 0;
}
.confirm-leave-to .confirm-dialog {
  transform: scale(0.92);
  opacity: 0;
}

@keyframes dialog-in {
  from {
    transform: scale(0.88) translateY(12px);
    opacity: 0;
  }
  to {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}
</style>

