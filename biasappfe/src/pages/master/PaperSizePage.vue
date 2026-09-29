<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { resources } from '@/services/resource.service'
import type { TableColumn, PaperSize } from '@/types'

const columns: TableColumn[] = [
  { key: 'name', label: 'Ukuran Kertas' },
]

const data = ref<PaperSize[]>([])

async function fetchData() {
  try {
    const res = await resources.paperSizes.list()
    data.value = res.data as any
  } catch (error) {
    console.error('Failed to fetch paper sizes:', error)
  }
}

onMounted(fetchData)

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<PaperSize | null>(null)
const deletingItem = ref<PaperSize | null>(null)
const form = reactive({ name: '' })

function openAdd() {
  editingItem.value = null
  form.name = ''
  showModal.value = true
}

function openEdit(item: PaperSize) {
  editingItem.value = item
  form.name = item.name
  showModal.value = true
}

async function handleSubmit() {
  if (!form.name.trim()) return
  try {
    if (editingItem.value) {
      await resources.paperSizes.update(String(editingItem.value.id), form)
    } else {
      await resources.paperSizes.create(form)
    }
    await fetchData()
    showModal.value = false
  } catch (error) {
    console.error('Failed to save paper size:', error)
  }
}

function openDelete(item: PaperSize) { deletingItem.value = item; showConfirm.value = true }

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.paperSizes.remove(String(deletingItem.value.id))
      await fetchData()
    } catch (error) {
      console.error('Failed to delete paper size:', error)
    }
  }
  showConfirm.value = false
}
</script>

<template>
  <div>
    <PageHeader title="Paper Size" button-label="Add Paper Size" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari ukuran kertas..." @edit="openEdit" @delete="openDelete" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit Paper Size' : 'Add Paper Size'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="ps-name" class="form-label">Nama Ukuran</label>
        <input id="ps-name" v-model="form.name" type="text" class="form-input" placeholder="Contoh: A4, A3, Legal, Letter">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Ukuran Kertas" :message="`Yakin ingin menghapus ukuran '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
