<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import FormModal from '@/components/ui/FormModal.vue'

const route = useRoute()
const router = useRouter()
const { currentUser, logout } = useAuth()
const { success: toastSuccess, error: toastError } = useToast()

const showMoreMenu = ref(false)
const showPwdModal = ref(false)

const pwdForm = reactive({
  old_password: '',
  new_password: '',
  confirm_password: '',
})
const isSavingPwd = ref(false)

function navigate(path: string) {
  showMoreMenu.value = false
  router.push(path)
}

function handleLogout() {
  showMoreMenu.value = false
  logout()
  toastSuccess('Logout successful')
  router.push('/login')
}

function openPwdModal() {
  showMoreMenu.value = false
  pwdForm.old_password = ''
  pwdForm.new_password = ''
  pwdForm.confirm_password = ''
  showPwdModal.value = true
}

async function submitPwdChange() {
  if (!pwdForm.old_password || !pwdForm.new_password) {
    toastError('Please fill in Current Password and New Password!')
    return
  }
  if (pwdForm.new_password.length < 6) {
    toastError('New Password must be at least 6 characters!')
    return
  }
  if (pwdForm.new_password !== pwdForm.confirm_password) {
    toastError('Password confirmation does not match!')
    return
  }
  isSavingPwd.value = true
  try {
    await api.post('/auth/change-password', {
      old_password: pwdForm.old_password,
      new_password: pwdForm.new_password,
    })
    showPwdModal.value = false
    toastSuccess('Password updated successfully!')
  } catch (err: any) {
    toastError(err?.message || 'Failed to update password!')
  } finally {
    isSavingPwd.value = false
  }
}
</script>

<template>
  <div>
    <!-- Bottom Navigation Bar -->
    <nav class="bottom-nav">
      <button 
        class="nav-item" 
        :class="{ active: route.path === '/technician/dashboard' }"
        @click="navigate('/technician/dashboard')"
      >
        <svg class="nav-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
        <span class="nav-label">Home</span>
      </button>
      
      <button 
        class="nav-item" 
        :class="{ active: route.path.startsWith('/technician/call-services') }"
        @click="navigate('/technician/call-services')"
      >
        <svg class="nav-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
        </svg>
        <span class="nav-label">Jobs</span>
      </button>

      <button 
        class="nav-item" 
        :class="{ active: route.path.startsWith('/technician/maintenance') }"
        @click="navigate('/technician/maintenance')"
      >
        <svg class="nav-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
          <path d="m9 16 2 2 4-4"></path>
        </svg>
        <span class="nav-label">Maint</span>
      </button>

      <button 
        class="nav-item" 
        :class="{ active: route.path.startsWith('/technician/service-history') }"
        @click="navigate('/technician/service-history')"
      >
        <svg class="nav-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 14 14"></polyline>
        </svg>
        <span class="nav-label">History</span>
      </button>

      <button 
        class="nav-item" 
        :class="{ active: showMoreMenu || route.path.startsWith('/technician/sparepart-request') || route.path.startsWith('/technician/standalone-service-history') || route.path.startsWith('/technician/meter-readings') }"
        @click="showMoreMenu = !showMoreMenu"
      >
        <svg class="nav-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="1"></circle>
          <circle cx="19" cy="12" r="1"></circle>
          <circle cx="5" cy="12" r="1"></circle>
        </svg>
        <span class="nav-label">Menu</span>
      </button>
    </nav>

    <!-- Slide-Up Bottom Sheet Modal for Full Technician Menu -->
    <Teleport to="body">
      <div v-if="showMoreMenu" class="sheet-backdrop" @click="showMoreMenu = false"></div>
      
      <div class="sheet-drawer" :class="{ 'is-open': showMoreMenu }">
        <div class="sheet-handle-bar" @click="showMoreMenu = false">
          <div class="sheet-handle"></div>
        </div>

        <div class="sheet-header">
          <div class="sheet-user-avatar">
            {{ (currentUser?.name || 'T').charAt(0).toUpperCase() }}
          </div>
          <div class="sheet-user-info">
            <div class="sheet-user-name">{{ currentUser?.name || 'Technician' }}</div>
            <div class="sheet-user-role">
              <span class="badge badge-success">Technician</span>
              <span class="sheet-user-sub">@{{ currentUser?.username || 'tech' }}</span>
            </div>
          </div>
          <button class="sheet-close-btn" @click="showMoreMenu = false" aria-label="Close">✕</button>
        </div>

        <div class="sheet-content">
          <div class="sheet-section-title">ALL TECHNICIAN FEATURES</div>
          
          <div class="sheet-grid">
            <button class="sheet-tile" @click="navigate('/technician/call-services')">
              <div class="tile-icon-box" style="background: rgba(59, 130, 246, 0.12); color: #2563eb;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
              </div>
              <span class="tile-label">Call Services</span>
            </button>

            <button class="sheet-tile" @click="navigate('/technician/maintenance')">
              <div class="tile-icon-box" style="background: rgba(16, 185, 129, 0.12); color: #059669;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><path d="m9 16 2 2 4-4"></path></svg>
              </div>
              <span class="tile-label">Maintenance</span>
            </button>

            <button class="sheet-tile" @click="navigate('/technician/sparepart-request')">
              <div class="tile-icon-box" style="background: rgba(245, 158, 11, 0.12); color: #d97706;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
              </div>
              <span class="tile-label">Sparepart Request</span>
            </button>

            <button class="sheet-tile" @click="navigate('/technician/service-history')">
              <div class="tile-icon-box" style="background: rgba(139, 92, 246, 0.12); color: #7c3aed;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
              </div>
              <span class="tile-label">Unit History</span>
            </button>

            <button class="sheet-tile" @click="navigate('/technician/standalone-service-history')">
              <div class="tile-icon-box" style="background: rgba(14, 165, 233, 0.12); color: #0284c7;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              </div>
              <span class="tile-label">Standalone Service</span>
            </button>

            <button class="sheet-tile" @click="navigate('/technician/meter-readings')">
              <div class="tile-icon-box" style="background: rgba(236, 72, 153, 0.12); color: #db2777;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              </div>
              <span class="tile-label">Meter Readings</span>
            </button>
          </div>

          <div class="sheet-section-title" style="margin-top: 16px;">ACCOUNT SETTINGS</div>
          
          <div class="sheet-actions">
            <button class="sheet-action-row" @click="openPwdModal">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              <span>Change Password</span>
              <span class="chevron">›</span>
            </button>

            <button class="sheet-action-row text-danger" @click="handleLogout">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              <span>Logout</span>
              <span class="chevron">›</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Change Password Modal -->
    <FormModal
      :open="showPwdModal"
      title="Change Password"
      @close="showPwdModal = false"
    >
      <form @submit.prevent="submitPwdChange" class="form-grid">
        <div class="form-group">
          <label class="form-label">Current Password</label>
          <input
            v-model="pwdForm.old_password"
            type="password"
            class="form-input"
            required
            placeholder="Enter current password"
          />
        </div>
        <div class="form-group">
          <label class="form-label">New Password</label>
          <input
            v-model="pwdForm.new_password"
            type="password"
            class="form-input"
            required
            minlength="6"
            placeholder="Minimum 6 characters"
          />
        </div>
        <div class="form-group">
          <label class="form-label">Confirm New Password</label>
          <input
            v-model="pwdForm.confirm_password"
            type="password"
            class="form-input"
            required
            placeholder="Repeat new password"
          />
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 1rem;">
          <button type="button" class="btn btn-outline" @click="showPwdModal = false">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="isSavingPwd">
            {{ isSavingPwd ? 'Saving...' : 'Save Password' }}
          </button>
        </div>
      </form>
    </FormModal>
  </div>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  background: var(--color-surface, #fff);
  border-top: 1px solid var(--color-border-light, #e2e8f0);
  display: flex;
  justify-content: space-around;
  align-items: center;
  z-index: 50;
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.04);
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 20%;
  height: 100%;
  border: none;
  background: none;
  color: var(--color-text-muted, #94a3b8);
  cursor: pointer;
  transition: all 0.2s ease;
  -webkit-tap-highlight-color: transparent;
  position: relative;
}

.nav-item.active {
  color: var(--color-primary, #3b82f6);
}

.nav-item.active::after {
  content: '';
  position: absolute;
  top: 4px;
  width: 24px;
  height: 3px;
  border-radius: 999px;
  background: var(--color-primary, #3b82f6);
}

.nav-icon {
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.nav-item:active .nav-icon {
  transform: scale(0.9);
}

.nav-item.active .nav-icon {
  transform: translateY(-1px);
}

.nav-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2px;
  white-space: nowrap;
}

/* Slide-Up Bottom Sheet Drawer */
.sheet-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(2px);
  z-index: 998;
  animation: fadeIn 0.2s ease;
}

.sheet-drawer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--color-surface, #ffffff);
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.15);
  z-index: 999;
  max-height: 85vh;
  overflow-y: auto;
  padding: 12px 20px 32px;
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.sheet-drawer.is-open {
  transform: translateY(0);
}

.sheet-handle-bar {
  display: flex;
  justify-content: center;
  padding: 4px 0 12px;
  cursor: pointer;
}

.sheet-handle {
  width: 40px;
  height: 5px;
  border-radius: 999px;
  background: var(--color-border-dark, #cbd5e1);
}

.sheet-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
}

.sheet-user-avatar {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
  flex-shrink: 0;
}

.sheet-user-info {
  flex: 1;
}

.sheet-user-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text, #0f172a);
}

.sheet-user-role {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.sheet-user-sub {
  font-size: 12px;
  color: var(--color-text-muted, #64748b);
}

.sheet-close-btn {
  background: var(--color-surface-raised, #f1f5f9);
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted, #64748b);
  cursor: pointer;
}

.sheet-content {
  padding-top: 16px;
}

.sheet-section-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.8px;
  color: var(--color-text-muted, #94a3b8);
  margin-bottom: 12px;
}

.sheet-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.sheet-tile {
  background: var(--color-surface-raised, #f8fafc);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 14px;
  padding: 14px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  -webkit-tap-highlight-color: transparent;
}

.sheet-tile:active {
  transform: scale(0.95);
  background: var(--color-surface-sunken, #f1f5f9);
}

.tile-icon-box {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tile-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
  line-height: 1.25;
}

.sheet-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sheet-action-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--color-surface-raised, #f8fafc);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
  cursor: pointer;
  text-align: left;
}

.sheet-action-row.text-danger {
  color: var(--color-danger, #ef4444);
}

.sheet-action-row .chevron {
  margin-left: auto;
  color: var(--color-text-muted, #94a3b8);
  font-size: 18px;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
