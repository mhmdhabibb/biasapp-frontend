<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn } from '@/types'
import { computed, reactive, ref, onMounted } from 'vue'

const { customers, units } = useMasterStore()

const columns: TableColumn[] = [
  { key: 'rental_no', label: 'Rental No' },
  { key: 'customer', label: 'Customer' },
  { key: 'start_date', label: 'Mulai' },
  { key: 'end_date', label: 'Selesai' },
  { key: 'total', label: 'Total' },
  { key: 'status', label: 'Status' }
]

const rentals = ref<any[]>([])

const showModal = ref(false)
const isLoading = ref(false)

const rentalItems = ref<{ unit_id: string | null; qty: number; monthly_rent: number; start_meter_bw: number; start_meter_color: number }[]>([])

const form = reactive({
  customer_id: '',
  start_date: new Date().toISOString().slice(0, 10),
  duration_months: 12,
  duration_days: 0,
  tax: 0,
  deposit: 0,
  notes: '',
})

const calcSubtotal = computed(() => {
  let sub = 0
  for (const item of rentalItems.value) {
    sub += (item.qty * item.monthly_rent * form.duration_months)
  }
  return sub
})

const calcTotal = computed(() => calcSubtotal.value + form.tax + form.deposit)

function addRentalItem() {
  rentalItems.value.push({ unit_id: null, qty: 1, monthly_rent: 0, start_meter_bw: 0, start_meter_color: 0 })
}

function removeRentalItem(idx: number) {
  rentalItems.value.splice(idx, 1)
}

function openAdd() {
  Object.assign(form, { customer_id: '', start_date: new Date().toISOString().slice(0, 10), duration_months: 12, duration_days: 0, tax: 0, deposit: 0, notes: '' })
  rentalItems.value = [{ unit_id: null, qty: 1, monthly_rent: 0, start_meter_bw: 0, start_meter_color: 0 }]
  showModal.value = true
}

async function fetchRentals() {
  try {
    const res = await fetch('http://localhost:4008/api/rents')
    if (res.ok) {
      const data = await res.json()
      rentals.value = data.data.map((r: any) => ({
        ...r,
        customer: r.customer?.name || '-',
      }))
    }
  } catch (error) {
    console.error("Gagal mengambil data rentals", error)
  }
}

async function handleSubmit() {
  if (!form.customer_id) return
  isLoading.value = true
  
  const payload = {
    customer_id: form.customer_id,
    start_date: new Date(form.start_date).toISOString(),
    duration_months: form.duration_months,
    duration_days: form.duration_days,
    tax: form.tax,
    deposit: form.deposit,
    notes: form.notes,
    items: rentalItems.value.map(item => ({
      unit_id: item.unit_id,
      qty: item.qty,
      monthly_rent: item.monthly_rent,
      start_meter_bw: item.start_meter_bw,
      start_meter_color: item.start_meter_color
    }))
  }

  try {
    const res = await fetch('http://localhost:4008/api/rents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    
    if (res.ok) {
      alert("Rental berhasil dibuat beserta Contract-nya!")
      showModal.value = false
      fetchRentals() // refresh
    } else {
      const err = await res.json()
      alert("Gagal: " + JSON.stringify(err))
    }
  } catch (error) {
    console.error(error)
    alert("Terjadi kesalahan jaringan.")
  } finally {
    isLoading.value = false
  }
}

function formatRupiah(val: number): string {
  return 'Rp ' + (val || 0).toLocaleString('id-ID')
}

onMounted(() => {
  fetchRentals()
})
</script>

<template>
  <div>
    <PageHeader title="Manajemen Rental" button-label="Buat Rental Baru" @add="openAdd" />
    
    <DataTable :columns="columns" :data="rentals" search-placeholder="Cari rental...">
      <template #cell-start_date="{ value }">{{ new Date(value).toLocaleDateString('id-ID') }}</template>
      <template #cell-end_date="{ value }">{{ new Date(value).toLocaleDateString('id-ID') }}</template>
      <template #cell-total="{ value }">{{ formatRupiah(value) }}</template>
    </DataTable>

    <FormModal :open="showModal" title="Buat Kontrak Rental Baru" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="rent-customer" class="form-label">Customer</label>
        <select id="rent-customer" v-model="form.customer_id" class="form-select" required>
          <option value="">-- Pilih Customer --</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ (c as any).company_name || (c as any).name }}</option>
        </select>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label for="start-date" class="form-label">Tanggal Mulai (Start Date)</label>
          <input id="start-date" v-model="form.start_date" type="date" class="form-input" required>
        </div>
        <div class="form-group">
          <label for="duration" class="form-label">Durasi (Bulan)</label>
          <input id="duration" v-model.number="form.duration_months" type="number" class="form-input" min="0" required>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="duration-days" class="form-label">Tambahan Hari</label>
          <input id="duration-days" v-model.number="form.duration_days" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="notes" class="form-label">Catatan</label>
          <input id="notes" v-model="form.notes" type="text" class="form-input" placeholder="Opsional">
        </div>
      </div>

      <div class="form-section-title">Mesin Sewa & Input Meteran Awal</div>
      
      <div v-for="(item, idx) in rentalItems" :key="idx" class="rental-item-box">
        <div class="form-group">
          <label class="form-label">Pilih Mesin / Unit</label>
          <select v-model="item.unit_id" class="form-select" required>
            <option :value="null">-- Pilih Mesin --</option>
            <option v-for="u in units" :key="u.id" :value="u.id">{{ u.model }} ({{ (u as any).brand?.name }})</option>
          </select>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Biaya Sewa / Bulan (Rp)</label>
            <input v-model.number="item.monthly_rent" type="number" class="form-input" min="0" required>
          </div>
          <div class="form-group">
            <label class="form-label">Qty Mesin</label>
            <input v-model.number="item.qty" type="number" class="form-input" min="1" required>
          </div>
        </div>

        <div class="form-row meter-row">
          <div class="form-group">
            <label class="form-label text-warning">Start Meter B/W</label>
            <input v-model.number="item.start_meter_bw" type="number" class="form-input meter-input" min="0" placeholder="Wajib isi manual">
          </div>
          <div class="form-group">
            <label class="form-label text-warning">Start Meter Color</label>
            <input v-model.number="item.start_meter_color" type="number" class="form-input meter-input" min="0" placeholder="Wajib isi manual">
          </div>
        </div>
        
        <button type="button" class="btn-remove-item" title="Hapus Mesin" @click="removeRentalItem(idx)">Hapus Mesin Ini</button>
      </div>
      
      <button type="button" class="btn btn-outline btn-sm mb-4" @click="addRentalItem">+ Tambah Mesin Lain</button>

      <div class="form-row">
        <div class="form-group">
          <label for="rent-tax" class="form-label">Pajak (Rp)</label>
          <input id="rent-tax" v-model.number="form.tax" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="rent-deposit" class="form-label">Uang Muka / Deposit (Rp)</label>
          <input id="rent-deposit" v-model.number="form.deposit" type="number" class="form-input" min="0">
        </div>
      </div>

      <div class="sale-summary mt-4">
        <div class="summary-row"><span>Total Biaya Sewa ({{ form.duration_months }} bln)</span><span>{{ formatRupiah(calcSubtotal) }}</span></div>
        <div class="summary-row"><span>Pajak</span><span>{{ formatRupiah(form.tax) }}</span></div>
        <div class="summary-row"><span>Deposit</span><span>{{ formatRupiah(form.deposit) }}</span></div>
        <div class="summary-row summary-total"><span>Total Tagihan Kontrak</span><span>{{ formatRupiah(calcTotal) }}</span></div>
      </div>
      
      <div v-if="isLoading" class="mt-2 text-center text-sm text-gray-500">Menyimpan data & men-generate Kontrak...</div>
    </FormModal>
  </div>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-base);
  margin-bottom: var(--space-sm);
}
.form-section-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
  padding-top: var(--space-sm);
  border-top: 1px solid var(--color-border-light);
  margin-bottom: var(--space-sm);
}
.rental-item-box {
  background: var(--color-surface-raised);
  padding: var(--space-md);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-light);
  margin-bottom: var(--space-md);
}
.meter-row {
  background: rgba(255, 166, 0, 0.05);
  padding: var(--space-sm);
  border-radius: var(--radius-sm);
  border: 1px dashed orange;
}
.text-warning {
  color: #d97706;
}
.meter-input {
  border-color: #fcd34d;
}
.btn-remove-item {
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  margin-top: var(--space-sm);
}
.btn-remove-item:hover {
  text-decoration: underline;
}
.sale-summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-md);
  border-radius: var(--radius-base);
  background: var(--color-surface-raised);
}
.summary-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
.summary-total {
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-xs);
}
.mb-4 { margin-bottom: 1rem; }
.mt-4 { margin-top: 1rem; }
.mt-2 { margin-top: 0.5rem; }
.text-center { text-align: center; }
.text-sm { font-size: 0.875rem; }
.text-gray-500 { color: #6b7280; }
</style>
