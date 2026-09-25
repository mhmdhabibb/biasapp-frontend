<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { resources } from '@/services/resource.service'
import type { TableColumn, Module } from '@/types'

const data = ref<Module[]>([])

async function fetchData() {
  try {
    const res = await resources.modules.list()
    data.value = res.data as any
  } catch (error) {
    console.error('Failed to fetch modules:', error)
  }
}

onMounted(fetchData)

const columns: TableColumn[] = [
  { key: 'name', label: 'Nama Modul' },
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
  } catch (error) {
    console.error('Failed to save module:', error)
  }
}

function openDelete(item: Module) { deletingItem.value = item; showConfirm.value = true }

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.modules.remove(String(deletingItem.value.id))
      await fetchData()
    } catch (error) {
      console.error('Failed to delete module:', error)
    }
  }
  showConfirm.value = false
}

</script>

<template>
  <div>
    <PageHeader title="Modules" button-label="Add Module" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari module..." @edit="openEdit" @delete="openDelete">
      <template #cell-is_active="{ value }">
        <span :class="value ? 'badge badge-success' : 'badge badge-neutral'">
          {{ value ? 'Aktif' : 'Nonaktif' }}
        </span>
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Module' : 'Add Module'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="mod-name" class="form-label">Nama Modul</label>
        <input id="mod-name" v-model="form.name" type="text" class="form-input" placeholder="Contoh: Dashboard, Laporan">
      </div>
      <div class="form-group">
        <label class="form-label">
          <input type="checkbox" v-model="form.is_active" style="margin-right: 8px;">
          Modul aktif
        </label>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Module" :message="`Yakin ingin menghapus module '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>


