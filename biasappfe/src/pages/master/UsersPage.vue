<script setup lang="ts">
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import type { TableColumn, User } from '@/types'

const columns: TableColumn[] = [
  { key: 'name', label: 'Nama' },
  { key: 'username', label: 'Username' },
  { key: 'phone', label: 'Telepon' },
  { key: 'role_name', label: 'Role' },
]

const data = ref<(User & { role_name?: string })[]>([])

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<User | null>(null)
const deletingItem = ref<User | null>(null)

const form = reactive({
  name: '',
  username: '',
  phone: '',
  role_id: null as number | null,
  password: '',
})

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

function handleSubmit() {
  if (!form.name.trim() || !form.username.trim()) return

  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) {
      data.value[idx] = { ...data.value[idx], ...form, updated_at: new Date().toISOString() }
    }
  } else {
    data.value.push({
      id: Date.now(),
      ...form,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }
  showModal.value = false
}

function openDelete(item: User) {
  deletingItem.value = item
  showConfirm.value = true
}

function handleDelete() {
  if (deletingItem.value) {
    data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
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
        <label for="user-password" class="form-label">Password</label>
        <input id="user-password" v-model="form.password" type="password" class="form-input" :placeholder="editingItem ? 'Kosongkan jika tidak diubah' : 'Password login'">
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
