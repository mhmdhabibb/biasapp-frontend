<script setup lang="ts">
/**
 * PageSkeleton — Full-page skeleton screen shown while data is loading.
 * Mimics the real page layout: PageHeader, optional summary cards, search bar, and table rows.
 */
defineProps<{
  /** Number of summary stat cards to show (0 = none) */
  cards?: number
  /** Number of table columns */
  columns?: number
  /** Number of skeleton table rows */
  rows?: number
  /** Show action buttons area in header */
  showHeaderActions?: boolean
  /** Show a filter control between the page header and table */
  showFilter?: boolean
}>()
</script>

<template>
  <div class="page-skeleton" aria-busy="true" aria-label="Loading...">
    <!-- Header Skeleton -->
    <div class="skel-header">
      <div class="skel-title skel-shimmer" />
      <div class="skel-header-actions" v-if="showHeaderActions">
        <div class="skel-btn skel-shimmer" />
        <div class="skel-btn skel-shimmer" />
      </div>
      <div v-else class="skel-btn-accent skel-shimmer" />
    </div>

    <div v-if="showFilter" class="skel-filter-wrap">
      <div class="skel-filter skel-shimmer" />
    </div>

    <!-- Summary Cards Skeleton -->
    <div v-if="(cards || 0) > 0" class="skel-cards" :style="{ gridTemplateColumns: `repeat(auto-fit, minmax(${(cards || 3) > 4 ? '160px' : '200px'}, 1fr))` }">
      <div v-for="c in (cards || 3)" :key="c" class="skel-card">
        <div class="skel-card-label skel-shimmer" />
        <div class="skel-card-value skel-shimmer" />
      </div>
    </div>

    <!-- Table Skeleton -->
    <div class="skel-table-wrap">
      <!-- Search bar -->
      <div class="skel-toolbar">
        <div class="skel-search skel-shimmer" />
        <div class="skel-search-right skel-shimmer" />
      </div>
      <!-- Table head -->
      <div class="skel-table">
        <div class="skel-thead">
          <div v-for="col in (columns || 5)" :key="col" class="skel-th skel-shimmer" :style="{ width: col === 1 ? '5%' : undefined }" />
        </div>
        <!-- Table body rows -->
        <div v-for="row in (rows || 8)" :key="row" class="skel-tr">
          <div
            v-for="col in (columns || 5)"
            :key="col"
            class="skel-td"
          >
            <div
              class="skel-cell skel-shimmer"
              :style="{ width: col === 1 ? '24px' : `${40 + ((row * 17 + col * 23) % 50)}%` }"
            />
          </div>
        </div>
      </div>
      <!-- Pagination -->
      <div class="skel-pagination">
        <div class="skel-page-info skel-shimmer" />
        <div class="skel-page-btns">
          <div class="skel-page-btn skel-shimmer" />
          <div class="skel-page-btn skel-shimmer" />
          <div class="skel-page-btn skel-shimmer" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-skeleton {
  padding: 0;
}

/* ── Shimmer animation ── */
.skel-shimmer {
  background: linear-gradient(
    90deg,
    rgba(226, 232, 240, 0.6) 25%,
    rgba(203, 213, 225, 0.9) 37%,
    rgba(226, 232, 240, 0.6) 63%
  );
  background-size: 400% 100%;
  animation: skel-pulse 1.4s ease infinite;
  border-radius: 6px;
}

@keyframes skel-pulse {
  0%   { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

/* ── Header ── */
.skel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding: 0 0 16px 0;
  border-bottom: 1px solid var(--color-border-light, #e2e8f0);
}

.skel-title {
  width: 200px;
  height: 28px;
  border-radius: 6px;
}

.skel-header-actions {
  display: flex;
  gap: 10px;
}

.skel-btn {
  width: 110px;
  height: 36px;
  border-radius: 8px;
}

.skel-btn-accent {
  width: 140px;
  height: 36px;
  border-radius: 8px;
}

.skel-filter-wrap {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.skel-filter {
  width: 210px;
  height: 40px;
  border-radius: 8px;
}

/* ── Summary Cards ── */
.skel-cards {
  display: grid;
  gap: 16px;
  margin-bottom: 20px;
}

.skel-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.skel-card-label {
  width: 70%;
  height: 12px;
}

.skel-card-value {
  width: 50%;
  height: 24px;
}

/* ── Table wrap ── */
.skel-table-wrap {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 10px;
  overflow: hidden;
}

.skel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border-light, #e2e8f0);
}

.skel-search {
  width: 260px;
  height: 36px;
  border-radius: 8px;
}

.skel-search-right {
  width: 90px;
  height: 30px;
  border-radius: 6px;
}

.skel-table {
  width: 100%;
}

.skel-thead {
  display: flex;
  gap: 0;
  padding: 12px 16px;
  background: var(--color-bg-alt, #f8fafc);
  border-bottom: 1px solid var(--color-border-light, #e2e8f0);
}

.skel-th {
  flex: 1;
  height: 14px;
  margin: 0 8px;
}

.skel-tr {
  display: flex;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border-light, #e7eaf0);
}

.skel-tr:last-child {
  border-bottom: none;
}

.skel-td {
  flex: 1;
  padding: 0 8px;
  display: flex;
  align-items: center;
}

.skel-cell {
  height: 14px;
}

/* ── Pagination ── */
.skel-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border-light, #e2e8f0);
}

.skel-page-info {
  width: 160px;
  height: 14px;
}

.skel-page-btns {
  display: flex;
  gap: 6px;
}

.skel-page-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
}

/* ── Dark mode support ── */
:root[data-theme="dark"] .skel-shimmer,
.dark .skel-shimmer {
  background: linear-gradient(
    90deg,
    rgba(51, 65, 85, 0.6) 25%,
    rgba(71, 85, 105, 0.9) 37%,
    rgba(51, 65, 85, 0.6) 63%
  );
  background-size: 400% 100%;
  animation: skel-pulse 1.4s ease infinite;
}
</style>

