<script setup lang="ts">
// @ts-nocheck
import PageHeader from '@/components/ui/PageHeader.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const toast = useToast()
const { can } = usePermission()

const route = useRoute()
const router = useRouter()
const { currentUser } = useAuth()
const {
  products,
  serviceReports,
  sparepartRequests,
  getTechnicianIdByUser, refreshInBackground } = useMasterStore()

const serviceId = String(route.query.service_id || '') || null
const showForm = ref(!!serviceId)

// service_report.technician_id references technicians.id, not users.id
const myTechId = computed(() => getTechnicianIdByUser(currentUser.value?.id || null))

const myActiveReports = computed(() =>
  serviceReports.value.filter(
    s => String(s.technician_id) === String(myTechId.value) && s.status !== 'completed'
  )
)

const myRequests = computed(() => 
  sparepartRequests.value.filter(r => String(r.technician_id) === String(myTechId.value))
)

// In a real app, products would be filtered to spareparts category
const availableSpareparts = computed(() => products.value)

const serviceReportOptions = computed(() =>
  myActiveReports.value.map((sr: any) => ({ value: sr.id, label: sr.report_no })),
)

const sparepartOptions = computed(() =>
  availableSpareparts.value.map((p: any) => ({ value: p.id, label: `${p.name} (Stock: ${p.stock})` })),
)

const form = ref({
  service_report_id: serviceId,
  product_id: null as any,
  qty: 1
})

function getProductName(id: any) {
  const p = products.value.find((x: any) => String(x.id) === String(id))
  return p ? p.name : 'Unknown Product'
}

function getServiceReportNo(id: any) {
  const s = serviceReports.value.find((x: any) => String(x.id) === String(id))
  return s ? s.report_no : '-'
}

async function submitRequest() {
  if (!form.value.service_report_id) return toast.warning('Select a job first!')
  if (!form.value.product_id) return toast.warning('Select a sparepart!')
  if (form.value.qty < 1) return toast.warning('Quantity must be at least 1!')

  if (confirm('Submit sparepart request?')) {
    try {
      await api.post('/service-spareparts/', {
        service_report_id: form.value.service_report_id,
        technician_id: myTechId.value,
        product_id: form.value.product_id,
        qty: Number(form.value.qty)
      })
      await refreshInBackground()
      toast.success('Sparepart request successfully sent to Admin/CS/Inventory.')
      
      // Reset form and return to list
      form.value.product_id = null
      form.value.qty = 1
      showForm.value = false
    } catch (err: any) {
      toast.error(err.message || 'Failed to send sparepart request')
    }
  }
}
</script>

<template>
  <div class="tech-sparepart">
    <PageHeader title="" :back-button="showForm" @back="showForm = false" />

    <div v-if="!showForm" class="card p-lg" style="max-width: 800px; margin: 0 auto;">
      <div class="flex items-center justify-between mb-md" style="display: flex; justify-content: space-between; align-items: center;">
        <h2 class="card-title m-0">My Requested Spareparts</h2>
        <button v-if="can('service_sparepart:create')" class="btn btn-primary btn-sm" @click="showForm = true">+ New Request</button>
      </div>

      <div v-if="!myRequests.length" class="text-center text-muted py-lg">
        You haven't requested any spareparts yet.
      </div>
      
      <div v-else class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Service No</th>
              <th>Sparepart</th>
              <th>Qty</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="req in myRequests" :key="req.id">
              <td>{{ new Date(req.created_at || '').toLocaleDateString() }}</td>
              <td>{{ getServiceReportNo(req.service_report_id) }}</td>
              <td>{{ getProductName(req.product_id) }}</td>
              <td>{{ req.qty }}</td>
              <td>
                <span class="badge" :class="req.status === 'approved' ? 'badge-success' : req.status === 'rejected' ? 'badge-danger' : 'badge-warning'">
                  {{ req.status || 'pending' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else class="card p-lg" style="max-width: 600px; margin: 0 auto;">
      <h2 class="card-title mb-md">Sparepart Request Form</h2>

      <div class="form-group">
        <label class="form-label">Related Job (Service No)</label>
        <CustomSelect v-model="form.service_report_id" class="form-select" :options="serviceReportOptions" placeholder="-- Select Service Report --" />
      </div>

      <div class="form-group">
        <label class="form-label">Sparepart <span class="text-danger">*</span></label>
        <CustomSelect v-model="form.product_id" class="form-select" :options="sparepartOptions" placeholder="-- Select Sparepart --" />
      </div>

      <div class="form-group">
        <label class="form-label">Quantity <span class="text-danger">*</span></label>
        <input v-model.number="form.qty" type="number" min="1" class="form-input">
      </div>

      <div class="mt-lg pt-md flex gap-sm" style="border-top: 1px solid var(--color-border-light); display: flex; gap: 8px;">
        <button class="btn btn-outline w-full" style="padding: var(--space-md); flex: 1;" @click="showForm = false">Cancel</button>
        <button v-if="can('service_sparepart:create')" class="btn btn-primary w-full" style="padding: var(--space-md); font-size: 16px; flex: 2;" @click="submitRequest">
          Submit Request
        </button>
      </div>
    </div>
  </div>
</template>

