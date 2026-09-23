import { useResourcesStore } from "@/stores/resources.store";
import type { Module } from "@/types";
import { ref } from "vue";

const modules = ref<Module[]>([]);

export function useModules() {
  const resources = useResourcesStore();
  resources.fetchAll("modules").then((items) => {
    modules.value = items as unknown as Module[];
  });

  async function addModule(mod: Module) {
    await resources.create(
      "modules",
      mod as unknown as Record<string, unknown>,
    );
    await resources.fetchAll("modules").then((items) => {
      modules.value = items as unknown as Module[];
    });
  }

  async function updateModule(id: number, data: Partial<Module>) {
    await resources.update(
      "modules",
      String(id),
      data as unknown as Record<string, unknown>,
    );
    await resources.fetchAll("modules").then((items) => {
      modules.value = items as unknown as Module[];
    });
  }

  async function removeModule(id: number) {
    await resources.remove("modules", String(id));
    await resources.fetchAll("modules").then((items) => {
      modules.value = items as unknown as Module[];
    });
  }

  return {
    modules,
    addModule,
    updateModule,
    removeModule,
  };
}
