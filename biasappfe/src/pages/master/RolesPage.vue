<script setup lang="ts">
// @ts-nocheck
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import FormModal from '@/components/ui/FormModal.vue'
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import { useToast } from '@/composables/useToast'
import { useHardDelete } from '@/composables/useHardDelete'
import { api } from '@/services/api'
import { resources } from '@/services/resource.service'
import { useAuthStore } from '@/stores/auth.store'
import type { Module, Permission, Role } from '@/types'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const toast = useToast()
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
const isLoading = ref(true)

// Modals
const showModal = ref(false)
const showConfirm = ref(false)
const editingRole = ref<Role | null>(null)
const deletingRole = ref<Role | null>(null)
const roleForm = ref({ name: '' })

const activeTab = ref('roles') // 'users' or 'roles'
const moduleSearchQuery = ref('')

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
    } else if (selectedRoleId.value) {
      // Trigger update manually if selectedRoleId was already set but data just arrived
      const role = roles.value.find(r => String(r.id) === selectedRoleId.value)
      selectedPermissions.value = role?.permissions ? role.permissions.map(p => String(p.id)) : []
    }
  } catch (error) {
    console.error('Failed to fetch data:', error)
  } finally {
    isLoading.value = false
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
const enabledModuleCount = computed(() => permissionsByModule.value.filter(group => isModuleFullySelected(group.module)).length)

const permissionsByModule = computed(() => {
  const grouped = new Map<string, Permission[]>()
  allPermissions.value.forEach(p => {
    const hasModule = p.module_id !== null && p.module_id !== undefined && String(p.module_id) !== 'null'
    const key = hasModule ? String(p.module_id) : `none:${(p.name.split(':')[0] || p.name).toLowerCase()}`
    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key)?.push(p)
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

  // Permissions without a module (module_id NULL, e.g. purchase_order:view)
  grouped.forEach((perms, key) => {
    if (!key.startsWith('none:')) return
    result.push({
      module: {
        id: key,
        name: `${key.slice(5)} (No Module)`,
        is_active: true,
      } as Module,
      permissions: perms
    })
  })
  return result
})

const filteredPermissionGroups = computed(() => {
  const query = moduleSearchQuery.value.trim().toLowerCase()
  if (!query) return permissionsByModule.value
  return permissionsByModule.value.filter(group => group.module.name.toLowerCase().includes(query))
})

// Watchers
// Only set selectedPermissions when selectedRoleId changes (when switching roles),
// do not watch live from selectedRole to avoid race conditions when users click quickly.
watch(selectedRoleId, (newId) => {
  const role = roles.value.find(r => String(r.id) === newId)
  if (role && role.permissions) {
    selectedPermissions.value = role.permissions.map(p => String(p.id))
  } else {
    selectedPermissions.value = []
  }
})

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

const hardDelete = useHardDelete(async (id: string) => {
  await resources.roles.hardRemove(id)
  if (selectedRoleId.value === id) selectedRoleId.value = null
}, fetchData)

async function handleSaveRole() {
  if (!roleForm.value.name.trim()) return
  try {
    if (editingRole.value) {
      await resources.roles.update(String(editingRole.value.id), { name: roleForm.value.name })
      toast.success("Role updated successfully!")
    } else {
      await resources.roles.create({ name: roleForm.value.name })
      toast.success("Role saved successfully!")
    }
    showModal.value = false
    await fetchData()
  } catch (error: any) {
    console.error('Failed to save role:', error)
    toast.error('Failed to save role: ' + (error.message || 'Error'))
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
    toast.success("Role deleted successfully!")
  } catch (error: any) {
    console.error('Failed to delete role:', error)
    toast.error('Failed to delete role: ' + (error.message || 'Error'))
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
    // Optionally update locally instead of full refetch to prevent flickering
    const roleIdx = roles.value.findIndex(r => String(r.id) === selectedRoleId.value)
    if (roleIdx > -1) {
      const currentSelection = [...selectedPermissions.value]
      roles.value[roleIdx].permissions = allPermissions.value.filter(p => currentSelection.includes(String(p.id)))
    }
    // Refresh the current user's permissions so the sidebar updates immediately
    await authStore.refreshPermissions()
  } catch (error: any) {
    console.error(error)
    toast.error('Failed to save: ' + (error.message || 'Error'))
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
        <template v-if="isLoading">
          <span v-for="item in 5" :key="item" class="role-skeleton" />
        </template>
        <div 
          v-else
          v-for="role in filteredRoles" 
          :key="role.id" 
          class="role-item"
          :class="{ active: String(role.id) === selectedRoleId }"
          @click="selectRole(role)"
        >
          <div class="role-info">
            <h4 class="role-name">{{ role.name }}</h4>
            <span class="role-desc">System role</span>
          </div>
          <div class="role-actions">
            <button v-if="authStore.hasPermission('role:update')" class="btn-icon" @click.stop="openEditRole(role)" title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button v-if="authStore.hasPermission('role:delete')" class="btn-icon text-danger" @click.stop="openDeleteRole(role)" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
            </button>
            <button v-if="hardDelete.isSuperadmin" class="btn-icon btn-hard-delete" @click.stop="hardDelete.open(role)" title="Hapus permanen dari database (superadmin)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path><line x1="12" y1="11" x2="12" y2="17"></line></svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Panel: Permissions Matrix -->
    <div class="permissions-content">
      <div v-if="isLoading" class="permission-loading-grid" role="status" aria-label="Loading permissions">
        <div v-for="item in 6" :key="item" class="permission-skeleton">
          <span class="permission-skeleton-title" />
          <span class="permission-skeleton-line" />
          <span class="permission-skeleton-line short" />
        </div>
      </div>
      <div v-else-if="!selectedRole" class="empty-state">
        <p>Select a role in the left panel to manage permissions.</p>
      </div>
      
      <div v-else class="permissions-wrapper">
        <header class="permission-heading">
          <div>
            <p class="permission-eyebrow">ROLE ACCESS</p>
            <h2>{{ selectedRole.name }}</h2>
            <p class="permission-subtitle">Manage modules and actions available to this role.</p>
          </div>
          <div class="access-summary" aria-live="polite">
            <strong>{{ selectedPermissions.length }}</strong>
            <span>of {{ allPermissions.length }} permissions enabled</span>
            <span class="summary-divider"></span>
            <strong>{{ enabledModuleCount }}</strong>
            <span>modules fully enabled</span>
          </div>
        </header>

        <div class="permission-toolbar">
          <label class="all-access-control">
            <input
              type="checkbox"
              :checked="isAllFullySelected"
              @change="(e) => toggleAll((e.target as HTMLInputElement).checked)"
            >
            <span class="all-access-copy">
              <strong>Full access</strong>
              <small>Enable every permission for this role</small>
            </span>
          </label>
          <div class="module-search">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input v-model="moduleSearchQuery" type="search" class="form-input" placeholder="Find a module" aria-label="Search modules">
          </div>
          <div class="save-indicator" :class="{ 'is-saving': isSaving }" aria-live="polite">
            <span class="save-dot"></span>
            {{ isSaving ? 'Saving changes' : 'Changes saved' }}
          </div>
        </div>

        <div v-if="filteredPermissionGroups.length === 0" class="module-search-empty">
          {{ moduleSearchQuery ? 'No modules match your search.' : 'No permission modules are configured.' }}
        </div>

        <div v-else class="module-list">
          <section v-for="group in filteredPermissionGroups" :key="group.module.id" class="module-row">
            <div class="module-row-heading">
              <div class="module-identity">
                <span class="module-mark" aria-hidden="true">{{ group.module.name.slice(0, 1).toUpperCase() }}</span>
                <div>
                  <h3>{{ group.module.name }}</h3>
                  <p>{{ group.permissions.length }} available actions</p>
                </div>
              </div>
              <label class="module-access-toggle">
                <span>{{ isModuleFullySelected(group.module) ? 'All enabled' : 'Custom access' }}</span>
                <span class="toggle-switch small">
                  <input
                    type="checkbox"
                    :checked="isModuleFullySelected(group.module)"
                    :aria-label="`Toggle all ${group.module.name} permissions`"
                    @change="(e) => toggleModule(group.module, (e.target as HTMLInputElement).checked)"
                  >
                  <span class="toggle-slider"></span>
                </span>
              </label>
            </div>
            <div class="permission-actions">
              <label v-for="p in group.permissions" :key="p.id" class="permission-action">
                <input type="checkbox" :value="String(p.id)" v-model="selectedPermissions" @change="savePermissions">
                <span>{{ p.name.split(':').pop()?.replace(/-/g, ' ').toUpperCase() || p.name }}</span>
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <FormModal :open="showModal" :title="editingRole ? 'Edit Role' : 'Add Role'" maxWidth="400px" @close="showModal = false" @submit="handleSaveRole">
      <div class="form-group">
        <label for="role-name" class="form-label">Role Name</label>
        <input id="role-name" v-model="roleForm.name" type="text" class="form-input" placeholder="Example: Admin">
      </div>
    </FormModal>
    
    <ConfirmDialog :open="showConfirm" title="Delete Role" :message="`Are you sure you want to delete role '${deletingRole?.name}'?`" @close="showConfirm = false" @confirm="handleDeleteRole" />
    <HardDeleteDialog :open="hardDelete.show" title="Hapus Permanen Role" :item-label="hardDelete.expected"
      :expected="hardDelete.expected" :confirm-valid="hardDelete.confirmed" @close="hardDelete.close"
      @confirm="hardDelete.confirm" @update:input="hardDelete.input = $event" />
  </div>
</template>

<style scoped>
.roles-management {
  display: grid;
  grid-template-columns: 270px minmax(0, 1fr);
  height: calc(100vh - 120px);
  min-height: 520px;
  gap: 16px;
}

.roles-sidebar,
.permissions-content {
  min-width: 0;
  border: 1px solid #dce4ec;
  border-radius: 10px;
  box-shadow: 0 3px 12px rgba(17, 34, 51, 0.04);
}

.module-search {
  position: relative;
  flex: 1 1 240px;
  max-width: 340px;
  margin-left: auto;
  color: #748292;
}

.module-search svg {
  position: absolute;
  top: 50%;
  left: 12px;
  transform: translateY(-50%);
  pointer-events: none;
}

.module-search .form-input {
  width: 100%;
  height: 40px;
  padding: 0 12px 0 38px;
  border: 1px solid #d6dfe8;
  border-radius: 7px;
  background: #fff;
  color: #253447;
  font-size: 13px;
}

.module-search .form-input:focus {
  border-color: #1697a6;
  outline: 2px solid rgba(22, 151, 166, 0.13);
  outline-offset: 1px;
}

.module-search-empty {
  flex: 1;
  padding: 48px 16px;
  color: #6e7b89;
  text-align: center;
}

/* Left Sidebar */
.roles-sidebar {
  width: auto;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid #e4eaf0;
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
  transition: background 0.2s, transform 0.2s, box-shadow 0.2s;
  margin-bottom: 8px;
}
.role-item:hover {
  background: #f8fafc;
  transform: translateX(3px);
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
.btn-icon.btn-hard-delete {
  color: #991b1b;
  border: 1px dashed currentColor;
  border-radius: 6px;
}
.btn-icon.btn-hard-delete:hover {
  background: #991b1b;
  border-style: solid;
  color: #fff;
}

/* Right Panel */
.permissions-content {
  display: flex;
  background: #ffffff;
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
  min-height: 0;
  height: 100%;
}

.permission-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 22px 24px 18px;
  border-bottom: 1px solid #e8edf2;
}

.permission-eyebrow {
  margin: 0 0 5px;
  color: #138895;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
}

.permission-heading h2 {
  margin: 0;
  color: #18283a;
  font-size: 22px;
  font-weight: 700;
}

.permission-subtitle {
  margin: 5px 0 0;
  color: #738091;
  font-size: 13px;
}

.access-summary {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 6px;
  color: #738091;
  font-size: 11px;
  white-space: nowrap;
}

.access-summary strong {
  color: #1b3547;
  font-size: 18px;
}

.summary-divider {
  width: 1px;
  height: 22px;
  margin: 0 8px;
  background: #dce4ec;
}

.permission-toolbar {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 12px 24px;
  border-bottom: 1px solid #e8edf2;
  background: #fbfcfd;
}

.all-access-control {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 220px;
  cursor: pointer;
}

.all-access-control > input,
.permission-action input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #148d9b;
}

.all-access-copy {
  display: grid;
  gap: 2px;
}

.all-access-copy strong {
  color: #26384a;
  font-size: 13px;
}

.all-access-copy small {
  color: #778493;
  font-size: 11px;
}

.save-indicator {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #718091;
  font-size: 11px;
  white-space: nowrap;
}

.save-indicator.is-saving {
  color: #a46c19;
}

.save-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #37a67a;
}

.save-indicator.is-saving .save-dot {
  background: #d99b35;
}

.module-list {
  display: grid;
  align-content: start;
  gap: 10px;
  flex: 1;
  min-height: 0;
  padding: 16px 24px 24px;
  overflow-y: auto;
}

.module-row {
  padding: 14px 16px;
  border: 1px solid #dfe6ed;
  border-radius: 8px;
  background: #fff;
}

.module-row-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 13px;
}

.module-identity {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}

.module-mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  border-radius: 8px;
  background: #e8f4f3;
  color: #167b80;
  font-size: 14px;
  font-weight: 700;
}

.module-identity h3 {
  margin: 0;
  color: #26384a;
  font-size: 14px;
  font-weight: 700;
}

.module-identity p {
  margin: 3px 0 0;
  color: #7a8794;
  font-size: 11px;
}

.module-access-toggle {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #72808e;
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
}

.permission-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding-left: 45px;
}

.permission-action {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 30px;
  padding: 5px 9px;
  border: 1px solid #dce4eb;
  border-radius: 6px;
  background: #fbfcfd;
  color: #435365;
  font-size: 10px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.permission-action:has(input:checked) {
  border-color: #a8d7d3;
  background: #eff8f7;
  color: #176b70;
}
.master-toggle-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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

.role-skeleton,
.permission-skeleton-title,
.permission-skeleton-line {
  display: block;
  border-radius: 6px;
  background: linear-gradient(100deg, #edf0f4 20%, #f8fafc 38%, #edf0f4 56%);
  background-size: 220% 100%;
  animation: role-shimmer 1.35s ease-in-out infinite;
}

.role-skeleton { height: 64px; margin-bottom: 8px; }

.permission-loading-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  align-content: start;
  gap: 12px;
  padding: 16px;
}

.permission-skeleton {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}

.permission-skeleton-title { width: 56%; height: 15px; }
.permission-skeleton-line { width: 88%; height: 12px; }
.permission-skeleton-line.short { width: 62%; }

@keyframes role-shimmer {
  to { background-position-x: -220%; }
}

.perm-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 16px;
  background: #f8fafc;
  transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
}
.perm-card:hover {
  border-color: #cbd5e1;
  transform: translateY(-2px);
  box-shadow: 0 5px 14px rgba(15, 23, 42, 0.06);
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

@media (max-width: 980px) {
  @media (max-width: 980px) {
    .roles-management {
      grid-template-columns: 220px minmax(0, 1fr);
      gap: 12px;
    }

    .permission-heading,
    .permission-toolbar {
      padding-right: 16px;
      padding-left: 16px;
    }

    .permission-heading {
      align-items: flex-start;
      flex-direction: column;
      gap: 12px;
    }

    .access-summary {
      justify-content: flex-start;
    }

    .permission-toolbar {
      flex-wrap: wrap;
    }

    .module-search {
      flex-basis: 100%;
      max-width: none;
      margin-left: 0;
    }

    .module-list {
      padding-right: 16px;
      padding-left: 16px;
    }
  }

  @media (max-width: 700px) {
    .roles-management {
      grid-template-columns: minmax(0, 1fr);
      height: auto;
      min-height: 0;
    }

    .roles-sidebar {
      max-height: 270px;
    }

    .permissions-content {
      min-height: 620px;
    }

    .master-toggle-bar {
      align-items: stretch;
      padding: 14px;
    }

    .all-access-control {
      min-width: 0;
    }

    .save-indicator {
      margin-left: auto;
    }

    .permission-heading {
      padding: 18px 16px;
    }

    .permission-heading h2 {
      font-size: 20px;
    }

    .access-summary {
      flex-wrap: wrap;
      white-space: normal;
    }

    .permission-toolbar {
      padding: 12px 16px;
    }

    .module-list {
      padding: 12px;
    }

    .module-row {
      padding: 12px;
    }

    .permission-actions {
      padding-left: 0;
    }
  }

}

@media (prefers-reduced-motion: reduce) {
  .role-skeleton,
  .permission-skeleton-title,
  .permission-skeleton-line { animation: none; }
  .role-item,
  .perm-card { transition: none; }
}
</style>


