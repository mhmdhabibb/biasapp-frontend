<script setup lang="ts">
// @ts-nocheck
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMasterStore } from '@/composables/useMasterStore'
import PageHeader from '@/components/ui/PageHeader.vue'
import { printServiceReport, getServiceReportFormHtml } from '@/utils/printReport'
import { groupMeterReadingsBySize } from '@/utils/meterReading'

const route = useRoute()
const router = useRouter()
const {
  serviceReports,
  jobOrders,
  contractItems,
  findCustomer,
  findUnit,
  findProduct,
  findTechnician
} = useMasterStore()

const reportId = String(route.params.id)

// View mode: 'digital' or 'form' — default to the real print form
const viewMode = ref<'digital' | 'form'>('form')

// Try to find the service report directly
const sr = computed(() => serviceReports.value.find(r => String(r.id) === reportId))

function handlePrint() {
  if (sr.value) {
    printServiceReport(sr.value)
  }
}

// Generate form HTML for iframe (rendered via :srcdoc)
const formHtml = computed(() => {
  if (!sr.value) return ''
  return getServiceReportFormHtml(sr.value)
})

// Get linked job order
const jobOrder = computed(() => {
  if (!sr.value?.job_order_id) return null
  return jobOrders.value.find(j => String(j.id) === String(sr.value.job_order_id))
})

const customer = computed(() => findCustomer(sr.value?.customer_id || null))
const unit = computed(() => findUnit(sr.value?.unit_id || null))
const technician = computed(() => findTechnician(sr.value?.technician_id || null))

const isCopier = computed(() => unit.value?.is_copier || unit.value?.model?.toLowerCase().includes('copier'))

// Paper type/size on copier report: from linked monthly meter readings
// (paper_size preloaded by backend), fallback to contract rates
// (copies of rental_item_rates) looked up via unit.
const contractByUnit = computed(() => {
  const unitId = String(sr.value?.unit_id || unit.value?.id || '')
  if (!unitId) return null
  return (contractItems.value || []).find((ci: any) =>
    String(ci.unit_id || ci.unit?.id || '') === unitId
  ) || null
})

const paperTypes = computed(() => {
  const labels: string[] = []
  const seen = new Set<string>()
  const push = (raw: any) => {
    const label = String(raw || '').trim()
    if (label && !seen.has(label)) {
      seen.add(label)
      labels.push(label)
    }
  }
  const readings: any[] = sr.value?.monthly_meter_readings || sr.value?.monthlyMeterReadings || []
  for (const r of readings) {
    const name = r.paper_size?.name || r.paper_size_name || r.paper_size_id || ''
    push(`${name}${r.color_mode ? ` (${r.color_mode})` : ''}`.trim())
  }
  const rates: any[] = sr.value?.contract_item?.rates || contractByUnit.value?.rates || []
  for (const rate of rates) {
    push(rate.paper_size?.name || rate.paper_size_name || rate.paper_size_id || '')
  }
  return labels
})

// Before/after for digital view — same fallback as form & print
// so it doesn't show 0 when unit/contract data exists.
const numVal = (v: any) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const displayBefore = computed(() => {
  const saved = numVal(sr.value?.meter_reading_before) || numVal((sr.value as any)?.reading_counter)
  if (saved > 0) return saved
  const readings: any[] = (sr.value as any)?.monthly_meter_readings || (sr.value as any)?.monthlyMeterReadings || []
  let lastEnd = 0
  for (const r of readings) lastEnd = Math.max(lastEnd, numVal(r.end_meter) || numVal(r.start_meter))
  if (lastEnd > 0) return lastEnd
  const fromUnit = numVal((unit.value as any)?.current_meter_bw) || numVal((unit.value as any)?.current_meter_color)
  if (fromUnit > 0) return fromUnit
  const fromContract = numVal((contractByUnit.value as any)?.start_mono_value) || numVal((contractByUnit.value as any)?.start_color_value)
  return fromContract > 0 ? fromContract : (sr.value?.meter_reading_before ?? 0)
})
const displayAfter = computed(() => {
  const after = numVal(sr.value?.meter_reading_after) || numVal((sr.value as any)?.reading_counter)
  return after > 0 ? after : (sr.value?.meter_reading_after ?? 0)
})
// Rincian meter per ukuran kertas dari readings yang terhubung ke report.
const meterSectionsView = computed(() =>
  groupMeterReadingsBySize(
    (sr.value as any)?.monthly_meter_readings ||
      (sr.value as any)?.monthlyMeterReadings ||
      [],
  ),
)

function formatDate(d: string | null | undefined) {
  if (!d) return '-'
  return new Date(d).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })
}

function statusColor(s: string) {
  if (s === 'completed') return 'var(--color-success, #22c55e)'
  if (s === 'in_progress') return 'var(--color-info, #0ea5e9)'
  return 'var(--color-warning, #f59e0b)'
}
</script>

<template>
  <div class="report-view" v-if="sr">
    <PageHeader title="Service Report" :back-button="true" @back="router.back()">
      <template #actions>
        <!-- View Mode Toggle -->
        <div class="view-toggle">
          <button
            class="toggle-btn"
            :class="{ active: viewMode === 'digital' }"
            @click="viewMode = 'digital'"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Digital
          </button>
          <button
            class="toggle-btn"
            :class="{ active: viewMode === 'form' }"
            @click="viewMode = 'form'"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Form
          </button>
        </div>

        <button class="btn btn-primary" @click="handlePrint">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          Print / PDF
        </button>
      </template>
    </PageHeader>

    <!-- ==================== FORM VIEW (iframe preview) ==================== -->
    <div v-if="viewMode === 'form'" class="form-preview-wrapper">
      <div class="form-preview-label">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        Preview of all original forms (1 form / page) — click <strong>Print / PDF</strong> to print
      </div>
      <div class="form-preview-container">
        <iframe
          class="form-iframe"
          :srcdoc="formHtml"
          frameborder="0"
        ></iframe>
      </div>
    </div>

    <!-- ==================== DIGITAL VIEW (card-based) ==================== -->
    <template v-else>
      <!-- Status Banner -->
      <div class="status-banner" :style="{ borderLeftColor: statusColor(sr.status) }">
        <div class="banner-left">
          <span class="banner-report-no">{{ sr.report_no }}</span>
          <span class="badge" :class="'badge-' + (sr.status === 'completed' ? 'success' : sr.status === 'in_progress' ? 'info' : 'warning')">
            {{ sr.status?.toUpperCase().replace('_', ' ') }}
          </span>
        </div>
        <span class="banner-date">{{ formatDate(sr.created_at) }}</span>
      </div>

      <!-- Overview Cards -->
      <div class="overview-grid">
        <div class="overview-card">
          <div class="overview-icon" style="background: rgba(59,130,246,0.1); color: #3b82f6;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
          <div class="overview-content">
            <span class="overview-label">Customer</span>
            <span class="overview-value">{{ customer?.company_name || '-' }}</span>
            <span class="overview-sub">{{ customer?.address || '' }}</span>
          </div>
        </div>
        <div class="overview-card">
          <div class="overview-icon" style="background: rgba(14,165,233,0.1); color: #0ea5e9;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/></svg>
          </div>
          <div class="overview-content">
            <span class="overview-label">Unit / Machine</span>
            <span class="overview-value">{{ unit?.model || '-' }}</span>
            <span class="overview-sub">SN: {{ unit?.serial_no || '-' }}</span>
          </div>
        </div>
        <div class="overview-card">
          <div class="overview-icon" style="background: rgba(34,197,94,0.1); color: #22c55e;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <div class="overview-content">
            <span class="overview-label">Technician</span>
            <span class="overview-value">{{ technician?.name || technician?.full_name || '-' }}</span>
            <span class="overview-sub">{{ sr.service_type?.replace('_', ' ') }}</span>
          </div>
        </div>
        <div class="overview-card">
          <div class="overview-icon" style="background: rgba(168,85,247,0.1); color: #a855f7;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div class="overview-content">
            <span class="overview-label">Time</span>
            <span class="overview-value">{{ sr.time_in || '-' }} → {{ sr.time_out || '-' }}</span>
            <span class="overview-sub">{{ jobOrder?.job_order_no || '' }}</span>
          </div>
        </div>
      </div>

      <!-- Report Sections -->
      <div class="reports-grid">

        <!-- Technical Report -->
        <div class="report-card">
          <div class="report-card-header">
            <div class="report-card-icon technical">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            </div>
            <h3 class="report-card-title">Technical Report</h3>
            <span class="report-status" :class="sr.remarks ? 'filled' : 'empty'">
              {{ sr.remarks ? '✅ Filled' : '⏳ Empty' }}
            </span>
          </div>
          <div class="report-card-body">
            <div class="report-field">
              <span class="field-label">Inspection Result / Root Cause</span>
              <div class="field-value">{{ sr.remarks || 'Not filled yet' }}</div>
            </div>
            <div class="report-field">
              <span class="field-label">Machine Testing</span>
              <div class="field-value">
                <span v-if="sr.is_tested" class="test-badge pass">✅ Tested &amp; Working Normally</span>
                <span v-else class="test-badge pending">⏳ Not Tested Yet</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Service Report -->
        <div class="report-card">
          <div class="report-card-header">
            <div class="report-card-icon service">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <h3 class="report-card-title">Service Report</h3>
            <span class="report-status" :class="sr.repair_action ? 'filled' : 'empty'">
              {{ sr.repair_action ? '✅ Filled' : '⏳ Empty' }}
            </span>
          </div>
          <div class="report-card-body">
            <div class="report-field">
              <span class="field-label">Repair Action</span>
              <div class="field-value">{{ sr.repair_action || 'Not filled yet' }}</div>
            </div>
            <div class="report-field">
              <span class="field-label">Spareparts Used</span>
              <div class="field-value" v-if="sr.service_spareparts && sr.service_spareparts.length > 0">
                <div class="sparepart-table">
                  <div class="sparepart-row header">
                    <span>Component</span>
                    <span>Qty</span>
                  </div>
                  <div v-for="sp in sr.service_spareparts" :key="sp.id" class="sparepart-row">
                    <span>{{ sp.product?.name || findProduct(sp.product_id)?.name || '-' }}</span>
                    <span class="font-bold">{{ sp.qty }}</span>
                  </div>
                </div>
              </div>
              <div class="field-value empty-text" v-else>No sparepart replacements</div>
            </div>
          </div>
        </div>

        <!-- Copier Report (conditional) -->
        <div class="report-card" v-if="isCopier">
          <div class="report-card-header">
            <div class="report-card-icon copier">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
            </div>
            <h3 class="report-card-title">Copier Service Report</h3>
            <span class="report-status" :class="displayBefore || displayAfter ? 'filled' : 'empty'">
              {{ displayBefore || displayAfter ? '✅ Filled' : '⏳ Empty' }}
            </span>
          </div>
          <div class="report-card-body">
            <template v-if="meterSectionsView.length > 0">
              <div
                v-for="sec in meterSectionsView"
                :key="sec.paper_size_id || 'general'"
                class="meter-size-block"
              >
                <div class="meter-size-title">{{ sec.paper_size_name }}</div>
                <div class="meter-grid">
                  <template v-if="sec.bw">
                    <div class="meter-item">
                      <span class="meter-label">B/W Before</span>
                      <span class="meter-value">{{ sec.bw.before }}</span>
                    </div>
                    <div class="meter-item">
                      <span class="meter-label">B/W After</span>
                      <span class="meter-value">{{ sec.bw.after }}</span>
                    </div>
                  </template>
                  <template v-if="sec.color">
                    <div class="meter-item">
                      <span class="meter-label">Colour Before</span>
                      <span class="meter-value">{{ sec.color.before }}</span>
                    </div>
                    <div class="meter-item">
                      <span class="meter-label">Colour After</span>
                      <span class="meter-value">{{ sec.color.after }}</span>
                    </div>
                  </template>
                </div>
              </div>
            </template>
            <template v-else>
            <div class="meter-grid">
              <div class="meter-item">
                <span class="meter-label">Meter Before</span>
                <span class="meter-value">{{ displayBefore }}</span>
              </div>
              <div class="meter-item">
                <span class="meter-label">Meter After</span>
                <span class="meter-value">{{ displayAfter }}</span>
              </div>
            </div>
            </template>
            <div class="report-field">
              <span class="field-label">Paper Size</span>
              <div class="field-value" v-if="paperTypes.length > 0">
                <div v-for="(pt, i) in paperTypes" :key="i">{{ i + 1 }}. {{ pt }}</div>
              </div>
              <div class="field-value empty-text" v-else>No paper size data yet</div>
            </div>
          </div>
        </div>

      </div>

      <!-- Problem Description -->
      <div class="card p-lg mt-lg" v-if="sr.machine_problem || jobOrder?.instructions">
        <h3 class="card-title mb-md">Complaint / Initial Instructions</h3>
        <p class="problem-text">{{ sr.machine_problem || jobOrder?.instructions || jobOrder?.service_request?.problem_description || '-' }}</p>
      </div>
    </template>

  </div>

  <!-- Not Found -->
  <div v-else class="report-view">
    <PageHeader title="Service Report" :back-button="true" @back="router.back()" />
    <div class="empty-state">
      <div class="empty-icon">📋</div>
      <h3>Report Not Found</h3>
      <p>No service report available with this ID.</p>
      <button class="btn btn-primary mt-md" @click="router.back()">Back</button>
    </div>
  </div>
</template>

<style scoped>
.report-view {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-bottom: 60px;
}

/* ===== View Toggle ===== */
.view-toggle {
  display: flex;
  background: #f1f5f9;
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
}
.toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}
.toggle-btn:hover {
  color: #334155;
  background: rgba(255,255,255,0.5);
}
.toggle-btn.active {
  background: #fff;
  color: #1e293b;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

/* ===== Form Preview ===== */
.form-preview-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-preview-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #64748b;
  padding: 12px 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}
.form-preview-label strong {
  color: #1e293b;
}
.form-preview-container {
  background: #e2e8f0;
  border-radius: 16px;
  padding: 24px;
  box-shadow: inset 0 2px 8px rgba(0,0,0,0.06);
}
.form-iframe {
  width: 100%;
  min-height: 900px;
  border: none;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 4px 20px rgba(0,0,0,0.1);
}

/* ===== Status Banner ===== */
.status-banner {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-left: 5px solid;
  border-radius: 12px;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.03);
}
.banner-left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.banner-report-no {
  font-size: 19px;
  font-weight: 800;
  color: var(--color-text);
  letter-spacing: 0.5px;
}
.banner-date {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-muted);
}

/* ===== Overview Grid ===== */
.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 16px;
}
.overview-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  gap: 16px;
  align-items: flex-start;
  box-shadow: 0 2px 10px rgba(0,0,0,0.02);
  transition: all 0.2s ease;
}
.overview-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.06);
  border-color: #cbd5e1;
}
.overview-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.overview-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin-top: 2px;
}
.overview-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.overview-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.overview-sub {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== Report Cards ===== */
.reports-grid {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.report-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0,0,0,0.03);
}
.report-card-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 24px;
  background: #f8fafc;
  border-bottom: 1px solid var(--color-border-light, #e2e8f0);
}
.report-card-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.report-card-icon.technical { background: linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05)); color: #d97706; }
.report-card-icon.service { background: linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.05)); color: #2563eb; }
.report-card-icon.copier { background: linear-gradient(135deg, rgba(168,85,247,0.15), rgba(168,85,247,0.05)); color: #9333ea; }

.report-card-title {
  flex: 1;
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}
.report-status {
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 20px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.report-status.filled {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid #a7f3d0;
}
.report-status.empty {
  background: #fffbeb;
  color: #d97706;
  border: 1px solid #fde68a;
}

.report-card-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.report-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.field-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.6px;
}
.field-value {
  font-size: 14px;
  color: var(--color-text);
  line-height: 1.7;
  padding: 16px 20px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
.field-value.empty-text {
  color: var(--color-text-muted);
  font-style: italic;
  background: transparent;
  border: 1px dashed #cbd5e1;
}

/* Test Badge */
.test-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
}
.test-badge.pass { color: #059669; }
.test-badge.pending { color: #d97706; }

/* Sparepart Table */
.sparepart-table {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  background: var(--color-surface, #fff);
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.01);
}
.sparepart-row {
  display: flex;
  justify-content: space-between;
  padding: 14px 20px;
  font-size: 14px;
  border-bottom: 1px solid #f1f5f9;
}
.sparepart-row:last-child { border-bottom: none; }
.sparepart-row.header {
  background: #f8fafc;
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-muted);
  border-bottom: 1px solid #e2e8f0;
}

/* Meter Grid */
.meter-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
}
.meter-item {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  transition: border-color 0.2s;
}
.meter-item:hover {
  border-color: #cbd5e1;
}
.meter-item.highlight {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}
.meter-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.6px;
}
.meter-value {
  font-size: 26px;
  font-weight: 800;
  color: var(--color-text);
}
.meter-item.highlight .meter-value {
  color: #1d4ed8;
}
.meter-size-block {
  margin-bottom: 16px;
}
.meter-size-block:last-of-type {
  margin-bottom: 0;
}
.meter-size-title {
  font-size: 13px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 8px;
}

/* Problem */
.problem-text {
  font-size: 15px;
  line-height: 1.8;
  color: var(--color-text-secondary);
  padding: 20px 24px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  white-space: pre-wrap;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 80px 20px;
  background: var(--color-surface, #fff);
  border-radius: 16px;
  border: 2px dashed #cbd5e1;
}
.empty-icon { font-size: 56px; margin-bottom: 20px; }
.empty-state h3 { margin: 0 0 12px; font-size: 20px; font-weight: 700; color: var(--color-text); }
.empty-state p { margin: 0; font-size: 15px; color: var(--color-text-muted); }

@media (max-width: 640px) {
  .overview-grid { grid-template-columns: 1fr; }
  .meter-grid { grid-template-columns: 1fr; }
  .view-toggle { padding: 2px; }
  .toggle-btn { padding: 6px 10px; font-size: 12px; gap: 4px; }
  .toggle-btn svg { width: 14px; height: 14px; }
}
</style>
