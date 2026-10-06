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
  async function fetchAll(
    name: ResourceName,
    query?: ResourceQuery,
    tracksLoading = true,
  ) {
    // tracksLoading=false (silent/background refresh) tidak boleh menyentuh
    // flag loading agar tidak memicu spinner/skeleton di UI.
    if (tracksLoading) loading[name] = true;
    if (tracksLoading) errors[name] = "";
    try {
      data[name] = (await resources[name].list(query, tracksLoading)).data;
      return data[name];
    } catch (reason) {
      if (tracksLoading) {
        errors[name] =
          reason instanceof ApiError
            ? reason.message
            : "Failed to load data from the server";
      }
      return [];
    } finally {
      if (tracksLoading) loading[name] = false;
    }
  }

  /** Silent refresh: update data tanpa efek loading/skeleton/error. */
  async function fetchAllSilent(name: ResourceName, query?: ResourceQuery) {
    return fetchAll(name, query, false);
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
    fetchAllSilent,
    fetchAllDomains,
    create,
    update,
    remove,
  };
}
