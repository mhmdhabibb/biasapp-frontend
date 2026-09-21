<script setup lang="ts">
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn, Customer } from '@/types'

const { customers: data } = useMasterStore()

const columns: TableColumn[] = [
  { key: 'company_name', label: 'Perusahaan' },
  { key: 'name', label: 'Nama' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Telepon' },
]
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Customer | null>(null)
const deletingItem = ref<Customer | null>(null)
const form = reactive({ company_name: '', name: '', email: '', phone: '', address: '' })

function openAdd() {
  editingItem.value = null
  Object.assign(form, { company_name: '', name: '', email: '', phone: '', address: '' })
  showModal.value = true
}

function openEdit(item: Customer) {
  editingItem.value = item
  Object.assign(form, { company_name: item.company_name, name: item.name, email: item.email, phone: item.phone, address: item.address })
  showModal.value = true
}

function handleSubmit() {
  if (!form.name.trim()) return
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx], ...form, updated_at: new Date().toISOString() }
  } else {
    data.value.push({ id: Date.now(), ...form, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })
  }
  showModal.value = false
}

function openDelete(item: Customer) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}
</script>

<template>
  <div>
    <PageHeader title="Customers" button-label="Add Customer" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari customer..." @edit="openEdit" @delete="openDelete" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit Customer' : 'Tambah Customer'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="cust-company" class="form-label">Nama Perusahaan</label>
        <input id="cust-company" v-model="form.company_name" type="text" class="form-input" placeholder="PT Example">
      </div>
      <div class="form-group">
        <label for="cust-name" class="form-label">Nama PIC</label>
        <input id="cust-name" v-model="form.name" type="text" class="form-input" placeholder="Nama kontak">
      </div>
      <div class="form-group">
        <label for="cust-email" class="form-label">Email</label>
        <input id="cust-email" v-model="form.email" type="email" class="form-input" placeholder="email@perusahaan.com">
      </div>
      <div class="form-group">
        <label for="cust-phone" class="form-label">Telepon</label>
        <input id="cust-phone" v-model="form.phone" type="tel" inputmode="numeric" pattern="[0-9]*" class="form-input" placeholder="08xxxxxxxxxx" @input="form.phone = form.phone.replace(/[^0-9]/g, '')">
      </div>
      <div class="form-group">
        <label for="cust-address" class="form-label">Alamat</label>
        <textarea id="cust-address" v-model="form.address" class="form-textarea" placeholder="Alamat lengkap"></textarea>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Customer" :message="`Yakin ingin menghapus customer '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
