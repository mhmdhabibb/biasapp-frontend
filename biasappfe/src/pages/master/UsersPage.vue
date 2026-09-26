<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { api } from '@/services/api'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import type { TableColumn, User } from '@/types'
import { resources } from '@/services/resource.service'

const columns: TableColumn[] = [
  { key: 'name', label: 'Nama' },
  { key: 'username', label: 'Username' },
  { key: 'phone', label: 'Telepon' },
  { key: 'role_name', label: 'Role' },
]

const data = ref<(User & { role_name?: string })[]>([])

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

const roles = ref<any[]>([])

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

  try {
    if (editingItem.value) {
      await resources.users.update(String(editingItem.value.id), form)
    } else {
      await api.post('/auth/register', form)
    }
    showModal.value = false
    await fetchData()
  } catch (error) {
    console.error('Failed to save user:', error)
  }
}

function openDelete(item: User) {
  deletingItem.value = item
  showConfirm.value = true
}

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.users.remove(String(deletingItem.value.id))
      await fetchData()
    } catch (error) {
      console.error('Failed to delete user:', error)
    }
  }
  showConfirm.value = false
}

</script>

<template>
  <div>
    <PageHeader title="Users" button-label="Add User" @add="openAdd" />
    <DataTable
      :columns="columns"
      :data="data"
      search-placeholder="Cari user..."
      @edit="openEdit"
      @delete="openDelete"
    />

    <FormModal
      :open="showModal"
      :title="editingItem ? 'Edit User' : 'Add User'"
      @close="showModal = false"
      @submit="handleSubmit"
    >
      <div class="form-group">
        <label for="user-name" class="form-label">Nama</label>
        <input id="user-name" v-model="form.name" type="text" class="form-input" placeholder="Nama lengkap">
      </div>
      <div class="form-group">
        <label for="user-username" class="form-label">Username</label>
        <input id="user-username" v-model="form.username" type="text" class="form-input" placeholder="Username login">
      </div>
      <div class="form-group">
        <label for="user-phone" class="form-label">Telepon</label>
        <input id="user-phone" v-model="form.phone" type="tel" class="form-input" placeholder="08xxxxxxxxxx">
      </div>
      <div class="form-group">
        <label for="user-role" class="form-label">Role</label>
        <select id="user-role" v-model="form.role_id" class="form-select">
          <option :value="null">-- Pilih Role --</option>
          <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="user-password" class="form-label">Password</label>
        <div style="position: relative; display: flex; align-items: center;">
          <input id="user-password" v-model="form.password" :type="showPassword ? 'text' : 'password'" class="form-input" :placeholder="editingItem ? 'Kosongkan jika tidak diubah' : 'Password login'" style="padding-right: 40px; width: 100%;">
          <button type="button" @click="showPassword = !showPassword" style="position: absolute; right: 10px; background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--color-text-muted); padding: 0;">
            <svg v-if="showPassword" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
          </button>
        </div>
      </div>
    </FormModal>

    <ConfirmDialog
      :open="showConfirm"
      title="Hapus User"
      :message="`Yakin ingin menghapus user '${deletingItem?.name}'?`"
      @close="showConfirm = false"
      @confirm="handleDelete"
    />
  </div>
</template>


