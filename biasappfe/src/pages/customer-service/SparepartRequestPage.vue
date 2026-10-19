<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useResourcesStore } from '@/stores/resources.store'
import { useToast } from '@/composables/useToast'
import type { TableColumn } from '@/types'

const toast = useToast()
const master = useMasterStore()
const resources = useResourcesStore()

const { sparepartRequests, serviceReports, products, findProduct, findServiceReport, findTechnician } = master

const columns: TableColumn[] = [
  { key: 'request_no', label: 'Request No' },
  { key: 'service_report_id', label: 'Service No' },
  { key: 'technician_id', label: 'Requested By' },
  { key: 'product_id', label: 'Sparepart' },
  { key: 'qty', label: 'Qty' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Date' },
]

const showModal = ref(false)
const saving = ref(false)
const form = reactive({
  service_report_id: '',
  product_id: '',
  qty: 1
})
const defaultForm = { ...form }

const serviceReportOptions = computed(() =>
  (serviceReports.value as any[]).map((sr: any) => ({
    value: sr.id,
    label: String(sr.report_no || sr.service_report_no || sr.id),
  })),
)

const productOptions = computed(() =>
  (products.value as any[]).map((p: any) => ({
    value: p.id,
    label: p.name,
  })),
)

function openAdd() {
  Object.assign(form, defaultForm)
  showModal.value = true
}

async function handleSubmit() {
  if (!form.service_report_id || !form.product_id || form.qty < 1) {
    toast.warning('Select a service report and sparepart, enter a qty of at least 1')
    return
  }
  saving.value = true
  try {
    await resources.create('serviceSpareparts', {
      service_report_id: form.service_report_id,
      product_id: form.product_id,
      qty: Number(form.qty)
    })
    await master.refreshInBackground()
    toast.success('Sparepart request created')
    showModal.value = false
  } catch (err) {
    toast.error(toast.fromError(err, 'Failed to create sparepart request'))
  } finally {
    saving.value = false
  }
}

function getProduct(row: any) {
  const id = row?.product_id ?? row
  return (
    (row as any)?.product?.name ||
    findProduct(id as any)?.name ||
    '-'
  )
}

function getSR(row: any) {
  const id = row?.service_report_id ?? row
  const sr = (row as any)?.service_report || findServiceReport(id as any)
  return sr ? sr.report_no || (sr as any).service_report_no || '-' : '-'
}

function techNameOf(tech: any): string {
  if (!tech) return ''
  return tech.user?.name || tech.user?.username || tech.name || ''
}

function getTechnician(row: any) {
  const direct =
    row?.technician ||
    (row?.technician_id ? findTechnician(row.technician_id as any) : null)
  const directName = techNameOf(direct)
  if (directName) return directName
  // Fallback: teknisi dari service report terkait.
  const srTechId = row?.service_report?.technician_id
  const srTech =
    row?.service_report?.technician ||
    (srTechId ? findTechnician(srTechId as any) : null)
  return techNameOf(srTech) || '-'
}
</script>

<template>
  <div>
    <PageHeader title="Sparepart Requests" button-label="New Request" permission="service_sparepart:create"
      @add="openAdd" />
    <DataTable :columns="columns" :data="sparepartRequests" permission="service_sparepart"
      search-placeholder="Search requests...">
      <template #cell-product_id="{ row }">{{ getProduct(row) }}</template>
      <template #cell-service_report_id="{ row }">{{ getSR(row) }}</template>
      <template #cell-technician_id="{ row }">{{ getTechnician(row) }}</template>
      <template #cell-status="{ value }">
        <span class="badge" :class="{
          'badge-success': value === 'po_created' || value === 'completed',
          'badge-danger': value === 'rejected',
          'badge-warning': value === 'pending' || !value
        }">
          {{ (value || 'pending').toUpperCase() }}
        </span>
      </template>
      <template #cell-created_at="{ value }">
        {{ new Date(value).toLocaleDateString() }}
      </template>
    </DataTable>

    <FormModal title="New Sparepart Request" :open="showModal" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label class="form-label" for="sr">Service Report</label>
        <CustomSelect id="sr" v-model="form.service_report_id" :options="serviceReportOptions" placeholder="Select service report" class="form-select" />
      </div>
      <div class="form-group">
        <label class="form-label" for="sp">Sparepart</label>
        <CustomSelect id="sp" v-model="form.product_id" :options="productOptions" placeholder="Select product" class="form-select" />
      </div>
      <div class="form-group">
        <label class="form-label" for="qty">Qty</label>
        <input id="qty" v-model.number="form.qty" type="number" min="1" class="form-input" />
      </div>
      <template #footer>
        <button class="btn btn-outline" @click="showModal = false">Cancel</button>
        <button class="btn btn-accent" :disabled="saving" @click="handleSubmit">
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
      </template>
    </FormModal>
  </div>
</template>
