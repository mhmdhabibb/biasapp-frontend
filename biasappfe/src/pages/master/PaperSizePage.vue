<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import ExcelImportButtons from '@/components/ui/ExcelImportButtons.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import { resources } from '@/services/resource.service'
import type { TableColumn, PaperSize } from '@/types'
import { useToast } from '@/composables/useToast'
import { useHardDelete } from '@/composables/useHardDelete'

const toast = useToast()

const columns: TableColumn[] = [
  { key: 'name', label: 'Paper Size' },
]

const data = ref<PaperSize[]>([])

async function fetchData() {
  try {
    const res = await resources.paperSizes.list()
    data.value = res.data as any
  } catch (error) {
    console.error('Failed to fetch paper sizes:', error)
    toast.error('Failed to fetch data: ' + ((error as any).message || 'Error'))
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
    toast.success(editingItem.value ? 'Paper size updated successfully!' : 'Paper size saved successfully!')
  } catch (error) {
    console.error('Failed to save paper size:', error)
    toast.error('Failed to save paper size: ' + ((error as any).message || 'Error'))
  }
}

const hardDelete = useHardDelete((id: string) => resources.paperSizes.hardRemove(id), fetchData)

function openDelete(item: PaperSize) { deletingItem.value = item; showConfirm.value = true }

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.paperSizes.remove(String(deletingItem.value.id))
      await fetchData()
      toast.success('Paper size deleted successfully!')
    } catch (error) {
      console.error('Failed to delete paper size:', error)
      toast.error('Failed to delete paper size')
    }
  }
  showConfirm.value = false
}

</script>

<template>
  <div>
    <PageHeader title="Paper Size" button-label="Add Paper Size" permission="paper_size:create" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Search paper sizes..." permission="paper_size" @edit="openEdit" @delete="openDelete" :show-hard-delete="hardDelete.isSuperadmin" @hard-delete="hardDelete.open">
      <template #toolbar>
        <ExcelImportButtons master-key="paper_size" @imported="fetchData" />
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Paper Size' : 'Add Paper Size'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="ps-name" class="form-label">Size Name</label>
        <input id="ps-name" v-model="form.name" type="text" class="form-input" placeholder="Example: A4, A3, Legal, Letter">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Paper Size" :message="`Are you sure you want to delete size '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
    <HardDeleteDialog :open="hardDelete.show" title="Hapus Permanen Paper Size" :item-label="hardDelete.expected"
      :expected="hardDelete.expected" :confirm-valid="hardDelete.confirmed" @close="hardDelete.close"
      @confirm="hardDelete.confirm" @update:input="hardDelete.input = $event" />
  </div>
</template>


