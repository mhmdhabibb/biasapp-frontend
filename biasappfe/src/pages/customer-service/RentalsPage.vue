<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn } from '@/types'
import { computed, reactive, ref, onMounted } from 'vue'

const { customers, units, products } = useMasterStore()

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

const rentalItems = ref<{ selected_item: string; unit_id: string | null; product_id: string | null; qty: number; monthly_rent: number; start_meter_bw: number; start_meter_color: number; is_copier: boolean }[]>([])

const form = reactive({
  customer_id: '',
  start_date: new Date().toISOString().slice(0, 10),
  duration_months: 12,
  duration_days: 0,
  tax: 0,
  deposit: 0,
  notes: '',
  installation_address: '',
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
  rentalItems.value.push({ selected_item: '', unit_id: null, product_id: null, qty: 1, monthly_rent: 0, start_meter_bw: 0, start_meter_color: 0, is_copier: false })
}

function removeRentalItem(idx: number) {
  rentalItems.value.splice(idx, 1)
}

function openAdd() {
  Object.assign(form, { customer_id: '', start_date: new Date().toISOString().slice(0, 10), duration_months: 12, duration_days: 0, tax: 0, deposit: 0, notes: '', installation_address: '' })
  rentalItems.value = [{ selected_item: '', unit_id: null, product_id: null, qty: 1, monthly_rent: 0, start_meter_bw: 0, start_meter_color: 0, is_copier: false }]
  showModal.value = true
}

async function fetchRentals() {
  try {
    const token = sessionStorage.getItem("bias_token");
    const res = await fetch('http://localhost:4008/api/rents', {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    })
    if (res.ok) {
      const data = await res.json()
      rentals.value = data.data.map((r: any) => {
        const c = customers.value.find((cust: any) => cust.id === r.customer_id)
        const custName = c ? (c.company_name || c.name || '-') + (c.pic_name ? ' - ' + c.pic_name : '') : (r.customer?.company_name || r.customer?.name || '-') + (r.customer?.pic_name ? ' - ' + r.customer.pic_name : '')
        return {
          ...r,
          customer: custName === '-' ? '-' : custName,
        }
      })
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
    installation_address: form.installation_address,
    items: rentalItems.value.map(item => {
      const isUnit = item.selected_item.startsWith('unit_');
      const isProduct = item.selected_item.startsWith('prod_');
      return {
        unit_id: isUnit ? item.selected_item.replace('unit_', '') : null,
        product_id: isProduct ? item.selected_item.replace('prod_', '') : null,
        qty: item.qty,
        monthly_rent: item.monthly_rent,
        start_meter_bw: item.start_meter_bw,
        start_meter_color: item.start_meter_color
      }
    })
  }

  try {
    const token = sessionStorage.getItem("bias_token");
    const res = await fetch('http://localhost:4008/api/rents', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
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
      <template #cell-customer="{ row }">
        {{ (customers.find((c: any) => c.id === row.customer_id)?.company_name || customers.find((c: any) => c.id === row.customer_id)?.name || row.customer?.company_name || row.customer?.name || '-') + (customers.find((c: any) => c.id === row.customer_id)?.pic_name || row.customer?.pic_name ? ' - ' + (customers.find((c: any) => c.id === row.customer_id)?.pic_name || row.customer?.pic_name) : '') }}
      </template>
      <template #cell-start_date="{ value }">{{ new Date(value).toLocaleDateString('id-ID') }}</template>
      <template #cell-end_date="{ value }">{{ new Date(value).toLocaleDateString('id-ID') }}</template>
      <template #cell-total="{ value }">{{ formatRupiah(value) }}</template>
    </DataTable>

    <FormModal :open="showModal" title="Buat Kontrak Rental Baru" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="rent-customer" class="form-label">Customer</label>
        <select id="rent-customer" v-model="form.customer_id" class="form-select" required>
          <option value="">-- Pilih Customer --</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ (c as any).company_name || (c as any).name }}{{ (c as any).pic_name ? ' - ' + (c as any).pic_name : '' }}</option>
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
      
      <div class="form-group" style="margin-bottom: var(--space-md);">
        <label for="install-address" class="form-label">Alamat Instalasi / Pengiriman (Otomatis Dibuatkan DO)</label>
        <textarea id="install-address" v-model="form.installation_address" class="form-input" placeholder="Masukkan alamat lengkap pengiriman unit..." rows="2" required></textarea>
      </div>

      <div class="form-section-title">Mesin Sewa & Input Meteran Awal</div>
      
      <div v-for="(item, idx) in rentalItems" :key="idx" class="rental-item-box">
        
        <div style="display: flex; flex-direction: row; align-items: center; gap: 8px; margin-bottom: var(--space-md); padding-bottom: 8px; border-bottom: 1px dashed var(--color-border-light);">
          <input :id="'is-copier-' + idx" v-model="item.is_copier" type="checkbox" style="width: 16px; height: 16px; cursor: pointer; margin: 0;">
          <label :for="'is-copier-' + idx" style="margin-bottom: 0; cursor: pointer; user-select: none; font-size: var(--font-size-sm); color: var(--color-primary); font-weight: var(--font-weight-bold);">
            Centang jika item ini adalah Mesin Copier (Perlu Input Meteran Awal)
          </label>
        </div>

        <div class="form-group" style="margin-bottom: var(--space-md);">
          <label class="form-label">Pilih Unit / Produk</label>
          <select v-model="item.selected_item" class="form-select" required>
            <option value="">-- Pilih Mesin atau Produk --</option>
            <optgroup label="Mesin (Unit)">
              <option v-for="u in units" :key="u.id" :value="'unit_' + u.id">{{ u.model }} ({{ (u as any).brand?.name }})</option>
            </optgroup>
            <optgroup label="Produk / Lainnya">
              <option v-for="p in products" :key="p.id" :value="'prod_' + p.id">{{ p.name }} ({{ (p as any).category?.name || '-' }})</option>
            </optgroup>
          </select>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Biaya Sewa / Bulan (Rp)</label>
            <input v-model.number="item.monthly_rent" type="number" class="form-input" min="0" required>
          </div>
          <div class="form-group">
            <label class="form-label">Qty Item</label>
            <input v-model.number="item.qty" type="number" class="form-input" min="1" required>
          </div>
        </div>

        <div v-if="item.is_copier" class="form-row meter-row" style="margin-top: var(--space-sm); padding-top: var(--space-sm); border-top: 1px dashed var(--color-border-light);">
          <div class="form-group">
            <label class="form-label text-meter-label">Start Meter B/W</label>
            <input v-model.number="item.start_meter_bw" type="number" class="form-input meter-input" min="0" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label text-meter-label">Start Meter Color</label>
            <input v-model.number="item.start_meter_color" type="number" class="form-input meter-input" min="0" placeholder="0">
          </div>
        </div>
        
        <div style="display: flex; justify-content: flex-end; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--color-border-light);">
          <button type="button" class="btn-remove-item" title="Hapus Mesin" @click="removeRentalItem(idx)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
            </svg>
            Hapus Mesin
          </button>
        </div>
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
  font-weight: var(--font-weight-bold);
  color: var(--color-primary);
  padding-top: var(--space-md);
  border-top: 1px dashed var(--color-border);
  margin-bottom: var(--space-sm);
  margin-top: var(--space-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.rental-item-box {
  background: var(--color-surface);
  padding: var(--space-md) var(--space-lg);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
  margin-bottom: var(--space-md);
  transition: transform var(--transition-base), box-shadow var(--transition-base);
}
.rental-item-box:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04);
}
.meter-row {
  background: var(--color-surface-sunken);
  padding: var(--space-md);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-light);
  margin-top: var(--space-sm);
}
.text-meter-label {
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-semibold);
}
.meter-input {
  background: var(--color-surface);
}
.btn-remove-item {
  display: inline-flex;
  align-items: center;
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  background: var(--color-danger-surface);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  padding: 6px 12px;
  transition: all var(--transition-fast);
}
.btn-remove-item:hover {
  background: var(--color-danger);
  color: #fff;
  border-color: var(--color-danger);
}
.sale-summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-lg);
  border-radius: var(--radius-lg);
  background: linear-gradient(145deg, var(--color-surface-raised) 0%, var(--color-surface) 100%);
  border: 1px solid var(--color-border);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}
.summary-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
.summary-total {
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-md);
  color: var(--color-primary);
  border-top: 1px dashed var(--color-border);
  padding-top: var(--space-sm);
  margin-top: var(--space-xs);
}
.mb-4 { margin-bottom: 1rem; }
.mt-4 { margin-top: 1rem; }
.mt-2 { margin-top: 0.5rem; }
.text-center { text-align: center; }
.text-sm { font-size: 0.875rem; }
.text-gray-500 { color: var(--color-text-muted); }
</style>
