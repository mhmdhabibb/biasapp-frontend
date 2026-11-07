<script setup lang="ts">
withDefaults(defineProps<{
  variant?: "customer-service" | "technician" | "accounting";
}>(), {
  variant: "customer-service",
});

const cards = [1, 2, 3, 4];
const shortcuts = [1, 2, 3, 4, 5, 6];
const rows = [1, 2, 3];
</script>

<template>
  <section
    class="dashboard-skeleton"
    :class="`dashboard-skeleton--${variant}`"
    aria-busy="true"
    aria-label="Memuat dashboard"
  >
    <header class="ds-heading">
      <div class="ds-heading-copy">
        <div class="ds-line ds-title ds-shimmer" />
        <div class="ds-line ds-subtitle ds-shimmer" />
      </div>
      <div v-if="variant !== 'technician'" class="ds-header-action ds-shimmer" />
    </header>

    <section v-if="variant === 'technician'" class="ds-shortcuts">
      <div class="ds-section-heading">
        <div class="ds-line ds-section-title ds-shimmer" />
        <div class="ds-line ds-section-subtitle ds-shimmer" />
      </div>
      <div class="ds-shortcut-grid">
        <div v-for="item in shortcuts" :key="item" class="ds-shortcut">
          <div class="ds-shortcut-icon ds-shimmer" />
          <div class="ds-line ds-shortcut-label ds-shimmer" />
        </div>
      </div>
    </section>

    <section class="ds-stat-grid" aria-hidden="true">
      <div v-for="card in cards" :key="card" class="ds-stat-card">
        <div class="ds-stat-heading">
          <div class="ds-line ds-stat-label ds-shimmer" />
          <div class="ds-stat-icon ds-shimmer" />
        </div>
        <div class="ds-line ds-stat-value ds-shimmer" />
        <div class="ds-line ds-stat-detail ds-shimmer" />
      </div>
    </section>

    <section v-if="variant === 'technician'" class="ds-jobs-panel">
      <div class="ds-panel-heading">
        <div class="ds-line ds-section-title ds-shimmer" />
        <div class="ds-line ds-total ds-shimmer" />
      </div>
      <div class="ds-job-grid">
        <div v-for="row in rows" :key="row" class="ds-job-card">
          <div class="ds-job-header">
            <div class="ds-line ds-job-number ds-shimmer" />
            <div class="ds-line ds-job-status ds-shimmer" />
          </div>
          <div class="ds-line ds-job-detail ds-shimmer" />
          <div class="ds-line ds-job-detail ds-job-detail-short ds-shimmer" />
          <div class="ds-job-footer">
            <div class="ds-line ds-job-detail-short ds-shimmer" />
            <div class="ds-stat-icon ds-shimmer" />
          </div>
        </div>
      </div>
    </section>

    <section v-else class="ds-panel-grid">
      <div
        v-for="panel in (variant === 'customer-service' ? 3 : 1)"
        :key="panel"
        class="ds-panel"
      >
        <div class="ds-line ds-panel-title ds-shimmer" />
        <template v-if="variant === 'customer-service' && panel === 3">
          <div class="ds-chart-area">
            <div class="ds-chart ds-shimmer" />
          </div>
        </template>
        <div v-else class="ds-list">
          <div v-for="row in [1, 2]" :key="row" class="ds-list-row">
            <div class="ds-list-icon ds-shimmer" />
            <div class="ds-list-copy">
              <div class="ds-line ds-list-title ds-shimmer" />
              <div class="ds-line ds-list-detail ds-shimmer" />
            </div>
          </div>
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.dashboard-skeleton {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: 24px;
}

.ds-shimmer {
  background: linear-gradient(90deg, #e8edf3 20%, #f5f7fa 42%, #e8edf3 64%);
  background-size: 300% 100%;
  animation: ds-shimmer 1.35s ease-in-out infinite;
}

@keyframes ds-shimmer {
  from { background-position: 100% 0; }
  to { background-position: -100% 0; }
}

.ds-line {
  height: 12px;
  border-radius: 6px;
}

.ds-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 64px;
}

.ds-heading-copy {
  display: grid;
  gap: 10px;
}

.ds-title { width: 210px; height: 26px; }
.ds-subtitle { width: min(390px, 72vw); height: 13px; }
.ds-header-action { width: 138px; height: 36px; border-radius: 8px; }

.ds-shortcuts,
.ds-jobs-panel,
.ds-panel,
.ds-stat-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 14px;
}

.ds-shortcuts { padding: 18px; }
.ds-section-heading { display: grid; gap: 8px; margin-bottom: 16px; }
.ds-section-title { width: 155px; height: 17px; }
.ds-section-subtitle { width: 225px; height: 11px; }

.ds-shortcut-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.ds-shortcut {
  min-height: 66px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 10px;
}

.ds-shortcut-icon,
.ds-stat-icon { width: 34px; height: 34px; border-radius: 50%; flex: 0 0 auto; }
.ds-shortcut-label { width: 62%; height: 13px; }

.ds-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.ds-stat-card { min-height: 150px; padding: 20px; display: flex; flex-direction: column; gap: 15px; }
.ds-stat-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ds-stat-label { width: 58%; height: 14px; }
.ds-stat-value { width: 72px; height: 36px; margin-top: 3px; }
.ds-stat-detail { width: 78%; height: 11px; }

.ds-panel-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.dashboard-skeleton--accounting .ds-panel-grid { grid-template-columns: 1fr; }
.ds-panel { min-height: 220px; padding: 20px; }
.ds-panel-title { width: 145px; height: 17px; margin-bottom: 17px; }
.ds-list { display: flex; flex-direction: column; }
.ds-list-row { display: flex; align-items: center; gap: 14px; min-height: 72px; border-bottom: 1px dashed var(--color-border-light, #e2e8f0); }
.ds-list-row:last-child { border-bottom: 0; }
.ds-list-icon { width: 42px; height: 42px; border-radius: 50%; flex: 0 0 auto; }
.ds-list-copy { display: grid; gap: 8px; width: min(100%, 300px); }
.ds-list-title { width: 62%; height: 13px; }
.ds-list-detail { width: 82%; height: 11px; }
.ds-chart-area { min-height: 155px; display: grid; place-items: center; }
.ds-chart { width: 150px; aspect-ratio: 1; border-radius: 50%; }

.ds-jobs-panel { padding: 20px; }
.ds-panel-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.ds-total { width: 62px; height: 22px; border-radius: 12px; }
.ds-job-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.ds-job-card { min-width: 0; padding: 16px; display: flex; flex-direction: column; gap: 14px; border: 1px solid var(--color-border-light, #e2e8f0); border-radius: 12px; }
.ds-job-header, .ds-job-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ds-job-number { width: 46%; height: 14px; }
.ds-job-status { width: 76px; height: 22px; border-radius: 12px; }
.ds-job-detail { width: 88%; height: 12px; }
.ds-job-detail-short { width: 62%; }

@media (max-width: 900px) {
  .ds-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ds-panel-grid { grid-template-columns: 1fr; }
  .ds-job-grid { grid-template-columns: 1fr; }
}

@media (max-width: 560px) {
  .dashboard-skeleton { gap: 14px; }
  .ds-shortcuts, .ds-jobs-panel, .ds-panel, .ds-stat-card { padding: 14px; }
  .ds-shortcut-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .ds-shortcut { min-height: 56px; padding: 9px; gap: 8px; }
  .ds-shortcut-icon, .ds-stat-icon { width: 28px; height: 28px; }
  .ds-stat-grid { gap: 10px; }
  .ds-stat-card { min-height: 128px; gap: 12px; }
  .ds-title { width: 170px; height: 23px; }
}
</style>