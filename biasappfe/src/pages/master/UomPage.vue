<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { resources } from '@/services/resource.service'
import type { TableColumn, UOM } from '@/types'
import { useToast } from '@/composables/useToast'

const toast = useToast()

const columns: TableColumn[] = [
  { key: 'name', label: 'Nama UOM' },
]

const data = ref<UOM[]>([])

async function fetchData() {
  try {
    const res = await resources.uoms.list()
    data.value = res.data as any
  } catch (error) {
    console.error('Failed to fetch UOMs:', error)
    toast.error('Gagal mengambil data: ' + ((error as any).message || 'Error'))
  }
}

onMounted(fetchData)

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<UOM | null>(null)
const deletingItem = ref<UOM | null>(null)
const form = reactive({ name: '' })

function openAdd() {
  editingItem.value = null
  form.name = ''
  showModal.value = true
}

function openEdit(item: UOM) {
  editingItem.value = item
  form.name = item.name
  showModal.value = true
}

async function handleSubmit() {
  if (!form.name.trim()) return
  try {
    if (editingItem.value) {
      await resources.uoms.update(String(editingItem.value.id), form)
    } else {
      await resources.uoms.create(form)
    }
    await fetchData()
    showModal.value = false
    toast.success(editingItem.value ? 'UOM berhasil diperbarui!' : 'UOM berhasil disimpan!')
  } catch (error) {
    console.error('Failed to save UOM:', error)
    toast.error('Gagal menyimpan UOM: ' + ((error as any).message || 'Error'))
  }
}

function openDelete(item: UOM) { deletingItem.value = item; showConfirm.value = true }

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.uoms.remove(String(deletingItem.value.id))
      await fetchData()
      toast.success('UOM berhasil dihapus!')
    } catch (error) {
      console.error('Failed to delete UOM:', error)
      toast.error('Gagal menghapus UOM')
    }
  }
  showConfirm.value = false
}

</script>

<template>
  <div>
    <PageHeader title="UOM" button-label="Add UOM" permission="uom:create" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari UOM..." permission="uom" @edit="openEdit" @delete="openDelete" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit UOM' : 'Add UOM'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="uom-name" class="form-label">Nama Satuan (UOM)</label>
        <input id="uom-name" v-model="form.name" type="text" class="form-input" placeholder="Contoh: pcs, box, unit, set">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus UOM" :message="`Yakin ingin menghapus UOM '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
