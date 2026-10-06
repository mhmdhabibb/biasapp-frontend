<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { useToast } from '@/composables/useToast'
import { useHardDelete } from '@/composables/useHardDelete'
import { resources } from '@/services/resource.service'
import type { Customer, TableColumn } from '@/types'
import { computed, onMounted, reactive, ref } from 'vue'

const toast = useToast()
const data = ref<Customer[]>([])
const { currentUser } = useAuth()
const isTechnician = computed(() => currentUser.value?.role === 'technician')

async function fetchData() {
  try {
    const res = await resources.customers.list()
    data.value = res.data as any
  } catch (error) {
    console.error('Failed to fetch customers:', error)
    toast.error('Failed to fetch customer data: ' + ((error as any).message || 'Error'))
  }
}

onMounted(fetchData)

const columns: TableColumn[] = [
  { key: 'company_name', label: 'Customer' },
  { key: 'category', label: 'Type' },
  { key: 'pic_name', label: 'PIC Name' },
  { key: 'phone', label: 'Phone' },
]
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<Customer | null>(null)
const deletingItem = ref<Customer | null>(null)
const phoneCountryCode = ref('+62')
const countryCodes = [
  { name: 'Indonesia', code: '+62' },
  { name: 'United States / Canada', code: '+1' },
  { name: 'United Kingdom', code: '+44' },
  { name: 'Malaysia', code: '+60' },
  { name: 'Singapore', code: '+65' },
  { name: 'Australia', code: '+61' },
  { name: 'Japan', code: '+81' },
  { name: 'South Korea', code: '+82' },
  { name: 'China', code: '+86' },
  { name: 'India', code: '+91' },
  { name: 'Philippines', code: '+63' },
  { name: 'Thailand', code: '+66' },
  { name: 'Vietnam', code: '+84' },
  { name: 'Saudi Arabia', code: '+966' },
  { name: 'United Arab Emirates', code: '+971' },
  { name: 'Germany', code: '+49' },
  { name: 'France', code: '+33' },
  { name: 'Netherlands', code: '+31' },
]
const form = reactive({ category: 'Corporate' as string, company_name: '', pic_name: '', pic_gender: 'L', pic_position: '', nip: '', phone: '', fax: '', email: '', address: '' })

function openAdd() {
  editingItem.value = null
  phoneCountryCode.value = '+62'
  Object.assign(form, { category: 'Corporate', company_name: '', pic_name: '', pic_gender: 'L', pic_position: '', nip: '', phone: '', fax: '', email: '', address: '' })
  showModal.value = true
}

function openEdit(item: Customer) {
  editingItem.value = item
  const storedDigits = String(item.phone || '').replace(/\D/g, '')
  const matchingCode = countryCodes
    .slice()
    .sort((a, b) => b.code.length - a.code.length)
    .find(country => storedDigits.startsWith(country.code.slice(1)))
  phoneCountryCode.value = matchingCode?.code || '+62'
  const localPhone = matchingCode
    ? storedDigits.slice(matchingCode.code.length - 1)
    : storedDigits.replace(/^0+/, '')
  Object.assign(form, { category: item.category || 'Corporate', company_name: item.company_name, pic_name: item.pic_name, pic_gender: item.pic_gender || 'L', pic_position: item.pic_position || '', nip: item.nip || '', phone: localPhone, fax: item.fax || '', email: item.email || '', address: item.address })
  showModal.value = true
}

const hardDelete = useHardDelete((id: string) => resources.customers.hardRemove(id), fetchData)

function openDelete(item: Customer) { deletingItem.value = item; showConfirm.value = true }

const masterStore = useMasterStore()

async function handleSubmit() {
  if (!form.company_name.trim()) return
  const localPhone = form.phone.replace(/\D/g, '').replace(/^0+/, '')
  const fullPhone = `${phoneCountryCode.value}${localPhone}`
  if (!/^\+[1-9][0-9]{7,14}$/.test(fullPhone)) {
    toast.error('Enter a valid phone number with a country code.')
    return
  }
  const payload = { ...form, phone: fullPhone }
  try {
    if (editingItem.value) {
      await resources.customers.update(String(editingItem.value.id), payload)
    } else {
      await resources.customers.create(payload)
    }
    await fetchData()
    masterStore.refreshInBackground()
    showModal.value = false
    toast.success(editingItem.value ? 'Customer updated successfully!' : 'Customer saved successfully!')
  } catch (error) {
    console.error('Failed to save customer:', error)
    toast.error('Failed to save customer: ' + ((error as any).message || 'Error'))
  }
}

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.customers.remove(String(deletingItem.value.id))
      await fetchData()
      masterStore.refreshInBackground()
      toast.success('Customer deleted successfully!')
    } catch (error) {
      console.error('Failed to delete customer:', error)
      toast.error('Failed to delete customer')
    }
  }
  showConfirm.value = false
}

</script>

<template>
  <div>
    <PageHeader title="Customers" :button-label="isTechnician ? undefined : 'Add Customer'" permission="customer:create" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Search customers..."
               permission="customer"
               @edit="openEdit" @delete="openDelete" :show-hard-delete="hardDelete.isSuperadmin" @hard-delete="hardDelete.open" />
    <FormModal v-if="!isTechnician" :open="showModal" :title="editingItem ? 'Edit Customer' : 'Add Customer'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="cust-company" class="form-label">Customer Name</label>
        <input id="cust-company" v-model="form.company_name" type="text" class="form-input" placeholder="PT Example">
      </div>
      <div class="form-group">
        <label for="cust-category" class="form-label">Customer Type</label>
        <select id="cust-category" v-model="form.category" class="form-select" required>
          <option value="Corporate">Corporate</option>
          <option value="Government">Government</option>
        </select>
      </div>
      <div class="form-group">
        <label for="cust-name" class="form-label">PIC Name</label>
        <input id="cust-name" v-model="form.pic_name" type="text" class="form-input" placeholder="Contact name">
      </div>
      <div class="form-group">
        <label class="form-label">PIC Gender</label>
        <div style="display: flex; gap: 10px;">
          <label style="display: flex; align-items: center; gap: 4px;">
            <input type="radio" v-model="form.pic_gender" value="L"> Male
          </label>
          <label style="display: flex; align-items: center; gap: 4px;">
            <input type="radio" v-model="form.pic_gender" value="P"> Female
          </label>
        </div>
      </div>
      <div class="form-group">
        <label for="cust-pic-position" class="form-label">PIC Position</label>
        <input id="cust-pic-position" v-model="form.pic_position" type="text" class="form-input" placeholder="e.g. General Affairs Head">
      </div>
      <div class="form-group">
        <label for="cust-nip" class="form-label">NIP (Optional)</label>
        <input id="cust-nip" v-model="form.nip" type="text" class="form-input" placeholder="e.g. 1969 03232 00003 1005">
      </div>
      <div class="form-group">
        <label for="cust-phone" class="form-label">Phone Number <span class="text-danger">*</span></label>
        <div style="display: grid; grid-template-columns: minmax(145px, 0.8fr) 1.2fr; gap: 8px;">
          <select v-model="phoneCountryCode" class="form-select" aria-label="Country calling code" required>
            <option v-for="country in countryCodes" :key="country.code" :value="country.code">
              {{ country.name }} ({{ country.code }})
            </option>
          </select>
          <input id="cust-phone" v-model="form.phone" type="tel" inputmode="numeric" pattern="[0-9]*" class="form-input" placeholder="8123456789" :maxlength="15 - phoneCountryCode.length + 1" required @input="form.phone = form.phone.replace(/[^0-9]/g, '').replace(/^0+/, '')">
        </div>
        <p class="form-hint">Saved as {{ phoneCountryCode }}{{ form.phone || '...' }}</p>
      </div>
      <div class="form-group">
        <label for="cust-fax" class="form-label">Fax (Optional)</label>
        <input id="cust-fax" v-model="form.fax" type="text" class="form-input" placeholder="Fax Number">
      </div>
      <div class="form-group">
        <label for="cust-email" class="form-label">Email</label>
        <input id="cust-email" v-model="form.email" type="email" class="form-input" placeholder="company@example.com">
      </div>
      <div class="form-group">
        <label for="cust-address" class="form-label">Address</label>
        <textarea id="cust-address" v-model="form.address" class="form-textarea" placeholder="Full address"></textarea>
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Customer" :message="`Are you sure you want to delete customer '${deletingItem?.company_name}'?`" @close="showConfirm = false" @confirm="handleDelete" />
    <HardDeleteDialog :open="hardDelete.show" title="Hapus Permanen Customer" :item-label="hardDelete.expected"
      :expected="hardDelete.expected" :confirm-valid="hardDelete.confirmed" @close="hardDelete.close"
      @confirm="hardDelete.confirm" @update:input="hardDelete.input = $event" />
  </div>
</template>


