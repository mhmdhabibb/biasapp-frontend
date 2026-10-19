import { useResourcesStore } from "@/stores/resources.store";
import type { Module } from "@/types";
import { ref } from "vue";

const modules = ref<Module[]>([]);

function toModuleArray(items: unknown): Module[] {
  if (Array.isArray(items)) return items as Module[];
  if (items && typeof items === "object" && Array.isArray((items as any).data)) {
    return (items as any).data as Module[];
  }
  return [];
}

export function useModules() {
  const resources = useResourcesStore();
  resources.fetchAll("modules").then((items) => {
    modules.value = toModuleArray(items);
  }).catch(() => {
    modules.value = [];
  });

  async function addModule(mod: Module) {
    await resources.create(
      "modules",
      mod as unknown as Record<string, unknown>,
    );
    await resources.fetchAll("modules").then((items) => {
      modules.value = toModuleArray(items);
    });
  }

  async function updateModule(id: number, data: Partial<Module>) {
    await resources.update(
      "modules",
      String(id),
      data as unknown as Record<string, unknown>,
    );
    await resources.fetchAll("modules").then((items) => {
      modules.value = toModuleArray(items);
    });
  }

  async function removeModule(id: number) {
    await resources.remove("modules", String(id));
    await resources.fetchAll("modules").then((items) => {
      modules.value = toModuleArray(items);
    });
  }

  return {
    modules,
    addModule,
    updateModule,
    removeModule,
  };
}
