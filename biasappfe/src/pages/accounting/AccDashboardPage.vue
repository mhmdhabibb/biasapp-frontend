<script setup lang="ts">
import { computed } from "vue";
import PageHeader from "@/components/ui/PageHeader.vue";
import { useMasterStore } from "@/composables/useMasterStore";

const {
  sparepartRequests,
  purchaseOrders,
  procurementDeliveryOrders,
  rentalInvoices,
  salesInvoices,
} = useMasterStore();

// Derived metrics for top cards
const pendingRequests = computed(
  () => sparepartRequests.value.filter((r) => r.status === "pending").length,
);
const activePOs = computed(
  () =>
    purchaseOrders.value.filter(
      (po) => po.status !== "completed" && po.status !== "cancelled",
    ).length,
);
const pendingDeliveries = computed(
  () =>
    procurementDeliveryOrders.value.filter(
      (d) => d.status === "draft" || d.status === "issued",
    ).length,
);

const unpaidRentalInvoices = computed(
  () => rentalInvoices.value.filter((i) => i.payment_status !== "paid").length,
);
const unpaidSalesInvoices = computed(
  () => salesInvoices.value.filter((i) => i.payment_status !== "paid").length,
);
const totalUnpaidInvoices = computed(
  () => unpaidRentalInvoices.value + unpaidSalesInvoices.value,
);

// Data for bottom cards
const completedPOs = computed(
  () => purchaseOrders.value.filter((po) => po.status === "completed").length,
);
const cancelledPOs = computed(
  () => purchaseOrders.value.filter((po) => po.status === "cancelled").length,
);

const approvedRequests = computed(
  () =>
    sparepartRequests.value.filter(
      (r) => r.status === "approved" || r.status === "processed",
    ).length,
);

const totalInvoices = computed(
  () => rentalInvoices.value.length + salesInvoices.value.length,
);
const completionPercentage = computed(() => {
  if (totalInvoices.value === 0) return 0;
  const paid =
    rentalInvoices.value.filter((i) => i.payment_status === "paid").length +
    salesInvoices.value.filter((i) => i.payment_status === "paid").length;
  return Math.round((paid / totalInvoices.value) * 100);
});
</script>

<template>
  <div class="dashboard-container">
    <PageHeader title="Accounting Dashboard" />
    <p class="subtitle">
      Monitor and manage your financial and procurement operations.
    </p>

    <!-- Top Cards -->
    <div class="top-cards">
      <div class="card card-primary">
        <div class="card-header">
          <span>Pending Requests</span>
          <span class="icon-wrapper">
            <svg
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
                d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
              ></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          </span>
        </div>
        <div class="card-value">{{ pendingRequests }}</div>
        <div class="card-footer">
          <span class="icon-up"
            ><svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="18 15 12 9 6 15"></polyline></svg
          ></span>
          Waiting for approval
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span>Active POs</span>
          <span class="icon-wrapper">
            <svg
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
                d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2 M9 2h6a1 1 0 011 1v1a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1z"
              />
            </svg>
          </span>
        </div>
        <div class="card-value">{{ activePOs }}</div>
        <div class="card-footer">
          <span class="icon-up text-success-color"
            ><svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="18 15 12 9 6 15"></polyline></svg
          ></span>
          In progress
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span>Pending Deliveries</span>
          <span class="icon-wrapper">
            <svg
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
                d="M1 3h15v13H1z M16 8h4l3 3v5h-7z M5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z M18.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"
              />
            </svg>
          </span>
        </div>
        <div class="card-value">{{ pendingDeliveries }}</div>
        <div class="card-footer">
          <span class="icon-up text-success-color"
            ><svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="18 15 12 9 6 15"></polyline></svg
          ></span>
          Awaiting goods
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span>Unpaid Invoices</span>
          <span class="icon-wrapper">
            <svg
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
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
              ></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </span>
        </div>
        <div class="card-value text-danger-color">
          {{ totalUnpaidInvoices }}
        </div>
        <div class="card-footer">
          <span
            class="icon-up text-danger-color"
            style="background: rgba(239, 68, 68, 0.1)"
            ><svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="6 9 12 15 18 9"></polyline></svg
          ></span>
          Needs follow-up
        </div>
      </div>
    </div>

    <!-- Main Grid -->
    <div class="secondary-grid">
      <div class="card section-card">
        <div class="section-header">
          <h3 class="section-title">Sparepart Requests</h3>
        </div>
        <div class="list-item">
          <div
            class="list-icon"
            style="background: rgba(245, 158, 11, 0.1); color: #f59e0b"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
              ></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          </div>
          <div class="list-content">
            <div class="list-title">Pending Approval</div>
            <div class="list-desc">
              {{ pendingRequests }} awaiting your action
            </div>
          </div>
        </div>
        <div class="list-item">
          <div
            class="list-icon"
            style="background: rgba(16, 185, 129, 0.1); color: #10b981"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <div class="list-content">
            <div class="list-title">Approved / Processed</div>
            <div class="list-desc">{{ approvedRequests }} handled recently</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.subtitle {
  color: var(--color-text-muted);
  margin-top: -10px;
  margin-bottom: 24px;
}

.top-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}

.card {
  background: var(--color-surface, #fff);
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid var(--color-border);
}

.card-primary {
  background: var(--color-primary);
  color: white;
  border: none;
}

.card-primary .card-subtitle,
.card-primary .icon-wrapper {
  color: rgba(255, 255, 255, 0.8);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 500;
  font-size: 15px;
}

.card:not(.card-primary) .card-header {
  color: var(--color-text);
}

.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid currentColor;
  opacity: 0.6;
}

.card-value {
  font-size: 42px;
  font-weight: 700;
  line-height: 1;
  margin: 8px 0;
}

.card-footer {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.card:not(.card-primary) .card-footer {
  color: var(--color-text-muted);
}

.icon-up {
  width: 20px;
  height: 20px;
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-primary .icon-up {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.text-success-color {
  color: #10b981;
}
.text-danger-color {
  color: #ef4444;
}

/* Secondary Grid */
.secondary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
}

@media (max-width: 900px) {
  .secondary-grid {
    grid-template-columns: 1fr;
  }
}

.section-card {
  padding: 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--color-text);
}

/* List Items */
.list-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px dashed var(--color-border);
}
.list-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.list-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--color-surface-sunken);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
}

.list-content {
  flex: 1;
}

.list-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text);
}
.list-desc {
  font-size: 13px;
  color: var(--color-text-muted);
  margin-top: 4px;
}

/* Donut Chart */
.donut-chart-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
  min-height: 200px;
}
.donut-chart {
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: conic-gradient(
    var(--color-primary) var(--completion-deg, 0deg),
    var(--color-surface-sunken) 0deg
  );
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.donut-inner {
  width: 130px;
  height: 130px;
  background: var(--color-surface, #fff);
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.donut-percentage {
  font-size: 36px;
  font-weight: 700;
  line-height: 1;
  color: var(--color-text);
}
.donut-label {
  font-size: 13px;
  color: var(--color-text-muted);
  margin-top: 6px;
  font-weight: 500;
}
</style>
