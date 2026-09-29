<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useToast } from '@/composables/useToast'
import { resources } from '@/services/resource.service'
import type { TableColumn, Warranty } from '@/types'
import { formatDateDDMMYYYY } from '@/utils/format'
import { computed, onMounted, reactive, ref, watch } from 'vue'

const toast = useToast()
const { customers, units, products, sales } = useMasterStore()

const columns: TableColumn[] = [
  { key: 'customer_id', label: 'Customer' },
  { key: 'warranty_type', label: 'Tipe Garansi' },
  { key: 'unit_id', label: 'Unit / Produk' },
  { key: 'start_date', label: 'Mulai' },
  { key: 'end_date', label: 'Selesai' },
  { key: 'status', label: 'Status' },
]

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'claimed', label: 'Claimed' },
  { value: 'void', label: 'Void' },
]

const coverageOptions = [
  { value: 'unit', label: 'Unit (Mesin)' },
  { value: 'product', label: 'Produk / Sparepart' },
]

const data = ref<Warranty[]>([])

async function fetchData() {
  try {
    const res = await resources.warranties.list()
    data.value = res.data as any
  } catch (error) {
    console.error('Failed to fetch warranties:', error)
    toast.error('Gagal mengambil data warranty: ' + ((error as any).message || 'Error'))
  }
}

onMounted(fetchData)

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Warranty | null>(null)
const deletingItem = ref<Warranty | null>(null)

const form = reactive({
  warranty_type: '',
  customer_id: null as string | null,
  sale_id: null as string | null,
  coverage: 'unit' as 'unit' | 'product',
  unit_id: null as string | null,
  product_id: null as string | null,
  duration_months: 12,
  duration_days: 0,
  start_date: '',
  end_date: '',
  terms_conditions: '',
  status: 'active',
})

// Auto-compute end_date from start_date + duration
watch([() => form.start_date, () => form.duration_months, () => form.duration_days], ([start, months, days]) => {
  if (!start) return
  const d = new Date(start)
  d.setMonth(d.getMonth() + (months || 0))
  d.setDate(d.getDate() + (days || 0))
  form.end_date = d.toISOString().slice(0, 10)
})

// Reset unit/product when coverage type changes
watch(() => form.coverage, () => {
  form.unit_id = null
  form.product_id = null
})

// Sales filtered by selected customer
const customerSales = computed(() => {
  if (!form.customer_id) return []
  return (sales.value as any[]).filter(s => String(s.customer_id) === String(form.customer_id))
})

const customerOptions = computed(() =>
  customers.value.map((c: any) => ({ value: String(c.id), label: c.company_name || c.name }))
)
const unitOptions = computed(() =>
  units.value.map((u: any) => ({ value: String(u.id), label: `${u.name || u.model} (SN: ${u.serial_no || '-'})` }))
)
const productOptions = computed(() =>
  products.value.map((p: any) => ({ value: String(p.id), label: p.name }))
)
const saleOptions = computed(() =>
  customerSales.value.map((s: any) => ({ value: String(s.id), label: s.sale_no || `Sale #${s.id}` }))
)

function getCustomerName(id: any) {
  const c = customers.value.find((c: any) => String(c.id) === String(id))
  return (c as any)?.company_name || (c as any)?.name || '-'
}

function getUnitOrProductName(item: Warranty) {
  if (item.unit_id) {
    const u = units.value.find((u: any) => String(u.id) === String(item.unit_id))
    return u ? `${(u as any).name || (u as any).model}` : `Unit #${item.unit_id}`
  }
  if (item.product_id) {
    const p = products.value.find((p: any) => String(p.id) === String(item.product_id))
    return p ? (p as any).name : `Produk #${item.product_id}`
  }
  return '-'
}

function openAdd() {
  editingItem.value = null
  Object.assign(form, {
    warranty_type: '',
    customer_id: null,
    sale_id: null,
    coverage: 'unit',
    unit_id: null,
    product_id: null,
    duration_months: 12,
    duration_days: 0,
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
    terms_conditions: '',
    status: 'active',
  })
  showModal.value = true
}

function openEdit(item: Warranty) {
  editingItem.value = item
  Object.assign(form, {
    warranty_type: item.warranty_type,
    customer_id: item.customer_id || null,
    sale_id: item.sale_id || null,
    coverage: item.unit_id ? 'unit' : 'product',
    unit_id: item.unit_id || null,
    product_id: item.product_id || null,
    duration_months: item.duration_months ?? item.duration ?? 12,
    duration_days: item.duration_days ?? 0,
    start_date: item.start_date ? item.start_date.slice(0, 10) : '',
    end_date: item.end_date ? item.end_date.slice(0, 10) : '',
    terms_conditions: item.terms_conditions || '',
    status: item.status,
  })
  showModal.value = true
}

async function handleSubmit() {
  if (!form.warranty_type.trim() || !form.customer_id || !form.start_date) {
    toast.warning('Harap lengkapi Tipe Garansi, Customer, dan Tanggal Mulai.')
    return
  }
  const payload = {
    warranty_type: form.warranty_type,
    customer_id: form.customer_id,
    sale_id: form.sale_id || null,
    unit_id: form.coverage === 'unit' ? form.unit_id : null,
    product_id: form.coverage === 'product' ? form.product_id : null,
    duration_months: form.duration_months,
    duration_days: form.duration_days,
    start_date: form.start_date,
    end_date: form.end_date,
    terms_conditions: form.terms_conditions,
    status: form.status,
  }
  try {
    if (editingItem.value) {
      await resources.warranties.update(String(editingItem.value.id), payload)
    } else {
      await resources.warranties.create(payload)
    }
    await fetchData()
    showModal.value = false
    toast.success(editingItem.value ? 'Warranty berhasil diperbarui!' : 'Warranty berhasil disimpan!')
  } catch (error) {
    console.error('Failed to save warranty:', error)
    toast.error('Gagal menyimpan warranty: ' + ((error as any).message || 'Error'))
  }
}

function openDelete(item: Warranty) { deletingItem.value = item; showConfirm.value = true }

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.warranties.remove(String(deletingItem.value.id))
      await fetchData()
      toast.success('Warranty berhasil dihapus!')
    } catch (error) {
      console.error('Failed to delete warranty:', error)
      toast.error('Gagal menghapus warranty')
    }
  }
  showConfirm.value = false
}
</script>

<template>
  <div>
    <PageHeader title="Warranties" button-label="Add Warranty" permission="warranty:create" @add="openAdd" />

    <DataTable :columns="columns" :data="data" search-placeholder="Search warranties..." permission="warranty"
      @edit="openEdit" @delete="openDelete">
      <template #cell-customer_id="{ value }">
        {{ getCustomerName(value) }}
      </template>
      <template #cell-unit_id="{ row }">
        {{ getUnitOrProductName(row) }}
      </template>
      <template #cell-start_date="{ value }">
        {{ formatDateDDMMYYYY(value) }}
      </template>
      <template #cell-end_date="{ value }">
        {{ formatDateDDMMYYYY(value) }}
      </template>
      <template #cell-status="{ value }">
        <span :class="value === 'active' ? 'badge badge-success' : value === 'expired' ? 'badge badge-danger' : 'badge badge-neutral'">
          {{ value === 'active' ? 'Active' : value === 'expired' ? 'Expired' : value === 'claimed' ? 'Claimed' : value || '-' }}
        </span>
      </template>
    </DataTable>

    <FormModal :open="showModal" :title="editingItem ? 'Edit Warranty' : 'Add Warranty'"
      @close="showModal = false" @submit="handleSubmit">

      <!-- Customer -->
      <div class="form-group" style="position: relative;">
        <label class="form-label">Customer <span class="required">*</span></label>
        <CustomSelect v-model="form.customer_id" :options="customerOptions" placeholder="Pilih customer" />
      </div>

      <!-- Tipe Garansi -->
      <div class="form-group">
        <label class="form-label">Tipe Garansi <span class="required">*</span></label>
        <input v-model="form.warranty_type" type="text" class="form-input"
          placeholder="e.g. Full Service, Sparepart Only, On-site">
      </div>

      <!-- Coverage: Unit or Product -->
      <div class="form-group" style="position: relative;">
        <label class="form-label">Coverage</label>
        <CustomSelect v-model="form.coverage" :options="coverageOptions" placeholder="Pilih jenis coverage" :searchable="false" />
      </div>

      <div v-if="form.coverage === 'unit'" class="form-group" style="position: relative;">
        <label class="form-label">Unit (Mesin)</label>
        <CustomSelect v-model="form.unit_id" :options="unitOptions" placeholder="Pilih unit" />
      </div>

      <div v-else class="form-group" style="position: relative;">
        <label class="form-label">Produk / Sparepart</label>
        <CustomSelect v-model="form.product_id" :options="productOptions" placeholder="Pilih produk" />
      </div>

      <!-- Linked Sale (optional) -->
      <div class="form-group" style="position: relative;">
        <label class="form-label">Dari Transaksi Penjualan <span style="color: var(--color-text-muted); font-weight: 400;">(opsional)</span></label>
        <CustomSelect v-model="form.sale_id" :options="saleOptions"
          :placeholder="form.customer_id ? 'Pilih transaksi' : 'Pilih customer dulu'"
          :disabled="!form.customer_id" />
      </div>

      <!-- Duration -->
      <div class="form-row-2">
        <div class="form-group">
          <label class="form-label">Durasi (bulan)</label>
          <input v-model.number="form.duration_months" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">Durasi (hari)</label>
          <input v-model.number="form.duration_days" type="number" class="form-input" min="0">
        </div>
      </div>

      <!-- Dates -->
      <div class="form-row-2">
        <div class="form-group">
          <label class="form-label">Tanggal Mulai <span class="required">*</span></label>
          <input v-model="form.start_date" type="date" class="form-input">
        </div>
        <div class="form-group">
          <label class="form-label">Tanggal Selesai</label>
          <input v-model="form.end_date" type="date" class="form-input">
        </div>
      </div>

      <!-- Terms -->
      <div class="form-group">
        <label class="form-label">Syarat & Ketentuan</label>
        <textarea v-model="form.terms_conditions" class="form-input" rows="3"
          placeholder="Ketentuan garansi..."></textarea>
      </div>

      <!-- Status -->
      <div class="form-group" style="position: relative;">
        <label class="form-label">Status</label>
        <CustomSelect v-model="form.status" :options="statusOptions" placeholder="Pilih status" :searchable="false" />
      </div>
    </FormModal>

    <ConfirmDialog :open="showConfirm" title="Delete Warranty"
      :message="`Hapus warranty '${deletingItem?.warranty_type}'?`"
      @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>

<style scoped>
.form-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-base);
}

.required {
  color: var(--color-danger);
}
</style>
