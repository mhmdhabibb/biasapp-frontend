<script setup lang="ts">
// @ts-nocheck
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { useToast } from '@/composables/useToast'
import { usePermission } from '@/composables/usePermission'
import { api } from '@/services/api'
import PageHeader from '@/components/ui/PageHeader.vue'

const toast = useToast()
const { can } = usePermission()

const route = useRoute()
const router = useRouter()
const { currentUser } = useAuth()
const {
  products,
  serviceReports,
  getTechnicianIdByUser,
  refresh
} = useMasterStore()

const serviceId = String(route.query.service_id || '') || null

// service_report.technician_id references technicians.id, not users.id
const myTechId = computed(() => getTechnicianIdByUser(currentUser.value?.id || null))

const myActiveReports = computed(() =>
  serviceReports.value.filter(
    s => String(s.technician_id) === String(myTechId.value) && s.status !== 'completed'
  )
)

// In a real app, products would be filtered to spareparts category
const availableSpareparts = computed(() => products.value)

const form = ref({
  service_report_id: serviceId,
  product_id: null as any,
  qty: 1
})

async function submitRequest() {
  if (!form.value.service_report_id) return toast.warning('Pilih pekerjaan terlebih dahulu!')
  if (!form.value.product_id) return toast.warning('Pilih sparepart!')
  if (form.value.qty < 1) return toast.warning('Quantity harus minimal 1!')

  if (confirm('Submit request sparepart?')) {
    try {
      await api.post('/service-spareparts/', {
        service_report_id: form.value.service_report_id,
        product_id: form.value.product_id,
        qty: Number(form.value.qty)
      })
      await refresh(true)
      toast.success('Request sparepart berhasil dikirim ke Admin/CS/Inventory.')
      router.push(`/technician/call-services/${form.value.service_report_id}`)
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengirim request sparepart')
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
          <option v-for="sr in myActiveReports" :key="sr.id" :value="sr.id">
            {{ sr.report_no }}
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

      <div class="mt-lg pt-md" style="border-top: 1px solid var(--color-border-light)">
        <button v-if="can('service_sparepart:create')" class="btn btn-primary w-full" style="padding: var(--space-md); font-size: 16px;" @click="submitRequest">
          Submit Request
        </button>
      </div>
    </div>
  </div>
</template>
