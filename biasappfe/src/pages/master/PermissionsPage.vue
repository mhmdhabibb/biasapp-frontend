<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useModules } from '@/composables/useModules'
import type { TableColumn, Permission } from '@/types'

const { modules } = useModules()

const moduleOptions = computed(() =>
  modules.value.map(m => ({ value: m.id, label: m.name }))
)

const columns: TableColumn[] = [
  { key: 'name', label: 'Nama Permission' },
  { key: 'module_id', label: 'Modul' },
]

const data = ref<Permission[]>([])
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Permission | null>(null)
const deletingItem = ref<Permission | null>(null)
const form = reactive({ name: '', module_id: null as number | null })

function getModuleName(id: number | null): string {
  if (!id) return '-'
  const mod = modules.value.find(m => m.id === id)
  return mod ? mod.name : '-'
}

function openAdd() {
  editingItem.value = null
  Object.assign(form, { name: '', module_id: null })
  showModal.value = true
}

function openEdit(item: Permission) {
  editingItem.value = item
  Object.assign(form, { name: item.name, module_id: item.module_id })
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

function openDelete(item: Permission) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}
</script>

<template>
  <div>
    <PageHeader title="Permissions" button-label="Add Permission" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari permission..." @edit="openEdit" @delete="openDelete">
      <template #cell-module_id="{ value }">
        {{ getModuleName(value) }}
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Permission' : 'Add Permission'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="perm-name" class="form-label">Nama Permission</label>
        <input id="perm-name" v-model="form.name" type="text" class="form-input" placeholder="Contoh: create_user, delete_report">
      </div>
      <div class="form-group">
        <label class="form-label">Modul</label>
        <CustomSelect
          v-model="form.module_id"
          :options="moduleOptions"
          placeholder="Pilih modul"
          id="perm-module"
        />
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Permission" :message="`Yakin ingin menghapus permission '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>

