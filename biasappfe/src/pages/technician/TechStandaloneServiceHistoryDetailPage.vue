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
import { isTechnicianAssignedToJob, getJobMemberTechIds, isLeadTechnicianForJob, isMemberTechnicianForJob } from '@/utils/jobTechnician'
import { normalizeRole } from '@/router/role-access'
import { formatDeliveryOrderItemLabel, getDeliveryOrderItemBadge, resolveDeliveryOrderItemKind } from '@/utils/deliveryOrderItems'

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
const MANUAL_BRAND_VALUE = '__manual__'
const brandOptionsWithManual = computed(() => [
  { value: '', label: '-- Tanpa Brand (Opsional) --' },
  { value: MANUAL_BRAND_VALUE, label: '✏️ Ketik Brand Manual (tidak ada di database)' },
  ...brandOptions.value,
])
const unitTypeOptions = computed(() => {
  if (!showItemModal.value) return []
  return (((store as any).unitTypes?.value ?? []) as any[]).map((u: any) => ({ value: u.id, label: u.name }))
})
const unitTypeOptionsWithOptional = computed(() => [
  { value: '', label: '-- Tanpa Tipe Produk (Opsional) --' },
  ...unitTypeOptions.value,
])
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
    time_in: src.time_in || (isPending.value ? '' : nowHM),
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

// Multi-item: teknisi bisa menambah banyak unit/produk per form Stand Alone.
// Selesaikan mensyaratkan minimal 1 item.
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
const editingItemId = ref<string | null>(null)
const editingItemOriginal = ref<any>(null)
const sessionAddedLabels = ref<string[]>([])

const itemForm = reactive({
  category: 'unit' as 'unit' | 'product',
  source: 'db' as 'db' | 'manual',
  unit_id: null as any,
  product_id: null as any,
  brand_id: '' as any,
  manual_brand: '',
  unit_type_id: '' as any,
  model: '',
  serial_no: '',
  warranty_status: '',
  warranty_expired_date: '',
  save_to_master: false,
  qty: 1,
  remarks: ''
})

const itemLookups = {
  findUnit: (uid: any) => store.findUnit(uid),
  findProduct: (pid: any) => store.findProduct(pid),
  findBrand: (bid: any) => store.findBrand(bid),
  findUnitType: (utid: any) => (store as any).findUnitType?.(utid),
}

const isModalLoading = ref(false)

async function ensureModalDropdownData() {
  const needsUnits = ((store.units.value ?? []) as any[]).length === 0
  const needsProducts = ((store.products.value ?? []) as any[]).length === 0
  const needsBrands = ((store.brands.value ?? []) as any[]).length === 0
  const needsUnitTypes = (((store as any).unitTypes?.value ?? []) as any[]).length === 0
  const names: string[] = []
  if (needsUnits) names.push('units')
  if (needsProducts) names.push('products')
  if (needsBrands) names.push('brands')
  if (needsUnitTypes) names.push('unitTypes')
  if (names.length) {
    isModalLoading.value = true
    try {
      await store.refreshOnly(names)
    } finally {
      isModalLoading.value = false
    }
  }
}

function resetItemEntryFields() {
  Object.assign(itemForm, {
    unit_id: null,
    product_id: null,
    brand_id: '',
    manual_brand: '',
    unit_type_id: '',
    model: '',
    serial_no: '',
    warranty_status: '',
    warranty_expired_date: '',
    save_to_master: false,
    qty: 1,
    remarks: ''
  })
}

function setItemCategory(cat: 'unit' | 'product') {
  if (itemForm.category === cat) return
  itemForm.category = cat
  itemForm.unit_id = null
  itemForm.product_id = null
  itemForm.unit_type_id = ''
  itemForm.save_to_master = false
  if (cat === 'product') {
    itemForm.warranty_status = ''
    itemForm.warranty_expired_date = ''
  }
}

function setItemSource(src: 'db' | 'manual') {
  if (itemForm.source === src) return
  itemForm.source = src
  if (src === 'manual') {
    itemForm.unit_id = null
    itemForm.product_id = null
  } else {
    itemForm.brand_id = ''
    itemForm.manual_brand = ''
    itemForm.unit_type_id = ''
    itemForm.model = ''
    itemForm.serial_no = ''
    itemForm.warranty_status = ''
    itemForm.warranty_expired_date = ''
    itemForm.save_to_master = false
  }
}

async function openItemModal() {
  editingItemId.value = null
  editingItemOriginal.value = null
  sessionAddedLabels.value = []
  itemForm.category = 'unit'
  itemForm.source = 'db'
  resetItemEntryFields()
  showItemModal.value = true
  await ensureModalDropdownData()
}

async function openEditItemModal(it: any) {
  editingItemId.value = String(it.id)
  editingItemOriginal.value = it
  sessionAddedLabels.value = []
  const kind = resolveDeliveryOrderItemKind(it)
  resetItemEntryFields()
  if (kind === 'unit') {
    itemForm.category = 'unit'
    itemForm.source = 'db'
    itemForm.unit_id = it.unit_id
  } else if (kind === 'product') {
    itemForm.category = 'product'
    itemForm.source = 'db'
    itemForm.product_id = it.product_id
  } else if (kind === 'product_manual') {
    itemForm.category = 'product'
    itemForm.source = 'manual'
    itemForm.brand_id = it.brand_id || ''
    itemForm.model = it.description || it.model || ''
    itemForm.serial_no = it.serial_no || ''
  } else {
    itemForm.category = 'unit'
    itemForm.source = 'manual'
    itemForm.brand_id = it.brand_id || ''
    itemForm.unit_type_id = it.unit_type_id || ''
    itemForm.model = it.model || ''
    itemForm.serial_no = it.serial_no || ''
    itemForm.warranty_status = it.warranty_status || ''
    itemForm.warranty_expired_date = it.warranty_expired_date ? String(it.warranty_expired_date).slice(0, 10) : ''
  }
  itemForm.qty = Number(it.qty) > 0 ? Number(it.qty) : 1
  itemForm.remarks = it.remarks || ''
  showItemModal.value = true
  await ensureModalDropdownData()
}

function itemLabel(it: any): string {
  return formatDeliveryOrderItemLabel(it, itemLookups)
}

function itemBadge(it: any) {
  return getDeliveryOrderItemBadge(it)
}

async function refreshCurrentDO() {
  try {
    const res: any = await api.get(`/delivery-orders/${id}`)
    const full = res.data?.data ?? res.data
    if (full) {
      localItem.value = full
    }
  } catch {}
  void store.refreshOnly(['deliveryOrders'])
}

async function addItem(keepOpen = false) {
  if (itemForm.category === 'unit' && itemForm.source === 'db' && !itemForm.unit_id) {
    toast.warning('Pilih unit dari database terlebih dahulu, atau gunakan tab Input Manual.')
    return
  }
  if (itemForm.category === 'product' && itemForm.source === 'db' && !itemForm.product_id) {
    toast.warning('Pilih produk dari database terlebih dahulu, atau gunakan tab Input Manual.')
    return
  }

  const trimmedModel = (itemForm.model || '').trim()
  if (itemForm.category === 'unit' && itemForm.source === 'manual' && !trimmedModel) {
    toast.warning('Isi Nama / Model Unit terlebih dahulu.')
    return
  }
  if (itemForm.category === 'product' && itemForm.source === 'manual' && !trimmedModel) {
    toast.warning('Isi Nama Produk / Sparepart terlebih dahulu.')
    return
  }

  const manualBrandText = itemForm.brand_id === MANUAL_BRAND_VALUE ? (itemForm.manual_brand || '').trim() : ''
  if (itemForm.source === 'manual' && itemForm.brand_id === MANUAL_BRAND_VALUE && !manualBrandText) {
    toast.warning('Ketik nama brand manual atau pilih brand lain / Tanpa Brand.')
    return
  }

  const serialUpper = (itemForm.serial_no || '').trim().toUpperCase()
  if (itemForm.category === 'unit' && itemForm.source === 'manual' && itemForm.save_to_master) {
    if (!itemForm.brand_id || itemForm.brand_id === MANUAL_BRAND_VALUE || !itemForm.unit_type_id || !trimmedModel || !serialUpper) {
      toast.warning('Untuk menyimpan ke Master Unit, lengkapi Brand (DB), Tipe Produk, Model, dan Serial Number.')
      return
    }
  }

  isSaving.value = true
  try {
    let finalUnitId = itemForm.category === 'unit' && itemForm.source === 'db' ? itemForm.unit_id : null

    if (itemForm.category === 'unit' && itemForm.source === 'manual' && itemForm.save_to_master) {
      const existing = ((store.units.value ?? []) as any[]).find(
        (u: any) => String(u.serial_no || '').trim().toUpperCase() === serialUpper,
      )
      if (existing) {
        finalUnitId = existing.id
      } else {
        try {
          await resources.units.create({
            name: trimmedModel || 'Unit',
            brand_id: itemForm.brand_id,
            type_id: itemForm.unit_type_id,
            model: trimmedModel,
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
          toast.error('Gagal menambahkan unit ke Master Unit. Silakan coba lagi.')
          isSaving.value = false
          return
        }
      }
    }

    const isManualUnit = itemForm.category === 'unit' && itemForm.source === 'manual' && !itemForm.save_to_master
    const isExternalSavedUnit = itemForm.category === 'unit' && itemForm.source === 'manual' && itemForm.save_to_master
    const isManualProduct = itemForm.category === 'product' && itemForm.source === 'manual'

    let finalModel = trimmedModel
    if (manualBrandText && !finalModel.toLowerCase().startsWith(manualBrandText.toLowerCase())) {
      finalModel = `${manualBrandText} ${finalModel}`.trim()
    }
    const finalBrandId = (isManualUnit || isManualProduct || isExternalSavedUnit) && itemForm.brand_id && itemForm.brand_id !== MANUAL_BRAND_VALUE
      ? itemForm.brand_id
      : null
    const finalUnitTypeId = (isManualUnit || isExternalSavedUnit) && itemForm.unit_type_id
      ? itemForm.unit_type_id
      : null

    const itemPayload: any = {
      delivery_order_id: id,
      unit_id: finalUnitId,
      product_id: itemForm.category === 'product' && itemForm.source === 'db' ? itemForm.product_id : null,
      brand_id: finalBrandId,
      unit_type_id: finalUnitTypeId,
      model: (isManualUnit || isManualProduct || isExternalSavedUnit) ? finalModel : '',
      serial_no: (isManualUnit || isManualProduct || isExternalSavedUnit) ? serialUpper : '',
      description: isManualProduct ? finalModel : '',
      warranty_status: (isManualUnit || isExternalSavedUnit) ? (itemForm.warranty_status || '') : '',
      warranty_expired_date: (isManualUnit || isExternalSavedUnit) && itemForm.warranty_expired_date
        ? `${itemForm.warranty_expired_date}T00:00:00Z`
        : undefined,
      qty: Math.max(1, Number(itemForm.qty) || 1),
      remarks: (itemForm.remarks || '').trim(),
    }

    const wasEmpty = ((item.value as any)?.delivery_order_items || []).length === 0

    if (editingItemId.value && editingItemOriginal.value) {
      const orig = editingItemOriginal.value
      const origKind = resolveDeliveryOrderItemKind(orig)
      const nextKind = isExternalSavedUnit
        ? 'unit'
        : `${itemForm.category}${itemForm.source === 'manual' ? '_manual' : ''}`
      // Backend Update uses GORM struct Updates (ignores zero/empty values).
      // Recreate when switching kind or clearing previously non-empty optional fields.
      const clearedTextOrFK =
        Boolean(orig.serial_no && !itemPayload.serial_no) ||
        Boolean(orig.remarks && !itemPayload.remarks) ||
        Boolean(orig.brand_id && !itemPayload.brand_id) ||
        Boolean(orig.unit_type_id && !itemPayload.unit_type_id) ||
        Boolean(orig.warranty_status && !itemPayload.warranty_status) ||
        Boolean(orig.description && !itemPayload.description)

      if (origKind !== nextKind || clearedTextOrFK) {
        await resources.deliveryOrderItems.create(itemPayload)
        await resources.deliveryOrderItems.remove(editingItemId.value)
      } else {
        await resources.deliveryOrderItems.update(editingItemId.value, itemPayload)
      }
    } else {
      await resources.deliveryOrderItems.create(itemPayload)
    }

    const label = itemLabel(itemPayload)
    // Auto-update project_name only on first item when CS left default placeholder
    if (!editingItemId.value && wasEmpty) {
      const curProjectName = String(item.value?.project_name || '').trim()
      const address = item.value?.delivery_address || customer.value?.address || ''
      if (!curProjectName || curProjectName === '-' || curProjectName === 'Pengantaran Unit' || curProjectName.startsWith('Pengantaran Unit ke') || curProjectName.toLowerCase().includes('service laptop')) {
        const newProjectName = address ? `Pengantaran ${label} ke ${address}` : `Pengantaran ${label}`
        await resources.deliveryOrders.update(id, { project_name: newProjectName })
      }
    }

    await refreshCurrentDO()

    if (keepOpen && !editingItemId.value) {
      const qtySuffix = itemPayload.qty > 1 ? ` x${itemPayload.qty}` : ''
      sessionAddedLabels.value.push(`${label}${qtySuffix}`)
      resetItemEntryFields()
      toast.success('Item ditambahkan. Silakan tambah item berikutnya.')
    } else {
      showItemModal.value = false
      resetItemEntryFields()
      toast.success(editingItemId.value ? 'Item produk / unit diperbarui.' : 'Item produk / unit ditambahkan.')
      editingItemId.value = null
      editingItemOriginal.value = null
    }
  } catch (err: any) {
    toast.error(err?.message || 'Gagal menyimpan item.')
  } finally {
    isSaving.value = false
  }
}

async function removeItem(itemId: string) {
  if (!confirm('Hapus item ini?')) return
  try {
    await resources.deliveryOrderItems.remove(String(itemId))
    await refreshCurrentDO()
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
  return normalizeRole(currentUser.value?.role) === 'technician'
})
const isSuperadminOrAdmin = computed(() => {
  const r = String(currentUser.value?.role || '').trim().toLowerCase()
  return r === 'superadmin' || r === 'admin'
})

const linkedJob = computed(() => {
  return ((store.jobOrders?.value || []) as any[]).find((j: any) =>
    String(j.delivery_order_id) === String(item.value?.id)
  ) || null
})

const memberTechIds = computed(() => {
  return linkedJob.value ? getJobMemberTechIds(linkedJob.value) : []
})

const isMemberTech = computed(() => {
  if (currentUser.value?.role !== 'technician' && !isTechnician.value) return false
  if (!myTechId.value) return false
  if (linkedJob.value) {
    return isMemberTechnicianForJob(linkedJob.value, myTechId.value)
  }
  return false
})

const isEditable = computed(() => {
  if (isDeliveredOrCompleted.value) return false
  const r = String(currentUser.value?.role || '').trim().toLowerCase()
  if (r === 'superadmin' || r === 'admin') return true
  if (r === 'technician') {
    // Only the lead technician (Kepala) can fill/edit; members and other technicians are read-only
    if (!isLeadTech.value) return false
    const dTechId = item.value?.technician_id ? String(item.value.technician_id) : ''
    const tId = myTechId.value ? String(myTechId.value) : ''
    const uId = currentUser.value?.id ? String(currentUser.value.id) : ''
    if (dTechId && (dTechId === tId || dTechId === uId)) {
      return true
    }
    if (linkedJob.value && isTechnicianAssignedToJob(linkedJob.value, tId)) {
      return true
    }
    return !dTechId
  }
  return false
})

const isLeadTech = computed(() => {
  const r = String(currentUser.value?.role || '').trim().toLowerCase()
  if (r === 'superadmin' || r === 'admin') return true
  if (linkedJob.value) {
    return isLeadTechnicianForJob(linkedJob.value, myTechId.value)
  }
  const dTechId = item.value?.technician_id ? String(item.value.technician_id) : ''
  const tId = myTechId.value ? String(myTechId.value) : ''
  const uId = currentUser.value?.id ? String(currentUser.value.id) : ''
  return !dTechId || dTechId === tId || dTechId === uId
})

const canManageDo = computed(() => isEditable.value && (can('delivery_order:update') || isTechnician.value || isSuperadminOrAdmin.value))

async function startJob() {
  if (!isTechnician.value) {
    toast.error('Hanya teknisi yang dapat memulai pekerjaan.')
    return
  }
  isSaving.value = true
  try {
    const now = new Date()
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    form.time_in = hm
    await api.patch(`/delivery-orders/${id}`, { status: 'in_progress', time_in: hm })
    const linked = ((store.jobOrders?.value || []) as any[]).find((j: any) => String(j.delivery_order_id) === String(id))
    if (linked?.id) {
      try {
        await api.patch(`/job-orders/${linked.id}`, { status: 'in_progress' })
      } catch {}
    }
    try {
      const res: any = await api.get(`/delivery-orders/${id}`)
      const full = res.data?.data ?? res.data
      if (full) {
        localItem.value = full
      }
    } catch {}
    await store.refreshOnly(['deliveryOrders', 'jobOrders'])
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
    const linked = ((store.jobOrders?.value || []) as any[]).find((j: any) => String(j.delivery_order_id) === String(id))
    if (linked?.id) {
      try {
        await api.patch(`/job-orders/${linked.id}`, { status: 'draft' })
      } catch {}
    }
    await store.refreshOnly(['deliveryOrders', 'jobOrders'])
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
  if (!isLeadTech.value) {
    toast.warning('Tanda tangan dan penyelesaian pekerjaan hanya dapat dilakukan oleh Kepala Teknisi.')
    return
  }
  if (!isCompleted.value) {
    toast.warning('Lengkapi dulu: minimal 1 unit/produk + action + tanda tangan + foto awal.')
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
    const linked = ((store.jobOrders?.value || []) as any[]).find((j: any) => String(j.delivery_order_id) === String(id))
    if (linked?.id) {
      try {
        await api.patch(`/job-orders/${linked.id}`, { status: 'completed', completed_at: new Date().toISOString() })
      } catch {}
    }
    
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
             description: doi.description,
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
  store.ensureResourcesLoaded(route.path)
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
        <div class="info-item"><span class="info-label">Alamat</span><span class="info-value">{{ item.delivery_address || item.rental?.installation_address || item.sale?.installation_address || customer?.address || '-' }}</span></div>
        <div class="info-item"><span class="info-label">PIC & Kontak</span><span class="info-value">{{ item.recipient_name || customer?.pic_name || '-' }} ({{ item.recipient_phone || customer?.phone || '-' }})</span></div>
        <div class="info-item"><span class="info-label">Tanggal</span><span class="info-value">{{ item.delivery_date ? new Date(item.delivery_date).toLocaleDateString('en-GB') : '-' }}</span></div>
        <div class="info-item">
          <span class="info-label">Kepala Teknisi</span>
          <span class="info-value font-bold">{{ store.findTechnician(item.technician_id)?.user?.name || store.findTechnician(item.technician_id)?.name || item.technician_name || '-' }}</span>
        </div>
        <div class="info-item" v-if="memberTechIds.length > 0">
          <span class="info-label">Anggota Teknisi</span>
          <div class="info-value" style="display: flex; flex-wrap: wrap; gap: 4px;">
            <span v-for="mid in memberTechIds" :key="mid" class="badge" style="background: #f5f3ff; color: #6d28d9; border: 1px solid #ddd6fe; font-size: 11px;">
              {{ store.findTechnician(mid)?.user?.name || store.findTechnician(mid)?.name || mid }}
            </span>
          </div>
        </div>
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

      <div v-if="isTechnician && isEditable && isPending" class="text-center py-xl">
        <p class="mb-lg text-muted">Mulai pekerjaan untuk mencatat waktu (Time In) dan mengisi form detail servis.</p>
        <button class="btn btn-primary" style="padding: var(--space-md) var(--space-xl); font-size: 16px;" :disabled="isSaving" @click="startJob">
          {{ isSaving ? 'Memproses...' : 'Mulai Pekerjaan (Start Job)' }}
        </button>
      </div>

      <div v-else-if="isTechnician && isMemberTech && isPending" class="text-center py-xl">
        <div class="alert alert-info" style="display: inline-block; max-width: 500px; text-align: left;">
          ⏳ Menunggu <strong>Kepala Teknisi ({{ store.findTechnician(linkedJob?.technician_id || item?.technician_id)?.user?.name || 'Lead' }})</strong> memulai pengerjaan. Status akan otomatis diperbarui saat pekerjaan dimulai.
        </div>
      </div>

      <template v-else>

      <div v-if="isMemberTech" class="alert alert-info mb-md" style="display: flex; align-items: flex-start; gap: 8px;">
        <span style="font-size: 1.2rem;">ℹ️</span>
        <div>
          <strong>Penugasan Tim:</strong> Anda ditugaskan sebagai <strong>Anggota Teknisi</strong> pada pekerjaan ini (Kepala: <strong>{{ store.findTechnician(linkedJob?.technician_id || item?.technician_id)?.user?.name || 'Lead' }}</strong>).<br>
          Seluruh pengisian form, dokumentasi foto, dan tanda tangan dilakukan oleh Kepala Teknisi. Pekerjaan ini otomatis tercatat di Riwayat Pekerjaan Anda.
        </div>
      </div>

      <div class="items-box mb-lg">
        <div class="items-head">
          <strong>Unit / Product ({{ (item.delivery_order_items || []).length }})</strong>
          <button v-if="canManageDo" type="button" class="btn btn-sm btn-outline" @click="openItemModal">+ Tambah Item</button>
        </div>
        <div v-if="(item.delivery_order_items || []).length" class="mt-sm">
          <div v-for="(it, idx) in item.delivery_order_items" :key="it.id || idx" class="item-row">
            <div class="item-row-info">
              <span class="item-index">#{{ idx + 1 }}</span>
              <span
                class="item-kind-badge"
                :class="[
                  itemBadge(it).isUnit ? 'kind-unit' : 'kind-product',
                  { 'kind-manual': itemBadge(it).isManual },
                ]"
              >
                {{ itemBadge(it).label }}
              </span>
              <span class="item-label-text">
                {{ itemLabel(it) }}
                <span class="text-muted">x{{ it.qty || 1 }}</span>
                <span v-if="it.remarks" class="text-muted"> — {{ it.remarks }}</span>
              </span>
            </div>
            <div v-if="canManageDo" class="item-row-actions">
              <button type="button" class="btn btn-sm btn-outline" @click="openEditItemModal(it)">Edit</button>
              <button type="button" class="btn btn-sm btn-outline btn-danger" @click="removeItem(it.id)">Hapus</button>
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-muted mt-sm">
          Belum ada item. Klik <strong>+ Tambah Item</strong> untuk menambahkan unit/mesin atau produk (bisa lebih dari satu, pilih dari database atau input manual).
        </p>
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
          <div v-if="!isLeadTech && (item?.technician_id || linkedJob?.technician_id)" style="margin-top: 4px; display: inline-flex; align-items: center; gap: 4px;" class="badge badge-warning">
            Anggota (Kepala: {{ findTechnician(linkedJob?.technician_id || item?.technician_id)?.user?.name || findTechnician(linkedJob?.technician_id || item?.technician_id)?.name || 'Lead' }})
          </div>
          <label class="form-label mt-sm">Technician Signature <span v-if="isLeadTech" class="text-danger">*</span></label>
          <div v-if="isLeadTech" :style="{ pointerEvents: isEditable ? 'auto' : 'none' }">
            <SignaturePad v-model="form.technician_signature" height="150px" />
          </div>
          <div v-else>
            <div v-if="form.technician_signature" style="border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 8px; text-align: center; background: #fff;">
              <img :src="form.technician_signature" alt="Technician Signature" style="max-height: 120px;" />
              <div class="text-xs text-muted mt-xs">Ditandatangani oleh Kepala Teknisi ({{ findTechnician(linkedJob?.technician_id || item?.technician_id)?.user?.name || 'Lead' }})</div>
            </div>
            <div v-else style="padding: 20px; text-align: center; background: var(--color-bg-secondary, #f8f9fa); border: 1px dashed var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-muted); font-size: 13px;">
              🔒 Anda ditugaskan sebagai <strong>Anggota Teknisi</strong>. Tanda tangan teknisi hanya dapat diberikan oleh <strong>Kepala Teknisi ({{ findTechnician(linkedJob?.technician_id || item?.technician_id)?.user?.name || 'Lead' }})</strong>.
            </div>
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
        <div v-if="isMemberTech" class="alert alert-info" style="flex: 100%; margin-top: var(--space-md); font-size: 13px;">
          ℹ️ Anda bertugas sebagai <strong>Anggota Teknisi</strong>. Pengisian form dan penyelesaian dilakukan oleh <strong>Kepala Teknisi ({{ store.findTechnician(linkedJob?.technician_id || item?.technician_id)?.user?.name || 'Lead' }})</strong>.
        </div>
      </div>
      <div v-if="isEditable && isPending" class="mt-md text-center">
        <button class="btn btn-sm btn-outline btn-danger" :disabled="isSaving" @click="removeForm">
          🗑️ Batalkan / Hapus Stand Alone ini
        </button>
      </div>
      </template>
    </div>

    <!-- Modal tambah / edit item (v-if agar CustomSelect tidak di-mount saat tertutup) -->
    <FormModal
      v-if="showItemModal"
      :open="showItemModal"
      :title="editingItemId ? 'Edit Unit / Product' : 'Tambah Unit / Product'"
      max-width="680px"
      min-height="460px"
      :loading="isSaving"
      @close="showItemModal = false"
      @submit="addItem(false)"
    >
      <div v-if="sessionAddedLabels.length > 0 && !editingItemId" class="session-added-banner">
        <div class="session-added-title">✓ Tersimpan pada form ini (+{{ sessionAddedLabels.length }}):</div>
        <div class="session-added-chips">
          <span v-for="(lbl, i) in sessionAddedLabels" :key="i" class="session-chip">
            {{ lbl }}
          </span>
        </div>
      </div>

      <div class="mode-selectors">
        <div class="form-group">
          <label class="form-label font-bold">Kategori Barang</label>
          <div class="segmented-group">
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: itemForm.category === 'unit' }"
              @click="setItemCategory('unit')"
            >
              🖥️ Unit / Mesin
            </button>
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: itemForm.category === 'product' }"
              @click="setItemCategory('product')"
            >
              📦 Produk / Sparepart
            </button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label font-bold">Sumber Data</label>
          <div class="segmented-group">
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: itemForm.source === 'db' }"
              @click="setItemSource('db')"
            >
              📋 Pilih dari Database
            </button>
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: itemForm.source === 'manual' }"
              @click="setItemSource('manual')"
            >
              ✏️ Input Manual
            </button>
          </div>
        </div>
      </div>

      <!-- 1. Unit dari Database -->
      <div v-if="itemForm.category === 'unit' && itemForm.source === 'db'" class="form-group">
        <label class="form-label font-bold">Pilih Unit / Mesin <span class="text-danger">*</span></label>
        <CustomSelect v-model="itemForm.unit_id" :options="unitOptions" placeholder="-- Pilih Unit / Mesin --" :searchable="true" :loading="isModalLoading" />
        <div class="source-switch-hint">
          Unit tidak ada di database?
          <button type="button" class="link-btn" @click="setItemSource('manual')">Klik untuk Input Manual →</button>
        </div>
      </div>

      <!-- 2. Produk dari Database -->
      <div v-else-if="itemForm.category === 'product' && itemForm.source === 'db'" class="form-group">
        <label class="form-label font-bold">Pilih Produk / Consumable / Sparepart <span class="text-danger">*</span></label>
        <CustomSelect v-model="itemForm.product_id" :options="productOptions" placeholder="-- Pilih Produk / Sparepart --" :searchable="true" :loading="isModalLoading" />
        <div class="source-switch-hint">
          Produk tidak ada di database?
          <button type="button" class="link-btn" @click="setItemSource('manual')">Klik untuk Input Manual →</button>
        </div>
      </div>

      <!-- 3. Unit Input Manual -->
      <template v-else-if="itemForm.category === 'unit' && itemForm.source === 'manual'">
        <div class="manual-box">
          <div class="manual-box-hint">
            Masukkan detail unit secara manual karena belum terdaftar di database.
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label font-bold">Nama / Model Unit <span class="text-danger">*</span></label>
              <input v-model="itemForm.model" type="text" class="form-input" placeholder="Misal: Epson L3210 / ThinkPad X1" />
            </div>
            <div class="form-group">
              <label class="form-label font-bold">Serial Number <span v-if="itemForm.save_to_master" class="text-danger">*</span></label>
              <input v-model="itemForm.serial_no" type="text" class="form-input uppercase-input" placeholder="SN (opsional jika tidak ada)" autocapitalize="characters" autocomplete="off" spellcheck="false" @input="itemForm.serial_no = (itemForm.serial_no || '').toUpperCase()" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label font-bold">Brand <span v-if="itemForm.save_to_master" class="text-danger">*</span></label>
              <CustomSelect v-model="itemForm.brand_id" :options="brandOptionsWithManual" placeholder="-- Tanpa Brand (Opsional) --" :searchable="true" :loading="isModalLoading" />
              <input
                v-if="itemForm.brand_id === MANUAL_BRAND_VALUE"
                v-model="itemForm.manual_brand"
                type="text"
                class="form-input mt-xs"
                placeholder="Ketik nama brand manual..."
              />
            </div>
            <div class="form-group">
              <label class="form-label font-bold">Tipe Produk <span v-if="itemForm.save_to_master" class="text-danger">*</span></label>
              <CustomSelect v-model="itemForm.unit_type_id" :options="unitTypeOptionsWithOptional" placeholder="-- Tanpa Tipe Produk (Opsional) --" :searchable="true" :loading="isModalLoading" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label font-bold">Warranty Status (Opsional)</label>
              <CustomSelect v-model="itemForm.warranty_status" :options="warrantyOptions" placeholder="Status" />
            </div>
            <div class="form-group">
              <label class="form-label font-bold">Warranty Expired Date (Opsional)</label>
              <input v-model="itemForm.warranty_expired_date" type="date" class="form-input" />
            </div>
          </div>
          <label v-if="!editingItemId" class="save-master-check">
            <input type="checkbox" v-model="itemForm.save_to_master" />
            <span>Simpan juga sebagai <strong>Unit External</strong> di database Master Unit (wajib Brand DB, Tipe, Model &amp; SN)</span>
          </label>
        </div>
      </template>

      <!-- 4. Produk Input Manual -->
      <template v-else-if="itemForm.category === 'product' && itemForm.source === 'manual'">
        <div class="manual-box">
          <div class="manual-box-hint">
            Masukkan detail produk / consumable / sparepart secara manual karena belum terdaftar di database.
          </div>
          <div class="form-group">
            <label class="form-label font-bold">Nama Produk / Consumable / Sparepart <span class="text-danger">*</span></label>
            <input v-model="itemForm.model" type="text" class="form-input" placeholder="Misal: Tinta Epson 003 Black / Kabel Power 1.5m" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label font-bold">Brand / Merk (Opsional)</label>
              <CustomSelect v-model="itemForm.brand_id" :options="brandOptionsWithManual" placeholder="-- Tanpa Brand (Opsional) --" :searchable="true" :loading="isModalLoading" />
              <input
                v-if="itemForm.brand_id === MANUAL_BRAND_VALUE"
                v-model="itemForm.manual_brand"
                type="text"
                class="form-input mt-xs"
                placeholder="Ketik nama brand manual..."
              />
            </div>
            <div class="form-group">
              <label class="form-label font-bold">Kode / SKU / Part No (Opsional)</label>
              <input v-model="itemForm.serial_no" type="text" class="form-input uppercase-input" placeholder="Misal: PART-001 (opsional)" autocapitalize="characters" autocomplete="off" spellcheck="false" @input="itemForm.serial_no = (itemForm.serial_no || '').toUpperCase()" />
            </div>
          </div>
        </div>
      </template>

      <div class="qty-remarks-row">
        <div class="form-group qty-group">
          <label class="form-label font-bold">Qty</label>
          <input v-model.number="itemForm.qty" type="number" min="1" class="form-input text-center" />
        </div>
        <div class="form-group remarks-group">
          <label class="form-label font-bold">Remarks (Opsional)</label>
          <input v-model="itemForm.remarks" type="text" class="form-input" placeholder="Keterangan tambahan..." />
        </div>
      </div>

      <template #footer>
        <button type="button" class="btn btn-outline" :disabled="isSaving" @click="showItemModal = false">
          {{ sessionAddedLabels.length > 0 ? 'Selesai / Tutup' : 'Batal' }}
        </button>
        <button
          v-if="!editingItemId"
          type="button"
          class="btn btn-outline"
          style="color: var(--color-primary); border-color: var(--color-primary);"
          :disabled="isSaving"
          @click="addItem(true)"
        >
          {{ isSaving ? 'Menyimpan...' : '+ Simpan & Tambah Lagi' }}
        </button>
        <button type="button" class="btn btn-primary" :disabled="isSaving" @click="addItem(false)">
          {{ isSaving ? 'Menyimpan...' : (editingItemId ? 'Simpan Perubahan' : 'Simpan Unit / Product') }}
        </button>
      </template>
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
        <select v-model="printType" class="form-select" aria-label="Tipe Format Report">
          <option v-for="option in printTypeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
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
.info-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  background: var(--color-surface-sunken);
  padding: 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-light);
}
.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.info-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-muted);
}
.info-value {
  font-size: 14px;
  color: var(--color-text);
  word-break: break-word;
}
.font-bold {
  font-weight: 700;
}
.items-box {
  background: var(--color-surface-sunken);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid var(--color-border-light);
}
.items-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border-light);
  border-radius: 8px;
  padding: 10px 14px;
  margin-top: 8px;
  font-size: 13px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  flex-wrap: wrap;
}
.item-row-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 200px;
}
.item-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.item-index {
  font-weight: 700;
  color: var(--color-text-muted);
  font-size: 12px;
}
.item-kind-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
.item-kind-badge.kind-unit {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
}
.item-kind-badge.kind-product {
  background: #f5f3ff;
  color: #6d28d9;
  border: 1px solid #ddd6fe;
}
.item-kind-badge.kind-manual {
  border-style: dashed;
}
.item-label-text {
  font-weight: 500;
  word-break: break-word;
}
.session-added-banner {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 14px;
}
.session-added-title {
  font-size: 12px;
  font-weight: 600;
  color: #065f46;
  margin-bottom: 6px;
}
.session-added-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.session-chip {
  font-size: 11px;
  font-weight: 600;
  background: #fff;
  color: #047857;
  border: 1px solid #6ee7b7;
  border-radius: 999px;
  padding: 2px 8px;
}
.mode-selectors {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 4px;
}
.segmented-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.segmented-btn {
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface, #fff);
  color: var(--color-text);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: center;
}
.segmented-btn:hover {
  border-color: var(--color-primary);
}
.segmented-btn.active {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}
.source-switch-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-text-muted);
}
.link-btn {
  background: none;
  border: none;
  padding: 0;
  color: var(--color-primary);
  font-weight: 600;
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
}
.manual-box {
  background: var(--color-surface-sunken);
  border: 1px dashed var(--color-border);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
}
.manual-box-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 10px;
}
.save-master-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: var(--color-text);
  cursor: pointer;
  margin-top: 4px;
}
.mt-xs {
  margin-top: 6px;
}
.text-muted {
  color: var(--color-text-muted);
}
.text-sm {
  font-size: 13px;
}
.mt-sm {
  margin-top: 8px;
}
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.qty-remarks-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.qty-group {
  width: 110px;
  flex-shrink: 0;
}
.remarks-group {
  flex: 1;
}
.uppercase-input {
  text-transform: uppercase;
}
.photo-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
.photo-preview img {
  width: 100%;
  height: 180px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
}
@media (max-width: 580px) {
  .mode-selectors {
    grid-template-columns: 1fr;
  }
  .form-row {
    grid-template-columns: 1fr;
  }
  .qty-remarks-row {
    flex-direction: column;
  }
  .qty-group {
    width: 100%;
  }
}
.responsive-flex {
  display: flex;
  gap: 1rem;
}
.responsive-flex.align-center {
  align-items: center;
}
@media (max-width: 768px) {
  .responsive-flex {
    flex-direction: column;
  }
}
.btn-danger {
  color: var(--color-danger, #dc2626);
}
</style>
