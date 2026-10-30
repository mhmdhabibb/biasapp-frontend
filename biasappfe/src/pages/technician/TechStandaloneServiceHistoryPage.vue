<script setup lang="ts">
// @ts-nocheck
// Standalone Service History — sisi Teknisi (list).
// Difilter sesuai teknisi yang login (admin/superadmin melihat semua).
// Fitur: Edit, Assign (buat Job Order), Delete.
import { computed, ref, reactive, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import PageHeader from '@/components/ui/PageHeader.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import FormModal from '@/components/ui/FormModal.vue'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { resources } from '@/services/resource.service'
import { api } from '@/services/api'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const { currentUser } = useAuth()
const { can } = usePermission()
const { ensureResourcesLoaded } = useMasterStore()
const { deliveryOrders, jobOrders, technicians, customers, findCustomer, findTechnician, getTechnicianIdByUser, refreshOnly } = useMasterStore()

const rawDeliveryOrders = ref<any[]>([])
const isLoading = ref(false)

async function loadStandaloneData() {
  isLoading.value = true
  try {
    const res: any = await api.get('/delivery-orders/?limit=200', true, false)
    const raw = Array.isArray(res?.data)
      ? res.data
      : Array.isArray(res?.data?.items)
        ? res.data.items
        : Array.isArray(res)
          ? res
          : []
    rawDeliveryOrders.value = raw
  } catch (err) {
    console.error('Failed to load standalone data:', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  ensureResourcesLoaded(route.path)
  void refreshOnly(['deliveryOrders', 'technicians', 'customers', 'jobOrders'])
  await loadStandaloneData()
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

const standaloneList = computed(() => {
  const source = rawDeliveryOrders.value.length > 0
    ? rawDeliveryOrders.value
    : ((deliveryOrders?.value || []) as any[])
  return source
    .filter((d: any) => String(d?.do_type || '').toLowerCase() === 'service')
    .filter(isMyStandalone)
    .sort((a: any, b: any) =>
      String(b?.created_at || b?.delivery_date || '').localeCompare(String(a?.created_at || a?.delivery_date || '')),
    )
})

// ── Job Orders yang terkait DO (by delivery_order_id) ──
function findJobOrderForDO(doId: string): any {
  return ((jobOrders?.value || []) as any[]).find(
    (jo: any) => jo.delivery_order_id && String(jo.delivery_order_id) === String(doId)
  ) || null
}

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
function statusLabel(row: any): string {
  if (row.status === 'draft') return 'DRAFT'
  if (row.status === 'in_progress') return 'IN PROGRESS'
  if (row.status === 'completed' || row.status === 'delivered') return 'COMPLETED'
  if (isFilled(row)) return 'FILLED'
  return 'PENDING'
}
function statusClass(row: any): string {
  if (row.status === 'draft') return 'badge-secondary'
  if (row.status === 'in_progress') return 'badge-info'
  if (row.status === 'completed' || row.status === 'delivered') return 'badge-success'
  if (isFilled(row)) return 'badge-success'
  return 'badge-warning'
}

function itemsSummary(row: any): string {
  const items = row?.delivery_order_items || []
  if (!items.length) return '-'
  return items.map((it: any) => {
    if (it.model) return it.model
    if (it.serial_no) return it.serial_no
    return 'Item'
  }).join(', ')
}

const currentPage = ref(1)
const perPage = 10
const totalPages = computed(() => Math.max(1, Math.ceil(standaloneList.value.length / perPage)))
const paginatedList = computed(() => {
  const start = (currentPage.value - 1) * perPage
  return standaloneList.value.slice(start, start + perPage)
})

// ══════════════════════════════════════════════════
// DELETE
// ══════════════════════════════════════════════════
async function removeStandalone(row: any) {
  if (!confirm(`Hapus form stand alone ${row.do_number || ''} ?`)) return
  deletingId.value = String(row.id)
  try {
    // Jika ada Job Order terhubung, hapus juga
    const linkedJO = findJobOrderForDO(row.id)
    if (linkedJO) {
      try { await resources.jobOrders.remove(String(linkedJO.id)) } catch {}
    }
    await resources.deliveryOrders.remove(String(row.id))
    await loadStandaloneData()
    void refreshOnly(['deliveryOrders', 'jobOrders'])
    toast.success('Form stand alone dihapus.')
  } catch (err: any) {
    toast.error(err?.message || 'Gagal menghapus form.')
  } finally {
    deletingId.value = null
  }
}

// ══════════════════════════════════════════════════
// EDIT MODAL
// ══════════════════════════════════════════════════
const showEditModal = ref(false)
const editingRow = ref<any>(null)
const editForm = reactive({
  delivery_address: '',
  recipient_name: '',
  recipient_phone: '',
  project_name: '',
  notes: '',
  delivery_date: '',
  technician_id: null as string | null,
})
const editSaving = ref(false)

function openEditModal(row: any) {
  editingRow.value = row
  Object.assign(editForm, {
    delivery_address: row.delivery_address || '',
    recipient_name: row.recipient_name || '',
    recipient_phone: row.recipient_phone || '',
    project_name: row.project_name || '',
    notes: row.notes || '',
    delivery_date: row.delivery_date ? row.delivery_date.slice(0, 10) : '',
    technician_id: row.technician_id ? String(row.technician_id) : null,
  })
  showEditModal.value = true
}

const techOptions = computed(() =>
  ((technicians?.value || []) as any[]).map((t: any) => ({
    value: t.id,
    label: t.user?.name || t.name || t.employee_code || t.id,
  }))
)

async function saveEdit() {
  if (!editingRow.value) return
  editSaving.value = true
  try {
    const payload: any = {
      delivery_address: editForm.delivery_address,
      recipient_name: editForm.recipient_name,
      recipient_phone: editForm.recipient_phone,
      project_name: editForm.project_name,
      notes: editForm.notes,
    }
    if (editForm.delivery_date) {
      payload.delivery_date = `${editForm.delivery_date}T00:00:00Z`
    }
    if (editForm.technician_id) {
      payload.technician_id = editForm.technician_id
    }
    await api.patch(`/delivery-orders/${editingRow.value.id}`, payload)

    // Jika technician berubah dan sudah ada linked JO, update JO juga
    if (editForm.technician_id) {
      const linkedJO = findJobOrderForDO(editingRow.value.id)
      if (linkedJO) {
        await api.patch(`/job-orders/${linkedJO.id}`, { technician_id: editForm.technician_id })
      }
    }

    await loadStandaloneData()
    void refreshOnly(['deliveryOrders', 'jobOrders'])
    showEditModal.value = false
    toast.success('Data berhasil diperbarui.')
  } catch (err: any) {
    toast.error(err?.message || 'Gagal menyimpan perubahan.')
  } finally {
    editSaving.value = false
  }
}

// ══════════════════════════════════════════════════
// ASSIGN MODAL → buat Job Order dari Delivery Order
// ══════════════════════════════════════════════════
const showAssignModal = ref(false)
const assigningRow = ref<any>(null)
const assignForm = reactive({
  technician_id: null as string | null,
  scheduled_date: new Date().toISOString().slice(0, 16),
  instructions: '',
})
const assignSaving = ref(false)

function openAssignModal(row: any) {
  assigningRow.value = row
  Object.assign(assignForm, {
    technician_id: row.technician_id ? String(row.technician_id) : null,
    scheduled_date: row.delivery_date ? row.delivery_date.slice(0, 16) : new Date().toISOString().slice(0, 16),
    instructions: row.notes || row.project_name || '',
  })
  showAssignModal.value = true
}

async function saveAssign() {
  if (!assigningRow.value) return
  if (!assignForm.technician_id) {
    toast.warning('Pilih teknisi untuk di-assign.')
    return
  }
  assignSaving.value = true
  try {
    const row = assigningRow.value

    // 1. Update technician_id di Delivery Order
    await api.patch(`/delivery-orders/${row.id}`, {
      technician_id: assignForm.technician_id,
    })

    // 2. Cek apakah sudah ada Job Order terhubung
    const existingJO = findJobOrderForDO(row.id)
    if (existingJO) {
      // Update JO yang sudah ada
      await api.patch(`/job-orders/${existingJO.id}`, {
        technician_id: assignForm.technician_id,
        scheduled_date: new Date(assignForm.scheduled_date).toISOString(),
        instructions: assignForm.instructions,
      })
      toast.success('Job Order berhasil di-update dan teknisi di-assign.')
    } else {
      // Buat Job Order baru yang terhubung ke Delivery Order ini
      const joPayload = {
        job_order_no: `JO-${Date.now().toString().slice(-6)}`,
        delivery_order_id: row.id,
        technician_id: assignForm.technician_id,
        job_type: 'delivery',
        scheduled_date: new Date(assignForm.scheduled_date).toISOString(),
        instructions: assignForm.instructions,
        status: 'assigned',
      }
      await api.post('/job-orders', joPayload)
      toast.success('Job Order berhasil dibuat dan teknisi di-assign!')
    }

    await loadStandaloneData()
    void refreshOnly(['deliveryOrders', 'jobOrders'])
    showAssignModal.value = false
  } catch (err: any) {
    toast.error(err?.message || 'Gagal membuat Job Order.')
  } finally {
    assignSaving.value = false
  }
}
</script>

<template>
  <div class="tech-standalone">
    <PageHeader title="Service History Mandiri" />

    <div class="card mb-lg p-lg hint">
      Standalone form <strong>without assigned job</strong>. Customer details are filled by CS — technician only fills <strong>Product Detail</strong>.
      <br><small>Gunakan tombol <b>Assign</b> untuk membuat Job Order otomatis di sistem.</small>
    </div>

    <div class="card sa-card-wide">
      <!-- Desktop Table -->
      <div class="table-responsive">
        <table class="table sa-table">
          <thead>
            <tr>
              <th>No. DO</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Items</th>
              <th>Status</th>
              <th>Technician</th>
              <th>Job Order</th>
              <th class="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedList" :key="row.id">
              <td class="td-do-number">
                <span class="do-number-text">{{ row.do_number || '-' }}</span>
              </td>
              <td>
                <div class="font-bold">{{ customerName(row.customer_id) }}</div>
                <div class="text-xs text-muted">{{ row.delivery_address || '-' }}</div>
              </td>
              <td class="td-nowrap">{{ row.delivery_date ? new Date(row.delivery_date).toLocaleDateString('en-GB') : '-' }}</td>
              <td>
                <span class="text-xs">{{ itemsSummary(row) }}</span>
              </td>
              <td>
                <span class="badge" :class="statusClass(row)">
                  {{ statusLabel(row) }}
                </span>
              </td>
              <td class="td-nowrap">{{ techName(row.technician_id) }}</td>
              <td>
                <template v-if="findJobOrderForDO(row.id)">
                  <span class="badge badge-primary jo-badge">
                    {{ findJobOrderForDO(row.id).job_order_no }}
                  </span>
                  <div class="text-xs text-muted">
                    {{ findJobOrderForDO(row.id).status?.toUpperCase().replace('_', ' ') }}
                  </div>
                </template>
                <span v-else class="text-xs text-muted">—</span>
              </td>
              <td class="td-actions">
                <div class="action-btn-group">
                  <button
                    type="button"
                    class="btn btn-sm btn-primary"
                    @click="router.push(`/technician/standalone-service-history/${row.id}`)"
                    title="View / Fill Detail"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    <span class="btn-label">View</span>
                  </button>

                  <button
                    v-if="isSuperadminOrAdmin || can('delivery_order:update')"
                    type="button"
                    class="btn btn-sm btn-outline btn-edit-action"
                    @click="openEditModal(row)"
                    title="Edit detail"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    <span class="btn-label">Edit</span>
                  </button>

                  <button
                    v-if="isSuperadminOrAdmin || can('job_order:create')"
                    type="button"
                    class="btn btn-sm btn-outline btn-assign-action"
                    @click="openAssignModal(row)"
                    :title="findJobOrderForDO(row.id) ? 'Re-assign Job' : 'Assign ke Job Order'"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                    <span class="btn-label">{{ findJobOrderForDO(row.id) ? 'Re-assign' : 'Assign' }}</span>
                  </button>

                  <button
                    v-if="(isSuperadminOrAdmin || can('delivery_order:delete'))"
                    type="button"
                    class="btn btn-sm btn-outline btn-danger"
                    :disabled="deletingId === String(row.id)"
                    @click="removeStandalone(row)"
                    title="Hapus form"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    <span class="btn-label">{{ deletingId === String(row.id) ? '...' : 'Delete' }}</span>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="standaloneList.length === 0">
              <td colspan="8" class="text-center py-lg text-muted">No forms from CS yet.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile Cards View -->
      <div class="mobile-standalone-list">
        <div v-for="row in paginatedList" :key="row.id" class="mobile-standalone-card">
          <div class="m-sa-header">
            <div>
              <span class="m-sa-title font-bold">{{ customerName(row.customer_id) }}</span>
              <div class="text-xs text-muted" style="margin-top:2px;">{{ row.do_number || '' }}</div>
            </div>
            <span class="badge" :class="statusClass(row)">
              {{ statusLabel(row) }}
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
            <div class="m-row">
              <span class="m-label">Items:</span>
              <span class="m-val">{{ itemsSummary(row) }}</span>
            </div>
            <div class="m-row" v-if="findJobOrderForDO(row.id)">
              <span class="m-label">Job Order:</span>
              <span class="m-val">
                <span class="badge badge-primary" style="font-size:11px;">{{ findJobOrderForDO(row.id).job_order_no }}</span>
              </span>
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
            <div class="m-action-row">
              <button
                v-if="isSuperadminOrAdmin || can('delivery_order:update')"
                type="button"
                class="btn btn-sm btn-outline btn-edit-action m-action-btn"
                @click="openEditModal(row)"
              >
                ✏️ Edit
              </button>
              <button
                v-if="isSuperadminOrAdmin || can('job_order:create')"
                type="button"
                class="btn btn-sm btn-outline btn-assign-action m-action-btn"
                @click="openAssignModal(row)"
              >
                👤 {{ findJobOrderForDO(row.id) ? 'Re-assign' : 'Assign' }}
              </button>
              <button
                v-if="isSuperadminOrAdmin || can('delivery_order:delete')"
                type="button"
                class="btn btn-sm btn-outline btn-danger m-action-btn"
                :disabled="deletingId === String(row.id)"
                @click="removeStandalone(row)"
              >
                🗑 {{ deletingId === String(row.id) ? '...' : 'Delete' }}
              </button>
            </div>
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

    <!-- ═══ EDIT MODAL ═══ -->
    <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
      <div class="modal-content modal-wide">
        <div class="modal-header">
          <h2>Edit Standalone Form</h2>
          <button class="close-btn" @click="showEditModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="edit-form-grid">
            <div class="form-group">
              <label>Project Name</label>
              <input v-model="editForm.project_name" class="form-control" placeholder="Project name" />
            </div>
            <div class="form-group">
              <label>Delivery Date</label>
              <input type="date" v-model="editForm.delivery_date" class="form-control" />
            </div>
            <div class="form-group">
              <label>Recipient Name</label>
              <input v-model="editForm.recipient_name" class="form-control" placeholder="Nama penerima" />
            </div>
            <div class="form-group">
              <label>Recipient Phone</label>
              <input v-model="editForm.recipient_phone" class="form-control" placeholder="No. HP" />
            </div>
            <div class="form-group full-width">
              <label>Delivery Address</label>
              <textarea v-model="editForm.delivery_address" class="form-control" rows="2" placeholder="Alamat lengkap"></textarea>
            </div>
            <div class="form-group">
              <label>Technician</label>
              <CustomSelect v-model="editForm.technician_id" :options="techOptions" placeholder="-- Pilih Teknisi --" />
            </div>
            <div class="form-group full-width">
              <label>Notes / Catatan CS</label>
              <textarea v-model="editForm.notes" class="form-control" rows="2" placeholder="Catatan"></textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="showEditModal = false" :disabled="editSaving">Cancel</button>
          <button type="button" class="btn btn-primary" @click="saveEdit" :disabled="editSaving">
            {{ editSaving ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ═══ ASSIGN MODAL ═══ -->
    <div v-if="showAssignModal" class="modal-overlay" @click.self="showAssignModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <h2>{{ findJobOrderForDO(assigningRow?.id) ? 'Re-assign Job Order' : 'Assign ke Job Order' }}</h2>
          <button class="close-btn" @click="showAssignModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="assign-info-box" v-if="assigningRow">
            <div><strong>DO:</strong> {{ assigningRow.do_number }}</div>
            <div><strong>Customer:</strong> {{ customerName(assigningRow.customer_id) }}</div>
            <div v-if="assigningRow.delivery_address"><strong>Address:</strong> {{ assigningRow.delivery_address }}</div>
          </div>

          <div class="assign-form-grid">
            <div class="form-group full-width">
              <label>Assign Technician <span class="text-danger">*</span></label>
              <CustomSelect v-model="assignForm.technician_id" :options="techOptions" placeholder="-- Pilih Teknisi --" />
            </div>
            <div class="form-group full-width">
              <label>Scheduled Date & Time</label>
              <input type="datetime-local" v-model="assignForm.scheduled_date" class="form-control" />
            </div>
            <div class="form-group full-width">
              <label>Instructions</label>
              <textarea v-model="assignForm.instructions" class="form-control" rows="3" placeholder="Instruksi untuk teknisi..."></textarea>
            </div>
          </div>

          <div class="assign-note">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>Setelah di-assign, Job Order akan muncul di halaman <strong>My Jobs</strong> teknisi.</span>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="showAssignModal = false" :disabled="assignSaving">Cancel</button>
          <button type="button" class="btn btn-primary" @click="saveAssign" :disabled="assignSaving">
            {{ assignSaving ? 'Saving...' : (findJobOrderForDO(assigningRow?.id) ? 'Update Assignment' : 'Create Job Order & Assign') }}
          </button>
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
.text-danger { color: #ef4444; }
.mt-xs { margin-top: 4px; }
.w-full { width: 100%; }

/* ── Wide card container ── */
.sa-card-wide {
  overflow: hidden;
}

/* ── Desktop Table Styles ── */
.table-responsive {
  overflow-x: auto;
  overflow-y: auto;
  max-height: calc(100vh - 280px);
  min-height: 250px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: #94a3b8 #f1f5f9;
}

.table-responsive::-webkit-scrollbar {
  width: 8px;
  height: 10px;
}

.table-responsive::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 6px;
}

.table-responsive::-webkit-scrollbar-thumb {
  background: #94a3b8;
  border-radius: 6px;
  border: 2px solid #f1f5f9;
}

.table-responsive::-webkit-scrollbar-thumb:hover {
  background: #64748b;
}

.sa-table {
  min-width: 980px;
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.sa-table th {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--color-surface, #ffffff);
  box-shadow: inset 0 -1px 0 var(--color-border-light, #e2e8f0);
  white-space: nowrap;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-muted);
  padding: 12px 10px;
  border-bottom: 2px solid var(--color-border-light, #e2e8f0);
}

.sa-table td {
  padding: 12px 10px;
  vertical-align: middle;
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
  font-size: 13.5px;
}

.sa-table tbody tr:hover {
  background: var(--color-surface-sunken, #f8fafc);
}

.td-do-number {
  max-width: 140px;
}
.do-number-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary);
  word-break: break-all;
}

.td-nowrap {
  white-space: nowrap;
}

.th-actions {
  min-width: 240px;
  text-align: center;
}

.td-actions {
  text-align: center;
}

/* ── Action button group ── */
.action-btn-group {
  display: inline-flex;
  gap: 5px;
  flex-wrap: wrap;
  justify-content: center;
}

.action-btn-group .btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  font-size: 12px;
  white-space: nowrap;
}

.action-btn-group .btn svg {
  flex-shrink: 0;
}

.btn-edit-action {
  border-color: #f59e0b !important;
  color: #d97706 !important;
}
.btn-edit-action:hover {
  background: rgba(245, 158, 11, 0.1) !important;
}

.btn-assign-action {
  border-color: #10b981 !important;
  color: #059669 !important;
}
.btn-assign-action:hover {
  background: rgba(16, 185, 129, 0.1) !important;
}

.jo-badge {
  font-size: 11px;
  letter-spacing: 0.3px;
}

/* ── Mobile View ── */
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
    gap: 8px;
  }

  .m-action-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .m-action-btn {
    flex: 1;
    min-width: 80px;
    font-size: 12px !important;
    padding: 6px 8px !important;
    text-align: center;
    justify-content: center;
  }
}

/* Hide btn-label on very tight screens */
@media (max-width: 1100px) {
  .action-btn-group .btn-label {
    display: none;
  }
}

/* ══════════════════════════════════════════════════
   MODAL STYLES (shared)
   ══════════════════════════════════════════════════ */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}
.modal-content {
  background: var(--color-surface, #fff);
  width: 100%;
  max-width: 540px;
  border-radius: 14px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.15);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  animation: modalIn 0.2s ease-out;
}
.modal-wide {
  max-width: 640px;
}

@keyframes modalIn {
  from { opacity: 0; transform: translateY(12px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-header h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
}
.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--color-text-muted);
  padding: 0 4px;
  line-height: 1;
}
.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
}
.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--color-border, #e2e8f0);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* ── Edit Form Grid ── */
.edit-form-grid,
.assign-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-group label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}
.full-width {
  grid-column: 1 / -1;
}
.form-control {
  padding: 9px 12px;
  border: 1px solid var(--color-border, #cbd5e1);
  border-radius: 8px;
  font-size: 14px;
  background: var(--color-surface, #fff);
  color: var(--color-text);
  transition: border-color 0.15s;
}
.form-control:focus {
  border-color: var(--color-primary);
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}

.btn-secondary {
  background: var(--color-surface-sunken, #f1f5f9);
  color: var(--color-text);
  border: 1px solid var(--color-border, #e2e8f0);
}

/* ── Assign Info Box ── */
.assign-info-box {
  background: var(--color-surface-sunken, #f8fafc);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 16px;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--color-text);
}

.assign-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 16px;
  padding: 12px 14px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  font-size: 12.5px;
  color: #1e40af;
}
.assign-note svg {
  flex-shrink: 0;
  margin-top: 1px;
}

@media (max-width: 768px) {
  .edit-form-grid,
  .assign-form-grid {
    grid-template-columns: 1fr;
  }
  .modal-content {
    max-width: 100%;
  }
}
</style>
