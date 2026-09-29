<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { resources } from '@/services/resource.service'
import type { TableColumn, UnitType } from '@/types'

const columns: TableColumn[] = [
  { key: 'name', label: 'Nama Tipe' },
  { key: 'slug', label: 'Slug' },
]

const data = ref<UnitType[]>([])

async function fetchData() {
  try {
    const res = await resources.unitTypes.list()
    data.value = res.data as any
  } catch (error) {
    console.error('Failed to fetch unit types:', error)
  }
}

onMounted(fetchData)

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<UnitType | null>(null)
const deletingItem = ref<UnitType | null>(null)
const form = reactive({ name: '', slug: '' })

function openAdd() {
  editingItem.value = null
  Object.assign(form, { name: '', slug: '' })
  showModal.value = true
}

function openEdit(item: UnitType) {
  editingItem.value = item
  Object.assign(form, { name: item.name, slug: item.slug })
  showModal.value = true
}

async function handleSubmit() {
  if (!form.name.trim()) return
  if (!form.slug.trim()) form.slug = form.name.toLowerCase().replace(/\s+/g, '-')
  try {
    if (editingItem.value) {
      await resources.unitTypes.update(String(editingItem.value.id), form)
    } else {
      await resources.unitTypes.create(form)
    }
    await fetchData()
    showModal.value = false
  } catch (error) {
    console.error('Failed to save unit type:', error)
  }
}

function openDelete(item: UnitType) { deletingItem.value = item; showConfirm.value = true }

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.unitTypes.remove(String(deletingItem.value.id))
      await fetchData()
    } catch (error) {
      console.error('Failed to delete unit type:', error)
    }
  }
  showConfirm.value = false
}
</script>

<template>
  <div>
    <PageHeader title="Unit Types" button-label="Add Unit Type" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari tipe unit..." @edit="openEdit" @delete="openDelete" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit Unit Type' : 'Add Unit Type'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="ut-name" class="form-label">Nama Tipe</label>
        <input id="ut-name" v-model="form.name" type="text" class="form-input" placeholder="Contoh: Printer, Copier">
      </div>
      <div class="form-group">
        <label for="ut-slug" class="form-label">Slug</label>
        <input id="ut-slug" v-model="form.slug" type="text" class="form-input" placeholder="Otomatis dari nama jika kosong">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Tipe Unit" :message="`Yakin ingin menghapus tipe unit '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
