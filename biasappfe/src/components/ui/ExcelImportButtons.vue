<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import FormModal from '@/components/ui/FormModal.vue'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { api, downloadFile, uploadFile, ApiError } from '@/services/api'

const props = defineProps<{
  /** master_key sesuai pengaturan superadmin: brand | uom | product_category | customer | product | unit */
  masterKey: string
}>()
const emit = defineEmits<{
  (e: 'imported'): void
}>()

const toast = useToast()
const { can, canAny } = usePermission()

// Izin global (import_excel) maupun per-modul (<masterKey>:import_excel)
// sama-sama valid — backend menerima keduanya. Samakan dengan guard
// templateReaderGuard agar tombol tidak hilang padahal server mengizinkan,
// dan sebaliknya tidak muncul padahal server akan 403.
function canUse(action: 'import_excel' | 'download_template'): boolean {
  const master = String(props.masterKey || '').toLowerCase().trim()
  if (!master) return can(action)
  return canAny(action, `${master}:${action}`)
}

const template = ref<any>(null)
// `checked` = metadata sudah dipastikan (ada / tidak ada / tak ada akses).
// Tombol dirender instan berbasis permission; fetch hanya menentukan apakah
// template tersedia, bukan apakah tombol boleh tampil.
const isChecking = ref(false)
const checked = ref(false)
let requestSeq = 0

// Izin murni (tidak menunggu API) -> tombol langsung tampil saat halaman dibuka.
const hasDownloadPerm = computed(() => canUse('download_template'))
const hasImportPerm = computed(() => canUse('import_excel'))
// Tombol aktif hanya bila template benar-benar ada; selama pengecekan
// tampil disabled agar tidak "pop-in" telat.
const canDownload = computed(() => hasDownloadPerm.value && !!template.value)
const canImport = computed(() => hasImportPerm.value && !!template.value)

async function fetchTemplate() {
  const seq = ++requestSeq
  template.value = null
  checked.value = false
  if (!props.masterKey) return
  // Tanpa izin, jangan tembak API sama sekali (hemat 1 round-trip 403).
  if (!hasDownloadPerm.value && !hasImportPerm.value) return
  isChecking.value = true
  try {
    const res: any = await api.get(`/excel-templates/by-master/${props.masterKey}`, false)
    if (seq !== requestSeq) return
    template.value = res?.data || null
  } catch (err) {
    if (seq !== requestSeq) return
    // 404 = belum ada template -> tombol disembunyikan. 403 = tak ada akses.
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
      // Desinkron terdeteksi: frontend yakin punya izin tapi server menolak.
      // Umumnya karena JWT usang (habis pindah role) -> minta login ulang.
      if (
        err.status === 403 &&
        (canUse('import_excel') || canUse('download_template'))
      ) {
        toast.warning('Izin tidak sinkron dengan server. Logout lalu login ulang!')
      }
      template.value = null
      return
    }
    toast.error('Gagal memuat info template!')
    template.value = null
  } finally {
    if (seq === requestSeq) {
      isChecking.value = false
      checked.value = true
    }
  }
}

const showImport = ref(false)
const showResult = ref(false)
const isWorking = ref(false)
const pickedFile = ref<File | null>(null)
const result = ref<{
  imported: number
  skipped: number
  errors: { row: number; message: string }[]
  generated?: { row: number; sku: string }[]
} | null>(null)

watch(() => props.masterKey, fetchTemplate, { immediate: true })

async function handleDownload() {
  if (!template.value) return
  try {
    await downloadFile(
      `/excel-templates/by-master/${props.masterKey}/download`,
      template.value.file_name || `template-${props.masterKey}.xlsx`,
    )
  } catch (err: any) {
    toast.error(err?.message || 'Gagal mengunduh template!')
  }
}

function openImport() {
  pickedFile.value = null
  result.value = null
  showImport.value = true
}

function onFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  pickedFile.value = (input.files && input.files[0]) || null
}

async function handleUpload() {
  if (!pickedFile.value) {
    toast.warning('Pilih file Excel (.xlsx) dulu!')
    return
  }
  if (!/\.xlsx?$/i.test(pickedFile.value.name)) {
    toast.warning('File harus berekstensi .xlsx!')
    return
  }
  isWorking.value = true
  try {
    const fd = new FormData()
    fd.append('file', pickedFile.value)
    const res: any = await uploadFile(`/excel-import/${props.masterKey}`, fd, true)
    result.value = res?.data || { imported: 0, skipped: 0, errors: [], generated: [] }
    if (!Array.isArray(result.value?.generated)) result.value!.generated = []
    showImport.value = false
    showResult.value = true
    if ((result.value?.imported || 0) > 0) emit('imported')
  } catch (err: any) {
    toast.error(err?.message || 'Gagal import file!')
  } finally {
    isWorking.value = false
  }
}
</script>

<template>
  <template v-if="hasDownloadPerm || hasImportPerm">
    <!-- Selama pengecekan tampil disabled instan; bila template tak ada (404/403)
         tombol disembunyikan karena tak ada yang bisa diunduh/diimpor. -->
    <template v-if="!checked || template">
    <button
      v-if="hasDownloadPerm"
      type="button"
      class="toolbar-btn"
      :class="{ 'is-loading': isChecking }"
      :disabled="isChecking || !template"
      title="Download template Excel"
      @click="handleDownload"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      {{ isChecking ? 'Memuat...' : 'Template' }}
    </button>
    <button
      v-if="hasImportPerm"
      type="button"
      class="toolbar-btn"
      :class="{ 'is-loading': isChecking }"
      :disabled="isChecking || !template"
      title="Import dari Excel"
      @click="openImport"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      {{ isChecking ? 'Memuat...' : 'Import' }}
    </button>

    <FormModal :open="showImport" title="Import dari Excel" @close="showImport = false">
      <div class="form-group">
        <label class="form-label">File Excel (.xlsx)</label>
        <input type="file" accept=".xlsx,.xls" class="form-input" @change="onFileChange" />
        <p style="margin-top: 6px; font-size: 12px; color: var(--color-text-muted, #64748b);">
          Header harus sesuai template ({{ template?.file_name || '-' }}).
          Baris duplikat dilewati, baris bermasalah dilaporkan.
        </p>
      </div>
      <template #footer>
        <button type="button" class="btn btn-outline" :disabled="isWorking" @click="showImport = false">
          Cancel
        </button>
        <button type="button" class="btn btn-accent" :disabled="isWorking" @click="handleUpload">
          {{ isWorking ? 'Mengimpor...' : 'Upload' }}
        </button>
      </template>
    </FormModal>

    <FormModal :open="showResult" title="Hasil Import" @close="showResult = false">
      <template v-if="result">
        <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
          <span class="badge badge-success">Masuk: {{ result.imported }}</span>
          <span class="badge badge-warning">Dilewati: {{ result.skipped }}</span>
          <span v-if="result.errors.length" class="badge badge-danger">Gagal: {{ result.errors.length }}</span>
          <span v-if="(result.generated || []).length" class="badge badge-info">
            SKU otomatis: {{ (result.generated || []).length }}
          </span>
        </div>
        <div
          v-if="(result.generated || []).length"
          style="margin-bottom: 12px; border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden;"
        >
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background: var(--color-surface-raised);">
                <th style="padding: 8px 10px; text-align: left; width: 64px;">Baris</th>
                <th style="padding: 8px 10px; text-align: left;">SKU dibuat otomatis</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(g, idx) in (result.generated || [])" :key="idx" style="border-top: 1px solid var(--color-border-light);">
                <td style="padding: 8px 10px;">{{ g.row }}</td>
                <td style="padding: 8px 10px; font-weight: 600;">{{ g.sku }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          v-if="result.errors.length"
          style="max-height: 260px; overflow-y: auto; border: 1px solid var(--color-border); border-radius: 8px;"
        >
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background: var(--color-surface-raised);">
                <th style="padding: 8px 10px; text-align: left; width: 64px;">Baris</th>
                <th style="padding: 8px 10px; text-align: left;">Keterangan</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(e, idx) in result.errors" :key="idx" style="border-top: 1px solid var(--color-border-light);">
                <td style="padding: 8px 10px;">{{ e.row }}</td>
                <td style="padding: 8px 10px;">{{ e.message }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else style="color: var(--color-text-muted); font-size: 13px;">
          Semua baris valid berhasil diproses.
        </p>
      </template>
      <template #footer>
        <button type="button" class="btn btn-outline" @click="showResult = false">Close</button>
      </template>
    </FormModal>
    </template>
  </template>
</template>

<style scoped>
.toolbar-btn {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--color-border, #cbd5e1);
  border-radius: var(--radius-base, 8px);
  background: var(--color-surface, #fff);
  color: var(--color-text-secondary, #475569);
  font-size: var(--font-size-sm, 13px);
  font-weight: 600;
  line-height: 1.4;
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--transition-fast, 0.15s);
}

.toolbar-btn svg {
  flex-shrink: 0;
}

.toolbar-btn:hover:not(:disabled) {
  background: var(--color-surface-sunken, #f1f5f9);
}

.toolbar-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.toolbar-btn.is-loading {
  cursor: wait;
}
</style>
