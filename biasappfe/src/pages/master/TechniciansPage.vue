<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useToast } from '@/composables/useToast'
import { useHardDelete } from '@/composables/useHardDelete'
import { resources } from '@/services/resource.service'
import type { TableColumn, Technician } from '@/types'

const toast = useToast()
const data = ref<Technician[]>([])
const users = ref<any[]>([])
const masterStore = useMasterStore()

async function fetchData() {
  try {
    const [techRes, userRes] = await Promise.all([
      resources.technicians.list(),
      resources.users.list()
    ])
    data.value = techRes.data.map((t: any) => ({
      ...t,
      name: t.user?.name || '-',
      phone: t.user?.phone || '-'
    }))
    users.value = userRes.data
  } catch (error) {
    console.error('Failed to fetch technicians:', error)
    toast.error('Failed to fetch technician data: ' + ((error as any).message || 'Error'))
  }
}

onMounted(fetchData)

const columns: TableColumn[] = [
  { key: 'name', label: 'Technician Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'status', label: 'Status' },
]
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Technician | null>(null)
const deletingItem = ref<Technician | null>(null)
const form = reactive({ user_id: null as string | null, employee_code: '', name: '', phone: '' })

// Users that are not already linked to a technician (for the Add form)
const availableUsers = computed(() => {
  const linked = new Set(data.value.map((t: any) => String(t.user_id)))
  return users.value.filter(u => !linked.has(String(u.id)))
})

function openAdd() {
  editingItem.value = null
  Object.assign(form, { user_id: null, employee_code: '', name: '', phone: '' })
  showModal.value = true
}

function openEdit(item: Technician) {
  editingItem.value = item
  Object.assign(form, {
    user_id: (item as any).user_id || null,
    employee_code: (item as any).employee_code || '',
    name: (item as any).name || '',
    phone: (item as any).phone || ''
  })
  showModal.value = true
}

async function handleSubmit() {
  try {
    if (editingItem.value) {
      // Backend: name/phone update the linked user, employee_code updates the technician row
      await resources.technicians.update(String(editingItem.value.id), {
        user_id: form.user_id,
        employee_code: form.employee_code,
        name: form.name.trim() || undefined,
        phone: form.phone.trim() || undefined
      })
    } else {
      if (!form.user_id) {
        return toast.warning('Please select a user to assign as technician!')
      }
      if (!form.employee_code.trim()) {
        return toast.warning('Employee code is required!')
      }
      // Backend create requires user_id + employee_code only
      await resources.technicians.create({
        user_id: form.user_id,
        employee_code: form.employee_code.trim()
      })
    }
    await fetchData()
    masterStore.refresh()
    showModal.value = false
    toast.success(editingItem.value ? 'Technician updated successfully!' : 'Technician saved successfully!')
  } catch (error) {
    console.error('Failed to save technician:', error)
    toast.error('Failed to save technician: ' + ((error as any).message || 'Error'))
  }
}

const hardDelete = useHardDelete((id: string) => resources.technicians.hardRemove(id), fetchData)

function openDelete(item: Technician) { deletingItem.value = item; showConfirm.value = true }

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.technicians.remove(String(deletingItem.value.id))
      await fetchData()
      masterStore.refresh()
      toast.success('Technician deleted successfully!')
    } catch (error) {
      console.error('Failed to delete technician:', error)
      toast.error('Failed to delete technician')
    }
  }
  showConfirm.value = false
}

</script>

<template>
  <div>
    <PageHeader title="Technicians" button-label="Add Technician" permission="technician:create" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Search technician..." permission="technician" @edit="openEdit" @delete="openDelete" :show-hard-delete="hardDelete.isSuperadmin" @hard-delete="hardDelete.open">
      <template #cell-status="{ value }">
        <span
          class="badge"
          :class="{
            'badge-success': value === 'available' || value === 'Active',
            'badge-warning': value === 'non-active' || value === 'Working',
            'badge-danger': value === 'inactive' || value === 'Off'
          }"
        >
          {{ value || 'available' }}
        </span>
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Technician' : 'Add Technician'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="tech-user" class="form-label">User</label>
        <select id="tech-user" v-model="form.user_id" class="form-select" :disabled="!!editingItem">
          <option :value="null">-- Select User --</option>
          <option v-for="u in (editingItem ? users : availableUsers)" :key="u.id" :value="String(u.id)">
            {{ u.name }}{{ u.email ? ` (${u.email})` : '' }}
          </option>
        </select>
      </div>
      <div class="form-group">
        <label for="tech-code" class="form-label">Employee Code</label>
        <input id="tech-code" v-model="form.employee_code" type="text" class="form-input" placeholder="e.g. TCH-001">
      </div>
      <template v-if="editingItem">
        <div class="form-group">
          <label for="tech-name" class="form-label">Name</label>
          <input id="tech-name" v-model="form.name" type="text" class="form-input" placeholder="Technician name">
        </div>
        <div class="form-group">
          <label for="tech-phone" class="form-label">Phone</label>
          <input id="tech-phone" v-model="form.phone" type="tel" inputmode="numeric" pattern="[0-9]*" class="form-input" placeholder="08xxxxxxxxxx" @input="form.phone = form.phone.replace(/[^0-9]/g, '')">
        </div>
      </template>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Technician" :message="`Are you sure you want to delete technician '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
    <HardDeleteDialog :open="hardDelete.show" title="Hapus Permanen Technician" :item-label="hardDelete.expected"
      :expected="hardDelete.expected" :confirm-valid="hardDelete.confirmed" @close="hardDelete.close"
      @confirm="hardDelete.confirm" @update:input="hardDelete.input = $event" />
  </div>
</template>


