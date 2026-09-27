<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { api } from '@/services/api'
import type { JobOrder, Customer, Unit, Technician, ContractItem } from '@/types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void, (e: 'refresh'): void }>()

const { customers, technicians, units, contractItems } = useMasterStore()

const jobTypes = [
  { value: 'delivery', label: 'Delivery' },
  { value: 'installation', label: 'Installation' },
  { value: 'delivery_installation', label: 'Delivery & Installation' },
  { value: 'call_service', label: 'Call Service' },
  { value: 'maintenance_visit', label: 'Maintenance Visit' },
  { value: 'meter_reading', label: 'Meter Reading' },
  { value: 'pickup_return', label: 'Pickup / Return' }
]

const form = reactive({
  job_type: 'call_service',
  customer_id: null as string | null,
  unit_id: null as string | null,
  technician_id: null as string | null,
  contract_item_id: null as string | null,
  scheduled_date: new Date().toISOString().slice(0, 16),
  instructions: ''
})

const loading = ref(false)
const errorMsg = ref('')

const activeTechnicians = computed(() => {
  return technicians.value.filter(t => t.name)
})

const customerMachines = computed(() => {
  if (!form.customer_id) return []
  const custContracts = contractItems.value.filter(c => c.customer_id == form.customer_id && c.status === 'active')
  const validUnitIds = new Set(custContracts.map(c => c.unit_id))
  return units.value.filter(u => validUnitIds.has(u.id))
})

const selectedUnit = computed(() => {
  if (!form.unit_id) return null
  return units.value.find(u => u.id == form.unit_id) || null
})

const activeContracts = computed(() => {
  return contractItems.value.filter(c => c.status === 'active')
})

const selectedContract = computed(() => {
  if (!form.contract_item_id) return null
  return contractItems.value.find(c => c.id == form.contract_item_id) || null
})

watch(() => form.job_type, (newType) => {
  if (newType !== 'maintenance_visit') {
    form.contract_item_id = null
  }
})

watch(() => form.contract_item_id, (newContractId) => {
  if (form.job_type === 'maintenance_visit' && newContractId) {
    const contract = selectedContract.value
    if (contract) {
      form.customer_id = String(contract.customer_id)
      setTimeout(() => {
        form.unit_id = String(contract.unit_id)
      }, 50)
    }
  }
})

watch(() => form.customer_id, (newCust, oldCust) => {
  if (newCust !== oldCust && form.job_type !== 'maintenance_visit') {
    form.unit_id = null
  }
})

async function submitJob() {
  loading.value = true
  errorMsg.value = ''
  try {
    // 1. Always create a Service Request first
    const srPayload = {
      request_no: `REQ-${Date.now().toString().slice(-6)}`,
      customer_id: form.customer_id,
      unit_id: form.unit_id,
      problem_description: `[${form.job_type.toUpperCase()}] ${form.instructions}`,
      status: 'pending'
    }
    const srRes = await api.post<any>('/service-requests', srPayload)
    const srId = srRes.data.id

    // 2. If technician is assigned, create Job Order too
    if (form.technician_id) {
      const joPayload = {
        job_order_no: `JO-${Date.now().toString().slice(-6)}`,
        job_type: form.job_type,
        service_request_id: srId,
        customer_id: form.customer_id,
        unit_id: form.unit_id,
        technician_id: form.technician_id,
        scheduled_date: new Date(form.scheduled_date).toISOString(),
        instructions: form.instructions
      }
      await api.post('/job-orders', joPayload)
    }
    
    emit('refresh')
    emit('close')
    
    Object.assign(form, {
      job_type: 'call_service',
      customer_id: null,
      unit_id: null,
      technician_id: null,
      contract_item_id: null,
      scheduled_date: new Date().toISOString().slice(0, 16),
      instructions: ''
    })
  } catch (err: any) {
    errorMsg.value = err.message || 'Failed to create job order'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="modal-overlay" v-if="open" @click.self="emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Create New Job / Work Order</h2>
        <button class="close-btn" @click="emit('close')">&times;</button>
      </div>

      <div class="modal-body">
        <div v-if="errorMsg" class="alert alert-danger">{{ errorMsg }}</div>

        <form @submit.prevent="submitJob" class="form-grid">
          
          <div class="form-group full-width">
            <label>Job Type</label>
            <select v-model="form.job_type" class="form-control" required>
              <option v-for="type in jobTypes" :key="type.value" :value="type.value">
                {{ type.label }}
              </option>
            </select>
          </div>

          <template v-if="form.job_type === 'maintenance_visit'">
            <div class="form-group full-width">
              <label>Select Active Contract</label>
              <select v-model="form.contract_item_id" class="form-control" required>
                <option :value="null">-- Select Contract --</option>
                <option v-for="c in activeContracts" :key="c.id" :value="c.id">
                  {{ c.contract_no }} 
                </option>
              </select>
            </div>
          </template>

          <div class="form-group">
            <label>Customer</label>
            <select v-model="form.customer_id" class="form-control" required :disabled="form.job_type === 'maintenance_visit'">
              <option :value="null">-- Select Customer --</option>
              <option v-for="c in customers" :key="c.id" :value="c.id">
                {{ c.company_name || c.name }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>Machine / Unit</label>
            <select v-model="form.unit_id" class="form-control" required :disabled="!form.customer_id || form.job_type === 'maintenance_visit'">
              <option :value="null">-- Select Machine --</option>
              <option v-for="u in customerMachines" :key="u.id" :value="u.id">
                {{ u.serial_no }} - {{ u.name }}
              </option>
            </select>
          </div>

          <div class="form-group full-width" v-if="selectedUnit">
            <div class="machine-details">
              <div><strong>Brand:</strong> {{ selectedUnit.brand?.name || '-' }}</div>
              <div><strong>Model:</strong> {{ selectedUnit.model || '-' }}</div>
              <div><strong>Serial No:</strong> {{ selectedUnit.serial_no }}</div>
              <div><strong>Location:</strong> {{ selectedContract?.placement_location || '-' }}</div>
            </div>
          </div>

          <div class="form-group">
            <label>Assign Technician (Optional - For direct dispatch)</label>
            <select v-model="form.technician_id" class="form-control">
              <option :value="null">-- Leave Unassigned --</option>
              <option v-for="t in activeTechnicians" :key="t.id" :value="t.id">
                {{ t.name }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>Scheduled Date & Time</label>
            <input type="datetime-local" v-model="form.scheduled_date" class="form-control" required>
          </div>

          <div class="form-group full-width">
            <label>Instructions / Problem Description</label>
            <textarea v-model="form.instructions" class="form-control" rows="3" required></textarea>
          </div>

        </form>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" @click="emit('close')" :disabled="loading">Cancel</button>
        <button type="button" class="btn btn-primary" @click="submitJob" :disabled="loading">
          {{ loading ? 'Saving...' : 'Create Job' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: var(--color-surface, #fff);
  width: 90%;
  max-width: 600px;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}
.modal-header {
  padding: 20px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-header h2 {
  margin: 0;
  font-size: 18px;
}
.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--color-text-muted);
}
.modal-body {
  padding: 20px;
  overflow-y: auto;
}
.modal-footer {
  padding: 20px;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.full-width {
  grid-column: 1 / -1;
}
.form-control {
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 14px;
}
.form-control:disabled {
  background-color: var(--color-surface-sunken);
  cursor: not-allowed;
}
.btn {
  padding: 10px 20px;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  border: none;
}
.btn-primary {
  background: var(--color-primary);
  color: white;
}
.btn-secondary {
  background: var(--color-surface-sunken);
  color: var(--color-text);
}
.machine-details {
  background: var(--color-surface-sunken);
  padding: 12px;
  border-radius: 6px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  font-size: 13px;
}
.alert {
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 16px;
}
.alert-danger {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.2);
}
</style>
