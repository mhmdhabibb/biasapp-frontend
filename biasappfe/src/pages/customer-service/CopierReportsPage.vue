<script setup lang="ts">
// @ts-nocheck
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { usePermission } from '@/composables/usePermission'
import { useResourcesStore } from '@/stores/resources.store'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import { isCopierReport } from '@/utils/copierReport'
import { printServiceReport } from '@/utils/printReport'
import type { TableColumn } from '@/types'

const toast = useToast()
const router = useRouter()
const { can } = usePermission()
const {
  serviceReports: data,
  customers,
  units,
  technicians,
  findCustomer,
  findUnit,
  findTechnician,
  refreshInBackground,
} = useMasterStore()
const resources = useResourcesStore()

// List tersendiri: hanya copier report, terpisah dari Service Reports
// maupun history di Service Requests.
const copierReports = computed(() =>
  [...(data.value as any[])].filter(isCopierReport).sort((a: any, b: any) =>
    String(b.service_date || b.created_at || '').localeCompare(
      String(a.service_date || a.created_at || ''),
    ),
  ),
)

const columns: TableColumn[] = [
  { key: 'report_no', label: 'Report No.' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'unit_id', label: 'Unit' },
  { key: 'technician_id', label: 'Technician' },
  { key: 'service_date', label: 'Visit Date' },
  { key: 'status', label: 'Status' },
]

function customerName(id: any): string {
  const c = findCustomer(id as any)
  return c ? c.company_name || c.name || '-' : '-'
}

function unitName(id: any): string {
  const u: any = findUnit(id as any)
  return u ? `${u.model || '-'} (${u.serial_no || '-'})` : '-'
}

function technicianName(id: any): string {
  const t: any = findTechnician(id)
  return t ? t.user?.name || t.name || '-' : '-'
}

function formatDate(value: any): string {
  if (!value) return '-'
  const d = new Date(value)
  if (isNaN(d.getTime())) return String(value).slice(0, 10)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Total keseluruhan: jumlah dari semua baris readings bila ada,
// fallback ke field tunggal legacy bila tidak ada readings.
function detailTotals(item: any): { before: number | null; after: number | null; count: number } {
  const rows = detailReadings(item)
  if (rows.length > 0) {
    let b = 0
    let a = 0
    for (const r of rows) {
      b += Number(r.start_meter || 0)
      a += Number(r.last_meter ?? r.end_meter ?? 0)
    }
    return { before: b, after: a, count: rows.length }
  }
  const b = item?.meter_reading_before
  const a = item?.meter_reading_after
  return {
    before: b === null || b === undefined || b === '' ? null : Number(b),
    after: a === null || a === undefined || a === '' ? null : Number(a),
    count: 0,
  }
}

function totalBeforeStr(item: any): string {
  const t = detailTotals(item)
  return t.before === null ? '-' : t.before.toLocaleString('id-ID')
}

function totalAfterStr(item: any): string {
  const t = detailTotals(item)
  return t.after === null ? '-' : t.after.toLocaleString('id-ID')
}

function meterUsage(item: any): string {
  const t = detailTotals(item)
  if (t.before === null || t.after === null) return '-'
  return (t.after - t.before).toLocaleString('id-ID')
}

function hasSig(item: any, who: 'customer' | 'technician'): boolean {
  if (!item) return false
  if (who === 'customer') return !!(item.customer_signature_copier || item.customer_signature)
  return !!(item.technician_signature_copier || item.technician_signature)
}

function detailReadings(item: any): any[] {
  return item?.monthly_meter_readings || item?.monthlyMeterReadings || []
}

function readingUsage(r: any): string {
  const s = Number(r.start_meter || 0)
  const l = Number(r.last_meter ?? r.end_meter ?? 0)
  return (l - s).toLocaleString('id-ID')
}

// ---- Detail (read-only) ----
const showDetail = ref(false)
const detailItem = ref<any>(null)
function openDetail(item: any) {
  detailItem.value = item
  showDetail.value = true
}

// ---- Generate manual (retry/backfill) ----
const genMonth = ref(new Date().toISOString().slice(0, 7))
const isGenerating = ref(false)
const showResult = ref(false)
const genResult = ref<{ period?: string; created?: number; skipped?: number; errors?: string[] } | null>(null)

async function handleGenerate() {
  if (!genMonth.value) {
    toast.warning('Pilih bulan dulu!')
    return
  }
  isGenerating.value = true
  try {
    const res: any = await api.post(`/service-reports/generate-monthly-copier?month=${genMonth.value}`, {})
    genResult.value = res?.data || null
    showResult.value = true
    await refreshInBackground()
    toast.success(res?.message || 'Generate selesai!')
  } catch (err: any) {
    toast.error(err?.message || 'Gagal generate copier reports!')
  } finally {
    isGenerating.value = false
  }
}

// ---- Assign ke teknisi ----
const showAssign = ref(false)
const assignItem = ref<any>(null)
const assignTechId = ref<string>('')
const isAssigning = ref(false)

function openAssign(item: any) {
  assignItem.value = item
  assignTechId.value = item.technician_id ? String(item.technician_id) : ''
  showAssign.value = true
}

async function handleAssign() {
  if (!assignItem.value) return
  if (!assignTechId.value) {
    toast.warning('Pilih teknisi dulu!')
    return
  }
  isAssigning.value = true
  try {
    await resources.update('serviceReports', String(assignItem.value.id), {
      technician_id: assignTechId.value,
    } as any)
    await refreshInBackground()
    showAssign.value = false
    toast.success(`Copier report ${assignItem.value.report_no} di-assign ke ${technicianName(assignTechId.value)}!`)
  } catch (err: any) {
    toast.error(err?.message || 'Gagal assign teknisi!')
  } finally {
    isAssigning.value = false
  }
}

// ---- Delete ----
const showConfirm = ref(false)
const deletingItem = ref<any>(null)
function openDelete(item: any) {
  deletingItem.value = item
  showConfirm.value = true
}
async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.remove('serviceReports', String(deletingItem.value.id))
      await refreshInBackground()
      toast.success('Copier report dihapus!')
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menghapus!')
    }
  }
  showConfirm.value = false
}
</script>

<template>
  <div>
    <PageHeader title="Copier Reports" permission="service_report:read">
      <template #actions>
        <div style="display: flex; align-items: center; gap: 8px;">
          <input
            v-if="can('service_report:create')"
            v-model="genMonth"
            type="month"
            class="form-input"
            style="width: auto;"
            title="Bulan periode"
          />
          <button
            v-if="can('service_report:create')"
            type="button"
            class="btn btn-outline"
            :disabled="isGenerating"
            title="Generate report copier bulan berjalan (retry/backfill)"
            @click="handleGenerate"
          >
            {{ isGenerating ? 'Generating...' : 'Generate Bulan Ini' }}
          </button>
        </div>
      </template>
    </PageHeader>

    <DataTable
      :columns="columns"
      :data="copierReports"
      search-placeholder="Search copier reports..."
      permission="service_report"
      @delete="openDelete"
    >
      <template #cell-customer_id="{ value }">{{ customerName(value) }}</template>
      <template #cell-unit_id="{ value }">{{ unitName(value) }}</template>
      <template #cell-technician_id="{ value }">{{ technicianName(value) }}</template>
      <template #cell-service_date="{ value }">{{ formatDate(value) }}</template>
      <template #cell-status="{ value }">
        <span :class="value === 'completed' ? 'badge badge-success' : value === 'pending' ? 'badge badge-warning' : 'badge badge-info'">
          {{ value || '-' }}
        </span>
      </template>
      <template #actions="{ row }">
        <div style="display: flex; align-items: center; gap: 6px;">
          <button
            v-if="can('service_report:read')"
            class="action-btn action-btn--edit"
            title="Detail"
            style="color: var(--color-text-muted); width: 36px; height: 36px;"
            @click="openDetail(row)"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button
            v-if="can('service_report:read')"
            class="action-btn action-btn--edit"
            title="Buka form copier"
            style="color: var(--color-primary); width: 36px; height: 36px;"
            @click="router.push(`/shared/service-reports/${row.id}`)"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
          <button
            v-if="can('service_report:read')"
            class="action-btn action-btn--edit"
            title="Print copier report"
            style="color: var(--color-primary); width: 36px; height: 36px;"
            @click="printServiceReport(row, 'copier')"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
          </button>
          <button
            v-if="can('service_report:update')"
            class="action-btn action-btn--edit"
            title="Assign ke teknisi"
            style="color: var(--color-success); width: 36px; height: 36px;"
            @click="openAssign(row)"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
          </button>
          <button
            v-if="can('service_report:delete')"
            class="action-btn action-btn--delete"
            title="Delete"
            style="width: 36px; height: 36px;"
            @click="openDelete(row)"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </div>
      </template>
    </DataTable>

    <FormModal :open="showDetail" :title="detailItem ? `Copier Report ${detailItem.report_no}` : 'Copier Report'" max-width="560px" @close="showDetail = false">
      <template v-if="detailItem">
        <div class="cr-head">
          <div>
            <div class="cr-no">{{ detailItem.report_no || '-' }}</div>
            <div class="cr-sub">{{ customerName(detailItem.customer_id) }} · {{ unitName(detailItem.unit_id) }}</div>
          </div>
          <span :class="detailItem.status === 'completed' ? 'badge badge-success' : detailItem.status === 'pending' ? 'badge badge-warning' : 'badge badge-info'">
            {{ detailItem.status || '-' }}
          </span>
        </div>

        <div class="cr-grid">
          <div class="cr-stat">
            <span class="cr-label">Before Meter</span>
            <span class="cr-value">{{ totalBeforeStr(detailItem) }}</span>
            <span v-if="detailTotals(detailItem).count > 0" class="cr-note">total {{ detailTotals(detailItem).count }} ukuran</span>
          </div>
          <div class="cr-stat">
            <span class="cr-label">After Meter</span>
            <span class="cr-value">{{ totalAfterStr(detailItem) }}</span>
            <span v-if="detailTotals(detailItem).count > 0" class="cr-note">total {{ detailTotals(detailItem).count }} ukuran</span>
          </div>
          <div class="cr-stat highlight">
            <span class="cr-label">Pemakaian</span>
            <span class="cr-value">{{ meterUsage(detailItem) }}</span>
          </div>
          <div class="cr-stat">
            <span class="cr-label">Technician</span>
            <span class="cr-value small">{{ technicianName(detailItem.technician_id) }}</span>
          </div>
          <div class="cr-stat">
            <span class="cr-label">Visit Date</span>
            <span class="cr-value small">{{ formatDate(detailItem.service_date) }}</span>
          </div>
          <div class="cr-stat">
            <span class="cr-label">Tanda Tangan</span>
            <span class="cr-value small">
              <span :class="hasSig(detailItem, 'customer') ? 'sig-ok' : 'sig-no'">
                {{ hasSig(detailItem, 'customer') ? '✓ Cust' : '– Cust' }}
              </span>
              ·
              <span :class="hasSig(detailItem, 'technician') ? 'sig-ok' : 'sig-no'">
                {{ hasSig(detailItem, 'technician') ? '✓ Teknisi' : '– Teknisi' }}
              </span>
            </span>
          </div>
        </div>

        <div v-if="detailReadings(detailItem).length > 0" class="cr-readings">
          <div class="cr-section">Rincian Meter ({{ detailReadings(detailItem).length }})</div>
          <table class="cr-table">
            <thead>
              <tr><th>Paper</th><th>Mode</th><th style="text-align: right;">Start → Last</th><th style="text-align: right;">Pakai</th></tr>
            </thead>
            <tbody>
              <tr v-for="(r, idx) in detailReadings(detailItem)" :key="r.id || idx">
                <td>{{ r.paper_size?.name || '-' }}</td>
                <td>{{ String(r.color_mode || '-').toUpperCase() }}</td>
                <td style="text-align: right; white-space: nowrap;">{{ Number(r.start_meter || 0).toLocaleString('id-ID') }} → {{ Number(r.last_meter ?? r.end_meter ?? 0).toLocaleString('id-ID') }}</td>
                <td style="text-align: right;">{{ readingUsage(r) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <template #footer>
        <button
          v-if="can('service_report:read') && detailItem"
          type="button"
          class="btn btn-primary"
          @click="printServiceReport(detailItem, 'copier')"
        >
          Print
        </button>
        <button class="btn btn-outline" @click="showDetail = false">Close</button>
      </template>
    </FormModal>

    <FormModal :open="showAssign" :title="assignItem ? `Assign ${assignItem.report_no}` : 'Assign Teknisi'" @close="showAssign = false">
      <div class="form-group">
        <label class="form-label">Customer</label>
        <div>{{ assignItem ? customerName(assignItem.customer_id) : '-' }}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Unit</label>
        <div>{{ assignItem ? unitName(assignItem.unit_id) : '-' }}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Technician</label>
        <select v-model="assignTechId" class="form-input">
          <option value="">-- Pilih Teknisi --</option>
          <option v-for="t in (technicians as any[])" :key="t.id" :value="String(t.id)">
            {{ t.user?.name || t.name || '-' }}
          </option>
        </select>
        <p v-if="!(technicians as any[])?.length" style="margin-top: 6px; font-size: 12px; color: var(--color-text-muted);">
          Belum ada data teknisi.
        </p>
      </div>
      <template #footer>
        <button type="button" class="btn btn-outline" :disabled="isAssigning" @click="showAssign = false">Cancel</button>
        <button type="button" class="btn btn-accent" :disabled="isAssigning" @click="handleAssign">
          {{ isAssigning ? 'Menyimpan...' : 'Assign' }}
        </button>
      </template>
    </FormModal>

    <FormModal :open="showResult" title="Hasil Generate" @close="showResult = false">
      <template v-if="genResult">
        <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
          <span class="badge badge-success">Dibuat: {{ genResult.created ?? '-' }}</span>
          <span class="badge badge-warning">Dilewati: {{ genResult.skipped ?? '-' }}</span>
          <span v-if="(genResult.errors || []).length" class="badge badge-danger">Error: {{ (genResult.errors || []).length }}</span>
        </div>
        <ul v-if="(genResult.errors || []).length" style="margin: 0; padding-left: 18px; font-size: 13px;">
          <li v-for="(e, idx) in (genResult.errors || [])" :key="idx">{{ e }}</li>
        </ul>
        <p v-else style="color: var(--color-text-muted); font-size: 13px;">Tidak ada error.</p>
      </template>
      <template #footer>
        <button class="btn btn-outline" @click="showResult = false">Close</button>
      </template>
    </FormModal>

    <ConfirmDialog
      :open="showConfirm"
      title="Delete Copier Report"
      :message="`Hapus copier report '${deletingItem?.report_no}'?`"
      @close="showConfirm = false"
      @confirm="handleDelete"
    />
  </div>
</template>

<style scoped>
.cr-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.cr-no {
  font-size: 17px;
  font-weight: 700;
  color: var(--color-text);
}

.cr-sub {
  margin-top: 2px;
  font-size: 13px;
  color: var(--color-text-muted);
}

.cr-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}

.cr-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--color-border-light);
  border-radius: 8px;
  background: var(--color-surface);
  min-width: 0;
}

.cr-stat.highlight {
  border-color: #bfdbfe;
  background: #eff6ff;
}

.cr-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  font-weight: 600;
}

.cr-value {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
}

.cr-value.small {
  font-size: 13px;
  font-weight: 600;
}

.cr-note {
  font-size: 11px;
  color: var(--color-text-muted);
}

.sig-ok {
  color: var(--color-success, #16a34a);
  font-weight: 700;
}

.sig-no {
  color: var(--color-text-muted);
}

.cr-readings {
  margin-top: 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: auto;
  max-height: 264px;
  background: var(--color-surface);
}

.cr-section {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 700;
  background: var(--color-surface-raised);
  border-bottom: 1px solid var(--color-border);
}

.cr-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.cr-table th {
  padding: 8px 12px;
  text-align: left;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
  background: var(--color-surface-raised);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 1;
}

.cr-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border-light);
  font-variant-numeric: tabular-nums;
}

.cr-table tr:last-child td {
  border-bottom: none;
}

@media (max-width: 560px) {
  .cr-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
