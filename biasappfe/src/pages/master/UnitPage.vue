<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useAuth } from '@/composables/useAuth'
import { resources } from '@/services/resource.service'
import type { TableColumn, Unit } from '@/types'
import { computed, reactive, ref, onMounted } from 'vue'

const { currentUser } = useAuth()
const isTechnician = computed(() => currentUser.value?.role === 'technician')

const columns: TableColumn[] = [
  { key: 'name', label: 'Unit Name' },
  { key: 'brand_id', label: 'Brand' },
  { key: 'model', label: 'Model' },
  { key: 'serial_no', label: 'Serial Number' },
]

const brands = ref<{id: string, name: string}[]>([])
const unitTypes = ref<{id: string, name: string}[]>([])

const brandOptions = computed(() => brands.value.map(b => ({ value: b.id, label: b.name })))
const typeOptions = computed(() => unitTypes.value.map(t => ({ value: t.id, label: t.name })))

const data = ref<Unit[]>([])

async function fetchData() {
  try {
    const [resUnits, resBrands, resTypes] = await Promise.all([
      resources.units.list(),
      resources.brands.list(),
      resources.unitTypes.list()
    ])
    data.value = resUnits.data as any
    brands.value = resBrands.data as any
    unitTypes.value = resTypes.data as any
  } catch (error: any) {
    console.error('Failed to fetch data:', error)
    alert('Gagal mengambil data dari server: ' + (error.message || 'Error'))
  }
}

onMounted(fetchData)

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Unit | null>(null)
const deletingItem = ref<Unit | null>(null)
// type_id is the json key expected by backend, frontend had unit_type_id
const form = reactive({ name: '', brand_id: null as string | null, type_id: null as string | null, model: '', serial_no: '' })

function openAdd() {
  editingItem.value = null
  Object.assign(form, { name: '', brand_id: null, type_id: null, model: '', serial_no: '' })
  showModal.value = true
}

function openEdit(item: any) {
  editingItem.value = item
  Object.assign(form, { name: item.name, brand_id: item.brand_id, type_id: item.type_id, model: item.model, serial_no: item.serial_no })
  showModal.value = true
}

async function handleSubmit() {
  if (!form.brand_id || !form.type_id || !form.name.trim() || !form.serial_no.trim()) {
    alert('Harap lengkapi semua field yang wajib (Nama Unit, Brand, Tipe, Serial Number).')
    return
  }
  try {
    if (editingItem.value) {
      await resources.units.update(String(editingItem.value.id), form)
    } else {
      await resources.units.create(form)
    }
    await fetchData()
    showModal.value = false
  } catch (error: any) {
    console.error('Failed to save unit:', error)
    alert('Gagal menyimpan data Unit: ' + (error.message || 'Terjadi kesalahan'))
  }
}

function openDelete(item: Unit) { deletingItem.value = item; showConfirm.value = true }

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.units.remove(String(deletingItem.value.id))
      await fetchData()
    } catch (error) {
      console.error('Failed to delete unit:', error)
    }
  }
  showConfirm.value = false
}

function getBrandName(id: string | null): string {
  if (!id) return '-'
  const b = brands.value.find(b => b.id === id)
  return b ? b.name : '-'
}
</script>

<template>
  <div>
    <PageHeader title="Units" :button-label="isTechnician ? undefined : 'Add Unit'" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Search units..." 
               :hide-actions="isTechnician"
               @edit="openEdit" @delete="openDelete">
      <template #cell-brand_id="{ value }">
        {{ getBrandName(value) }}
      </template>
    </DataTable>
    <FormModal v-if="!isTechnician" :open="showModal" :title="editingItem ? 'Edit Unit' : 'Add Unit'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="unit-name" class="form-label">Unit Name</label>
        <input id="unit-name" v-model="form.name" type="text" class="form-input" placeholder="Unit name">
      </div>
      <div class="form-group" style="position: relative;">
        <label for="unit-brand" class="form-label">Brand</label>
        <CustomSelect
          id="unit-brand"
          v-model="form.brand_id"
          :options="brandOptions"
          placeholder="Select brand"
        />
      </div>
      <div class="form-group" style="position: relative;">
        <label for="unit-type" class="form-label">Unit Type</label>
        <CustomSelect
          id="unit-type"
          v-model="form.type_id"
          :options="typeOptions"
          placeholder="Select unit type"
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
