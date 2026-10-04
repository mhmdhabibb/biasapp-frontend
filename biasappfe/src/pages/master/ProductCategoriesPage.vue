<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import ExcelImportButtons from '@/components/ui/ExcelImportButtons.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import { resources } from '@/services/resource.service'
import type { TableColumn, ProductCategory } from '@/types'
import { useToast } from '@/composables/useToast'
import { useHardDelete } from '@/composables/useHardDelete'

const toast = useToast()

const columns: TableColumn[] = [
  { key: 'name', label: 'Category Name' },
  { key: 'slug', label: 'Slug' },
]

const data = ref<ProductCategory[]>([])

async function fetchData() {
  try {
    const res = await resources.productCategories.list()
    data.value = res.data as any
  } catch (error) {
    console.error('Failed to fetch product categories:', error)
    toast.error('Failed to fetch data: ' + ((error as any).message || 'Error'))
  }
}

onMounted(fetchData)

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<ProductCategory | null>(null)
const deletingItem = ref<ProductCategory | null>(null)
const form = reactive({ name: '', slug: '' })

function openAdd() {
  editingItem.value = null
  Object.assign(form, { name: '', slug: '' })
  showModal.value = true
}

function openEdit(item: ProductCategory) {
  editingItem.value = item
  Object.assign(form, { name: item.name, slug: item.slug })
  showModal.value = true
}

async function handleSubmit() {
  if (!form.name.trim()) return
  if (!form.slug.trim()) form.slug = form.name.toLowerCase().replace(/\s+/g, '-')
  try {
    if (editingItem.value) {
      await resources.productCategories.update(String(editingItem.value.id), form)
    } else {
      await resources.productCategories.create(form)
    }
    await fetchData()
    showModal.value = false
    toast.success(editingItem.value ? 'Category updated successfully!' : 'Category saved successfully!')
  } catch (error) {
    console.error('Failed to save product category:', error)
    toast.error('Failed to save category: ' + ((error as any).message || 'Error'))
  }
}

const hardDelete = useHardDelete((id: string) => resources.productCategories.hardRemove(id), fetchData)

function openDelete(item: ProductCategory) { deletingItem.value = item; showConfirm.value = true }

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.productCategories.remove(String(deletingItem.value.id))
      await fetchData()
      toast.success('Category deleted successfully!')
    } catch (error) {
      console.error('Failed to delete product category:', error)
      toast.error('Failed to delete category')
    }
  }
  showConfirm.value = false
}

</script>

<template>
  <div>
    <PageHeader title="Product Categories" button-label="Add Category" permission="product_category:create" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Search categories..." permission="product_category" @edit="openEdit" @delete="openDelete" :show-hard-delete="hardDelete.isSuperadmin" @hard-delete="hardDelete.open">
      <template #toolbar>
        <ExcelImportButtons master-key="product_category" @imported="fetchData" />
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Category' : 'Add Category'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="cat-name" class="form-label">Category Name</label>
        <input id="cat-name" v-model="form.name" type="text" class="form-input" placeholder="Example: Toner, Drum, Spare Part">
      </div>
      <div class="form-group">
        <label for="cat-slug" class="form-label">Slug</label>
        <input id="cat-slug" v-model="form.slug" type="text" class="form-input" placeholder="Auto-generated from name if empty">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Category" :message="`Are you sure you want to delete category '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
    <HardDeleteDialog :open="hardDelete.show" title="Hapus Permanen Category" :item-label="hardDelete.expected"
      :expected="hardDelete.expected" :confirm-valid="hardDelete.confirmed" @close="hardDelete.close"
      @confirm="hardDelete.confirm" @update:input="hardDelete.input = $event" />
  </div>
</template>


