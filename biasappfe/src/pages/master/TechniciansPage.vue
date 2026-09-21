<script setup lang="ts">
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn, Technician } from '@/types'

const { technicians: data } = useMasterStore()

const columns: TableColumn[] = [
  { key: 'name', label: 'Nama Teknisi' },
  { key: 'phone', label: 'Telepon' },
]
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Technician | null>(null)
const deletingItem = ref<Technician | null>(null)
const form = reactive({ name: '', phone: '' })

function openAdd() {
  editingItem.value = null
  Object.assign(form, { name: '', phone: '' })
  showModal.value = true
}

function openEdit(item: Technician) {
  editingItem.value = item
  Object.assign(form, { name: item.name, phone: item.phone })
  showModal.value = true
}

function handleSubmit() {
  if (!form.name.trim()) return
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx], ...form }
  } else {
    data.value.push({ id: Date.now(), ...form, created_at: new Date().toISOString(), deleted_at: null })
  }
  showModal.value = false
}

function openDelete(item: Technician) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}
</script>

<template>
  <div>
    <PageHeader title="Technicians" button-label="Tambah Teknisi" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari teknisi..." @edit="openEdit" @delete="openDelete" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit Teknisi' : 'Tambah Teknisi'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="tech-name" class="form-label">Nama</label>
        <input id="tech-name" v-model="form.name" type="text" class="form-input" placeholder="Nama teknisi">
      </div>
      <div class="form-group">
        <label for="tech-phone" class="form-label">Telepon</label>
        <input id="tech-phone" v-model="form.phone" type="tel" class="form-input" placeholder="08xxxxxxxxxx">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Teknisi" :message="`Yakin ingin menghapus teknisi '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
