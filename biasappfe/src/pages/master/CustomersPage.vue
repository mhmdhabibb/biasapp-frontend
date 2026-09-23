<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { resources } from '@/services/resource.service'
import type { TableColumn, Customer } from '@/types'

const data = ref<Customer[]>([])
const { currentUser } = useAuth()
const isTechnician = computed(() => currentUser.value?.role === 'technician')

async function fetchData() {
  try {
    const res = await resources.customers.list()
    data.value = res.data as any
  } catch (error) {
    console.error('Failed to fetch customers:', error)
  }
}

onMounted(fetchData)

const columns: TableColumn[] = [
  { key: 'company_name', label: 'Company' },
  { key: 'pic_name', label: 'PIC Name' },
  { key: 'phone', label: 'Phone' },
]
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Customer | null>(null)
const deletingItem = ref<Customer | null>(null)
const form = reactive({ company_name: '', pic_name: '', phone: '', address: '' })

function openAdd() {
  editingItem.value = null
  Object.assign(form, { company_name: '', pic_name: '', phone: '', address: '' })
  showModal.value = true
}

function openEdit(item: Customer) {
  editingItem.value = item
  Object.assign(form, { company_name: item.company_name, pic_name: item.pic_name, phone: item.phone, address: item.address })
  showModal.value = true
}

function openDelete(item: Customer) { deletingItem.value = item; showConfirm.value = true }

const masterStore = useMasterStore()

async function handleSubmit() {
  if (!form.company_name.trim()) return
  try {
    if (editingItem.value) {
      await resources.customers.update(String(editingItem.value.id), form)
    } else {
      await resources.customers.create(form)
    }
    await fetchData()
    masterStore.refresh()
    showModal.value = false
  } catch (error) {
    console.error('Failed to save customer:', error)
  }
}

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.customers.remove(String(deletingItem.value.id))
      await fetchData()
      masterStore.refresh()
    } catch (error) {
      console.error('Failed to delete customer:', error)
    }
  }
  showConfirm.value = false
}
</script>

<template>
  <div>
    <PageHeader title="Customers" :button-label="isTechnician ? undefined : 'Add Customer'" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Search customers..." 
               :hide-actions="isTechnician"
               @edit="openEdit" @delete="openDelete" />
    <FormModal v-if="!isTechnician" :open="showModal" :title="editingItem ? 'Edit Customer' : 'Add Customer'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="cust-company" class="form-label">Company Name</label>
        <input id="cust-company" v-model="form.company_name" type="text" class="form-input" placeholder="PT Example">
      </div>
      <div class="form-group">
        <label for="cust-name" class="form-label">PIC Name</label>
        <input id="cust-name" v-model="form.pic_name" type="text" class="form-input" placeholder="Contact name">
      </div>
      <div class="form-group">
        <label for="cust-phone" class="form-label">Phone</label>
        <input id="cust-phone" v-model="form.phone" type="tel" inputmode="numeric" pattern="[0-9]*" class="form-input" placeholder="08xxxxxxxxxx" @input="form.phone = form.phone.replace(/[^0-9]/g, '')">
      </div>
      <div class="form-group">
        <label for="cust-address" class="form-label">Address</label>
        <textarea id="cust-address" v-model="form.address" class="form-textarea" placeholder="Full address"></textarea>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Customer" :message="`Are you sure you want to delete customer '${deletingItem?.name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
