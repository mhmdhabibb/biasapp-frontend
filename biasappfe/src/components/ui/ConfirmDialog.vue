<script setup lang="ts">
import { onMounted, onUnmounted, computed } from 'vue'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  message: string
  /** 'danger' (default), 'warning', 'success', 'info' */
  variant?: 'danger' | 'warning' | 'success' | 'info'
  confirmLabel?: string
  cancelLabel?: string
  details?: string[]
}>(), {
  variant: 'danger',
  confirmLabel: undefined,
  cancelLabel: 'Cancel',
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm'): void
}>()

function handleKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('close')
}
onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))

const config = computed(() => {
  switch (props.variant) {
    case 'warning':
      return {
        label: props.confirmLabel ?? 'Ya, Lanjutkan',
        iconColor: '#f59e0b',
        iconBg: 'rgba(245,158,11,0.12)',
        iconBgInner: 'linear-gradient(135deg,#fef3c7,#fde68a)',
        btnClass: 'confirm-btn--warning',
      }
    case 'success':
      return {
        label: props.confirmLabel ?? 'Konfirmasi',
        iconColor: '#10b981',
        iconBg: 'rgba(16,185,129,0.12)',
        iconBgInner: 'linear-gradient(135deg,#d1fae5,#a7f3d0)',
        btnClass: 'confirm-btn--success',
      }
    case 'info':
      return {
        label: props.confirmLabel ?? 'OK',
        iconColor: '#3b82f6',
        iconBg: 'rgba(59,130,246,0.12)',
        iconBgInner: 'linear-gradient(135deg,#dbeafe,#bfdbfe)',
        btnClass: 'confirm-btn--info',
      }
    default: // danger
      return {
        label: props.confirmLabel ?? 'Delete',
        iconColor: '#ef4444',
        iconBg: 'rgba(239,68,68,0.12)',
        iconBgInner: 'linear-gradient(135deg,#fee2e2,#fecaca)',
        btnClass: 'confirm-btn--delete',
      }
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm">
      <div v-if="open" class="confirm-overlay" @mousedown.self="emit('close')">
        <div
          class="confirm-dialog"
          :class="`confirm-dialog--${variant}`"
          role="alertdialog"
          :aria-label="title"
          aria-modal="true"
        >
          <!-- Icon -->
          <div class="confirm-icon-wrap">
            <div
              class="confirm-icon-bg"
              :style="`background:${config.iconBg};box-shadow:0 0 0 0 ${config.iconBg}`"
            >
              <div
                class="confirm-icon-inner"
                :style="`background:${config.iconBgInner};color:${config.iconColor}`"
              >
                <!-- Warning icon -->
                <svg v-if="variant === 'warning'" width="30" height="30" viewBox="0 0 24 24" fill="none">
                  <path d="M12 9V13" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
                  <circle cx="12" cy="16.5" r="1.2" fill="currentColor"/>
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <!-- Success icon -->
                <svg v-else-if="variant === 'success'" width="30" height="30" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/>
                  <path d="M8 12.5l3 3 5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <!-- Info icon -->
                <svg v-else-if="variant === 'info'" width="30" height="30" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/>
                  <path d="M12 11v5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
                  <circle cx="12" cy="7.5" r="1.2" fill="currentColor"/>
                </svg>
                <!-- Danger / delete icon (default) -->
                <svg v-else width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                  <line x1="10" y1="11" x2="10" y2="17"/>
                  <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
              </div>
            </div>
          </div>

          <!-- Title -->
          <h3 class="confirm-title">{{ title }}</h3>

          <!-- Primary message -->
          <p class="confirm-message">{{ message }}</p>

          <!-- Detail checklist — shown when variant = warning/success -->
          <ul v-if="details && details.length" class="confirm-details">
            <li v-for="(d, i) in details" :key="i">
              <span class="confirm-details__dot" :style="`background:${config.iconColor}`"></span>
              {{ d }}
            </li>
          </ul>

          <!-- Actions -->
          <div class="confirm-actions">
            <button class="confirm-btn confirm-btn--cancel" @click="emit('close')">
              {{ cancelLabel }}
            </button>
            <button
              class="confirm-btn"
              :class="config.btnClass"
              @click="emit('confirm')"
            >
              {{ config.label }}
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
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 210;
  padding: var(--space-base);
}

.confirm-dialog {
  background: var(--color-surface);
  border-radius: 20px;
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.18),
    0 4px 16px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255,255,255,0.06);
  width: 100%;
  max-width: 420px;
  padding: 36px 32px 28px;
  text-align: center;
  border: 1px solid var(--color-border-light, rgba(255,255,255,0.08));
  position: relative;
  overflow: hidden;
}

/* Subtle top-bar accent per variant */
.confirm-dialog::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 20px 20px 0 0;
}
.confirm-dialog--danger::before   { background: linear-gradient(90deg, #ef4444, #f87171); }
.confirm-dialog--warning::before  { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
.confirm-dialog--success::before  { background: linear-gradient(90deg, #10b981, #34d399); }
.confirm-dialog--info::before     { background: linear-gradient(90deg, #3b82f6, #60a5fa); }

.confirm-icon-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
}

.confirm-icon-bg {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: icon-pulse 2.4s ease-in-out infinite;
}

.confirm-icon-inner {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: icon-bounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both;
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
}

.confirm-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 10px;
  letter-spacing: -0.3px;
}

.confirm-message {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 0;
  line-height: 1.65;
  padding: 0 4px;
}

/* Rich detail list */
.confirm-details {
  list-style: none;
  margin: 14px 0 0;
  padding: 14px 16px;
  background: var(--color-surface-raised, rgba(255,255,255,0.04));
  border-radius: 12px;
  border: 1px solid var(--color-border-light, rgba(255,255,255,0.06));
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.confirm-details li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.confirm-details__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 5px;
  opacity: 0.85;
}

.confirm-actions {
  display: flex;
  gap: 10px;
  margin-top: 24px;
}

.confirm-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 11px 20px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
  font-family: var(--font-family);
  line-height: 1.4;
  cursor: pointer;
  transition:
    background 0.15s,
    box-shadow 0.15s,
    transform 0.15s,
    border-color 0.15s;
  min-height: 44px;
  border: 1px solid transparent;
  letter-spacing: 0.01em;
}

.confirm-btn:active { transform: scale(0.97); }

.confirm-btn--cancel {
  background: var(--color-surface);
  color: var(--color-text-secondary);
  border-color: var(--color-border);
}
.confirm-btn--cancel:hover {
  background: var(--color-surface-raised);
  border-color: var(--color-text-muted);
  color: var(--color-text);
}

/* Danger */
.confirm-btn--delete {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: #fff;
  box-shadow: 0 2px 12px rgba(239,68,68,0.3);
}
.confirm-btn--delete:hover {
  background: linear-gradient(135deg, #f87171, #ef4444);
  box-shadow: 0 4px 18px rgba(239,68,68,0.4);
}

/* Warning */
.confirm-btn--warning {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
  box-shadow: 0 2px 12px rgba(245,158,11,0.3);
}
.confirm-btn--warning:hover {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  box-shadow: 0 4px 18px rgba(245,158,11,0.4);
}

/* Success */
.confirm-btn--success {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  box-shadow: 0 2px 12px rgba(16,185,129,0.3);
}
.confirm-btn--success:hover {
  background: linear-gradient(135deg, #34d399, #10b981);
  box-shadow: 0 4px 18px rgba(16,185,129,0.4);
}

/* Info */
.confirm-btn--info {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  box-shadow: 0 2px 12px rgba(59,130,246,0.3);
}
.confirm-btn--info:hover {
  background: linear-gradient(135deg, #60a5fa, #3b82f6);
  box-shadow: 0 4px 18px rgba(59,130,246,0.4);
}

/* Animations */
@keyframes icon-bounce {
  from { transform: scale(0); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}

@keyframes icon-pulse {
  0%, 100% { box-shadow: 0 0 0 0 currentColor; }
  50%       { box-shadow: 0 0 0 10px transparent; }
}

/* Transition */
.confirm-enter-active { transition: opacity 0.22s ease; }
.confirm-enter-active .confirm-dialog {
  animation: dialog-in 0.34s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.confirm-leave-active { transition: opacity 0.15s ease; }
.confirm-leave-active .confirm-dialog {
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.confirm-enter-from,
.confirm-leave-to { opacity: 0; }
.confirm-leave-to .confirm-dialog { transform: scale(0.93); opacity: 0; }

@keyframes dialog-in {
  from { transform: scale(0.88) translateY(16px); opacity: 0; }
  to   { transform: scale(1)    translateY(0);    opacity: 1; }
}
</style>
