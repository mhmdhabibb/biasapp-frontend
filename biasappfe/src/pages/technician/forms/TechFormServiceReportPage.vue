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
  repair_action: '',
  spareparts: [] as any[],
  customer_signature: '',
  technician_signature: '',
  customer_name: '',
  technician_name: '',
})
const isLoading = ref(true)
const isSaving = ref(false)
const currentStep = ref(1)
const removedSparepartIds = ref<string[]>([])

const productOptions = computed(() =>
  products.value.map((product: any) => ({ value: product.id, label: product.name })),
)

onMounted(async () => {
  try {
    const response = await api.get<{ data: any }>(`/service-reports/${serviceId}`)
    reportRecord.value = response.data
    if (!job.value) throw new Error('Service report not found')
    form.value = {
      repair_action: job.value.repair_action || '',
      spareparts: (job.value.service_spareparts || []).map((item: any) => ({
        id: String(item.id),
        product_id: String(item.product_id),
        qty: Number(item.qty) || 1,
      })),
      customer_signature: job.value.customer_signature || '',
      technician_signature: job.value.technician_signature || '',
      customer_name: job.value.customer_name || findCustomer(job.value.customer_id)?.pic_name || job.value.customer?.pic_name || '',
      technician_name: job.value.technician_name || findTechnician(job.value.technician_id)?.name || job.value.technician?.name || currentUser.value?.name || '',
    }
  } catch (err: any) {
    toast.error(err.message || 'Failed to load service report')
  } finally {
    isLoading.value = false
  }
})

async function saveRepairAction() {
  if (!form.value.repair_action.trim()) {
    toast.warning('Repair action is required before continuing.')
    return
  }
  if (isLoading.value || !job.value || isSaving.value) return
  isSaving.value = true
  try {
    await api.patch(`/service-reports/${serviceId}`, {
      repair_action: form.value.repair_action,
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
    const response = await api.get<{ data: any }>(`/service-reports/${serviceId}`)
    reportRecord.value = response.data
    await refreshInBackground()
    form.value.spareparts = (reportRecord.value?.service_spareparts || []).map((item: any) => ({
      id: String(item.id),
      product_id: String(item.product_id),
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
    await api.patch(`/service-reports/${serviceId}`, {
      customer_signature: form.value.customer_signature,
      technician_signature: form.value.technician_signature,
      customer_name: form.value.customer_name,
      technician_name: form.value.technician_name,
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
            <button class="btn btn-primary w-full" :disabled="isSaving" @click="saveRepairAction">
              {{ isSaving ? 'Saving...' : 'Save & Continue to Sparepart' }}
            </button>
          </section>

          <section v-else-if="currentStep === 2" key="spareparts" class="step-panel">
            <div class="form-group sparepart-list">
              <label class="form-label">Direct Component Replacement <span class="text-muted">(Optional)</span></label>
              <div v-for="(sp, index) in form.spareparts" :key="sp.id || index" class="sparepart-row">
                <CustomSelect v-model="sp.product_id" class="form-select" :options="productOptions" placeholder="Select Component..." />
                <input v-model.number="sp.qty" type="number" class="form-input qty-input" min="1" placeholder="Qty">
                <button type="button" class="btn btn-outline remove-sparepart" :aria-label="`Remove sparepart ${index + 1}`" @click="removeSparepart(index)">Delete</button>
              </div>
              <button type="button" class="btn btn-outline add-sparepart" @click="form.spareparts.push({ product_id: '', qty: 1 })">
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
