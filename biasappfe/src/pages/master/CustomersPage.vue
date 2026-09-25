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
const form = reactive({ company_name: '', pic_name: '', pic_gender: 'L', pic_position: '', phone: '', fax: '', email: '', address: '' })

function openAdd() {
  editingItem.value = null
  Object.assign(form, { company_name: '', pic_name: '', pic_gender: 'L', pic_position: '', phone: '', fax: '', email: '', address: '' })
  showModal.value = true
}

function openEdit(item: Customer) {
  editingItem.value = item
  Object.assign(form, { company_name: item.company_name, pic_name: item.pic_name, pic_gender: item.pic_gender || 'L', pic_position: item.pic_position || '', phone: item.phone, fax: item.fax || '', email: item.email || '', address: item.address })
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
        <label class="form-label">PIC Gender</label>
        <div style="display: flex; gap: 10px;">
          <label style="display: flex; align-items: center; gap: 4px;">
            <input type="radio" v-model="form.pic_gender" value="L"> Laki-laki
          </label>
          <label style="display: flex; align-items: center; gap: 4px;">
            <input type="radio" v-model="form.pic_gender" value="P"> Perempuan
          </label>
        </div>
      </div>
      <div class="form-group">
        <label for="cust-pic-position" class="form-label">PIC Position (Jabatan)</label>
        <input id="cust-pic-position" v-model="form.pic_position" type="text" class="form-input" placeholder="e.g. Direktur / Kepala Cabang">
      </div>
      <div class="form-group">
        <label for="cust-phone" class="form-label">Phone</label>
        <input id="cust-phone" v-model="form.phone" type="tel" inputmode="numeric" pattern="[0-9]*" class="form-input" placeholder="08xxxxxxxxxx" @input="form.phone = form.phone.replace(/[^0-9]/g, '')">
      </div>
      <div class="form-group">
        <label for="cust-fax" class="form-label">Fax (Opsional)</label>
        <input id="cust-fax" v-model="form.fax" type="text" class="form-input" placeholder="Nomor Fax">
      </div>
      <div class="form-group">
        <label for="cust-email" class="form-label">Email</label>
        <input id="cust-email" v-model="form.email" type="email" class="form-input" placeholder="customer@example.com">
      </div>
      <div class="form-group">
        <label for="cust-address" class="form-label">Address</label>
        <textarea id="cust-address" v-model="form.address" class="form-textarea" placeholder="Full address"></textarea>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Customer" :message="`Are you sure you want to delete customer '${deletingItem?.company_name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
