import { ApiError } from "@/services/api";
import { contractService } from "@/services/contract.service";
import type { Contract } from "@/types";
import { ref } from "vue";

const contracts = ref<Contract[]>([]);
const isLoading = ref(false);
const error = ref("");

export function useContractsStore() {
  async function fetchAll() {
    isLoading.value = true;
    error.value = "";
    try {
      contracts.value = (await contractService.list()).data;
    } catch (reason) {
      error.value = reason instanceof ApiError ? reason.message : "Gagal memuat data";
    } finally {
      isLoading.value = false;
    }
  }

  async function create(data: Partial<Contract>) {
    await contractService.create(data);
    await fetchAll();
  }

  async function update(id: string, data: Partial<Contract>) {
    await contractService.update(id, data);
    await fetchAll();
  }

  async function remove(id: string) {
    await contractService.remove(id);
    await fetchAll();
  }

  return { contracts, isLoading, error, fetchAll, create, update, remove };
}
