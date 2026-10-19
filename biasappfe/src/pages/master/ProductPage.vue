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
import { useHardDelete } from '@/composables/useHardDelete'

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
    data.value = res.data as any;
  } catch (error) {
    console.error("Failed to fetch products:", error);
    toast.error("Failed to fetch data: " + ((error as any).message || "Error"));
  }
}

async function fetchCategories() {
  try {
    const res = await resources.productCategories.list();
    categories.value = res.data as any;
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    toast.error("Failed to fetch data: " + ((error as any).message || "Error"));
  }
}

async function fetchUoms() {
  try {
    const res = await resources.uoms.list();
    uoms.value = res.data as any;
  } catch (error) {
    console.error("Failed to fetch UOMs:", error);
    toast.error(
      "Failed to fetch UOM data: " + ((error as any).message || "Error"),
    );
  }
}

onMounted(() => {
  fetchData();
  fetchCategories();
  fetchUoms();
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

function exportStockExcel() {
  if (!data.value.length) {
    toast.error("No stock data to export");
    return;
  }
  const rows: any[] = data.value.map((p, idx) => ({
    "No": idx + 1,
    "Consumable / Sparepart Name": p.name,
    "SN": p.sku || "-",
    "Item / Category": (p.category as any)?.name || "-",
    "UOM": (p.uom as any)?.name || "-",
    "Stock": Number(p.stock) || 0,
    "Price (Rp)": Number(p.price) || 0,
    "Total Value (Rp)": (Number(p.stock) || 0) * (Number(p.price) || 0),
  }));

  rows.push({
    "No": "",
    "Consumable / Sparepart Name": "GRAND TOTAL",
    "SN": "",
    "Item / Category": "",
    "UOM": "",
    "Stock": totalStockQty.value,
    "Price (Rp)": "",
    "Total Value (Rp)": totalStockValue.value,
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Stock Report");
  XLSX.writeFile(wb, `Stock_Report_${Date.now()}.xlsx`);
  toast.success("Stock report exported to Excel!");
}

function exportStockPdf() {
  if (!data.value.length) {
    toast.error("No stock data to export");
    return;
  }
  let html = `<div style="font-family: Arial, sans-serif; padding: 10px;">
    <h2 style="margin-bottom: 4px;">Stock Valuation Report (Consumable / Sparepart)</h2>
    <p style="color: #666; font-size: 12px; margin-top: 0;">Date: ${new Date().toLocaleDateString('id-ID')} | Total Stock: ${totalStockQty.value} | Grand Total Nilai Stock: Rp ${totalStockValue.value.toLocaleString('id-ID')}</p>
    <table border="1" cellpadding="6" cellspacing="0" style="width:100%; border-collapse: collapse; font-size: 11px; margin-top: 10px;">
      <thead>
        <tr style="background-color: #f1f5f9;">
          <th>No</th>
          <th>Name</th>
          <th>SN</th>
          <th>Item</th>
          <th>Stock</th>
          <th>Price</th>
          <th>Total Value</th>
        </tr>
      </thead>
      <tbody>`;
  data.value.forEach((p, idx) => {
    const totalVal = (Number(p.stock) || 0) * (Number(p.price) || 0);
    html += `<tr>
      <td style="text-align: center;">${idx + 1}</td>
      <td>${p.name}</td>
      <td>${p.sku || '-'}</td>
      <td>${(p.category as any)?.name || '-'}</td>
      <td style="text-align: center;">${p.stock || 0}</td>
      <td style="text-align: right;">Rp ${(Number(p.price) || 0).toLocaleString('id-ID')}</td>
      <td style="text-align: right; font-weight: bold;">Rp ${totalVal.toLocaleString('id-ID')}</td>
    </tr>`;
  });
  html += `<tr style="background-color: #e2e8f0; font-weight: bold;">
    <td colspan="4" style="text-align: center;">GRAND TOTAL</td>
    <td style="text-align: center;">${totalStockQty.value}</td>
    <td></td>
    <td style="text-align: right;">Rp ${totalStockValue.value.toLocaleString('id-ID')}</td>
  </tr>`;
  html += `</tbody></table></div>`;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const opt: any = {
    margin: 0.5,
    filename: `Stock_Report_${Date.now()}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
  };
  html2pdf().set(opt).from(wrapper).save();
  toast.success("Stock report exported to PDF!");
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
