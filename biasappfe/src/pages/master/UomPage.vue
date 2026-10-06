<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import { resources } from '@/services/resource.service'
import type { TableColumn, UOM } from '@/types'
import { useToast } from '@/composables/useToast'
import { useHardDelete } from '@/composables/useHardDelete'

const toast = useToast()

const columns: TableColumn[] = [
  { key: 'name', label: 'UOM Name' },
]

const data = ref<UOM[]>([])

async function fetchData() {
  try {
    const res = await resources.uoms.list()
    data.value = res.data as any
  } catch (error) {
    console.error('Failed to fetch UOMs:', error)
    toast.error('Failed to fetch data: ' + ((error as any).message || 'Error'))
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
    toast.success(editingItem.value ? 'UOM updated successfully!' : 'UOM saved successfully!')
  } catch (error) {
    console.error('Failed to save UOM:', error)
    toast.error('Failed to save UOM: ' + ((error as any).message || 'Error'))
  }
}

const hardDelete = useHardDelete((id: string) => resources.uoms.hardRemove(id), fetchData)

function openDelete(item: UOM) { deletingItem.value = item; showConfirm.value = true }

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.uoms.remove(String(deletingItem.value.id))
      await fetchData()
      toast.success('UOM deleted successfully!')
    } catch (error) {
      console.error('Failed to delete UOM:', error)
      toast.error('Failed to delete UOM')
    }
  }
  showConfirm.value = false
}

</script>

<template>
  <div>
    <PageHeader title="UOM" button-label="Add UOM" permission="uom:create" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Search UOMs..." permission="uom" @edit="openEdit" @delete="openDelete" :show-hard-delete="hardDelete.isSuperadmin" @hard-delete="hardDelete.open" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit UOM' : 'Add UOM'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="uom-name" class="form-label">Unit Name (UOM)</label>
        <input id="uom-name" v-model="form.name" type="text" class="form-input" placeholder="Example: pcs, box, unit, set">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete UOM" :message="`Are you sure you want to delete UOM '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
    <HardDeleteDialog :open="hardDelete.show" title="Hapus Permanen UOM" :item-label="hardDelete.expected"
      :expected="hardDelete.expected" :confirm-valid="hardDelete.confirmed" @close="hardDelete.close"
      @confirm="hardDelete.confirm" @update:input="hardDelete.input = $event" />
  </div>
</template>
