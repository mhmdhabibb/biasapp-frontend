<script setup lang="ts">
import { usePermission } from "@/composables/usePermission";
import { useIsSuperadmin } from "@/composables/useHardDelete";
import ActivityLogModal from "@/components/ui/ActivityLogModal.vue";
import { activeApiRequests } from "@/services/api";
import type { TableColumn } from "@/types";
import { computed, ref, useSlots, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { debounce } from "@/utils/requestCache";

const isSuperadmin = useIsSuperadmin();
const showLogsModal = ref(false);

const props = withDefaults(
  defineProps<{
    columns?: TableColumn[];
    data?: any[];
    searchPlaceholder?: string;
    /** Backend module key (e.g. "customer") used to gate default edit/delete buttons */
    permission?: string;
    /** Show the permanent-delete button (parent must gate this to superadmin) */
    showHardDelete?: boolean;
    /** Show the view / detail button (emits 'detail') */
    showDetail?: boolean;
    /** Tooltip text for the detail action button */
    detailTitle?: string;
    /** Icon style for the detail action button */
    detailIcon?: "eye" | "tracking";
    /** Items per page for pagination (default: 10) */
    perPage?: number;
    /** Total pages for server-side pagination */
    totalPages?: number;
    /** Current page for server-side pagination */
    currentPage?: number;
    /** Whether data is loading (shows shimmer skeleton) */
    loading?: boolean;
    /** Maximum height for internal scrollable data body (default: 'calc(100vh - 280px)') */
    maxHeight?: string;
    /** Enable row selection checkboxes */
    selectable?: boolean;
    /** Selected keys / ids */
    selectedKeys?: (string | number)[];
    /** Initial search query (e.g. from URL query params) */
    initialSearch?: string;
  }>(),
  {
    columns: () => [],
    data: () => [],
    searchPlaceholder: "",
    permission: "",
    showHardDelete: false,
    showDetail: false,
    detailTitle: "View Detail",
    detailIcon: "eye",
    perPage: 50,
    totalPages: 1,
    currentPage: 1,
    loading: false,
    maxHeight: "calc(100vh - 360px)",
    selectable: false,
    selectedKeys: () => [],
    initialSearch: "",
  },
);

const emit = defineEmits<{
  (e: "detail", item: any): void;
  (e: "edit", item: any): void;
  (e: "delete", item: any): void;
  (e: "hard-delete", item: any): void;
  (e: "row-click", item: any): void;
  (e: "search", query: string): void;
  (e: "page-change", page: number): void;
  (e: "update:selectedKeys", keys: (string | number)[]): void;
}>();

const slots = useSlots();
const { can } = usePermission();
const showInitialLoadSkeleton = ref(false);
let initialLoadTimer: ReturnType<typeof setTimeout> | undefined;

const hasEmptyDataRequest = computed(
  () => (props.data || []).length === 0 && activeApiRequests.value > 0,
);

watch(hasEmptyDataRequest, (isPending) => {
  if (initialLoadTimer) clearTimeout(initialLoadTimer);
  if (!isPending) {
    showInitialLoadSkeleton.value = false;
    return;
  }
  initialLoadTimer = setTimeout(() => {
    showInitialLoadSkeleton.value = true;
  }, 120);
}, { immediate: true });

const isLoading = computed(() => props.loading || showInitialLoadSkeleton.value);

onBeforeUnmount(() => {
  if (initialLoadTimer) clearTimeout(initialLoadTimer);
});

const showEdit = computed(
  () => !props.permission || can(`${props.permission}:update`),
);
const showDelete = computed(
  () => !props.permission || can(`${props.permission}:delete`),
);
const showDefaultActions = computed(
  () =>
    props.showDetail ||
    showEdit.value ||
    showDelete.value ||
    (props.showHardDelete && isSuperadmin.value),
);
// ACTION column: always shown when a custom #actions slot decides its own content,
// otherwise only when at least one default action button is visible.
const showActionsColumn = computed(
  () => Boolean(slots.actions) || Boolean(slots['cell(actions)']) || Boolean(slots['cell-actions']) || showDefaultActions.value,
);

const searchQuery = ref(props.initialSearch || "");
watch(
  () => props.initialSearch,
  (val) => {
    if (typeof val === "string") {
      searchQuery.value = val;
      internalPage.value = 1;
    }
  },
);
const internalPage = ref(props.currentPage || 1);

const perPage = computed(() => props.perPage || 50);

const processedData = computed(() => {
  const list = props.data || [];
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter((row: any) => {
    if (!row || typeof row !== "object") return false;
    if (row.serial_no && String(row.serial_no).toLowerCase().includes(q)) return true;
    return Object.values(row).some((val) => {
      if (val == null) return false;
      if (typeof val === "string" || typeof val === "number") {
        return String(val).toLowerCase().includes(q);
      }
      return false;
    });
  });
});

const selectedSet = computed(() => new Set((props.selectedKeys || []).map(String)));

function isRowSelected(row: any): boolean {
  if (!row || row.id == null) return false;
  return selectedSet.value.has(String(row.id));
}

const isAllSelected = computed(() => {
  if (!props.selectable || !displayData.value.length) return false;
  return displayData.value.every((row: any) => selectedSet.value.has(String(row.id)));
});

const isIndeterminate = computed(() => {
  if (!props.selectable || !displayData.value.length) return false;
  const count = displayData.value.filter((row: any) => selectedSet.value.has(String(row.id))).length;
  return count > 0 && count < displayData.value.length;
});

function handleToggleSelectAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  const currentIds = displayData.value.map((r: any) => String(r.id)).filter(Boolean);
  let next: string[];
  if (checked) {
    next = Array.from(new Set([...(props.selectedKeys || []).map(String), ...currentIds]));
  } else {
    const removeSet = new Set(currentIds);
    next = (props.selectedKeys || []).map(String).filter((id) => !removeSet.has(id));
  }
  emit("update:selectedKeys", next);
}

function handleToggleRow(row: any) {
  if (!row || row.id == null) return;
  const idStr = String(row.id);
  const current = (props.selectedKeys || []).map(String);
  let next: string[];
  if (current.includes(idStr)) {
    next = current.filter((id) => id !== idStr);
  } else {
    next = [...current, idStr];
  }
  emit("update:selectedKeys", next);
}

const totalPagesCount = computed(() => {
  if (
    props.totalPages &&
    props.totalPages > 1 &&
    props.data &&
    props.data.length <= perPage.value
  ) {
    return props.totalPages;
  }
  return Math.max(1, Math.ceil(processedData.value.length / perPage.value));
});

watch(totalPagesCount, (newTotal) => {
  if (internalPage.value > newTotal) {
    internalPage.value = Math.max(1, newTotal);
  }
});

const currentPage = computed({
  get: () => {
    if (
      props.totalPages &&
      props.totalPages > 1 &&
      props.data &&
      props.data.length <= perPage.value
    ) {
      return props.currentPage || 1;
    }
    return internalPage.value;
  },
  set: (val: number) => {
    internalPage.value = val;
    emit("page-change", val);
  },
});

const displayData = computed(() => {
  if (
    props.totalPages &&
    props.totalPages > 1 &&
    props.data &&
    props.data.length <= perPage.value
  ) {
    return processedData.value;
  }
  const start = (currentPage.value - 1) * perPage.value;
  return processedData.value.slice(start, start + perPage.value);
});

const emitSearch = debounce((query: string) => {
  emit("search", query);
}, 300);

function handleSearchInput(query: string) {
  searchQuery.value = query;
  internalPage.value = 1;
  emit("page-change", 1);
  emitSearch(query);
}

function goToPage(page: number) {
  if (page >= 1 && page <= totalPagesCount.value) {
    currentPage.value = page;
  }
}

const visiblePages = computed(() => {
  const pages: number[] = [];
  const total = totalPagesCount.value;
  const current = currentPage.value;
  const delta = 2;
  for (
    let i = Math.max(1, current - delta);
    i <= Math.min(total, current + delta);
    i++
  ) {
    pages.push(i);
  }
  return pages;
});

function isNowrapColumn(col: TableColumn): boolean {
  if (col.nowrap === true) return true;
  if (col.wrap === true) return false;
  const k = (col.key || "").toLowerCase();
  return (
    k === "status" ||
    k === "date" ||
    k.includes("date") ||
    k.includes("_at") ||
    k === "price" ||
    k === "amount" ||
    k === "total" ||
    k === "rate" ||
    k === "qty" ||
    k === "stock" ||
    k === "phone" ||
    k.includes("phone") ||
    k === "action" ||
    k === "actions" ||
    k === "is_copier" ||
    k === "is_sparepart"
  );
}
</script>

<template>
  <div class="data-table-wrapper">
    <div class="data-table-toolbar">
      <div class="search-box">
        <svg
          class="search-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          v-model="searchQuery"
          type="search"
          class="form-input search-input"
          :placeholder="searchPlaceholder || 'Search data...'"
          @input="handleSearchInput(($event.target as HTMLInputElement).value)"
        />
      </div>
      <div class="toolbar-right">
        <button
          v-if="isSuperadmin"
          type="button"
          class="btn-activity-logs"
          title="Pantau Logs Aktivitas Modul Ini (Khusus Superadmin)"
          @click="showLogsModal = true"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <span>Logs</span>
        </button>
        <slot name="toolbar"></slot>
        <span class="data-count" aria-live="polite">
          {{ `${processedData.length} items` }}
        </span>
      </div>
    </div>

    <!-- Skeleton Loading State -->
    <div v-if="isLoading" class="table-scroll" :style="maxHeight && maxHeight !== 'none' ? { maxHeight } : {}">
      <table class="data-table skeleton-table">
        <thead>
          <tr>
            <th v-if="selectable" style="width: 44px; text-align: center;"></th>
            <th class="th-num">#</th>
            <th
              v-for="col in columns"
              :key="col.key"
              :style="col.width ? { width: col.width, minWidth: col.width, maxWidth: col.width } : {}"
            >
              {{ col.label }}
            </th>
            <th v-if="showActionsColumn" class="th-actions">ACTION</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in 5" :key="r" class="skeleton-row">
            <td v-if="selectable" style="width: 44px; text-align: center;">
              <span class="skeleton-box" style="width: 16px; height: 16px; margin: 0 auto; display: inline-block;"></span>
            </td>
            <td class="td-num">
              <span class="skeleton-box skeleton-box--sm"></span>
            </td>
            <td v-for="col in columns" :key="col.key">
              <span class="skeleton-box" :style="{ width: `${45 + ((r * 19 + (col.label?.length || 5) * 11) % 40)}%` }"></span>
            </td>
            <td v-if="showActionsColumn" class="td-actions">
              <span class="skeleton-box skeleton-box--actions"></span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="!data || data.length === 0" class="empty-state">
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-text-muted)"
        stroke-width="1.5"
      >
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="9" y1="15" x2="15" y2="15" />
      </svg>
      <p class="empty-title">No data yet</p>
      <p class="empty-desc">Data you add will appear here</p>
    </div>

    <div
      v-else-if="searchQuery && processedData.length === 0"
      class="empty-state"
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-text-muted)"
        stroke-width="1.5"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
      <p class="empty-title">Not found</p>
      <p class="empty-desc">No data matches "{{ searchQuery }}"</p>
    </div>

    <div v-else class="table-scroll" :style="maxHeight && maxHeight !== 'none' ? { maxHeight } : {}">
      <table class="data-table">
        <thead>
          <tr>
            <th v-if="selectable" class="th-checkbox" style="width: 44px; text-align: center;">
              <input
                type="checkbox"
                :checked="isAllSelected"
                :indeterminate="isIndeterminate"
                @change="handleToggleSelectAll"
                title="Pilih semua di halaman ini"
                style="cursor: pointer; width: 16px; height: 16px; accent-color: #2563eb;"
              />
            </th>
            <th class="th-num">#</th>
            <th
              v-for="col in columns"
              :key="col.key"
              :style="col.width ? { width: col.width, minWidth: col.width, maxWidth: col.width } : {}"
            >
              {{ col.label }}
            </th>
            <th v-if="showActionsColumn" class="th-actions">ACTION</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, idx) in displayData"
            :key="row.id ?? idx"
            :class="{ 'row-selected': isRowSelected(row) }"
            @click="$emit('row-click', row)"
            style="cursor: pointer;"
          >
            <td v-if="selectable" class="td-checkbox" style="width: 44px; text-align: center;" @click.stop>
              <input
                type="checkbox"
                :checked="isRowSelected(row)"
                @change="handleToggleRow(row)"
                style="cursor: pointer; width: 16px; height: 16px; accent-color: #2563eb;"
              />
            </td>
            <td class="td-num">{{ (currentPage - 1) * perPage + idx + 1 }}</td>
            <td
              v-for="col in columns"
              :key="col.key"
              :class="{
                'cell-nowrap': isNowrapColumn(col),
                'cell-wrap': !isNowrapColumn(col)
              }"
              :style="col.width ? { width: col.width, minWidth: col.width } : {}"
            >
              <slot :name="`cell-${col.key}`" :value="row[col.key]" :row="row" :item="row">
                <slot :name="`cell(${col.key})`" :value="row[col.key]" :row="row" :item="row">
                  {{ row[col.key] ?? "-" }}
                </slot>
              </slot>
            </td>
            <td v-if="showActionsColumn" class="td-actions">
              <slot name="actions" :row="row" :item="row">
                <slot name="cell(actions)" :row="row" :item="row">
                  <slot name="cell-actions" :row="row" :item="row">
                <button
                  v-if="showDetail"
                  class="action-btn action-btn--detail"
                  :title="detailTitle || 'View Detail'"
                  @click.stop="$emit('detail', row)"
                >
                  <svg
                    v-if="detailIcon === 'tracking'"
                    class="action-icon"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  <svg
                    v-else
                    class="action-icon"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path
                      d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                    ></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
                <button
                  v-if="showEdit"
                  class="action-btn action-btn--edit"
                  title="Edit"
                  @click.stop="$emit('edit', row)"
                >
                  <svg
                    class="action-icon"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path
                      d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
                    ></path>
                    <path
                      d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                    ></path>
                  </svg>
                </button>
                <button
                  v-if="showDelete"
                  class="action-btn action-btn--delete"
                  title="Delete"
                  @click.stop="$emit('delete', row)"
                >
                  <svg
                    class="action-icon"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path
                      d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"
                    ></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                </button>
                <button
                  v-if="showHardDelete && isSuperadmin"
                  class="action-btn action-btn--hard"
                  title="Hapus permanen dari database (superadmin)"
                  @click.stop="$emit('hard-delete', row)"
                >
                  <svg
                    class="action-icon"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path
                      d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"
                    ></path>
                    <line x1="12" y1="11" x2="12" y2="17"></line>
                  </svg>
                </button>
                  </slot>
                </slot>
              </slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="totalPagesCount > 1" class="pagination">
      <div class="pagination-info">
        Menampilkan {{ (currentPage - 1) * perPage + 1 }}-{{ Math.min(currentPage * perPage, processedData.length) }} dari {{ processedData.length }} data
      </div>
      <div class="pagination-buttons">
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
          :disabled="currentPage === totalPagesCount"
          @click="goToPage(currentPage + 1)"
        >
          Next
        </button>
      </div>
    </div>

    <!-- Activity Log Modal (Superadmin Only) -->
    <ActivityLogModal
      v-if="isSuperadmin"
      :open="showLogsModal"
      :module="props.permission"
      @close="showLogsModal = false"
    />
  </div>
</template>

<style scoped>
.data-table-wrapper {
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.data-table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-base);
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border-light);
  flex-wrap: wrap;
}

.btn-activity-logs {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 600;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-border, #cbd5e1);
  background: var(--color-surface, #ffffff);
  color: var(--color-text-secondary, #475569);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-activity-logs:hover {
  background: var(--color-primary-surface, #eff6ff);
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
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

.toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
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
  overflow-y: auto;
  min-height: 200px;
  position: relative;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: #94a3b8 #f1f5f9;
}

/* Scrollbar styles to ensure scrollbar is always prominent and easily draggable */
.table-scroll::-webkit-scrollbar {
  width: 8px;
  height: 10px;
}

.table-scroll::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 6px;
}

.table-scroll::-webkit-scrollbar-thumb {
  background: #94a3b8;
  border-radius: 6px;
  border: 2px solid #f1f5f9;
}

.table-scroll::-webkit-scrollbar-thumb:hover {
  background: #64748b;
}

.data-table {
  width: 100%;
  max-width: 100%;
  font-size: var(--font-size-sm);
  border-collapse: separate;
  border-spacing: 0;
  table-layout: auto;
}

.data-table th {
  position: sticky;
  top: 0;
  z-index: 5;
  padding: 10px 12px;
  text-align: left;
  font-weight: 600;
  color: var(--color-text-muted);
  font-size: 12px;
  background: var(--color-surface, #ffffff);
  border-bottom: 2px solid var(--color-border-light, #e2e8f0);
  box-shadow: inset 0 -1px 0 var(--color-border-light, #e2e8f0);
  white-space: nowrap;
  letter-spacing: 0.02em;
}

.data-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border-light);
  color: var(--color-text);
  vertical-align: middle;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: break-word;
  line-height: 1.4;
}

.data-table td.cell-wrap {
  white-space: normal !important;
  word-break: break-word !important;
  overflow-wrap: break-word !important;
}

.data-table td.cell-nowrap {
  white-space: nowrap !important;
}

/* Ensure flex wrappers inside cells wrap instead of forcing horizontal overflow */
.data-table td :deep(div) {
  flex-wrap: wrap;
}

.data-table td :deep(.badge) {
  white-space: nowrap;
}

.data-table td :deep(.mono) {
  white-space: nowrap;
}

.data-table tbody tr:hover {
  background: var(--color-surface-raised);
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.th-num,
.td-num {
  width: 44px;
  min-width: 44px;
  max-width: 44px;
  text-align: center;
  color: var(--color-text-muted);
  padding: 10px 6px;
}

.th-checkbox,
.td-checkbox {
  width: 40px;
  min-width: 40px;
  max-width: 40px;
  text-align: center;
  padding: 10px 6px;
}

.th-actions {
  width: 110px;
  min-width: 110px;
  text-align: center;
}

.td-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
  width: 110px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 6px;
  cursor: pointer;
  border: none;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast),
    transform var(--transition-fast),
    box-shadow var(--transition-fast);
}

.action-btn:active {
  transform: scale(0.92);
}

.action-btn--detail {
  background: rgba(14, 165, 233, 0.1);
  color: #0284c7;
}

.action-btn--detail:hover {
  background: #0284c7;
  color: #fff;
  box-shadow: 0 2px 8px rgba(2, 132, 199, 0.3);
}

.action-btn--edit {
  background: rgba(48, 92, 255, 0.1);
  color: var(--color-primary);
}

.action-btn--edit:hover {
  background: var(--color-primary);
  color: #fff;
  box-shadow: 0 2px 8px rgba(48, 92, 255, 0.3);
}

.action-btn--delete {
  background: rgba(220, 38, 38, 0.1);
  color: var(--color-danger);
}

.action-btn--delete:hover {
  background: var(--color-danger);
  color: #fff;
  box-shadow: 0 2px 8px rgba(220, 38, 38, 0.3);
}

/* .action-btn--hard lives in assets/main.css (global) so custom
   #actions slots can reuse the same style. */

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  border-top: 1px solid var(--color-border-light);
  flex-wrap: wrap;
}

.pagination-info {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.pagination-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Skeleton Styles */
.skeleton-box {
  display: inline-block;
  height: 14px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    rgba(226, 232, 240, 0.6) 25%,
    rgba(203, 213, 225, 0.9) 37%,
    rgba(226, 232, 240, 0.6) 63%
  );
  background-size: 400% 100%;
  animation: skeleton-shimmer 1.4s ease infinite;
}

.skeleton-box--sm {
  width: 20px;
  height: 14px;
}

.skeleton-box--actions {
  width: 60px;
  height: 24px;
  border-radius: 6px;
}

.skeleton-row td {
  padding: 14px 16px;
  vertical-align: middle;
}

.row-selected {
  background-color: #f0f7ff !important;
}

.th-checkbox,
.td-checkbox {
  width: 44px;
  min-width: 44px;
  max-width: 44px;
  text-align: center;
  padding: 10px 4px !important;
  vertical-align: middle;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}
</style>
