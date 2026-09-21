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

export interface ContractItem {
  id: number
  contract_no: string
  unit_id: number | null
  customer_id: number | null
  start_date: string
  end_date: string
  placement_location: string
  monthly_rent_fee: number
  free_copy_quota: number
  start_mono_value: number
  start_color_value: number
  rate_per_page_mono: number
  rate_per_page_color: number
  is_complete: boolean
  status: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ServiceReport {
  id: number
  service_report_no: string
  contract_item_id: number | null
  customer_id: number | null
  service_type: string
  technician_id: number | null
  visit_date: string
  time_in: string
  time_out: string
  machine_problem: string
  repair_action: string
  status: string
  project_name: string
  is_chargeable: boolean
  reading_counter: number
  is_complete: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface MonthlyMeterReading {
  id: number
  service_report_id: number | null
  contract_item_id: number | null
  period: string
  counter_mono_start: number
  counter_mono_end: number
  counter_color_start: number
  counter_color_end: number
  color_mode: string
  total_usage: number
  total_amount: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Sale {
  id: number
  customer_id: number | null
  sale_date: string
  subtotal: number
  service_charge: number
  tax: number
  total: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface SaleItem {
  id: number
  sale_id: number | null
  product_id: number | null
  qty: number
  unit_price: number
  total_price: number
  created_at: string
  updated_at: string
}

export interface RentalInvoice {
  id: number
  contract_item_id: number | null
  invoice_no: string
  customer_id: number | null
  period_start: string
  period_end: string
  monthly_date: string
  due_date: string
  basis_rental_fee: number
  excess_amount: number
  subtotal: number
  tax: number
  total_pay: number
  status: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface RentalInvoiceMotorDetail {
  id: number
  rental_invoice_id: number | null
  start_meter_reading: number
  last_meter_reading: number
  free_copy: number
  total_usage: number
  price_per_page: number
  total_amount: number
}

export interface SalesInvoice {
  id: number
  invoice_no: string
  customer_id: number | null
  sale_id: number | null
  due_date: string
  subtotal: number
  service_charge: number
  tax: number
  total: number
  status: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface SalesInvoiceItem {
  id: number
  sales_invoice_id: number | null
  product_id: number | null
  qty: number
  price: number
  total_price: number
  created_at: string
  updated_at: string
}

export interface Payment {
  id: number
  payment_no: string
  rental_invoice_id: number | null
  customer_id: number | null
  payment_date: string
  amount: number
  tax_deduction: number
  balance: number
  reference_no: string
  created_at: string
  updated_at: string
}

export interface WarrantyClaim {
  id: number
  warranty_id: number | null
  service_report_id: number | null
  claim_date: string
  issue_description: string
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
