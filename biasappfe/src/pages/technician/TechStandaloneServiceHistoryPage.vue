<script setup lang="ts">
// @ts-nocheck
// Standalone Service History — sisi Teknisi (list).
// Tanpa assign job: semua teknisi bisa melihat & mengisi PRODUCT DETAIL.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { resources } from '@/services/resource.service'

const router = useRouter()
const toast = useToast()
const { can } = usePermission()
const { deliveryOrders, findCustomer, findTechnician, refreshOnly } = useMasterStore()
const deletingId = ref<string | null>(null)

const standaloneList = computed(() =>
  (deliveryOrders.value as any[]).filter(
    (d: any) => String(d.do_type || '').toLowerCase() === 'service',
  ).sort((a: any, b: any) =>
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
      Form tersendiri <strong>tanpa assign job</strong>. Customer detail sudah diisi CS — teknisi tinggal isi <strong>Product Detail</strong>.
    </div>

    <div class="card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>No. Service</th>
              <th>Customer</th>
              <th>Tanggal</th>
              <th>Status Produk</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in standaloneList" :key="row.id">
              <td class="font-bold">{{ row.do_number || '-' }}</td>
              <td>
                <div>{{ customerName(row.customer_id) }}</div>
                <div class="text-xs text-muted">{{ row.delivery_address || '-' }}</div>
              </td>
              <td>{{ row.delivery_date ? new Date(row.delivery_date).toLocaleDateString('en-GB') : '-' }}</td>
              <td>
                <span class="badge" :class="isFilled(row) ? 'badge-success' : 'badge-warning'">
                  {{ isFilled(row) ? 'SUDAH DIISI' : 'BELUM DIISI' }}
                </span>
                <div class="text-xs text-muted mt-xs">Teknisi: {{ techName(row.technician_id) }}</div>
              </td>
              <td>
                <button
                  type="button"
                  class="btn btn-sm btn-primary"
                  @click="router.push(`/technician/standalone-service-history/${row.id}`)"
                >
                  {{ isFilled(row) ? 'Lihat / Lanjut' : 'Isi Product Detail' }}
                </button>
                <button
                  v-if="can('delivery_order:delete') && isPending(row)"
                  type="button"
                  class="btn btn-sm btn-outline btn-danger"
                  style="margin-left: 6px;"
                  :disabled="deletingId === String(row.id)"
                  @click="removeStandalone(row)"
                >
                  {{ deletingId === String(row.id) ? 'Menghapus...' : 'Hapus' }}
                </button>
              </td>
            </tr>
            <tr v-if="standaloneList.length === 0">
              <td colspan="5" class="text-center py-lg text-muted">Belum ada form dari CS.</td>
            </tr>
          </tbody>
        </table>
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
</style>
