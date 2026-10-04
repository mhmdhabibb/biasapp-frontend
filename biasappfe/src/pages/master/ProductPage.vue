<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, watch, computed } from "vue";
import PageHeader from "@/components/ui/PageHeader.vue";
import DataTable from "@/components/ui/DataTable.vue";
import ExcelImportButtons from "@/components/ui/ExcelImportButtons.vue";
import FormModal from "@/components/ui/FormModal.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import CustomSelect from "@/components/ui/CustomSelect.vue";
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
  { key: "name", label: "Product Name" },
  { key: "sku", label: "SKU" },
  { key: "price", label: "Price" },
  { key: "stock", label: "Stock" },
  { key: "category.name", label: "Category" },
  { key: "uom.name", label: "UOM" },
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

function getCategoryPrefix(categoryId: string): string {
  const category = categories.value.find(
    (item) => String(item.id) === categoryId,
  );
  const words = ((category as any)?.name || (category as any)?.slug || "")
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
    const suffix = form.sku.split("-").slice(1).join("-");
    form.sku = `${getCategoryPrefix(categoryId)}-${suffix || generateSKU().slice(4)}`;
  },
);

function openAdd() {
  editingItem.value = null;
  Object.assign(form, {
    name: "",
    sku: generateSKU(),
    category_id: "",
    brand_id: null,
    uom_id: "",
    price: 0,
    stock: 0,
    is_computer: false,
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
    sku: item.sku,
    category_id: item.category_id,
    brand_id: item.brand_id,
    uom_id: (item as any).uom_id ?? "",
    price: item.price,
    stock: item.stock,
    is_computer: !!(item as any).is_computer,
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
    const payload = {
      ...form,
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
</script>

<template>
  <div>
    <PageHeader
      title="Products"
      button-label="Add Product"
      permission="product:create"
      @add="openAdd"
    />
    <DataTable
      :columns="columns"
      :data="data"
      search-placeholder="Search products..."
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
    </DataTable>
    <FormModal
      :open="showModal"
      :title="editingItem ? 'Edit Product' : 'Add Product'"
      @close="showModal = false"
      @submit="handleSubmit"
    >
      <div class="form-group">
        <label for="prod-name" class="form-label">Product Name</label>
        <input
          id="prod-name"
          v-model="form.name"
          type="text"
          class="form-input"
          placeholder="Product name"
        />
      </div>
      <div class="form-group">
        <label for="prod-sku" class="form-label">SKU</label>
        <input
          id="prod-sku"
          v-model="form.sku"
          type="text"
          class="form-input"
          disabled
          placeholder="Auto-generated SKU"
        />
      </div>
      <div class="form-group">
        <label for="category_id" class="form-label">Category</label>
        <CustomSelect
          id="category_id"
          v-model="form.category_id"
          :options="categoryOptions"
          placeholder="-- Select Category --"
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
      title="Delete Product"
      :message="`Are you sure you want to delete product '${deletingItem?.name}'?`"
      @close="showConfirm = false"
      @confirm="handleDelete"
    />
    <HardDeleteDialog :open="hardDelete.show" title="Hapus Permanen Product" :item-label="hardDelete.expected"
      :expected="hardDelete.expected" :confirm-valid="hardDelete.confirmed" @close="hardDelete.close"
      @confirm="hardDelete.confirm" @update:input="hardDelete.input = $event" />
  </div>
</template>
