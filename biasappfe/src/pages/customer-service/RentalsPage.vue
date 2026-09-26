<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn } from '@/types'
import { computed, reactive, ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { customers, units, products, refresh } = useMasterStore()
const { t } = useI18n()

const columns = computed<TableColumn[]>(() => [
  { key: 'rental_no', label: t('rentals.no') },
  { key: 'company', label: t('rentals.company') },
  { key: 'pic_name', label: t('rentals.pic_name') },
  { key: 'start_date', label: t('rentals.start') },
  { key: 'end_date', label: t('rentals.end') },
  { key: 'total', label: t('rentals.total') },
  { key: 'status', label: t('rentals.status') }
])

const rentals = ref<any[]>([])

const showModal = ref(false)
const isLoading = ref(false)

const paperSizes = ref<{id: string, name: string}[]>([])

const rentalItems = ref<{ selected_item: string; unit_id: string | null; product_id: string | null; qty: number; monthly_rent: number; start_meter_bw: number; start_meter_color: number; free_quota_color: number; is_copier: boolean; is_computer: boolean; specs: { cpu: string; ram: string; storage: string; storage_type: string; os: string; vga: string; office: string; }; description: string; rates: { paper_size_id: string; rate_per_page_bw: number; rate_per_page_color: number }[] }[]>([])

const form = reactive({
  customer_id: '',
  start_date: new Date().toISOString().slice(0, 10),
  duration_months: 12,
  duration_days: 0,
  tax: 0,
  deposit: 0,
  notes: '',
  po_no: '',
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
  rentalItems.value.push({ selected_item: '', unit_id: null, product_id: null, qty: 1, monthly_rent: 0, start_meter_bw: 0, start_meter_color: 0, free_quota_color: 0, is_copier: false, is_computer: false, specs: { cpu: '', ram: '', storage: '', storage_type: '', os: '', vga: '', office: '' }, description: '', rates: [] })
}

function removeRentalItem(idx: number) {
  rentalItems.value.splice(idx, 1)
}

function addItemRate(item: any) {
  if (!item.rates) item.rates = []
  item.rates.push({ paper_size_id: '', rate_per_page_bw: 0, rate_per_page_color: 0 })
}

function removeItemRate(item: any, index: number) {
  if (item.rates) item.rates.splice(index, 1)
}

function onItemSelectChange(item: any) {
  if (item.selected_item.startsWith('unit_')) {
    const unitId = item.selected_item.replace('unit_', '');
    const u = units.value.find((target: any) => String(target.id) === String(unitId));
    if (u) {
      item.is_copier = !!u.is_copier;
      item.is_computer = !!u.is_computer;
      if (u.current_meter_bw !== undefined) item.start_meter_bw = u.current_meter_bw;
      if (u.current_meter_color !== undefined) item.start_meter_color = u.current_meter_color;
      if (u.free_quota_color !== undefined) item.free_quota_color = u.free_quota_color;
      if (Array.isArray(u.rates) && u.rates.length > 0) {
        item.rates = u.rates.map((r: any) => ({
          paper_size_id: r.paper_size_id,
          rate_per_page_bw: r.rate_per_page_bw,
          rate_per_page_color: r.rate_per_page_color,
        }));
      }
    }
  } else if (item.selected_item.startsWith('prod_')) {
    const prodId = item.selected_item.replace('prod_', '');
    const p = products.value.find((target: any) => String(target.id) === String(prodId));
    if (p) {
      item.is_copier = false;
      item.is_computer = !!p.is_computer;
    }
  }
}

async function openAdd() {
  await refresh(true)
  Object.assign(form, { customer_id: '', start_date: new Date().toISOString().slice(0, 10), duration_months: 12, duration_days: 0, tax: 0, deposit: 0, po_no: '', notes: '', installation_address: '' })
  rentalItems.value = [{ selected_item: '', unit_id: null, product_id: null, qty: 1, monthly_rent: 0, start_meter_bw: 0, start_meter_color: 0, free_quota_color: 0, is_copier: false, is_computer: false, specs: { cpu: '', ram: '', storage: '', storage_type: '', os: '', vga: '', office: '' }, description: '', rates: [] }]
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
        const companyName = c ? (c.company_name || c.name || '-') : (r.customer?.company_name || r.customer?.name || '-')
        const picName = c ? (c.pic_name || '-') : (r.customer?.pic_name || '-')
        return {
          ...r,
          company: companyName,
          pic_name: picName,
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
    po_no: form.po_no,
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
        start_meter_color: item.start_meter_color,
        specs: item.specs || {},
        description: item.description,
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
      alert(t('rentals.success'))
      showModal.value = false
      fetchRentals() // refresh
    } else {
      const err = await res.json()
      alert(t('rentals.failed', { error: JSON.stringify(err) }))
    }
  } catch (error) {
    console.error(error)
    alert(t('rentals.network_error'))
  } finally {
    isLoading.value = false
  }
}

function formatRupiah(val: number): string {
  return 'Rp ' + (val || 0).toLocaleString('id-ID')
}

import { resources } from '@/services/resource.service'

onMounted(async () => {
  await refresh(true)
  fetchRentals()
  try {
    const res = await resources.paperSizes.list()
    paperSizes.value = res.data as any
  } catch (e) {
    console.error('Failed to fetch paper sizes:', e)
  }
})

</script>

<template>
  <div>
    <PageHeader :title="t('rentals.title')" :button-label="t('rentals.create_new')" @add="openAdd" />
    
    <DataTable :columns="columns" :data="rentals" :search-placeholder="t('rentals.search')">
      <template #cell-company="{ row }">
        {{ customers.find((c: any) => c.id === row.customer_id)?.company_name || customers.find((c: any) => c.id === row.customer_id)?.name || row.customer?.company_name || row.customer?.name || '-' }}
      </template>
      <template #cell-pic_name="{ row }">
        {{ customers.find((c: any) => c.id === row.customer_id)?.pic_name || row.customer?.pic_name || '-' }}
      </template>
      <template #cell-start_date="{ value }">{{ new Date(value).toLocaleDateString('id-ID') }}</template>
      <template #cell-end_date="{ value }">{{ new Date(value).toLocaleDateString('id-ID') }}</template>
      <template #cell-total="{ value }">{{ formatRupiah(value) }}</template>
    </DataTable>

    <FormModal :open="showModal" :title="t('rentals.modal_title')" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="rent-customer" class="form-label">{{ t('rentals.customer_label') }}</label>
        <select id="rent-customer" v-model="form.customer_id" class="form-select" required>
          <option value="">{{ t('rentals.customer_select') }}</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ (c as any).company_name || (c as any).name }}{{ (c as any).pic_name ? ' - ' + (c as any).pic_name : '' }}</option>
        </select>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label for="start-date" class="form-label">{{ t('rentals.start_date_label') }}</label>
          <input id="start-date" v-model="form.start_date" type="date" class="form-input" required>
        </div>
        <div class="form-group">
          <label for="duration" class="form-label">{{ t('rentals.duration_label') }}</label>
          <input id="duration" v-model.number="form.duration_months" type="number" class="form-input" min="0" required>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="duration-days" class="form-label">Tambahan Hari</label>
          <input id="duration-days" v-model.number="form.duration_days" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="po-no" class="form-label">PO No (Opsional)</label>
          <input id="po-no" v-model="form.po_no" type="text" class="form-input" placeholder="Misal: PO-2024-001">
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
          <select v-model="item.selected_item" class="form-select" required @change="onItemSelectChange(item)">
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

        <!-- Copier Section moved from Gambar 1 to Gambar 2 -->
        <div v-if="item.is_copier" style="margin-top: 1rem; border-top: 1px dashed var(--color-border-light); padding-top: 1rem;">
          <h4 style="margin-bottom: 0.75rem; font-weight: 600; font-size: 0.95rem; color: var(--color-primary);">Data Mesin Fotocopy</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem;">
            <div class="form-group">
              <label class="form-label" style="font-size: 0.8rem;">Current BW Meter</label>
              <input v-model.number="item.start_meter_bw" type="number" class="form-input" min="0" placeholder="0">
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size: 0.8rem;">Current Color Meter</label>
              <input v-model.number="item.start_meter_color" type="number" class="form-input" min="0" placeholder="0">
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size: 0.8rem;">Free Quota Color</label>
              <input v-model.number="item.free_quota_color" type="number" class="form-input" min="0" placeholder="0">
            </div>
          </div>

          <div style="margin-top: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <label class="form-label" style="margin: 0; font-weight: 600; font-size: 0.85rem;">Daftar Harga Kertas (Rates)</label>
              <button type="button" @click="addItemRate(item)" class="btn btn-secondary btn-sm" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">+ Tambah Harga</button>
            </div>
            
            <div v-for="(rate, rIdx) in item.rates" :key="rIdx" style="display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center; background: var(--color-surface, #f8fafc); padding: 0.5rem; border-radius: 6px; border: 1px solid var(--color-border-light, #e2e8f0);">
              <div>
                <select v-model="rate.paper_size_id" class="form-select" style="font-size: 0.8rem;">
                  <option value="">Pilih Ukuran</option>
                  <option v-for="p in paperSizes" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </div>
              <div>
                <input v-model.number="rate.rate_per_page_bw" type="number" class="form-input" min="0" placeholder="Tarif BW" style="font-size: 0.8rem;">
              </div>
              <div>
                <input v-model.number="rate.rate_per_page_color" type="number" class="form-input" min="0" placeholder="Tarif Warna" style="font-size: 0.8rem;">
              </div>
              <button type="button" @click="removeItemRate(item, rIdx)" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 0.4rem;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
            <div v-if="!item.rates || item.rates.length === 0" style="text-align: center; color: var(--color-text-muted, #64748b); font-size: 0.8rem; padding: 0.75rem; border: 1px dashed var(--color-border-light, #cbd5e1); border-radius: 6px;">
              Belum ada ukuran kertas yang ditambahkan.
            </div>
          </div>
        </div>
        
        <div v-if="item.is_computer" style="margin-top: 1rem; border-top: 1px dashed var(--color-border-light); padding-top: 1rem;">
          <h4 style="margin-bottom: 0.75rem; font-weight: 600; font-size: 0.95rem; color: var(--color-primary);">Spesifikasi Komputer / PC</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem;">
            <div class="form-group">
              <label class="form-label" style="font-size: 0.8rem;">Processor (CPU)</label>
              <input v-model="item.specs.cpu" type="text" class="form-input" placeholder="Misal: Intel Core i5">
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size: 0.8rem;">RAM</label>
              <input v-model="item.specs.ram" type="text" class="form-input" placeholder="Misal: 16GB DDR4">
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size: 0.8rem;">VGA / GPU</label>
              <input v-model="item.specs.vga" type="text" class="form-input" placeholder="Misal: Intel UHD Graphics">
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem; margin-top: 0.75rem;">
            <div class="form-group">
              <label class="form-label" style="font-size: 0.8rem;">Storage Type</label>
              <select v-model="item.specs.storage_type" class="form-select">
                <option value="">Pilih</option>
                <option value="SSD">SSD</option>
                <option value="HDD">HDD</option>
                <option value="NVMe">NVMe</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size: 0.8rem;">Storage Capacity</label>
              <input v-model="item.specs.storage" type="text" class="form-input" placeholder="Misal: 512GB">
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size: 0.8rem;">Operating System (OS)</label>
              <input v-model="item.specs.os" type="text" class="form-input" placeholder="Misal: Windows 11 Pro">
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr; gap: 0.75rem; margin-top: 0.75rem;">
            <div class="form-group">
              <label class="form-label" style="font-size: 0.8rem;">Office Package</label>
              <input v-model="item.specs.office" type="text" class="form-input" placeholder="Misal: Microsoft Office 2021">
            </div>
          </div>
        </div>

        <div style="margin-top: 1rem; border-top: 1px dashed var(--color-border-light); padding-top: 1rem;">
          <div class="form-group">
            <label class="form-label" style="font-size: 0.8rem;">Deskripsi / Keterangan (Tampil di Invoice)</label>
            <textarea v-model="item.description" class="form-input" placeholder="Misal: Kondisi mulus, termasuk kabel power..." rows="2"></textarea>
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


