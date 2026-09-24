import re

with open('src/types/index.ts', 'r', encoding='utf-8') as f:
    c = f.read()

rental_item_replacement = """export interface RentalItem {
  id: string
  rental_id: string
  unit_id: string | null
  product_id: string | null
  qty: number
  monthly_rent: number
  start_meter_bw: number
  start_meter_color: number
  free_quota_color: number
  total_rent: number
  unit?: Unit | null
  product?: any | null
  rates?: RentalItemRate[]
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface RentalItemRate {
  id?: string
  rental_item_id?: string
  paper_size_id: string
  paper_size?: any
  rate_per_page_bw: number
  rate_per_page_color: number
}"""

c = re.sub(r'export interface RentalItem \{[^}]*\}', rental_item_replacement, c)

with open('src/types/index.ts', 'w', encoding='utf-8') as f:
    f.write(c)
