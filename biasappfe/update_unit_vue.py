import re

with open('src/pages/master/UnitPage.vue', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Fetching paperSizes
c = c.replace("const unitTypes = ref<{id: string, name: string}[]>([])", 
              "const unitTypes = ref<{id: string, name: string}[]>([])\nconst paperSizes = ref<{id: string, name: string}[]>([])")
c = c.replace("const typeOptions = computed(() => unitTypes.value.map(t => ({ value: t.id, label: t.name })))", 
              "const typeOptions = computed(() => unitTypes.value.map(t => ({ value: t.id, label: t.name })))\nconst paperSizeOptions = computed(() => paperSizes.value.map(p => ({ value: p.id, label: p.name })))")

c = c.replace("const [resUnits, resBrands, resTypes] = await Promise.all([", 
              "const [resUnits, resBrands, resTypes, resPaperSizes] = await Promise.all([")
c = c.replace("resources.unitTypes.list()\n    ])", 
              "resources.unitTypes.list(),\n      resources.paperSizes.list()\n    ])")
c = c.replace("unitTypes.value = resTypes.data as any", 
              "unitTypes.value = resTypes.data as any\n    paperSizes.value = resPaperSizes.data as any")

# 2. Update form state
form_old = """const form = reactive({
  serial_no: '',
  brand_id: null as string | null,
  type_id: null as string | null,
  model: '',
  name: '', // Added just in case backend expects it despite missing in DTO
  current_meter_bw: 0,
  current_meter_color: 0,
  rate_per_page_bw_a4: 0,
  rate_per_page_color_a4: 0,
  rate_per_page_bw_a3: 0,
  rate_per_page_color_a3: 0,
  free_quota_color: 0,
})"""

form_new = """const form = reactive({
  serial_no: '',
  brand_id: null as string | null,
  type_id: null as string | null,
  model: '',
  name: '', 
  is_copier: false,
  current_meter_bw: 0,
  current_meter_color: 0,
  free_quota_color: 0,
  rates: [] as { paper_size_id: string; rate_per_page_bw: number; rate_per_page_color: number }[],
})

function addRate() {
  form.rates.push({ paper_size_id: '', rate_per_page_bw: 0, rate_per_page_color: 0 })
}

function removeRate(index: number) {
  form.rates.splice(index, 1)
}"""

c = c.replace(form_old, form_new)

# 3. Update openAdd and openEdit
openadd_old = """function openAdd() {
  editingItem.value = null
  Object.assign(form, { serial_no: '', brand_id: null, type_id: null, model: '', name: '', current_meter_bw: 0, current_meter_color: 0, rate_per_page_bw_a4: 0, rate_per_page_color_a4: 0, rate_per_page_bw_a3: 0, rate_per_page_color_a3: 0, free_quota_color: 0 })
  showModal.value = true
}"""

openadd_new = """function openAdd() {
  editingItem.value = null
  Object.assign(form, { serial_no: '', brand_id: null, type_id: null, model: '', name: '', is_copier: false, current_meter_bw: 0, current_meter_color: 0, free_quota_color: 0, rates: [] })
  showModal.value = true
}"""

openedit_old = """function openEdit(item: any) {
  editingItem.value = item
  Object.assign(form, {
    serial_no: item.serial_no,
    brand_id: item.brand_id,
    type_id: item.type_id,
    model: item.model,
    name: item.name || '',
    current_meter_bw: item.current_meter_bw || 0,
    current_meter_color: item.current_meter_color || 0,
    rate_per_page_bw_a4: item.rate_per_page_bw_a4 || item.rate_per_page_bw || 0,
    rate_per_page_color_a4: item.rate_per_page_color_a4 || item.rate_per_page_color || 0,
    rate_per_page_bw_a3: item.rate_per_page_bw_a3 || 0,
    rate_per_page_color_a3: item.rate_per_page_color_a3 || 0,
    free_quota_color: item.free_quota_color || 0,
  })
  showModal.value = true
}"""

openedit_new = """function openEdit(item: any) {
  editingItem.value = item
  Object.assign(form, {
    serial_no: item.serial_no,
    brand_id: item.brand_id,
    type_id: item.type_id,
    model: item.model,
    name: item.name || '',
    is_copier: !!item.is_copier,
    current_meter_bw: item.current_meter_bw || 0,
    current_meter_color: item.current_meter_color || 0,
    free_quota_color: item.free_quota_color || 0,
    rates: Array.isArray(item.rates) ? item.rates.map((r: any) => ({
      paper_size_id: r.paper_size_id,
      rate_per_page_bw: r.rate_per_page_bw,
      rate_per_page_color: r.rate_per_page_color
    })) : [],
  })
  showModal.value = true
}"""

c = c.replace(openadd_old, openadd_new)
c = c.replace(openedit_old, openedit_new)

# 4. Update Template
template_old = """      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
        <div class="form-group">
          <label class="form-label">Current BW Meter</label>
          <input v-model.number="form.current_meter_bw" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">Current Color Meter</label>
          <input v-model.number="form.current_meter_color" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">Rate Per Page BW A4</label>
          <input v-model.number="form.rate_per_page_bw_a4" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">Rate Per Page Color A4</label>
          <input v-model.number="form.rate_per_page_color_a4" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">Rate Per Page BW A3</label>
          <input v-model.number="form.rate_per_page_bw_a3" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">Rate Per Page Color A3</label>
          <input v-model.number="form.rate_per_page_color_a3" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">Free Quota Color</label>
          <input v-model.number="form.free_quota_color" type="number" class="form-input" min="0">
        </div>
      </div>"""

template_new = """      <div class="form-group" style="margin-top: 1rem;">
        <label class="form-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
          <input type="checkbox" v-model="form.is_copier" style="width: 1rem; height: 1rem;" />
          Adalah Mesin Fotocopy
        </label>
      </div>

      <div v-if="form.is_copier" style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
        <h4 style="margin-bottom: 1rem; font-weight: 600;">Data Mesin Fotocopy</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label class="form-label">Current BW Meter</label>
            <input v-model.number="form.current_meter_bw" type="number" class="form-input" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">Current Color Meter</label>
            <input v-model.number="form.current_meter_color" type="number" class="form-input" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">Free Quota Color</label>
            <input v-model.number="form.free_quota_color" type="number" class="form-input" min="0">
          </div>
        </div>

        <div style="margin-top: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <label class="form-label" style="margin: 0;">Daftar Harga Kertas (Rates)</label>
            <button type="button" @click="addRate" class="btn btn-secondary btn-sm" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">+ Tambah Harga</button>
          </div>
          
          <div v-for="(rate, index) in form.rates" :key="index" style="display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center; background: var(--bg-color); padding: 0.5rem; border-radius: 8px; border: 1px solid var(--border-color);">
            <div>
              <CustomSelect v-model="rate.paper_size_id" :options="paperSizeOptions" placeholder="Pilih Ukuran" />
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
        </div>
      </div>"""

c = c.replace(template_old, template_new)

with open('src/pages/master/UnitPage.vue', 'w', encoding='utf-8') as f:
    f.write(c)
