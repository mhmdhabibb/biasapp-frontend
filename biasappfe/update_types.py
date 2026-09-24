import re

with open('src/types/index.ts', 'r', encoding='utf-8') as f:
    c = f.read()

unit_replacement = """export interface Unit {
  id: string
  name: string
  brand_id: string | null
  type_id: string | null
  model: string
  serial_no: string
  is_copier?: boolean
  current_meter_bw?: number
  current_meter_color?: number
  free_quota_color?: number
  rates?: UnitRate[]
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface UnitRate {
  id?: string
  unit_id?: string
  paper_size_id: string
  paper_size?: any
  rate_per_page_bw: number
  rate_per_page_color: number
}"""

c = re.sub(r'export interface Unit \{[^}]*\}', unit_replacement, c)

contract_item_replacement = """export interface ContractItem {
  id: string | number
  contract_no: string
  unit_id: string | number | null
  customer_id: string | number | null
  start_date: string
  end_date: string
  placement_location: string
  monthly_rent_fee: number
  free_copy_quota: number
  start_mono_value: number
  start_color_value: number
  rates?: ContractItemRate[]
  is_complete: boolean
  status: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ContractItemRate {
  id?: string
  contract_item_id?: string
  paper_size_id: string
  paper_size?: any
  rate_per_page_bw: number
  rate_per_page_color: number
}"""

c = re.sub(r'export interface ContractItem \{[^}]*\}', contract_item_replacement, c)


with open('src/types/index.ts', 'w', encoding='utf-8') as f:
    f.write(c)
