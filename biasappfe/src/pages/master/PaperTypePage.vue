<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import ExcelImportButtons from '@/components/ui/ExcelImportButtons.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import { resources } from '@/services/resource.service'
import type { TableColumn, PaperType } from '@/types'
import { useToast } from '@/composables/useToast'
import { useHardDelete } from '@/composables/useHardDelete'

const toast = useToast()

const columns: TableColumn[] = [
  { key: 'name', label: 'Paper Type' },
]

const data = ref<PaperType[]>([])

async function fetchData() {
  try {
    const res = await resources.paperTypes.list()
    data.value = res.data as any
  } catch (error) {
    console.error('Failed to fetch paper types:', error)
    toast.error('Failed to fetch data: ' + ((error as any).message || 'Error'))
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
    toast.success(editingItem.value ? 'Paper type updated successfully!' : 'Paper type saved successfully!')
  } catch (error) {
    console.error('Failed to save paper type:', error)
    toast.error('Failed to save paper type: ' + ((error as any).message || 'Error'))
  }
}

const hardDelete = useHardDelete((id: string) => resources.paperTypes.hardRemove(id), fetchData)

function openDelete(item: PaperType) { deletingItem.value = item; showConfirm.value = true }

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.paperTypes.remove(String(deletingItem.value.id))
      await fetchData()
      toast.success('Paper type deleted successfully!')
    } catch (error) {
      console.error('Failed to delete paper type:', error)
      toast.error('Failed to delete paper type')
    }
  }
  showConfirm.value = false
}

</script>

<template>
  <div>
    <PageHeader title="Paper Type" button-label="Add Paper Type" permission="paper_type:create" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Search paper types..." permission="paper_type" @edit="openEdit" @delete="openDelete" :show-hard-delete="hardDelete.isSuperadmin" @hard-delete="hardDelete.open">
      <template #toolbar>
        <ExcelImportButtons master-key="paper_type" @imported="fetchData" />
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Paper Type' : 'Add Paper Type'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="pt-name" class="form-label">Paper Type Name</label>
        <input id="pt-name" v-model="form.name" type="text" class="form-input" placeholder="Example: HVS, Art Paper, Glossy">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Paper Type" :message="`Are you sure you want to delete type '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
    <HardDeleteDialog :open="hardDelete.show" title="Hapus Permanen Paper Type" :item-label="hardDelete.expected"
      :expected="hardDelete.expected" :confirm-valid="hardDelete.confirmed" @close="hardDelete.close"
      @confirm="hardDelete.confirm" @update:input="hardDelete.input = $event" />
  </div>
</template>


