<script setup lang="ts">
import PageHeader from '@/components/ui/PageHeader.vue'
</script>

<template>
  <div>
    <PageHeader title="Customer Service Reports" />
    <div class="reports-container">
      <div class="report-group">
        <h3>Service Metrics</h3>
        <ul>
          <li><a href="#">Total Call Service by Month</a></li>
          <li><a href="#">Service by Customer</a></li>
          <li><a href="#">Service by Technician</a></li>
        </ul>
      </div>
      <div class="report-group">
        <h3>SLA Metrics</h3>
        <ul>
          <li><a href="#">SLA Achieved vs Breached</a></li>
          <li><a href="#">Average Service Duration</a></li>
        </ul>
      </div>
      <div class="report-group">
        <h3>Inventory & Contracts</h3>
        <ul>
          <li><a href="#">Active Contracts Summary</a></li>
          <li><a href="#">Expiring Contracts List</a></li>
          <li><a href="#">Sparepart Request & Indent Report</a></li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reports-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--space-lg);
  margin-top: var(--space-md);
}

.report-group {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
}

.report-group h3 {
  font-size: var(--font-size-md);
  margin-bottom: var(--space-md);
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border-light);
  padding-bottom: var(--space-sm);
}

.report-group ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.report-group li {
  margin-bottom: var(--space-sm);
}

.report-group a {
  color: var(--color-primary);
  text-decoration: none;
}
.report-group a:hover {
  text-decoration: underline;
}
</style>
