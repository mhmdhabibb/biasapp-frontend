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
    <Transition name="modal">
      <div v-if="open" class="confirm-overlay" @mousedown.self="emit('close')">
        <div
          class="confirm-dialog"
          role="alertdialog"
          :aria-label="title"
          aria-modal="true"
        >
          <div class="confirm-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" stroke-width="2" stroke-linecap="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h3 class="confirm-title">{{ title }}</h3>
          <p class="confirm-message">{{ message }}</p>
          <div class="confirm-actions">
            <button class="btn btn-outline" @click="emit('close')">Batal</button>
            <button class="btn btn-danger" @click="emit('confirm')">Hapus</button>
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
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 210;
  padding: var(--space-base);
}

.confirm-dialog {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: 380px;
  padding: var(--space-xl);
  text-align: center;
}

.confirm-icon {
  margin-bottom: var(--space-base);
}

.confirm-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
  margin-bottom: var(--space-sm);
}

.confirm-message {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-lg);
}

.confirm-actions {
  display: flex;
  gap: var(--space-sm);
  justify-content: center;
}

.confirm-actions .btn {
  flex: 1;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--transition-base);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
