<script setup lang="ts">
// @ts-nocheck
// Standalone Service History — sisi CS.
// Tanpa Job Order / assign job. CS hanya mengisi CUSTOMER DETAIL.
// PRODUCT DETAIL diisi teknisi di halaman teknisi.
import { computed, reactive, ref } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { useResourcesStore } from '@/stores/resources.store'
import { hasDeliveryHistory, printDeliveryServiceHistory } from '@/utils/printDeliveryHistory'
import type { TableColumn } from '@/types'

const toast = useToast()
const { can } = usePermission()
const store = useMasterStore()
const resources = useResourcesStore()

const filterTechnician = ref<any>(null)

const filterTechnicianOptions = computed(() => [
  { value: null as any, label: 'Semua Teknisi' },
  { value: 'unassigned', label: 'Belum Ditunjuk / Tanpa Teknisi' },
  ...(store.technicians.value as any[]).map((t: any) => ({
    value: t.id,
    label: t.user?.name || t.name || `Teknisi ${t.id}`,
  })),
])

// Hanya DO mandiri bertipe service (bukan rental/sale/inbound, bukan yang ditempel job).
const standaloneList = computed(() => {
  let list = (store.deliveryOrders.value as any[]).filter(
    (d: any) => String(d.do_type || '').toLowerCase() === 'service',
  )
  if (filterTechnician.value) {
    if (filterTechnician.value === 'unassigned') {
      list = list.filter((d: any) => !d.technician_id)
    } else {
      list = list.filter((d: any) => String(d.technician_id) === String(filterTechnician.value))
    }
  }
  return list.sort((a: any, b: any) =>
    String(b.created_at || b.delivery_date || '').localeCompare(String(a.created_at || a.delivery_date || '')),
  )
})

const columns: TableColumn[] = [
  { key: 'do_number', label: 'No. Service' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'delivery_date', label: 'Tanggal' },
  { key: 'technician_id', label: 'Teknisi' },
  { key: 'status', label: 'Status' },
]

function customerName(id: any): string {
  const c: any = store.findCustomer(id)
  return c ? (c.company_name || c.name || '-') : '-'
}
function technicianName(id: any): string {
  const t: any = store.findTechnician(id)
  return t ? (t.user?.name || t.name || '-') : '- (belum ditunjuk)'
}
function productSummary(row: any): string {
  const items = row?.delivery_order_items || []
  if (!items.length) return 'Belum diisi teknisi'
  return items.map((it: any) => {
    if (it.unit_id) {
      const u: any = store.findUnit(it.unit_id)
      return u ? `${u.model || 'Unit'}${u.serial_no ? ` (${u.serial_no})` : ''}` : 'Unit'
    }
    if (it.product_id) {
      const p: any = store.findProduct(it.product_id)
      return p?.name || 'Product'
    }
    return 'Item'
  }).join(', ')
}

const customerOptions = computed(() =>
  (store.customers.value as any[]).map((c: any) => ({
    value: c.id,
    label: c.company_name || c.name || `Customer ${c.id}`,
  })),
)
const technicianOptions = computed(() => [
  { value: null as any, label: '-- Tanpa penunjukan langsung --' },
  ...(store.technicians.value as any[]).map((t: any) => ({
    value: t.id,
    label: t.user?.name || t.name || `Teknisi ${t.id}`,
  })),
])
const customerCategoryOptions = [
  { value: 'Corporate', label: 'Corporate' },
  { value: 'Government', label: 'Government' },
]

const showModal = ref(false)
const editingItem = ref<any>(null)
const showDelete = ref(false)
const deletingItem = ref<any>(null)
const isSaving = ref(false)

const form = reactive({
  customer_id: null as any,
  customer_category: 'Corporate' as string,
  project_name: '',
  delivery_address: '',
  recipient_name: '',
  recipient_phone: '',
  delivery_date: new Date().toISOString().slice(0, 10),
  technician_id: null as any,
  notes: '',
})

function resetForm() {
  Object.assign(form, {
    customer_id: null,
    customer_category: 'Corporate',
    project_name: '',
    delivery_address: '',
    recipient_name: '',
    recipient_phone: '',
    delivery_date: new Date().toISOString().slice(0, 10),
    technician_id: null,
    notes: '',
  })
}

function openAdd() {
  editingItem.value = null
  resetForm()
  showModal.value = true
}

function openEdit(row: any) {
  editingItem.value = row
  Object.assign(form, {
    customer_id: row.customer_id || null,
    customer_category: row.customer_category || row.customer?.category || 'Corporate',
    project_name: row.project_name || '',
    delivery_address: row.delivery_address || '',
    recipient_name: row.recipient_name || '',
    recipient_phone: row.recipient_phone || '',
    delivery_date: row.delivery_date ? String(row.delivery_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    technician_id: row.technician_id || null,
    notes: row.notes || '',
  })
  showModal.value = true
}

async function handleSubmit() {
  if (!form.customer_id) {
    toast.warning('Pilih customer dulu.')
    return
  }
  isSaving.value = true
  try {
    if (editingItem.value) {
      // CS hanya boleh ubah CUSTOMER DETAIL
      await resources.update('deliveryOrders', String(editingItem.value.id), {
        customer_id: form.customer_id,
        customer_category: form.customer_category,
        project_name: form.project_name,
        delivery_address: form.delivery_address,
        recipient_name: form.recipient_name,
        recipient_phone: form.recipient_phone,
        delivery_date: form.delivery_date ? `${form.delivery_date}T00:00:00Z` : undefined,
        technician_id: form.technician_id,
        notes: form.notes,
      })
      toast.success('Customer detail diperbarui.')
    } else {
      await resources.create('deliveryOrders', {
        do_type: 'service',
        status: 'pending',
        customer_id: form.customer_id,
        customer_category: form.customer_category,
        project_name: form.project_name,
        delivery_address: form.delivery_address,
        recipient_name: form.recipient_name,
        recipient_phone: form.recipient_phone,
        delivery_date: form.delivery_date ? `${form.delivery_date}T00:00:00Z` : new Date().toISOString(),
        technician_id: form.technician_id,
        notes: form.notes,
      })
      toast.success('Form service history baru dibuat. Product detail diisi teknisi.')
    }
    await store.refreshInBackground()
    showModal.value = false
  } catch (err: any) {
    toast.error(err?.message || 'Gagal menyimpan.')
  } finally {
    isSaving.value = false
  }
}

function openDelete(row: any) {
  deletingItem.value = row
  showDelete.value = true
}

const showDetailModal = ref(false)
const detailItem = ref<any>(null)

function openDetail(row: any) {
  detailItem.value = row
  showDetailModal.value = true
}
async function handleDelete() {
  if (!deletingItem.value) return
  try {
    await resources.remove('deliveryOrders', String(deletingItem.value.id))
    await store.refreshInBackground()
    toast.success('Data dihapus.')
  } catch (err: any) {
    toast.error(err?.message || 'Gagal menghapus.')
  } finally {
    showDelete.value = false
    deletingItem.value = null
  }
}

function handlePrint(row: any) {
  printDeliveryServiceHistory(row)
}
</script>

<template>
  <div>
    <PageHeader
      title="Service History Mandiri"
      button-label="Buat Form Baru"
      permission="delivery_order:create"
      @add="openAdd"
    />

    <div class="info-alert mb-4">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span>Form tersendiri <strong>tanpa assign job</strong>. CS mengisi <strong>Customer Detail</strong>, teknisi mengisi <strong>Product Detail</strong> di menu teknisi.</span>
    </div>

    <div class="filter-bar mb-4" style="display: flex; gap: 1rem; align-items: center; background: var(--color-surface, #fff); padding: 12px 16px; border-radius: 8px; border: 1px solid var(--color-border-light);">
      <div style="font-size: 13px; font-weight: 600;">Filter Teknisi:</div>
      <CustomSelect v-model="filterTechnician" :options="filterTechnicianOptions" class="form-select" style="max-width: 300px; flex: 1;" />
    </div>

    <DataTable :columns="columns" :data="standaloneList" search-placeholder="Cari no. service / customer...">
      <template #cell-customer_id="{ value, row }">
        <div class="font-medium">{{ customerName(value) }}</div>
        <div class="text-xs text-muted product-summary-link" @click="openDetail(row)" title="Klik untuk melihat detail pekerjaan">{{ productSummary(row) }}</div>
      </template>
      <template #cell-delivery_date="{ value }">
        {{ value ? new Date(value).toLocaleDateString('en-GB') : '-' }}
      </template>
      <template #cell-technician_id="{ value }">{{ technicianName(value) }}</template>
      <template #cell-status="{ value }">
        <span class="badge" :class="value === 'delivered' || value === 'completed' ? 'badge-success' : value === 'in_transit' ? 'badge-info' : 'badge-warning'">
          {{ String(value || '-').replace('_', ' ').toUpperCase() }}
        </span>
      </template>
      <template #actions="{ row }">
        <button v-if="can('delivery_order:read') && row.status !== 'pending' && hasDeliveryHistory(row)" class="btn btn-sm btn-outline" @click="handlePrint(row)">Print</button>
        <button v-if="can('delivery_order:delete')" class="btn btn-sm btn-outline btn-danger" style="margin-left: 0.5rem;" @click="openDelete(row)">Hapus</button>
      </template>
    </DataTable>

    <FormModal :open="showModal" :title="editingItem ? 'Edit Customer Detail' : 'Buat Service History Mandiri'" max-width="640px" @close="showModal = false" @submit="handleSubmit">
      <div class="section-title">Customer Detail — diisi CS</div>
      <div class="form-group">
        <label class="form-label">Customer <span class="text-danger">*</span></label>
        <CustomSelect v-model="form.customer_id" :options="customerOptions" placeholder="-- Pilih Customer --" class="form-select" />
      </div>
      <div class="form-group">
        <label class="form-label">Project Name</label>
        <input v-model="form.project_name" type="text" class="form-input" placeholder="Contoh: Service Laptop" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Tipe Customer</label>
          <CustomSelect v-model="form.customer_category" :options="customerCategoryOptions" class="form-select" />
        </div>
        <div class="form-group">
          <label class="form-label">Tanggal Kunjungan</label>
          <input v-model="form.delivery_date" type="date" class="form-input" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Alamat Instalasi / Kunjungan</label>
        <textarea v-model="form.delivery_address" class="form-textarea" rows="2" placeholder="Alamat lengkap customer..."></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Nama PIC / Penerima</label>
          <input v-model="form.recipient_name" type="text" class="form-input" placeholder="Nama PIC" />
        </div>
        <div class="form-group">
          <label class="form-label">No. HP PIC</label>
          <input v-model="form.recipient_phone" type="text" class="form-input" placeholder="08xx..." />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Teknisi (opsional, tanpa job order)</label>
        <CustomSelect v-model="form.technician_id" :options="technicianOptions" placeholder="-- Tanpa penunjukan langsung --" class="form-select" />
        <span class="form-hint">Boleh dikosongkan — semua teknisi tetap bisa melihat & mengisi product detail.</span>
      </div>
      <div class="form-group">
        <label class="form-label">Catatan / Keluhan Awal</label>
        <textarea v-model="form.notes" class="form-textarea" rows="2" placeholder="Keluhan dari customer..."></textarea>
      </div>
      <template #footer>
        <button type="button" class="btn btn-outline" @click="showModal = false">Batal</button>
        <button type="button" class="btn btn-primary" :disabled="isSaving" @click="handleSubmit">
          {{ isSaving ? 'Menyimpan...' : (editingItem ? 'Simpan Customer Detail' : 'Buat Form') }}
        </button>
      </template>
    </FormModal>

    <FormModal :open="showDelete" title="Hapus Service History" :message="`Hapus '${deletingItem?.do_number || ''}'?`" @close="showDelete = false" @confirm="handleDelete" />

    <FormModal :open="showDetailModal" title="Detail Pekerjaan Teknisi" max-width="500px" @close="showDetailModal = false">
      <div v-if="detailItem" class="detail-content">
        <div class="info-group">
          <label>Unit / Product:</label>
          <div style="font-weight: 500;">{{ productSummary(detailItem) }}</div>
        </div>
        <div class="info-group mt-sm">
          <label>Problem / Kendala:</label>
          <div class="box">{{ detailItem.problem || '-' }}</div>
        </div>
        <div class="info-group mt-sm">
          <label>Action / Repair:</label>
          <div class="box">{{ detailItem.action || '-' }}</div>
        </div>
        <div class="form-row mt-sm">
          <div class="info-group">
            <label>Time In:</label>
            <div style="font-weight: 500;">{{ detailItem.time_in || '-' }}</div>
          </div>
          <div class="info-group">
            <label>Time Out:</label>
            <div style="font-weight: 500;">{{ detailItem.time_out || '-' }}</div>
          </div>
        </div>
        <div class="form-row mt-sm">
          <div class="info-group">
            <label>Tested:</label>
            <div style="font-weight: 500;" :class="detailItem.is_tested ? 'text-success' : ''">{{ detailItem.is_tested ? 'YES' : 'NO' }}</div>
          </div>
          <div class="info-group">
            <label>Completed:</label>
            <div style="font-weight: 500;" :class="detailItem.is_completed ? 'text-success' : ''">{{ detailItem.is_completed ? 'YES' : 'NO' }}</div>
          </div>
        </div>
        <div v-if="detailItem.photo_before || detailItem.photo_after" class="form-row mt-sm">
          <div class="info-group">
            <label>Foto Awal:</label>
            <div v-if="detailItem.photo_before" class="photo-preview">
              <img :src="detailItem.photo_before" alt="Foto Awal" />
            </div>
            <div v-else class="text-muted text-xs">Tidak ada</div>
          </div>
          <div class="info-group">
            <label>Foto Akhir:</label>
            <div v-if="detailItem.photo_after" class="photo-preview">
              <img :src="detailItem.photo_after" alt="Foto Akhir" />
            </div>
            <div v-else class="text-muted text-xs">Tidak ada</div>
          </div>
        </div>
      </div>
      <template #footer>
        <button type="button" class="btn btn-outline" style="width: 100%;" @click="showDetailModal = false">Tutup</button>
      </template>
    </FormModal>
  </div>
</template>

<style scoped>
.section-title {
  background: var(--color-primary-surface, #eff6ff);
  color: var(--color-primary, #2563eb);
  font-weight: 700;
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 12px;
}
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.form-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-muted);
}
.info-alert {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 13px;
}
.mb-4 { margin-bottom: 16px; }
.font-medium { font-weight: 600; }
.text-xs { font-size: 12px; }
.text-muted { color: var(--color-text-muted); }
.btn-danger { color: var(--color-danger, #dc2626); }
@media (max-width: 640px) {
  .form-row { grid-template-columns: 1fr; }
}

.product-summary-link {
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 3px;
  transition: color 0.2s;
}
.product-summary-link:hover {
  color: var(--color-primary, #2563eb);
}
.info-group label {
  display: block;
  font-weight: 600;
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 4px;
}
.box {
  background: var(--color-surface-sunken, #f8fafc);
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  white-space: pre-wrap;
  border: 1px solid var(--color-border-light);
}
.mt-sm { margin-top: 16px; }
.text-success { color: #16a34a; }
.photo-preview img {
  max-width: 100%;
  max-height: 200px;
  border-radius: 8px;
  object-fit: contain;
  background: var(--color-surface-sunken, #f8fafc);
  border: 1px solid var(--color-border-light);
}
</style>
