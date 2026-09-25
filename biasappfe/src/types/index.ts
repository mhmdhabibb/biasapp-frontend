export interface User {
  id: string | number
  name: string
  username: string
  phone: string
  role_id: string | number | null
  password?: string
  created_at: string
  updated_at: string
}

export interface Role {
  id: string | number
  name: string
  permissions?: any[]
  created_at: string
  deleted_at: string | null
}

export interface Permission {
  id: string | number
  module_id: string | number | null
  name: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Module {
  id: string | number
  name: string
  is_active: boolean
  created_at: string
  deleted_at: string | null
}

export interface Customer {
  id: string | number
  company_name: string
  pic_name: string
  pic_gender?: string
  pic_position?: string
  phone: string
  fax?: string
  email?: string
  name?: string
  address: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Technician {
  id: string | number
  name: string
  phone: string
  created_at: string
  deleted_at: string | null
}

export interface UnitType {
  id: string | number
  name: string
  slug: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Brand {
  id: string | number
  name: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface PaperSize {
  id: string | number
  name: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface PaperType {
  id: string | number
  name: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ProductCategory {
  id: string | number
  name: string
  slug: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Product {
  id: string | number
  name: string
  sku: string
  category_id: string | number | null
  brand_id: string | number | null
  price: number
  stock: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Unit {
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
}

export interface Warranty {
  id: string | number
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
}

export interface ServiceReport {
  id: string | number
  report_no: string
  unit_id: string | null
  customer_id: string | null
  service_type: string
  technician_id: string | null
  project_name: string
  reading_period: string
  service_date: string
  time_in: string
  time_out: string
  machine_problem: string
  repair_action: string
  remarks?: string
  is_tested: boolean
  is_completed: boolean
  status: string
  service_report_no?: string
  contract_item_id?: string | null
  visit_date?: string
  is_chargeable?: boolean
  reading_counter?: number
  is_complete?: boolean
  inspection_result?: string
  notes?: string
  testing_confirmed?: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface MonthlyMeterReading {
  id: string | number
  service_report_id: string | null
  contract_item_id: string | null
  unit_id: string | null
  paper_size_id: string | null
  color_mode: string
  start_meter: number
  end_meter: number
  total_usage: number
  period?: string
  counter_mono_start?: number
  counter_mono_end?: number
  counter_color_start?: number
  counter_color_end?: number
  total_amount?: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Sale {
  id: string | number
  sale_no: string
  customer_id: string | null
  sale_date: string
  total_amount: number
  status: string
  subtotal?: number
  service_charge?: number
  tax?: number
  total?: number
  sale_items?: SaleItem[]
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface SaleItem {
  id: string | number
  sale_id: string | number | null
  product_id: string | number | null
  qty: number
  unit_price: number
  total_price: number
  created_at: string
  updated_at: string
}

export interface RentalInvoice {
  id: string | number
  contract_item_id: string | number | null
  invoice_no: string
  customer_id: string | number | null
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
  id: string | number
  rental_invoice_id: string | number | null
  start_meter_reading: number
  last_meter_reading: number
  free_copy: number
  total_usage: number
  price_per_page: number
  total_amount: number
}

export interface SalesInvoice {
  id: string | number
  invoice_no: string
  customer_id: string | number | null
  sale_id: string | number | null
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
  id: string | number
  sales_invoice_id: string | number | null
  product_id: string | number | null
  qty: number
  price: number
  total_price: number
  created_at: string
  updated_at: string
}

export interface Payment {
  id: string | number
  payment_no: string
  rental_invoice_id: string | number | null
  customer_id: string | number | null
  payment_date: string
  amount: number
  tax_deduction: number
  balance: number
  reference_no: string
  created_at: string
  updated_at: string
}

export interface WarrantyClaim {
  id: string | number
  warranty_id: string | number | null
  service_report_id: string | number | null
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

export interface SparepartRequest {
  id: string | number
  request_no: string
  service_report_id: string | number | null
  product_id: string | number | null
  qty: number
  status: string
  created_at: string
  updated_at: string
}

export interface Indent {
  id: string | number
  indent_no: string
  sparepart_request_id: string | number | null
  product_id: string | number | null
  qty: number
  status: string
  created_at: string
  updated_at: string
}

export interface DeliveryOrder {
  id: string | number
  delivery_no: string
  contract_item_id: string | number | null
  customer_id: string | number | null
  delivery_date: string
  status: string
  assigned_to: number | null
  created_at: string
  updated_at: string
}

export interface PurchaseOrder {
  id: string | number
  po_no: string
  sparepart_request_id: string | number | null
  po_date: string
  status: string
  created_at: string
  updated_at: string
}

export interface PurchaseOrderItem {
  id: string | number
  purchase_order_id: string | number | null
  product_id: string | number | null
  qty: number
  unit_price: number
  total_price: number
  created_at: string
  updated_at: string
}

export interface ProcurementDeliveryOrder {
  id: string | number
  do_number: string
  purchase_order_id: string | number | null
  do_date: string
  status: string
  receiver_name: string
  notes: string
  created_at: string
  updated_at: string
}

export interface ProcurementDOItem {
  id: string | number
  procurement_delivery_order_id: string | number | null
  purchase_order_item_id: string | number | null
  product_id: string | number | null
  deliver_qty: number
  created_at: string
  updated_at: string
}

export interface Supplier {
  id: string | number
  created_at: string
  updated_at: string
}

export interface Contract {
  id: string | number
  created_at: string
  updated_at: string
}

export interface SystemSetting {
  id: string | number
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string | number
  created_at: string
  updated_at: string
}
