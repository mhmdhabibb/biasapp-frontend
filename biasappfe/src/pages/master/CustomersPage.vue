<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import ExcelImportButtons from '@/components/ui/ExcelImportButtons.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useAuth } from '@/composables/useAuth'
import { useMasterStore } from '@/composables/useMasterStore'
import { useToast } from '@/composables/useToast'
import { useHardDelete } from '@/composables/useHardDelete'
import { usePermission } from '@/composables/usePermission'
import { resources } from '@/services/resource.service'
import type { Customer, TableColumn } from '@/types'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const toast = useToast()
const data = ref<Customer[]>([])

const filterCategory = ref('')
const filterCategoryOptions = [
  { value: '', label: 'Semua Tipe' },
  { value: 'Corporate', label: 'Corporate' },
  { value: 'Government', label: 'Government' },
]

const filteredData = computed(() => {
  if (!filterCategory.value) return data.value
  return data.value.filter(c => c.category === filterCategory.value)
})

const { currentUser } = useAuth()
const { can } = usePermission()
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
const categoryOptions = [
  { value: 'Corporate', label: 'Corporate' },
  { value: 'Government', label: 'Government' },
]
const countryCodeOptions = countryCodes.map(c => ({ value: c.code, label: `${c.name} (${c.code})` }))

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

const hardDelete = useHardDelete((id: string, cascade?: boolean) => resources.customers.hardRemove(id, cascade), fetchData)

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

const deleteCascade = ref(false)

function openDelete(item: Customer) {
  deletingItem.value = item
  deleteCascade.value = false
  showConfirm.value = true
}

async function handleDelete() {
  if (deletingItem.value) {
    try {
      const cascade = hardDelete.isSuperadmin ? deleteCascade.value : false
      await resources.customers.remove(String(deletingItem.value.id), cascade)
      await fetchData()
      masterStore.refreshInBackground()
      toast.success(cascade ? 'Customer beserta seluruh data relasi berhasil dihapus!' : 'Customer berhasil dihapus!')
    } catch (error) {
      console.error('Failed to delete customer:', error)
      toast.error('Failed to delete customer: ' + ((error as any).message || 'Error'))
    }
  }
  showConfirm.value = false
}

const historyModalCustomer = ref<Customer | null>(null)

const customerHistory = computed(() => {
  if (!historyModalCustomer.value) return []
  const cid = historyModalCustomer.value.id
  const srs = (masterStore.serviceReports.value as any[]).filter((sr) => String(sr.customer_id) === String(cid)).map(x => ({...x, _type: 'service'}))
  const dos = (masterStore.deliveryOrders.value as any[]).filter((do_item) => String(do_item.customer_id) === String(cid) && do_item.do_type === 'service').map(x => ({...x, _type: 'delivery'}))
  
  return [...srs, ...dos].sort((a, b) => {
    const da = new Date(a.service_date || a.delivery_date || 0)
    const db = new Date(b.service_date || b.delivery_date || 0)
    return db.getTime() - da.getTime()
  })
})

const selectedTargetTab = ref<string>('all')

interface HistoryTarget {
  id: string
  name: string
  kind: 'unit' | 'product' | 'other'
  badge: string
}

function getItemTarget(item: any): HistoryTarget {
  if (item._type === 'service') {
    const u = item.unit || masterStore.findUnit(item.unit_id)
    if (u) {
      const label = `${u.model || u.name || 'Unit'}${u.serial_no ? ` (${u.serial_no})` : ''}`
      return {
        id: `unit_${u.id}`,
        name: label,
        kind: 'unit',
        badge: 'Unit / Mesin'
      }
    }
    return {
      id: item.unit_id ? `unit_${item.unit_id}` : 'other',
      name: item.unit_id ? `Unit (${item.unit_id})` : 'Tanpa Unit',
      kind: 'unit',
      badge: 'Unit / Mesin'
    }
  } else if (item._type === 'delivery') {
    const doi = item.delivery_order_items || []
    if (doi.length > 0) {
      const first = doi[0]
      if (first.unit_id) {
        const u = first.unit || masterStore.findUnit(first.unit_id)
        if (u) {
          const label = `${u.model || u.name || 'Unit'}${u.serial_no ? ` (${u.serial_no})` : ''}`
          return {
            id: `unit_${u.id || first.unit_id}`,
            name: label,
            kind: 'unit',
            badge: 'Unit / Mesin'
          }
        }
        const label = `${first.model || 'Unit'}${first.serial_no ? ` (${first.serial_no})` : ''}`
        return {
          id: `unit_${first.unit_id}`,
          name: label,
          kind: 'unit',
          badge: 'Unit / Mesin'
        }
      }
      if (first.product_id) {
        const p = first.product || masterStore.findProduct(first.product_id)
        return {
          id: `prod_${p?.id || first.product_id}`,
          name: p?.name || 'Produk / Sparepart',
          kind: 'product',
          badge: 'Produk / Sparepart'
        }
      }
      if (first.model) {
        const label = `${first.model}${first.serial_no ? ` (${first.serial_no})` : ''}`
        const isExternalUnit = !!(first.brand_id || first.unit_type_id || first.serial_no)
        return {
          id: isExternalUnit ? `unit_ext_${first.model}_${first.serial_no || ''}` : `prod_ext_${first.model}`,
          name: label,
          kind: isExternalUnit ? 'unit' : 'product',
          badge: isExternalUnit ? 'Unit (External)' : 'Produk'
        }
      }
    }
  }
  return { id: 'other', name: 'Lainnya / Tanpa Item', kind: 'other', badge: '-' }
}

const unitTabs = computed(() => {
  const map = new Map<string, { id: string; name: string; count: number }>()
  for (const item of customerHistory.value) {
    const t = getItemTarget(item)
    if (t.kind === 'unit') {
      if (!map.has(t.id)) map.set(t.id, { id: t.id, name: t.name, count: 0 })
      map.get(t.id)!.count++
    }
  }
  return Array.from(map.values())
})

const productTabs = computed(() => {
  const map = new Map<string, { id: string; name: string; count: number }>()
  for (const item of customerHistory.value) {
    const t = getItemTarget(item)
    if (t.kind === 'product') {
      if (!map.has(t.id)) map.set(t.id, { id: t.id, name: t.name, count: 0 })
      map.get(t.id)!.count++
    }
  }
  return Array.from(map.values())
})

const otherItemsCount = computed(() => {
  return customerHistory.value.filter(item => getItemTarget(item).kind === 'other').length
})

const activeFilteredCustomerHistory = computed(() => {
  if (selectedTargetTab.value === 'all') return customerHistory.value
  return customerHistory.value.filter((item) => getItemTarget(item).id === selectedTargetTab.value)
})

async function openHistory(customer: Customer) {
  historyModalCustomer.value = customer
  selectedTargetTab.value = 'all'
  await masterStore.refreshOnly(['serviceReports', 'deliveryOrders', 'technicians', 'units', 'products'])
}

function getHistoryTechnicianName(item: any): string {
  if (!item) return '-'

  // 1. Direct technician object on item (if preloaded)
  if (item.technician) {
    const name = item.technician.user?.name || item.technician.user?.username || item.technician.name
    if (name && name.trim() && name.trim() !== '-') return name.trim()
  }

  // 2. Direct string names on item
  const directNames = [
    item.technician_name,
    item.technician_name_copier,
    item.technician_name_technical
  ]
  for (const n of directNames) {
    if (n && typeof n === 'string' && n.trim() && n.trim() !== '-') {
      return n.trim()
    }
  }

  // 3. Lookup in masterStore.technicians by technician_id or user_id
  const techId = item.technician_id || item.user_id
  if (techId != null) {
    const str = String(techId).trim().toLowerCase()
    const tech: any = (masterStore.technicians.value as any[] || []).find(
      (t: any) => String(t.id).trim().toLowerCase() === str || String(t.user_id || '').trim().toLowerCase() === str
    ) || masterStore.findTechnician(techId)
    if (tech) {
      const name = tech.name || tech.user?.name || tech.user?.username
      if (name && name.trim() && name.trim() !== '-') return name.trim()
    }
  }

  return '-'
}

function getHistoryProblem(item: any): string {
  if (!item) return '-'
  const candidates = [
    item.machine_problem,
    item.problem,
    item.complaint,
    item.remarks,
    item.notes
  ]
  for (const c of candidates) {
    if (c && typeof c === 'string' && c.trim() && c.trim() !== '-') {
      return c.trim()
    }
  }
  return '-'
}

function getCustomerHistoryCount(cid: any) {
  const srs = (masterStore.serviceReports.value as any[]).filter(sr => String(sr.customer_id) === String(cid)).length
  const dos = (masterStore.deliveryOrders.value as any[]).filter(do_item => String(do_item.customer_id) === String(cid) && do_item.do_type === 'service').length
  return srs + dos
}

function goToForm(item: any) {
  if (item._type === 'service') {
    router.push(`/shared/service-reports/${item.id}`)
  } else {
    router.push(`/technician/standalone-service-history/${item.id}`)
  }
}

</script>

<template>
  <div>
    <PageHeader title="Customers" :button-label="isTechnician ? undefined : 'Add Customer'" permission="customer:create" @add="openAdd" />
    <div style="display: flex; justify-content: flex-end; margin-bottom: 16px;">
      <CustomSelect v-model="filterCategory" :options="filterCategoryOptions" placeholder="Filter Type" style="min-width: 160px; max-width: 250px;" />
    </div>
    <DataTable :columns="columns" :data="filteredData" search-placeholder="Search customers..."
               permission="customer"
               @edit="openEdit" @delete="openDelete" :show-hard-delete="hardDelete.isSuperadmin" @hard-delete="hardDelete.open">
      <template #toolbar>
        <ExcelImportButtons master-key="customer" @imported="fetchData" />
      </template>
      <template #cell-category="{ value }">
        <span class="badge" :class="value === 'Government' ? 'badge-primary' : value === 'Corporate' ? 'badge-info' : 'badge-secondary'">
          {{ value || '-' }}
        </span>
      </template>
      <template #actions="{ row }">
        <button class="action-btn" title="Lihat History Service" @click="openHistory(row)" style="position: relative; color: var(--color-primary); border-color: transparent;">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <span v-if="getCustomerHistoryCount(row.id) > 0" style="position: absolute; top: -6px; right: -6px; background: var(--color-danger, #ef4444); color: white; border-radius: 50%; font-size: 10px; padding: 1px 5px; font-weight: bold; line-height: 1.2;">
            {{ getCustomerHistoryCount(row.id) }}
          </span>
        </button>
        <button v-if="can('customer:update')" class="action-btn action-btn--edit" title="Edit" @click="openEdit(row)">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button v-if="can('customer:delete')" class="action-btn action-btn--delete" title="Delete" @click="openDelete(row)">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
        <button v-if="hardDelete.isSuperadmin" class="action-btn action-btn--hard" title="Hapus permanen (superadmin)" @click="hardDelete.open(row)">
          <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
            <line x1="12" y1="11" x2="12" y2="17"></line>
            <line x1="9" y1="11" x2="15" y2="17"></line>
            <line x1="15" y1="11" x2="9" y2="17"></line>
          </svg>
        </button>
      </template>
    </DataTable>
    <FormModal v-if="!isTechnician" :open="showModal" :title="editingItem ? 'Edit Customer' : 'Add Customer'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="cust-company" class="form-label">Customer Name</label>
        <input id="cust-company" v-model="form.company_name" type="text" class="form-input" placeholder="PT Example">
      </div>
      <div class="form-group">
        <label for="cust-category" class="form-label">Customer Type</label>
        <CustomSelect id="cust-category" v-model="form.category" :options="categoryOptions" placeholder="Select customer type" />
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
          <CustomSelect v-model="phoneCountryCode" :options="countryCodeOptions" placeholder="Select country code" />
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
    <ConfirmDialog
      :open="showConfirm"
      title="Delete Customer"
      :message="`Are you sure you want to delete customer '${deletingItem?.company_name}'?`"
      @close="showConfirm = false"
      @confirm="handleDelete"
    >
      <div v-if="hardDelete.isSuperadmin" class="delete-cascade-box" style="margin: 16px 0 6px; text-align: left; display: flex; flex-direction: column; gap: 8px;">
        <div style="font-size: 12px; font-weight: 600; color: var(--color-text-secondary);">Pilihan Mode Hapus:</div>
        <label
          class="cascade-opt"
          :style="{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid ' + (!deleteCascade ? 'var(--color-primary, #3b82f6)' : 'var(--color-border, #e2e8f0)'),
            background: !deleteCascade ? 'var(--color-primary-surface, #eff6ff)' : 'var(--color-surface-sunken, #f8fafc)',
            cursor: 'pointer'
          }"
        >
          <input type="radio" name="cust-delete-cascade" :checked="!deleteCascade" @change="deleteCascade = false" style="margin-top: 3px;" />
          <div>
            <div style="font-size: 13px; font-weight: 600; color: var(--color-text);">Hapus Data Terpilih Saja</div>
            <div style="font-size: 11px; color: var(--color-text-secondary); line-height: 1.3;">Hanya menghapus data customer ini. Relasi transaksi tidak ikut dihapus.</div>
          </div>
        </label>
        <label
          class="cascade-opt"
          :style="{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid ' + (deleteCascade ? 'var(--color-danger, #ef4444)' : 'var(--color-border, #e2e8f0)'),
            background: deleteCascade ? 'var(--color-danger-surface, #fef2f2)' : 'var(--color-surface-sunken, #f8fafc)',
            cursor: 'pointer'
          }"
        >
          <input type="radio" name="cust-delete-cascade" :checked="deleteCascade" @change="deleteCascade = true" style="margin-top: 3px;" />
          <div>
            <div style="font-size: 13px; font-weight: 600;" :style="{ color: deleteCascade ? 'var(--color-danger, #ef4444)' : 'var(--color-text)' }">Hapus Beserta Seluruh Data Terkait (Cascade Foreign Key)</div>
            <div style="font-size: 11px; color: var(--color-text-secondary); line-height: 1.3;">Menghapus customer dan seluruh riwayat transaksi (Sales, Rental, Invoices, Kontrak, Garansi, Surat Jalan, dll).</div>
          </div>
        </label>
      </div>
    </ConfirmDialog>

    <HardDeleteDialog
      :open="hardDelete.show"
      title="Hapus Permanen Customer"
      :item-label="hardDelete.expected"
      :expected="hardDelete.expected"
      :confirm-valid="hardDelete.confirmed"
      :show-cascade-option="true"
      :cascade="hardDelete.cascade"
      @update:cascade="hardDelete.cascade = $event"
      @close="hardDelete.close"
      @confirm="hardDelete.confirm"
      @update:input="hardDelete.input = $event"
    />

    <FormModal :open="!!historyModalCustomer" :title="'Riwayat Pekerjaan: ' + (historyModalCustomer?.company_name || historyModalCustomer?.name || '')" max-width="1000px" @close="historyModalCustomer = null">
      <div v-if="customerHistory.length === 0" class="text-center p-xl text-muted" style="padding: 40px 0;">
        Belum ada riwayat pengerjaan untuk customer ini.
      </div>
      <div v-else>
        <!-- Filter Tabs separated into Unit vs Product -->
        <div class="history-filter-container mb-3" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; border-bottom: 1px solid var(--color-border-light); padding-bottom: 14px;">
          <!-- Global / All Tab -->
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <button
              type="button"
              class="btn btn-sm"
              :class="selectedTargetTab === 'all' ? 'btn-primary' : 'btn-outline'"
              @click="selectedTargetTab = 'all'"
            >
              Semua Riwayat ({{ customerHistory.length }})
            </button>
            <button
              v-if="otherItemsCount > 0"
              type="button"
              class="btn btn-sm"
              :class="selectedTargetTab === 'other' ? 'btn-primary' : 'btn-outline'"
              @click="selectedTargetTab = 'other'"
            >
              Lainnya / Tanpa Item ({{ otherItemsCount }})
            </button>
          </div>

          <!-- Unit / Mesin Group -->
          <div v-if="unitTabs.length > 0" style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #2563eb;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
              Unit / Mesin ({{ unitTabs.reduce((acc, t) => acc + t.count, 0) }})
            </div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button
                v-for="tab in unitTabs"
                :key="tab.id"
                type="button"
                class="btn btn-sm"
                :class="selectedTargetTab === tab.id ? 'btn-primary' : 'btn-outline'"
                style="display: inline-flex; align-items: center; gap: 4px;"
                @click="selectedTargetTab = tab.id"
              >
                <span>{{ tab.name }}</span>
                <span class="badge" style="background: rgba(0,0,0,0.1); font-size: 10px; padding: 1px 5px;">{{ tab.count }}</span>
              </button>
            </div>
          </div>

          <!-- Product / Sparepart Group -->
          <div v-if="productTabs.length > 0" style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #7c3aed;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
              Produk / Consumable / Sparepart ({{ productTabs.reduce((acc, t) => acc + t.count, 0) }})
            </div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button
                v-for="tab in productTabs"
                :key="tab.id"
                type="button"
                class="btn btn-sm"
                :class="selectedTargetTab === tab.id ? 'btn-primary' : 'btn-outline'"
                style="display: inline-flex; align-items: center; gap: 4px; border-color: #c4b5fd;"
                @click="selectedTargetTab = tab.id"
              >
                <span>{{ tab.name }}</span>
                <span class="badge" style="background: rgba(0,0,0,0.1); font-size: 10px; padding: 1px 5px;">{{ tab.count }}</span>
              </button>
            </div>
          </div>
        </div>

        <div class="table-scroll" style="max-height: 400px; overflow-y: auto;">
          <table class="data-table" style="width: 100%; text-align: left; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 1px solid var(--color-border-light);">
                <th style="padding: 10px 12px; font-weight: 600; font-size: 13px; color: var(--color-text-muted);">Tanggal</th>
                <th style="padding: 10px 12px; font-weight: 600; font-size: 13px; color: var(--color-text-muted);">Form</th>
                <th style="padding: 10px 12px; font-weight: 600; font-size: 13px; color: var(--color-text-muted);">Kategori</th>
                <th style="padding: 10px 12px; font-weight: 600; font-size: 13px; color: var(--color-text-muted);">Nama Unit / Produk</th>
                <th style="padding: 10px 12px; font-weight: 600; font-size: 13px; color: var(--color-text-muted);">Tipe Layanan</th>
                <th style="padding: 10px 12px; font-weight: 600; font-size: 13px; color: var(--color-text-muted);">Teknisi</th>
                <th style="padding: 10px 12px; font-weight: 600; font-size: 13px; color: var(--color-text-muted);">Status</th>
                <th style="padding: 10px 12px; font-weight: 600; font-size: 13px; color: var(--color-text-muted);">Problem / Keluhan</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in activeFilteredCustomerHistory" :key="item._type + '-' + item.id" style="border-bottom: 1px solid var(--color-border-light); font-size: 13px;">
                <td style="padding: 10px 12px; white-space: nowrap;">{{ item.service_date || item.delivery_date ? new Date(item.service_date || item.delivery_date).toLocaleDateString('en-GB') : '-' }}</td>
                <td style="padding: 10px 12px; font-weight: 500; white-space: nowrap;">
                  <a href="#" @click.prevent="goToForm(item)" style="color: var(--color-primary); text-decoration: underline;">
                    {{ item._type === 'service' ? (item.report_no || 'Service Report') : 'Service History' }}
                  </a>
                </td>
                <td style="padding: 10px 12px; white-space: nowrap;">
                  <span
                    class="badge"
                    :style="getItemTarget(item).kind === 'unit' ? 'background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;' : getItemTarget(item).kind === 'product' ? 'background: #f5f3ff; color: #6d28d9; border: 1px solid #ddd6fe;' : 'background: #f3f4f6; color: #4b5563;'"
                    style="font-size: 11px; font-weight: 600;"
                  >
                    {{ getItemTarget(item).badge }}
                  </span>
                </td>
                <td style="padding: 10px 12px; font-weight: 500;">{{ getItemTarget(item).name }}</td>
                <td style="padding: 10px 12px; white-space: nowrap;">{{ item._type === 'service' ? 'Service Report' : 'Stand Alone' }}</td>
                <td style="padding: 10px 12px; white-space: nowrap;">{{ getHistoryTechnicianName(item) }}</td>
                <td style="padding: 10px 12px; white-space: nowrap;">
                  <span class="badge" :class="item.status === 'completed' || item.status === 'delivered' ? 'badge-success' : 'badge-warning'" style="font-size: 11px;">
                    {{ (item.status || 'pending').toUpperCase().replace('_', ' ') }}
                  </span>
                </td>
                <td style="padding: 10px 12px; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" :title="getHistoryProblem(item)">
                   {{ getHistoryProblem(item) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <template #footer>
        <button type="button" class="btn btn-outline" style="width: 100%;" @click="historyModalCustomer = null">Tutup Riwayat</button>
      </template>
    </FormModal>
  </div>
</template>


