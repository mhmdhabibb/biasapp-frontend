import { ApiError } from "@/services/api";
import {
  resources,
  type ResourceQuery,
  type ResourceRecord,
} from "@/services/resource.service";
import { reactive, ref } from "vue";

export type ResourceName = keyof typeof resources;

const data = reactive<Partial<Record<ResourceName, ResourceRecord[]>>>({});
const loading = reactive<Partial<Record<ResourceName, boolean>>>({});
const errors = reactive<Partial<Record<ResourceName, string>>>({});
const initialized = ref(false);

export function useResourcesStore() {
  async function fetchAll(name: ResourceName, query?: ResourceQuery) {
    loading[name] = true;
    errors[name] = "";
    try {
      data[name] = (await resources[name].list(query)).data;
      return data[name];
    } catch (reason) {
      errors[name] =
        reason instanceof ApiError
          ? reason.message
          : "Gagal memuat data dari server";
      return [];
    } finally {
      loading[name] = false;
    }
  }

  async function create(name: ResourceName, payload: Partial<ResourceRecord>) {
    const response = await resources[name].create(payload);
    await fetchAll(name);
    return response.data;
  }

  async function update(
    name: ResourceName,
    id: string,
    payload: Partial<ResourceRecord>,
  ) {
    const response = await resources[name].update(id, payload);
    await fetchAll(name);
    return response.data;
  }

  async function remove(name: ResourceName, id: string) {
    await resources[name].remove(id);
    await fetchAll(name);
  }

  async function fetchAllDomains() {
    await Promise.all(
      Object.keys(resources).map((name) => fetchAll(name as ResourceName)),
    );
    initialized.value = true;
  }

  function records(name: ResourceName) {
    return data[name] || [];
  }

  return {
    data,
    loading,
    errors,
    initialized,
    records,
    fetchAll,
    fetchAllDomains,
    create,
    update,
    remove,
  };
}
