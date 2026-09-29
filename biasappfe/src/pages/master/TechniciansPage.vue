<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { resources } from '@/services/resource.service'
import type { TableColumn, Technician } from '@/types'

const data = ref<Technician[]>([])
const masterStore = useMasterStore()

async function fetchData() {
  try {
    const res = await resources.technicians.list()
    data.value = res.data.map((t: any) => ({
      ...t,
      name: t.user?.name || '-',
      phone: t.user?.phone || '-'
    }))
  } catch (error) {
    console.error('Failed to fetch technicians:', error)
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
const form = reactive({ name: '', phone: '' })

function openAdd() {
  editingItem.value = null
  Object.assign(form, { name: '', phone: '' })
  showModal.value = true
}

function openEdit(item: Technician) {
  editingItem.value = item
  // the original form only edits name and phone. Note: the backend actually maps name and phone to User model.
  // The actual create/update might need to hit a different endpoint or handle it. Assuming backend handles it.
  Object.assign(form, { name: (item as any).name, phone: (item as any).phone })
  showModal.value = true
}

async function handleSubmit() {
  if (!form.name.trim()) return
  try {
    if (editingItem.value) {
      await resources.technicians.update(String(editingItem.value.id), form)
    } else {
      await resources.technicians.create(form)
    }
    await fetchData()
    masterStore.refresh()
    showModal.value = false
  } catch (error) {
    console.error('Failed to save technician:', error)
  }
}

function openDelete(item: Technician) { deletingItem.value = item; showConfirm.value = true }

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.technicians.remove(String(deletingItem.value.id))
      await fetchData()
      masterStore.refresh()
    } catch (error) {
      console.error('Failed to delete technician:', error)
    }
  }
  showConfirm.value = false
}
</script>

<template>
  <div>
    <PageHeader title="Technicians" button-label="Add Technician" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Search technician..." @edit="openEdit" @delete="openDelete">
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
        <label for="tech-name" class="form-label">Name</label>
        <input id="tech-name" v-model="form.name" type="text" class="form-input" placeholder="Technician name">
      </div>
      <div class="form-group">
        <label for="tech-phone" class="form-label">Phone</label>
        <input id="tech-phone" v-model="form.phone" type="tel" inputmode="numeric" pattern="[0-9]*" class="form-input" placeholder="08xxxxxxxxxx" @input="form.phone = form.phone.replace(/[^0-9]/g, '')">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Technician" :message="`Are you sure you want to delete technician '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
