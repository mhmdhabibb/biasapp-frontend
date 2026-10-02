<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { api } from '@/services/api'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import { useToast } from '@/composables/useToast'
import { useAuth } from '@/composables/useAuth'
import { useHardDelete } from '@/composables/useHardDelete'
import type { TableColumn, User } from '@/types'
import { resources } from '@/services/resource.service'

const toast = useToast()
const { currentUser } = useAuth()

const isPrivileged = computed(() => {
  const role = String(currentUser.value?.role || '').toLowerCase()
  return role === 'admin' || role === 'superadmin'
})

// CS (dan role non-admin lain) tidak boleh membuat user superadmin:
// opsi superadmin disembunyikan dari pilihan role.
const assignableRoles = computed(() => {
  if (isPrivileged.value) return roles.value
  return roles.value.filter((r: any) => String(r.name || '').toLowerCase() !== 'superadmin')
})

function rowRoleName(row: any): string {
  return String(
    row?.role_name ||
    row?.role?.name ||
    roles.value.find((r: any) => String(r.id) === String(row?.role_id))?.name ||
    '',
  ).toLowerCase()
}

function roleBadgeClass(role: string | null | undefined): string {
  const r = String(role || '').toLowerCase()
  if (r.includes('superadmin')) return 'badge-danger'
  if (r === 'admin' || r.includes('admin')) return 'badge-warning'
  if (r.includes('technician') || r.includes('teknisi')) return 'badge-info'
  if (r.includes('accounting') || r.includes('finance') || r.includes('keuangan')) return 'badge-success'
  return 'badge-neutral'
}

function formatRole(role: string | null | undefined): string {
  if (!role) return '-'
  return String(role)
    .split(/[_-\s]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

// CS boleh reset password karyawan lain, kecuali yang ber-role superadmin.
function canReset(row: any): boolean {
  if (isPrivileged.value) return true
  return rowRoleName(row) !== 'superadmin'
}

const columns: TableColumn[] = [
  { key: 'name', label: 'Name' },
  { key: 'username', label: 'Username' },
  { key: 'phone', label: 'Phone' },
  { key: 'role_name', label: 'Role' },
]

const data = ref<(User & { role_name?: string })[]>([])
const roles = ref<any[]>([])

const showModal = ref(false)
const showConfirm = ref(false)
const showPassword = ref(false)
const editingItem = ref<User | null>(null)
const deletingItem = ref<User | null>(null)

const form = reactive({
  name: '',
  username: '',
  phone: '',
  role_id: null as any,
  password: '',
})

async function fetchData() {
  try {
    const [resUsers, resRoles] = await Promise.all([
      resources.users.list(),
      resources.roles.list()
    ])
    
    roles.value = resRoles.data
    
    data.value = resUsers.data.map((u: any) => ({
      ...u,
      role_name: u.role?.name || roles.value.find((r: any) => r.id === u.role_id)?.name
    }))
  } catch (error) {
    console.error('Failed to fetch data:', error)
    toast.error('Failed to fetch user data: ' + ((error as any).message || 'Error'))
  }
}

onMounted(fetchData)

function openAdd() {
  editingItem.value = null
  Object.assign(form, { name: '', username: '', phone: '', role_id: null, password: '' })
  showModal.value = true
}

function openEdit(item: User) {
  editingItem.value = item
  Object.assign(form, { name: item.name, username: item.username, phone: item.phone, role_id: item.role_id, password: '' })
  showModal.value = true
}

async function handleSubmit() {
  if (!form.name.trim() || !form.username.trim()) return

  // Pertahanan lapis kedua: cegah role superadmin lolos via manipulasi client.
  const chosenRole = roles.value.find((r: any) => String(r.id) === String(form.role_id))
  if (
    !isPrivileged.value &&
    String(chosenRole?.name || '').toLowerCase() === 'superadmin'
  ) {
    toast.error('CS tidak diizinkan membuat user superadmin.')
    return
  }

  try {
    if (editingItem.value) {
      await resources.users.update(String(editingItem.value.id), form)
    } else {
      await api.post('/auth/register', form)
    }
    showModal.value = false
    await fetchData()
    toast.success(editingItem.value ? 'User updated successfully!' : 'User saved successfully!')
  } catch (error) {
    console.error('Failed to save user:', error)
    toast.error('Failed to save user: ' + ((error as any).message || 'Error'))
  }
}

function openDelete(item: User) {
  deletingItem.value = item
  showConfirm.value = true
}

const hardDelete = useHardDelete((id: string) => resources.users.hardRemove(id), fetchData)

const showResetModal = ref(false)
const resetTarget = ref<(User & { role_name?: string }) | null>(null)
const showResetPwd = ref(false)
const resetForm = reactive({ new_password: '' })

function openReset(item: User & { role_name?: string }) {
  resetTarget.value = item
  resetForm.new_password = ''
  showResetPwd.value = false
  showResetModal.value = true
}

async function submitReset() {
  if (!resetTarget.value) return
  if (!canReset(resetTarget.value)) {
    toast.error('Hanya admin yang boleh mereset password superadmin.')
    return
  }
  if (!resetForm.new_password || resetForm.new_password.length < 6) {
    toast.error('Password baru minimal 6 karakter.')
    return
  }
  try {
    await api.post('/auth/reset-password', {
      user_id: resetTarget.value.id,
      new_password: resetForm.new_password,
    })
    showResetModal.value = false
    toast.success(`Password user '${resetTarget.value.username}' berhasil direset.`)
  } catch (error) {
    console.error('Failed to reset password:', error)
    toast.error('Gagal reset password: ' + ((error as any).message || 'Error'))
  }
}

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.users.remove(String(deletingItem.value.id))
      await fetchData()
      toast.success('User deleted successfully!')
    } catch (error) {
      console.error('Failed to delete user:', error)
      toast.error('Failed to delete user')
    }
  }
  showConfirm.value = false
}

</script>

<template>
  <div>
    <PageHeader title="Users" button-label="Add User" permission="user:create" @add="openAdd" />
    <DataTable
      :columns="columns"
      :data="data"
      search-placeholder="Search users..."
      permission="user"
      @edit="openEdit"
      @delete="openDelete"
    >
      <template #cell-role_name="{ value }">
        <span class="badge" :class="roleBadgeClass(value)">
          {{ formatRole(value) }}
        </span>
      </template>
      <template #actions="{ row }">
        <button
          v-if="canReset(row)"
          class="action-btn"
          title="Reset password"
          aria-label="Reset password"
          @click.stop="openReset(row)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0110 0v4"></path>
          </svg>
        </button>
        <button
          v-if="hardDelete.isSuperadmin"
          class="action-btn action-btn--hard"
          title="Hapus permanen dari database (superadmin)"
          aria-label="Hapus permanen"
          @click.stop="hardDelete.open(row)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
            <line x1="12" y1="11" x2="12" y2="17"></line>
          </svg>
        </button>
      </template>
    </DataTable>

    <HardDeleteDialog :open="hardDelete.show" title="Hapus Permanen User" :item-label="hardDelete.expected"
      :expected="hardDelete.expected" :confirm-valid="hardDelete.confirmed" @close="hardDelete.close"
      @confirm="hardDelete.confirm" @update:input="hardDelete.input = $event" />

    <FormModal
      :open="showModal"
      :title="editingItem ? 'Edit User' : 'Add User'"
      @close="showModal = false"
      @submit="handleSubmit"
    >
      <div class="form-group">
        <label for="user-name" class="form-label">Name</label>
        <input id="user-name" v-model="form.name" type="text" class="form-input" placeholder="Full name">
      </div>
      <div class="form-group">
        <label for="user-username" class="form-label">Username</label>
        <input id="user-username" v-model="form.username" type="text" class="form-input" placeholder="Login username">
      </div>
      <div class="form-group">
        <label for="user-phone" class="form-label">Phone</label>
        <input id="user-phone" v-model="form.phone" type="tel" class="form-input" placeholder="08xxxxxxxxxx">
      </div>
      <div class="form-group">
        <label for="user-role" class="form-label">Role</label>
        <select id="user-role" v-model="form.role_id" class="form-select">
          <option :value="null">-- Select Role --</option>
          <option v-for="r in assignableRoles" :key="r.id" :value="r.id">{{ r.name }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="user-password" class="form-label">Password</label>
        <div style="position: relative; display: flex; align-items: center;">
          <input id="user-password" v-model="form.password" :type="showPassword ? 'text' : 'password'" class="form-input" :placeholder="editingItem ? 'Leave empty if unchanged' : 'Login password'" style="padding-right: 40px; width: 100%;">
          <button type="button" @click="showPassword = !showPassword" style="position: absolute; right: 10px; background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--color-text-muted); padding: 0;">
            <svg v-if="showPassword" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
          </button>
        </div>
      </div>
    </FormModal>

    <ConfirmDialog
      :open="showConfirm"
      title="Delete User"
      :message="`Are you sure you want to delete user '${deletingItem?.name}'?`"
      @close="showConfirm = false"
      @confirm="handleDelete"
    />

    <FormModal
      :open="showResetModal"
      :title="`Reset Password - ${resetTarget?.username || ''}`"
      @close="showResetModal = false"
      @submit="submitReset"
    >
      <div class="form-group">
        <label class="form-label">Password Baru (min. 6 karakter)</label>
        <div style="position: relative; display: flex; align-items: center;">
          <input v-model="resetForm.new_password" :type="showResetPwd ? 'text' : 'password'" class="form-input" placeholder="Password sementara baru" autocomplete="new-password" style="padding-right: 40px; width: 100%;">
          <button type="button" @click="showResetPwd = !showResetPwd" style="position: absolute; right: 10px; background: none; border: none; cursor: pointer; display: flex; align-items: center; color: var(--color-text-muted); padding: 0;">
            <svg v-if="showResetPwd" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
          </button>
        </div>
      </div>
      <p style="font-size: 12px; color: var(--color-text-muted);">Password user akan langsung diganti. Sampaikan password sementara ini ke user yang bersangkutan.</p>
    </FormModal>
  </div>
</template>


