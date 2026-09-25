<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useAuth } from '@/composables/useAuth'
import { resources } from '@/services/resource.service'
import type { TableColumn, Unit } from '@/types'
import { computed, reactive, ref, onMounted, watch, onUnmounted } from 'vue'

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
const paperSizes = ref<{id: string, name: string}[]>([])

const brandOptions = computed(() => brands.value.map(b => ({ value: b.id, label: b.name })))
const typeOptions = computed(() => unitTypes.value.map(t => ({ value: t.id, label: t.name })))
const paperSizeOptions = computed(() => paperSizes.value.map(p => ({ value: p.id, label: p.name })))

const data = ref<Unit[]>([])

async function fetchData() {
  try {
    const [resUnits, resBrands, resTypes, resPaperSizes] = await Promise.all([
      resources.units.list(),
      resources.brands.list(),
      resources.unitTypes.list(),
      resources.paperSizes.list()
    ])
    data.value = resUnits.data as any
    brands.value = resBrands.data as any
    unitTypes.value = resTypes.data as any
    paperSizes.value = resPaperSizes.data as any
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
const form = reactive({
  serial_no: '',
  brand_id: null as string | null,
  type_id: null as string | null,
  model: '',
  name: '', 
  is_copier: false,
  is_computer: false,
  current_meter_bw: 0,
  current_meter_color: 0,
  free_quota_color: 0,
  rates: [] as { paper_size_id: string; rate_per_page_bw: number; rate_per_page_color: number }[],
  specsData: {
    cpu: '',
    ram: '',
    storage: '',
    storage_type: '',
    os: '',
    vga: '',
    office: ''
  },
})

function addRate() {
  form.rates.push({ paper_size_id: '', rate_per_page_bw: 0, rate_per_page_color: 0 })
}

function removeRate(index: number) {
  form.rates.splice(index, 1)
}

watch([() => form.brand_id, () => form.model], ([newBrand, newModel]) => {
  const brandName = getBrandName(newBrand)
  if (brandName && brandName !== '-') {
    form.name = `${brandName} ${newModel || ''}`.trim()
  } else {
    form.name = newModel || ''
  }
})

function openAdd() {
  Object.assign(form, { serial_no: '', brand_id: null, type_id: null, model: '', name: '', is_copier: false, is_computer: false, current_meter_bw: 0, current_meter_color: 0, free_quota_color: 0, rates: [], specsData: { cpu: '', ram: '', storage: '', storage_type: '', os: '', vga: '', office: '' } })
  showModal.value = true
}

function openEdit(item: any) {
  editingItem.value = item
  Object.assign(form, {
    serial_no: item.serial_no,
    brand_id: item.brand_id,
    type_id: item.type_id,
    model: item.model,
    name: item.name || '',
    is_copier: !!item.is_copier,
    is_computer: !!item.is_computer,
    current_meter_bw: item.current_meter_bw || 0,
    current_meter_color: item.current_meter_color || 0,
    free_quota_color: item.free_quota_color || 0,
    rates: Array.isArray(item.rates) ? item.rates.map((r: any) => ({
      paper_size_id: r.paper_size_id,
      rate_per_page_bw: r.rate_per_page_bw,
      rate_per_page_color: r.rate_per_page_color
    })) : [],
    specsData: item.specs ? (typeof item.specs === 'string' ? JSON.parse(item.specs || '{}') : item.specs) : { cpu: '', ram: '', storage: '', storage_type: '', os: '', vga: '', office: '' },
  })
  showModal.value = true
}

async function handleSubmit() {
  if (!form.brand_id || !form.type_id || !form.name.trim() || !form.serial_no.trim()) {
    alert('Harap lengkapi semua field yang wajib (Nama Unit, Brand, Tipe, Serial Number).')
    return
  }
  try {
    const payload = {
      ...form,
      specs: form.is_computer ? JSON.stringify(form.specsData) : ''
    }
    if (editingItem.value) {
      await resources.units.update(String(editingItem.value.id), payload)
    } else {
      await resources.units.create(payload)
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
        <label for="unit-serial" class="form-label">Serial Number</label>
        <input id="unit-serial" v-model="form.serial_no" type="text" class="form-input" placeholder="Unit serial number">
      </div>
      <div class="form-group">
        <label for="unit-name" class="form-label">Unit Name</label>
        <input id="unit-name" v-model="form.name" type="text" class="form-input" placeholder="Auto-generated" disabled style="background-color: var(--color-surface-hover); cursor: not-allowed;">
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
      <div class="form-group" style="margin-top: 1rem;">
        <label class="form-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
          <input type="checkbox" v-model="form.is_copier" style="width: 1rem; height: 1rem;" />
          Adalah Mesin Fotocopy
        </label>
      </div>
      <div class="form-group" style="margin-top: 1rem;">
        <label class="form-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
          <input type="checkbox" v-model="form.is_computer" style="width: 1rem; height: 1rem;" />
          Adalah Komputer / PC / Laptop
        </label>
      </div>

      <div v-if="form.is_computer" style="margin-top: 1rem; border-top: 1px solid var(--color-border-light); padding-top: 1rem;">
        <h4 style="margin-bottom: 1rem; font-weight: 600;">Spesifikasi Komputer / Desktop</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label class="form-label">CPU</label>
            <input v-model="form.specsData.cpu" type="text" class="form-input" placeholder="e.g. Intel Core i5">
          </div>
          <div class="form-group">
            <label class="form-label">RAM</label>
            <input v-model="form.specsData.ram" type="text" class="form-input" placeholder="e.g. 8GB DDR4">
          </div>
          <div class="form-group">
            <label class="form-label">Storage</label>
            <input v-model="form.specsData.storage" type="text" class="form-input" placeholder="e.g. 512GB">
          </div>
          <div class="form-group">
            <label class="form-label">Storage Type</label>
            <CustomSelect v-model="form.specsData.storage_type" :options="[{id:'SSD',name:'SSD'},{id:'HDD',name:'HDD'},{id:'NVMe',name:'NVMe'}]" placeholder="Pilih Tipe" />
          </div>
          <div class="form-group">
            <label class="form-label">OS</label>
            <input v-model="form.specsData.os" type="text" class="form-input" placeholder="e.g. Windows 11">
          </div>
          <div class="form-group">
            <label class="form-label">VGA</label>
            <input v-model="form.specsData.vga" type="text" class="form-input" placeholder="e.g. Intel Iris Xe">
          </div>
          <div class="form-group" style="grid-column: span 2;">
            <label class="form-label">Paket Office</label>
            <input v-model="form.specsData.office" type="text" class="form-input" placeholder="e.g. Office Home & Student 2021">
          </div>
        </div>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Unit" :message="`Are you sure you want to delete this unit?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>


