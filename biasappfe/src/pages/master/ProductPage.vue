<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { resources } from '@/services/resource.service'
import { type TableColumn, type Product, type ProductCategory, type UOM } from '@/types'
import { useToast } from '@/composables/useToast'

const toast = useToast()

const columns: TableColumn[] = [
  { key: 'name', label: 'Nama Produk' },
  { key: 'sku', label: 'SKU' },
  { key: 'price', label: 'Harga' },
  { key: 'stock', label: 'Stok' },
  { key: 'category.name', label: 'Kategori' },
  { key: 'uom.name', label: 'UOM' },
]

const data = ref<Product[]>([])
const categories = ref<ProductCategory[]>([])
const uoms = ref<UOM[]>([])

async function fetchData() {
  try {
    const res = await resources.products.list()
    data.value = res.data as any
  } catch (error) {
    console.error('Failed to fetch products:', error)
    toast.error('Gagal mengambil data: ' + ((error as any).message || 'Error'))
  }
}

async function fetchCategories() {
  try {
    const res = await resources.productCategories.list()
    categories.value = res.data as any
  } catch (error) {
    console.error('Failed to fetch categories:', error)
    toast.error('Gagal mengambil data: ' + ((error as any).message || 'Error'))
  }
}

async function fetchUoms() {
  try {
    const res = await resources.uoms.list()
    uoms.value = res.data as any
  } catch (error) {
    console.error('Failed to fetch UOMs:', error)
    toast.error('Gagal mengambil data UOM: ' + ((error as any).message || 'Error'))
  }
}

onMounted(() => {
  fetchData()
  fetchCategories()
  fetchUoms()
})

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Product | null>(null)
const deletingItem = ref<Product | null>(null)
const form = reactive({
  name: '',
  sku: '',
  category_id: "",
  brand_id: null as any,
  uom_id: '' as string | null,
  price: 0,
  stock: 0,
  is_computer: false,
  specsData: { cpu: '', ram: '', storage: '', storage_type: '', os: '', vga: '', office: '' }
})

function generateSKU(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = 'PRD-'
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

function openAdd() {
  editingItem.value = null
  Object.assign(form, { name: '', sku: generateSKU(), category_id: '', brand_id: null, uom_id: '', price: 0, stock: 0, is_computer: false, specsData: { cpu: '', ram: '', storage: '', storage_type: '', os: '', vga: '', office: '' } })
  showModal.value = true
}

function openEdit(item: Product) {
  editingItem.value = item
  Object.assign(form, {
    name: item.name,
    sku: item.sku,
    category_id: item.category_id,
    brand_id: item.brand_id,
    uom_id: (item as any).uom_id ?? '',
    price: item.price,
    stock: item.stock,
    is_computer: !!(item as any).is_computer,
    specsData: (item as any).specs ? (typeof (item as any).specs === 'string' ? JSON.parse((item as any).specs || '{}') : (item as any).specs) : { cpu: '', ram: '', storage: '', storage_type: '', os: '', vga: '', office: '' }
  })
  showModal.value = true
}

async function handleSubmit() {
  if (!form.name.trim()) {
    toast.warning('Nama produk wajib diisi!')
    return
  }
  if (!form.category_id) {
    toast.warning(categories.value.length === 0
      ? 'Belum ada kategori produk, buat dulu di Master > Product Categories'
      : 'Kategori wajib dipilih!')
    return
  }
  try {
    const payload = {
      ...form,
      specs: form.is_computer ? JSON.stringify(form.specsData) : ''
    }
    if (editingItem.value) {
      await resources.products.update(String(editingItem.value.id), payload)
    } else {
      await resources.products.create(payload)
    }
    await fetchData()
    showModal.value = false
    toast.success(editingItem.value ? 'Produk berhasil diperbarui!' : 'Produk berhasil disimpan!')
  } catch (error) {
    console.error('Failed to save product:', error)
    toast.error('Gagal menyimpan produk: ' + ((error as any).message || 'Error'))
  }
}

function openDelete(item: Product) { deletingItem.value = item; showConfirm.value = true }

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.products.remove(String(deletingItem.value.id))
      await fetchData()
      toast.success('Produk berhasil dihapus!')
    } catch (error) {
      console.error('Failed to delete product:', error)
      toast.error('Gagal menghapus produk')
    }
  }
  showConfirm.value = false
}

function formatRupiah(val: number): string {
  return 'Rp ' + val.toLocaleString('id-ID')
}

</script>

<template>
  <div>
    <PageHeader title="Products" button-label="Add Product" permission="product:create" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Cari produk..." permission="product" @edit="openEdit"
      @delete="openDelete">
      <template #cell-price="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-category.name="{ row }">{{ row.category?.name ?? '-' }}</template>
      <template #cell-uom.name="{ row }">{{ row.uom?.name ?? '-' }}</template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Product' : 'Add Product'" @close="showModal = false"
      @submit="handleSubmit">
      <div class="form-group">
        <label for="prod-name" class="form-label">Nama Produk</label>
        <input id="prod-name" v-model="form.name" type="text" class="form-input" placeholder="Nama produk">
      </div>
      <div class="form-group">
        <label for="prod-sku" class="form-label">SKU</label>
        <input id="prod-sku" v-model="form.sku" type="text" class="form-input" disabled
          placeholder="Auto-generated SKU">
      </div>
      <div class="form-group">
        <label for="category_id" class="form-label">Kategori</label>
        <select name="category_id" id="category_id" v-model="form.category_id" class="form-input">
          <option value="">-- Pilih Kategori --</option>
          <option v-for="category in categories" :key="category.id" :value="category.id">
            {{ category.name }}
          </option>
        </select>
        <p v-if="categories.length === 0"
          style="margin-top: 6px; font-size: 12px; color: var(--color-text-muted, #64748b);">Belum ada kategori. Buat
          dulu
          di menu Master &gt; Product Categories.</p>
      </div>
      <div class="form-group">
        <label for="uom_id" class="form-label">UOM (Satuan)</label>
        <select name="uom_id" id="uom_id" v-model="form.uom_id" class="form-input">
          <option value="">-- Pilih UOM --</option>
          <option v-for="uom in uoms" :key="uom.id" :value="uom.id">
            {{ uom.name }}
          </option>
        </select>
        <p v-if="uoms.length === 0"
          style="margin-top: 6px; font-size: 12px; color: var(--color-text-muted, #64748b);">Belum ada UOM. Buat
          dulu
          di menu Master &gt; UOMs.</p>
      </div>
      <div class="form-group">
        <label for="prod-price" class="form-label">Harga (Rp)</label>
        <input id="prod-price" v-model.number="form.price" type="number" class="form-input" placeholder="0" min="0">
      </div>
      <div class="form-group">
        <label for="prod-stock" class="form-label">Stok</label>
        <input id="prod-stock" v-model.number="form.stock" type="number" class="form-input" placeholder="0" min="0">
      </div>
      <div class="form-group" style="margin-top: 1rem;">
        <label class="form-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
          <input type="checkbox" v-model="form.is_computer" style="width: 1rem; height: 1rem;" />
          Adalah Komputer / PC / Laptop
        </label>
      </div>
      <div v-if="form.is_computer"
        style="margin-top: 1rem; border-top: 1px solid var(--color-border-light); padding-top: 1rem;">
        <h4 style="margin-bottom: 1rem; font-weight: 600;">Spesifikasi Komputer / Desktop</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label class="form-label">CPU</label>
            <input v-model="form.specsData.cpu" type="text" class="form-input" placeholder="e.g. Intel Core i5">
          </div>
          <div class="form-group">
            <label class="form-label">RAM</label>
            <input v-model="form.specsData.ram" type="text" class="form-input" placeholder="e.g. 8GB DDR4">
          </div>
          <div class="form-group">
            <label class="form-label">Storage</label>
            <input v-model="form.specsData.storage" type="text" class="form-input" placeholder="e.g. 512GB">
          </div>
          <div class="form-group">
            <label class="form-label">Storage Type</label>
            <CustomSelect v-model="form.specsData.storage_type"
              :options="[{ value: 'SSD', label: 'SSD' }, { value: 'HDD', label: 'HDD' }, { value: 'NVMe', label: 'NVMe' }]"
              placeholder="Pilih Tipe" />
          </div>
          <div class="form-group">
            <label class="form-label">OS</label>
            <input v-model="form.specsData.os" type="text" class="form-input" placeholder="e.g. Windows 11">
          </div>
          <div class="form-group">
            <label class="form-label">VGA</label>
            <input v-model="form.specsData.vga" type="text" class="form-input" placeholder="e.g. Intel Iris Xe">
          </div>
          <div class="form-group" style="grid-column: span 2;">
            <label class="form-label">Paket Office</label>
            <input v-model="form.specsData.office" type="text" class="form-input"
              placeholder="e.g. Office Home & Student 2021">
          </div>
        </div>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus Produk"
      :message="`Yakin ingin menghapus produk '${deletingItem?.name}'?`" @close="showConfirm = false"
      @confirm="handleDelete" />
  </div>
</template>
