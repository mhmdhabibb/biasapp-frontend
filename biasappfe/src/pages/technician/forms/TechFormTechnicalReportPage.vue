<script setup lang="ts">
import PageHeader from '@/components/ui/PageHeader.vue'
import SignaturePad from '@/components/ui/SignaturePad.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import { resources } from '@/services/resource.service'
import { useAuth } from '@/composables/useAuth'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { currentUser } = useAuth()
const { serviceReports, products, findCustomer, findTechnician, refreshInBackground } = useMasterStore()

const serviceId = String(route.params.id)
const reportRecord = ref<any>(null)
const job = computed(() => reportRecord.value || serviceReports.value.find(sr => String(sr.id) === serviceId))
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
  photo_after: '',
})
const isLoading = ref(true)
const isSaving = ref(false)
const removedSparepartIds = ref<string[]>([])

onMounted(async () => {
  try {
    const response = await api.get<{ data: any }>(`/service-reports/${serviceId}`)
    reportRecord.value = response.data
    if (!job.value) throw new Error('Service report not found')
    form.value = {
      remarks: job.value.remarks || '',
      notes: job.value.notes || '',
      is_tested: job.value.is_tested || false,
      spareparts: (job.value.service_spareparts || []).map((item: any) => ({
        id: String(item.id),
        product_id: String(item.product_id),
        qty: Number(item.qty) || 1,
      })),
      customer_signature: job.value.customer_signature_technical || '',
      technician_signature: job.value.technician_signature_technical || '',
      customer_name: job.value.customer_name_technical || findCustomer(job.value.customer_id)?.pic_name || job.value.customer?.pic_name || '',
      technician_name: job.value.technician_name_technical || findTechnician(job.value.technician_id)?.name || job.value.technician?.name || currentUser.value?.name || '',
      photo_before: job.value.photo_before || '',
      photo_after: job.value.photo_after || '',
    }
  } catch (err: any) {
    toast.error(err.message || 'Failed to load service report')
  } finally {
    isLoading.value = false
  }
})

const fileInputBefore = ref<HTMLInputElement | null>(null)
const fileInputAfter = ref<HTMLInputElement | null>(null)

function handlePhoto(event: Event, type: 'before' | 'after') {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      if (type === 'before') {
        form.value.photo_before = e.target?.result as string
      } else {
        form.value.photo_after = e.target?.result as string
      }
    }
    reader.readAsDataURL(file)
  }
}

function clearPhoto(type: 'before' | 'after') {
  if (type === 'before') {
    form.value.photo_before = ''
    if (fileInputBefore.value) fileInputBefore.value.value = ''
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
      if (!sp.product_id || Number(sp.qty) <= 0) continue
      const payload = {
        product_id: sp.product_id,
        qty: Number(sp.qty),
      }
      if (sp.id) {
        await resources.serviceSpareparts.update(sp.id, payload)
      } else {
        await api.post('/service-spareparts/', {
          service_report_id: serviceId,
          ...payload,
        })
      }
    }
    removedSparepartIds.value = []
    const response = await api.get<{ data: any }>(`/service-reports/${serviceId}`)
    reportRecord.value = response.data
    form.value.spareparts = (reportRecord.value?.service_spareparts || []).map((item: any) => ({
      id: String(item.id),
      product_id: String(item.product_id),
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
    await api.patch(`/service-reports/${serviceId}`, {
      remarks: form.value.remarks,
      notes: form.value.notes,
      is_tested: form.value.is_tested,
      customer_signature_technical: form.value.customer_signature,
      technician_signature_technical: form.value.technician_signature,
      customer_name_technical: form.value.customer_name,
      technician_name_technical: form.value.technician_name,
      photo_before: form.value.photo_before,
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
      <template v-else>
      <!-- 1. Customer Type -->
      <div class="form-group">
        <label class="form-label">Customer Type</label>
        <input :value="customerType" type="text" class="form-input" readonly disabled>
      </div>

      <!-- 2. Photo Before -->
      <div class="form-group">
        <label class="form-label">Photo Before Service</label>
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
            Upload Galeri
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
          <span class="font-bold">Machine has been tested and works normally. <span class="text-danger">*</span></span>
        </label>
      </div>

      <!-- 6. Photo After -->
      <div class="form-group mt-lg">
        <label class="form-label">Photo After Service</label>
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
            Upload Galeri
            <input type="file" accept="image/*" style="display: none;" @change="e => handlePhoto(e, 'after')" />
          </label>
        </div>
      </div>

      <!-- 7. Add Sparepart -->
      <div class="form-group sparepart-list mt-lg">
        <label class="form-label">Sparepart Request <span class="text-muted">(Optional)</span></label>
        <div v-for="(sp, index) in form.spareparts" :key="sp.id || index" class="sparepart-row">
          <select v-model="sp.product_id" class="form-select">
            <option value="" disabled>Select Component...</option>
            <option v-for="product in products" :key="product.id" :value="product.id">{{ product.name }}</option>
          </select>
          <input v-model.number="sp.qty" type="number" class="form-input qty-input" min="1" placeholder="Qty">
          <button type="button" class="btn btn-outline remove-sparepart" :aria-label="`Remove sparepart ${index + 1}`" @click="removeSparepart(index)">Delete</button>
        </div>
        <button type="button" class="btn btn-outline add-sparepart" @click="form.spareparts.push({ product_id: '', qty: 1 })">
          + Add Sparepart
        </button>
        <p v-if="form.spareparts.length === 0" class="form-hint">No sparepart request? Leave empty.</p>
        <p class="form-hint">Sparepart request also appears on Copier Service Report (for copier units).</p>
      </div>

      <!-- 8-11. Names & Signatures (Responsive) -->
      <div class="signature-grid mt-lg">
        <div class="signature-column">
          <!-- 8. Customer PIC Name -->
          <div class="form-group">
            <label class="form-label">Customer / PIC Name <span class="text-danger">*</span></label>
            <input v-model="form.customer_name" type="text" class="form-input" placeholder="Customer PIC name">
          </div>
          <!-- 11. Customer Signature -->
          <div class="form-group mt-md">
            <label class="form-label">Customer Signature <span class="text-danger">*</span></label>
            <SignaturePad v-model="form.customer_signature" height="160px" />
          </div>
        </div>

        <div class="signature-column">
          <!-- 9. Tech Name -->
          <div class="form-group">
            <label class="form-label">Technician Name</label>
            <input v-model="form.technician_name" type="text" class="form-input" readonly disabled>
          </div>
          <!-- 10. Tech Signature -->
          <div class="form-group mt-md">
            <label class="form-label">Technician Signature <span class="text-danger">*</span></label>
            <SignaturePad v-model="form.technician_signature" height="160px" />
          </div>
        </div>
      </div>

      <div style="margin-top: 40px; margin-bottom: 10px;">
        <button class="btn btn-primary w-full" style="padding: 12px; font-size: 16px;" :disabled="isLoading || isSaving" @click="saveForm">
          {{ isSaving ? 'Saving...' : 'Update Technical Report' }}
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

.sparepart-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 88px auto;
  gap: 8px;
  margin-top: 10px;
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

@media (max-width: 640px) {
  .signature-grid { grid-template-columns: 1fr; }
  .photo-grid { grid-template-columns: 1fr; }
  .sparepart-row { grid-template-columns: minmax(0, 1fr) 72px; }
  .remove-sparepart { grid-column: 1 / -1; }
}
</style>
