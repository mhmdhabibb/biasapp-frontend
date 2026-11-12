<script setup lang="ts">
import PageHeader from '@/components/ui/PageHeader.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import SignaturePad from '@/components/ui/SignaturePad.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import { resources } from '@/services/resource.service'
import { useAuth } from '@/composables/useAuth'
import { normalizeRole } from '@/router/role-access'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { currentUser } = useAuth()
const { serviceReports, products, findCustomer, findTechnician, refreshInBackground, ensureResourcesLoaded } = useMasterStore()

const serviceId = String(route.params.id)
const reportRecord = ref<any>(null)
const job = computed(() => {
  if (reportRecord.value) return reportRecord.value
  return (serviceReports.value || []).find((sr: any) =>
    String(sr.id) === serviceId || String(sr.job_order_id) === serviceId
  )
})
const realServiceReportId = computed(() => reportRecord.value?.id || job.value?.id || serviceId)
const customerType = computed(() => job.value?.customer_category || findCustomer(job.value?.customer_id)?.category || 'Corporate')

const form = ref({
  remarks: '',
  notes: '',
  is_tested: false,
  spareparts: [] as any[],
  customer_signature: '',
  technician_signature: '',
  customer_name: '',
  technician_name: '',
  photo_before: '',
  photo_progress: '',
  photo_after: '',
})
const isLoading = ref(true)
const isSaving = ref(false)
const removedSparepartIds = ref<string[]>([])
const fileInputBefore = ref<HTMLInputElement | null>(null)
const fileInputProgress = ref<HTMLInputElement | null>(null)
const fileInputAfter = ref<HTMLInputElement | null>(null)

const productOptions = computed(() => {
  const list = products.value || []
  const spareparts = list.filter((product: any) => product.is_sparepart)
  const base = spareparts.length > 0 ? spareparts : list
  return [
    ...base.map((product: any) => ({
      value: String(product.id),
      label: `${product.name} ${product.sku ? `(${product.sku})` : ''}`.trim(),
    })),
    { value: '__manual__', label: '➕ Tidak ada di database? Input manual...' }
  ]
})

onMounted(async () => {
  ensureResourcesLoaded(route.path)
  // If job is already available in memory, initialize form instantly (0ms loading!)
  if (job.value) {
    const initCust = findCustomer(job.value.customer_id) || job.value.customer
    form.value = {
      remarks: job.value.remarks || '',
      notes: job.value.notes || '',
      is_tested: job.value.is_tested || false,
      spareparts: (job.value.service_spareparts || []).map((item: any) => ({
        id: String(item.id),
        mode: item.product_id ? 'db' : 'manual',
        product_id: item.product_id ? String(item.product_id) : '',
        item_name: item.item_name || (item.product?.name || ''),
        qty: Number(item.qty) || 1,
      })),
      customer_signature: job.value.customer_signature_technical || initCust?.signature || '',
      technician_signature: job.value.technician_signature_technical || '',
      customer_name: job.value.customer_name_technical || initCust?.pic_name || initCust?.company_name || '',
      technician_name: job.value.technician_name_technical || findTechnician(job.value.technician_id)?.name || job.value.technician?.name || currentUser.value?.name || '',
      photo_before: job.value.photo_before || '',
      photo_progress: job.value.photo_progress || '',
      photo_after: job.value.photo_after || '',
    }
    isLoading.value = false
  }

  try {
    let data: any = null
    try {
      const response = await api.get<{ data: any }>(`/service-reports/${serviceId}`, !job.value, true)
      data = (response as any)?.data?.data || (response as any)?.data || response
    } catch {
      const fromStore = (serviceReports.value || []).find((sr: any) =>
        String(sr.job_order_id) === serviceId || String(sr.id) === serviceId
      )
      if (fromStore?.id) {
        const response2 = await api.get<{ data: any }>(`/service-reports/${fromStore.id}`, !job.value, true)
        data = (response2 as any)?.data?.data || (response2 as any)?.data || response2
      }
    }
    if (data && data.id) {
      reportRecord.value = data
      const loadedCust = findCustomer(data.customer_id) || data.customer
      form.value = {
        remarks: data.remarks || form.value.remarks || '',
        notes: data.notes || form.value.notes || '',
        is_tested: data.is_tested ?? form.value.is_tested ?? false,
        spareparts: (data.service_spareparts || []).map((item: any) => ({
          id: String(item.id),
          mode: item.product_id ? 'db' : 'manual',
          product_id: item.product_id ? String(item.product_id) : '',
          item_name: item.item_name || (item.product?.name || ''),
          qty: Number(item.qty) || 1,
        })),
        customer_signature: data.customer_signature_technical || form.value.customer_signature || loadedCust?.signature || '',
        technician_signature: data.technician_signature_technical || form.value.technician_signature || '',
        customer_name: data.customer_name_technical || form.value.customer_name || loadedCust?.pic_name || loadedCust?.company_name || '',
        technician_name: data.technician_name_technical || form.value.technician_name || '',
        photo_before: data.photo_before || form.value.photo_before || '',
        photo_progress: data.photo_progress || form.value.photo_progress || '',
        photo_after: data.photo_after || form.value.photo_after || '',
      }
    }
    // Auto-fetch customer profile signature if not yet set
    const targetCustId = data?.customer_id || job.value?.customer_id
    if (!form.value.customer_signature && targetCustId) {
      try {
        const cRes = await api.get<any>(`/customers/${targetCustId}`, false, true)
        const cData = (cRes as any)?.data?.data || (cRes as any)?.data || cRes
        if (cData?.signature) {
          form.value.customer_signature = cData.signature
        }
        if (!form.value.customer_name && (cData?.pic_name || cData?.company_name)) {
          form.value.customer_name = cData.pic_name || cData.company_name
        }
      } catch (e) {
        console.warn('Could not auto-fetch customer profile signature:', e)
      }
    }
    if (!job.value) throw new Error('Service report not found')
    void refreshInBackground()
  } catch (err: any) {
    if (!job.value) {
      toast.error(err.message || 'Failed to load service report')
    }
  } finally {
    isLoading.value = false
  }
})

const isDeliveredOrCompleted = computed(() => {
  const s = String(job.value?.status || '').toLowerCase()
  return s === 'delivered' || s === 'completed' || !!job.value?.is_completed
})
const isEditable = computed(() => {
  if (isDeliveredOrCompleted.value) return false
  const r = normalizeRole(currentUser.value?.role)
  return r === 'technician' || r === 'admin'
})

function handlePhoto(event: Event, type: 'before' | 'progress' | 'after') {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
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
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, width, height)
        const compressedUrl = canvas.toDataURL('image/jpeg', 0.6)
        
        if (type === 'before') {
          form.value.photo_before = compressedUrl
        } else if (type === 'progress') {
          form.value.photo_progress = compressedUrl
        } else {
          form.value.photo_after = compressedUrl
        }
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  }
  target.value = ''
}

function clearPhoto(type: 'before' | 'progress' | 'after') {
  if (type === 'before') {
    form.value.photo_before = ''
    if (fileInputBefore.value) fileInputBefore.value.value = ''
  } else if (type === 'progress') {
    form.value.photo_progress = ''
    if (fileInputProgress.value) fileInputProgress.value.value = ''
  } else {
    form.value.photo_after = ''
    if (fileInputAfter.value) fileInputAfter.value.value = ''
  }
}

function removeSparepart(index: number) {
  const [removed] = form.value.spareparts.splice(index, 1)
  if (removed?.id) removedSparepartIds.value.push(removed.id)
}

async function saveSpareparts() {
  if (isLoading.value || !job.value) return
  isSaving.value = true
  try {
    for (const id of removedSparepartIds.value) {
      await resources.serviceSpareparts.remove(id)
    }
    for (const sp of form.value.spareparts) {
      const qty = Number(sp.qty)
      if (qty <= 0) continue

      let finalProductId = sp.mode === 'db' ? (sp.product_id || null) : null
      let finalItemName = (sp.item_name || '').trim()

      if (sp.mode === 'db' && finalProductId) {
        const p = products.value.find((prod: any) => String(prod.id) === String(finalProductId))
        if (p) finalItemName = p.name
      }

      if (!finalProductId && !finalItemName) continue

      const payload: any = {
        product_id: finalProductId,
        item_name: finalItemName,
        qty: qty,
      }
      if (sp.id) {
        await resources.serviceSpareparts.update(sp.id, payload)
      } else {
        await api.post('/service-spareparts/', {
          service_report_id: realServiceReportId.value,
          technician_id: job.value?.technician_id || currentUser.value?.id,
          ...payload,
        })
      }
    }
    removedSparepartIds.value = []
    const response = await api.get<{ data: any }>(`/service-reports/${realServiceReportId.value}`, true, false)
    reportRecord.value = (response as any)?.data?.data || (response as any)?.data || response
    form.value.spareparts = (reportRecord.value?.service_spareparts || []).map((item: any) => ({
      id: String(item.id),
      mode: item.product_id ? 'db' : 'manual',
      product_id: item.product_id ? String(item.product_id) : '',
      item_name: item.item_name || (item.product?.name || ''),
      qty: Number(item.qty) || 1,
    }))
    await refreshInBackground()
    return true
  } catch (err: any) {
    toast.error(err.message || 'Failed to update sparepart')
    return false
  } finally {
    isSaving.value = false
  }
}

async function saveForm() {
  if (isLoading.value || !job.value || isSaving.value) return
  if (!form.value.customer_signature || !form.value.technician_signature || !form.value.customer_name.trim()) {
    toast.warning('Customer name, customer and technician signatures are required.')
    return
  }
  isSaving.value = true
  try {
    if (!(await saveSpareparts())) return
    await api.patch(`/service-reports/${realServiceReportId.value}`, {
      remarks: form.value.remarks,
      notes: form.value.notes,
      is_tested: form.value.is_tested,
      customer_signature_technical: form.value.customer_signature,
      technician_signature_technical: form.value.technician_signature,
      customer_name_technical: form.value.customer_name,
      technician_name_technical: form.value.technician_name,
      photo_before: form.value.photo_before,
      photo_progress: form.value.photo_progress,
      photo_after: form.value.photo_after,
    })
    toast.success('Technical Report saved successfully')
    await refreshInBackground()
    router.back()
  } catch (err: any) {
    toast.error(err.message || 'Failed to save form')
  } finally {
    isSaving.value = false
  }
}
</script>
<template>
  <div style="max-width: 800px; margin: 0 auto">
    <PageHeader title="Technical Report Form" :back-button="true" @back="router.back()" />
    <div class="card p-lg mt-md">
      <div v-if="isLoading" class="form-loading" role="status">Loading service report...</div>
      <div v-else-if="!job" class="form-loading" role="alert">Service report not found. No new data created.</div>
      <div v-else-if="!isEditable" class="text-center p-xl text-muted">
        <p class="mb-md">Form is read-only because it has been completed or you are not authorized to edit it. Please view the digital report instead.</p>
        <div style="display: flex; justify-content: center; gap: 8px; margin-top: 16px;">
          <button type="button" class="btn btn-primary" @click="router.push(`/shared/service-reports/${realServiceReportId}`)">
            View Technical Report
          </button>
          <button type="button" class="btn btn-outline" @click="router.back()">
            Back
          </button>
        </div>
      </div>
      <template v-else>
      <!-- 1. Customer Type -->
      <div class="form-group">
        <label class="form-label">Customer Type</label>
        <input :value="customerType" type="text" class="form-input" readonly disabled>
      </div>

      <!-- 2. Photo Before -->
      <div class="form-group">
        <label class="form-label">1. Foto Pengantaran / Problem</label>
        <div v-if="form.photo_before" class="photo-preview mb-sm">
          <img :src="form.photo_before" alt="Photo Before" />
          <button type="button" class="btn btn-outline btn-sm w-full mt-sm text-danger" @click="clearPhoto('before')">Remove Photo</button>
        </div>
        <div v-else class="flex gap-sm mt-xs">
          <label class="btn btn-outline flex-1 cursor-pointer" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
            Ambil Foto
            <input type="file" accept="image/*" capture="environment" style="display: none;" @change="e => handlePhoto(e, 'before')" />
          </label>
          <label class="btn btn-outline flex-1 cursor-pointer" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.2 15c.7-1.2 1-2.5.7-3.9-.6-2-2.4-3.5-4.4-3.5h-1.2c-.7-3-3.2-5.2-6.2-5.6-3-.3-5.9 1.3-7.3 4-1.2 2.5-1 6.5.5 8.8m8.7-1.6V21"/><path d="M16 16l-4-4-4 4"/></svg>
            Pilih File / Galeri
            <input type="file" accept="image/*" style="display: none;" @change="e => handlePhoto(e, 'before')" />
          </label>
        </div>
      </div>

      <!-- 3. Inspection Result -->
      <div class="form-group">
        <label class="form-label">Inspection Result / Root Cause <span class="text-danger">*</span></label>
        <textarea v-model="form.remarks" class="form-textarea" rows="4" placeholder="Describe the unit inspection result..."></textarea>
      </div>
      
      <!-- 4. Additional Notes -->
      <div class="form-group">
        <label class="form-label">Additional Notes (Internal)</label>
        <textarea v-model="form.notes" class="form-textarea" rows="3" placeholder="Operational notes..."></textarea>
      </div>

      <!-- 5. Machine Tested -->
      <div class="form-group mt-lg">
        <label class="flex items-center gap-sm cursor-pointer p-md" style="background: var(--color-surface-sunken); border-radius: var(--radius-sm)">
          <input type="checkbox" v-model="form.is_tested" style="width: 20px; height: 20px;">
          <span class="font-bold">Machine has been tested and works normally (opsional)</span>
        </label>
      </div>

      <!-- Foto Pengerjaan -->
      <div class="form-group mt-lg">
        <label class="form-label">2. Foto Instal / Service</label>
        <div v-if="form.photo_progress" class="photo-preview mb-sm">
          <img :src="form.photo_progress" alt="Foto Pengerjaan" />
          <button type="button" class="btn btn-outline btn-sm w-full mt-sm text-danger" @click="clearPhoto('progress')">Remove Photo</button>
        </div>
        <div v-else class="flex gap-sm mt-xs">
          <label class="btn btn-outline flex-1 cursor-pointer" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
            Ambil Foto
            <input type="file" accept="image/*" capture="environment" style="display: none;" @change="e => handlePhoto(e, 'progress')" />
          </label>
          <label class="btn btn-outline flex-1 cursor-pointer" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.2 15c.7-1.2 1-2.5.7-3.9-.6-2-2.4-3.5-4.4-3.5h-1.2c-.7-3-3.2-5.2-6.2-5.6-3-.3-5.9 1.3-7.3 4-1.2 2.5-1 6.5.5 8.8m8.7-1.6V21"/><path d="M16 16l-4-4-4 4"/></svg>
            Pilih File / Galeri
            <input type="file" accept="image/*" style="display: none;" @change="e => handlePhoto(e, 'progress')" />
          </label>
        </div>
      </div>

      <!-- 6. Photo After -->
      <div class="form-group mt-lg">
        <label class="form-label">3. Foto Selesai</label>
        <div v-if="form.photo_after" class="photo-preview mb-sm">
          <img :src="form.photo_after" alt="Photo After" />
          <button type="button" class="btn btn-outline btn-sm w-full mt-sm text-danger" @click="clearPhoto('after')">Remove Photo</button>
        </div>
        <div v-else class="flex gap-sm mt-xs">
          <label class="btn btn-outline flex-1 cursor-pointer" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
            Ambil Foto
            <input type="file" accept="image/*" capture="environment" style="display: none;" @change="e => handlePhoto(e, 'after')" />
          </label>
          <label class="btn btn-outline flex-1 cursor-pointer" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.2 15c.7-1.2 1-2.5.7-3.9-.6-2-2.4-3.5-4.4-3.5h-1.2c-.7-3-3.2-5.2-6.2-5.6-3-.3-5.9 1.3-7.3 4-1.2 2.5-1 6.5.5 8.8m8.7-1.6V21"/><path d="M16 16l-4-4-4 4"/></svg>
            Pilih File / Galeri
            <input type="file" accept="image/*" style="display: none;" @change="e => handlePhoto(e, 'after')" />
          </label>
        </div>
      </div>

      <!-- 7. Add Sparepart -->
      <div class="form-group sparepart-list mt-lg">
        <label class="form-label">Sparepart Request <span class="text-muted">(Optional)</span></label>
        <div v-for="(sp, index) in form.spareparts" :key="sp.id || index" class="sparepart-card">
          <div class="sparepart-card-header">
            <div class="sparepart-mode-toggle">
              <button
                type="button"
                class="btn btn-xs"
                :class="sp.mode === 'db' ? 'btn-primary' : 'btn-outline'"
                @click="sp.mode = 'db'"
              >
                Pilih DB
              </button>
              <button
                type="button"
                class="btn btn-xs"
                :class="sp.mode === 'manual' ? 'btn-primary' : 'btn-outline'"
                @click="sp.mode = 'manual'"
              >
                Input Manual
              </button>
            </div>
            <button type="button" class="btn btn-xs btn-outline remove-sparepart" :aria-label="`Remove sparepart ${index + 1}`" @click="removeSparepart(index)">Hapus</button>
          </div>
          <div class="sparepart-row">
            <CustomSelect
              v-if="sp.mode === 'db'"
              v-model="sp.product_id"
              class="form-select"
              :options="productOptions"
              placeholder="Select Component..."
              @update:model-value="(val) => { if (val === '__manual__') { sp.mode = 'manual'; sp.product_id = '' } }"
            />
            <input v-else v-model="sp.item_name" type="text" class="form-input" placeholder="Ketik nama sparepart / komponen..." />
            <input v-model.number="sp.qty" type="number" class="form-input qty-input" min="1" placeholder="Qty">
          </div>
        </div>
        <button type="button" class="btn btn-outline add-sparepart" @click="form.spareparts.push({ mode: 'db', product_id: '', item_name: '', qty: 1 })">
          + Add Sparepart
        </button>
        <p v-if="form.spareparts.length === 0" class="form-hint">No sparepart request? Leave empty.</p>
        <p class="form-hint">Sparepart request also appears on Copier Service Report (for copier units).</p>
      </div>

      <!-- Section: Tanda Tangan & Verifikasi -->
      <div class="signature-section mt-xl">
        <div class="section-title-row mb-md">
          <h3 class="section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            Tanda Tangan &amp; Verifikasi
          </h3>
          <span class="section-subtitle">Pastikan PIC customer dan teknisi menandatangani laporan teknis berikut</span>
        </div>

        <div class="signature-cards-grid">
          <!-- Card Customer -->
          <div class="sig-card">
            <div class="sig-card-header">
              <div class="sig-header-left">
                <div class="sig-icon-wrap sig-icon-customer">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <div>
                  <div class="sig-card-title">Customer / PIC</div>
                  <div class="sig-card-sub">Pihak penerima laporan</div>
                </div>
              </div>
              <span class="sig-type-badge">Customer</span>
            </div>

            <div class="sig-card-body">
              <div class="form-group mb-md">
                <label class="form-label font-medium">Customer / PIC Name <span class="text-danger">*</span></label>
                <div class="input-with-icon">
                  <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  <input v-model="form.customer_name" type="text" class="form-input form-input-clean" placeholder="Nama PIC Customer...">
                </div>
              </div>

              <div class="form-group">
                <div class="flex justify-between items-center mb-xs">
                  <label class="form-label font-medium m-0">Customer Signature <span class="text-danger">*</span></label>
                  <span class="text-xs text-muted">Tanda tangan digital</span>
                </div>
                <div class="sig-pad-box">
                  <SignaturePad v-model="form.customer_signature" height="150px" />
                </div>
              </div>
            </div>
          </div>

          <!-- Card Teknisi -->
          <div class="sig-card">
            <div class="sig-card-header">
              <div class="sig-header-left">
                <div class="sig-icon-wrap sig-icon-tech">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                </div>
                <div>
                  <div class="sig-card-title">Teknisi BIAS</div>
                  <div class="sig-card-sub">Penyelesai pekerjaan</div>
                </div>
              </div>
              <span class="sig-type-badge badge-tech">Teknisi</span>
            </div>

            <div class="sig-card-body">
              <div class="form-group mb-md">
                <label class="form-label font-medium">Technician Name</label>
                <div class="input-with-icon readonly-field">
                  <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/></svg>
                  <input :value="form.technician_name || 'Teknisi'" type="text" class="form-input form-input-clean" readonly disabled>
                </div>
              </div>

              <div class="form-group">
                <div class="flex justify-between items-center mb-xs">
                  <label class="form-label font-medium m-0">Technician Signature <span class="text-danger">*</span></label>
                  <span class="text-xs text-muted">Tanda tangan digital</span>
                </div>
                <div class="sig-pad-box">
                  <SignaturePad v-model="form.technician_signature" height="150px" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Button Submit -->
      <div class="action-footer mt-xl mb-xl">
        <button
          type="button"
          class="btn btn-primary btn-submit-report"
          :disabled="isLoading || isSaving"
          @click="saveForm"
        >
          <svg v-if="!isSaving" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          <svg v-else class="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
          <span>{{ isSaving ? 'Menyimpan Laporan...' : 'Update Technical Report' }}</span>
        </button>
      </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.signature-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-base);
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-base);
}

.photo-preview img {
  width: 100%;
  height: 200px;
  object-fit: contain;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface-sunken);
}

.sparepart-list {
  padding: 16px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
}

.sparepart-card {
  padding: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  margin-top: 10px;
}

.sparepart-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.sparepart-mode-toggle {
  display: flex;
  gap: 6px;
}

.sparepart-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 88px;
  gap: 8px;
}

.qty-input { width: 100%; }
.remove-sparepart { color: var(--color-danger); }
.add-sparepart { width: 100%; margin-top: 12px; border-style: dashed; }
.form-hint { margin-top: 12px; color: var(--color-text-muted); font-size: var(--font-size-sm); }

.form-loading {
  padding: 24px;
  border-radius: 8px;
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  text-align: center;
}

/* ── Section Title ── */
.signature-section {
  margin-top: 24px;
}

.section-title-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.section-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-emphasis, #0f172a);
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.section-subtitle {
  font-size: 12px;
  color: var(--color-text-muted, #64748b);
}

/* ── Signature Cards Grid ── */
.signature-cards-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.sig-card {
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.sig-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.07);
}

.sig-card-header {
  padding: 12px 16px;
  background: var(--color-surface-sunken, #f8fafc);
  border-bottom: 1px solid var(--color-border-light, #e2e8f0);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.sig-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sig-icon-wrap {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sig-icon-customer {
  background: rgba(59, 130, 246, 0.12);
  color: #2563eb;
}

.sig-icon-tech {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
}

.sig-card-title {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--color-text-emphasis, #0f172a);
  line-height: 1.2;
}

.sig-card-sub {
  font-size: 11px;
  color: var(--color-text-muted, #64748b);
  line-height: 1.2;
  margin-top: 2px;
}

.sig-type-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 20px;
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
  text-transform: capitalize;
}

.sig-type-badge.badge-tech {
  background: #f0fdf4;
  color: #15803d;
  border-color: #bbf7d0;
}

.sig-card-body {
  padding: 16px;
}

.input-with-icon {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 12px;
  color: #94a3b8;
  pointer-events: none;
}

.form-input-clean {
  padding-left: 36px !important;
  border-radius: 8px;
  border: 1px solid var(--color-border, #cbd5e1);
  background: var(--color-surface, #ffffff);
  font-size: 13.5px;
  transition: all 0.2s;
  width: 100%;
}

.form-input-clean:focus {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
  outline: none;
}

.readonly-field input {
  background: var(--color-surface-sunken, #f8fafc) !important;
  color: var(--color-text-muted, #64748b) !important;
  cursor: not-allowed;
}

.sig-pad-box {
  border-radius: 8px;
  overflow: hidden;
  border: 1.5px dashed #cbd5e1;
  background: #ffffff;
  transition: border-color 0.2s;
}

.sig-pad-box:focus-within,
.sig-pad-box:hover {
  border-color: var(--color-primary, #3b82f6);
}

/* ── Submit Action Button ── */
.action-footer {
  margin-top: 28px;
  margin-bottom: 36px;
}

.btn-submit-report {
  width: 100%;
  padding: 13px 20px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
  transition: all 0.2s;
}

.btn-submit-report:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35);
}

.btn-submit-report:active:not(:disabled) {
  transform: translateY(0);
}

@media (max-width: 640px) {
  .signature-grid { grid-template-columns: 1fr; }
  .photo-grid { grid-template-columns: 1fr; }
  .signature-cards-grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .action-footer {
    margin-bottom: 60px;
  }
  .sparepart-row { 
    grid-template-columns: minmax(0, 1fr) auto; 
    align-items: stretch;
  }
  .sparepart-row > :nth-child(1) { grid-column: 1 / -1; } /* Select */
  .sparepart-row > :nth-child(2) { grid-column: 1 / 2; } /* Qty */
  .sparepart-row > :nth-child(3) { grid-column: 2 / 3; } /* Delete */
}
</style>
