<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const router = useRouter()
const { login, loginError } = useAuth()

const username = ref('')
const password = ref('')
const showPassword = ref(false)

function handleSubmit() {
  const success = login(username.value, password.value)
  if (success) {
    router.push('/master/users')
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <div class="login-logo">BIAS</div>
        <h1 class="login-title">Masuk ke Admin Panel</h1>
        <p class="login-subtitle">Kelola master data sistem Anda</p>
      </div>

      <form class="login-form" @submit.prevent="handleSubmit">
        <div v-if="loginError" class="login-error" role="alert">
          {{ loginError }}
        </div>

        <div class="form-group">
          <label for="login-username" class="form-label">Username</label>
          <input
            id="login-username"
            v-model="username"
            type="text"
            class="form-input"
            placeholder="Masukkan username"
            autocomplete="username"
            autofocus
          >
        </div>

        <div class="form-group">
          <label for="login-password" class="form-label">Password</label>
          <div class="password-wrapper">
            <input
              id="login-password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              class="form-input"
              placeholder="Masukkan password"
              autocomplete="current-password"
            >
            <button
              type="button"
              class="password-toggle"
              :aria-label="showPassword ? 'Sembunyikan password' : 'Tampilkan password'"
              @click="showPassword = !showPassword"
            >
              <svg v-if="!showPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
        </div>

        <button type="submit" class="btn btn-accent login-submit">
          Masuk
        </button>
      </form>

      <p class="login-hint">Demo: admin / admin123</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  padding: var(--space-base);
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-2xl) var(--space-xl);
  box-shadow: var(--shadow-lg);
}

.login-header {
  text-align: center;
  margin-bottom: var(--space-xl);
}

.login-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: var(--color-accent);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  letter-spacing: 1px;
  margin-bottom: var(--space-base);
}

.login-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  margin-bottom: var(--space-xs);
}

.login-subtitle {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-base);
}

.login-error {
  padding: var(--space-md);
  background: var(--color-danger-surface);
  color: var(--color-danger);
  border-radius: var(--radius-base);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.password-wrapper {
  position: relative;
}

.password-wrapper .form-input {
  padding-right: 44px;
}

.password-toggle {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  transition: color var(--transition-fast);
}

.password-toggle:hover {
  color: var(--color-text);
}

.login-submit {
  width: 100%;
  min-height: 44px;
  font-size: var(--font-size-md);
  margin-top: var(--space-sm);
}

.login-hint {
  margin-top: var(--space-lg);
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}
</style>
