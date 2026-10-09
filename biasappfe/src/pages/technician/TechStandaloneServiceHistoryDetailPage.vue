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
import FormModal from '@/components/ui/FormModal.vue'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import { resources } from '@/services/resource.service'
import { printDeliveryServiceHistory } from '@/utils/printDeliveryHistory'

const toast = useToast()
const { can } = usePermission()
const route = useRoute()
const router = useRouter()
const { currentUser } = useAuth()
const store = useMasterStore()

const id = String(route.params.id)
const item = computed(() => (store.deliveryOrders.value as any[]).find((d: any) => String(d.id) === id))
const customer = computed(() => (item.value ? store.findCustomer(item.value.customer_id) : null))

// ── Items (product detail) ──
// Dideklarasikan di atas agar computed options bisa lazy (tidak dihitung saat modal tertutup).
const showItemModal = ref(false)

const unitOptions = computed(() => {
  if (!showItemModal.value) return []
  return ((store.units.value ?? []) as any[]).map((u: any) => ({
    value: u.id,
    label: `${u.model || 'Unit'}${u.serial_no ? ` (${u.serial_no})` : ''}`,
  }))
})
const productOptions = computed(() => {
  if (!showItemModal.value) return []
  return ((store.products.value ?? []) as any[])
    .filter((p: any) => p.is_sparepart)
    .map((p: any) => ({ value: p.id, label: p.name }))
})
const brandOptions = computed(() => {
  if (!showItemModal.value) return []
  return ((store.brands.value ?? []) as any[]).map((b: any) => ({ value: b.id, label: b.name }))
})
const unitTypeOptions = computed(() => {
  if (!showItemModal.value) return []
  return (((store as any).unitTypes?.value ?? []) as any[]).map((u: any) => ({ value: u.id, label: u.name }))
})
const warrantyOptions = [
  { value: 'Under warranty', label: 'Under warranty' },
  { value: 'Out of warranty', label: 'Out of warranty' },
]

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
  photo_before: '',
  photo_after: '',
})
const isInit = ref(false)
const isSaving = ref(false)
const fileInputBefore = ref<HTMLInputElement | null>(null)
const fileInputAfter = ref<HTMLInputElement | null>(null)

function initForm() {
  if (!item.value || isInit.value) return
  const now = new Date()
  const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  Object.assign(form, {
    problem: item.value.problem || '',
    action: item.value.action || '',
    time_in: item.value.time_in || nowHM,
    time_out: item.value.time_out || '',
    is_tested: !!item.value.is_tested,
    is_completed: !!item.value.is_completed,
    customer_signature: item.value.customer_signature || '',
    technician_signature: item.value.technician_signature || '',
    customer_name: item.value.customer_name || customer.value?.pic_name || '',
    technician_name: item.value.technician_name || currentUser.value?.name || '',
    photo_before: item.value.photo_before || '',
    photo_after: item.value.photo_after || '',
  })
  // Auto-save time_in if it was just generated
  if (!item.value.time_in && form.time_in) {
    api.patch(`/delivery-orders/${id}`, { time_in: form.time_in }).catch(() => {})
  }
  isInit.value = true
}

// Aturan: 1 form Stand Alone = 1 produk. Tombol tambah hanya muncul bila
// belum ada item, dan Selesaikan mensyaratkan minimal 1 item.
const hasItem = computed(() => ((item.value as any)?.delivery_order_items || []).length > 0)

const isCompleted = computed(() =>
  !!(form.action || '').trim() && form.is_tested && form.is_completed && !!form.customer_signature && !!form.technician_signature && !!(form.customer_name || '').trim() && !!form.photo_before && !!form.photo_after && hasItem.value,
)

function handlePhotoFile(e: Event, type: 'before' | 'after') {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    const img = new Image()
    img.onload = () => {
      let width = img.width
      let height = img.height
      const max = 1024
      if (width > height && width > max) {
        height = Math.round(height * (max / width))
        width = max
      } else if (height > max) {
        width = Math.round(width * (max / height))
        height = max
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')?.drawImage(img, 0, 0, width, height)
      const compressed = canvas.toDataURL('image/jpeg', 0.6)
      if (type === 'before') form.photo_before = compressed
      else form.photo_after = compressed
    }
    img.src = ev.target?.result as string
  }
  reader.readAsDataURL(file)
}

function clearPhoto(type: 'before' | 'after') {
  if (type === 'before') {
    form.photo_before = ''
    if (fileInputBefore.value) fileInputBefore.value.value = ''
  } else {
    form.photo_after = ''
    if (fileInputAfter.value) fileInputAfter.value.value = ''
  }
}

// ── Items form state ──
const itemForm = reactive({
  kind: 'external',
  unit_id: null as any,
  product_id: null as any,
  brand_id: null as any,
  unit_type_id: null as any,
  model: '',
  serial_no: '',
  warranty_status: '',
  warranty_expired_date: '',
  qty: 1,
  remarks: ''
})
const kindOptions = [
  { value: 'external', label: 'Barang External' },
  { value: 'unit', label: 'Unit / Mesin Internal' },
  { value: 'product', label: 'Product / Sparepart Internal' },
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
  if (it.brand_id || it.unit_type_id || it.model) {
    const b: any = store.findBrand(it.brand_id)
    const ut: any = (store as any).findUnitType?.(it.unit_type_id)
    const brandStr = b ? b.name : ''
    const typeStr = ut ? ut.name : ''
    return `${brandStr} ${typeStr} ${it.model || ''} ${it.serial_no ? `(SN: ${it.serial_no})` : ''}`.trim() || 'Barang External'
  }
  return '-'
}

async function addItem() {
  if (((item.value as any)?.delivery_order_items || []).length > 0) {
    toast.warning('1 form hanya untuk 1 produk.')
    showItemModal.value = false
    return
  }
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
    let finalUnitId = itemForm.kind === 'unit' ? itemForm.unit_id : null;
    
    if (itemForm.kind === 'external') {
      if (!itemForm.brand_id || !itemForm.unit_type_id || !itemForm.model || !itemForm.serial_no) {
        toast.warning('Lengkapi Brand, Tipe, Model, dan Serial No untuk unit external.');
        isSaving.value = false;
        return;
      }
      const serialUpper = (itemForm.serial_no || '').toUpperCase()
      await resources.units.create({
        name: itemForm.model || 'Unit',
        brand_id: itemForm.brand_id,
        type_id: itemForm.unit_type_id,
        model: itemForm.model,
        serial_no: serialUpper,
        is_external: true,
        status: 'available',
      });
      // Backend POST /units/ mengembalikan data: null, jadi resolve ID unit
      // yang baru dibuat lewat list (dicocokkan via serial number).
      await store.refreshOnly(['units'])
      const created = ((store.units.value ?? []) as any[]).find(
        (u: any) => String(u.serial_no || '').toUpperCase() === serialUpper,
      );
      if (!created) {
        toast.error('Unit berhasil dibuat tapi tidak ketemu di daftar. Coba lagi.');
        isSaving.value = false;
        return;
      }
      finalUnitId = created.id;
    }

    await resources.deliveryOrderItems.create({
      delivery_order_id: id,
      unit_id: finalUnitId,
      product_id: itemForm.kind === 'product' ? itemForm.product_id : null,
      brand_id: itemForm.kind === 'external' ? itemForm.brand_id : null,
      unit_type_id: itemForm.kind === 'external' ? itemForm.unit_type_id : null,
      model: itemForm.kind === 'external' ? itemForm.model : '',
      serial_no: itemForm.kind === 'external' ? (itemForm.serial_no || '').toUpperCase() : '',
      warranty_status: itemForm.kind === 'external' ? itemForm.warranty_status : '',
      warranty_expired_date: itemForm.kind === 'external' && itemForm.warranty_expired_date ? `${itemForm.warranty_expired_date}T00:00:00Z` : undefined,
      qty: itemForm.qty || 1,
      remarks: itemForm.remarks || '',
    })
    await store.refreshOnly(['deliveryOrders'])
    showItemModal.value = false
    Object.assign(itemForm, { kind: 'external', unit_id: null, product_id: null, brand_id: null, unit_type_id: null, model: '', serial_no: '', warranty_status: '', warranty_expired_date: '', qty: 1, remarks: '' })
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
    await resources.deliveryOrderItems.remove(String(itemId))
    await store.refreshOnly(['deliveryOrders'])
    toast.success('Item dihapus.')
  } catch (err: any) {
    toast.error(err?.message || 'Gagal menghapus item.')
  }
}

const isPending = computed(() => String((item.value as any)?.status || '').toLowerCase() === 'pending')

async function removeForm() {
  if (!isPending.value) return
  if (!confirm(`Hapus form stand alone ${(item.value as any)?.do_number || ''} yang masih pending?`)) return
  isSaving.value = true
  try {
    await resources.deliveryOrders.remove(id)
    await store.refreshOnly(['deliveryOrders'])
    toast.success('Form stand alone dihapus.')
    router.push('/technician/standalone-service-history')
  } catch (err: any) {
    toast.error(err?.message || 'Gagal menghapus form.')
  } finally {
    isSaving.value = false
  }
}

async function saveDraft() {
  isSaving.value = true
  try {
    await api.patch(`/delivery-orders/${id}`, { ...form })
    await store.refreshOnly(['deliveryOrders'])
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
    toast.warning('Lengkapi dulu: 1 produk + action, tested, completed + tanda tangan + foto awal & akhir.')
    return
  }
  if (!confirm('Selesaikan service history ini? Time out akan dicatat otomatis.')) return
  isSaving.value = true
  try {
    const now = new Date()
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    form.time_out = form.time_out || hm
    await api.patch(`/delivery-orders/${id}`, { ...form, status: 'delivered' })
    await store.refreshOnly(['deliveryOrders'])
    toast.success('Service history selesai.')
    
    if (confirm('Service history diselesaikan! Apakah ada unit tambahan (Buat SH baru) di lokasi ini?')) {
      const newTimeIn = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`
      // Warisi Project Name dari CS (lewati '-' peninggalan data lama).
      const pickName = (...vals: any[]) => vals.map((v) => String(v || '').trim()).find((v) => v && v !== '-') || ''
      const newDo = await resources.deliveryOrders.create({
          do_type: 'service',
          status: 'pending',
          customer_id: item.value.customer_id,
          customer_category: item.value.customer_category,
          project_name: pickName(item.value.project_name),
          delivery_address: item.value.delivery_address,
          recipient_name: item.value.recipient_name,
          recipient_phone: item.value.recipient_phone,
          delivery_date: item.value.delivery_date || new Date().toISOString(),
          technician_id: item.value.technician_id,
          notes: item.value.notes,
          time_in: newTimeIn,
      })
      toast.success('Service History baru dibuat.')
      await store.refreshOnly(['deliveryOrders'])
      router.push(`/technician/standalone-service-history/${(newDo as any).data.id}`)
    } else {
      router.push('/technician/standalone-service-history')
    }
  } catch (err: any) {
    toast.error(err?.message || 'Gagal menyelesaikan.')
  } finally {
    isSaving.value = false
  }
}

function handlePrint() {
  if (item.value) printDeliveryServiceHistory(item.value)
}

function openItemModal() {
  showItemModal.value = true
  // Preload dropdown master di background; tidak block modal muncul.
  // Kalau masih kosong (mis. user langsung klik), refresh silent.
  const needsUnits = ((store.units.value ?? []) as any[]).length === 0
  const needsProducts = ((store.products.value ?? []) as any[]).length === 0
  const needsBrands = ((store.brands.value ?? []) as any[]).length === 0
  const needsUnitTypes = (((store as any).unitTypes?.value ?? []) as any[]).length === 0
  const names: string[] = []
  if (needsUnits) names.push('units')
  if (needsProducts) names.push('products')
  if (needsBrands) names.push('brands')
  if (needsUnitTypes) names.push('unitTypes')
  if (names.length) void store.refreshOnly(names)
}

onMounted(async () => {
  await store.refreshOnly(['deliveryOrders'])
  initForm()
  // Preload dropdown modal di background agar saat klik langsung siap.
  void store.refreshOnly(['units', 'products', 'brands', 'unitTypes'])
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
        <div class="info-item"><span class="info-label">Project Name</span><span class="info-value font-bold">{{ item.project_name || '-' }}</span></div>
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
          <button v-if="can('delivery_order:update') && !hasItem" class="btn btn-sm btn-outline" @click="openItemModal">+ Tambah Item</button>
          <span v-else-if="hasItem" class="text-sm text-muted">1 form = 1 produk</span>
        </div>
        <div v-if="(item.delivery_order_items || []).length" class="mt-sm">
          <div v-for="it in item.delivery_order_items" :key="it.id" class="item-row">
            <span>{{ itemLabel(it) }} <span class="text-muted">x{{ it.qty || 1 }}</span><span v-if="it.remarks" class="text-muted"> — {{ it.remarks }}</span></span>
            <button v-if="can('delivery_order:update')" class="btn btn-sm btn-outline btn-danger" @click="removeItem(it.id)">Hapus</button>
          </div>
        </div>
        <p v-else class="text-sm text-muted mt-sm">Belum ada produk. Tambahkan 1 unit/mesin atau product yang dikerjakan.</p>
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
          <label class="form-label">Foto Awal (Sebelum Dikerjakan) <span class="text-danger">*</span></label>
          <input ref="fileInputBefore" type="file" accept="image/*" capture="environment" class="form-input" @change="handlePhotoFile($event, 'before')" />
          <div v-if="form.photo_before" class="photo-preview">
            <img :src="form.photo_before" alt="Foto Awal" />
            <button type="button" class="btn btn-sm btn-outline btn-danger" @click="clearPhoto('before')">Hapus</button>
          </div>
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Foto Akhir (Sesudah Dikerjakan) <span class="text-danger">*</span></label>
          <input ref="fileInputAfter" type="file" accept="image/*" capture="environment" class="form-input" @change="handlePhotoFile($event, 'after')" />
          <div v-if="form.photo_after" class="photo-preview">
            <img :src="form.photo_after" alt="Foto Akhir" />
            <button type="button" class="btn btn-sm btn-outline btn-danger" @click="clearPhoto('after')">Hapus</button>
          </div>
        </div>
      </div>
      <div class="responsive-flex mb-md">
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Time In <span class="text-muted" style="font-weight: 400;">(otomatis saat form dibuat)</span></label>
          <input v-model="form.time_in" type="time" class="form-input" readonly disabled />
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Time Out <span class="text-muted" style="font-weight: 400;">(otomatis saat selesai)</span></label>
          <input v-model="form.time_out" type="time" class="form-input" readonly disabled placeholder="Otomatis" />
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
      <div v-if="can('delivery_order:delete') && isPending" class="mt-md text-center">
        <button class="btn btn-sm btn-outline btn-danger" :disabled="isSaving" @click="removeForm">
          Hapus form ini (masih pending)
        </button>
      </div>
    </div>

    <!-- Modal tambah item (v-if agar CustomSelect tidak di-mount saat tertutup) -->
    <FormModal v-if="showItemModal" :open="showItemModal" title="Tambah Unit / Product" @close="showItemModal = false" @submit="addItem" :is-loading="isSaving">
      <div class="form-group mt-3">
        <label class="form-label">Jenis Barang</label>
        <CustomSelect v-model="itemForm.kind" :options="kindOptions" />
      </div>

      <div v-if="itemForm.kind === 'unit'" class="form-group mt-3">
        <label class="form-label">Pilih Unit / Mesin</label>
        <CustomSelect v-model="itemForm.unit_id" :options="unitOptions" placeholder="-- Pilih Unit --" />
      </div>
      <div v-else-if="itemForm.kind === 'product'" class="form-group mt-3">
        <label class="form-label">Pilih Product</label>
        <CustomSelect v-model="itemForm.product_id" :options="productOptions" placeholder="-- Pilih Product --" />
      </div>
      <template v-if="itemForm.kind === 'external'">
        <div class="form-row mt-3">
          <div class="form-group">
            <label class="form-label">Brand</label>
            <CustomSelect v-model="itemForm.brand_id" :options="brandOptions" placeholder="-- Brand --" />
          </div>
          <div class="form-group">
            <label class="form-label">Tipe Produk</label>
            <CustomSelect v-model="itemForm.unit_type_id" :options="unitTypeOptions" placeholder="-- Tipe Produk --" />
          </div>
        </div>
        <div class="form-row mt-3">
          <div class="form-group">
            <label class="form-label">Model/Type</label>
            <input v-model="itemForm.model" type="text" class="form-input" placeholder="Misal: GL65" />
          </div>
          <div class="form-group">
            <label class="form-label">Serial Number</label>
            <input v-model="itemForm.serial_no" type="text" class="form-input uppercase-input" placeholder="SN" autocapitalize="characters" autocomplete="off" spellcheck="false" @input="itemForm.serial_no = (itemForm.serial_no || '').toUpperCase()" />
          </div>
        </div>
        <div class="form-row mt-3">
          <div class="form-group">
            <label class="form-label">Warranty Status</label>
            <CustomSelect v-model="itemForm.warranty_status" :options="warrantyOptions" placeholder="Status" />
          </div>
          <div class="form-group">
            <label class="form-label">Warranty Expired Date</label>
            <input v-model="itemForm.warranty_expired_date" type="date" class="form-input" />
          </div>
        </div>
      </template>

      <div class="form-row mt-3 mb-3">
        <div class="form-group" style="flex: 0 0 100px;">
          <label class="form-label">Qty</label>
          <input v-model.number="itemForm.qty" type="number" min="1" class="form-input" />
        </div>
        <div class="form-group">
          <label class="form-label">Remarks (Opsional)</label>
          <input v-model="itemForm.remarks" type="text" class="form-input" placeholder="Keterangan tambahan" />
        </div>
      </div>
    </FormModal>
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
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.uppercase-input { text-transform: uppercase; }
.photo-preview { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.photo-preview img { max-width: 100%; max-height: 200px; border-radius: 8px; object-fit: contain; background: var(--color-surface-sunken); }
@media (max-width: 520px) { .form-row { grid-template-columns: 1fr; } }
.responsive-flex { display: flex; gap: 1rem; }
.responsive-flex.align-center { align-items: center; }
@media (max-width: 768px) { .responsive-flex { flex-direction: column; } }
.modal-overlay { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; padding: 20px; }
.modal-box { background: var(--color-surface, #fff); border-radius: 16px; padding: 20px; width: 100%; max-width: 520px; }
.btn-danger { color: var(--color-danger, #dc2626); }
</style>
