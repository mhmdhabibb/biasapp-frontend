<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { resources } from '@/services/resource.service'
import type { TableColumn, PaperType } from '@/types'
import { useToast } from '@/composables/useToast'

const toast = useToast()

const columns: TableColumn[] = [
  { key: 'name', label: 'Tipe Kertas' },
]

const data = ref<PaperType[]>([])

async function fetchData() {
  try {
    const res = await resources.paperTypes.list()
    data.value = res.data as any
  } catch (error) {
    console.error('Failed to fetch paper types:', error)
    toast.error('Gagal mengambil data: ' + ((error as any).message || 'Error'))
  }
}

onMounted(fetchData)

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<PaperType | null>(null)
const deletingItem = ref<PaperType | null>(null)
const form = reactive({ name: '' })

function openAdd() {
  editingItem.value = null
  form.name = ''
  showModal.value = true
}

function openEdit(item: PaperType) {
  editingItem.value = item
  form.name = item.name
  showModal.value = true
}

async function handleSubmit() {
  if (!form.name.trim()) return
  try {
    if (editingItem.value) {
      await resources.paperTypes.update(String(editingItem.value.id), form)
    } else {
      await resources.paperTypes.create(form)
    }
    await fetchData()
    showModal.value = false
    toast.success(editingItem.value ? 'Tipe Kertas berhasil diperbarui!' : 'Tipe Kertas berhasil disimpan!')
  } catch (error) {
    console.error('Failed to save paper type:', error)
    toast.error('Gagal menyimpan tipe kertas: ' + ((error as any).message || 'Error'))
  }
}

function openDelete(item: PaperType) { deletingItem.value = item; showConfirm.value = true }

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.paperTypes.remove(String(deletingItem.value.id))
      await fetchData()
      toast.success('Tipe Kertas berhasil dihapus!')
    } catch (error) {
      console.error('Failed to delete paper type:', error)
      toast.error('Gagal menghapus tipe kertas')
    }
  }
  showConfirm.value = false
}

</script>

<template>
  <div>
    <PageHeader title="Paper Type" button-label="Add Paper Type" permission="paper_type:create" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari tipe kertas..." permission="paper_type" @edit="openEdit" @delete="openDelete" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit Paper Type' : 'Add Paper Type'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="pt-name" class="form-label">Nama Tipe Kertas</label>
        <input id="pt-name" v-model="form.name" type="text" class="form-input" placeholder="Contoh: HVS, Art Paper, Glossy">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Tipe Kertas" :message="`Yakin ingin menghapus tipe '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>


