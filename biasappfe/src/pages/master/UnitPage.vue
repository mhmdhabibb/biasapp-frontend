<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useAuth } from '@/composables/useAuth'
import { resources } from '@/services/resource.service'
import type { TableColumn, Unit } from '@/types'
import { computed, reactive, ref, onMounted, watch } from 'vue'

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
  current_meter_bw: 0,
  current_meter_color: 0,
  free_quota_color: 0,
  rates: [] as { paper_size_id: string; rate_per_page_bw: number; rate_per_page_color: number }[],
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
  editingItem.value = null
  Object.assign(form, { serial_no: '', brand_id: null, type_id: null, model: '', name: '', is_copier: false, current_meter_bw: 0, current_meter_color: 0, free_quota_color: 0, rates: [] })
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
    current_meter_bw: item.current_meter_bw || 0,
    current_meter_color: item.current_meter_color || 0,
    free_quota_color: item.free_quota_color || 0,
    rates: Array.isArray(item.rates) ? item.rates.map((r: any) => ({
      paper_size_id: r.paper_size_id,
      rate_per_page_bw: r.rate_per_page_bw,
      rate_per_page_color: r.rate_per_page_color
    })) : [],
  })
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

      <div v-if="form.is_copier" style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
        <h4 style="margin-bottom: 1rem; font-weight: 600;">Data Mesin Fotocopy</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label class="form-label">Current BW Meter</label>
            <input v-model.number="form.current_meter_bw" type="number" class="form-input" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">Current Color Meter</label>
            <input v-model.number="form.current_meter_color" type="number" class="form-input" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">Free Quota Color</label>
            <input v-model.number="form.free_quota_color" type="number" class="form-input" min="0">
          </div>
        </div>

        <div style="margin-top: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <label class="form-label" style="margin: 0;">Daftar Harga Kertas (Rates)</label>
            <button type="button" @click="addRate" class="btn btn-secondary btn-sm" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">+ Tambah Harga</button>
          </div>
          
          <div v-for="(rate, index) in form.rates" :key="index" style="display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center; background: var(--bg-color); padding: 0.5rem; border-radius: 8px; border: 1px solid var(--border-color);">
            <div>
              <CustomSelect v-model="rate.paper_size_id" :options="paperSizeOptions" placeholder="Pilih Ukuran" />
            </div>
            <div>
              <input v-model.number="rate.rate_per_page_bw" type="number" class="form-input" min="0" placeholder="Tarif BW">
            </div>
            <div>
              <input v-model.number="rate.rate_per_page_color" type="number" class="form-input" min="0" placeholder="Tarif Warna">
            </div>
            <button type="button" @click="removeRate(index)" style="background: none; border: none; color: var(--danger-color); cursor: pointer; padding: 0.5rem;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
          <div v-if="form.rates.length === 0" style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 1rem; border: 1px dashed var(--border-color); border-radius: 8px;">
            Belum ada ukuran kertas yang ditambahkan.
          </div>
        </div>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Unit" :message="`Are you sure you want to delete this unit?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
