<script setup lang="ts">
// @ts-nocheck
import { ref, computed } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import PageHeader from '@/components/ui/PageHeader.vue'

const { currentUser } = useAuth()
const {
  monthlyMeterReadings,
  rentalInvoices,
  contractItems,
  findCustomer,
  findUnit
} = useMasterStore()

// We will just show all meter readings for now, or maybe only those submitted by this tech?
// The DB doesn't have a technician_id directly on MonthlyMeterReading in the mock, it has service_report_id.
// For simplicity, we just show all readings, but tech can only CREATE new ones.
const data = computed(() => {
  return monthlyMeterReadings.value
})

const showAddModal = ref(false)
const form = ref({
  contract_item_id: null as any,
  period: new Date().toISOString().slice(0,7), // YYYY-MM
  counter_mono_end: 0,
  counter_color_end: 0
})

const selectedContract = computed(() => contractItems.value.find(c => c.id === form.value.contract_item_id))
const previousReading = computed(() => {
  if (!selectedContract.value) return null
  // Find latest reading for this contract
  const readings = data.value.filter(r => r.contract_item_id === selectedContract.value?.id)
  if (readings.length === 0) return { mono: 0, color: 0 }
  const latest = readings.reduce((prev, curr) => (prev.id > curr.id) ? prev : curr)
  return { mono: latest.counter_mono_end, color: latest.counter_color_end }
})

function getCustomerName(contractId: number | null) {
  const ci = contractItems.value.find(c => c.id === contractId)
  return ci ? findCustomer(ci.customer_id)?.company_name || '-' : '-'
}

function getUnitName(contractId: number | null) {
  const ci = contractItems.value.find(c => c.id === contractId)
  return ci ? findUnit(ci.unit_id)?.model || '-' : '-'
}

function getSerialNumber(contractId: number | null) {
  const ci = contractItems.value.find(c => c.id === contractId)
  return ci ? findUnit(ci.unit_id)?.serial_no || '-' : '-'
}

function submitReading() {
  if (!form.value.contract_item_id) return alert('Pilih kontrak/unit!')
  
  if (previousReading.value) {
    if (form.value.counter_mono_end < previousReading.value.mono) {
      return alert('Current Meter Mono tidak boleh lebih kecil dari sebelumnya!')
    }
    if (form.value.counter_color_end < previousReading.value.color) {
      return alert('Current Meter Color tidak boleh lebih kecil dari sebelumnya!')
    }
  }

  const ci = selectedContract.value
  const monoStart = previousReading.value?.mono || 0
  const colorStart = previousReading.value?.color || 0
  const monoEnd = form.value.counter_mono_end
  const colorEnd = form.value.counter_color_end

  const usageMono = Math.max(0, monoEnd - monoStart)
  const usageColor = Math.max(0, colorEnd - colorStart)

  const freeQuotaColor = ci?.free_quota_color || ci?.free_copy_quota || 0
  const bwRate = ci?.rates?.[0]?.rate_per_page_bw || ci?.rate_per_page_bw || 150
  const colorRate = ci?.rates?.[0]?.rate_per_page_color || ci?.rate_per_page_color || 1300

  const excessColor = Math.max(0, usageColor - freeQuotaColor)
  const excessAmount = (excessColor * colorRate) + (usageMono * bwRate)
  const baseRent = ci?.monthly_rent_fee || ci?.total_value || 0
  const subtotal = baseRent + excessAmount

  const readingId = Date.now()
  monthlyMeterReadings.value.push({
    id: readingId,
    service_report_id: null,
    contract_item_id: form.value.contract_item_id,
    period: form.value.period,
    counter_mono_start: monoStart,
    counter_mono_end: monoEnd,
    counter_color_start: colorStart,
    counter_color_end: colorEnd,
    color_mode: 'BW/Color',
    total_usage: usageMono + usageColor,
    total_amount: excessAmount,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null
  })

  // Auto-generate Rental Invoice for Copier
  const invNo = `INV-R-${Date.now().toString().slice(-6)}`
  const now = new Date()
  const dueDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  rentalInvoices.value.push({
    id: Date.now() + 1,
    invoice_no: invNo,
    customer_id: ci?.customer_id,
    contract_item_id: ci?.id,
    period_start: `${form.value.period}-01`,
    period_end: `${form.value.period}-30`,
    monthly_date: now.toISOString().slice(0, 10),
    due_date: dueDate,
    basis_rental_fee: baseRent,
    excess_amount: excessAmount,
    subtotal: subtotal,
    tax: 0,
    total_pay: subtotal,
    status: 'unpaid',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null
  })

  showAddModal.value = false
  alert(`Meter Reading berhasil ditambahkan!\nRental Invoice ${invNo} sebesar Rp ${subtotal.toLocaleString('id-ID')} otomatis diterbitkan.`)
}
</script>

<template>
  <div>
    <PageHeader title="Meter Reading" button-label="Input Meter Reading" @add="showAddModal = true" />

    <div class="card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Customer</th>
              <th>Unit</th>
              <th>Serial Number</th>
              <th>Prev (Mono/Color)</th>
              <th>Curr (Mono/Color)</th>
              <th>Total Usage</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="reading in data" :key="reading.id">
              <td>{{ reading.period }}</td>
              <td>{{ getCustomerName(reading.contract_item_id) }}</td>
              <td>{{ getUnitName(reading.contract_item_id) }}</td>
              <td>{{ getSerialNumber(reading.contract_item_id) }}</td>
              <td>{{ reading.counter_mono_start }} / {{ reading.counter_color_start }}</td>
              <td>{{ reading.counter_mono_end }} / {{ reading.counter_color_end }}</td>
              <td>{{ reading.total_usage }}</td>
            </tr>
            <tr v-if="data.length === 0">
              <td colspan="7" class="text-center py-lg text-muted">Belum ada data meter reading.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add Modal -->
    <div v-if="showAddModal" class="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">Input Meter Reading</h2>
          <button class="btn-close" @click="showAddModal = false">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Unit / Customer <span class="text-danger">*</span></label>
            <select v-model="form.contract_item_id" class="form-select">
              <option :value="null">-- Pilih Unit / Kontrak --</option>
              <option v-for="c in contractItems" :key="c.id" :value="c.id">
                {{ getCustomerName(c.id) }} - {{ getUnitName(c.id) }} ({{ getSerialNumber(c.id) }})
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Periode (Bulan)</label>
            <input type="month" v-model="form.period" class="form-input">
          </div>

          <div v-if="selectedContract" class="meter-inputs">
            <div class="flex gap-md mb-md">
              <div class="form-group flex-1 mb-0">
                <label class="form-label text-muted">Previous Mono</label>
                <input type="number" :value="previousReading?.mono || 0" class="form-input" disabled>
              </div>
              <div class="form-group flex-1 mb-0">
                <label class="form-label">Current Mono <span class="text-danger">*</span></label>
                <input type="number" v-model.number="form.counter_mono_end" class="form-input">
              </div>
            </div>
            
            <div class="flex gap-md">
              <div class="form-group flex-1 mb-0">
                <label class="form-label text-muted">Previous Color</label>
                <input type="number" :value="previousReading?.color || 0" class="form-input" disabled>
              </div>
              <div class="form-group flex-1 mb-0">
                <label class="form-label">Current Color <span class="text-danger">*</span></label>
                <input type="number" v-model.number="form.counter_color_end" class="form-input">
              </div>
            </div>
          </div>
          <div v-else class="text-center py-md text-muted text-sm">
            Pilih unit terlebih dahulu untuk melihat previous meter.
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" @click="showAddModal = false">Batal</button>
          <button class="btn btn-primary" @click="submitReading">Simpan Data</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal {
  background: var(--color-surface);
  width: 90%;
  max-width: 500px;
  border-radius: var(--radius-lg);
  box-shadow: 0 10px 25px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
}
.modal-header {
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--color-border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.modal-title { font-size: var(--font-size-lg); font-weight: var(--font-weight-bold); }
.btn-close {
  background: none; border: none; color: var(--color-text-muted); cursor: pointer;
  padding: 4px; border-radius: 4px;
}
.btn-close:hover { background: var(--color-surface-sunken); color: var(--color-text); }
.modal-body {
  padding: var(--space-lg);
}
.modal-footer {
  padding: var(--space-md) var(--space-lg);
  border-top: 1px solid var(--color-border-light);
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}
.meter-inputs {
  background: var(--color-surface-sunken);
  padding: var(--space-md);
  border-radius: var(--radius-md);
}
</style>
