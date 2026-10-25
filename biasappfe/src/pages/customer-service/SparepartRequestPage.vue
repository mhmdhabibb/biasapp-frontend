<script setup lang="ts">
import { computed, reactive, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/ui/PageHeader.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import { useHardDelete } from '@/composables/useHardDelete'
import { useMasterStore } from '@/composables/useMasterStore'
import { resources } from '@/services/resource.service'
import { useToast } from '@/composables/useToast'
import type { TableColumn } from '@/types'

const toast = useToast()
const master = useMasterStore()
const route = useRoute()
const { ensureResourcesLoaded } = master

onMounted(() => {
  ensureResourcesLoaded(route.path)
})

const { sparepartRequests, serviceReports, products, findProduct, findServiceReport, findTechnician } = master

const hardDelete = useHardDelete(
  (id, cascade) => resources.serviceSpareparts.hardRemove(id, cascade),
  () => master.refreshInBackground(),
  'service_sparepart:delete',
)

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
const inputMode = ref<'db' | 'manual'>('db')
const editingRequest = ref<any>(null)
const form = reactive({
  service_report_id: '',
  product_id: '',
  item_name: '',
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
  editingRequest.value = null
  inputMode.value = 'db'
  Object.assign(form, defaultForm)
  showModal.value = true
}

function openEdit(row: any) {
  editingRequest.value = row
  inputMode.value = row.product_id ? 'db' : 'manual'
  Object.assign(form, {
    service_report_id: row.service_report_id || '',
    product_id: row.product_id || '',
    item_name: row.item_name || row.product?.name || '',
    qty: row.qty || 1,
  })
  showModal.value = true
}

async function handleDelete(row: any) {
  if (!confirm(`Hapus sparepart request ${row.request_no || ''}?`)) return
  try {
    await resources.serviceSpareparts.remove(row.id)
    await master.refreshInBackground()
    toast.success('Sparepart request berhasil dihapus')
  } catch (err: any) {
    toast.error(toast.fromError(err, 'Gagal menghapus sparepart request'))
  }
}

async function handleSubmit() {
  if (!form.service_report_id) {
    toast.warning('Select a service report first')
    return
  }
  let finalProductId: string | null = null
  let finalItemName = (form.item_name || '').trim()

  if (inputMode.value === 'db') {
    if (!form.product_id) {
      toast.warning('Select a sparepart from database')
      return
    }
    finalProductId = form.product_id
    const p = (products.value as any[]).find((x: any) => String(x.id) === String(finalProductId))
    if (p) finalItemName = p.name
  } else {
    if (!finalItemName) {
      toast.warning('Please enter sparepart name')
      return
    }
    finalProductId = null
  }

  if (form.qty < 1) {
    toast.warning('Quantity must be at least 1')
    return
  }

  saving.value = true
  try {
    const payload = {
      service_report_id: form.service_report_id,
      product_id: finalProductId,
      item_name: finalItemName,
      qty: Number(form.qty)
    }
    if (editingRequest.value) {
      await resources.serviceSpareparts.update(editingRequest.value.id, payload)
      toast.success('Sparepart request berhasil diperbarui')
    } else {
      await resources.serviceSpareparts.create(payload)
      toast.success('Sparepart request created')
    }
    await master.refreshInBackground()
    showModal.value = false
  } catch (err) {
    toast.error(toast.fromError(err, 'Failed to save sparepart request'))
  } finally {
    saving.value = false
  }
}

function getProduct(row: any) {
  if (row?.item_name) return row.item_name
  const id = row?.product_id ?? row
  return (
    (row as any)?.product?.name ||
    findProduct(id as any)?.name ||
    row?.item_name ||
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
    <DataTable
      :columns="columns"
      :data="sparepartRequests"
      permission="service_sparepart"
      :show-hard-delete="hardDelete.isSuperadmin"
      search-placeholder="Search requests..."
      @edit="openEdit"
      @delete="handleDelete"
      @hard-delete="hardDelete.open"
    >
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

    <HardDeleteDialog
      :open="hardDelete.show"
      title="Hapus Permanen Sparepart Request"
      :item-label="hardDelete.expected"
      :expected="hardDelete.expected"
      :confirm-valid="hardDelete.confirmed"
      :show-cascade-option="true"
      :cascade="hardDelete.cascade"
      @update:cascade="hardDelete.cascade = $event"
      @update:input="hardDelete.input = $event"
      @confirm="hardDelete.confirm"
      @close="hardDelete.close"
    />

    <FormModal
      :title="editingRequest ? `Edit Sparepart Request - ${editingRequest.request_no || ''}` : 'New Sparepart Request'"
      :open="showModal"
      :submit-label="editingRequest ? 'Simpan Perubahan' : 'Save'"
      @close="showModal = false"
      @submit="handleSubmit"
    >
      <div class="form-group">
        <label class="form-label" for="sr">Service Report</label>
        <CustomSelect id="sr" v-model="form.service_report_id" :options="serviceReportOptions" placeholder="Select service report" class="form-select" />
      </div>

      <div class="form-group">
        <label class="form-label">Metode Input Sparepart</label>
        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
          <button
            type="button"
            class="btn btn-sm"
            :class="inputMode === 'db' ? 'btn-primary' : 'btn-outline'"
            @click="inputMode = 'db'"
          >
            Tarik dari Database
          </button>
          <button
            type="button"
            class="btn btn-sm"
            :class="inputMode === 'manual' ? 'btn-primary' : 'btn-outline'"
            @click="inputMode = 'manual'"
          >
            Isi Sendiri (Manual)
          </button>
        </div>
      </div>

      <div v-if="inputMode === 'db'" class="form-group">
        <label class="form-label" for="sp">Pilih dari Database <span class="text-danger">*</span></label>
        <CustomSelect id="sp" v-model="form.product_id" :options="productOptions" placeholder="Select product" class="form-select" />
      </div>

      <div v-else class="form-group">
        <label class="form-label" for="sp_manual">Nama Sparepart (Manual) <span class="text-danger">*</span></label>
        <input id="sp_manual" v-model="form.item_name" type="text" class="form-input" placeholder="Ketik nama sparepart manual..." />
      </div>

      <div class="form-group">
        <label class="form-label" for="qty">Qty <span class="text-danger">*</span></label>
        <input id="qty" v-model.number="form.qty" type="number" min="1" class="form-input" />
      </div>
      <template #footer>
        <button class="btn btn-outline" @click="showModal = false">Cancel</button>
        <button class="btn btn-accent" :disabled="saving" @click="handleSubmit">
          {{ saving ? 'Saving...' : (editingRequest ? 'Simpan Perubahan' : 'Save') }}
        </button>
      </template>
    </FormModal>
  </div>
</template>
