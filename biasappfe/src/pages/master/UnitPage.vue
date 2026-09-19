<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useBrands } from '@/composables/useBrands'
import type { TableColumn, Unit } from '@/types'

const columns: TableColumn[] = [
  { key: 'brand_id', label: 'Brand' },
  { key: 'model', label: 'Model' },
  { key: 'serial_no', label: 'Serial Number' },
]

const { brands } = useBrands()
const brandOptions = computed(() => brands.value.map(b => ({ value: b.id, label: b.name })))

const data = ref<Unit[]>([])
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Unit | null>(null)
const deletingItem = ref<Unit | null>(null)
const form = reactive({ brand_id: null as number | null, unit_type_id: null as number | null, model: '', serial_no: '' })

function openAdd() {
  editingItem.value = null
  Object.assign(form, { brand_id: null, unit_type_id: null, model: '', serial_no: '' })
  showModal.value = true
}

function openEdit(item: Unit) {
  editingItem.value = item
  Object.assign(form, { brand_id: item.brand_id, unit_type_id: item.unit_type_id, model: item.model, serial_no: item.serial_no })
  showModal.value = true
}

function handleSubmit() {
  if (!form.brand_id) return
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx], ...form, updated_at: new Date().toISOString() }
  } else {
    data.value.push({ id: Date.now(), ...form, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })
  }
  showModal.value = false
}

function openDelete(item: Unit) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}

function getBrandName(id: number | null): string {
  if (!id) return '-'
  const b = brands.value.find(b => b.id === id)
  return b ? b.name : '-'
}
</script>

<template>
  <div>
    <PageHeader title="Units" button-label="Add Unit" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Search units..." @edit="openEdit" @delete="openDelete">
      <template #cell-brand_id="{ value }">
        {{ getBrandName(value) }}
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Unit' : 'Add Unit'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group" style="position: relative;">
        <label for="unit-brand" class="form-label">Brand</label>
        <CustomSelect
          id="unit-brand"
          v-model="form.brand_id"
          :options="brandOptions"
          placeholder="Select brand"
        />
      </div>
      <div class="form-group">
        <label for="unit-model" class="form-label">Model</label>
        <input id="unit-model" v-model="form.model" type="text" class="form-input" placeholder="Unit model">
      </div>
      <div class="form-group">
        <label for="unit-serial" class="form-label">Serial Number</label>
        <input id="unit-serial" v-model="form.serial_no" type="text" class="form-input" placeholder="Unit serial number">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Unit" :message="`Are you sure you want to delete this unit?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
