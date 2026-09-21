import { ref } from 'vue'
import type { Brand } from '@/types'

const brands = ref<Brand[]>([
  { id: 1, name: 'Canon', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null },
  { id: 2, name: 'HP', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null },
  { id: 3, name: 'Epson', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null },
])

export function useBrands() {
  return { brands }
}
