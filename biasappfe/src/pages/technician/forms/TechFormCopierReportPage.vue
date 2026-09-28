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
  reading_counter: job.value?.reading_counter || 0,
  copy_quality: 'Good'
})

async function saveForm() {
  try {
    await api.patch(`/service-reports/${serviceId}`, {
      reading_counter: form.value.reading_counter
    })
    toast.success('Copier Report saved successfully')
    await refresh(true)
    router.back()
  } catch (err: any) {
    toast.error(err.message || 'Failed to save form')
  }
}
</script>
<template>
  <div style="max-width: 800px; margin: 0 auto">
    <PageHeader title="Copier Service Report" :back-button="true" @back="router.back()" />
    <div class="card p-lg mt-md">
      <div class="form-group">
        <label class="form-label">Meter Reading (Counter) <span class="text-danger">*</span></label>
        <input type="number" v-model="form.reading_counter" class="form-input" min="0">
      </div>
      
      <div class="form-group">
        <label class="form-label">Copy Quality Check</label>
        <select v-model="form.copy_quality" class="form-select">
          <option>Good</option>
          <option>Fair</option>
          <option>Poor</option>
        </select>
      </div>

      <div class="mt-xl">
        <button class="btn btn-primary w-full" style="padding: 12px; font-size: 16px;" @click="saveForm">Simpan Copier Report</button>
      </div>
    </div>
  </div>
</template>
