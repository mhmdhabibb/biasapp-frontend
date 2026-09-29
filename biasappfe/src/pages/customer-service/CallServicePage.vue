<script setup lang="ts">
// @ts-nocheck
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useMasterStore } from '@/composables/useMasterStore'

const router = useRouter()
const {
  customers,
  technicians,
  getUnitsByCustomer,
  getContractsByCustomer,
  serviceReports, // to push the new report
} = useMasterStore()

const form = reactive({
  customer_id: null as any,
  unit_id: null as any,
  service_type: 'corrective',
  machine_problem: '',
  technician_id: null as any,
  priority: 'normal',
})

const selectedCustomer = computed(() => {
  return customers.value.find(c => c.id === form.customer_id)
})

const availableUnits = computed(() => {
  return getUnitsByCustomer(form.customer_id)
})

const isSubmitting = ref(false)

function handleAssignJob() {
  if (!form.customer_id || !form.unit_id || !form.machine_problem.trim() || !form.technician_id) {
    alert('Please fill all required fields.')
    return
  }

  isSubmitting.value = true
  
  // Create a new Service Report
  // First, find the contract associated with the unit for this customer
  const customerContracts = getContractsByCustomer(form.customer_id)
  const relatedContract = customerContracts.find(c => c.unit_id === form.unit_id)

  const newReport = {
    id: Date.now(),
    service_report_no: `SR-${Date.now().toString().slice(-6)}`,
    contract_item_id: relatedContract ? relatedContract.id : null,
    customer_id: form.customer_id,
    service_type: form.service_type,
    technician_id: form.technician_id,
    visit_date: '',
    time_in: '',
    time_out: '',
    machine_problem: form.machine_problem,
    repair_action: '',
    status: 'assigned', // Workflow: NEW -> ASSIGNED
    project_name: '',
    is_chargeable: false,
    reading_counter: 0,
    is_complete: false,
    created_at: new Date().toISOString(), // SLA starts here
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }

  serviceReports.value.push(newReport)

  setTimeout(() => {
    isSubmitting.value = false
    router.push('/customer-service/monitoring-service')
  }, 600)
}
</script>

<template>
  <div class="call-service-container">
    <PageHeader title="Create Call Service & Assign Job" />
    
    <div class="form-card">
      <div class="form-section">
        <h3 class="section-title">1. Customer Information</h3>
        <div class="form-group">
          <label class="form-label">Customer *</label>
          <select v-model="form.customer_id" class="form-select" @change="form.unit_id = null">
            <option :value="null">-- Select Customer --</option>
            <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.company_name || c.name || '-' }}</option>
          </select>
        </div>

        <div v-if="selectedCustomer" class="customer-details">
          <div class="detail-item"><strong>PIC:</strong> {{ selectedCustomer.name }}</div>
          <div class="detail-item"><strong>Phone:</strong> {{ selectedCustomer.phone }}</div>
          <div class="detail-item"><strong>Email:</strong> {{ selectedCustomer.email }}</div>
          <div class="detail-item"><strong>Address:</strong> {{ selectedCustomer.address }}</div>
        </div>
      </div>

      <div class="form-section" :class="{ 'disabled-section': !form.customer_id }">
        <h3 class="section-title">2. Unit Information</h3>
        <div class="form-group">
          <label class="form-label">Unit *</label>
          <select v-model="form.unit_id" class="form-select" :disabled="!form.customer_id">
            <option :value="null">-- Select Unit --</option>
            <option v-for="u in availableUnits" :key="u.id" :value="u.id">
              {{ u.model }} (SN: {{ u.serial_no }})
            </option>
          </select>
          <div v-if="form.customer_id && availableUnits.length === 0" class="help-text text-warning">
            No active units found for this customer.
          </div>
        </div>
      </div>

      <div class="form-section" :class="{ 'disabled-section': !form.unit_id }">
        <h3 class="section-title">3. Service Details</h3>
        <div class="form-group">
          <label class="form-label">Service Type</label>
          <select v-model="form.service_type" class="form-select" :disabled="!form.unit_id">
            <option value="corrective">Corrective</option>
            <option value="preventive">Preventive</option>
            <option value="installation">Installation</option>
            <option value="relocation">Relocation</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Machine Problem *</label>
          <textarea 
            v-model="form.machine_problem" 
            class="form-textarea" 
            rows="3" 
            placeholder="Describe the problem..."
            :disabled="!form.unit_id"
          ></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Priority</label>
          <select v-model="form.priority" class="form-select" :disabled="!form.unit_id">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High (SLA Critical)</option>
          </select>
        </div>
      </div>

      <div class="form-section" :class="{ 'disabled-section': !form.machine_problem }">
        <h3 class="section-title">4. Job Assignment</h3>
        <div class="form-group">
          <label class="form-label">Technician *</label>
          <select v-model="form.technician_id" class="form-select" :disabled="!form.machine_problem">
            <option :value="null">-- Select Technician --</option>
            <option v-for="t in technicians" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
        <div class="form-actions">
          <button 
            class="btn btn-primary btn-large" 
            :disabled="!form.technician_id || isSubmitting"
            @click="handleAssignJob"
          >
            {{ isSubmitting ? 'Assigning...' : 'Assign Job' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.call-service-container {
  max-width: 800px;
  margin: 0 auto;
}

.form-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  box-shadow: var(--shadow-sm);
  margin-top: var(--space-md);
}

.form-section {
  margin-bottom: var(--space-xl);
  padding-bottom: var(--space-lg);
  border-bottom: 1px solid var(--color-border-light);
  transition: opacity 0.3s ease;
}

.form-section:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.disabled-section {
  opacity: 0.4;
  pointer-events: none;
}

.section-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  margin-bottom: var(--space-md);
  color: var(--color-primary);
}

.customer-details {
  margin-top: var(--space-md);
  padding: var(--space-md);
  background: var(--color-surface-sunken);
  border-radius: var(--radius-md);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-sm);
  font-size: var(--font-size-sm);
}

.help-text {
  font-size: var(--font-size-xs);
  margin-top: var(--space-xs);
}
.text-warning {
  color: #f59e0b;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-lg);
}

.btn-large {
  padding: 12px 24px;
  font-size: var(--font-size-base);
}
</style>
