import os

entities = [
    {"name": "Supplier", "var": "supplier", "varPlural": "suppliers", "path": "master/SuppliersPage.vue", "route": "/suppliers", "fields": [{"key":"name","label":"Name"}, {"key":"phone","label":"Phone"}, {"key":"email","label":"Email"}]},
    {"name": "Contract", "var": "contract", "varPlural": "contracts", "path": "master/ContractsPage.vue", "route": "/contracts", "fields": [{"key":"contract_no","label":"Contract No"}, {"key":"status","label":"Status"}]},
    {"name": "SystemSetting", "var": "systemSetting", "varPlural": "systemSettings", "path": "master/SystemSettingsPage.vue", "route": "/system-settings", "fields": [{"key":"key","label":"Key"}, {"key":"value","label":"Value"}]},
    {"name": "Notification", "var": "notification", "varPlural": "notifications", "path": "master/NotificationsPage.vue", "route": "/notifications", "fields": [{"key":"title","label":"Title"}, {"key":"message","label":"Message"}]},
]

types_content = ""
for e in entities:
    types_content += f"""
export interface {e['name']} {{
  id: string | number
  created_at: string
  updated_at: string
}}
"""
with open("src/types/index.ts", "a") as f:
    f.write(types_content)

for e in entities:
    # Service
    srv = f"""import type {{ {e['name']} }} from "@/types";
import {{ api, type ApiResponse, type PaginatedResponse }} from "./api";

export const {e['var']}Service = {{
  list() {{
    return api.get<PaginatedResponse<{e['name']}>>("{e['route']}/?page=1&limit=100");
  }},
  create(data: Partial<{e['name']}>) {{
    return api.post<ApiResponse<null>>("{e['route']}/", data);
  }},
  update(id: string, data: Partial<{e['name']}>) {{
    return api.put<ApiResponse<null>>(`{e['route']}/${{id}}`, data);
  }},
  remove(id: string) {{
    return api.delete<ApiResponse<null>>(`{e['route']}/${{id}}`);
  }},
}};
"""
    with open(f"src/services/{e['var']}.service.ts", "w") as f:
        f.write(srv)

    # Store
    store = f"""import {{ ApiError }} from "@/services/api";
import {{ {e['var']}Service }} from "@/services/{e['var']}.service";
import type {{ {e['name']} }} from "@/types";
import {{ ref }} from "vue";

const {e['varPlural']} = ref<{e['name']}[]>([]);
const isLoading = ref(false);
const error = ref("");

export function use{e['name']}sStore() {{
  async function fetchAll() {{
    isLoading.value = true;
    error.value = "";
    try {{
      {e['varPlural']}.value = (await {e['var']}Service.list()).data;
    }} catch (reason) {{
      error.value = reason instanceof ApiError ? reason.message : "Gagal memuat data";
    }} finally {{
      isLoading.value = false;
    }}
  }}

  async function create(data: Partial<{e['name']}>) {{
    await {e['var']}Service.create(data);
    await fetchAll();
  }}

  async function update(id: string, data: Partial<{e['name']}>) {{
    await {e['var']}Service.update(id, data);
    await fetchAll();
  }}

  async function remove(id: string) {{
    await {e['var']}Service.remove(id);
    await fetchAll();
  }}

  return {{ {e['varPlural']}, isLoading, error, fetchAll, create, update, remove }};
}}
"""
    with open(f"src/stores/{e['varPlural']}.store.ts", "w") as f:
        f.write(store)

    # Composable
    comp = f"""import {{ use{e['name']}sStore }} from "@/stores/{e['varPlural']}.store";

export function use{e['name']}s() {{
  return use{e['name']}sStore();
}}
"""
    with open(f"src/composables/use{e['name']}s.ts", "w") as f:
        f.write(comp)

    # Vue Page
    page = f"""<script setup lang="ts">
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import type {{ {e['name']}, TableColumn }} from '@/types'
import {{ reactive, ref }} from 'vue'
import {{ use{e['name']}s }} from '@/composables/use{e['name']}s'

const columns: TableColumn[] = [
"""
    for fld in e['fields']:
        page += f"  {{ key: '{fld['key']}', label: '{fld['label']}' }},\n"
    page += f"""]

const {{ {e['varPlural']}: data, fetchAll, create, update, remove, error }} = use{e['name']}s()
fetchAll()
const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<{e['name']} | null>(null)
const deletingItem = ref<{e['name']} | null>(null)
const form = reactive<any>({{}})

function openAdd() {{
  editingItem.value = null
  for (let k in form) form[k] = ''
  showModal.value = true
}}

function openEdit(item: {e['name']}) {{
  editingItem.value = item
  Object.assign(form, item)
  showModal.value = true
}}

async function handleSubmit() {{
  if (editingItem.value) {{
    await update(String(editingItem.value.id), form)
  }} else {{
    await create(form)
  }}
  showModal.value = false
}}

function openDelete(item: {e['name']}) {{ deletingItem.value = item; showConfirm.value = true }}
async function handleDelete() {{
  if (deletingItem.value) await remove(String(deletingItem.value.id))
  showConfirm.value = false
}}
</script>

<template>
  <div>
    <PageHeader title="{e['name']}s" button-label="Add {e['name']}" @add="openAdd" />
    <div v-if="error" class="page-error" role="alert">{{{{ error }}}}</div>
    <DataTable :columns="columns" :data="data" search-placeholder="Cari..." @edit="openEdit" @delete="openDelete" />
    <FormModal :open="showModal" :title="editingItem ? 'Edit {e['name']}' : 'Add {e['name']}'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group" v-for="col in columns" :key="col.key">
        <label class="form-label">{{{{ col.label }}}}</label>
        <input v-model="form[col.key]" type="text" class="form-input">
      </div>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Hapus {e['name']}" message="Yakin ingin menghapus item ini?" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>
"""
    with open(f"src/pages/{e['path']}", "w") as f:
        f.write(page)
