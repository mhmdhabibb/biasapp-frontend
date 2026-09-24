<script setup lang="ts">
import { onMounted, onUnmounted, ref, nextTick } from 'vue'

const props = withDefaults(defineProps<{
  title: string
  open: boolean
  maxWidth?: string
}>(), {
  maxWidth: '520px'
})
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit'): void
}>()

const modalRef = ref<HTMLElement | null>(null)

function handleKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="modal-overlay" @mousedown.self="emit('close')">
        <div
          ref="modalRef"
          class="modal-content"
          role="dialog"
          :aria-label="title"
          aria-modal="true"
          :style="{ maxWidth: props.maxWidth }"
        >
          <div class="modal-header">
            <h3 class="modal-title">{{ title }}</h3>
            <button
              class="modal-close"
              aria-label="Tutup"
              @click="emit('close')"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div class="modal-body">
            <slot />
          </div>

          <div class="modal-footer">
            <button class="btn btn-outline" @click="emit('close')">Cancel</button>
            <button class="btn btn-accent" @click="emit('submit')">Save</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: var(--space-base);
}

.modal-content {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-lg) var(--space-lg) var(--space-md);
}

.modal-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  transition: background var(--transition-fast), color var(--transition-fast);
}
.modal-close:hover {
  background: var(--color-surface-sunken);
  color: var(--color-text);
}

.modal-body {
  padding: var(--space-md) var(--space-lg);
  padding-bottom: var(--space-2xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-base);
  flex: 1;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg) var(--space-lg);
  border-top: 1px solid var(--color-border);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--transition-base);
}
.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform var(--transition-base);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal-content {
  transform: scale(0.96) translateY(8px);
}
.modal-leave-to .modal-content {
  transform: scale(0.96) translateY(8px);
}
</style>
