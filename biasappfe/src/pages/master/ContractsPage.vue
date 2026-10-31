<script setup lang="ts">
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import type { Contract, TableColumn } from '@/types'
import { computed, reactive, ref } from 'vue'
import { useContractsStore } from '@/stores/contracts.store'
import { useToast } from '@/composables/useToast'
import { useHardDelete } from '@/composables/useHardDelete'
import { usePermission } from '@/composables/usePermission'
import { invalidateCache } from '@/utils/requestCache'
import { useMasterStore } from '@/composables/useMasterStore'

const toast = useToast()
const { can, isAdmin } = usePermission()

const columns: TableColumn[] = [
  { key: 'contract_no', label: 'Contract No' },
  { key: 'customer_name', label: 'Customer' },
  { key: 'period', label: 'Period' },
  { key: 'status', label: 'Status' },
  { key: 'terms_notes', label: 'Free Quota Terms' },
]

const {
  contracts: rawData,
  fetchAll,
  create,
  remove,
  hardRemove,
  renew,
  error,
  isLoading,
  totalItems,
  totalPages,
  currentPage,
  pageSize,
  searchQuery,
  setSearch,
  setPage,
  setPageSize,
} = useContractsStore()
fetchAll()

const data = computed(() => {
  return (rawData.value || []).map((c: any) => ({
    ...c,
    customer_name: c.customer?.company_name || c.customer?.name || '-',
    period: c.start_date && c.end_date
      ? `${new Date(c.start_date).toLocaleDateString('id-ID')} - ${new Date(c.end_date).toLocaleDateString('id-ID')}`
      : '-',
  }))
})

const showRenewModal = ref(false)
const showDeleteModal = ref(false)
const deletingItem = ref<Contract | null>(null)
const deleteReason = ref('')
const confirmAgree = ref(false)
const isDeleting = ref(false)

const renewingItem = ref<Contract | null>(null)
const renewForm = reactive({
  end_date: '',
})

function openRenew(item: Contract) {
  renewingItem.value = item
  renewForm.end_date = item.end_date ? String(item.end_date).slice(0, 10) : ''
  showRenewModal.value = true
}

async function handleRenew() {
  if (!renewingItem.value || !renewForm.end_date) return
  await renew(String(renewingItem.value.id), { end_date: renewForm.end_date })
  await fetchAll()
  showRenewModal.value = false
  toast.success('Contract renewed successfully!')
}

const masterStore = useMasterStore()

const hardDelete = useHardDelete(
  hardRemove,
  async () => {
    invalidateCache('units')
    invalidateCache('contracts')
    invalidateCache('rents')
    await fetchAll()
    await masterStore.refreshOnly(['units', 'contracts', 'products'], true)
  }
)

function openDelete(item: Contract) {
  deletingItem.value = item
  deleteReason.value = ''
  confirmAgree.value = false
  showDeleteModal.value = true
}

async function handleDelete() {
  if (!deletingItem.value || !deleteReason.value.trim() || !confirmAgree.value) return
  isDeleting.value = true
  try {
    await remove(String(deletingItem.value.id), deleteReason.value.trim())
    showDeleteModal.value = false
    invalidateCache('units')
    invalidateCache('contracts')
    invalidateCache('rents')
    await masterStore.refreshOnly(['units', 'contracts', 'products'], true)
    toast.success('Kontrak berhasil dihapus dan unit terkait telah kembali menjadi available.')
  } catch (err: any) {
    toast.error('Gagal menghapus kontrak: ' + (err?.message || 'Error'))
  } finally {
    isDeleting.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="Contracts"/>
    <div v-if="error" class="page-error" role="alert">{{ error }}</div>
    <DataTable
      :columns="columns"
      :data="data"
      :search-placeholder="searchQuery"
      permission="contract"
      :show-hard-delete="hardDelete.isSuperadmin"
      :total-pages="totalPages"
      :current-page="currentPage"
      @hard-delete="hardDelete.open"
      @search="setSearch"
      @page-change="setPage"
    >
      <template #actions="{ row }">
        <button class="action-btn" title="Perpanjang" @click="openRenew(row)">Perpanjang</button>
        <button
          v-if="can('contract:delete')"
          class="action-btn action-btn--delete"
          title="Delete Contract"
          @click="openDelete(row)"
        >
          Delete
        </button>
        <button v-if="hardDelete.isSuperadmin" class="action-btn action-btn--hard" title="Hapus permanen dari database (superadmin)" @click="hardDelete.open(row)">Hard Delete</button>
      </template>
    </DataTable>
  
    <FormModal :open="showRenewModal" title="Perpanjang Contract" @close="showRenewModal = false" @submit="handleRenew">
      <div class="form-group">
        <label class="form-label">End Date</label>
        <input v-model="renewForm.end_date" type="date" class="form-input" required>
      </div>
    </FormModal>

    <!-- Modal Hapus Kontrak (Standar Keuangan) -->
    <FormModal
      :open="showDeleteModal"
      title="Hapus Kontrak (Standar Kepatuhan Keuangan)"
      max-width="580px"
      @close="showDeleteModal = false"
    >
      <div v-if="deletingItem" class="delete-contract-modal">
        <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
          <div style="font-weight: 600; color: #dc2626; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
            ⚠️ Perhatian Standar Keuangan
          </div>
          <div style="font-size: 0.88em; color: var(--color-text-secondary); line-height: 1.5;">
            Sistem tidak mengizinkan fitur edit data kontrak demi kepatuhan dan integritas audit keuangan. Menghapus kontrak ini akan melepaskan unit terkait kembali ke status <strong>available</strong>. Nomor kontrak ini akan dialokasikan kembali untuk kontrak baru berikutnya agar penomoran selalu berurutan tanpa loncat.
          </div>
        </div>

        <div style="background: var(--color-surface-sunken); border: 1px solid var(--color-border); border-radius: 8px; padding: 14px; margin-bottom: 16px; font-size: 0.9em; display: grid; gap: 8px;">
          <div>
            <span style="color: var(--color-text-secondary);">No. Kontrak:</span>
            <strong style="margin-left: 8px; color: var(--color-primary);">{{ deletingItem.contract_no }}</strong>
          </div>
          <div>
            <span style="color: var(--color-text-secondary);">Customer:</span>
            <span style="margin-left: 8px; font-weight: 500;">{{ (deletingItem as any).customer?.company_name || (deletingItem as any).customer?.name || '-' }}</span>
          </div>
          <div>
            <span style="color: var(--color-text-secondary);">Jumlah Item/Unit:</span>
            <span style="margin-left: 8px;">{{ (deletingItem as any).contract_items?.length || 0 }} Unit</span>
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label" style="font-weight: 600;">
            Alasan Penghapusan <span style="color: #dc2626;">*</span>
          </label>
          <textarea
            v-model="deleteReason"
            class="form-input"
            rows="3"
            placeholder="Wajib diisi, contoh: Salah pemilihan customer / dibatalkan sebelum masa sewa"
            required
            style="resize: vertical;"
          ></textarea>
        </div>

        <div class="form-group" style="margin-bottom: 20px;">
          <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; font-size: 0.9em; color: var(--color-text);">
            <input
              type="checkbox"
              v-model="confirmAgree"
              style="margin-top: 3px;"
            />
            <span>
              Saya menyetujui untuk menghapus data <strong>{{ deletingItem.contract_no }}</strong> dan memahami bahwa persetujuan ini akan otomatis dicatat dalam log audit keuangan.
            </span>
          </label>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button
            type="button"
            class="btn btn-secondary"
            @click="showDeleteModal = false"
            :disabled="isDeleting"
          >
            Batal
          </button>
          <button
            type="button"
            class="btn btn-danger"
            @click="handleDelete"
            :disabled="!deleteReason.trim() || !confirmAgree || isDeleting"
            style="background: #dc2626; color: white;"
          >
            <span v-if="isDeleting">Menghapus...</span>
            <span v-else>Setujui & Hapus Kontrak</span>
          </button>
        </div>
      </div>
    </FormModal>

    <HardDeleteDialog :open="hardDelete.show" title="Hapus Permanen Contract" :item-label="hardDelete.expected"
      :expected="hardDelete.expected" :confirm-valid="hardDelete.confirmed" @close="hardDelete.close"
      @confirm="hardDelete.confirm" @update:input="hardDelete.input = $event" />
  </div>
</template>

