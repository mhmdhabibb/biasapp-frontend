<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DemoModePinModal from '@/components/ui/DemoModePinModal.vue'
import type { SystemSetting, TableColumn } from '@/types'
import { computed, reactive, ref, onMounted } from 'vue'
import { useSystemSettings } from '@/composables/useSystemSettings'
import { useToast } from '@/composables/useToast'
import { useHardDelete } from '@/composables/useHardDelete'
import { useDemoMode } from '@/composables/useDemoMode'

const toast = useToast()
const { isDemoMode, fetchDemoMode, isLoading: demoLoading } = useDemoMode()
onMounted(() => fetchDemoMode(true))

const showDemoPinModal = ref(false)
const demoPinModalMode = ref<'toggle' | 'change-pin'>('toggle')

function openDemoToggleLock(e: Event) {
  e.preventDefault()
  demoPinModalMode.value = 'toggle'
  showDemoPinModal.value = true
}

function openChangeDemoPin() {
  demoPinModalMode.value = 'change-pin'
  showDemoPinModal.value = true
}

const columns: TableColumn[] = [
  { key: 'key', label: 'Key' },
  { key: 'value', label: 'Value' },
]

const { systemSettings: data, fetchAll, create, update, remove, hardRemove, error } = useSystemSettings()
const visibleData = computed(() => (data.value || []).filter((item: any) => item.key !== 'demo_mode_pin'))
fetchAll()
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<SystemSetting | null>(null)
const deletingItem = ref<SystemSetting | null>(null)
const form = reactive<any>({})

function openAdd() {
  editingItem.value = null
  for (let k in form) form[k] = ''
  showModal.value = true
}

function openEdit(item: SystemSetting) {
  editingItem.value = item
  Object.assign(form, item)
  showModal.value = true
}

async function handleSubmit() {
  if (editingItem.value) {
    await update(String(editingItem.value.id), form)
  } else {
    await create(form)
  }
  showModal.value = false
  toast.success(editingItem.value ? 'System setting updated successfully!' : 'System setting saved successfully!')
}

const hardDelete = useHardDelete(hardRemove, fetchAll)

function openDelete(item: SystemSetting) { deletingItem.value = item; showConfirm.value = true }
async function handleDelete() {
  if (deletingItem.value) await remove(String(deletingItem.value.id))
  showConfirm.value = false
  toast.success('System setting deleted successfully!')
}
</script>

<template>
  <div v-if="!hardDelete.isSuperadmin" class="page-error" role="alert">
    Akses ditolak. Halaman System Settings hanya dapat diakses oleh Superadmin.
  </div>
  <div v-else>
    <PageHeader title="System Settings" button-label="Add System Setting" permission="system_setting:create" @add="openAdd" />

    <!-- Demo Mode Toggle Card (Superadmin only + PIN Locked) -->
    <div class="demo-mode-card">
      <div class="demo-mode-info">
        <div class="demo-mode-icon">🔒</div>
        <div>
          <div class="demo-mode-title">🧪 Demo Mode (Terkunci PIN Keamanan)</div>
          <div class="demo-mode-desc">
            Jika <strong>AKTIF</strong>: teknisi bisa mengerjakan job di tanggal berapapun (untuk testing alur).<br>
            Jika <strong>NONAKTIF</strong>: job hanya bisa dikerjakan sesuai tanggal assign-nya.
          </div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
        <button type="button" class="btn btn-outline btn-sm" @click="openChangeDemoPin">
          🔑 Ubah PIN
        </button>
        <label class="demo-toggle-switch" :title="isDemoMode ? 'Terkunci PIN: klik untuk nonaktifkan Demo Mode' : 'Terkunci PIN: klik untuk aktifkan Demo Mode'" @click.prevent="openDemoToggleLock">
          <input type="checkbox" :checked="isDemoMode" :disabled="demoLoading" readonly />
          <span class="demo-toggle-slider"></span>
          <span class="demo-toggle-label" :class="{ active: isDemoMode }">
            {{ isDemoMode ? 'AKTIF' : 'NONAKTIF' }}
          </span>
        </label>
      </div>
    </div>

    <div v-if="error" class="page-error" role="alert">{{ error }}</div>
    <DataTable :columns="columns" :data="visibleData" search-placeholder="Search..." permission="system_setting" @edit="openEdit" @delete="openDelete" :show-hard-delete="hardDelete.isSuperadmin" @hard-delete="hardDelete.open" />
    <DemoModePinModal :open="showDemoPinModal" :mode="demoPinModalMode" @close="showDemoPinModal = false" @success="fetchAll()" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit System Setting' : 'Add System Setting'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group" v-for="col in columns" :key="col.key">
        <label class="form-label">{{ col.label }}</label>
        <input v-model="form[col.key]" type="text" class="form-input">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete System Setting" message="Are you sure you want to delete this item?" @close="showConfirm = false" @confirm="handleDelete" />
    <HardDeleteDialog :open="hardDelete.show" title="Hapus Permanen System Setting" :item-label="hardDelete.expected"
      :expected="hardDelete.expected" :confirm-valid="hardDelete.confirmed" @close="hardDelete.close"
      @confirm="hardDelete.confirm" @update:input="hardDelete.input = $event" />
  </div>
</template>

<style scoped>
.demo-mode-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  background: linear-gradient(135deg, #fff8e1 0%, #fff3cd 100%);
  border: 2px solid #f59e0b;
  border-radius: 12px;
  padding: 1rem 1.25rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}
.demo-mode-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.demo-mode-icon {
  font-size: 2rem;
  line-height: 1;
}
.demo-mode-title {
  font-weight: 700;
  font-size: 1rem;
  color: #92400e;
  margin-bottom: 0.2rem;
}
.demo-mode-desc {
  font-size: 0.82rem;
  color: #78350f;
  line-height: 1.4;
}
.demo-toggle-switch {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
  flex-shrink: 0;
}
.demo-toggle-switch input[type="checkbox"] {
  display: none;
}
.demo-toggle-slider {
  position: relative;
  width: 52px;
  height: 28px;
  background: #d1d5db;
  border-radius: 999px;
  transition: background 0.25s;
  flex-shrink: 0;
}
.demo-toggle-slider::after {
  content: '';
  position: absolute;
  left: 3px;
  top: 3px;
  width: 22px;
  height: 22px;
  background: white;
  border-radius: 50%;
  transition: transform 0.25s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
.demo-toggle-switch input:checked + .demo-toggle-slider {
  background: #f59e0b;
}
.demo-toggle-switch input:checked + .demo-toggle-slider::after {
  transform: translateX(24px);
}
.demo-toggle-label {
  font-size: 0.85rem;
  font-weight: 700;
  color: #6b7280;
  min-width: 72px;
}
.demo-toggle-label.active {
  color: #92400e;
}
</style>
