<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import type { TableColumn } from '@/types'

const toast = useToast()
const store = useMasterStore()

const jobOrders = ref<any[]>([])
const loading = ref(false)
const showModal = ref(false)

const form = ref({
  id: '',
  job_order_no: '',
  customer_id: null as string | null,
  unit_id: null as string | null,
  scheduled_date: '',
  instructions: '',
  customer_name: '',
  unit_name: ''
})

const columns: TableColumn[] = [
  { key: 'job_order_no', label: 'Job Order No' },
  { key: 'customer', label: 'Customer' },
  { key: 'unit', label: 'Unit' },
  { key: 'scheduled_date', label: 'Scheduled Date' },
  { key: 'status', label: 'Status' },
]

async function fetchJobs() {
  try {
    const res = await api.get<{ data: any[] }>('/job-orders')
    // Only maintenance visits (identified by problem_description marker)
    jobOrders.value = res.data.filter(j => 
      j.job_type === 'service' && 
      (j.service_request?.problem_description?.includes('[MAINTENANCE_VISIT]') || j.instructions?.includes('Rutin Maintenance'))
    ).map(j => ({
      ...j,
      job_order_no: (j.job_order_no || '').replace('JO-', 'MT-').replace('REQ-', 'MT-')
    }))
  } catch (err) {
    console.error(err)
  }
}

onMounted(() => {
  fetchJobs()
})

const customerOptions = computed(() =>
  store.customers.value.map((c: any) => ({ value: c.id, label: c.company_name || c.name }))
)

const unitOptions = computed(() => {
  if (!form.value.customer_id) return []
  const validUnits = store.getUnitsByCustomer(form.value.customer_id)
  return validUnits.map((u: any) => ({ value: u.id, label: `${u.serial_no || '-'} - ${u.model || u.name}` }))
})

import { watch } from 'vue'
watch(() => form.value.customer_id, (newVal, oldVal) => {
  if (oldVal !== null) form.value.unit_id = null
})

function getCustomerName(row: any) {
  const c = store.findCustomer(row.service_request?.customer_id)
  return c ? c.company_name || c.name : '-'
}

function getUnitName(row: any) {
  const u = store.findUnit(row.service_request?.unit_id)
  return u ? `${u.model} (${u.serial_no || '-'})` : '-'
}

function getTechnicianName(row: any) {
  const t = store.findTechnician(row.technician_id)
  return t ? t.user?.name || t.name : '-'
}

function openAdd() {
  form.value = {
    id: '',
    job_order_no: `MT-${Date.now().toString().slice(-6)}`,
    customer_id: null,
    unit_id: null,
    scheduled_date: new Date().toISOString().slice(0, 16),
    instructions: 'Rutin Maintenance',
    customer_name: '',
    unit_name: ''
  }
  showModal.value = true
}

function openEdit(row: any) {
  form.value = {
    id: row.id,
    job_order_no: row.job_order_no,
    customer_id: String(row.service_request?.customer_id || ''),
    unit_id: String(row.service_request?.unit_id || ''),
    scheduled_date: row.scheduled_date ? new Date(row.scheduled_date).toISOString().slice(0, 16) : '',
    instructions: row.instructions || '',
    customer_name: getCustomerName(row) || '',
    unit_name: getUnitName(row) || ''
  }
  showModal.value = true
}

async function submitForm() {
  loading.value = true
  try {
    if (form.value.id) {
      // Edit existing
      await api.patch(`/job-orders/${form.value.id}`, {
        scheduled_date: new Date(form.value.scheduled_date).toISOString(),
        instructions: form.value.instructions
      })
      toast.success('Maintenance schedule updated')
    } else {
      // Create new: requires a service request first
      const srPayload = {
        request_no: `MT-${Date.now().toString().slice(-6)}`,
        customer_id: form.value.customer_id,
        unit_id: form.value.unit_id,
        problem_description: `[MAINTENANCE_VISIT] ${form.value.instructions}`,
        request_date: new Date().toISOString(),
        status: 'pending'
      }
      const srRes = await api.post<any>('/service-requests/', srPayload)
      const srId = srRes?.data?.id

      if (srId) {
        const joPayload = {
          job_order_no: form.value.job_order_no,
          service_request_id: srId,
          scheduled_date: new Date(form.value.scheduled_date).toISOString(),
          instructions: form.value.instructions,
          job_type: 'service',
          status: 'scheduled'
        }
        await api.post('/job-orders/', joPayload)
      }
      toast.success('Maintenance schedule created')
    }
    showModal.value = false
    fetchJobs()
  } catch (err: any) {
    toast.error(err.message || 'Error saving maintenance schedule')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="Maintenance Schedules" button-label="Add Schedule" @add="openAdd" />

    <DataTable :columns="columns" :data="jobOrders" search-placeholder="Search schedules..." @edit="openEdit" @row-click="openEdit">
      <template #cell-customer="{ row }">{{ getCustomerName(row) }}</template>
      <template #cell-unit="{ row }">{{ getUnitName(row) }}</template>
      <template #cell-scheduled_date="{ value }">
        {{ value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '-' }}
      </template>
      <template #cell-status="{ value }">
        <span class="badge" :class="value === 'completed' ? 'badge-success' : 'badge-info'">
          {{ String(value || '-').toUpperCase().replace('_', ' ') }}
        </span>
      </template>
    </DataTable>

    <FormModal :open="showModal" :title="form.id ? 'Edit Schedule' : 'Create Schedule'" @close="showModal = false" @submit="submitForm">
      
      <div v-if="form.id" style="margin-bottom: 20px; padding: 16px; background: var(--color-surface-hover); border-radius: 8px;">
        <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-muted); margin-bottom: 4px;">Schedule No</div>
        <div style="font-weight: 500; font-size: 16px; color: var(--color-primary); margin-bottom: 12px;">{{ form.job_order_no }}</div>
        
        <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-muted); margin-bottom: 4px;">Customer</div>
        <div style="font-weight: 500; margin-bottom: 12px;">{{ form.customer_name }}</div>
        
        <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-muted); margin-bottom: 4px;">Unit</div>
        <div style="font-weight: 500;">{{ form.unit_name }}</div>
      </div>

      <div class="form-group" v-if="!form.id">
        <label class="form-label">Customer</label>
        <CustomSelect v-model="form.customer_id" :options="customerOptions" placeholder="-- Select Customer --" class="form-select" />
      </div>
      <div class="form-group" v-if="!form.id">
        <label class="form-label">Unit / Machine</label>
        <CustomSelect v-model="form.unit_id" :options="unitOptions" placeholder="-- Select Unit --" class="form-select" :disabled="!form.customer_id" />
      </div>
      <div class="form-group">
        <label class="form-label">Scheduled Date & Time</label>
        <input type="datetime-local" v-model="form.scheduled_date" class="form-input">
      </div>
      <div class="form-group">
        <label class="form-label">Instructions / Remarks</label>
        <textarea v-model="form.instructions" class="form-textarea" rows="3"></textarea>
      </div>
      <template #footer>
        <button type="button" class="btn btn-outline" @click="showModal = false">Cancel</button>
        <button type="button" class="btn btn-primary" :disabled="loading || (!form.id && (!form.customer_id || !form.unit_id))" @click="submitForm">
          {{ loading ? 'Saving...' : 'Save' }}
        </button>
      </template>
    </FormModal>
  </div>
</template>
