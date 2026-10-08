<script setup lang="ts">
// @ts-nocheck
// Standalone Service History — detail teknisi.
// CUSTOMER DETAIL: read-only (diisi CS).
// PRODUCT DETAIL: diisi teknisi (unit/product, problem, action, tested/completed, time, signatures).
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/ui/PageHeader.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import SignaturePad from '@/components/ui/SignaturePad.vue'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { useResourcesStore } from '@/stores/resources.store'
import { api } from '@/services/api'
import { printDeliveryServiceHistory } from '@/utils/printDeliveryHistory'

const toast = useToast()
const { can } = usePermission()
const route = useRoute()
const router = useRouter()
const { currentUser } = useAuth()
const store = useMasterStore()
const resources = useResourcesStore()

const id = String(route.params.id)
const item = computed(() => (store.deliveryOrders.value as any[]).find((d: any) => String(d.id) === id))
const customer = computed(() => (item.value ? store.findCustomer(item.value.customer_id) : null))

const unitOptions = computed(() =>
  (store.units.value as any[]).map((u: any) => ({
    value: u.id,
    label: `${u.model || 'Unit'}${u.serial_no ? ` (${u.serial_no})` : ''}`,
  })),
)
const productOptions = computed(() =>
  (store.products.value as any[]).map((p: any) => ({ value: p.id, label: p.name })),
)

const form = reactive({
  problem: '',
  action: '',
  time_in: '',
  time_out: '',
  is_tested: false,
  is_completed: false,
  customer_signature: '',
  technician_signature: '',
  customer_name: '',
  technician_name: '',
})
const isInit = ref(false)
const isSaving = ref(false)

function initForm() {
  if (!item.value || isInit.value) return
  Object.assign(form, {
    problem: item.value.problem || '',
    action: item.value.action || '',
    time_in: item.value.time_in || '',
    time_out: item.value.time_out || '',
    is_tested: !!item.value.is_tested,
    is_completed: !!item.value.is_completed,
    customer_signature: item.value.customer_signature || '',
    technician_signature: item.value.technician_signature || '',
    customer_name: item.value.customer_name || customer.value?.pic_name || '',
    technician_name: item.value.technician_name || currentUser.value?.name || '',
  })
  isInit.value = true
}

const isCompleted = computed(() =>
  !!(form.action || '').trim() && form.is_tested && form.is_completed && !!form.customer_signature && !!form.technician_signature && !!(form.customer_name || '').trim(),
)

// ── Items (product detail) ──
const showItemModal = ref(false)
const itemForm = reactive({ kind: 'unit', unit_id: null as any, product_id: null as any, qty: 1, remarks: '' })
const kindOptions = [
  { value: 'unit', label: 'Unit / Mesin' },
  { value: 'product', label: 'Product / Sparepart' },
]

function itemLabel(it: any): string {
  if (it.unit_id) {
    const u: any = store.findUnit(it.unit_id)
    return u ? `${u.model || 'Unit'}${u.serial_no ? ` (${u.serial_no})` : ''}` : 'Unit'
  }
  if (it.product_id) {
    const p: any = store.findProduct(it.product_id)
    return p?.name || 'Product'
  }
  return '-'
}

async function addItem() {
  if (itemForm.kind === 'unit' && !itemForm.unit_id) {
    toast.warning('Pilih unit dulu.')
    return
  }
  if (itemForm.kind === 'product' && !itemForm.product_id) {
    toast.warning('Pilih product dulu.')
    return
  }
  isSaving.value = true
  try {
    await resources.create('deliveryOrderItems', {
      delivery_order_id: id,
      unit_id: itemForm.kind === 'unit' ? itemForm.unit_id : null,
      product_id: itemForm.kind === 'product' ? itemForm.product_id : null,
      qty: itemForm.qty || 1,
      remarks: itemForm.remarks || '',
    })
    await store.refreshInBackground()
    showItemModal.value = false
    Object.assign(itemForm, { kind: 'unit', unit_id: null, product_id: null, qty: 1, remarks: '' })
    toast.success('Item produk ditambahkan.')
  } catch (err: any) {
    toast.error(err?.message || 'Gagal menambah item.')
  } finally {
    isSaving.value = false
  }
}

async function removeItem(itemId: string) {
  if (!confirm('Hapus item ini?')) return
  try {
    await resources.remove('deliveryOrderItems', String(itemId))
    await store.refreshInBackground()
    toast.success('Item dihapus.')
  } catch (err: any) {
    toast.error(err?.message || 'Gagal menghapus item.')
  }
}

async function saveDraft() {
  isSaving.value = true
  try {
    await api.patch(`/delivery-orders/${id}`, { ...form })
    await store.refreshInBackground()
    initFormRefresh()
    toast.success('Product detail tersimpan (draft).')
  } catch (err: any) {
    toast.error(err?.message || 'Gagal menyimpan.')
  } finally {
    isSaving.value = false
  }
}

function initFormRefresh() {
  isInit.value = false
  initForm()
}

async function completeForm() {
  if (!isCompleted.value) {
    toast.warning('Lengkapi dulu: action, tested, completed + tanda tangan.')
    return
  }
  if (!confirm('Selesaikan service history ini? Time out akan dicatat otomatis.')) return
  isSaving.value = true
  try {
    const now = new Date()
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    form.time_out = form.time_out || hm
    await api.patch(`/delivery-orders/${id}`, { ...form, status: 'delivered' })
    await store.refreshInBackground()
    toast.success('Service history selesai.')
    router.push('/technician/standalone-service-history')
  } catch (err: any) {
    toast.error(err?.message || 'Gagal menyelesaikan.')
  } finally {
    isSaving.value = false
  }
}

function handlePrint() {
  if (item.value) printDeliveryServiceHistory(item.value)
}

onMounted(async () => {
  await store.refreshInBackground()
  initForm()
})
</script>

<template>
  <div v-if="item">
    <PageHeader title="Isi Product Detail" :back-button="true" @back="router.back()" />

    <!-- CUSTOMER DETAIL (read-only, dari CS) -->
    <div class="card p-lg mb-lg">
      <h2 class="card-title mb-md">Customer Detail <span class="badge badge-info">diisi CS</span></h2>
      <div class="info-list">
        <div class="info-item"><span class="info-label">No. Service</span><span class="info-value font-bold">{{ item.do_number || '-' }}</span></div>
        <div class="info-item"><span class="info-label">Customer</span><span class="info-value">{{ customer?.company_name || customer?.name || '-' }}</span></div>
        <div class="info-item"><span class="info-label">Tipe Customer</span><span class="info-value">{{ item.customer_category || customer?.category || '-' }}</span></div>
        <div class="info-item"><span class="info-label">Alamat</span><span class="info-value">{{ item.delivery_address || customer?.address || '-' }}</span></div>
        <div class="info-item"><span class="info-label">PIC & Kontak</span><span class="info-value">{{ item.recipient_name || customer?.pic_name || '-' }} ({{ item.recipient_phone || customer?.phone || '-' }})</span></div>
        <div class="info-item"><span class="info-label">Tanggal</span><span class="info-value">{{ item.delivery_date ? new Date(item.delivery_date).toLocaleDateString('en-GB') : '-' }}</span></div>
        <div v-if="item.notes" class="info-item"><span class="info-label">Catatan CS</span><span class="info-value">{{ item.notes }}</span></div>
      </div>
    </div>

    <!-- PRODUCT DETAIL (diisi teknisi) -->
    <div class="card p-lg">
      <h2 class="card-title mb-md">Product Detail <span class="badge badge-warning">diisi Teknisi</span></h2>

      <div class="items-box mb-lg">
        <div class="items-head">
          <strong>Unit / Product ({{ (item.delivery_order_items || []).length }})</strong>
          <button v-if="can('delivery_order:update')" class="btn btn-sm btn-outline" @click="showItemModal = true">+ Tambah Item</button>
        </div>
        <div v-if="(item.delivery_order_items || []).length" class="mt-sm">
          <div v-for="it in item.delivery_order_items" :key="it.id" class="item-row">
            <span>{{ itemLabel(it) }} <span class="text-muted">x{{ it.qty || 1 }}</span><span v-if="it.remarks" class="text-muted"> — {{ it.remarks }}</span></span>
            <button v-if="can('delivery_order:update')" class="btn btn-sm btn-outline btn-danger" @click="removeItem(it.id)">Hapus</button>
          </div>
        </div>
        <p v-else class="text-sm text-muted mt-sm">Belum ada item. Tambahkan unit/mesin atau product yang dikerjakan.</p>
      </div>

      <div class="form-group">
        <label class="form-label">Problem</label>
        <textarea v-model="form.problem" class="form-textarea" rows="3" placeholder="Deskripsikan problem..."></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Action / Repair <span class="text-danger">*</span></label>
        <textarea v-model="form.action" class="form-textarea" rows="3" placeholder="Tindakan yang dilakukan..."></textarea>
      </div>
      <div class="responsive-flex mb-md">
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Time In</label>
          <input v-model="form.time_in" type="time" class="form-input" />
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Time Out (otomatis saat selesai)</label>
          <input v-model="form.time_out" type="time" class="form-input" placeholder="Otomatis" />
        </div>
      </div>
      <div class="responsive-flex mb-md align-center">
        <label style="display: flex; align-items: center; gap: 0.5rem;">
          <input type="checkbox" v-model="form.is_tested" /> Is Tested?
        </label>
        <label style="display: flex; align-items: center; gap: 0.5rem;">
          <input type="checkbox" v-model="form.is_completed" /> Is Completed?
        </label>
      </div>
      <div class="responsive-flex mt-md">
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Technician Name</label>
          <input v-model="form.technician_name" type="text" class="form-input" readonly disabled />
          <label class="form-label mt-sm">Technician Signature <span class="text-danger">*</span></label>
          <SignaturePad v-model="form.technician_signature" height="150px" />
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Customer / PIC Name <span class="text-danger">*</span></label>
          <input v-model="form.customer_name" type="text" class="form-input" placeholder="Nama PIC customer" />
          <label class="form-label mt-sm">Customer Signature <span class="text-danger">*</span></label>
          <SignaturePad v-model="form.customer_signature" height="150px" />
        </div>
      </div>

      <div class="mt-lg responsive-flex">
        <button v-if="can('delivery_order:update')" class="btn btn-outline" style="flex: 1;" :disabled="isSaving" @click="saveDraft">
          {{ isSaving ? 'Menyimpan...' : 'Simpan Draft' }}
        </button>
        <button class="btn btn-outline" style="flex: 1;" @click="handlePrint">Print</button>
        <button v-if="can('delivery_order:update')" class="btn btn-primary" style="flex: 2;" :disabled="isSaving || !isCompleted" @click="completeForm">
          {{ isSaving ? 'Menyimpan...' : (isCompleted ? '✅ Selesaikan' : '🔒 Lengkapi Form Dulu') }}
        </button>
      </div>
    </div>

    <!-- Modal tambah item -->
    <div v-if="showItemModal" class="modal-overlay" @click.self="showItemModal = false">
      <div class="modal-box">
        <h3 class="mb-md">Tambah Unit / Product</h3>
        <div class="form-group">
          <label class="form-label">Jenis</label>
          <CustomSelect v-model="itemForm.kind" :options="kindOptions" class="form-select" />
        </div>
        <div v-if="itemForm.kind === 'unit'" class="form-group">
          <label class="form-label">Unit / Mesin</label>
          <CustomSelect v-model="itemForm.unit_id" :options="unitOptions" placeholder="-- Pilih Unit --" class="form-select" />
        </div>
        <div v-else class="form-group">
          <label class="form-label">Product</label>
          <CustomSelect v-model="itemForm.product_id" :options="productOptions" placeholder="-- Pilih Product --" class="form-select" />
        </div>
        <div class="responsive-flex">
          <div class="form-group" style="flex: 1;">
            <label class="form-label">Qty</label>
            <input v-model.number="itemForm.qty" type="number" min="1" class="form-input" />
          </div>
          <div class="form-group" style="flex: 2;">
            <label class="form-label">Remarks</label>
            <input v-model="itemForm.remarks" type="text" class="form-input" placeholder="Opsional" />
          </div>
        </div>
        <div class="mt-lg responsive-flex">
          <button class="btn btn-outline" style="flex: 1;" @click="showItemModal = false">Batal</button>
          <button class="btn btn-primary" style="flex: 1;" :disabled="isSaving" @click="addItem">{{ isSaving ? 'Menyimpan...' : 'Tambah' }}</button>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="card p-lg text-center text-muted">
    Data tidak ditemukan. <button class="btn btn-sm btn-outline" @click="router.back()">Kembali</button>
  </div>
</template>

<style scoped>
.info-list { display: flex; flex-direction: column; gap: 12px; }
.info-item { display: flex; flex-direction: column; }
.info-label { font-size: 12px; color: var(--color-text-muted); margin-bottom: 2px; }
.info-value { font-size: 14px; color: var(--color-text); }
.font-bold { font-weight: 700; }
.items-box { background: var(--color-surface-sunken); border-radius: 12px; padding: 12px 14px; }
.items-head { display: flex; justify-content: space-between; align-items: center; }
.item-row { display: flex; justify-content: space-between; align-items: center; background: var(--color-surface, #fff); border: 1px solid var(--color-border-light); border-radius: 8px; padding: 8px 12px; margin-top: 8px; font-size: 13px; }
.text-muted { color: var(--color-text-muted); }
.text-sm { font-size: 13px; }
.mt-sm { margin-top: 8px; }
.responsive-flex { display: flex; gap: 1rem; }
.responsive-flex.align-center { align-items: center; }
@media (max-width: 768px) { .responsive-flex { flex-direction: column; } }
.modal-overlay { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; padding: 20px; }
.modal-box { background: var(--color-surface, #fff); border-radius: 16px; padding: 20px; width: 100%; max-width: 520px; }
.btn-danger { color: var(--color-danger, #dc2626); }
</style>
