<script setup lang="ts">
// @ts-nocheck
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import PageHeader from '@/components/ui/PageHeader.vue'

const route = useRoute()
const router = useRouter()
const { currentUser } = useAuth()
const {
  serviceReports,
  products,
  sparepartRequests
} = useMasterStore()

const serviceId = Number(route.query.service_id) || null

// In a real app, products would be filtered to spareparts category
const availableSpareparts = computed(() => products.value)

const form = ref({
  service_report_id: serviceId,
  product_id: null as any,
  qty: 1,
  notes: ''
})

function submitRequest() {
  if (!form.value.product_id) return alert('Pilih sparepart!')
  if (form.value.qty < 1) return alert('Quantity harus minimal 1!')
  
  if (confirm('Submit request sparepart? Status pekerjaan akan menjadi Waiting Sparepart.')) {
    const sr = serviceReports.value.find(s => s.id === form.value.service_report_id)
    if (sr) {
      sr.status = 'waiting_sparepart'
    }

    sparepartRequests.value.push({
      id: Date.now(),
      request_no: `SRQ-${Date.now().toString().slice(-6)}`,
      service_report_id: form.value.service_report_id,
      product_id: form.value.product_id,
      qty: form.value.qty,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })

    alert('Request sparepart berhasil dikirim ke Admin/CS/Inventory.')
    if (form.value.service_report_id) {
      router.push(`/technician/call-services/${form.value.service_report_id}`)
    } else {
      router.push('/technician/dashboard')
    }
  }
}
</script>

<template>
  <div class="tech-sparepart">
    <PageHeader title="Request Sparepart" :back-button="true" @back="router.back()" />

    <div class="card p-lg" style="max-width: 600px; margin: 0 auto;">
      <h2 class="card-title mb-md">Form Request Sparepart</h2>

      <div class="form-group">
        <label class="form-label">Terkait Pekerjaan (Service No)</label>
        <select v-model="form.service_report_id" class="form-select">
          <option :value="null">-- Pilih Service Report --</option>
          <option v-for="sr in serviceReports.filter(s => s.technician_id === currentUser?.id && s.status !== 'completed')" :key="sr.id" :value="sr.id">
            {{ sr.service_report_no }}
          </option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Sparepart <span class="text-danger">*</span></label>
        <select v-model="form.product_id" class="form-select">
          <option :value="null">-- Pilih Sparepart --</option>
          <option v-for="p in availableSpareparts" :key="p.id" :value="p.id">
            {{ p.name }} (Stok: {{ p.stock }})
          </option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Quantity <span class="text-danger">*</span></label>
        <input v-model.number="form.qty" type="number" min="1" class="form-input">
      </div>

      <div class="form-group">
        <label class="form-label">Keterangan / Alasan</label>
        <textarea v-model="form.notes" class="form-textarea" rows="3" placeholder="Contoh: Roller aus, drum bergaris, dll..."></textarea>
      </div>

      <div class="mt-lg pt-md" style="border-top: 1px solid var(--color-border-light)">
        <button class="btn btn-primary w-full" style="padding: var(--space-md); font-size: 16px;" @click="submitRequest">
          Submit Request
        </button>
      </div>
    </div>
  </div>
</template>
