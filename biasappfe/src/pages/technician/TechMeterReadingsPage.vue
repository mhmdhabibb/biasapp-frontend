<script setup lang="ts">
// @ts-nocheck
import { ref, computed, onMounted, watch } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { useToast } from '@/composables/useToast'
import { usePermission } from '@/composables/usePermission'
import { api } from '@/services/api'
import { resources } from '@/services/resource.service'
import PageHeader from '@/components/ui/PageHeader.vue'

const toast = useToast()
const { can } = usePermission()

const { currentUser } = useAuth()
const {
  monthlyMeterReadings,
  contractItems,
  findCustomer,
  findUnit,
  refresh
} = useMasterStore()

const data = computed(() => monthlyMeterReadings.value)

const paperSizes = ref<any[]>([])
const paperTypes = ref<any[]>([])
onMounted(async () => {
  try {
    paperSizes.value = (await resources.paperSizes.list()).data
  } catch (err) {
    console.warn('Failed to load paper sizes:', err)
  }
  try {
    paperTypes.value = (await (resources as any).paperTypes.list()).data
  } catch (err) {
    console.warn('Failed to load paper types:', err)
  }
})

const showAddModal = ref(false)
const form = ref({
  contract_item_id: null as any,
  paper_size_id: null as any,
  paper_type_id: null as any,
  color_mode: 'bw',
  end_meter: 0
})

const selectedContract = computed(() => contractItems.value.find(c => c.id === form.value.contract_item_id))

// Paper sizes of this contract (from rates = rental copy).
// Input form split per size: each size has its own Previous + Current.
const contractSizes = computed(() => {
  const rates: any[] = (selectedContract.value as any)?.rates || []
  const sized = rates.filter(r => r.paper_size_id)
  const general = rates.filter(r => !r.paper_size_id)
  const combos = sized.map(r => ({
      paper_size_id: r.paper_size_id,
      paper_type_id: r.paper_type_id ?? null,
      quota_applies_to: r.quota_applies_to === 'bw' ? 'bw' : 'color',
      name: r.paper_size?.name
        || paperSizes.value.find(p => String(p.id) === String(r.paper_size_id))?.name
        || String(r.paper_size_id).slice(0, 8),
      type_name: r.paper_type?.name
        || (r.paper_type_id ? (paperTypes.value.find(p => String(p.id) === String(r.paper_type_id))?.name || '') : ''),
    }))
  if (general.length > 0) {
    const g = general[0] as any
    combos.push({
      paper_size_id: '',
      paper_type_id: g?.paper_type_id ?? null,
      quota_applies_to: g?.quota_applies_to === 'bw' ? 'bw' : 'color',
      name: 'Tanpa ukuran (umum)',
      type_name: '',
    })
  }
  return combos
})

// Input per size x kind x mode: { [size|type|mode]: { end_meter } }
const sizeInputs = ref<Record<string, { end_meter: number | null }>>({})
watch(() => form.value.contract_item_id, () => {
  sizeInputs.value = {}
  form.value.paper_size_id = null
  form.value.paper_type_id = null
  form.value.end_meter = 0
})

function comboKey(paperSizeId: any, paperTypeId: any, mode: string): string {
  return String(paperSizeId) + '|' + String(paperTypeId ?? '') + '|' + mode
}

function sameType(a: any, b: any): boolean {
  return String(a ?? '') === String(b ?? '')
}

function prevFor(paperSizeId: any, paperTypeId: any, mode: string): number {
  if (!selectedContract.value) return 0
  const m = String(mode).toLowerCase()
  const sized = data.value.filter(r =>
    r.contract_item_id === selectedContract.value?.id &&
    String(r.paper_size_id) === String(paperSizeId) &&
    sameType(r.paper_type_id, paperTypeId) &&
    String(r.color_mode || '').toLowerCase() === m
  )
  if (sized.length === 0) {
    if (m === 'color') return selectedContract.value.start_meter_color || 0
    return selectedContract.value.start_meter_bw || 0
  }
  const latest = sized.reduce((prev, curr) =>
    new Date(prev.created_at).getTime() > new Date(curr.created_at).getTime() ? prev : curr
  )
  return latest.end_meter || 0
}

function rowInput(paperSizeId: any, paperTypeId: any, mode: string) {
  const key = comboKey(paperSizeId, paperTypeId, mode)
  if (!sizeInputs.value[key]) sizeInputs.value[key] = { end_meter: null }
  return sizeInputs.value[key]!
}
// Previous meter is calculated PER paper size, because one contract/unit
// can have more than one size (A4, F4, ...). If no size is
// selected, use the latest reading of that contract as reference.
const previousReading = computed(() => {
  if (!selectedContract.value) return 0
  let readings = data.value.filter(r => r.contract_item_id === selectedContract.value?.id)
  if (form.value.paper_size_id) {
    const sized = readings.filter(r => String(r.paper_size_id) === String(form.value.paper_size_id))
    if (sized.length > 0) readings = sized
    else return selectedContract.value.start_meter_bw || 0
  }
  if (readings.length === 0) return selectedContract.value.start_meter_bw || 0
  const latest = readings.reduce((prev, curr) =>
    new Date(prev.created_at).getTime() > new Date(curr.created_at).getTime() ? prev : curr
  )
  return latest.end_meter || 0
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

function getPaperSizeName(reading: any) {
  if (reading?.paper_size?.name) return reading.paper_size.name
  const found = paperSizes.value.find(p => String(p.id) === String(reading?.paper_size_id))
  return found ? found.name : '-'
}

async function submitReading() {
  if (!form.value.contract_item_id) return toast.warning('Select a contract/unit!')
  const ci = selectedContract.value

  // Multi-size mode: BW + Color rows per filled size x kind.
  if (contractSizes.value.length > 0) {
    const payloads: any[] = []
    for (const s of contractSizes.value) {
      for (const mode of ['bw', 'color']) {
        const row = rowInput(s.paper_size_id, s.paper_type_id, mode)
        if (row.end_meter === null || row.end_meter === undefined || String(row.end_meter) === '') continue
        const startMeter = prevFor(s.paper_size_id, s.paper_type_id, mode)
        const endMeter = Number(row.end_meter)
        if (endMeter < startMeter) {
          return toast.warning(`Size ${s.name} (${mode.toUpperCase()}): Current Meter (${endMeter}) must not be smaller than Previous (${startMeter})!`)
        }
        payloads.push({
          user_id: currentUser.value?.id,
          contract_item_id: ci.id,
          unit_id: ci.unit_id,
          paper_size_id: s.paper_size_id,
          paper_type_id: s.paper_type_id,
          color_mode: mode,
          start_meter: startMeter,
          end_meter: endMeter,
          total_usage: Math.max(0, endMeter - startMeter),
        })
      }
    }
    if (payloads.length === 0) return toast.warning('Fill in Current Meter for at least one paper size!')
    try {
      for (const p of payloads) {
        await api.post('/monthly-meter-readings/', p)
      }
      await refresh(true)
      showAddModal.value = false
      toast.success(`${payloads.length} Meter Readings saved successfully!`)
      sizeInputs.value = {}
      form.value.end_meter = 0
    } catch (err: any) {
      toast.error(err.message || 'Failed to save meter reading')
    }
    return
  }

  // Single mode (contract without rates): legacy single-size form.
  // Reuse `ci` from the top of submitReading().
  // paper size optional: empty = flat reading without size breakdown

  const startMeter = previousReading.value || 0
  const endMeter = form.value.end_meter
  if (endMeter < startMeter) {
    return toast.warning('Current Meter must not be smaller than the previous value!')
  }
  try {
    await api.post('/monthly-meter-readings/', {
      user_id: currentUser.value?.id,
      contract_item_id: ci.id,
      unit_id: ci.unit_id,
      paper_size_id: form.value.paper_size_id || '',
      paper_type_id: form.value.paper_type_id,
      color_mode: String(form.value.color_mode).toLowerCase() === 'color' ? 'color' : 'bw',
      start_meter: startMeter,
      end_meter: endMeter,
      total_usage: Math.max(0, endMeter - startMeter)
    })
    await refresh(true)
    showAddModal.value = false
    toast.success('Meter Reading saved successfully!')
    form.value.end_meter = 0
    form.value.paper_size_id = null
  } catch (err: any) {
    toast.error(err.message || 'Failed to save meter reading')
  }
}
</script>

<template>
  <div>
    <PageHeader title="Meter Reading" button-label="Input Meter Reading" permission="monthly_meter_reading:create" @add="showAddModal = true" />

    <div class="card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Customer</th>
              <th>Unit</th>
              <th>Serial Number</th>
              <th>Paper Size</th>
              <th>Prev Meter</th>
              <th>Curr Meter</th>
              <th>Total Usage</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="reading in data" :key="reading.id">
              <td>{{ reading.created_at ? new Date(reading.created_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' }) : '-' }}</td>
              <td>{{ getCustomerName(reading.contract_item_id) }}</td>
              <td>{{ getUnitName(reading.contract_item_id) }}</td>
              <td>{{ getSerialNumber(reading.contract_item_id) }}</td>
              <td>{{ getPaperSizeName(reading) }}</td>
              <td>{{ reading.start_meter }}</td>
              <td>{{ reading.end_meter }}</td>
              <td>{{ reading.total_usage }}</td>
            </tr>
            <tr v-if="data.length === 0">
              <td colspan="8" class="text-center py-lg text-muted">No meter reading data yet.</td>
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
              <option :value="null">-- Select Unit / Contract --</option>
              <option v-for="c in contractItems" :key="c.id" :value="c.id">
                {{ getCustomerName(c.id) }} - {{ getUnitName(c.id) }} ({{ getSerialNumber(c.id) }})
              </option>
            </select>
          </div>


          <div v-if="selectedContract && contractSizes.length > 0" class="meter-inputs">
            <p class="text-sm text-muted mb-md">This contract has {{ contractSizes.length }} paper size/kind combos — fill BW + Color meter per combo:</p>
            <div v-for="s in contractSizes" :key="s.paper_size_id + '|' + String(s.paper_type_id ?? '')" class="size-block">
              <div class="size-title">Size: <b>{{ s.name }}</b><span v-if="s.type_name"> / {{ s.type_name }}</span> <span class="text-muted">(free: {{ s.quota_applies_to === 'bw' ? 'BW' : 'Color' }})</span></div>
              <div v-for="mode in ['bw', 'color']" :key="mode" class="flex gap-md" style="margin-bottom: 0.5rem">
                <div class="form-group flex-1 mb-0">
                  <label class="form-label text-muted">Prev {{ mode.toUpperCase() }}</label>
                  <input type="number" :value="prevFor(s.paper_size_id, s.paper_type_id, mode)" class="form-input" disabled>
                </div>
                <div class="form-group flex-1 mb-0">
                  <label class="form-label">Curr {{ mode.toUpperCase() }}</label>
                  <input type="number" v-model.number="rowInput(s.paper_size_id, s.paper_type_id, mode).end_meter" class="form-input" :min="prevFor(s.paper_size_id, s.paper_type_id, mode)" placeholder="Empty = skip">
                </div>
              </div>
            </div>
          </div>
          <div v-else-if="selectedContract" class="meter-inputs">
            <div class="form-group">
              <label class="form-label">Paper Size <span class="text-danger">*</span></label>
              <select v-model="form.paper_size_id" class="form-select">
                <option :value="null">-- No specific size (optional) --</option>
                <option v-for="p in paperSizes" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Paper Kind (optional)</label>
              <select v-model="form.paper_type_id" class="form-select">
                <option :value="null">-- Select Paper Kind --</option>
                <option v-for="p in paperTypes" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Color Mode <span class="text-danger">*</span></label>
              <select v-model="form.color_mode" class="form-select">
                <option value="bw">BW</option>
                <option value="color">Color</option>
              </select>
            </div>
            <div class="flex gap-md">
              <div class="form-group flex-1 mb-0">
                <label class="form-label text-muted">Previous Meter</label>
                <input type="number" :value="previousReading" class="form-input" disabled>
              </div>
              <div class="form-group flex-1 mb-0">
                <label class="form-label">Current Meter <span class="text-danger">*</span></label>
                <input type="number" v-model.number="form.end_meter" class="form-input">
              </div>
            </div>
          </div>
          <div v-else class="text-center py-md text-muted text-sm">
            Select a unit first to see the previous meter.
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" @click="showAddModal = false">Cancel</button>
          <button v-if="can('monthly_meter_reading:create')" class="btn btn-primary" @click="submitReading">Save Data</button>
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
.size-block {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  margin-bottom: var(--space-md);
}
.size-block:last-child { margin-bottom: 0; }
.size-title {
  font-size: var(--font-size-sm);
  margin-bottom: var(--space-sm);
}
.mb-md { margin-bottom: var(--space-md); }
</style>
