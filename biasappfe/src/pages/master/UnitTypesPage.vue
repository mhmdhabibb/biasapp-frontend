<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import ExcelImportButtons from '@/components/ui/ExcelImportButtons.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import { useToast } from '@/composables/useToast'
import { useHardDelete } from '@/composables/useHardDelete'
import { resources } from '@/services/resource.service'
import type { TableColumn, UnitType } from '@/types'

const toast = useToast()

const columns: TableColumn[] = [
  { key: 'name', label: 'Type Name' },
  { key: 'slug', label: 'Slug' },
]

const data = ref<UnitType[]>([])

async function fetchData() {
  try {
    const res = await resources.unitTypes.list()
    data.value = res.data as any
  } catch (error) {
    console.error('Failed to fetch unit types:', error)
    toast.error('Failed to fetch unit type data: ' + ((error as any).message || 'Error'))
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
    toast.success(editingItem.value ? 'Unit type updated successfully!' : 'Unit type saved successfully!')
  } catch (error) {
    console.error('Failed to save unit type:', error)
    toast.error('Failed to save unit type: ' + ((error as any).message || 'Error'))
  }
}

const hardDelete = useHardDelete((id: string) => resources.unitTypes.hardRemove(id), fetchData)

function openDelete(item: UnitType) { deletingItem.value = item; showConfirm.value = true }

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.unitTypes.remove(String(deletingItem.value.id))
      await fetchData()
      toast.success('Unit type deleted successfully!')
    } catch (error) {
      console.error('Failed to delete unit type:', error)
      toast.error('Failed to delete unit type')
    }
  }
  showConfirm.value = false
}

</script>

<template>
  <div>
    <PageHeader title="Unit Types" button-label="Add Unit Type" permission="unit_type:create" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Search unit types..." permission="unit_type" @edit="openEdit" @delete="openDelete" :show-hard-delete="hardDelete.isSuperadmin" @hard-delete="hardDelete.open">
      <template #toolbar>
        <ExcelImportButtons master-key="unit_type" @imported="fetchData" />
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Unit Type' : 'Add Unit Type'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="ut-name" class="form-label">Type Name</label>
        <input id="ut-name" v-model="form.name" type="text" class="form-input" placeholder="Example: Printer, Copier">
      </div>
      <div class="form-group">
        <label for="ut-slug" class="form-label">Slug</label>
        <input id="ut-slug" v-model="form.slug" type="text" class="form-input" placeholder="Auto-generated from name if empty">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Unit Type" :message="`Are you sure you want to delete unit type '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
    <HardDeleteDialog :open="hardDelete.show" title="Hapus Permanen Unit Type" :item-label="hardDelete.expected"
      :expected="hardDelete.expected" :confirm-valid="hardDelete.confirmed" @close="hardDelete.close"
      @confirm="hardDelete.confirm" @update:input="hardDelete.input = $event" />
  </div>
</template>


