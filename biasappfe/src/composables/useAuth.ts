import { ref, computed } from 'vue'

const isAuthenticated = ref(!!sessionStorage.getItem('bias_auth'))
const currentUser = ref<{ name: string; username: string; role: string } | null>(
  sessionStorage.getItem('bias_auth')
    ? JSON.parse(sessionStorage.getItem('bias_auth')!)
    : null
)

export function useAuth() {
  const loginError = ref('')

  function login(username: string, password: string): boolean {
    loginError.value = ''

    if (!username.trim() || !password.trim()) {
      loginError.value = 'Username dan password harus diisi'
      return false
    }

    if (username === 'admin' && password === 'admin123') {
      const user = { name: 'Super Admin', username, role: 'admin' }
      sessionStorage.setItem('bias_auth', JSON.stringify(user))
      currentUser.value = user
      isAuthenticated.value = true
      return true
    }
    
    if (username === 'cs' && password === 'cs123') {
      const user = { name: 'Customer Service', username, role: 'customer_service' }
      sessionStorage.setItem('bias_auth', JSON.stringify(user))
      currentUser.value = user
      isAuthenticated.value = true
      return true
    }

    loginError.value = 'Username atau password salah'
    return false
  }

  function logout() {
    sessionStorage.removeItem('bias_auth')
    currentUser.value = null
    isAuthenticated.value = false
  }

  return {
    isAuthenticated: computed(() => isAuthenticated.value),
    currentUser: computed(() => currentUser.value),
    loginError,
    login,
    logout,
  }
}
