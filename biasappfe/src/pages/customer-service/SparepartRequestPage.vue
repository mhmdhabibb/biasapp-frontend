<script setup lang="ts">
import { reactive, ref } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useResourcesStore } from '@/stores/resources.store'
import { useToast } from '@/composables/useToast'
import type { TableColumn } from '@/types'

const toast = useToast()
const master = useMasterStore()
const resources = useResourcesStore()

const { sparepartRequests, serviceReports, products, findProduct, findServiceReport } = master

const columns: TableColumn[] = [
  { key: 'request_no', label: 'Request No' },
  { key: 'service_report_id', label: 'Service No' },
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
    await master.refresh(true)
    toast.success('Sparepart request created')
    showModal.value = false
  } catch (err) {
    toast.error(toast.fromError(err, 'Failed to create sparepart request'))
  } finally {
    saving.value = false
  }
}

function getProduct(id: number | null) {
  const p = findProduct(id as any)
  return p ? p.name : '-'
}

function getSR(id: number | null) {
  const sr = findServiceReport(id as any)
  return sr ? sr.report_no || sr.service_report_no || '-' : '-'
}
</script>

<template>
  <div>
    <PageHeader title="Sparepart Requests" button-label="New Request" permission="service_sparepart:create"
      @add="openAdd" />
    <DataTable :columns="columns" :data="sparepartRequests" permission="service_sparepart"
      search-placeholder="Search requests...">
      <template #cell-product_id="{ value }">{{ getProduct(value) }}</template>
      <template #cell-service_report_id="{ value }">{{ getSR(value) }}</template>
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
        <select id="sr" v-model="form.service_report_id" class="form-select">
          <option value="" disabled>Select service report</option>
          <option v-for="sr in serviceReports" :key="sr.id" :value="sr.id">
            {{ sr.report_no || sr.service_report_no || sr.id }}
          </option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="sp">Sparepart</label>
        <select id="sp" v-model="form.product_id" class="form-select">
          <option value="" disabled>Select product</option>
          <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
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
