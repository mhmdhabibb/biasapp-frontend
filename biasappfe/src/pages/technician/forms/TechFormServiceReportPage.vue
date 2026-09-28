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
const { serviceReports, products, refresh } = useMasterStore()

const serviceId = String(route.params.id)
const job = computed(() => serviceReports.value.find(sr => String(sr.id) === serviceId))

const form = ref({
  repair_action: job.value?.repair_action || '',
  spareparts: [] as any[]
})

async function saveForm() {
  try {
    await api.patch(`/service-reports/${serviceId}`, {
      repair_action: form.value.repair_action,
    })
    for (const sp of form.value.spareparts) {
      if (sp.product_id && sp.qty > 0) {
        await api.post('/service-spareparts/', {
          service_report_id: serviceId,
          product_id: sp.product_id,
          qty: Number(sp.qty)
        })
      }
    }
    toast.success('Service Report saved successfully')
    await refresh(true)
    router.back()
  } catch (err: any) {
    toast.error(err.message || 'Failed to save form')
  }
}
</script>
<template>
  <div style="max-width: 800px; margin: 0 auto">
    <PageHeader title="Service Report Form" :back-button="true" @back="router.back()" />
    <div class="card p-lg mt-md">
      <div class="form-group">
        <label class="form-label">Tindakan Perbaikan <span class="text-danger">*</span></label>
        <textarea v-model="form.repair_action" class="form-textarea" rows="4" placeholder="Apa yang dilakukan untuk memperbaiki masalah?"></textarea>
      </div>
      
      <div class="form-group mt-md" style="padding: 12px; border: 1px dashed var(--color-border); border-radius: var(--radius-md);">
        <label class="form-label">Penggantian Komponen Langsung</label>
        <div v-for="(sp, idx) in form.spareparts" :key="idx" style="display: flex; gap: 8px; margin-bottom: 10px;">
          <select v-model="sp.product_id" class="form-select" style="flex: 1;">
            <option value="" disabled>Pilih Komponen...</option>
            <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <input type="number" v-model="sp.qty" class="form-input" style="width: 80px;" min="1" placeholder="Qty">
          <button type="button" class="btn btn-sm btn-outline" style="color: var(--color-danger); border-color: var(--color-danger);" @click="form.spareparts.splice(idx, 1)">x</button>
        </div>
        <button type="button" class="btn btn-sm btn-outline mt-xs w-full" style="border-style: dashed;" @click="form.spareparts.push({product_id: '', qty: 1})">
          + Tambah Penggunaan Sparepart
        </button>
      </div>

      <div class="mt-xl">
        <button class="btn btn-primary w-full" style="padding: 12px; font-size: 16px;" @click="saveForm">Simpan Service Report</button>
      </div>
    </div>
  </div>
</template>
