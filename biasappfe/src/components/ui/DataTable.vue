<script setup lang="ts">
import { ref, computed } from 'vue'
import type { TableColumn } from '@/types'

const props = defineProps<{
  columns: TableColumn[]
  data: any[]
  searchPlaceholder?: string
}>()

defineEmits<{
  (e: 'edit', item: any): void
  (e: 'delete', item: any): void
}>()

const searchQuery = ref('')
const currentPage = ref(1)
const perPage = 10

const filteredData = computed(() => {
  if (!searchQuery.value.trim()) return props.data
  const q = searchQuery.value.toLowerCase()
  return props.data.filter((row) =>
    props.columns.some((col) => {
      const val = row[col.key]
      if (val == null) return false
      return String(val).toLowerCase().includes(q)
    })
  )
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredData.value.length / perPage)))
const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * perPage
  return filteredData.value.slice(start, start + perPage)
})

function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
  }
}

const visiblePages = computed(() => {
  const pages: number[] = []
  const total = totalPages.value
  const current = currentPage.value
  const delta = 2
  for (let i = Math.max(1, current - delta); i <= Math.min(total, current + delta); i++) {
    pages.push(i)
  }
  return pages
})
</script>

<template>
  <div class="data-table-wrapper">
    <div class="data-table-toolbar">
      <div class="search-box">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          v-model="searchQuery"
          type="search"
          class="form-input search-input"
          :placeholder="searchPlaceholder || 'Cari data...'"
          @input="currentPage = 1"
        >
      </div>
      <span class="data-count">{{ filteredData.length }} data</span>
    </div>

    <div v-if="data.length === 0" class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" stroke-width="1.5">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="9" y1="15" x2="15" y2="15"/>
      </svg>
      <p class="empty-title">Belum ada data</p>
      <p class="empty-desc">Data yang Anda tambahkan akan muncul di sini</p>
    </div>

    <div v-else-if="filteredData.length === 0 && searchQuery" class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" stroke-width="1.5">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <line x1="8" y1="11" x2="14" y2="11"/>
      </svg>
      <p class="empty-title">Tidak ditemukan</p>
      <p class="empty-desc">Tidak ada data yang cocok dengan "{{ searchQuery }}"</p>
    </div>

    <div v-else class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th class="th-num">#</th>
            <th
              v-for="col in columns"
              :key="col.key"
              :style="col.width ? { width: col.width } : {}"
            >
              {{ col.label }}
            </th>
            <th class="th-actions">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in paginatedData" :key="row.id ?? idx">
            <td class="td-num">{{ (currentPage - 1) * perPage + idx + 1 }}</td>
            <td v-for="col in columns" :key="col.key">
              <slot :name="`cell-${col.key}`" :value="row[col.key]" :row="row">
                {{ row[col.key] ?? '-' }}
              </slot>
            </td>
            <td class="td-actions">
              <button
                class="btn btn-ghost btn-sm"
                title="Edit"
                @click="$emit('edit', row)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Edit
              </button>
              <button
                class="btn btn-ghost btn-sm btn-danger-text"
                title="Hapus"
                @click="$emit('delete', row)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
                Hapus
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="filteredData.length > perPage" class="pagination">
      <button
        class="btn btn-outline btn-sm"
        :disabled="currentPage === 1"
        @click="goToPage(currentPage - 1)"
      >
        Prev
      </button>
      <button
        v-for="page in visiblePages"
        :key="page"
        class="btn btn-sm"
        :class="page === currentPage ? 'btn-primary' : 'btn-outline'"
        @click="goToPage(page)"
      >
        {{ page }}
      </button>
      <button
        class="btn btn-outline btn-sm"
        :disabled="currentPage === totalPages"
        @click="goToPage(currentPage + 1)"
      >
        Next
      </button>
    </div>
  </div>
</template>

<style scoped>
.data-table-wrapper {
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
}

.data-table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-base);
  padding: var(--space-lg);
  border-bottom: 1px solid var(--color-border-light);
  flex-wrap: wrap;
}

.search-box {
  position: relative;
  flex: 1;
  max-width: 320px;
  min-width: 180px;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  pointer-events: none;
}

.search-input {
  padding-left: 34px;
}

.data-count {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  white-space: nowrap;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-2xl) var(--space-lg);
  text-align: center;
}

.empty-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
}

.empty-desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.table-scroll {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  font-size: var(--font-size-sm);
}

.data-table th {
  padding: var(--space-md) var(--space-lg);
  text-align: left;
  font-weight: var(--font-weight-medium);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  background: transparent;
  border-bottom: 1px solid var(--color-border-light);
  white-space: nowrap;
}

.data-table td {
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--color-border-light);
  color: var(--color-text);
  vertical-align: middle;
}

.data-table tbody tr:hover {
  background: var(--color-surface-raised);
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.th-num, .td-num {
  width: 48px;
  text-align: center;
  color: var(--color-text-muted);
}

.th-actions {
  width: 160px;
}

.td-actions {
  display: flex;
  gap: var(--space-xs);
  white-space: nowrap;
}

.btn-danger-text {
  color: var(--color-danger);
}
.btn-danger-text:hover {
  background: var(--color-danger-surface);
  color: var(--color-danger);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  padding: var(--space-md);
  border-top: 1px solid var(--color-border-light);
}
</style>
