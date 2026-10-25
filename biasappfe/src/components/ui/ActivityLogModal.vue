<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { activityLogService, type ActivityLogItem } from '@/services/activity_log.service'

const props = withDefaults(
  defineProps<{
    open: boolean
    module?: string
    title?: string
  }>(),
  {
    open: false,
    module: '',
    title: '',
  },
)

const emit = defineEmits<{
  (e: 'close'): void
}>()

const loading = ref(false)
const items = ref<ActivityLogItem[]>([])
const total = ref(0)
const page = ref(1)
const limit = ref(15)
const totalPages = ref(1)
const searchQuery = ref('')
const selectedAction = ref('')
const selectedModule = ref(props.module || '')

const moduleLabel = computed(() => {
  if (props.title) return props.title
  if (!selectedModule.value) return 'Semua Modul'
  return selectedModule.value.replace(/_/g, ' ').toUpperCase()
})

async function fetchLogs() {
  if (!props.open) return
  loading.value = true
  try {
    const res = await activityLogService.getLogs({
      module: selectedModule.value || undefined,
      action: selectedAction.value || undefined,
      search: searchQuery.value.trim() || undefined,
      page: page.value,
      limit: limit.value,
    })
    items.value = res.items || []
    total.value = res.total || 0
    totalPages.value = res.total_pages || 1
  } catch (err) {
    console.error('Failed to fetch activity logs:', err)
    items.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  (val) => {
    if (val) {
      selectedModule.value = props.module || ''
      page.value = 1
      searchQuery.value = ''
      selectedAction.value = ''
      fetchLogs()
    }
  },
  { immediate: true },
)

function setModuleFilter(mod: string) {
  selectedModule.value = mod
  page.value = 1
  fetchLogs()
}

function handleSearch() {
  page.value = 1
  fetchLogs()
}

function handleActionFilter(act: string) {
  selectedAction.value = act
  page.value = 1
  fetchLogs()
}

function prevPage() {
  if (page.value > 1) {
    page.value--
    fetchLogs()
  }
}

function nextPage() {
  if (page.value < totalPages.value) {
    page.value++
    fetchLogs()
  }
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return dateStr
  }
}

function getActionBadgeClass(action: string) {
  const a = String(action || '').toUpperCase()
  if (a === 'HARD_DELETE') return 'badge-hard-delete'
  if (a === 'DELETE') return 'badge-delete'
  if (a === 'CREATE') return 'badge-create'
  if (a === 'UPDATE') return 'badge-update'
  return 'badge-default'
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="log-modal-overlay" @mousedown.self="emit('close')">
        <div class="log-modal-container" role="dialog" aria-modal="true">
          <!-- Header -->
          <div class="log-modal-header">
            <div class="log-header-left">
              <div class="log-header-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
              </div>
              <div>
                <h3 class="log-modal-title">Activity Logs</h3>
                <span class="log-modal-subtitle">Modul: <strong>{{ moduleLabel }}</strong> &bull; Total: {{ total }} aktivitas</span>
              </div>
            </div>
            <div class="log-header-right">
              <button class="log-refresh-btn" title="Refresh Log" :disabled="loading" @click="fetchLogs">
                <svg :class="{ 'spin-anim': loading }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <polyline points="1 20 1 14 7 14"></polyline>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
              </button>
              <button class="log-close-btn" title="Tutup" @click="emit('close')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>

          <!-- Filter Toolbar -->
          <div class="log-modal-toolbar">
            <div class="log-search-wrap">
              <svg class="search-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                v-model="searchQuery"
                type="text"
                class="log-search-input"
                placeholder="Cari user, ID data, deskripsi..."
                @keyup.enter="handleSearch"
              />
              <button v-if="searchQuery" class="clear-btn" @click="searchQuery = ''; handleSearch()">✕</button>
            </div>
            <div class="log-action-filters">
              <!-- Module Switcher if opened with module prop -->
              <div v-if="props.module" class="module-filter-group">
                <button
                  class="filter-chip filter-chip--scope"
                  :class="{ active: selectedModule === props.module }"
                  @click="setModuleFilter(props.module)"
                >
                  {{ props.module.replace(/_/g, ' ').toUpperCase() }}
                </button>
                <button
                  class="filter-chip filter-chip--scope"
                  :class="{ active: selectedModule === '' }"
                  @click="setModuleFilter('')"
                >
                  Semua Modul
                </button>
              </div>

              <div class="filter-divider" v-if="props.module"></div>

              <button
                class="filter-chip"
                :class="{ active: selectedAction === '' }"
                @click="handleActionFilter('')"
              >
                Semua
              </button>
              <button
                class="filter-chip filter-chip--danger"
                :class="{ active: selectedAction === 'DELETE' }"
                @click="handleActionFilter('DELETE')"
              >
                Delete
              </button>
              <button
                class="filter-chip filter-chip--hard"
                :class="{ active: selectedAction === 'HARD_DELETE' }"
                @click="handleActionFilter('HARD_DELETE')"
              >
                Hard Delete
              </button>
              <button
                class="filter-chip filter-chip--primary"
                :class="{ active: selectedAction === 'CREATE' }"
                @click="handleActionFilter('CREATE')"
              >
                Create
              </button>
              <button
                class="filter-chip filter-chip--warning"
                :class="{ active: selectedAction === 'UPDATE' }"
                @click="handleActionFilter('UPDATE')"
              >
                Update
              </button>
            </div>
          </div>

          <!-- Table Content -->
          <div class="log-modal-body">
            <div v-if="loading" class="log-loading-state">
              <div class="log-spinner"></div>
              <span>Memuat data logs aktivitas...</span>
            </div>

            <div v-else-if="items.length === 0" class="log-empty-state">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <p class="empty-main-text">
                {{ selectedModule ? `Belum ada log aktivitas untuk modul ${moduleLabel}.` : 'Belum ada log aktivitas sistem.' }}
              </p>
              <p class="empty-sub-text">
                Fitur Activity Log otomatis mencatat pembuatan (CREATE), pengubahan (UPDATE), dan penghapusan (DELETE) data operasional baru.
              </p>
              <button
                v-if="selectedModule"
                type="button"
                class="log-btn-show-all"
                @click="setModuleFilter('')"
              >
                Lihat Log Semua Modul
              </button>
            </div>

            <div v-else class="log-table-wrap">
              <table class="log-table">
                <thead>
                  <tr>
                    <th style="width: 160px;">Waktu</th>
                    <th style="width: 160px;">User & Role</th>
                    <th style="width: 110px;">Aksi</th>
                    <th style="width: 110px;">ID Record</th>
                    <th>Deskripsi</th>
                    <th style="width: 110px;">IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="log in items" :key="log.id">
                    <td class="log-time-cell">
                      {{ formatDate(log.created_at) }}
                    </td>
                    <td>
                      <div class="log-user-info">
                        <span class="user-name">{{ log.user_name || 'System' }}</span>
                        <span class="user-role-badge">{{ log.user_role || '-' }}</span>
                      </div>
                    </td>
                    <td>
                      <span class="action-badge" :class="getActionBadgeClass(log.action)">
                        {{ log.action }}
                      </span>
                    </td>
                    <td>
                      <code class="log-record-id">{{ log.record_id || '-' }}</code>
                    </td>
                    <td class="log-desc-cell">
                      {{ log.description }}
                    </td>
                    <td class="log-ip-cell">
                      {{ log.ip_address || '-' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Footer Pagination -->
          <div class="log-modal-footer">
            <span class="log-page-info">
              Halaman {{ page }} dari {{ totalPages }} ({{ total }} records)
            </span>
            <div class="log-pagination-btns">
              <button
                class="log-page-btn"
                :disabled="page <= 1 || loading"
                @click="prevPage"
              >
                &larr; Sebelumnya
              </button>
              <button
                class="log-page-btn"
                :disabled="page >= totalPages || loading"
                @click="nextPage"
              >
                Selanjutnya &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.log-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.log-modal-container {
  background: var(--color-surface, #ffffff);
  color: var(--color-text, #1e293b);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 14px;
  width: 100%;
  max-width: 1050px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

.log-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  background: var(--color-surface-sunken, #f8fafc);
}

.log-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.log-header-icon {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  background: var(--color-primary-surface, #eff6ff);
  color: var(--color-primary, #3b82f6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.log-modal-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
  color: var(--color-text, #0f172a);
}

.log-modal-subtitle {
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}

.log-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-refresh-btn,
.log-close-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--color-border, #e2e8f0);
  background: var(--color-surface, #ffffff);
  color: var(--color-text-secondary, #64748b);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.log-refresh-btn:hover,
.log-close-btn:hover {
  background: var(--color-surface-hover, #f1f5f9);
  color: var(--color-text, #0f172a);
}

.log-modal-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 20px;
  background: var(--color-surface, #ffffff);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.log-search-wrap {
  position: relative;
  min-width: 260px;
  flex: 1;
  max-width: 380px;
}

.search-svg {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted, #94a3b8);
}

.log-search-input {
  width: 100%;
  height: 34px;
  padding: 0 28px 0 32px;
  font-size: 13px;
  border: 1px solid var(--color-border, #cbd5e1);
  border-radius: 6px;
  background: var(--color-surface, #ffffff);
  color: var(--color-text, #1e293b);
  outline: none;
}

.log-search-input:focus {
  border-color: var(--color-primary, #3b82f6);
}

.clear-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--color-text-muted, #94a3b8);
  font-size: 11px;
  cursor: pointer;
}

.log-action-filters {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.filter-chip {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 16px;
  border: 1px solid var(--color-border, #e2e8f0);
  background: var(--color-surface-sunken, #f8fafc);
  color: var(--color-text-secondary, #64748b);
  cursor: pointer;
  transition: all 0.15s;
}

.filter-chip:hover {
  background: var(--color-surface-hover, #f1f5f9);
}

.filter-chip.active {
  background: var(--color-text, #0f172a);
  color: #ffffff;
  border-color: var(--color-text, #0f172a);
}

.filter-chip--danger.active {
  background: #ef4444;
  border-color: #ef4444;
}

.filter-chip--hard.active {
  background: #991b1b;
  border-color: #991b1b;
}

.filter-chip--primary.active {
  background: #10b981;
  border-color: #10b981;
}

.filter-chip--warning.active {
  background: #f59e0b;
  border-color: #f59e0b;
}

.log-modal-body {
  flex: 1;
  overflow-y: auto;
  position: relative;
  min-height: 320px;
}

.log-table-wrap {
  width: 100%;
  overflow-x: auto;
}

.log-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  text-align: left;
}

.log-table th {
  padding: 10px 14px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted, #64748b);
  background: var(--color-surface-sunken, #f8fafc);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  white-space: nowrap;
}

.log-table td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
  color: var(--color-text, #334155);
}

.log-table tbody tr:hover {
  background: var(--color-surface-hover, #f8fafc);
}

.log-time-cell {
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
  white-space: nowrap;
}

.log-user-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-name {
  font-weight: 600;
  color: var(--color-text, #0f172a);
}

.user-role-badge {
  font-size: 10px;
  color: var(--color-text-secondary, #64748b);
  background: var(--color-surface-sunken, #f1f5f9);
  padding: 1px 6px;
  border-radius: 4px;
  width: fit-content;
}

.action-badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 4px;
  letter-spacing: 0.02em;
}

.badge-hard-delete {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #f87171;
}

.badge-delete {
  background: #fef2f2;
  color: #dc2626;
}

.badge-create {
  background: #ecfdf5;
  color: #059669;
}

.badge-update {
  background: #eff6ff;
  color: #2563eb;
}

.badge-default {
  background: #f1f5f9;
  color: #475569;
}

.log-record-id {
  font-family: monospace;
  font-size: 11px;
  background: var(--color-surface-sunken, #f1f5f9);
  padding: 2px 6px;
  border-radius: 4px;
  max-width: 90px;
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-desc-cell {
  max-width: 320px;
  line-height: 1.4;
  word-break: break-word;
}

.log-ip-cell {
  font-family: monospace;
  font-size: 11px;
  color: var(--color-text-muted, #94a3b8);
}

.log-loading-state,
.log-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  gap: 8px;
  padding: 32px 20px;
  text-align: center;
  color: var(--color-text-muted, #94a3b8);
}

.empty-main-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
  margin: 0;
}

.empty-sub-text {
  font-size: 12px;
  color: var(--color-text-muted, #64748b);
  max-width: 420px;
  line-height: 1.5;
  margin: 0;
}

.log-btn-show-all {
  margin-top: 10px;
  padding: 6px 16px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 8px;
  border: 1px solid var(--color-primary, #3b82f6);
  background: var(--color-primary-light, #eff6ff);
  color: var(--color-primary, #2563eb);
  cursor: pointer;
  transition: all 0.15s;
}

.log-btn-show-all:hover {
  background: var(--color-primary, #2563eb);
  color: #ffffff;
}

.module-filter-group {
  display: flex;
  gap: 4px;
}

.filter-chip--scope {
  font-weight: 700;
  letter-spacing: 0.02em;
}

.filter-chip--scope.active {
  background: var(--color-primary, #2563eb);
  border-color: var(--color-primary, #2563eb);
  color: #ffffff;
}

.filter-divider {
  width: 1px;
  height: 20px;
  background: var(--color-border, #e2e8f0);
  align-self: center;
}

.log-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--color-border, #e2e8f0);
  border-top-color: var(--color-primary, #3b82f6);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spin-anim {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.log-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid var(--color-border, #e2e8f0);
  background: var(--color-surface-sunken, #f8fafc);
}

.log-page-info {
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}

.log-pagination-btns {
  display: flex;
  gap: 8px;
}

.log-page-btn {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  border: 1px solid var(--color-border, #cbd5e1);
  background: var(--color-surface, #ffffff);
  color: var(--color-text, #1e293b);
  cursor: pointer;
}

.log-page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.log-page-btn:not(:disabled):hover {
  background: var(--color-surface-hover, #f1f5f9);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
