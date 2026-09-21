import { ref } from 'vue'
import type { Module } from '@/types'

const modules = ref<Module[]>([])

export function useModules() {
  function addModule(mod: Module) {
    modules.value.push(mod)
  }

  function updateModule(id: number, data: Partial<Module>) {
    const idx = modules.value.findIndex(m => m.id === id)
    if (idx >= 0) modules.value[idx] = { ...modules.value[idx], ...data }
  }

  function removeModule(id: number) {
    modules.value = modules.value.filter(m => m.id !== id)
  }

  return {
    modules,
    addModule,
    updateModule,
    removeModule,
  }
}
