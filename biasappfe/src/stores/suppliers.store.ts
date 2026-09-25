import { ApiError } from "@/services/api";
import { supplierService } from "@/services/supplier.service";
import type { Supplier } from "@/types";
import { ref } from "vue";

const suppliers = ref<Supplier[]>([]);
const isLoading = ref(false);
const error = ref("");

export function useSuppliersStore() {
  async function fetchAll() {
    isLoading.value = true;
    error.value = "";
    try {
      suppliers.value = (await supplierService.list()).data;
    } catch (reason) {
      error.value = reason instanceof ApiError ? reason.message : "Gagal memuat data";
    } finally {
      isLoading.value = false;
    }
  }

  async function create(data: Partial<Supplier>) {
    await supplierService.create(data);
    await fetchAll();
  }

  async function update(id: string, data: Partial<Supplier>) {
    await supplierService.update(id, data);
    await fetchAll();
  }

  async function remove(id: string) {
    await supplierService.remove(id);
    await fetchAll();
  }

  return { suppliers, isLoading, error, fetchAll, create, update, remove };
}
