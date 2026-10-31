<script setup lang="ts">
import PageHeader from '@/components/ui/PageHeader.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import SignaturePad from '@/components/ui/SignaturePad.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import { resources } from '@/services/resource.service'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuth } from '@/composables/useAuth'
import { normalizeRole } from '@/router/role-access'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { currentUser } = useAuth()
const { serviceReports, products, findCustomer, findTechnician, refreshInBackground } = useMasterStore()

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
  repair_action: '',
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
const currentStep = ref(1)
const removedSparepartIds = ref<string[]>([])
const fileInputBefore = ref<HTMLInputElement | null>(null)
const fileInputProgress = ref<HTMLInputElement | null>(null)
const fileInputAfter = ref<HTMLInputElement | null>(null)

const productOptions = computed(() =>
  products.value
    .filter((product: any) => product.is_sparepart)
    .map((product: any) => ({ value: product.id, label: product.name })),
)

onMounted(async () => {
  // If job is already available in memory, initialize form instantly (0ms loading!)
  if (job.value) {
    form.value = {
      repair_action: job.value.repair_action || '',
      spareparts: (job.value.service_spareparts || []).map((item: any) => ({
        id: String(item.id),
        mode: item.product_id ? 'db' : 'manual',
        product_id: item.product_id ? String(item.product_id) : '',
        item_name: item.item_name || (item.product?.name || ''),
        qty: Number(item.qty) || 1,
      })),
      customer_signature: job.value.customer_signature || '',
      technician_signature: job.value.technician_signature || '',
      customer_name: job.value.customer_name || findCustomer(job.value.customer_id)?.pic_name || job.value.customer?.pic_name || '',
      technician_name: job.value.technician_name || findTechnician(job.value.technician_id)?.name || job.value.technician?.name || currentUser.value?.name || '',
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
      form.value = {
        repair_action: data.repair_action || form.value.repair_action || '',
        spareparts: (data.service_spareparts || []).map((item: any) => ({
          id: String(item.id),
          mode: item.product_id ? 'db' : 'manual',
          product_id: item.product_id ? String(item.product_id) : '',
          item_name: item.item_name || (item.product?.name || ''),
          qty: Number(item.qty) || 1,
        })),
        customer_signature: data.customer_signature || form.value.customer_signature || '',
        technician_signature: data.technician_signature || form.value.technician_signature || '',
        customer_name: data.customer_name || form.value.customer_name || '',
        technician_name: data.technician_name || form.value.technician_name || '',
        photo_before: data.photo_before || form.value.photo_before || '',
        photo_progress: data.photo_progress || form.value.photo_progress || '',
        photo_after: data.photo_after || form.value.photo_after || '',
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

async function saveRepairAction() {
  if (!form.value.repair_action.trim()) {
    toast.warning('Repair action is required before continuing.')
    return
  }
  if (isLoading.value || !job.value || isSaving.value) return
  isSaving.value = true
  try {
    await api.patch(`/service-reports/${realServiceReportId.value}`, {
      repair_action: form.value.repair_action,
      photo_before: form.value.photo_before,
      photo_progress: form.value.photo_progress,
      photo_after: form.value.photo_after,
    })
    currentStep.value = 2
  } catch (err: any) {
    toast.error(err.message || 'Failed to update repair action')
  } finally {
    isSaving.value = false
  }
}

function removeSparepart(index: number) {
  const [removed] = form.value.spareparts.splice(index, 1)
  if (removed?.id) removedSparepartIds.value.push(removed.id)
}

async function saveSparepartsAndContinue() {
  if (isLoading.value || !job.value || isSaving.value) return
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
    const response = await api.get<{ data: any }>(`/service-reports/${realServiceReportId.value}`, true, false)
    reportRecord.value = (response as any)?.data?.data || (response as any)?.data || response
    await refreshInBackground()
    form.value.spareparts = (reportRecord.value?.service_spareparts || []).map((item: any) => ({
      id: String(item.id),
      mode: item.product_id ? 'db' : 'manual',
      product_id: item.product_id ? String(item.product_id) : '',
      item_name: item.item_name || (item.product?.name || ''),
      qty: Number(item.qty) || 1,
    }))
    removedSparepartIds.value = []
    currentStep.value = 3
  } catch (err: any) {
    toast.error(err.message || 'Failed to update sparepart')
  } finally {
    isSaving.value = false
  }
}

async function saveSignatures() {
  if (!form.value.customer_signature || !form.value.technician_signature || !form.value.customer_name.trim()) {
    toast.warning('Customer name, customer signature, and technician signature are required.')
    return
  }
  if (isLoading.value || !job.value || isSaving.value) return
  isSaving.value = true
  try {
    await api.patch(`/service-reports/${realServiceReportId.value}`, {
      customer_signature: form.value.customer_signature,
      technician_signature: form.value.technician_signature,
      customer_name: form.value.customer_name,
      technician_name: form.value.technician_name,
      photo_before: form.value.photo_before,
      photo_progress: form.value.photo_progress,
      photo_after: form.value.photo_after,
    })
    toast.success('Service Report successfully updated.')
    await refreshInBackground()
    router.back()
  } catch (err: any) {
    toast.error(err.message || 'Failed to save signatures')
  } finally {
    isSaving.value = false
  }
}
</script>
<template>
  <div style="max-width: 800px; margin: 0 auto">
    <PageHeader title="Service Report Form" :back-button="true" @back="router.back()" />
    <div class="card p-lg mt-md">
      <div v-if="isLoading" class="form-loading" role="status">Loading service report...</div>
      <div v-else-if="!job" class="form-loading" role="alert">Service report not found. No new data created.</div>
      <div v-else-if="!isEditable" class="text-center p-xl text-muted">
        <p class="mb-md">Form is read-only because it has been completed or you are not authorized to edit it. Please view the digital report instead.</p>
        <div style="display: flex; justify-content: center; gap: 8px; margin-top: 16px;">
          <button type="button" class="btn btn-primary" @click="router.push(`/shared/service-reports/${realServiceReportId}`)">
            View Service Report
          </button>
          <button type="button" class="btn btn-outline" @click="router.back()">
            Back
          </button>
        </div>
      </div>
      <div v-else>
        <div class="wizard-steps" aria-label="Service report steps">
          <div v-for="(label, index) in ['Action', 'Sparepart', 'Signature']" :key="label" class="wizard-step" :class="{ active: currentStep === index + 1, complete: currentStep > index + 1 }">
            <span class="wizard-step-number">{{ currentStep > index + 1 ? '✓' : index + 1 }}</span>
            <span>{{ label }}</span>
          </div>
        </div>

        <Transition name="step" mode="out-in">
          <section v-if="currentStep === 1" key="repair" class="step-panel">
            <div class="form-group">
              <label class="form-label">Repair Action <span class="text-danger">*</span></label>
              <textarea v-model="form.repair_action" class="form-textarea" rows="5" placeholder="What was done to fix the problem?"></textarea>
            </div>
            
            <div class="form-group mt-lg">
              <label class="form-label">1. Foto Pengantaran / Problem</label>
              <div v-if="form.photo_before" class="photo-preview mb-sm">
                <img :src="form.photo_before" alt="Photo Before" style="max-width: 100%; max-height: 200px; border-radius: 8px;" />
                <button type="button" class="btn btn-outline btn-sm w-full mt-sm text-danger" @click="clearPhoto('before')">Remove Photo</button>
              </div>
              <div v-else class="flex gap-sm mt-xs" style="display: flex; gap: 8px;">
                <label class="btn btn-outline flex-1 cursor-pointer" style="display: flex; align-items: center; justify-content: center; gap: 8px; flex: 1; text-align: center; cursor: pointer; padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md);">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                  Ambil Foto
                  <input type="file" accept="image/*" capture="environment" style="display: none;" @change="e => handlePhoto(e, 'before')" ref="fileInputBefore" />
                </label>
                <label class="btn btn-outline flex-1 cursor-pointer" style="display: flex; align-items: center; justify-content: center; gap: 8px; flex: 1; text-align: center; cursor: pointer; padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md);">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.2 15c.7-1.2 1-2.5.7-3.9-.6-2-2.4-3.5-4.4-3.5h-1.2c-.7-3-3.2-5.2-6.2-5.6-3-.3-5.9 1.3-7.3 4-1.2 2.5-1 6.5.5 8.8m8.7-1.6V21"/><path d="M16 16l-4-4-4 4"/></svg>
                  Pilih File / Galeri
                  <input type="file" accept="image/*" style="display: none;" @change="e => handlePhoto(e, 'before')" />
                </label>
              </div>
            </div>
            
            <div class="form-group mt-lg">
              <label class="form-label">2. Foto Instal / Service</label>
              <div v-if="form.photo_progress" class="photo-preview mb-sm">
                <img :src="form.photo_progress" alt="Foto Pengerjaan" style="max-width: 100%; max-height: 200px; border-radius: 8px;" />
                <button type="button" class="btn btn-outline btn-sm w-full mt-sm text-danger" @click="clearPhoto('progress')">Remove Photo</button>
              </div>
              <div v-else class="flex gap-sm mt-xs" style="display: flex; gap: 8px;">
                <label class="btn btn-outline flex-1 cursor-pointer" style="display: flex; align-items: center; justify-content: center; gap: 8px; flex: 1; text-align: center; cursor: pointer; padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md);">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                  Ambil Foto
                  <input type="file" accept="image/*" capture="environment" style="display: none;" @change="e => handlePhoto(e, 'progress')" ref="fileInputProgress" />
                </label>
                <label class="btn btn-outline flex-1 cursor-pointer" style="display: flex; align-items: center; justify-content: center; gap: 8px; flex: 1; text-align: center; cursor: pointer; padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md);">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.2 15c.7-1.2 1-2.5.7-3.9-.6-2-2.4-3.5-4.4-3.5h-1.2c-.7-3-3.2-5.2-6.2-5.6-3-.3-5.9 1.3-7.3 4-1.2 2.5-1 6.5.5 8.8m8.7-1.6V21"/><path d="M16 16l-4-4-4 4"/></svg>
                  Pilih File / Galeri
                  <input type="file" accept="image/*" style="display: none;" @change="e => handlePhoto(e, 'progress')" />
                </label>
              </div>
            </div>

            <div class="form-group mt-lg">
              <label class="form-label">3. Foto Selesai</label>
              <div v-if="form.photo_after" class="photo-preview mb-sm">
                <img :src="form.photo_after" alt="Photo After" style="max-width: 100%; max-height: 200px; border-radius: 8px;" />
                <button type="button" class="btn btn-outline btn-sm w-full mt-sm text-danger" @click="clearPhoto('after')">Remove Photo</button>
              </div>
              <div v-else class="flex gap-sm mt-xs" style="display: flex; gap: 8px;">
                <label class="btn btn-outline flex-1 cursor-pointer" style="display: flex; align-items: center; justify-content: center; gap: 8px; flex: 1; text-align: center; cursor: pointer; padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md);">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                  Ambil Foto
                  <input type="file" accept="image/*" capture="environment" style="display: none;" @change="e => handlePhoto(e, 'after')" ref="fileInputAfter" />
                </label>
                <label class="btn btn-outline flex-1 cursor-pointer" style="display: flex; align-items: center; justify-content: center; gap: 8px; flex: 1; text-align: center; cursor: pointer; padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md);">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.2 15c.7-1.2 1-2.5.7-3.9-.6-2-2.4-3.5-4.4-3.5h-1.2c-.7-3-3.2-5.2-6.2-5.6-3-.3-5.9 1.3-7.3 4-1.2 2.5-1 6.5.5 8.8m8.7-1.6V21"/><path d="M16 16l-4-4-4 4"/></svg>
                  Pilih File / Galeri
                  <input type="file" accept="image/*" style="display: none;" @change="e => handlePhoto(e, 'after')" />
                </label>
              </div>
            </div>

            <button class="btn btn-primary w-full mt-lg" :disabled="isSaving" @click="saveRepairAction">
              {{ isSaving ? 'Saving...' : 'Save & Continue to Sparepart' }}
            </button>
          </section>

          <section v-else-if="currentStep === 2" key="spareparts" class="step-panel">
            <div class="form-group sparepart-list">
              <label class="form-label">Direct Component Replacement <span class="text-muted">(Optional)</span></label>
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
                  <CustomSelect v-if="sp.mode === 'db'" v-model="sp.product_id" class="form-select" :options="productOptions" placeholder="Select Component..." />
                  <input v-else v-model="sp.item_name" type="text" class="form-input" placeholder="Ketik nama sparepart / komponen..." />
                  <input v-model.number="sp.qty" type="number" class="form-input qty-input" min="1" placeholder="Qty">
                </div>
              </div>
              <button type="button" class="btn btn-outline add-sparepart" @click="form.spareparts.push({ mode: 'db', product_id: '', item_name: '', qty: 1 })">
                + Add Sparepart
              </button>
              <p v-if="form.spareparts.length === 0" class="form-hint">No spareparts? Continue to signatures.</p>
            </div>
            <div class="step-actions">
              <button class="btn btn-outline" :disabled="isSaving" @click="currentStep = 1">Back</button>
              <button class="btn btn-primary" :disabled="isSaving" @click="saveSparepartsAndContinue">
                {{ isSaving ? 'Saving...' : form.spareparts.length ? 'Save & Continue' : 'Skip & Continue' }}
              </button>
            </div>
          </section>

          <section v-else key="signatures" class="step-panel signature-step">
            <div class="signature-field">
              <label class="form-label">Customer Type</label>
              <input :value="customerType" type="text" class="form-input" readonly disabled>
              <label class="form-label mt-sm">Customer / PIC Name <span class="text-danger">*</span></label>
              <input v-model="form.customer_name" type="text" class="form-input" placeholder="Customer PIC name">
              <label class="form-label mt-sm">Customer Signature <span class="text-danger">*</span></label>
              <SignaturePad v-model="form.customer_signature" height="180px" />
            </div>
            <div class="signature-field">
              <label class="form-label">Technician Name</label>
              <input v-model="form.technician_name" type="text" class="form-input" readonly disabled>
              <label class="form-label mt-sm">Technician Signature <span class="text-danger">*</span></label>
              <SignaturePad v-model="form.technician_signature" height="180px" />
            </div>
            <div class="step-actions">
              <button class="btn btn-outline" :disabled="isSaving" @click="currentStep = 2">Back</button>
              <button class="btn btn-primary" :disabled="isSaving" @click="saveSignatures">
                {{ isSaving ? 'Saving...' : 'Save & Complete Form' }}
              </button>
            </div>
          </section>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-loading {
  padding: 24px;
  border-radius: 8px;
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  text-align: center;
}

.wizard-steps {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
}

.wizard-step {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.wizard-step-number {
  display: grid;
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-surface);
}

.wizard-step.active,
.wizard-step.complete {
  color: var(--color-primary);
  font-weight: var(--font-weight-semibold);
}

.wizard-step.active .wizard-step-number,
.wizard-step.complete .wizard-step-number {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}

.step-panel {
  display: grid;
  gap: 20px;
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
.signature-step { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.signature-field { min-width: 0; }
.step-actions { display: flex; justify-content: space-between; gap: 12px; grid-column: 1 / -1; }

.step-enter-active,
.step-leave-active { transition: opacity 160ms ease, transform 160ms ease; }
.step-enter-from { opacity: 0; transform: translateX(12px); }
.step-leave-to { opacity: 0; transform: translateX(-12px); }

@media (max-width: 640px) {
  .wizard-step { flex-direction: column; align-items: flex-start; gap: 6px; font-size: 11px; }
  .sparepart-row { grid-template-columns: minmax(0, 1fr) 72px; }
  .remove-sparepart { grid-column: 1 / -1; }
  .signature-step { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .step-enter-active,
  .step-leave-active { transition: none; }
}
</style>
