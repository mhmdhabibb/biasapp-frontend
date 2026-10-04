<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { useResourcesStore } from '@/stores/resources.store'
import { downloadFile, uploadFile } from '@/services/api'
import type { TableColumn } from '@/types'
import { computed, reactive, ref } from 'vue'

const toast = useToast()
const { can } = usePermission()
const resources = useResourcesStore()

const MASTER_OPTIONS = [
  { key: 'brand', label: 'Brands' },
  { key: 'uom', label: 'UOMs' },
  { key: 'product_category', label: 'Product Categories' },
  { key: 'customer', label: 'Customers' },
  { key: 'product', label: 'Products' },
  { key: 'unit', label: 'Units' },
  { key: 'supplier', label: 'Suppliers' },
  { key: 'technician', label: 'Technicians' },
  { key: 'unit_type', label: 'Unit Types' },
  { key: 'paper_size', label: 'Paper Sizes' },
  { key: 'paper_type', label: 'Paper Types' },
]

function masterLabel(key: any): string {
  return MASTER_OPTIONS.find((m) => m.key === String(key))?.label || String(key || '-')
}

// Master yang sudah punya template dikunci (1 master = 1 template).
function hasTemplate(key: any): boolean {
  return templates.value.some((t: any) => String(t.master_key) === String(key))
}

const columns: TableColumn[] = [
  { key: 'master_key', label: 'Master Data' },
  { key: 'file_name', label: 'Template File' },
  { key: 'file_size', label: 'Size' },
  { key: 'columns', label: 'Columns' },
  { key: 'updated_at', label: 'Updated' },
]

const templates = ref<any[]>([])
const isLoading = ref(false)

async function fetchAll() {
  isLoading.value = true
  try {
    const items: any = await resources.fetchAll('excelTemplates')
    templates.value = Array.isArray(items) ? items : []
  } finally {
    isLoading.value = false
  }
}
fetchAll()

const showModal = ref(false)
const showConfirm = ref(false)
const showDetail = ref(false)
const detailItem = ref<any>(null)
const deletingItem = ref<any>(null)
const isSaving = ref(false)

function openDetail(item: any) {
  detailItem.value = item
  showDetail.value = true
}
const form = reactive({
  master_key: '',
  file: null as File | null,
})

function formatSize(bytes: any): string {
  const n = Number(bytes || 0)
  if (n <= 0) return '-'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function formatDate(value: any): string {
  if (!value) return '-'
  const d = new Date(value)
  if (isNaN(d.getTime())) return String(value).slice(0, 10)
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function openAdd() {
  form.master_key = ''
  form.file = null
  showModal.value = true
}

function onFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  form.file = (input.files && input.files[0]) || null
}

async function handleSubmit() {
  if (!form.master_key) {
    toast.warning('Pilih master data dulu!')
    return
  }
  if (hasTemplate(form.master_key)) {
    toast.warning(`${masterLabel(form.master_key)} sudah punya template! Hapus dulu bila mau ganti.`)
    return
  }
  if (!form.file) {
    toast.warning('Pilih file Excel (.xlsx) dulu!')
    return
  }
  if (!/\.xlsx?$/i.test(form.file.name)) {
    toast.warning('File harus berekstensi .xlsx!')
    return
  }
  isSaving.value = true
  try {
    const fd = new FormData()
    fd.append('master_key', form.master_key)
    fd.append('file', form.file)
    await uploadFile('/excel-templates/', fd, true)
    await fetchAll()
    showModal.value = false
    toast.success(`Template ${masterLabel(form.master_key)} disimpan!`)
  } catch (err: any) {
    toast.error(err?.message || 'Gagal menyimpan template!')
  } finally {
    isSaving.value = false
  }
}

async function handleDownload(item: any) {
  try {
    await downloadFile(
      `/excel-templates/by-master/${item.master_key}/download`,
      item.file_name || `template-${item.master_key}.xlsx`,
    )
  } catch (err: any) {
    toast.error(err?.message || 'Gagal mengunduh template!')
  }
}

function openDelete(item: any) {
  deletingItem.value = item
  showConfirm.value = true
}

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.remove('excelTemplates', String(deletingItem.value.id))
      await fetchAll()
      toast.success('Template dihapus!')
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menghapus template!')
    }
  }
  showConfirm.value = false
}

const canManage = computed(() => can('excel_template:create'))
</script>

<template>
  <div>
    <PageHeader
      title="Excel Templates"
      button-label="Upload Template"
      permission="excel_template:create"
      @add="openAdd"
    />
    <DataTable
      :columns="columns"
      :data="templates"
      search-placeholder="Search templates..."
      permission="excel_template"
    >
      <template #cell-master_key="{ value }">{{ masterLabel(value) }}</template>
      <template #cell-file_size="{ value }">{{ formatSize(value) }}</template>
      <template #cell-columns="{ value, row }">
        <span style="white-space: nowrap;">{{ Array.isArray(value) ? value.length : 0 }} kolom</span>
        <button
          type="button"
          class="action-btn action-btn--edit"
          title="Detail kolom"
          style="width: 28px; height: 28px; margin-left: 6px; vertical-align: middle;"
          @click="openDetail(row)"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </template>
      <template #cell-updated_at="{ value }">{{ formatDate(value) }}</template>
      <template #actions="{ row }">
        <div style="display: flex; align-items: center; gap: 6px;">
          <button
            type="button"
            class="action-btn action-btn--edit"
            title="Download template"
            style="width: 36px; height: 36px;"
            @click="handleDownload(row)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <button
            v-if="canManage"
            type="button"
            class="action-btn action-btn--delete"
            title="Delete template"
            style="width: 36px; height: 36px;"
            @click="openDelete(row)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </div>
      </template>
    </DataTable>

    <FormModal
      :open="showModal"
      title="Upload Template Excel"
      @close="showModal = false"
      @submit="handleSubmit"
    >
      <div class="form-group">
        <label class="form-label">Master Data</label>
        <select v-model="form.master_key" class="form-input">
          <option value="">-- Pilih Master Data --</option>
          <option
            v-for="m in MASTER_OPTIONS"
            :key="m.key"
            :value="m.key"
            :disabled="hasTemplate(m.key)"
          >
            {{ m.label }}{{ hasTemplate(m.key) ? ' (sudah ada template)' : '' }}
          </option>
        </select>
        <p
          v-if="form.master_key && hasTemplate(form.master_key)"
          style="margin-top: 6px; font-size: 12px; color: var(--color-danger, #dc2626);"
        >
          Master ini sudah punya template. Hapus template lama dulu bila mau mengganti.
        </p>
        <p style="margin-top: 6px; font-size: 12px; color: var(--color-text-muted, #64748b);">
          Baris pertama file harus berisi header kolom field Inggris
          (mis. produk: sku, name, category, uom, price, stock).
          Referensi cukup tulis <b>nama</b> (mis. nama kategori).
          ID otomatis terisi. Specs produk/unit ditulis terpisah:
          <b>cpu, ram, storage, storage_type, os, vga, office</b>.
        </p>
      </div>
      <div class="form-group">
        <label class="form-label">File Excel (.xlsx)</label>
        <input type="file" accept=".xlsx,.xls" class="form-input" @change="onFileChange" />
      </div>
      <template #footer>
        <button type="button" class="btn btn-outline" :disabled="isSaving" @click="showModal = false">
          Cancel
        </button>
        <button type="button" class="btn btn-accent" :disabled="isSaving" @click="handleSubmit">
          {{ isSaving ? 'Menyimpan...' : 'Save' }}
        </button>
      </template>
    </FormModal>

    <FormModal
      :open="showDetail"
      :title="detailItem ? `Template ${masterLabel(detailItem.master_key)}` : 'Detail Template'"
      @close="showDetail = false"
    >
      <template v-if="detailItem">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div class="form-group">
            <label class="form-label">File</label>
            <div>{{ detailItem.file_name || '-' }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Ukuran / Update</label>
            <div>{{ formatSize(detailItem.file_size) }} · {{ formatDate(detailItem.updated_at) }}</div>
          </div>
        </div>
        <div class="form-section-title" style="margin-bottom: 8px;">
          Kolom ({{ Array.isArray(detailItem.columns) ? detailItem.columns.length : 0 }})
        </div>
        <ol style="margin: 0; padding-left: 22px; font-size: 13px; display: grid; gap: 4px;">
          <li v-for="(c, idx) in (detailItem.columns || [])" :key="idx">
            <code>{{ c }}</code>
          </li>
        </ol>
        <p v-if="!(detailItem.columns || []).length" style="color: var(--color-text-muted); font-size: 13px;">
          Template ini tidak menyimpan daftar kolom.
        </p>
      </template>
      <template #footer>
        <button type="button" class="btn btn-outline" @click="showDetail = false">Close</button>
      </template>
    </FormModal>

    <ConfirmDialog
      :open="showConfirm"
      title="Delete Template"
      :message="`Hapus template '${deletingItem ? masterLabel(deletingItem.master_key) : ''}'? Tombol download/import di halaman master ikut hilang.`"
      @close="showConfirm = false"
      @confirm="handleDelete"
    />
  </div>
</template>
