import re

with open('src/pages/customer-service/ContractItemsPage.vue', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. imports and paperSizes fetch
c = c.replace("import { useMasterStore } from '@/composables/useMasterStore'",
              "import { useMasterStore } from '@/composables/useMasterStore'\nimport { resources } from '@/services/resource.service'\nimport { onMounted } from 'vue'")
c = c.replace("const deletingItem = ref<ContractItem | null>(null)",
              "const deletingItem = ref<ContractItem | null>(null)\nconst paperSizes = ref<{id: string, name: string}[]>([])\n\nonMounted(async () => {\n  try {\n    const res = await resources.paperSizes.list()\n    paperSizes.value = res.data as any\n  } catch(e) {}\n})")

# 2. update form reactive state
form_old = """const form = reactive({
  contract_no: '',
  customer_id: null as string | null,
  unit_id: null as string | null,
  start_date: '',
  end_date: '',
  location: '',
  total_value: 0,
  rate_per_page_bw_a4: 0,
  rate_per_page_color_a4: 0,
  rate_per_page_bw_a3: 0,
  rate_per_page_color_a3: 0,

  free_quota_color: 0,
  status: 'active',
})"""

form_new = """const form = reactive({
  contract_no: '',
  customer_id: null as string | null,
  unit_id: null as string | null,
  start_date: '',
  end_date: '',
  location: '',
  total_value: 0,
  free_quota_color: 0,
  rates: [] as any[],
  status: 'active',
})

function addRate() {
  form.rates.push({ paper_size_id: '', rate_per_page_bw: 0, rate_per_page_color: 0 })
}

function removeRate(index: number) {
  form.rates.splice(index, 1)
}"""

c = c.replace(form_old, form_new)

# 3. update openAdd & openEdit
openadd_old = """function openAdd() {
  editingItem.value = null
  Object.assign(form, { ...defaultForm, contract_no: `CNT-${Date.now().toString().slice(-6)}` })
  showModal.value = true
}"""
openadd_new = """function openAdd() {
  editingItem.value = null
  Object.assign(form, { ...defaultForm, contract_no: `CNT-${Date.now().toString().slice(-6)}`, rates: [] })
  showModal.value = true
}"""
c = c.replace(openadd_old, openadd_new)

openedit_old = """function openEdit(item: any) {
  editingItem.value = item
  Object.assign(form, {
    contract_no: item.contract?.contract_no || item.contract_no,
    customer_id: item.contract?.customer_id || item.customer_id,
    unit_id: item.unit_id,
    start_date: item.contract?.start_date ? item.contract.start_date.slice(0, 10) : item.start_date,
    end_date: item.contract?.end_date ? item.contract.end_date.slice(0, 10) : item.end_date,
    location: item.contract?.location || item.placement_location || '',
    total_value: item.contract?.total_value || item.monthly_rent_fee || 0,
    rate_per_page_bw_a4: item.rate_per_page_bw_a4 || item.rate_per_page_bw || item.rate_per_page_mono || 0,
    rate_per_page_color_a4: item.rate_per_page_color_a4 || item.rate_per_page_color || 0,
    rate_per_page_bw_a3: item.rate_per_page_bw_a3 || 0,
    rate_per_page_color_a3: item.rate_per_page_color_a3 || 0,

    free_quota_color: item.free_quota_color || item.free_copy_quota || 0,
    status: item.status,
  })
  showModal.value = true
}"""
openedit_new = """function openEdit(item: any) {
  editingItem.value = item
  Object.assign(form, {
    contract_no: item.contract?.contract_no || item.contract_no,
    customer_id: item.contract?.customer_id || item.customer_id,
    unit_id: item.unit_id,
    start_date: item.contract?.start_date ? item.contract.start_date.slice(0, 10) : item.start_date,
    end_date: item.contract?.end_date ? item.contract.end_date.slice(0, 10) : item.end_date,
    location: item.contract?.location || item.placement_location || '',
    total_value: item.contract?.total_value || item.monthly_rent_fee || 0,
    free_quota_color: item.free_quota_color || item.free_copy_quota || 0,
    rates: Array.isArray(item.rates) ? item.rates.map((r: any) => ({
      paper_size_id: r.paper_size_id,
      rate_per_page_bw: r.rate_per_page_bw,
      rate_per_page_color: r.rate_per_page_color
    })) : [],
    status: item.status,
  })
  showModal.value = true
}"""
c = c.replace(openedit_old, openedit_new)

# 4. update template
template_old = """      <div class="form-row" style="margin-top: 1rem;">
        <div class="form-group">
          <label for="ci-rate-bw-a4" class="form-label">BW Rate / Page A4</label>
          <input id="ci-rate-bw-a4" v-model.number="form.rate_per_page_bw_a4" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="ci-rate-color-a4" class="form-label">Color Rate / Page A4</label>
          <input id="ci-rate-color-a4" v-model.number="form.rate_per_page_color_a4" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="ci-rate-bw-a3" class="form-label">BW Rate / Page A3</label>
          <input id="ci-rate-bw-a3" v-model.number="form.rate_per_page_bw_a3" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="ci-rate-color-a3" class="form-label">Color Rate / Page A3</label>
          <input id="ci-rate-color-a3" v-model.number="form.rate_per_page_color_a3" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="ci-free-color" class="form-label">Free Color Quota</label>
          <input id="ci-free-color" v-model.number="form.free_quota_color" type="number" class="form-input" min="0">
        </div>
      </div>"""

template_new = """      <div class="form-group" style="margin-top: 1rem;">
        <label for="ci-free-color" class="form-label">Free Color Quota</label>
        <input id="ci-free-color" v-model.number="form.free_quota_color" type="number" class="form-input" min="0" style="max-width: 200px;">
      </div>

      <div style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <label class="form-label" style="margin: 0;">Daftar Harga Kertas (Rates)</label>
          <button type="button" @click="addRate" class="btn btn-secondary btn-sm" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">+ Tambah Harga</button>
        </div>
        
        <div v-for="(rate, index) in form.rates" :key="index" style="display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center; background: var(--bg-color); padding: 0.5rem; border-radius: 8px; border: 1px solid var(--border-color);">
          <div>
            <select v-model="rate.paper_size_id" class="form-select">
              <option value="" disabled>Pilih Ukuran</option>
              <option v-for="p in paperSizes" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <div>
            <input v-model.number="rate.rate_per_page_bw" type="number" class="form-input" min="0" placeholder="Tarif BW">
          </div>
          <div>
            <input v-model.number="rate.rate_per_page_color" type="number" class="form-input" min="0" placeholder="Tarif Warna">
          </div>
          <button type="button" @click="removeRate(index)" style="background: none; border: none; color: var(--danger-color); cursor: pointer; padding: 0.5rem;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
        <div v-if="form.rates.length === 0" style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 1rem; border: 1px dashed var(--border-color); border-radius: 8px;">
          Belum ada ukuran kertas yang ditambahkan.
        </div>
      </div>"""

c = c.replace(template_old, template_new)

with open('src/pages/customer-service/ContractItemsPage.vue', 'w', encoding='utf-8') as f:
    f.write(c)
