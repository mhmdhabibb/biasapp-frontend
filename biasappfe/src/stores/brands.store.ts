import { ApiError } from "@/services/api";
import { brandService } from "@/services/brand.service";
import type { Brand } from "@/types";
import { ref } from "vue";

const brands = ref<Brand[]>([]);
const isLoading = ref(false);
const error = ref("");

export function useBrandsStore() {
  async function fetchAll() {
    isLoading.value = true;
    error.value = "";
    try {
      brands.value = (await brandService.list()).data;
    } catch (reason) {
      error.value =
        reason instanceof ApiError ? reason.message : "Gagal memuat data brand";
    } finally {
      isLoading.value = false;
    }
  }

  async function create(name: string) {
    await brandService.create({ name });
    await fetchAll();
  }

  async function update(id: string, name: string) {
    await brandService.update(id, { name });
    await fetchAll();
  }

  async function remove(id: string) {
    await brandService.remove(id);
    await fetchAll();
  }

  return { brands, isLoading, error, fetchAll, create, update, remove };
}
