<script setup lang="ts">
// @ts-nocheck
import PageHeader from '@/components/ui/PageHeader.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
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
  getTechnicianIdByUser,
  refreshInBackground,
  ensureResourcesLoaded,
} = useMasterStore()

const serviceId = String(route.query.service_id || '') || null
const showForm = ref(!!serviceId)

let techSparepartTimer: any = null

function silentRefresh() {
  if (document.visibilityState === 'visible') {
    void refreshInBackground()
  }
}

onMounted(() => {
  ensureResourcesLoaded(route.path)
  techSparepartTimer = setInterval(silentRefresh, 4000)
  window.addEventListener('focus', silentRefresh)
  window.addEventListener('bias:data-mutated', silentRefresh)
})

onUnmounted(() => {
  if (techSparepartTimer) clearInterval(techSparepartTimer)
  window.removeEventListener('focus', silentRefresh)
  window.removeEventListener('bias:data-mutated', silentRefresh)
})

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

const currentPage = ref(1)
const perPage = 10
const totalPages = computed(() => Math.max(1, Math.ceil(myRequests.value.length / perPage)))
const paginatedRequests = computed(() => {
  const start = (currentPage.value - 1) * perPage
  return myRequests.value.slice(start, start + perPage)
})

// In a real app, products would be filtered to spareparts category
const availableSpareparts = computed(() => products.value)

const serviceReportOptions = computed(() =>
  myActiveReports.value.map((sr: any) => ({ value: sr.id, label: sr.report_no })),
)

const sparepartOptions = computed(() => [
  ...availableSpareparts.value.map((p: any) => ({ value: p.id, label: `${p.name} (Stock: ${p.stock})` })),
  { value: '__manual__', label: '➕ Tidak ada di database? Ketik nama manual...' }
])

const inputMode = ref<'db' | 'manual'>('db')
const editingRequest = ref<any>(null)

const form = ref({
  service_report_id: serviceId,
  product_id: null as any,
  item_name: '',
  qty: 1
})

watch(() => form.value.product_id, (val) => {
  if (val === '__manual__') {
    form.value.product_id = null
    inputMode.value = 'manual'
  }
})

function openCreate() {
  editingRequest.value = null
  form.value = {
    service_report_id: serviceId || '',
    product_id: null,
    item_name: '',
    qty: 1
  }
  inputMode.value = 'db'
  showForm.value = true
}

function openEdit(req: any) {
  editingRequest.value = req
  inputMode.value = req.product_id ? 'db' : 'manual'
  form.value = {
    service_report_id: req.service_report_id || serviceId || '',
    product_id: req.product_id || null,
    item_name: req.item_name || req.product?.name || '',
    qty: req.qty || 1
  }
  showForm.value = true
}

async function deleteRequest(req: any) {
  if (!confirm(`Hapus sparepart request ini?`)) return
  try {
    await api.delete(`/service-spareparts/${req.id}`)
    await refreshInBackground()
    toast.success('Sparepart request berhasil dihapus')
  } catch (err: any) {
    toast.error(err.message || 'Gagal menghapus sparepart request')
  }
}

function getSparepartDisplayName(req: any) {
  if (req.item_name) return req.item_name
  const p = products.value.find((x: any) => String(x.id) === String(req.product_id))
  return p ? p.name : (req.product?.name || 'Sparepart')
}

function getServiceReportNo(id: any) {
  const s = serviceReports.value.find((x: any) => String(x.id) === String(id))
  return s ? s.report_no : '-'
}

async function submitRequest() {
  if (!form.value.service_report_id) return toast.warning('Select a job first!')
  
  let finalProductId = null
  let finalItemName = (form.value.item_name || '').trim()

  if (inputMode.value === 'db') {
    if (!form.value.product_id) return toast.warning('Select a sparepart from database!')
    finalProductId = form.value.product_id
    const p = products.value.find((x: any) => String(x.id) === String(finalProductId))
    if (p) finalItemName = p.name
  } else {
    if (!finalItemName) return toast.warning('Please enter sparepart name!')
    finalProductId = null
  }

  if (form.value.qty < 1) return toast.warning('Quantity must be at least 1!')

  const confirmMsg = editingRequest.value ? 'Simpan perubahan sparepart request?' : 'Submit sparepart request?'
  if (confirm(confirmMsg)) {
    try {
      const payload = {
        service_report_id: form.value.service_report_id,
        technician_id: myTechId.value,
        product_id: finalProductId,
        item_name: finalItemName,
        qty: Number(form.value.qty)
      }
      if (editingRequest.value) {
        await api.put(`/service-spareparts/${editingRequest.value.id}`, payload)
        toast.success('Sparepart request berhasil diubah.')
      } else {
        await api.post('/service-spareparts/', payload)
        toast.success('Sparepart request successfully sent to Admin/CS/Inventory.')
      }
      await refreshInBackground()
      
      // Reset form and return to list
      editingRequest.value = null
      form.value.product_id = null
      form.value.item_name = ''
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
        <button v-if="can('service_sparepart:create')" class="btn btn-primary btn-sm" @click="openCreate">+ New Request</button>
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
              <th style="width: 120px;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="req in paginatedRequests" :key="req.id">
              <td>{{ new Date(req.created_at || '').toLocaleDateString() }}</td>
              <td>{{ getServiceReportNo(req.service_report_id) }}</td>
              <td>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span>{{ getSparepartDisplayName(req) }}</span>
                  <span v-if="!req.product_id" class="badge" style="background: #e0f2fe; color: #0369a1; font-size: 10px; padding: 2px 5px; border-radius: 4px;">Manual</span>
                </div>
              </td>
              <td>{{ req.qty }}</td>
              <td>
                <span class="badge" :class="req.status === 'approved' ? 'badge-success' : req.status === 'rejected' ? 'badge-danger' : 'badge-warning'">
                  {{ req.status || 'pending' }}
                </span>
              </td>
              <td>
                <div style="display: flex; gap: 4px;">
                  <button
                    v-if="req.status === 'pending'"
                    type="button"
                    class="btn btn-xs btn-outline"
                    @click="openEdit(req)"
                  >
                    Edit
                  </button>
                  <button
                    v-if="req.status === 'pending'"
                    type="button"
                    class="btn btn-xs btn-outline"
                    style="color: var(--color-danger);"
                    @click="deleteRequest(req)"
                  >
                    Hapus
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="totalPages > 1" class="pagination" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-top: 1px solid var(--color-border-light);">
        <div class="pagination-info" style="font-size: 13px; color: var(--color-text-muted);">
          Menampilkan {{ (currentPage - 1) * perPage + 1 }}-{{ Math.min(currentPage * perPage, myRequests.length) }} dari {{ myRequests.length }} data
        </div>
        <div class="pagination-buttons" style="display: flex; gap: 6px;">
          <button class="btn btn-outline btn-sm" :disabled="currentPage === 1" @click="currentPage--">Prev</button>
          <button v-for="p in totalPages" :key="p" class="btn btn-sm" :class="p === currentPage ? 'btn-primary' : 'btn-outline'" @click="currentPage = p">{{ p }}</button>
          <button class="btn btn-outline btn-sm" :disabled="currentPage === totalPages" @click="currentPage++">Next</button>
        </div>
      </div>
    </div>

    <div v-else class="card p-lg" style="max-width: 600px; margin: 0 auto;">
      <h2 class="card-title mb-md">{{ editingRequest ? 'Edit Sparepart Request' : 'Sparepart Request Form' }}</h2>

      <div class="form-group">
        <label class="form-label">Related Job (Service No)</label>
        <CustomSelect v-model="form.service_report_id" class="form-select" :options="serviceReportOptions" placeholder="-- Select Service Report --" />
      </div>

      <div class="form-group">
        <label class="form-label font-bold">Metode Input Sparepart</label>
        <div style="display: flex; gap: 8px; margin-bottom: 10px;">
          <button
            type="button"
            class="btn btn-sm"
            :class="inputMode === 'db' ? 'btn-primary' : 'btn-outline'"
            @click="inputMode = 'db'"
            style="flex: 1;"
          >
            📦 Tarik dari Database
          </button>
          <button
            type="button"
            class="btn btn-sm"
            :class="inputMode === 'manual' ? 'btn-primary' : 'btn-outline'"
            @click="inputMode = 'manual'"
            style="flex: 1;"
          >
            ✍️ Input Manual (Tidak Ada di DB)
          </button>
        </div>
      </div>

      <div v-if="inputMode === 'db'" class="form-group">
        <label class="form-label">Pilih dari Database <span class="text-danger">*</span></label>
        <CustomSelect v-model="form.product_id" class="form-select" :options="sparepartOptions" placeholder="-- Select Sparepart --" />
        <div style="margin-top: 6px; font-size: 12px; color: var(--color-text-muted);">
          Sparepart tidak ada di dalam database?
          <button type="button" class="btn btn-link p-0" style="font-size: 12px; font-weight: 600; text-decoration: underline;" @click="inputMode = 'manual'">
            Klik di sini untuk mengisi field secara manual
          </button>
        </div>
      </div>

      <div v-else class="form-group">
        <label class="form-label">Nama Sparepart (Field Manual) <span class="text-danger">*</span></label>
        <input v-model="form.item_name" type="text" class="form-input" placeholder="Ketik nama sparepart / komponen yang dibutuhkan..." />
        <div style="margin-top: 6px; font-size: 12px; color: var(--color-text-muted);">
          Ingin memilih dari daftar database lagi?
          <button type="button" class="btn btn-link p-0" style="font-size: 12px; font-weight: 600; text-decoration: underline;" @click="inputMode = 'db'">
            Kembali ke pilihan database
          </button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Quantity <span class="text-danger">*</span></label>
        <input v-model.number="form.qty" type="number" min="1" class="form-input">
      </div>

      <div class="mt-lg pt-md flex gap-sm" style="border-top: 1px solid var(--color-border-light); display: flex; gap: 8px;">
        <button class="btn btn-outline w-full" style="padding: var(--space-md); flex: 1;" @click="showForm = false">Cancel</button>
        <button v-if="can('service_sparepart:create') || can('service_sparepart:update')" class="btn btn-primary w-full" style="padding: var(--space-md); font-size: 16px; flex: 2;" @click="submitRequest">
          {{ editingRequest ? 'Simpan Perubahan' : 'Submit Request' }}
        </button>
      </div>
    </div>
  </div>
</template>

