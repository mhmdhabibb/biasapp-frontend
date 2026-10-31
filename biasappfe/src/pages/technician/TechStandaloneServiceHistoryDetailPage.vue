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
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import { resources } from '@/services/resource.service'
import { printDeliveryServiceHistory } from '@/utils/printDeliveryHistory'
import { printServiceReport, type ReportType } from '@/utils/printReport'

const toast = useToast()
const { can } = usePermission()
const route = useRoute()
const router = useRouter()
const { currentUser } = useAuth()
const store = useMasterStore()

const id = String(route.params.id)
const localItem = ref<any>(null)
const item = computed(() => localItem.value || ((store.deliveryOrders?.value || []) as any[]).find((d: any) => String(d.id) === id))
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
    .map((p: any) => ({ value: p.id, label: `${p.name}${p.sku ? ` (SN: ${p.sku})` : ''}` }))
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
  photo_progress: '',
  photo_after: '',
})
const isInit = ref(false)
const isSaving = ref(false)
const fileInputBefore = ref<HTMLInputElement | null>(null)
const fileInputProgress = ref<HTMLInputElement | null>(null)
const fileInputAfter = ref<HTMLInputElement | null>(null)
const showCompleteConfirm = ref(false)
const showNewSHConfirm = ref(false)

function initForm(overrideData?: any) {
  const src = overrideData || item.value
  if (!src || (isInit.value && !overrideData)) return
  const now = new Date()
  const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  Object.assign(form, {
    problem: src.problem || '',
    action: src.action || '',
    time_in: src.time_in || nowHM,
    time_out: src.time_out || '',
    is_tested: !!src.is_tested,
    is_completed: !!src.is_completed,
    customer_signature: src.customer_signature || '',
    technician_signature: src.technician_signature || '',
    customer_name: src.customer_name || customer.value?.pic_name || '',
    technician_name: src.technician_name || currentUser.value?.name || '',
    photo_before: src.photo_before || '',
    photo_progress: src.photo_progress || '',
    photo_after: src.photo_after || '',
  })
  // time_in will be explicitly set when clicking Start Job

  isInit.value = true
}

function formatTimeWithDate(timeStr: string, dateStr: string) {
  if (!timeStr) return '';
  if (!dateStr) return timeStr;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return timeStr;
    const formattedDate = d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
    return `${formattedDate}, ${timeStr}`;
  } catch {
    return timeStr;
  }
}

// Aturan: 1 form Stand Alone = 1 produk. Tombol tambah hanya muncul bila
// belum ada item, dan Selesaikan mensyaratkan minimal 1 item.
const hasItem = computed(() => ((item.value as any)?.delivery_order_items || []).length > 0)

const isCompleted = computed(() =>
  !!(form.action || '').trim() && !!form.customer_signature && !!form.technician_signature && !!(form.customer_name || '').trim() && !!form.photo_before && hasItem.value,
)

function handlePhotoFile(e: Event, type: 'before' | 'progress' | 'after') {
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
      else if (type === 'progress') form.photo_progress = compressed
      else form.photo_after = compressed
    }
    img.src = ev.target?.result as string
  }
  reader.readAsDataURL(file)
  input.value = ''
}

function clearPhoto(type: 'before' | 'progress' | 'after') {
  if (type === 'before') {
    form.photo_before = ''
    if (fileInputBefore.value) fileInputBefore.value.value = ''
  } else if (type === 'progress') {
    form.photo_progress = ''
    if (fileInputProgress.value) fileInputProgress.value.value = ''
  } else {
    form.photo_after = ''
    if (fileInputAfter.value) fileInputAfter.value.value = ''
  }
}

// ── Items form state ──
const itemForm = reactive({
  kind: 'unit',
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
  { value: 'unit', label: 'Unit / Product (Pilih dari Database)' },
  { value: 'product', label: 'Consumable / Sparepart (Pilih dari Database)' },
  { value: 'external', label: 'Barang External (Input Manual)' },
]

function openItemModal() {
  Object.assign(itemForm, {
    kind: 'unit',
    unit_id: null,
    product_id: null,
    brand_id: null,
    unit_type_id: null,
    model: '',
    serial_no: '',
    warranty_status: '',
    warranty_expired_date: '',
    qty: 1,
    remarks: ''
  })
  showItemModal.value = true
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
      const serialUpper = (itemForm.serial_no || '').trim().toUpperCase()
      let existing = ((store.units.value ?? []) as any[]).find(
        (u: any) => String(u.serial_no || '').trim().toUpperCase() === serialUpper,
      )
      if (existing) {
        finalUnitId = existing.id
      } else {
        try {
          await resources.units.create({
            name: itemForm.model || 'Unit',
            brand_id: itemForm.brand_id,
            type_id: itemForm.unit_type_id,
            model: itemForm.model,
            serial_no: serialUpper,
            is_external: true,
            status: 'available',
          })
        } catch (createErr: any) {
          console.warn('Unit create notice (already exists or restored):', createErr)
        }
        await store.refreshOnly(['units'])
        const found = ((store.units.value ?? []) as any[]).find(
          (u: any) => String(u.serial_no || '').trim().toUpperCase() === serialUpper,
        )
        if (found) {
          finalUnitId = found.id
        } else {
          toast.error('Gagal menambahkan unit. Silakan coba lagi.')
          isSaving.value = false
          return
        }
      }
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

    // Auto-update project_name to format "Pengantaran [Nama Produk / Unit] ke [Alamat Penerima]"
    const createdItem = {
      unit_id: finalUnitId,
      product_id: itemForm.kind === 'product' ? itemForm.product_id : null,
      brand_id: itemForm.kind === 'external' ? itemForm.brand_id : null,
      unit_type_id: itemForm.kind === 'external' ? itemForm.unit_type_id : null,
      model: itemForm.kind === 'external' ? itemForm.model : '',
      serial_no: itemForm.kind === 'external' ? (itemForm.serial_no || '').toUpperCase() : '',
    }
    const label = itemLabel(createdItem)
    const curProjectName = String(item.value?.project_name || '').trim()
    const address = item.value?.delivery_address || customer.value?.address || ''
    if (!curProjectName || curProjectName === '-' || curProjectName === 'Pengantaran Unit' || curProjectName.startsWith('Pengantaran Unit ke') || curProjectName.toLowerCase().includes('service laptop')) {
      const newProjectName = address ? `Pengantaran ${label} ke ${address}` : `Pengantaran ${label}`
      await resources.deliveryOrders.update(id, { project_name: newProjectName })
    }

    await store.refreshOnly(['deliveryOrders'])
    try {
      const res: any = await api.get(`/delivery-orders/${id}`)
      const full = res.data?.data ?? res.data
      if (full) {
        localItem.value = full
      }
    } catch {}
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
    try {
      const res: any = await api.get(`/delivery-orders/${id}`)
      const full = res.data?.data ?? res.data
      if (full) {
        localItem.value = full
      }
    } catch {}
    toast.success('Item dihapus.')
  } catch (err: any) {
    toast.error(err?.message || 'Gagal menghapus item.')
  }
}

const isPending = computed(() => String((item.value as any)?.status || '').toLowerCase() === 'pending')
const isDraft = computed(() => String((item.value as any)?.status || '').toLowerCase() === 'draft')
const isInProgress = computed(() => String((item.value as any)?.status || '').toLowerCase() === 'in_progress')
const isDeliveredOrCompleted = computed(() => ['delivered', 'completed'].includes(String((item.value as any)?.status || '').toLowerCase()))

const myTechId = computed(() => (store as any).getTechnicianIdByUser?.(currentUser.value?.id || null))

const isTechnician = computed(() => {
  const r = String(currentUser.value?.role || '').trim().toLowerCase()
  return r === 'technician'
})
const isSuperadminOrAdmin = computed(() => {
  const r = String(currentUser.value?.role || '').trim().toLowerCase()
  return r === 'superadmin' || r === 'admin'
})

const isEditable = computed(() => {
  if (isDeliveredOrCompleted.value) return false
  const r = String(currentUser.value?.role || '').trim().toLowerCase()
  if (r === 'superadmin' || r === 'admin') return true
  if (r === 'technician') {
    const dTechId = item.value?.technician_id ? String(item.value.technician_id) : ''
    const tId = myTechId.value ? String(myTechId.value) : ''
    const uId = currentUser.value?.id ? String(currentUser.value.id) : ''
    if (dTechId) {
      return dTechId === tId || dTechId === uId
    }
    return true
  }
  return false
})

const canManageDo = computed(() => isEditable.value && (can('delivery_order:update') || isTechnician.value || isSuperadminOrAdmin.value))

async function startJob() {
  isSaving.value = true
  try {
    const now = new Date()
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    form.time_in = hm
    await api.patch(`/delivery-orders/${id}`, { status: 'in_progress', time_in: hm })
    await store.refreshOnly(['deliveryOrders'])
    toast.success('Pekerjaan dimulai (Time In dicatat).')
  } catch (err: any) {
    toast.error(err?.message || 'Gagal memulai pekerjaan.')
  } finally {
    isSaving.value = false
  }
}

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
    await api.patch(`/delivery-orders/${id}`, { ...form, status: 'draft' })
    await store.refreshOnly(['deliveryOrders'])
    try {
      const res: any = await api.get(`/delivery-orders/${id}`)
      const full = res.data?.data ?? res.data
      if (full) {
        localItem.value = full
        initFormRefresh(full)
      } else {
        initFormRefresh()
      }
    } catch {
      initFormRefresh()
    }
    toast.success('Product detail tersimpan sebagai draft.')
  } catch (err: any) {
    toast.error(err?.message || 'Gagal menyimpan.')
  } finally {
    isSaving.value = false
  }
}

function initFormRefresh(overrideData?: any) {
  isInit.value = false
  initForm(overrideData)
}

function confirmCompleteForm() {
  if (!isCompleted.value) {
    toast.warning('Lengkapi dulu: 1 produk + action + tanda tangan + foto awal.')
    return
  }
  showCompleteConfirm.value = true
}

async function executeCompleteForm() {
  showCompleteConfirm.value = false
  isSaving.value = true
  try {
    const now = new Date()
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    form.time_out = form.time_out || hm
    await api.patch(`/delivery-orders/${id}`, { ...form, status: 'completed' })
    
    // Create follow-up job if unit is not fixed
    if (!form.is_completed) {
      const doRes: any = await api.get(`/delivery-orders/${id}`)
      const doData = doRes.data?.data ?? doRes.data
      const newDo: any = await resources.deliveryOrders.create({
        do_type: 'service',
        status: 'pending',
        customer_id: item.value.customer_id,
        customer_category: item.value.customer_category,
        project_name: item.value.project_name || '',
        delivery_address: item.value.delivery_address,
        recipient_name: item.value.recipient_name,
        recipient_phone: item.value.recipient_phone,
        delivery_date: new Date().toISOString(),
        technician_id: item.value.technician_id,
        notes: `Lanjutan dari perbaikan ${item.value.do_number || ''}`,
      })
      
      const newDoId = (newDo as any).data?.data?.id || (newDo as any).data?.id
      if (newDoId && doData?.delivery_order_items && doData.delivery_order_items.length > 0) {
        for (const doi of doData.delivery_order_items) {
           await resources.deliveryOrderItems.create({
             delivery_order_id: newDoId,
             unit_id: doi.unit_id,
             product_id: doi.product_id,
             brand_id: doi.brand_id,
             unit_type_id: doi.unit_type_id,
             model: doi.model,
             serial_no: doi.serial_no,
             warranty_status: doi.warranty_status,
             warranty_expired_date: doi.warranty_expired_date,
             qty: doi.qty,
             remarks: doi.remarks
           })
        }
      }
      toast.success('Kunjungan selesai & Job Follow Up otomatis dibuat.')
    } else {
      toast.success('Service history selesai.')
    }
    
    await store.refreshOnly(['deliveryOrders'])
    try {
      const res: any = await api.get(`/delivery-orders/${id}`)
      const full = res.data?.data ?? res.data
      if (full) {
        localItem.value = full
      }
    } catch {}
    
    showNewSHConfirm.value = true
  } catch (err: any) {
    toast.error(err?.message || 'Gagal menyelesaikan.')
    isSaving.value = false
  }
}

async function executeNewSH() {
  showNewSHConfirm.value = false
  isSaving.value = true
  try {
    const newTimeIn = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`
    // Warisi Project Name dari CS (lewati '-' peninggalan data lama).
    const pickName = (...vals: any[]) => vals.map((v) => String(v || '').trim()).find((v) => v && v !== '-') || ''
    const newDo: any = await resources.deliveryOrders.create({
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
    const newDoId = (newDo as any).data?.data?.id || (newDo as any).data?.id
    toast.success('Service History baru dibuat.')
    await store.refreshOnly(['deliveryOrders'])
    if (newDoId) {
      router.push(`/technician/standalone-service-history/${newDoId}`)
    } else {
      router.push('/technician/standalone-service-history')
    }
  } catch (err: any) {
    toast.error(err?.message || 'Gagal membuat SH baru.')
  } finally {
    isSaving.value = false
  }
}

function declineNewSH() {
  showNewSHConfirm.value = false
  isSaving.value = false
  router.push('/technician/standalone-service-history')
}

const printModalOpen = ref(false)
const printType = ref<ReportType | 'all'>('all')
const printTypeOptions = [
  { value: 'all', label: 'Semua Form (Lengkap)' },
  { value: 'technical', label: 'Technical Report Form' },
  { value: 'history', label: 'Service History Form' },
  { value: 'copier', label: 'Copier Service Report' },
]

function handlePrint() {
  if (item.value) {
    printType.value = 'all'
    printModalOpen.value = true
  }
}

async function handleConfirmPrint() {
  if (item.value) {
    let printItem = item.value
    if (!printItem.customer_signature || !printItem.technician_signature) {
      try {
        const res: any = await api.get(`/delivery-orders/${id}`)
        printItem = res.data?.data ?? res.data ?? item.value
      } catch (e) {
        console.warn('Failed to fetch full DO details for printing:', e)
      }
    }
    printServiceReport(printItem, printType.value === 'all' ? undefined : (printType.value as ReportType))
  }
  printModalOpen.value = false
}

onMounted(async () => {
  await store.refreshOnly(['deliveryOrders', 'technicians', 'customers'])
  try {
    const res: any = await api.get(`/delivery-orders/${id}`)
    const full = res.data?.data ?? res.data
    if (full) {
      localItem.value = full
      initForm(full)
    } else {
      initForm()
    }
  } catch {
    initForm()
  }
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
        <div class="info-item"><span class="info-label">Customer</span><span class="info-value">{{ customer?.company_name || customer?.name || '-' }}</span></div>
        <div class="info-item"><span class="info-label">Tipe Customer</span><span class="info-value">{{ item.customer_category || customer?.category || '-' }}</span></div>
        <div class="info-item"><span class="info-label">Project Name</span><span class="info-value font-bold">{{ item.project_name || '-' }}</span></div>
        <div class="info-item"><span class="info-label">Alamat</span><span class="info-value">{{ item.delivery_address || customer?.address || '-' }}</span></div>
        <div class="info-item"><span class="info-label">PIC & Kontak</span><span class="info-value">{{ item.recipient_name || customer?.pic_name || '-' }} ({{ item.recipient_phone || customer?.phone || '-' }})</span></div>
        <div class="info-item"><span class="info-label">Tanggal</span><span class="info-value">{{ item.delivery_date ? new Date(item.delivery_date).toLocaleDateString('en-GB') : '-' }}</span></div>
        <div class="info-item"><span class="info-label">Teknisi Bertugas</span><span class="info-value font-bold">{{ store.findTechnician(item.technician_id)?.user?.name || store.findTechnician(item.technician_id)?.name || item.technician_name || '-' }}</span></div>
        <div v-if="item.notes" class="info-item"><span class="info-label">Catatan CS</span><span class="info-value">{{ item.notes }}</span></div>
      </div>
    </div>

    <div class="card p-lg">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 class="card-title mb-0">Product Detail <span class="badge badge-warning">diisi Teknisi</span></h2>
        <span class="badge" :class="isPending ? 'badge-warning' : isDraft ? 'badge-secondary' : isInProgress ? 'badge-info' : 'badge-success'" style="font-size: 14px; padding: 6px 12px;">
          Status: {{ (item.status || 'pending').toUpperCase().replace('_', ' ') }}
        </span>
      </div>

      <div v-if="isEditable && isPending" class="text-center py-xl">
        <p class="mb-lg text-muted">Mulai pekerjaan untuk mencatat waktu (Time In) dan mengisi form detail servis.</p>
        <button class="btn btn-primary" style="padding: var(--space-md) var(--space-xl); font-size: 16px;" :disabled="isSaving" @click="startJob">
          {{ isSaving ? 'Memproses...' : 'Mulai Pekerjaan (Start Job)' }}
        </button>
      </div>

      <template v-else>

      <div class="items-box mb-lg">
        <div class="items-head">
          <strong>Unit / Product ({{ (item.delivery_order_items || []).length }})</strong>
          <button v-if="canManageDo && !hasItem" class="btn btn-sm btn-outline" @click="openItemModal">+ Tambah Item</button>
          <span v-else-if="hasItem" class="text-sm text-muted">1 form = 1 produk</span>
        </div>
        <div v-if="(item.delivery_order_items || []).length" class="mt-sm">
          <div v-for="it in item.delivery_order_items" :key="it.id" class="item-row">
            <span>{{ itemLabel(it) }} <span class="text-muted">x{{ it.qty || 1 }}</span><span v-if="it.remarks" class="text-muted"> — {{ it.remarks }}</span></span>
            <button v-if="canManageDo" class="btn btn-sm btn-outline btn-danger" @click="removeItem(it.id)">Hapus</button>
          </div>
        </div>
        <p v-else class="text-sm text-muted mt-sm">Belum ada produk. Tambahkan 1 unit/mesin atau product yang dikerjakan.</p>
      </div>

      <div class="form-group">
        <label class="form-label">Problem</label>
        <textarea v-model="form.problem" class="form-textarea" rows="3" placeholder="Deskripsikan problem..." :disabled="!isEditable"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Action / Repair <span class="text-danger">*</span></label>
        <textarea v-model="form.action" class="form-textarea" rows="3" placeholder="Tindakan yang dilakukan..." :disabled="!isEditable"></textarea>
      </div>
      <div class="responsive-flex mb-md">
        <div class="form-group" style="flex: 1;">
          <label class="form-label">1. Foto Pengantaran / Problem <span class="text-danger">*</span></label>
          <div v-if="form.photo_before" class="photo-preview">
            <img :src="form.photo_before" alt="Foto Awal" />
            <button v-if="isEditable" type="button" class="btn btn-sm btn-outline btn-danger" @click="clearPhoto('before')">Hapus Foto</button>
          </div>
          <div v-else-if="isEditable" class="flex gap-sm mt-xs">
            <label class="btn btn-outline flex-1 cursor-pointer" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
              Ambil Foto
              <input type="file" accept="image/*" capture="environment" style="display: none;" @change="handlePhotoFile($event, 'before')" />
            </label>
            <label class="btn btn-outline flex-1 cursor-pointer" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.2 15c.7-1.2 1-2.5.7-3.9-.6-2-2.4-3.5-4.4-3.5h-1.2c-.7-3-3.2-5.2-6.2-5.6-3-.3-5.9 1.3-7.3 4-1.2 2.5-1 6.5.5 8.8m8.7-1.6V21"/><path d="M16 16l-4-4-4 4"/></svg>
              Pilih File
              <input type="file" accept="image/*" style="display: none;" @change="handlePhotoFile($event, 'before')" />
            </label>
          </div>
          <div v-else class="text-sm text-muted mt-xs">-</div>
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label">2. Foto Instal / Service</label>
          <div v-if="form.photo_progress" class="photo-preview">
            <img :src="form.photo_progress" alt="Foto Pengerjaan" />
            <button v-if="isEditable" type="button" class="btn btn-sm btn-outline btn-danger" @click="clearPhoto('progress')">Hapus Foto</button>
          </div>
          <div v-else-if="isEditable" class="flex gap-sm mt-xs">
            <label class="btn btn-outline flex-1 cursor-pointer" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
              Ambil Foto
              <input type="file" accept="image/*" capture="environment" style="display: none;" @change="handlePhotoFile($event, 'progress')" />
            </label>
            <label class="btn btn-outline flex-1 cursor-pointer" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.2 15c.7-1.2 1-2.5.7-3.9-.6-2-2.4-3.5-4.4-3.5h-1.2c-.7-3-3.2-5.2-6.2-5.6-3-.3-5.9 1.3-7.3 4-1.2 2.5-1 6.5.5 8.8m8.7-1.6V21"/><path d="M16 16l-4-4-4 4"/></svg>
              Pilih File
              <input type="file" accept="image/*" style="display: none;" @change="handlePhotoFile($event, 'progress')" />
            </label>
          </div>
          <div v-else class="text-sm text-muted mt-xs">-</div>
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label">3. Foto Selesai</label>
          <div v-if="form.photo_after" class="photo-preview">
            <img :src="form.photo_after" alt="Foto Akhir" />
            <button v-if="isEditable" type="button" class="btn btn-sm btn-outline btn-danger" @click="clearPhoto('after')">Hapus Foto</button>
          </div>
          <div v-else-if="isEditable" class="flex gap-sm mt-xs">
            <label class="btn btn-outline flex-1 cursor-pointer" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
              Ambil Foto
              <input type="file" accept="image/*" capture="environment" style="display: none;" @change="handlePhotoFile($event, 'after')" />
            </label>
            <label class="btn btn-outline flex-1 cursor-pointer" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.2 15c.7-1.2 1-2.5.7-3.9-.6-2-2.4-3.5-4.4-3.5h-1.2c-.7-3-3.2-5.2-6.2-5.6-3-.3-5.9 1.3-7.3 4-1.2 2.5-1 6.5.5 8.8m8.7-1.6V21"/><path d="M16 16l-4-4-4 4"/></svg>
              Pilih File
              <input type="file" accept="image/*" style="display: none;" @change="handlePhotoFile($event, 'after')" />
            </label>
          </div>
          <div v-else class="text-sm text-muted mt-xs">-</div>
        </div>
      </div>
      <div class="responsive-flex mb-md">
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Time In <span class="text-muted" style="font-weight: 400;">(otomatis saat form dibuat)</span></label>
          <input v-if="isTechnician || isEditable" v-model="form.time_in" type="time" class="form-input" readonly disabled />
          <input v-else :value="formatTimeWithDate(form.time_in, item?.created_at)" type="text" class="form-input" readonly disabled />
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Time Out <span class="text-muted" style="font-weight: 400;">(otomatis saat selesai)</span></label>
          <input v-if="isTechnician || isEditable" v-model="form.time_out" type="time" class="form-input" readonly disabled placeholder="Otomatis" />
          <input v-else :value="formatTimeWithDate(form.time_out, item?.updated_at)" type="text" class="form-input" readonly disabled />
        </div>
      </div>
      <div class="responsive-flex mb-md align-center">
        <label style="display: flex; align-items: center; gap: 0.5rem;" :style="{ opacity: isEditable ? 1 : 0.7, pointerEvents: isEditable ? 'auto' : 'none' }">
          <input type="checkbox" v-model="form.is_tested" :disabled="!isEditable" /> Is Tested?
        </label>
        <label style="display: flex; align-items: center; gap: 0.5rem;" :style="{ opacity: isEditable ? 1 : 0.7, pointerEvents: isEditable ? 'auto' : 'none' }">
          <input type="checkbox" v-model="form.is_completed" :disabled="!isEditable" /> Is Completed?
        </label>
      </div>
      <div class="responsive-flex mt-md">
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Technician Name</label>
          <input v-model="form.technician_name" type="text" class="form-input" readonly disabled />
          <label class="form-label mt-sm">Technician Signature <span v-if="isEditable" class="text-danger">*</span></label>
          <div :style="{ pointerEvents: isEditable ? 'auto' : 'none' }">
            <SignaturePad v-model="form.technician_signature" height="150px" />
          </div>
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Customer / PIC Name <span v-if="isEditable" class="text-danger">*</span></label>
          <input v-model="form.customer_name" type="text" class="form-input" placeholder="Nama PIC customer" :disabled="!isEditable" />
          <label class="form-label mt-sm">Customer Signature <span v-if="isEditable" class="text-danger">*</span></label>
          <div :style="{ pointerEvents: isEditable ? 'auto' : 'none' }">
            <SignaturePad v-model="form.customer_signature" height="150px" />
          </div>
        </div>
      </div>

      <div class="mt-lg responsive-flex">
        <button v-if="canManageDo" class="btn btn-outline" style="flex: 1;" :disabled="isSaving" @click="saveDraft">
          {{ isSaving ? 'Menyimpan...' : 'Simpan Draft' }}
        </button>
        <button class="btn btn-outline" style="flex: 1;" @click="handlePrint">Print</button>
        <button v-if="canManageDo" class="btn btn-primary" style="flex: 2;" :disabled="isSaving || !isCompleted" @click="confirmCompleteForm">
          {{ isSaving ? 'Menyimpan...' : (isCompleted ? '✅ Selesaikan' : '🔒 Lengkapi Form Dulu') }}
        </button>
      </div>
      <div v-if="isEditable && isPending" class="mt-md text-center">
        <button class="btn btn-sm btn-outline btn-danger" :disabled="isSaving" @click="removeForm">
          🗑️ Batalkan / Hapus Stand Alone ini
        </button>
      </div>
      </template>
    </div>

    <!-- Modal tambah item (v-if agar CustomSelect tidak di-mount saat tertutup) -->
    <FormModal v-if="showItemModal" :open="showItemModal" title="Tambah Unit / Product" @close="showItemModal = false" @submit="addItem" :is-loading="isSaving">
      <div class="form-group mt-3">
        <label class="form-label">Jenis Barang</label>
        <CustomSelect v-model="itemForm.kind" :options="kindOptions" />
      </div>

      <div v-if="itemForm.kind === 'unit'" class="form-group mt-3">
        <label class="form-label">Pilih Unit / Product <span class="text-danger">*</span></label>
        <CustomSelect v-model="itemForm.unit_id" :options="unitOptions" placeholder="-- Pilih Unit / Product --" />
      </div>
      <div v-else-if="itemForm.kind === 'product'" class="form-group mt-3">
        <label class="form-label">Pilih Consumable / Sparepart <span class="text-danger">*</span></label>
        <CustomSelect v-model="itemForm.product_id" :options="productOptions" placeholder="-- Pilih Consumable / Sparepart --" />
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

    <ConfirmDialog
      :open="showCompleteConfirm"
      title="Konfirmasi Selesai Kunjungan"
      :message="form.is_completed ? 'Unit sudah selesai diperbaiki. Anda yakin ingin menutup job ini?' : 'Unit BELUM selesai diperbaiki (Completed tidak dicentang). Sistem akan menutup kunjungan ini dan otomatis membuat job lanjutan (Follow Up) dengan status Pending. Lanjutkan?'"
      :variant="form.is_completed ? 'success' : 'warning'"
      :confirm-label="form.is_completed ? 'Ya, Selesaikan' : 'Ya, Lanjutkan'"
      cancel-label="Batal"
      @close="showCompleteConfirm = false"
      @confirm="executeCompleteForm"
    />
    <ConfirmDialog
      :open="showNewSHConfirm"
      title="Service history diselesaikan!"
      message="Apakah ada unit tambahan (Buat SH baru) di lokasi ini?"
      variant="success"
      confirm-label="Ya, Buat Baru"
      cancel-label="Tidak, Selesai"
      @close="declineNewSH"
      @confirm="executeNewSH"
    />

    <!-- Print Modal -->
    <FormModal :open="printModalOpen" title="Pilih Format Print" @close="printModalOpen = false" @submit="handleConfirmPrint">
      <div class="form-group">
        <label class="form-label">Tipe Format Report</label>
        <CustomSelect v-model="printType" :options="printTypeOptions" class="form-select" />
      </div>
      <template #footer>
        <button type="button" class="btn btn-outline" @click="printModalOpen = false">Batal</button>
        <button type="button" class="btn btn-primary" @click="handleConfirmPrint">Print / Download</button>
      </template>
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
