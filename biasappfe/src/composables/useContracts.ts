import { useContractsStore } from "@/stores/contracts.store";

export function useContracts() {
  return useContractsStore();
}
