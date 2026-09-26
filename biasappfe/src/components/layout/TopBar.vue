<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ title: string }>()
defineEmits<{ (e: 'toggle-sidebar'): void }>()

const showNotif = ref(false)
</script>

<template>
  <header class="topbar">
    <div class="topbar-left">
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
    </div>
    
    <div class="topbar-right">
      <div class="notification-container">
        <button class="notification-btn" @click="showNotif = !showNotif" aria-label="Notifications">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 01-3.46 0"></path>
          </svg>
        </button>

        <div v-if="showNotif" class="notif-dropdown">
          <div class="notif-header">
            <h4>Notifications</h4>
          </div>
          <div class="notif-body">
            <div class="notif-empty">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-text-muted); margin-bottom: 8px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="15" x2="15" y2="15"></line></svg>
              <p>No new notifications</p>
              <small>Data you add will appear here</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  </header>
  
  <div v-if="showNotif" class="notif-overlay" @click="showNotif = false"></div>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--topbar-height);
  padding: 0 var(--space-lg);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border-light);
  position: sticky;
  top: 0;
  z-index: 50;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: var(--space-md);
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
  background: none;
  border: none;
  cursor: pointer;
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
  margin: 0;
}

.topbar-right {
  display: flex;
  align-items: center;
}

.notification-container {
  position: relative;
  z-index: 101;
}

.notification-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.notification-btn:hover {
  background: var(--color-surface-sunken);
  color: var(--color-primary);
}

.notif-dropdown {
  position: absolute;
  top: calc(100% + 12px);
  right: 0;
  width: 320px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.1));
  overflow: hidden;
  z-index: 101;
}

.notif-header {
  padding: 16px;
  border-bottom: 1px solid var(--color-border-light);
  background: var(--color-surface);
}

.notif-header h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.notif-body {
  max-height: 320px;
  overflow-y: auto;
  background: var(--color-surface-sunken);
}

.notif-empty {
  padding: 40px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--color-text-secondary);
}

.notif-empty p {
  margin: 8px 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.notif-empty small {
  font-size: 12px;
  color: var(--color-text-muted);
}

.notif-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
}
</style>
