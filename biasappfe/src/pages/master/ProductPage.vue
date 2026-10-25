<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, watch, computed } from "vue";
import PageHeader from "@/components/ui/PageHeader.vue";
import DataTable from "@/components/ui/DataTable.vue";
import ExcelImportButtons from "@/components/ui/ExcelImportButtons.vue";
import FormModal from "@/components/ui/FormModal.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import CustomSelect from "@/components/ui/CustomSelect.vue";
import html2pdf from "html2pdf.js";
import * as XLSX from "xlsx";
import { resources } from "@/services/resource.service";
import {
  type TableColumn,
  type Product,
  type ProductCategory,
  type UOM,
} from "@/types";
import { useToast } from "@/composables/useToast";
import { useHardDelete } from '@/composables/useHardDelete';
import { downloadStyledExcel, NUMFMT_COUNT, NUMFMT_RP, type StyledCell } from "@/utils/exportHelpers";
import { BIAS_LOGO_DATA_URL } from "@/utils/logoData";
import { formatProductDisplayName } from "@/utils/format";

const toast = useToast();

const columns: TableColumn[] = [
  { key: "name", label: "Consumable / Sparepart Name" },
  { key: "sku", label: "SN" },
  { key: "price", label: "Price" },
  { key: "stock", label: "Stock" },
  { key: "category.name", label: "Item" },
  { key: "uom.name", label: "UOM" },
  { key: "is_sparepart", label: "Sparepart?" },
];

const data = ref<Product[]>([]);
const categories = ref<ProductCategory[]>([]);
const uoms = ref<UOM[]>([]);

const categoryOptions = computed(() => categories.value.map(c => ({ value: c.id, label: c.name })))
const uomOptions = computed(() => uoms.value.map(u => ({ value: u.id, label: u.name })))

async function fetchData() {
  try {
    const res = await resources.products.list();
    data.value = Array.isArray(res.data) ? (res.data as any) : [];
  } catch (error) {
    console.error("Failed to fetch products:", error);
    toast.error("Failed to fetch data: " + ((error as any).message || "Error"));
  }
}

async function fetchCategories() {
  try {
    const res = await resources.productCategories.list();
    categories.value = Array.isArray(res.data) ? (res.data as any) : [];
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    toast.error("Failed to fetch data: " + ((error as any).message || "Error"));
  }
}

async function fetchUoms() {
  try {
    const res = await resources.uoms.list();
    uoms.value = Array.isArray(res.data) ? (res.data as any) : [];
  } catch (error) {
    console.error("Failed to fetch UOMs:", error);
    toast.error(
      "Failed to fetch UOM data: " + ((error as any).message || "Error"),
    );
  }
}

let productPollingTimer: any = null;

function silentRefresh() {
  if (document.visibilityState === "visible") {
    resources.products.list().then((res) => {
      if (Array.isArray(res.data)) {
        data.value = res.data as any;
      }
    }).catch(() => {});
  }
}

onMounted(() => {
  fetchData();
  fetchCategories();
  fetchUoms();
  productPollingTimer = setInterval(silentRefresh, 4000);
  window.addEventListener("focus", silentRefresh);
  window.addEventListener("bias:data-mutated", silentRefresh);
  document.addEventListener("visibilitychange", silentRefresh);
});

onUnmounted(() => {
  if (productPollingTimer) clearInterval(productPollingTimer);
  window.removeEventListener("focus", silentRefresh);
  window.removeEventListener("bias:data-mutated", silentRefresh);
  document.removeEventListener("visibilitychange", silentRefresh);
});

const showModal = ref(false);
const showConfirm = ref(false);
const editingItem = ref<Product | null>(null);
const deletingItem = ref<Product | null>(null);
const form = reactive({
  name: "",
  sku: "",
  category_id: "",
  brand_id: null as any,
  uom_id: "" as string | null,
  price: 0,
  stock: 0,
  is_computer: false,
  is_sparepart: false,
  specsData: {
    cpu: "",
    ram: "",
    storage: "",
    storage_type: "",
    os: "",
    vga: "",
    office: "",
  },
});

function generateSKU(prefix = "PRD"): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = `${prefix}-`;
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function getCategoryPrefix(categoryId: string | number | null | undefined): string {
  if (!categoryId) return "PRD";
  const category = categories.value.find(
    (item) => String(item.id) === String(categoryId),
  );
  const words = ((category as any)?.name || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "PRD";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .map((word: string) => word[0])
    .join("")
    .toUpperCase();
}

watch(
  () => form.category_id,
  (categoryId) => {
    if (!categoryId) return;
    const prefix = getCategoryPrefix(categoryId);
    const sku = form.sku || "";
    if (!sku || sku.startsWith("PRD-") || categories.value.some((c) => sku.startsWith(getCategoryPrefix(c.id) + "-"))) {
      const suffix = sku ? sku.split("-").slice(1).join("-") : "";
      form.sku = `${prefix}-${suffix || generateSKU().slice(4)}`.toUpperCase();
    }
  },
);

function openAdd() {
  editingItem.value = null;
  Object.assign(form, {
    name: "",
    sku: generateSKU().toUpperCase(),
    category_id: "",
    brand_id: null,
    uom_id: "",
    price: 0,
    stock: 0,
    is_computer: false,
    is_sparepart: false,
    specsData: {
      cpu: "",
      ram: "",
      storage: "",
      storage_type: "",
      os: "",
      vga: "",
      office: "",
    },
  });
  showModal.value = true;
}

function openEdit(item: Product) {
  editingItem.value = item;
  Object.assign(form, {
    name: item.name,
    sku: (item.sku || "").toUpperCase(),
    category_id: item.category_id,
    brand_id: item.brand_id,
    uom_id: (item as any).uom_id ?? "",
    price: item.price,
    stock: item.stock,
    is_computer: !!(item as any).is_computer,
    is_sparepart: !!(item as any).is_sparepart,
    specsData: (item as any).specs
      ? typeof (item as any).specs === "string"
        ? JSON.parse((item as any).specs || "{}")
        : (item as any).specs
      : {
          cpu: "",
          ram: "",
          storage: "",
          storage_type: "",
          os: "",
          vga: "",
          office: "",
        },
  });
  showModal.value = true;
}

async function handleSubmit() {
  if (!form.name.trim()) {
    toast.warning("Product name is required!");
    return;
  }
  if (!form.category_id) {
    toast.warning(
      categories.value.length === 0
        ? "No product categories yet, please create one first in Master > Product Categories"
        : "Category is required!",
    );
    return;
  }
  try {
    const cleanSku = form.sku ? form.sku.trim().toUpperCase() : "";
    const payload = {
      ...form,
      sku: cleanSku,
      uom_id: form.uom_id ? form.uom_id : null,
      price: Number(form.price) || 0,
      stock: Number(form.stock) || 0,
      specs: form.is_computer ? JSON.stringify(form.specsData) : "",
    };
    if (editingItem.value) {
      await resources.products.update(String(editingItem.value.id), payload);
    } else {
      await resources.products.create(payload);
    }
    await fetchData();
    showModal.value = false;
    toast.success(
      editingItem.value
        ? "Product updated successfully!"
        : "Product saved successfully!",
    );
  } catch (error) {
    console.error("Failed to save product:", error);
    toast.error(
      "Failed to save product: " + ((error as any).message || "Error"),
    );
  }
}

const hardDelete = useHardDelete((id: string) => resources.products.hardRemove(id), fetchData)

function openDelete(item: Product) {
  deletingItem.value = item;
  showConfirm.value = true;
}

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.products.remove(String(deletingItem.value.id));
      await fetchData();
      toast.success("Product deleted successfully!");
    } catch (error) {
      console.error("Failed to delete product:", error);
      toast.error("Failed to delete product");
    }
  }
  showConfirm.value = false;
}

function formatRupiah(val: number): string {
  return "Rp " + val.toLocaleString("id-ID");
}

const totalStockQty = computed(() => (data.value || []).reduce((acc, p) => acc + (Number(p.stock) || 0), 0));
const totalStockValue = computed(() => (data.value || []).reduce((acc, p) => acc + ((Number(p.stock) || 0) * (Number(p.price) || 0)), 0));

async function exportStockExcel() {
  if (!data.value.length) {
    toast.error("Tidak ada data stok untuk diekspor");
    return;
  }

  const dateStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const rows: StyledCell[][] = [
    [{ v: 'PT. BIAS SURYA TEKNOLOGI', mergeAcross: 7, style: 'titleCell' }],
    [{ v: 'LAPORAN STOK & VALUASI BARANG (CONSUMABLE / SPAREPART)', mergeAcross: 7, style: 'plainBoldCenter' }],
    [{ v: 'Ruko Purimas Blok A No.47 Kota Batam, Kepulauan Riau - Indonesia | Phone: +62 811 7045 657', mergeAcross: 7, style: 'subTitleCell' }],
    [{ v: `Tanggal Cetak: ${dateStr}`, mergeAcross: 7, style: 'subTitleCell' }],
    [],
    [
      { v: 'RINGKASAN VALUASI STOK', mergeAcross: 7, style: 'plainBoldCenter' },
    ],
    [
      { v: 'Total Jenis Barang (SKU)', style: 'headerCell', mergeAcross: 2 }, {}, {},
      { v: 'Total Fisik Stok (Qty)', style: 'headerCell', mergeAcross: 1 }, {},
      { v: 'Total Nilai Valuasi Stok (Rp)', style: 'headerCell', mergeAcross: 2 }, {}, {},
    ],
    [
      { v: `${data.value.length} Item`, style: 'grandTotalCell', mergeAcross: 2 }, {}, {},
      { v: totalStockQty.value, style: 'grandTotalCell', mergeAcross: 1, numFmt: NUMFMT_COUNT }, {},
      { v: totalStockValue.value, style: 'grandTotalCell', mergeAcross: 2, numFmt: NUMFMT_RP }, {}, {},
    ],
    [],
    [
      { v: 'No', style: 'headerCell' },
      { v: 'Nama Barang / Sparepart', style: 'headerCell' },
      { v: 'SN / SKU', style: 'headerCell' },
      { v: 'Kategori / Item', style: 'headerCell' },
      { v: 'UOM', style: 'headerCell' },
      { v: 'Stok', style: 'headerCell' },
      { v: 'Harga Satuan (Rp)', style: 'headerCell' },
      { v: 'Total Nilai Stok (Rp)', style: 'headerCell' },
    ],
  ];

  data.value.forEach((p, idx) => {
    const stockQty = Number(p.stock) || 0;
    const priceVal = Number(p.price) || 0;
    const totalVal = stockQty * priceVal;

    rows.push([
      { v: idx + 1, style: 'borderCenter' },
      { v: formatProductDisplayName(p), style: 'border' },
      { v: p.sku || '-', style: 'borderCenter' },
      { v: (p.category as any)?.name || '-', style: 'border' },
      { v: (p.uom as any)?.name || '-', style: 'borderCenter' },
      { v: stockQty, style: 'borderRight', numFmt: NUMFMT_COUNT },
      { v: priceVal, style: 'borderRight', numFmt: NUMFMT_RP },
      { v: totalVal, style: 'borderBoldRight', numFmt: NUMFMT_RP },
    ]);
  });

  // Grand Total row
  rows.push([
    { v: 'GRAND TOTAL', mergeAcross: 4, style: 'grandTotalCell' },
    {}, {}, {}, {},
    { v: totalStockQty.value, style: 'grandTotalCell', numFmt: NUMFMT_COUNT },
    { v: '', style: 'grandTotalCell' },
    { v: totalStockValue.value, style: 'grandTotalCell', numFmt: NUMFMT_RP },
  ]);

  const columnWidths = [6, 38, 18, 22, 10, 14, 20, 24];
  await downloadStyledExcel(
    [{ name: 'Stok Barang', columnWidths, rows }],
    `Laporan_Stok_BiAS_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
  toast.success("Laporan stok berhasil diekspor ke Excel!");
}

function exportStockPdf() {
  if (!data.value.length) {
    toast.error("Tidak ada data stok untuk diekspor");
    return;
  }
  const dateStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const totalItems = data.value.length;
  const totalQty = totalStockQty.value.toLocaleString('id-ID');
  const totalValStr = 'Rp ' + totalStockValue.value.toLocaleString('id-ID');

  const rowsHtml = data.value.map((p, idx) => {
    const stockQty = Number(p.stock) || 0;
    const priceVal = Number(p.price) || 0;
    const totalVal = stockQty * priceVal;
    return `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td style="font-weight: 500;">${formatProductDisplayName(p)}</td>
        <td style="text-align: center; font-family: monospace;">${p.sku || '-'}</td>
        <td>${(p.category as any)?.name || '-'}</td>
        <td style="text-align: center;">${(p.uom as any)?.name || '-'}</td>
        <td style="text-align: center; font-weight: 600;">${stockQty}</td>
        <td style="text-align: right;">Rp ${priceVal.toLocaleString('id-ID')}</td>
        <td style="text-align: right; font-weight: 700;">Rp ${totalVal.toLocaleString('id-ID')}</td>
      </tr>
    `;
  }).join('');

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Laporan Stok & Valuasi Barang - BiAS</title>
  <style>
    @media print {
      @page { margin: 8mm; size: landscape; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1e293b; margin: 0; padding: 15px; }
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; border-bottom: 2px solid #003366; padding-bottom: 10px; }
    .logo { width: 70px; height: 70px; object-fit: contain; }
    .company-title h1 { margin: 0; font-size: 18px; font-weight: 800; color: #003366; letter-spacing: 0.5px; }
    .company-title h2 { margin: 2px 0 4px 0; font-size: 12px; font-style: italic; color: #64748b; font-weight: normal; }
    .company-title p { margin: 0; font-size: 10px; color: #475569; line-height: 1.4; }
    .doc-title { text-align: right; vertical-align: top; }
    .doc-title h2 { margin: 0; font-size: 18px; font-weight: 800; color: #003366; }
    .doc-title p { margin: 4px 0 0 0; font-size: 11px; color: #64748b; }
    
    .kpi-container { display: flex; gap: 12px; margin-bottom: 16px; }
    .kpi-card { flex: 1; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 14px; }
    .kpi-label { font-size: 10px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 3px; }
    .kpi-val { font-size: 16px; font-weight: 800; color: #0f172a; }

    table.data-table { width: 100%; border-collapse: collapse; margin-top: 5px; }
    table.data-table thead { display: table-header-group; }
    table.data-table tr { page-break-inside: avoid; }
    table.data-table th { background-color: #003366; color: #ffffff; border: 1px solid #002244; padding: 7px 8px; text-align: left; font-size: 10.5px; }
    table.data-table td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 10.5px; vertical-align: middle; }
    table.data-table tr:nth-child(even) { background-color: #f8fafc; }
    table.data-table tfoot td { background-color: #e2e8f0; font-weight: 800; border: 1px solid #94a3b8; }
  </style>
</head>
<body>
  <table class="header-table">
    <tr>
      <td style="width: 80px; vertical-align: top;">
        <img src="${BIAS_LOGO_DATA_URL}" class="logo" alt="BiAS Logo" />
      </td>
      <td style="vertical-align: top; padding-left: 10px;">
        <div class="company-title">
          <h1>PT. BIAS SURYA TEKNOLOGI</h1>
          <h2>The shape of smart</h2>
          <p>Ruko Purimas Blok A No.47 Kota Batam, Kepulauan Riau - Indonesia<br>
          Phone: +62811 704 5657 | Email: admin@biasbst.com | Web: www.biassuryateknologi.com</p>
        </div>
      </td>
      <td class="doc-title">
        <h2>LAPORAN STOK & VALUASI</h2>
        <p>Tanggal Cetak: <strong>${dateStr}</strong></p>
      </td>
    </tr>
  </table>

  <div class="kpi-container">
    <div class="kpi-card">
      <div class="kpi-label">Total Jenis Barang</div>
      <div class="kpi-val">${totalItems} Item</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total Kuantitas Fisik</div>
      <div class="kpi-val">${totalQty} Unit / Pcs</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Grand Total Nilai Stok</div>
      <div class="kpi-val" style="color: #0284c7;">${totalValStr}</div>
    </div>
  </div>

  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 35px; text-align: center;">No</th>
        <th>Nama Consumable / Sparepart</th>
        <th style="width: 120px; text-align: center;">SN / SKU</th>
        <th style="width: 140px;">Item / Kategori</th>
        <th style="width: 60px; text-align: center;">UOM</th>
        <th style="width: 70px; text-align: center;">Stok</th>
        <th style="width: 130px; text-align: right;">Harga Satuan</th>
        <th style="width: 150px; text-align: right;">Total Nilai</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="5" style="text-align: center;">GRAND TOTAL</td>
        <td style="text-align: center;">${totalQty}</td>
        <td></td>
        <td style="text-align: right; color: #003366;">${totalValStr}</td>
      </tr>
    </tfoot>
  </table>

  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 400);
    };
  <\/script>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (w) {
    w.document.write(fullHtml);
    w.document.close();
  } else {
    toast.error('Pop-up terblokir oleh browser. Izinkan pop-up untuk mencetak PDF.');
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="Consumable / Sparepart"
      button-label="Add Consumable / Sparepart"
      permission="product:create"
      @add="openAdd"
    >
      <template #actions>
        <button class="btn btn-outline" @click="exportStockPdf" style="display: flex; align-items: center; gap: 6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Export Stock PDF
        </button>
        <button class="btn btn-outline" @click="exportStockExcel" style="display: flex; align-items: center; gap: 6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="17"></line><line x1="16" y1="13" x2="8" y2="17"></line></svg>
          Export Stock Excel
        </button>
      </template>
    </PageHeader>

    <!-- Summary Cards -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 20px;">
      <div class="card p-md" style="background: var(--color-surface, #fff); border: 1px solid var(--color-border-light); border-radius: 8px; padding: 16px;">
        <div style="font-size: 12px; color: var(--color-text-muted); font-weight: 600; text-transform: uppercase;">Total Items</div>
        <div style="font-size: 24px; font-weight: bold; margin-top: 4px; color: var(--color-text);">{{ data.length }}</div>
      </div>
      <div class="card p-md" style="background: var(--color-surface, #fff); border: 1px solid var(--color-border-light); border-radius: 8px; padding: 16px;">
        <div style="font-size: 12px; color: var(--color-text-muted); font-weight: 600; text-transform: uppercase;">Total Stock Qty</div>
        <div style="font-size: 24px; font-weight: bold; margin-top: 4px; color: var(--color-primary, #2563eb);">{{ totalStockQty.toLocaleString('id-ID') }}</div>
      </div>
      <div class="card p-md" style="background: var(--color-surface, #fff); border: 1px solid var(--color-border-light); border-radius: 8px; padding: 16px;">
        <div style="font-size: 12px; color: var(--color-text-muted); font-weight: 600; text-transform: uppercase;">Total Nilai Stock</div>
        <div style="font-size: 24px; font-weight: bold; margin-top: 4px; color: var(--color-success, #16a34a);">{{ formatRupiah(totalStockValue) }}</div>
      </div>
    </div>

    <DataTable
      :columns="columns"
      :data="data"
      search-placeholder="Search consumable / sparepart..."
      permission="product"
      @edit="openEdit"
      @delete="openDelete" :show-hard-delete="hardDelete.isSuperadmin" @hard-delete="hardDelete.open"
    >
      <template #toolbar>
        <ExcelImportButtons master-key="product" @imported="fetchData" />
      </template>
      <template #cell-name="{ row }">{{ formatProductDisplayName(row) }}</template>
      <template #cell-price="{ value }">{{
        formatRupiah(value || 0)
      }}</template>
      <template #cell-category.name="{ row }">{{
        row.category?.name ?? "-"
      }}</template>
      <template #cell-uom.name="{ row }">{{ row.uom?.name ?? "-" }}</template>
      <template #cell-is_sparepart="{ value }">
        <span :style="{ color: value ? 'var(--color-primary, #10b981)' : 'var(--color-text-muted, #94a3b8)', fontWeight: value ? '600' : 'normal' }">
          {{ value ? 'Yes' : 'No' }}
        </span>
      </template>
    </DataTable>
    <FormModal
      :open="showModal"
      :title="editingItem ? 'Edit Consumable / Sparepart' : 'Add Consumable / Sparepart'"
      @close="showModal = false"
      @submit="handleSubmit"
    >
      <div class="form-group">
        <label for="prod-name" class="form-label">Consumable / Sparepart Name</label>
        <input
          id="prod-name"
          v-model="form.name"
          type="text"
          class="form-input"
          placeholder="Product / sparepart name"
        />
      </div>
      <div class="form-group">
        <label for="prod-sku" class="form-label">
          SN (Serial Number)
          <span style="font-weight: normal; font-size: 12px; color: var(--color-text-muted);"> (Optional)</span>
        </label>
        <input
          id="prod-sku"
          v-model="form.sku"
          @input="form.sku = ($event.target as HTMLInputElement).value.toUpperCase()"
          type="text"
          class="form-input"
          style="text-transform: uppercase;"
          placeholder="Ketik SN atau biarkan default"
        />
      </div>
      <div class="form-group">
        <label for="category_id" class="form-label">Item</label>
        <CustomSelect
          id="category_id"
          v-model="form.category_id"
          :options="categoryOptions"
          placeholder="-- Select Item --"
        />
        <p
          v-if="categories.length === 0"
          style="
            margin-top: 6px;
            font-size: 12px;
            color: var(--color-text-muted, #64748b);
          "
        >
          No categories yet. Please create one first in Master &gt; Product
          Categories.
        </p>
      </div>
      <div class="form-group">
        <label for="uom_id" class="form-label">UOM (Unit)</label>
        <CustomSelect
          id="uom_id"
          v-model="form.uom_id"
          :options="uomOptions"
          placeholder="-- Select UOM --"
        />
        <p
          v-if="uoms.length === 0"
          style="
            margin-top: 6px;
            font-size: 12px;
            color: var(--color-text-muted, #64748b);
          "
        >
          No UOMs yet. Please create one first in Master &gt; UOMs.
        </p>
      </div>
      <div class="form-group">
        <label for="prod-price" class="form-label">Price (Rp)</label>
        <input
          id="prod-price"
          v-model.number="form.price"
          type="number"
          class="form-input"
          placeholder="0"
          min="0"
        />
      </div>
      <div class="form-group">
        <label for="prod-stock" class="form-label">Stock</label>
        <input
          id="prod-stock"
          v-model.number="form.stock"
          type="number"
          class="form-input"
          placeholder="0"
          min="0"
        />
      </div>
      <div class="form-group">
        <label class="form-label">Total Nilai Stok (Harga × Stok)</label>
        <input
          type="text"
          class="form-input"
          :value="formatRupiah((form.price || 0) * (form.stock || 0))"
          disabled
          readonly
          style="background-color: var(--color-surface-hover); cursor: not-allowed; font-weight: 600;"
        />
      </div>
      <div class="form-group" style="margin-top: 1rem">
        <label
          class="form-label"
          style="
            display: flex;
            align-items: center;
            gap: 0.5rem;
            cursor: pointer;
          "
        >
          <input
            type="checkbox"
            v-model="form.is_computer"
            style="width: 1rem; height: 1rem"
          />
          Is a Computer / PC / Laptop
        </label>
      </div>
      <div class="form-group" style="margin-top: 1rem">
        <label
          class="form-label"
          style="
            display: flex;
            align-items: center;
            gap: 0.5rem;
            cursor: pointer;
          "
        >
          <input
            type="checkbox"
            v-model="form.is_sparepart"
            style="width: 1rem; height: 1rem"
          />
          Is a Sparepart
        </label>
      </div>
      <div
        v-if="form.is_computer"
        style="
          margin-top: 1rem;
          border-top: 1px solid var(--color-border-light);
          padding-top: 1rem;
        "
      >
        <h4 style="margin-bottom: 1rem; font-weight: 600">
          Computer / Desktop Specifications
        </h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem">
          <div class="form-group">
            <label class="form-label">CPU</label>
            <input
              v-model="form.specsData.cpu"
              type="text"
              class="form-input"
              placeholder="e.g. Intel Core i5"
            />
          </div>
          <div class="form-group">
            <label class="form-label">RAM</label>
            <input
              v-model="form.specsData.ram"
              type="text"
              class="form-input"
              placeholder="e.g. 8GB DDR4"
            />
          </div>
          <div class="form-group">
            <label class="form-label">Storage</label>
            <input
              v-model="form.specsData.storage"
              type="text"
              class="form-input"
              placeholder="e.g. 512GB"
            />
          </div>
          <div class="form-group">
            <label class="form-label">Storage Type</label>
            <CustomSelect
              v-model="form.specsData.storage_type"
              :options="[
                { value: 'SSD', label: 'SSD' },
                { value: 'HDD', label: 'HDD' },
                { value: 'NVMe', label: 'NVMe' },
              ]"
              placeholder="Select Type"
            />
          </div>
          <div class="form-group">
            <label class="form-label">OS</label>
            <input
              v-model="form.specsData.os"
              type="text"
              class="form-input"
              placeholder="e.g. Windows 11"
            />
          </div>
          <div class="form-group">
            <label class="form-label">VGA</label>
            <input
              v-model="form.specsData.vga"
              type="text"
              class="form-input"
              placeholder="e.g. Intel Iris Xe"
            />
          </div>
          <div class="form-group" style="grid-column: span 2">
            <label class="form-label">Office Package</label>
            <input
              v-model="form.specsData.office"
              type="text"
              class="form-input"
              placeholder="e.g. Office Home & Student 2021"
            />
          </div>
        </div>
      </div>
    </FormModal>
    <ConfirmDialog
      :open="showConfirm"
      title="Delete Consumable / Sparepart"
      :message="`Are you sure you want to delete '${deletingItem?.name}'?`"
      @close="showConfirm = false"
      @confirm="handleDelete"
    />
    <HardDeleteDialog :open="hardDelete.show" title="Hapus Permanen Consumable / Sparepart" :item-label="hardDelete.expected"
      :expected="hardDelete.expected" :confirm-valid="hardDelete.confirmed" @close="hardDelete.close"
      @confirm="hardDelete.confirm" @update:input="hardDelete.input = $event" />
  </div>
</template>
