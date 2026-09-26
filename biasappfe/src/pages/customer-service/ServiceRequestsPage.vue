<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import type { TableColumn } from '@/types'
import { computed, reactive, ref, onMounted, watch } from 'vue'

const { customers, units, sales, findProduct, getUnitsByCustomer } = useMasterStore()

const columns: TableColumn[] = [
  { key: 'request_no', label: 'Request No' },
  { key: 'customer', label: 'Customer' },
  { key: 'request_date', label: 'Tgl Request' },
  { key: 'problem_description', label: 'Keluhan' },
  { key: 'status', label: 'Status' }
]

const serviceRequests = ref<any[]>([])
const showModal = ref(false)
const isLoading = ref(false)
const rentalsData = ref<any[]>([])

const form = reactive({
  request_no: `REQ-${Date.now().toString().slice(-6)}`,
  customer_id: '',
  unit_ids: [] as string[],
  problem_description: '',
  request_date: new Date().toISOString().slice(0, 10),
})

// Fetch all rentals to know which units are rented by which customer
async function fetchRentals() {
  try {
    const token = sessionStorage.getItem("bias_token")
    const res = await fetch('http://localhost:4008/api/rents', {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    })
    if (res.ok) {
      const data = await res.json()
      rentalsData.value = data.data || []
    }
  } catch (e) {
    console.warn("Could not fetch rentals for unit list", e)
  }
}

// Get units rented AND products purchased by the selected customer
const customerRentalUnits = computed(() => {
  if (!form.customer_id) return []
  
  const unitMap = new Map<string, any>()
  
  // From rental items
  for (const rental of rentalsData.value) {
    if (rental.customer_id === form.customer_id && rental.rental_items) {
      for (const item of rental.rental_items) {
        if (item.unit_id && item.unit) {
          unitMap.set(item.unit_id, {
            id: item.unit_id,
            label: `${item.unit.brand || ''} ${item.unit.model || item.unit.unit_name || ''} (SN: ${item.unit.serial_number || '-'})`.trim(),
            source: 'rental'
          })
        }
        if (item.product_id && item.product) {
          unitMap.set('rent_prod_' + item.product_id, {
            id: item.product_id,
            label: `${item.product.name || 'Produk'} (Qty: ${item.qty || 1})`,
            source: 'rental'
          })
        }
      }
    }
  }
  
  // From sales (purchased products)
  for (const sale of sales.value) {
    if ((sale as any).customer_id === form.customer_id && (sale as any).sale_items) {
      for (const si of (sale as any).sale_items) {
        const prod = findProduct(si.product_id)
        const key = 'sale_prod_' + si.product_id
        if (!unitMap.has(key)) {
          unitMap.set(key, {
            id: si.product_id,
            label: `${prod?.name || 'Produk ID: ' + si.product_id} (Qty: ${si.qty || 1})`,
            source: 'sale'
          })
        }
      }
    }
  }
  
  // Also from contract items
  const contractUnits = getUnitsByCustomer(form.customer_id as any)
  for (const u of contractUnits) {
    if (!unitMap.has(u.id as string)) {
      unitMap.set(u.id as string, {
        id: u.id,
        label: `${(u as any).brand || ''} ${(u as any).model || ''} (SN: ${(u as any).serial_number || '-'})`.trim(),
        source: 'contract'
      })
    }
  }
  
  return Array.from(unitMap.values())
})

// Reset unit selection when customer changes
watch(() => form.customer_id, () => {
  form.unit_ids = []
})

function openAdd() {
  Object.assign(form, {
    request_no: `REQ-${Date.now().toString().slice(-6)}`,
    customer_id: '',
    unit_ids: [],
    problem_description: '',
    request_date: new Date().toISOString().slice(0, 10),
  })
  showModal.value = true
}

async function fetchRequests() {
  try {
    const res = await fetch('http://localhost:4008/api/service-requests')
    if (res.ok) {
      const data = await res.json()
      serviceRequests.value = data.data.map((r: any) => ({
        ...r,
        customer: r.customer?.name || '-',
      }))
    }
  } catch (error) {
    console.error("Gagal mengambil data", error)
  }
}

async function handleSubmit() {
  if (!form.customer_id || !form.problem_description) return
  isLoading.value = true
  
  const payload = {
    request_no: form.request_no,
    customer_id: form.customer_id,
    unit_id: form.unit_ids.length > 0 ? form.unit_ids[0] : null,
    problem_description: form.problem_description,
    request_date: new Date(form.request_date).toISOString(),
  }

  try {
    const res = await fetch('http://localhost:4008/api/service-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    
    if (res.ok) {
      alert("Service Request berhasil dibuat!")
      showModal.value = false
      fetchRequests()
    } else {
      const err = await res.json()
      alert("Gagal: " + JSON.stringify(err))
    }
  } catch (error) {
    alert("Terjadi kesalahan jaringan.")
  } finally {
    isLoading.value = false
  }
}

const showAssignModal = ref(false)
const assignItem = ref<any>(null)
const assignForm = reactive({
  technician_id: '',
  scheduled_date: new Date().toISOString().slice(0, 10),
  instructions: ''
})

function openAssign(row: any) {
  assignItem.value = row
  Object.assign(assignForm, {
    technician_id: '',
    scheduled_date: new Date().toISOString().slice(0, 10),
    instructions: `Lanjutan dari keluhan: ${row.problem_description}`
  })
  showAssignModal.value = true
}

async function handleAssignSubmit() {
  if (!assignForm.technician_id) return
  isLoading.value = true
  
  const payload = {
    job_order_no: `JO-${Date.now().toString().slice(-6)}`,
    service_request_id: assignItem.value.id,
    technician_id: assignForm.technician_id,
    scheduled_date: new Date(assignForm.scheduled_date).toISOString(),
    instructions: assignForm.instructions
  }

  try {
    const res = await fetch('http://localhost:4008/api/job-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    
    if (res.ok) {
      alert("Teknisi berhasil di-assign! Job Order telah dibuat.")
      showAssignModal.value = false
      fetchRequests() // To maybe refresh status if backend updates SR status automatically
    } else {
      const err = await res.json()
      alert("Gagal: " + JSON.stringify(err))
    }
  } catch (error) {
    alert("Terjadi kesalahan jaringan.")
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchRequests()
  fetchRentals()
})
</script>

<template>
  <div>
    <PageHeader title="Manajemen Service Request" button-label="Buat Request Baru" @add="openAdd" />
    
    <DataTable :columns="columns" :data="serviceRequests" search-placeholder="Cari keluhan...">
      <template #cell-request_date="{ value }">{{ new Date(value).toLocaleDateString('id-ID') }}</template>
      <template #cell-status="{ value }">
        <span class="badge" :class="value === 'assigned' || value === 'in_progress' ? 'badge-success' : 'badge-warning'">
          {{ value.toUpperCase() }}
        </span>
      </template>
      <template #actions="{ row }">
        <button v-if="row.status !== 'assigned' && row.status !== 'completed'" class="btn btn-sm btn-primary" @click="openAssign(row)">Assign Teknisi</button>
      </template>
    </DataTable>

    <FormModal :open="showModal" title="Input Keluhan (Service Request)" @close="showModal = false" @submit="handleSubmit">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Nomor Request</label>
          <input v-model="form.request_no" type="text" class="form-input" required>
        </div>
        <div class="form-group">
          <label class="form-label">Tanggal Masuk</label>
          <input v-model="form.request_date" type="date" class="form-input" required>
        </div>
      </div>

      <div class="form-group mt-3">
        <label class="form-label">Customer</label>
        <select v-model="form.customer_id" class="form-select" required>
          <option value="">-- Pilih Customer --</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ (c as any).company_name || (c as any).name }}{{ (c as any).pic_name ? ' - PIC: ' + (c as any).pic_name : '' }}</option>
        </select>
      </div>

      <div class="form-group mt-3">
        <label class="form-label">Mesin yang Bermasalah</label>
        <div v-if="!form.customer_id" style="padding: 12px; background: var(--color-surface-raised); border-radius: var(--radius-sm); color: var(--color-text-muted); font-size: var(--font-size-sm);">
          Pilih customer terlebih dahulu
        </div>
        <div v-else-if="customerRentalUnits.length === 0" style="padding: 12px; background: var(--color-surface-raised); border-radius: var(--radius-sm); color: var(--color-text-muted); font-size: var(--font-size-sm);">
          Tidak ada unit/mesin yang sedang dirental oleh customer ini
        </div>
        <div v-else class="unit-checkbox-list">
          <label v-for="u in customerRentalUnits" :key="u.id" class="unit-checkbox-item">
            <input type="checkbox" :value="u.id" v-model="form.unit_ids" />
            <span class="unit-checkbox-label">{{ u.label }}</span>
            <span class="unit-source-badge" :class="u.source === 'rental' ? 'badge-rental' : u.source === 'sale' ? 'badge-sale' : 'badge-contract'">
              {{ u.source === 'rental' ? 'Rental' : u.source === 'sale' ? 'Pembelian' : 'Kontrak' }}
            </span>
          </label>
        </div>
      </div>

      <div class="form-group mt-3">
        <label class="form-label">Deskripsi Keluhan (Problem)</label>
        <textarea v-model="form.problem_description" class="form-input" rows="4" placeholder="Jelaskan keluhan secara rinci" required></textarea>
      </div>
      
      <div v-if="isLoading" class="mt-2 text-center text-sm text-gray-500">Menyimpan data...</div>
    </FormModal>

    <FormModal :open="showAssignModal" title="Assign Teknisi (Buat Job Order)" @close="showAssignModal = false" @submit="handleAssignSubmit">
      <div class="form-group mt-3">
        <label class="form-label">Pilih Teknisi</label>
        <select v-model="assignForm.technician_id" class="form-select" required>
          <option value="">-- Pilih Teknisi --</option>
          <option v-for="t in useMasterStore().technicians" :key="t.id" :value="t.id">{{ (t as any).name }}</option>
        </select>
      </div>
      <div class="form-group mt-3">
        <label class="form-label">Tanggal Penugasan</label>
        <input v-model="assignForm.scheduled_date" type="date" class="form-input" required>
      </div>
      <div class="form-group mt-3">
        <label class="form-label">Instruksi / Catatan untuk Teknisi</label>
        <textarea v-model="assignForm.instructions" class="form-input" rows="4" required></textarea>
      </div>
      <div v-if="isLoading" class="mt-2 text-center text-sm text-gray-500">Menyimpan data...</div>
    </FormModal>
  </div>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-base);
}
.mt-3 { margin-top: 1rem; }
.mt-2 { margin-top: 0.5rem; }
.text-center { text-align: center; }
.text-sm { font-size: 0.875rem; }
.text-gray-500 { color: #6b7280; }

.unit-checkbox-list {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  max-height: 200px;
  overflow-y: auto;
  padding: 8px;
}
.unit-checkbox-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s;
  font-size: var(--font-size-sm);
}
.unit-checkbox-item:hover {
  background: var(--color-surface-raised);
}
.unit-checkbox-item input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--color-primary);
  flex-shrink: 0;
}
.unit-checkbox-label {
  flex: 1;
  font-weight: var(--font-weight-medium);
}
.unit-source-badge {
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.badge-rental {
  background: #e0f2fe;
  color: #0369a1;
}
.badge-contract {
  background: #f0fdf4;
  color: #15803d;
}
</style>
