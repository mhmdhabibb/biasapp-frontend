<script setup lang="ts">
import { ref, computed, onMounted, reactive } from "vue";
import { useMasterStore } from "@/composables/useMasterStore";
import { resources } from "@/services/resource.service";
import { useToast } from "@/composables/useToast";
import FormModal from "@/components/ui/FormModal.vue";

const store = useMasterStore();
const toast = useToast();

const activeTab = ref<"movements" | "inventory">("movements");

// Data states
const loadingMovements = ref(false);
const loadingSummary = ref(false);
const movements = ref<any[]>([]);
const summaryProducts = ref<any[]>([]);

// Filter states
const searchQuery = ref("");
const filterType = ref("");
const filterRefType = ref("");

// Modal Opname State
const showOpnameModal = ref(false);
const submittingOpname = ref(false);
const opnameForm = reactive({
  product_id: "",
  actual_stock: 0,
  notes: "",
});

// Selected product for opname info
const selectedProductForOpname = computed(() => {
  if (!opnameForm.product_id) return null;
  return (
    summaryProducts.value.find((p) => p.id === opnameForm.product_id) ||
    store.products.value.find((p: any) => p.id === opnameForm.product_id) ||
    null
  );
});

// Stock difference preview
const stockDiff = computed(() => {
  if (!selectedProductForOpname.value) return 0;
  const current = Number(selectedProductForOpname.value.stock || 0);
  return Number(opnameForm.actual_stock) - current;
});

// KPI Metrics
const totalProductsCount = computed(() => summaryProducts.value.length || store.products.value.length || 0);
const totalUnitsCount = computed(() => {
  const list = summaryProducts.value.length ? summaryProducts.value : store.products.value;
  return list.reduce((sum: number, p: any) => sum + (Number(p.stock) || 0), 0);
});
const lowStockCount = computed(() => {
  const list = summaryProducts.value.length ? summaryProducts.value : store.products.value;
  return list.filter((p: any) => Number(p.stock) > 0 && Number(p.stock) < 5).length;
});
const outOfStockCount = computed(() => {
  const list = summaryProducts.value.length ? summaryProducts.value : store.products.value;
  return list.filter((p: any) => Number(p.stock) <= 0).length;
});

// Filtered Movements
const filteredMovements = computed(() => {
  return movements.value.filter((m) => {
    // Search filter
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase();
      const pName = (m.product?.name || "").toLowerCase();
      const pSku = (m.product?.sku || "").toLowerCase();
      const refNo = (m.reference_no || "").toLowerCase();
      const notes = (m.notes || "").toLowerCase();
      if (!pName.includes(q) && !pSku.includes(q) && !refNo.includes(q) && !notes.includes(q)) {
        return false;
      }
    }
    // Type filter
    if (filterType.value && m.movement_type !== filterType.value) {
      return false;
    }
    // Reference Type filter
    if (filterRefType.value && m.reference_type !== filterRefType.value) {
      return false;
    }
    return true;
  });
});

// Filtered Inventory / Products
const filteredProducts = computed(() => {
  const list = summaryProducts.value.length ? summaryProducts.value : store.products.value;
  if (!searchQuery.value) return list;
  const q = searchQuery.value.toLowerCase();
  return list.filter((p: any) => {
    const name = (p.name || "").toLowerCase();
    const sku = (p.sku || "").toLowerCase();
    const category = (p.product_category?.name || p.category?.name || "").toLowerCase();
    return name.includes(q) || sku.includes(q) || category.includes(q);
  });
});

// Fetch Data
async function fetchMovements() {
  loadingMovements.value = true;
  try {
    const res = await resources.stockMovements.list({ limit: 200 });
    movements.value = res.data || [];
  } catch (err: any) {
    console.error("Gagal memuat pergerakan stok:", err);
  } finally {
    loadingMovements.value = false;
  }
}

async function fetchSummary() {
  loadingSummary.value = true;
  try {
    const res = await (resources.stockMovements as any).getSummary();
    if (res?.data) {
      summaryProducts.value = res.data;
    }
  } catch (err: any) {
    console.error("Gagal memuat status stok produk:", err);
  } finally {
    loadingSummary.value = false;
  }
}

function openOpnameModal(product?: any) {
  if (product) {
    opnameForm.product_id = product.id;
    opnameForm.actual_stock = Number(product.stock) || 0;
  } else {
    opnameForm.product_id = "";
    opnameForm.actual_stock = 0;
  }
  opnameForm.notes = "";
  showOpnameModal.value = true;
}

function onProductChange() {
  if (selectedProductForOpname.value) {
    opnameForm.actual_stock = Number(selectedProductForOpname.value.stock) || 0;
  }
}

async function handleSaveOpname() {
  if (!opnameForm.product_id) {
    toast.error("Silakan pilih produk terlebih dahulu");
    return;
  }
  if (!opnameForm.notes || opnameForm.notes.trim() === "") {
    toast.error("Alasan / catatan penyesuaian wajib diisi");
    return;
  }

  submittingOpname.value = true;
  try {
    await (resources.stockMovements as any).applyOpname({
      product_id: opnameForm.product_id,
      actual_stock: Number(opnameForm.actual_stock),
      notes: opnameForm.notes.trim(),
    });

    toast.success("Stock opname berhasil dicatat dan stok telah disesuaikan!");
    showOpnameModal.value = false;

    // Refresh data
    await Promise.all([
      fetchMovements(),
      fetchSummary(),
      store.refreshOnly ? store.refreshOnly(["products"], false) : Promise.resolve(),
    ]);
  } catch (err: any) {
    toast.error(toast.fromError(err, "Gagal melakukan stock opname"));
  } finally {
    submittingOpname.value = false;
  }
}

function formatDate(iso: string) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatRefLabel(refType: string) {
  switch (refType) {
    case "sale":
      return "Penjualan (Paid)";
    case "sparepart_request":
      return "Request Form (ACC)";
    case "purchase_order":
      return "Purchase Order";
    case "stock_opname":
      return "Stock Opname";
    case "initial":
      return "Stok Awal";
    default:
      return refType || "Manual";
  }
}

onMounted(async () => {
  await Promise.all([
    fetchMovements(),
    fetchSummary(),
    store.refreshOnly ? store.refreshOnly(["products", "productCategories"]) : Promise.resolve(),
  ]);
});
</script>

<template>
  <div class="stock-control-page">
    <!-- Header -->
    <div class="page-header-container">
      <div class="page-header-content">
        <h1 class="page-title">Stock Control & Opname</h1>
        <p class="page-subtitle">
          Monitoring riwayat arus keluar-masuk stok barang, audit fisik, dan kontrol persediaan sparepart.
        </p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" @click="openOpnameModal()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Input Stock Opname
        </button>
      </div>
    </div>

    <!-- KPI Metric Cards -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-icon-box kpi-icon--blue">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          </svg>
        </div>
        <div class="kpi-info">
          <div class="kpi-label">Total Jenis Produk</div>
          <div class="kpi-value">{{ totalProductsCount }}</div>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon-box kpi-icon--emerald">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <div class="kpi-info">
          <div class="kpi-label">Total Unit Fisik</div>
          <div class="kpi-value">{{ totalUnitsCount }} <span class="unit-text">item</span></div>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon-box kpi-icon--amber">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <div class="kpi-info">
          <div class="kpi-label">Stok Menipis (&lt; 5)</div>
          <div class="kpi-value text-amber">{{ lowStockCount }}</div>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon-box kpi-icon--rose">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
        <div class="kpi-info">
          <div class="kpi-label">Stok Kosong (0)</div>
          <div class="kpi-value text-rose">{{ outOfStockCount }}</div>
        </div>
      </div>
    </div>

    <!-- Tab Bar & Filter Controls -->
    <div class="card main-card">
      <div class="tabs-container">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'movements' }"
          @click="activeTab = 'movements'"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
          Riwayat Pergerakan Stok ({{ filteredMovements.length }})
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'inventory' }"
          @click="activeTab = 'inventory'"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
          Status & Katalog Stok ({{ filteredProducts.length }})
        </button>
      </div>

      <!-- Filters Bar -->
      <div class="filters-bar">
        <div class="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Cari nama produk, SKU, nomor dokumen..."
            class="search-input"
          />
        </div>

        <template v-if="activeTab === 'movements'">
          <select v-model="filterType" class="select-filter">
            <option value="">Semua Tipe Arus</option>
            <option value="in">Masuk (IN)</option>
            <option value="out">Keluar (OUT)</option>
            <option value="adjustment">Penyesuaian (ADJUSTMENT)</option>
          </select>

          <select v-model="filterRefType" class="select-filter">
            <option value="">Semua Referensi</option>
            <option value="sale">Penjualan Dibayar</option>
            <option value="sparepart_request">Request Form ACC</option>
            <option value="stock_opname">Stock Opname</option>
            <option value="purchase_order">Purchase Order</option>
          </select>
        </template>
      </div>

      <!-- Content Tab 1: Movements Table -->
      <div v-if="activeTab === 'movements'" class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Produk</th>
              <th>Tipe</th>
              <th>Referensi</th>
              <th>No. Dokumen</th>
              <th class="text-right">Qty</th>
              <th>Stok (Sebelum &rarr; Sesudah)</th>
              <th>Catatan / Keterangan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loadingMovements">
              <td colspan="8" class="text-center py-xl text-muted">Memuat pergerakan stok...</td>
            </tr>
            <tr v-else-if="filteredMovements.length === 0">
              <td colspan="8" class="text-center py-xl text-muted">
                Belum ada data pergerakan stok yang sesuai.
              </td>
            </tr>
            <tr v-for="item in filteredMovements" :key="item.id">
              <td class="text-sm font-medium whitespace-nowrap">{{ formatDate(item.created_at) }}</td>
              <td>
                <div class="product-info">
                  <span class="product-name">{{ item.product?.name || 'Produk' }}</span>
                  <span class="product-sku">{{ item.product?.sku || '-' }}</span>
                </div>
              </td>
              <td>
                <span
                  class="badge-pill"
                  :class="{
                    'badge--in': item.movement_type === 'in',
                    'badge--out': item.movement_type === 'out',
                    'badge--adjustment': item.movement_type === 'adjustment',
                  }"
                >
                  <span class="dot"></span>
                  {{ item.movement_type?.toUpperCase() }}
                </span>
              </td>
              <td>
                <span class="badge-ref">{{ formatRefLabel(item.reference_type) }}</span>
              </td>
              <td class="font-mono text-sm">{{ item.reference_no || '-' }}</td>
              <td class="text-right font-bold" :class="item.qty > 0 ? 'text-success' : 'text-danger'">
                {{ item.qty > 0 ? `+${item.qty}` : item.qty }}
              </td>
              <td>
                <div class="stock-change-flow">
                  <span class="stock-pill">{{ item.stock_before }}</span>
                  <span class="arrow">&rarr;</span>
                  <span class="stock-pill stock-pill--after">{{ item.stock_after }}</span>
                </div>
              </td>
              <td class="text-sm text-muted">{{ item.notes || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Content Tab 2: Inventory / Stock Status -->
      <div v-if="activeTab === 'inventory'" class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Nama Produk</th>
              <th>Kategori</th>
              <th>Satuan (UOM)</th>
              <th class="text-right">Stok Fisik</th>
              <th>Status</th>
              <th class="text-center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loadingSummary">
              <td colspan="7" class="text-center py-xl text-muted">Memuat data inventori...</td>
            </tr>
            <tr v-else-if="filteredProducts.length === 0">
              <td colspan="7" class="text-center py-xl text-muted">Tidak ada produk ditemukan.</td>
            </tr>
            <tr v-for="prod in filteredProducts" :key="prod.id">
              <td class="font-mono text-sm">{{ prod.sku || '-' }}</td>
              <td>
                <div class="product-name font-semibold">{{ prod.name }}</div>
                <div v-if="prod.brand?.name" class="text-xs text-muted">Brand: {{ prod.brand.name }}</div>
              </td>
              <td>{{ prod.product_category?.name || prod.category?.name || '-' }}</td>
              <td>{{ prod.uom?.name || prod.uom || 'Unit' }}</td>
              <td class="text-right">
                <span class="stock-display" :class="{ 'stock-zero': Number(prod.stock) <= 0 }">
                  {{ prod.stock }}
                </span>
              </td>
              <td>
                <span
                  class="badge-pill"
                  :class="{
                    'badge--in': Number(prod.stock) >= 5,
                    'badge--out': Number(prod.stock) <= 0,
                    'badge--adjustment': Number(prod.stock) > 0 && Number(prod.stock) < 5,
                  }"
                >
                  <span class="dot"></span>
                  {{ Number(prod.stock) <= 0 ? 'Habis' : Number(prod.stock) < 5 ? 'Menipis' : 'Tersedia' }}
                </span>
              </td>
              <td class="text-center">
                <button
                  class="btn btn-sm btn-outline-primary"
                  @click="openOpnameModal(prod)"
                >
                  Opname Fisik
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Form Stock Opname -->
    <FormModal
      :open="showOpnameModal"
      title="Input Stock Opname (Penyesuaian Fisik)"
      max-width="600px"
      :submit-label="submittingOpname ? 'Menyimpan...' : 'Simpan Stock Opname'"
      @close="showOpnameModal = false"
      @submit="handleSaveOpname"
    >
      <div class="opname-form">
        <!-- Pilih Produk -->
        <div class="form-group mb-md">
          <label class="form-label required">Pilih Produk</label>
          <select
            v-model="opnameForm.product_id"
            class="form-input"
            required
            @change="onProductChange"
          >
            <option value="" disabled>-- Pilih Produk yang Di-opname --</option>
            <option
              v-for="p in summaryProducts.length ? summaryProducts : store.products.value"
              :key="p.id"
              :value="p.id"
            >
              {{ p.sku ? `[${p.sku}] ` : '' }}{{ p.name }} (Stok saat ini: {{ p.stock }})
            </option>
          </select>
        </div>

        <!-- Callout Stock Sistem Saat Ini -->
        <div v-if="selectedProductForOpname" class="stock-info-callout mb-md">
          <div class="callout-row">
            <span class="label">Produk Terpilih:</span>
            <span class="val font-semibold">{{ selectedProductForOpname.name }}</span>
          </div>
          <div class="callout-row">
            <span class="label">Stok Sistem Saat Ini:</span>
            <span class="val font-bold text-primary">{{ selectedProductForOpname.stock }} unit</span>
          </div>
        </div>

        <!-- Input Stok Fisik Riil -->
        <div class="form-group mb-md">
          <label class="form-label required">Stok Fisik Sebenarnya (Hasil Perhitungan Fisik)</label>
          <input
            v-model.number="opnameForm.actual_stock"
            type="number"
            min="0"
            class="form-input"
            required
            placeholder="Masukkan jumlah stok fisik..."
          />
        </div>

        <!-- Selisih Preview Card -->
        <div v-if="selectedProductForOpname" class="diff-card mb-md" :class="stockDiff >= 0 ? 'diff--plus' : 'diff--minus'">
          <div class="diff-title">Kalkulasi Selisih:</div>
          <div class="diff-val">
            {{ stockDiff > 0 ? `+${stockDiff}` : stockDiff }} unit
            <span class="diff-desc">
              ({{ stockDiff > 0 ? 'Kelebihan fisik / Penambahan stok' : stockDiff < 0 ? 'Kekurangan fisik / Pengurangan stok' : 'Stok sesuai / Tidak ada selisih' }})
            </span>
          </div>
        </div>

        <!-- Alasan / Catatan Penyesuaian -->
        <div class="form-group">
          <label class="form-label required">Catatan / Alasan Penyesuaian</label>
          <textarea
            v-model="opnameForm.notes"
            rows="3"
            class="form-input"
            required
            placeholder="Contoh: Hasil audit stok bulanan, barang rusak fisik, atau selisih pencatatan..."
          ></textarea>
        </div>
      </div>
    </FormModal>
  </div>
</template>

<style scoped>
.stock-control-page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.page-header-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text-main, #1e293b);
  margin-bottom: 0.25rem;
}

.page-subtitle {
  font-size: 0.875rem;
  color: var(--color-text-muted, #64748b);
  margin: 0;
}

/* KPI Cards */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.kpi-card {
  background: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.kpi-icon-box {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.kpi-icon--blue {
  background: rgba(37, 99, 235, 0.1);
  color: #2563eb;
}

.kpi-icon--emerald {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.kpi-icon--amber {
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.kpi-icon--rose {
  background: rgba(244, 63, 94, 0.1);
  color: #e11d48;
}

.kpi-label {
  font-size: 0.8125rem;
  color: var(--color-text-muted, #64748b);
  font-weight: 500;
}

.kpi-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text-main, #0f172a);
}

.unit-text {
  font-size: 0.875rem;
  font-weight: 400;
  color: var(--color-text-muted, #64748b);
}

.text-amber {
  color: #d97706;
}

.text-rose {
  color: #e11d48;
}

.text-success {
  color: #16a34a;
}

.text-danger {
  color: #dc2626;
}

/* Tabs */
.tabs-container {
  display: flex;
  gap: 0.5rem;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  padding: 0.5rem 1rem 0;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text-muted, #64748b);
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  color: var(--color-primary, #2563eb);
}

.tab-btn.active {
  color: var(--color-primary, #2563eb);
  border-bottom-color: var(--color-primary, #2563eb);
}

/* Filters Bar */
.filters-bar {
  display: flex;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--color-bg-subtle, #f8fafc);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  flex-wrap: wrap;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #ffffff;
  border: 1px solid var(--color-border, #cbd5e1);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  flex: 1;
  min-width: 250px;
}

.search-input {
  border: none;
  outline: none;
  width: 100%;
  font-size: 0.875rem;
}

.select-filter {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border, #cbd5e1);
  border-radius: 8px;
  background: #ffffff;
  font-size: 0.875rem;
  outline: none;
}

/* Tables */
.table-wrapper {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.data-table th {
  background: #f8fafc;
  padding: 0.75rem 1rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--color-text-muted, #64748b);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.data-table td {
  padding: 0.875rem 1rem;
  font-size: 0.875rem;
  border-bottom: 1px solid var(--color-border, #f1f5f9);
  vertical-align: middle;
}

.product-info {
  display: flex;
  flex-direction: column;
}

.product-name {
  font-weight: 600;
  color: var(--color-text-main, #1e293b);
}

.product-sku {
  font-size: 0.75rem;
  color: var(--color-text-muted, #64748b);
  font-family: monospace;
}

/* Badges */
.badge-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.badge-pill .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.badge--in {
  background: #ecfdf5;
  color: #059669;
}
.badge--in .dot {
  background: #059669;
}

.badge--out {
  background: #fef2f2;
  color: #dc2626;
}
.badge--out .dot {
  background: #dc2626;
}

.badge--adjustment {
  background: #f5f3ff;
  color: #7c3aed;
}
.badge--adjustment .dot {
  background: #7c3aed;
}

.badge-ref {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  background: #f1f5f9;
  color: #475569;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 500;
}

.stock-change-flow {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.stock-pill {
  padding: 0.2rem 0.5rem;
  background: #f1f5f9;
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 600;
}

.stock-pill--after {
  background: #e0f2fe;
  color: #0284c7;
}

.stock-display {
  font-size: 1rem;
  font-weight: 700;
}

.stock-zero {
  color: #dc2626;
}

.btn-outline-primary {
  background: transparent;
  border: 1px solid var(--color-primary, #2563eb);
  color: var(--color-primary, #2563eb);
  font-weight: 600;
  border-radius: 6px;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-outline-primary:hover {
  background: var(--color-primary, #2563eb);
  color: #ffffff;
}

/* Opname Modal Callouts */
.stock-info-callout {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 0.75rem 1rem;
}

.callout-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
}

.diff-card {
  padding: 0.75rem 1rem;
  border-radius: 8px;
}

.diff--plus {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
}

.diff--minus {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}

.diff-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}

.diff-val {
  font-size: 1.125rem;
  font-weight: 700;
  margin-top: 0.25rem;
}

.diff-desc {
  font-size: 0.8125rem;
  font-weight: 400;
}
</style>
