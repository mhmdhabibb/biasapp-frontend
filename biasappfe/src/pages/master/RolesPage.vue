<script setup lang="ts">
// @ts-nocheck
import { ref, onMounted, computed, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { resources } from '@/services/resource.service'
import { api } from '@/services/api'
import type { Role, Permission, Module } from '@/types'
import { useAuthStore } from '@/stores/auth.store'

const authStore = useAuthStore()
const router = useRouter()

// Data states
const roles = ref<Role[]>([])
const allPermissions = ref<Permission[]>([])
const modules = ref<Module[]>([])

// UI states
const searchQuery = ref('')
const selectedRoleId = ref<string | null>(null)
const selectedPermissions = ref<string[]>([])
const isSaving = ref(false)

// Modals
const showModal = ref(false)
const showConfirm = ref(false)
const editingRole = ref<Role | null>(null)
const deletingRole = ref<Role | null>(null)
const roleForm = ref({ name: '' })

const activeTab = ref('roles') // 'users' or 'roles'

async function fetchData() {
  try {
    const [resRoles, resPerms, resMods] = await Promise.all([
      resources.roles.list({ limit: 1000 }),
      resources.permissions.list({ limit: 1000 }),
      api.get<{ data: Module[] }>('/modules/?limit=1000')
    ])
    
    roles.value = resRoles.data as any
    allPermissions.value = resPerms.data as any
    modules.value = resMods.data
    
    if (roles.value.length > 0 && !selectedRoleId.value) {
      selectedRoleId.value = String(roles.value[0].id)
    }
  } catch (error) {
    console.error('Failed to fetch data:', error)
  }
}

onMounted(fetchData)

// Computed
const filteredRoles = computed(() => {
  if (!searchQuery.value) return roles.value
  const q = searchQuery.value.toLowerCase()
  return roles.value.filter(r => r.name.toLowerCase().includes(q))
})

const selectedRole = computed(() => roles.value.find(r => String(r.id) === selectedRoleId.value))

const permissionsByModule = computed(() => {
  const grouped = new Map<string, Permission[]>()
  allPermissions.value.forEach(p => {
    const modId = String(p.module_id)
    if (!grouped.has(modId)) {
      grouped.set(modId, [])
    }
    grouped.get(modId)?.push(p)
  })
  
  const result: { module: Module, permissions: Permission[] }[] = []
  modules.value.forEach(m => {
    if (grouped.has(String(m.id))) {
      result.push({
        module: m,
        permissions: grouped.get(String(m.id)) || []
      })
    }
  })
  return result
})

// Watchers
watch(selectedRole, (newRole) => {
  if (newRole && newRole.permissions) {
    selectedPermissions.value = newRole.permissions.map(p => String(p.id))
  } else {
    selectedPermissions.value = []
  }
}, { immediate: true })

// Methods
function selectRole(role: Role) {
  selectedRoleId.value = String(role.id)
}

function openAddRole() {
  editingRole.value = null
  roleForm.value.name = ''
  showModal.value = true
}

function openEditRole(role: Role) {
  editingRole.value = role
  roleForm.value.name = role.name
  showModal.value = true
}

function openDeleteRole(role: Role) {
  deletingRole.value = role
  showConfirm.value = true
}

async function handleSaveRole() {
  if (!roleForm.value.name.trim()) return
  try {
    if (editingRole.value) {
      await resources.roles.update(String(editingRole.value.id), { name: roleForm.value.name })
    } else {
      await resources.roles.create({ name: roleForm.value.name })
    }
    showModal.value = false
    await fetchData()
  } catch (error) {
    console.error('Failed to save role:', error)
  }
}

async function handleDeleteRole() {
  if (!deletingRole.value) return
  try {
    await resources.roles.remove(String(deletingRole.value.id))
    if (selectedRoleId.value === String(deletingRole.value.id)) {
      selectedRoleId.value = null
    }
    showConfirm.value = false
    await fetchData()
  } catch (error) {
    console.error('Failed to delete role:', error)
  }
}

// Permission Methods
function isModuleFullySelected(mod: Module) {
  const perms = permissionsByModule.value.find(g => String(g.module.id) === String(mod.id))?.permissions || []
  if (perms.length === 0) return false
  return perms.every(p => selectedPermissions.value.includes(String(p.id)))
}

function toggleModule(mod: Module, checked: boolean) {
  const perms = permissionsByModule.value.find(g => String(g.module.id) === String(mod.id))?.permissions || []
  const permIds = perms.map(p => String(p.id))
  
  if (checked) {
    const newSelection = new Set([...selectedPermissions.value, ...permIds])
    selectedPermissions.value = Array.from(newSelection)
  } else {
    selectedPermissions.value = selectedPermissions.value.filter(id => !permIds.includes(id))
  }
  savePermissions()
}

const isAllFullySelected = computed(() => {
  if (allPermissions.value.length === 0) return false
  return allPermissions.value.every(p => selectedPermissions.value.includes(String(p.id)))
})

function toggleAll(checked: boolean) {
  if (checked) {
    selectedPermissions.value = allPermissions.value.map(p => String(p.id))
  } else {
    selectedPermissions.value = []
  }
  savePermissions()
}

async function savePermissions() {
  if (!selectedRoleId.value) return
  isSaving.value = true
  try {
    await api.patch(`/roles/${selectedRoleId.value}/permissions`, {
      permissions: selectedPermissions.value
    })
    // Optionally refetch role data to ensure Sync
    const resRole = await resources.roles.get(selectedRoleId.value)
    const roleIdx = roles.value.findIndex(r => String(r.id) === selectedRoleId.value)
    if (roleIdx > -1) {
      roles.value[roleIdx] = resRole.data as any
    }
  } catch (error: any) {
    console.error(error)
    alert('Gagal menyimpan: ' + (error.message || 'Error'))
  } finally {
    isSaving.value = false
  }
}

</script>

<template>
  <div class="roles-management">
    <!-- Left Panel: Roles List -->
    <div class="roles-sidebar">
      <div class="sidebar-header">
        <div class="tabs">
          <button 
            class="tab" 
            :class="{ active: activeTab === 'users' }"
            @click="router.push('/master/users')"
          >
            List Of User
          </button>
          <button 
            class="tab" 
            :class="{ active: activeTab === 'roles' }"
            @click="activeTab = 'roles'"
          >
            List Of Roles
          </button>
        </div>
        <div class="search-add-bar">
          <div class="search-box">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" v-model="searchQuery" placeholder="Search Role..." class="search-input" />
          </div>
          <button v-if="authStore.hasPermission('role:create')" class="btn-add" @click="openAddRole" title="Add Role">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="roles-list">
        <div 
          v-for="role in filteredRoles" 
          :key="role.id" 
          class="role-item"
          :class="{ active: String(role.id) === selectedRoleId }"
          @click="selectRole(role)"
        >
          <div class="role-info">
            <h4 class="role-name">{{ role.name }}</h4>
            <span class="role-desc">Role sistem</span>
          </div>
          <div class="role-actions">
            <button v-if="authStore.hasPermission('role:update')" class="btn-icon" @click.stop="openEditRole(role)" title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button v-if="authStore.hasPermission('role:delete')" class="btn-icon text-danger" @click.stop="openDeleteRole(role)" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Panel: Permissions Matrix -->
    <div class="permissions-content">
      <div v-if="!selectedRole" class="empty-state">
        <p>Pilih role di panel kiri untuk mengatur permissions.</p>
      </div>
      
      <div v-else class="permissions-wrapper">
        <div class="master-toggle-bar">
          <div class="toggle-group">
            <label class="toggle-switch">
              <input 
                type="checkbox" 
                :checked="isAllFullySelected"
                @change="(e) => toggleAll((e.target as HTMLInputElement).checked)"
              >
              <span class="toggle-slider"></span>
            </label>
            <span class="toggle-label">Switch on all Management options</span>
          </div>
          <div class="save-indicator" v-if="isSaving">
            <span class="text-sm text-gray-500">Saving...</span>
          </div>
        </div>

        <div class="modules-grid">
          <div v-for="group in permissionsByModule" :key="group.module.id" class="perm-card">
            <div class="perm-card-header">
              <div class="perm-card-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="card-icon">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <h4>{{ group.module.name }}</h4>
              </div>
              <div class="perm-card-toggle">
                <span class="status-text">{{ isModuleFullySelected(group.module) ? 'On' : 'Off' }}</span>
                <label class="toggle-switch small">
                  <input 
                    type="checkbox" 
                    :checked="isModuleFullySelected(group.module)"
                    @change="(e) => toggleModule(group.module, (e.target as HTMLInputElement).checked)"
                  >
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
            
            <div class="perm-card-body">
              <p class="perm-desc">Izinkan akses ke fitur {{ group.module.name }}:</p>
              <div class="checkbox-list">
                <label v-for="p in group.permissions" :key="p.id" class="checkbox-label">
                  <input type="checkbox" :value="String(p.id)" v-model="selectedPermissions" @change="savePermissions">
                  {{ p.name.split(':').pop()?.toUpperCase() || p.name }}
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <FormModal :open="showModal" :title="editingRole ? 'Edit Role' : 'Add Role'" maxWidth="400px" @close="showModal = false" @submit="handleSaveRole">
      <div class="form-group">
        <label for="role-name" class="form-label">Nama Role</label>
        <input id="role-name" v-model="roleForm.name" type="text" class="form-input" placeholder="Contoh: Admin">
      </div>
    </FormModal>
    
    <ConfirmDialog :open="showConfirm" title="Hapus Role" :message="`Yakin ingin menghapus role '${deletingRole?.name}'?`" @close="showConfirm = false" @confirm="handleDeleteRole" />
  </div>
</template>

<style scoped>
.roles-management {
  display: flex;
  height: calc(100vh - 120px);
  background: var(--color-background);
  gap: 24px;
}

/* Left Sidebar */
.roles-sidebar {
  width: 340px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  padding: 20px;
  border-bottom: 1px solid var(--color-border-light);
}

.tabs {
  display: flex;
  background: #f1f5f9;
  border-radius: 8px;
  padding: 4px;
  margin-bottom: 20px;
}
.tab {
  flex: 1;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
}
.tab.active {
  background: #38bdf8;
  color: #ffffff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.search-add-bar {
  display: flex;
  gap: 12px;
}
.search-box {
  position: relative;
  flex: 1;
}
.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
}
.search-input {
  width: 100%;
  padding: 10px 10px 10px 36px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}
.search-input:focus {
  border-color: #38bdf8;
}

.btn-add {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: #38bdf8;
  color: #ffffff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-add:hover {
  background: #0284c7;
}

.roles-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
.role-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
  margin-bottom: 8px;
}
.role-item:hover {
  background: #f8fafc;
}
.role-item.active {
  background: #eff6ff;
  border-left: 3px solid #38bdf8;
}
.role-name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}
.role-desc {
  font-size: 13px;
  color: #64748b;
  margin-top: 4px;
  display: block;
}
.role-actions {
  display: flex;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}
.role-item:hover .role-actions {
  opacity: 1;
}
.btn-icon {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
}
.btn-icon:hover {
  color: #3b82f6;
}
.btn-icon.text-danger:hover {
  color: #ef4444;
}

/* Right Panel */
.permissions-content {
  flex: 1;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #94a3b8;
}
.permissions-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.master-toggle-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #e2e8f0;
}
.toggle-group {
  display: flex;
  align-items: center;
  gap: 12px;
}
.toggle-label {
  font-weight: 700;
  color: #1e293b;
  font-size: 15px;
}
.modules-grid {
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  align-items: start;
  align-content: start;
  overflow-y: auto;
  flex: 1;
}

.perm-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 16px;
  background: #f8fafc;
  transition: border-color 0.2s;
}
.perm-card:hover {
  border-color: #cbd5e1;
}
.perm-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.perm-card-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.card-icon {
  color: #64748b;
  width: 14px;
  height: 14px;
}
.perm-card-title h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
}
.perm-card-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
}
.status-text {
  font-size: 11px;
  color: #94a3b8;
}

.perm-desc {
  font-size: 11px;
  color: #64748b;
  margin-bottom: 12px;
  line-height: 1.4;
}

.checkbox-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #475569;
  cursor: pointer;
  background: #ffffff;
  padding: 4px 8px;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
}
.checkbox-label input {
  accent-color: #38bdf8;
  width: 12px;
  height: 12px;
  margin: 0;
}

/* Toggles */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}
.toggle-switch.small {
  width: 36px;
  height: 20px;
}
.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: #cbd5e1;
  transition: .3s;
  border-radius: 34px;
}
.toggle-slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: .3s;
  border-radius: 50%;
}
.toggle-switch.small .toggle-slider:before {
  height: 14px;
  width: 14px;
}
input:checked + .toggle-slider {
  background-color: #38bdf8;
}
input:checked + .toggle-slider:before {
  transform: translateX(20px);
}
.toggle-switch.small input:checked + .toggle-slider:before {
  transform: translateX(16px);
}
</style>


