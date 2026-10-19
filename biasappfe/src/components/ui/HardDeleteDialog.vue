<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  title: string
  /** Display name of the item being permanently deleted */
  itemLabel: unknown
  /** Exact text the user must type to confirm */
  expected: unknown
  confirmValid?: unknown
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm'): void
  (e: 'update:input', value: string): void
}>()

const input = ref('')

/** Defensive coercion: props must never crash rendering even if a
 * non-string slips through (e.g. stale client bundle). */
const isOpen = () => props.open === true
const expectedText = () => String(props.expected ?? '').trim()
const itemText = () => {
  const v = String(props.itemLabel ?? '').trim()
  return v !== '' ? v : expectedText()
}

watch(
  () => props.open,
  (val) => {
    if (val) input.value = ''
  },
  { immediate: true },
)

function onInput(ev: Event) {
  input.value = (ev.target as HTMLInputElement).value
  emit('update:input', input.value)
}

const canConfirm = () => {
  if (props.confirmValid === true) return true
  if (props.confirmValid === false) return false
  const exp = expectedText()
  return exp !== '' && input.value.trim() === exp
}
</script>

<template>
  <Teleport to="body">
    <Transition name="hard-delete">
      <div v-if="isOpen()" class="hd-overlay" @mousedown.self="emit('close')">
        <div
          class="hd-dialog"
          role="alertdialog"
          :aria-label="title"
          aria-modal="true"
        >
          <div class="hd-icon-wrap">
            <div class="hd-icon-bg">
              <div class="hd-icon-inner">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </div>
            </div>
          </div>

          <h3 class="hd-title">{{ title }}</h3>
          <p class="hd-message">
            Data <strong class="hd-item">{{ itemText() }}</strong> akan
            <strong class="hd-danger-text">dihapus permanen dari database</strong>
            dan tidak bisa dikembalikan.
          </p>

          <p class="hd-hint">
            Ketik <code class="hd-code">{{ expectedText() }}</code> untuk mengonfirmasi:
          </p>
          <input
            :value="input"
            type="text"
            class="form-input hd-input"
            :placeholder="expectedText()"
            autocomplete="off"
            @input="onInput"
            @keyup.enter="canConfirm() && emit('confirm')"
          />

          <div class="hd-actions">
            <button class="hd-btn hd-btn--cancel" @click="emit('close')">
              Batal
            </button>
            <button
              class="hd-btn hd-btn--danger"
              :disabled="!canConfirm()"
              @click="emit('confirm')"
            >
              Hapus Permanen
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.hd-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 220;
  padding: var(--space-base);
}

.hd-dialog {
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  border-top: 4px solid var(--color-danger);
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.15),
    0 4px 16px rgba(0, 0, 0, 0.08);
  width: 100%;
  max-width: 420px;
  padding: var(--space-xl) var(--space-xl) var(--space-lg);
  text-align: center;
}

.hd-icon-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: var(--space-md);
}

.hd-icon-bg {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--color-danger-surface);
  display: flex;
  align-items: center;
  justify-content: center;
}

.hd-icon-inner {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #FEE2E2, #FECACA);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-danger);
}

.hd-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  margin-bottom: var(--space-sm);
}

.hd-message {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-md);
  line-height: 1.6;
}

.hd-item {
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.hd-danger-text {
  color: var(--color-danger);
}

.hd-hint {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-xs);
}

.hd-code {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 6px;
  background: var(--color-surface-sunken);
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
  overflow-wrap: anywhere;
}

.hd-input {
  text-align: center;
  margin-bottom: var(--space-lg);
}

.hd-actions {
  display: flex;
  gap: var(--space-md);
}

.hd-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 11px 20px;
  border-radius: var(--radius-md);
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-sm);
  font-family: var(--font-family);
  cursor: pointer;
  min-height: 44px;
  transition:
    background var(--transition-fast),
    box-shadow var(--transition-fast),
    opacity var(--transition-fast);
}

.hd-btn--cancel {
  background: var(--color-surface);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.hd-btn--cancel:hover {
  background: var(--color-surface-raised);
  color: var(--color-text);
}

.hd-btn--danger {
  background: var(--color-danger);
  color: #fff;
  border: 1px solid transparent;
  box-shadow: 0 2px 8px rgba(220, 38, 38, 0.25);
}

.hd-btn--danger:hover:not(:disabled) {
  background: var(--color-danger-hover);
}

.hd-btn--danger:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}

.hard-delete-enter-active .hd-dialog {
  animation: hd-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.hard-delete-enter-from,
.hard-delete-leave-to {
  opacity: 0;
}

@keyframes hd-in {
  from {
    transform: scale(0.9) translateY(10px);
    opacity: 0;
  }
  to {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}
</style>
