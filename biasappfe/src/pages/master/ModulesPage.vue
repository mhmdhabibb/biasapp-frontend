<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useToast } from '@/composables/useToast'
import { resources } from '@/services/resource.service'
import type { TableColumn, Module } from '@/types'

const toast = useToast()
const data = ref<Module[]>([])

async function fetchData() {
  try {
    const res = await resources.modules.list()
    data.value = res.data as any
  } catch (error) {
    console.error('Failed to fetch modules:', error)
    toast.error('Failed to fetch module data: ' + ((error as any).message || 'Error'))
  }
}

onMounted(fetchData)

const columns: TableColumn[] = [
  { key: 'name', label: 'Module Name' },
  { key: 'is_active', label: 'Status' },
]

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Module | null>(null)
const deletingItem = ref<Module | null>(null)
const form = reactive({ name: '', is_active: true })

function openAdd() {
  editingItem.value = null
  Object.assign(form, { name: '', is_active: true })
  showModal.value = true
}

function openEdit(item: Module) {
  editingItem.value = item
  Object.assign(form, { name: item.name, is_active: item.is_active })
  showModal.value = true
}

async function handleSubmit() {
  if (!form.name.trim()) return
  try {
    if (editingItem.value) {
      await resources.modules.update(String(editingItem.value.id), form)
    } else {
      await resources.modules.create(form)
    }
    await fetchData()
    showModal.value = false
    toast.success(editingItem.value ? 'Module updated successfully!' : 'Module saved successfully!')
  } catch (error) {
    console.error('Failed to save module:', error)
    toast.error('Failed to save module: ' + ((error as any).message || 'Error'))
  }
}

function openDelete(item: Module) { deletingItem.value = item; showConfirm.value = true }

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.modules.remove(String(deletingItem.value.id))
      await fetchData()
      toast.success('Module deleted successfully!')
    } catch (error) {
      console.error('Failed to delete module:', error)
      toast.error('Failed to delete module')
    }
  }
  showConfirm.value = false
}

</script>

<template>
  <div>
    <PageHeader title="Modules" button-label="Add Module" permission="module:create" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Search modules..." permission="module" @edit="openEdit" @delete="openDelete">
      <template #cell-is_active="{ value }">
        <span :class="value ? 'badge badge-success' : 'badge badge-neutral'">
          {{ value ? 'Active' : 'Inactive' }}
        </span>
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Module' : 'Add Module'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="mod-name" class="form-label">Module Name</label>
        <input id="mod-name" v-model="form.name" type="text" class="form-input" placeholder="Example: Dashboard, Reports">
      </div>
      <div class="form-group">
        <label class="form-label">
          <input type="checkbox" v-model="form.is_active" style="margin-right: 8px;">
          Active module
        </label>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Module" :message="`Are you sure you want to delete module '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>


