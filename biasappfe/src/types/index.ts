export interface User {
  id: number
  name: string
  username: string
  phone: string
  role_id: number | null
  password?: string
  created_at: string
  updated_at: string
}

export interface Role {
  id: number
  name: string
  created_at: string
  deleted_at: string | null
}

export interface Permission {
  id: number
  module_id: number | null
  name: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Module {
  id: number
  name: string
  is_active: boolean
  created_at: string
  deleted_at: string | null
}

export interface Customer {
  id: number
  company_name: string
  name: string
  email: string
  phone: string
  address: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Technician {
  id: number
  name: string
  phone: string
  created_at: string
  deleted_at: string | null
}

export interface UnitType {
  id: number
  name: string
  slug: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Brand {
  id: number
  name: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface PaperSize {
  id: number
  name: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface PaperType {
  id: number
  name: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ProductCategory {
  id: number
  name: string
  slug: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Product {
  id: number
  name: string
  sku: string
  category_id: number | null
  brand_id: number | null
  price: number
  stock: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Unit {
  id: number
  name: string
  brand_id: number | null
  unit_type_id: number | null
  model: string
  serial_no: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Warranty {
  id: number
  warranty_type: string
  duration: number
  start_date: string
  end_date: string
  status: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface TableColumn {
  key: string
  label: string
  sortable?: boolean
  width?: string
}

export interface MenuItem {
  label: string
  icon: string
  route: string
}

export interface MenuGroup {
  title: string
  items: MenuItem[]
}
