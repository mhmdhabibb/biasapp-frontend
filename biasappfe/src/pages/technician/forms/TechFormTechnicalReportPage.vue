<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMasterStore } from '@/composables/useMasterStore'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import PageHeader from '@/components/ui/PageHeader.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { serviceReports, refresh } = useMasterStore()

const serviceId = String(route.params.id)
const job = computed(() => serviceReports.value.find(sr => String(sr.id) === serviceId))

const form = ref({
  remarks: job.value?.remarks || '',
  notes: job.value?.notes || '',
  is_tested: job.value?.is_tested || false,
})

async function saveForm() {
  try {
    await api.patch(`/service-reports/${serviceId}`, {
      remarks: form.value.remarks,
      notes: form.value.notes,
      is_tested: form.value.is_tested
    })
    toast.success('Technical Report saved successfully')
    await refresh(true)
    router.back()
  } catch (err: any) {
    toast.error(err.message || 'Failed to save form')
  }
}
</script>
<template>
  <div style="max-width: 800px; margin: 0 auto">
    <PageHeader title="Technical Report Form" :back-button="true" @back="router.back()" />
    <div class="card p-lg mt-md">
      <div class="form-group">
        <label class="form-label">Hasil Pemeriksaan / Root Cause <span class="text-danger">*</span></label>
        <textarea v-model="form.remarks" class="form-textarea" rows="4" placeholder="Deskripsikan hasil pengecekan unit..."></textarea>
      </div>
      
      <div class="form-group">
        <label class="form-label">Catatan Tambahan (Internal)</label>
        <textarea v-model="form.notes" class="form-textarea" rows="3" placeholder="Catatan operasional..."></textarea>
      </div>

      <div class="form-group mt-lg">
        <label class="flex items-center gap-sm cursor-pointer p-md" style="background: var(--color-surface-sunken); border-radius: var(--radius-sm)">
          <input type="checkbox" v-model="form.is_tested" style="width: 20px; height: 20px;">
          <span class="font-bold">Mesin sudah dilakukan testing dan berfungsi normal. <span class="text-danger">*</span></span>
        </label>
      </div>

      <div class="mt-xl">
        <button class="btn btn-primary w-full" style="padding: 12px; font-size: 16px;" @click="saveForm">Simpan Technical Report</button>
      </div>
    </div>
  </div>
</template>
