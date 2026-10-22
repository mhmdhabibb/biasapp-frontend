import { ApiError } from "@/services/api";
import { contractService, type ContractListParams } from "@/services/contract.service";
import type { Contract, PaginatedResponse } from "@/types";
import { ref } from "vue";
import { debounce } from "@/utils/requestCache";

const contracts = ref<Contract[]>([]);
const isLoading = ref(false);
const error = ref("");
const totalItems = ref(0);
const totalPages = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const searchQuery = ref("");

export function useContractsStore() {
  async function fetchAll(params: Partial<ContractListParams> = {}) {
    isLoading.value = true;
    error.value = "";
    try {
      const queryParams: ContractListParams = {
        page: params.page ?? currentPage.value,
        limit: params.limit ?? pageSize.value,
        search: params.search ?? searchQuery.value,
        orderBy: params.orderBy,
        orderDir: params.orderDir,
      };
      const response = await contractService.list(queryParams);
      contracts.value = response.data;
      totalItems.value = response.meta?.total_items ?? 0;
      totalPages.value = response.meta?.total_pages ?? 0;
      currentPage.value = response.meta?.page ?? 1;
    } catch (reason) {
      error.value = reason instanceof ApiError ? reason.message : "Failed to load data";
    } finally {
      isLoading.value = false;
    }
  }

  const debouncedFetch = debounce((params: Partial<ContractListParams>) => {
    fetchAll(params);
  }, 300);

  function setSearch(query: string) {
    searchQuery.value = query;
    currentPage.value = 1;
    debouncedFetch({ search: query });
  }

  function setPage(page: number) {
    currentPage.value = page;
    fetchAll({ page });
  }

  function setPageSize(size: number) {
    pageSize.value = size;
    currentPage.value = 1;
    fetchAll({ limit: size });
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

  async function hardRemove(id: string) {
    await contractService.hardRemove(id);
    await fetchAll();
  }

  async function renew(id: string, data: { end_date: string }) {
    await contractService.renew(id, data);
    await fetchAll();
  }

  return {
    contracts,
    isLoading,
    error,
    totalItems,
    totalPages,
    currentPage,
    pageSize,
    searchQuery,
    fetchAll,
    setSearch,
    setPage,
    setPageSize,
    create,
    update,
    remove,
    hardRemove,
    renew,
  };
}
