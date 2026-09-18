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
    <!-- Left panel — illustration -->
    <div class="login-left" aria-hidden="true">
      <div class="login-left-content">
        <img
          class="left-illustration"
          src="@/assets/login-illustration.jpg"
          alt=""
        >
        <h2 class="left-heading">Kelola Bisnis Anda dengan Lebih Efisien</h2>
        <p class="left-subtext">
          Satu platform untuk semua kebutuhan administrasi dan manajemen data perusahaan Anda.
        </p>
      </div>
    </div>

    <!-- Right panel — form -->
    <div class="login-right">
      <div class="login-form-wrapper">
        <div class="login-header">
          <img class="login-logo" src="@/assets/bias-logo.png" alt="BIAS">
          <h1 class="login-title">Selamat Datang!</h1>
          <p class="login-subtitle">Masuk ke akun Anda untuk melanjutkan</p>
        </div>

        <form class="login-form" @submit.prevent="handleSubmit">
          <div v-if="loginError" class="login-error" role="alert">
            {{ loginError }}
          </div>

          <div class="form-group">
            <label for="login-username" class="form-label">Username</label>
            <div class="input-wrapper">
              <svg class="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <input
                id="login-username"
                v-model="username"
                type="text"
                class="form-input has-icon"
                placeholder="Masukkan username"
                autocomplete="username"
                autofocus
              >
            </div>
          </div>

          <div class="form-group">
            <label for="login-password" class="form-label">Password</label>
            <div class="input-wrapper">
              <svg class="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              <input
                id="login-password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                class="form-input has-icon"
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

          <button type="submit" class="login-submit">
            Masuk
          </button>
        </form>

        <p class="login-hint">Demo: admin / admin123</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
}

/* ── Left panel ── */
.login-left {
  flex: 1 1 50%;
  background: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-3xl) var(--space-2xl);
  position: relative;
  overflow: hidden;
}

.login-left::before {
  content: '';
  position: absolute;
  top: -120px;
  right: -120px;
  width: 360px;
  height: 360px;
  border-radius: 50%;
  background: rgba(184, 250, 78, 0.12);
  pointer-events: none;
}

.login-left::after {
  content: '';
  position: absolute;
  bottom: -80px;
  left: -80px;
  width: 260px;
  height: 260px;
  border-radius: 50%;
  background: rgba(180, 166, 255, 0.1);
  pointer-events: none;
}

.login-left-content {
  position: relative;
  z-index: 1;
  max-width: 440px;
  text-align: center;
}

.left-illustration {
  width: 100%;
  max-width: 380px;
  height: auto;
  margin: 0 auto var(--space-xl);
  border-radius: var(--radius-lg);
}

.left-heading {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: #fff;
  line-height: 1.3;
  margin-bottom: var(--space-md);
}

.left-subtext {
  font-size: var(--font-size-md);
  color: rgba(255, 255, 255, 0.72);
  line-height: 1.6;
}

/* ── Right panel ── */
.login-right {
  flex: 1 1 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-2xl) var(--space-xl);
  background: var(--color-surface);
}

.login-form-wrapper {
  width: 100%;
  max-width: 400px;
}

.login-header {
  text-align: center;
  margin-bottom: var(--space-xl);
}

.login-logo {
  width: 64px;
  height: 64px;
  object-fit: contain;
  margin: 0 auto var(--space-base);
}

.login-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  margin-bottom: var(--space-xs);
}

.login-subtitle {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* ── Form ── */
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

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 14px;
  color: var(--color-text-muted);
  pointer-events: none;
  flex-shrink: 0;
}

.form-input.has-icon {
  padding-left: 42px;
  padding-right: 44px;
}

.form-input {
  width: 100%;
  height: 48px;
  padding: 0 var(--space-base);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  font-size: var(--font-size-base);
  color: var(--color-text);
  background: var(--color-surface);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.form-input::placeholder {
  color: var(--color-text-muted);
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-surface);
}

.password-toggle {
  position: absolute;
  right: 4px;
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
  height: 48px;
  margin-top: var(--space-sm);
  border: none;
  border-radius: var(--radius-base);
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: background var(--transition-fast), transform var(--transition-fast);
}

.login-submit:hover {
  background: var(--color-primary-dark);
}

.login-submit:active {
  transform: scale(0.985);
}

.login-hint {
  margin-top: var(--space-lg);
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

/* ── Responsive ── */
@media (max-width: 900px) {
  .login-page {
    flex-direction: column;
  }

  .login-left {
    flex: none;
    padding: var(--space-xl) var(--space-base);
    min-height: 280px;
  }

  .left-illustration {
    max-width: 240px;
  }

  .left-heading {
    font-size: var(--font-size-xl);
  }

  .login-right {
    flex: 1;
    padding: var(--space-xl) var(--space-base);
  }
}
</style>
