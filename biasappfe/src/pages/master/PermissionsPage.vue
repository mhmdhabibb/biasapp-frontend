<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useModules } from '@/composables/useModules'
import { resources } from '@/services/resource.service'
import type { TableColumn, Permission } from '@/types'

const { modules } = useModules()

const moduleOptions = computed(() =>
  modules.value.map(m => {
    const hasPerms = data.value.some(p => String(p.module_id) === String(m.id))
    return { 
      value: m.id, 
      label: hasPerms ? `${m.name} (Terdapat Permission)` : m.name 
    }
  })
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
const form = reactive({ 
  name: '', 
  module_id: null as number | string | null, // For edit mode
  module_ids: [] as (number | string)[], // For add mode (multi select)
  crudActions: [] as string[],
  customActions: ''
})

const searchQuery = ref('')
const filteredModules = computed(() => {
  let list = modules.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(m => m.name.toLowerCase().includes(q))
  }
  // Sort empty modules first
  return list.sort((a, b) => {
    const aHas = moduleHasPerms(a.id)
    const bHas = moduleHasPerms(b.id)
    if (aHas === bHas) return a.name.localeCompare(b.name)
    return aHas ? 1 : -1
  })
})

function moduleHasPerms(id: number | string) {
  return data.value.some(p => String(p.module_id) === String(id))
}

function getModulePermsStr(id: number | string) {
  const perms = data.value
    .filter(p => String(p.module_id) === String(id))
    .map(p => {
      const parts = p.name.split(':')
      return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : p.name.toLowerCase()
    })
  if (perms.length === 0) return ''
  return `(Ada: ${perms.join(', ')})`
}

function toggleAllModules() {
  if (form.module_ids.length === filteredModules.value.length) {
    form.module_ids = [] // Deselect all
  } else {
    form.module_ids = filteredModules.value.map(m => m.id) // Select all visible
  }
}

async function fetchData() {
  try {
    const res = await resources.permissions.list()
    data.value = res.data as any
  } catch (error) {
    console.error('Failed to fetch permissions:', error)
  }
}

onMounted(fetchData)

function getModuleName(id: any): string {
  if (!id) return '-'
  const mod = modules.value.find(m => m.id === String(id))
  return mod ? mod.name : '-'
}

function openAdd() {
  editingItem.value = null
  Object.assign(form, { name: '', module_id: null, module_ids: [], crudActions: [], customActions: '' })
  searchQuery.value = ''
  showModal.value = true
}

function openEdit(item: Permission) {
  editingItem.value = item
  Object.assign(form, { name: item.name, module_id: item.module_id, module_ids: [], crudActions: [], customActions: '' })
  showModal.value = true
}

async function handleSubmit() {
  try {
    if (editingItem.value) {
      if (!form.module_id) {
        alert('Modul wajib dipilih!')
        return
      }
      if (!form.name.trim()) {
        alert('Nama permission wajib diisi!')
        return
      }
      await resources.permissions.update(String(editingItem.value.id), { name: form.name, module_id: form.module_id })
    } else {
      if (form.module_ids.length === 0) {
        alert('Pilih minimal satu modul!')
        return
      }
      
      const permissionsToCreate: any[] = []
      
      for (const modId of form.module_ids) {
        const mod = modules.value.find(m => m.id === String(modId))
        if (!mod) continue
        
        const objName = mod.name.trim().toLowerCase().replace(/\s+/g, '_')
        
        // Add checked CRUD actions
        form.crudActions.forEach(action => {
          permissionsToCreate.push({ name: `${objName}:${action}`, module_id: mod.id })
        })
        
        // Add custom actions
        if (form.customActions.trim()) {
          const customs = form.customActions.split(',').map(n => n.trim()).filter(n => n)
          customs.forEach(c => permissionsToCreate.push({ name: `${objName}:${c}`, module_id: mod.id }))
        }
      }
      
      if (permissionsToCreate.length === 0) {
        alert('Pilih minimal satu tindakan standar atau isi tindakan tambahan!')
        return
      }
      
      // Bulk create support
      const promises = permissionsToCreate.map(data => resources.permissions.create(data))
      await Promise.all(promises)
    }
    await fetchData()
    showModal.value = false
  } catch (error: any) {
    console.error('Failed to save permission:', error)
    alert('Gagal menyimpan permission: ' + (error.message || 'Error'))
  }
}

function openDelete(item: Permission) { deletingItem.value = item; showConfirm.value = true }

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.permissions.remove(String(deletingItem.value.id))
      await fetchData()
    } catch (error) {
      console.error('Failed to delete permission:', error)
    }
  }
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
    <FormModal :open="showModal" :title="editingItem ? 'Edit Permission' : 'Add Multiple Permissions'" @close="showModal = false" @submit="handleSubmit">
      
      <!-- ADD MODE: Multi select modules -->
      <template v-if="!editingItem">
        <div class="form-group">
          <div class="flex justify-between items-end mb-2">
            <label class="form-label mb-0">Pilih Modul (Bisa pilih banyak)</label>
            <button type="button" class="text-sm text-primary hover:underline" @click="toggleAllModules">
              {{ form.module_ids.length === filteredModules.length && filteredModules.length > 0 ? 'Deselect All' : 'Select All' }}
            </button>
          </div>
          <input type="text" v-model="searchQuery" class="form-input mb-2" placeholder="Cari modul...">
          
          <div class="module-scroll-grid">
            <label v-for="mod in filteredModules" :key="mod.id" class="mod-check-item" :class="{ 'has-perms': moduleHasPerms(mod.id) }">
              <input type="checkbox" v-model="form.module_ids" :value="mod.id" class="mod-checkbox">
              <div class="mod-check-content">
                <span class="mod-name">{{ mod.name }}</span>
                <span v-if="moduleHasPerms(mod.id)" class="mod-badge">
                  {{ getModulePermsStr(mod.id) }}
                </span>
              </div>
            </label>
            <div v-if="filteredModules.length === 0" class="text-sm text-gray-500 py-2 text-center">
              Modul tidak ditemukan
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Tindakan Standar</label>
          <div class="checkbox-grid">
            <label class="checkbox-label">
              <input type="checkbox" v-model="form.crudActions" value="create"> Create
            </label>
            <label class="checkbox-label">
              <input type="checkbox" v-model="form.crudActions" value="read"> Read
            </label>
            <label class="checkbox-label">
              <input type="checkbox" v-model="form.crudActions" value="update"> Update
            </label>
            <label class="checkbox-label">
              <input type="checkbox" v-model="form.crudActions" value="delete"> Delete
            </label>
          </div>
        </div>
        
        <div class="form-group">
          <label for="perm-custom" class="form-label">Tindakan Tambahan (Opsional, pisahkan dengan koma)</label>
          <input id="perm-custom" v-model="form.customActions" type="text" class="form-input" placeholder="Contoh: approve, print, export">
        </div>
      </template>

      <!-- EDIT MODE: Single module select -->
      <template v-else>
        <div class="form-group">
          <label class="form-label">Modul</label>
          <CustomSelect
            v-model="form.module_id"
            :options="moduleOptions"
            placeholder="Pilih modul"
            id="perm-module"
          />
        </div>
        <div class="form-group">
          <label for="perm-name" class="form-label">Nama Permission</label>
          <input id="perm-name" v-model="form.name" type="text" class="form-input" placeholder="Contoh: user:create">
        </div>
      </template>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Permission" :message="`Yakin ingin menghapus permission '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>

<style scoped>
.checkbox-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 8px;
  margin-bottom: 12px;
}

.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text);
  background: var(--color-surface-sunken, #f8f9fa);
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--color-border-light, #e2e8f0);
  transition: all 0.2s ease;
}

.checkbox-label:hover {
  background: var(--color-surface, #ffffff);
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--color-primary, #3b82f6);
}

.disabled-label {
  opacity: 0.6;
  cursor: not-allowed;
  background-color: #f1f5f9;
}
.disabled-label:hover {
  background-color: #f1f5f9;
  border-color: var(--color-border-light, #e2e8f0);
  box-shadow: none;
}
.disabled-label input[type="checkbox"] {
  cursor: not-allowed;
}

.existing-badge {
  font-size: 11px;
  color: #10b981;
  font-weight: 600;
  margin-left: 4px;
}

.module-scroll-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  max-height: 250px;
  overflow-y: auto;
  padding: 4px;
  background: var(--color-surface-sunken, #f8f9fa);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 8px;
}

.module-scroll-grid::-webkit-scrollbar {
  width: 6px;
}
.module-scroll-grid::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

.mod-check-item {
  display: flex;
  align-items: flex-start;
  padding: 8px 12px;
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.mod-check-item:hover {
  border-color: var(--color-primary, #3b82f6);
}

.mod-check-item.has-perms {
  background-color: #f8fafc;
  border-color: #e2e8f0;
}

.mod-checkbox {
  margin-top: 3px;
  margin-right: 8px;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.mod-check-content {
  display: flex;
  flex-direction: column;
}

.mod-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
}

.mod-badge {
  font-size: 11px;
  color: #10b981;
  margin-top: 2px;
}
</style>