<script setup lang="ts">
defineProps<{ title: string }>()
defineEmits<{ (e: 'toggle-sidebar'): void }>()
</script>

<template>
  <header class="topbar">
    <button
      class="topbar-hamburger"
      aria-label="Buka menu"
      @click="$emit('toggle-sidebar')"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>

    <div class="topbar-title-area">
      <h1 class="topbar-title">{{ title }}</h1>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  height: var(--topbar-height);
  padding: 0 var(--space-lg);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border-light);
  position: sticky;
  top: 0;
  z-index: 50;
}

.topbar-hamburger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  transition: background var(--transition-fast);
}

.topbar-hamburger:hover {
  background: var(--color-surface-sunken);
}

@media (min-width: 769px) {
  .topbar-hamburger {
    display: none;
  }
}

.topbar-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
}
</style>
