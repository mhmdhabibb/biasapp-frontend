<script setup lang="ts">
// @ts-nocheck
// Standalone Service History — sisi Teknisi (list).
// Difilter sesuai teknisi yang login (admin/superadmin melihat semua).
import { computed, ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { resources } from '@/services/resource.service'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const { currentUser } = useAuth()
const { can } = usePermission()
const { ensureResourcesLoaded } = useMasterStore()
const { deliveryOrders, findCustomer, findTechnician, getTechnicianIdByUser, refreshOnly } = useMasterStore()

onMounted(() => {
  ensureResourcesLoaded(route.path)
  void refreshOnly(['deliveryOrders', 'technicians', 'customers'])
})
const deletingId = ref<string | null>(null)

const isSuperadminOrAdmin = computed(() => {
  const r = String(currentUser.value?.role || '').trim().toLowerCase()
  return r === 'superadmin' || r === 'admin'
})

const myTechId = computed(() => getTechnicianIdByUser(currentUser.value?.id || null))

function isMyStandalone(d: any): boolean {
  if (isSuperadminOrAdmin.value) return true
  const techId = myTechId.value ? String(myTechId.value) : ''
  const userId = currentUser.value?.id ? String(currentUser.value.id) : ''
  const dTechId = d?.technician_id ? String(d.technician_id) : ''
  if (!techId && !userId) return false
  return (techId && dTechId === techId) || (userId && dTechId === userId)
}

const standaloneList = computed(() =>
  ((deliveryOrders?.value || []) as any[])
    .filter((d: any) => String(d.do_type || '').toLowerCase() === 'service')
    .filter(isMyStandalone)
    .sort((a: any, b: any) =>
      String(b.created_at || b.delivery_date || '').localeCompare(String(a.created_at || a.delivery_date || '')),
    ),
)

function customerName(id: any): string {
  const c: any = findCustomer(id)
  return c ? (c.company_name || c.name || '-') : '-'
}
function techName(id: any): string {
  const t: any = findTechnician(id)
  return t ? (t.user?.name || t.name || '-') : '-'
}
function isFilled(row: any): boolean {
  return !!(row?.action || row?.is_tested || row?.is_completed || row?.technician_signature || (row?.delivery_order_items || []).length)
}
function isPending(row: any): boolean {
  return String(row?.status || '').toLowerCase() === 'pending'
}
const currentPage = ref(1)
const perPage = 10
const totalPages = computed(() => Math.max(1, Math.ceil(standaloneList.value.length / perPage)))
const paginatedList = computed(() => {
  const start = (currentPage.value - 1) * perPage
  return standaloneList.value.slice(start, start + perPage)
})

async function removeStandalone(row: any) {
  if (!isPending(row)) return
  if (!confirm(`Hapus form stand alone ${row.do_number || ''} yang masih pending?`)) return
  deletingId.value = String(row.id)
  try {
    await resources.deliveryOrders.remove(String(row.id))
    await refreshOnly(['deliveryOrders'])
    toast.success('Form stand alone dihapus.')
  } catch (err: any) {
    toast.error(err?.message || 'Gagal menghapus form.')
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <div class="tech-standalone">
    <PageHeader title="Service History Mandiri" />

    <div class="card mb-lg p-lg hint">
      Standalone form <strong>without assigned job</strong>. Customer details are filled by CS — technician only fills <strong>Product Detail</strong>.
    </div>

    <div class="card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Date</th>
              <th>Product Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedList" :key="row.id">
              <td>
                <div class="font-bold">{{ customerName(row.customer_id) }}</div>
                <div class="text-xs text-muted">{{ row.delivery_address || '-' }}</div>
              </td>
              <td>{{ row.delivery_date ? new Date(row.delivery_date).toLocaleDateString('en-GB') : '-' }}</td>
              <td>
                <span class="badge" :class="row.status === 'draft' ? 'badge-secondary' : isFilled(row) ? 'badge-success' : 'badge-warning'">
                  {{ row.status === 'draft' ? 'DRAFT' : isFilled(row) ? 'COMPLETED' : 'PENDING' }}
                </span>
                <div class="text-xs text-muted mt-xs">Technician: {{ techName(row.technician_id) }}</div>
              </td>
              <td>
                <button
                  type="button"
                  class="btn btn-sm btn-primary"
                  @click="router.push(`/technician/standalone-service-history/${row.id}`)"
                >
                  {{ row.status === 'draft' ? 'Continue Draft' : isFilled(row) ? 'View / Continue' : 'Fill Product Detail' }}
                </button>
                <button
                  v-if="can('delivery_order:delete') && isPending(row)"
                  type="button"
                  class="btn btn-sm btn-outline btn-danger"
                  style="margin-left: 6px;"
                  :disabled="deletingId === String(row.id)"
                  @click="removeStandalone(row)"
                >
                  {{ deletingId === String(row.id) ? 'Deleting...' : 'Delete' }}
                </button>
              </td>
            </tr>
            <tr v-if="standaloneList.length === 0">
              <td colspan="5" class="text-center py-lg text-muted">No forms from CS yet.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile Cards View -->
      <div class="mobile-standalone-list">
        <div v-for="row in paginatedList" :key="row.id" class="mobile-standalone-card">
          <div class="m-sa-header">
            <span class="m-sa-title font-bold">{{ customerName(row.customer_id) }}</span>
            <span class="badge" :class="row.status === 'draft' ? 'badge-secondary' : isFilled(row) ? 'badge-success' : 'badge-warning'">
              {{ row.status === 'draft' ? 'DRAFT' : isFilled(row) ? 'COMPLETED' : 'PENDING' }}
            </span>
          </div>

          <div class="m-sa-body">
            <div class="m-row" v-if="row.delivery_address">
              <span class="m-label">Address:</span>
              <span class="m-val">{{ row.delivery_address }}</span>
            </div>
            <div class="m-row">
              <span class="m-label">Date:</span>
              <span class="m-val">{{ row.delivery_date ? new Date(row.delivery_date).toLocaleDateString('en-GB') : '-' }}</span>
            </div>
            <div class="m-row">
              <span class="m-label">Technician:</span>
              <span class="m-val">{{ techName(row.technician_id) }}</span>
            </div>
          </div>

          <div class="m-sa-footer">
            <button
              type="button"
              class="btn btn-sm btn-primary w-full"
              @click="router.push(`/technician/standalone-service-history/${row.id}`)"
            >
              {{ row.status === 'draft' ? 'Continue Draft →' : isFilled(row) ? 'View / Continue Detail →' : 'Fill Product Detail →' }}
            </button>
            <button
              v-if="can('delivery_order:delete') && isPending(row)"
              type="button"
              class="btn btn-sm btn-outline btn-danger"
              style="margin-top: 6px;"
              :disabled="deletingId === String(row.id)"
              @click="removeStandalone(row)"
            >
              {{ deletingId === String(row.id) ? 'Deleting...' : 'Delete Form' }}
            </button>
          </div>
        </div>
        <div v-if="standaloneList.length === 0" class="text-center py-lg text-muted">
          No forms from CS yet.
        </div>
      </div>

      <div v-if="totalPages > 1" class="pagination" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-top: 1px solid var(--color-border-light);">
        <div class="pagination-info" style="font-size: 13px; color: var(--color-text-muted);">
          Menampilkan {{ (currentPage - 1) * perPage + 1 }}-{{ Math.min(currentPage * perPage, standaloneList.length) }} dari {{ standaloneList.length }} data
        </div>
        <div class="pagination-buttons" style="display: flex; gap: 6px;">
          <button class="btn btn-outline btn-sm" :disabled="currentPage === 1" @click="currentPage--">Prev</button>
          <button v-for="p in totalPages" :key="p" class="btn btn-sm" :class="p === currentPage ? 'btn-primary' : 'btn-outline'" @click="currentPage = p">{{ p }}</button>
          <button class="btn btn-outline btn-sm" :disabled="currentPage === totalPages" @click="currentPage++">Next</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hint {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  font-size: 13px;
}
.font-bold { font-weight: 700; }
.text-xs { font-size: 12px; }
.text-muted { color: var(--color-text-muted); }
.mt-xs { margin-top: 4px; }

.mobile-standalone-list {
  display: none;
}

@media (max-width: 768px) {
  .table-responsive {
    display: none;
  }

  .mobile-standalone-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
  }

  .mobile-standalone-card {
    background: var(--color-surface, #ffffff);
    border: 1px solid var(--color-border-light, #e2e8f0);
    border-radius: var(--radius-md, 10px);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04));
  }

  .m-sa-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }

  .m-sa-title {
    font-size: 14px;
    color: var(--color-text, #0f172a);
  }

  .m-sa-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }

  .m-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .m-label {
    color: var(--color-text-muted, #64748b);
  }

  .m-val {
    text-align: right;
  }

  .m-sa-footer {
    display: flex;
    flex-direction: column;
    border-top: 1px dashed var(--color-border-light, #e2e8f0);
    padding-top: 10px;
  }
}
</style>
