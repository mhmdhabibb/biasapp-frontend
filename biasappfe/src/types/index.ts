export interface User {
  id: string | number;
  name: string;
  username: string;
  phone: string;
  role_id: string | number | null;
  password?: string;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string | number;
  name: string;
  permissions?: any[];
  created_at: string;
  deleted_at: string | null;
}

export interface Permission {
  id: string | number;
  module_id: string | number | null;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Module {
  id: string | number;
  name: string;
  slug?: string;
  is_active: boolean;
  created_at: string;
  deleted_at: string | null;
}

export interface Customer {
  id: string | number;
  category: string;
  company_name: string;
  pic_name: string;
  pic_gender?: string;
  pic_position?: string;
  nip?: string;
  phone: string;
  fax?: string;
  email?: string;
  name?: string;
  address: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Technician {
  user: any;
  id: string | number;
  name: string;
  phone: string;
  created_at: string;
  deleted_at: string | null;
}

export interface UnitType {
  id: string | number;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Brand {
  id: string | number;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PaperSize {
  id: string | number;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PaperType {
  id: string | number;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProductCategory {
  id: string | number;
  name: string;
  slug?: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface UOM {
  id: string | number;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Product {
  id: string | number;
  name: string;
  sku: string;
  category_id: string | number | null;
  category?: ProductCategory | null;
  brand_id: string | number | null;
  uom_id: string | number | null;
  uom?: UOM | null;
  price: number;
  stock: number;
  is_computer?: boolean;
  is_sparepart?: boolean;
  specs?: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Unit {
  id: string;
  name: string;
  brand_id: string | null;
  brand?: any;
  type_id: string | null;
  type?: any;
  uom_id?: string | null;
  uom?: UOM | null;
  model: string;
  serial_no: string;
  status?: string;
  is_copier?: boolean;
  current_meter_bw?: number;
  current_meter_color?: number;
  free_quota_color?: number;
  rates?: UnitRate[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface UnitRate {
  id?: string;
  unit_id?: string;
  paper_size_id: string;
  paper_size?: any;
  rate_per_page_bw: number;
  rate_per_page_color: number;
}

export interface Warranty {
  id: string | number;
  warranty_no?: string;
  warranty_type: string;
  warranty_types?: string[];
  customer_id?: string | null;
  customer?: Customer | null;
  sale_id?: string | null;
  sale?: Sale | null;
  unit_id?: string | null;
  unit?: Unit | null;
  product_id?: string | null;
  product?: Product | null;
  duration: number;
  duration_months?: number;
  duration_days?: number;
  start_date: string;
  end_date: string;
  terms_conditions?: string;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ContractItem {
  id: string | number;
  contract_no: string;
  unit_id: string | number | null;
  customer_id: string | number | null;
  start_date: string;
  end_date: string;
  placement_location: string;
  monthly_rent_fee: number;
  free_copy_quota: number;
  start_mono_value: number;
  start_color_value: number;
  rates?: ContractItemRate[];
  is_complete: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ContractItemRate {
  id?: string;
  contract_item_id?: string;
  paper_size_id: string;
  paper_size?: any;
  rate_per_page_bw: number;
  rate_per_page_color: number;
}

export interface SurveyAttachment {
  id: string;
  survey_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

export interface Survey {
  id: string;
  survey_no: string;
  customer_id: string | null;
  unit_id: string | null;
  price?: number | null;
  result: string;
  status: string;
  remarks?: string;
  recommended_model?: string;
  photo_location?: string;
  photo_locations?: string[];
  attachments?: SurveyAttachment[];
  technician_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ServiceRequest {
  id: string;
  request_no: string;
  customer_id: string | null;
  customer_category?: 'Corporate' | 'Government' | string;
  unit_id: string | null;
  problem_description: string;
  status: string;
  request_date: string;
  is_external?: boolean;
  external_type?: string;
  external_brand?: string;
  external_model?: string;
  external_serial_no?: string;
  external_note?: string;
  created_at: string;
  updated_at: string;
}

export interface JobOrder {
  id: string;
  job_order_no: string;
  job_type: string;
  customer_category?: 'Corporate' | 'Government' | string;
  service_request_id?: string | null;
  delivery_order_id?: string | null;
  delivery_order?: DeliveryOrder | null;
  service_request?: ServiceRequest | null;
  service_report?: ServiceReport | null;
  customer_id?: string | null;
  customer?: Customer | null;
  customer_name?: string;
  unit_id?: string | null;
  unit?: Unit | null;
  technician_id: string | number | null;
  technician?: Technician | null;
  scheduled_date: string;
  status: string;
  instructions: string;
  assigned_at?: string | null;
  completed_at?: string | null;
  taskType?: 'sr' | 'do' | 'visit' | 'maintenance';
  service_request_no?: string;
  do_number?: string;
  problem?: string;
  created_at: string;
  updated_at: string;
}

export interface SuperadminDashboardStats {
  master_data: {
    customers: { total: number; corporate: number; government: number };
    units: {
      total: number;
      available: number;
      lock: number;
      rented: number;
      sold: number;
      maintenance: number;
      broken: number;
      copier: number;
      computer: number;
      external: number;
    };
    products: {
      total: number;
      spareparts: number;
      computers: number;
      in_stock: number;
      low_or_out_of_stock: number;
    };
    technicians: { total: number; available: number; inactive: number };
    contracts: { total: number; active: number; draft: number; expired: number; terminated: number };
    warranties: { total: number; active: number; expired: number; claimed: number; void: number };
    reference: {
      brands: number;
      unit_types: number;
      product_categories: number;
      uoms: number;
      paper_sizes: number;
      paper_types: number;
      suppliers: number;
      users: number;
      roles: number;
    };
  };
  service: {
    service_requests: {
      total: number;
      pending: number;
      assigned: number;
      in_progress: number;
      completed: number;
      cancelled: number;
      internal: number;
      external: number;
    };
    job_orders: {
      total: number;
      scheduled: number;
      in_progress: number;
      completed: number;
      cancelled: number;
      unassigned: number;
      sla_breached: number;
      by_type: {
        service: number;
        delivery: number;
        visit: number;
        maintenance: number;
        survey: number;
      };
    };
    service_reports: {
      total: number;
      draft: number;
      pending: number;
      assigned: number;
      in_progress: number;
      completed: number;
      cancelled: number;
      corporate: number;
      government: number;
      by_type: {
        regular: number;
        repair: number;
        maintenance: number;
        installation: number;
        emergency: number;
        meter_reading: number;
        copier: number;
        delivery: number;
      };
    };
    surveys: {
      total: number;
      pending: number;
      assigned: number;
      in_progress: number;
      completed: number;
      cancelled: number;
    };
    sparepart_requests: {
      total: number;
      pending: number;
      po_created: number;
      completed: number;
      rejected: number;
    };
    warranty_claims: {
      total: number;
      pending: number;
      approved: number;
      completed: number;
      rejected: number;
    };
    delivery_orders: {
      total: number;
      pending: number;
      in_transit: number;
      delivered: number;
      completed: number;
      cancelled: number;
    };
    rentals: {
      total: number;
      active: number;
      pending: number;
      completed: number;
      cancelled: number;
    };
    monthly_trend: Array<{
      month: string;
      label: string;
      service_requests: number;
      job_orders: number;
      service_reports: number;
      completed_reports: number;
    }>;
  };
  generated_at: string;
}

export interface ServiceReport {
  id: string | number;
  report_no: string;
  unit_id: string | null;
  customer_id: string | null;
  service_type: string;
  technician_id: string | null;
  project_name: string;
  reading_period: string;
  service_date: string;
  time_in: string;
  time_out: string;
  machine_problem: string;
  repair_action: string;
  remarks?: string;
  is_tested: boolean;
  is_completed: boolean;
  status: string;
  service_report_no?: string;
  contract_item_id?: string | null;
  job_order_id?: string | null;
  visit_date?: string;
  is_chargeable?: boolean;
  reading_counter?: number;
  meter_reading_before?: number;
  meter_reading_after?: number;
  is_complete?: boolean;
  inspection_result?: string;
  notes?: string;
  testing_confirmed?: boolean;
  customer_signature?: string | null;
  technician_signature?: string | null;
  customer_name?: string | null;
  technician_name?: string | null;
  customer_signature_copier?: string | null;
  technician_signature_copier?: string | null;
  customer_name_copier?: string | null;
  technician_name_copier?: string | null;
  customer_signature_technical?: string | null;
  technician_signature_technical?: string | null;
  customer_name_technical?: string | null;
  technician_name_technical?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MonthlyMeterReading {
  id: string | number;
  service_report_id: string | null;
  contract_item_id: string | null;
  unit_id: string | null;
  paper_size_id: string | null;
  color_mode: string;
  start_meter: number;
  end_meter: number;
  total_usage: number;
  period?: string;
  counter_mono_start?: number;
  counter_mono_end?: number;
  counter_color_start?: number;
  counter_color_end?: number;
  total_amount?: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Sale {
  id: string | number;
  sale_no: string;
  customer_id: string | null;
  sale_date: string;
  po_no?: string;
  installation_address?: string;
  total_amount: number;
  status: string;
  subtotal?: number;
  service_charge?: number;
  tax?: number;
  discount?: number;
  total?: number;
  sale_items?: SaleItem[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SaleItem {
  id: string | number;
  sale_id: string | number | null;
  product_id: string | number | null;
  qty: number;
  unit_price: number;
  total_price: number;
  created_at: string;
  updated_at: string;
}

export interface RentalInvoice {
  id: string | number;
  contract_item_id: string | number | null;
  invoice_no: string;
  po_no?: string;
  customer_id: string | number | null;
  period_start: string;
  period_end: string;
  monthly_date: string;
  due_date: string;
  basis_rental_fee: number;
  excess_amount: number;
  subtotal: number;
  tax: number;
  total_pay: number;
  status: string;
  payment_status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface RentalInvoiceMotorDetail {
  id: string | number;
  rental_invoice_id: string | number | null;
  start_meter_reading: number;
  last_meter_reading: number;
  free_copy: number;
  total_usage: number;
  price_per_page: number;
  total_amount: number;
}

export interface SalesInvoice {
  id: string | number;
  invoice_no: string;
  customer_id: string | number | null;
  sale_id: string | number | null;
  sale?: Sale;
  po_no?: string;
  due_date: string;
  subtotal: number;
  service_charge: number;
  tax: number;
  discount?: number;
  total: number;
  status: string;
  payment_status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SalesInvoiceItem {
  id: string | number;
  sales_invoice_id: string | number | null;
  product_id: string | number | null;
  qty: number;
  price: number;
  total_price: number;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string | number;
  payment_no: string;
  rental_invoice_id: string | number | null;
  sales_invoice_id?: string | number | null;
  customer_id: string | number | null;
  payment_date: string;
  amount: number;
  tax_deduction: number;
  balance: number;
  bank_name: string;
  reference_no: string;
  sender_name?: string;
  notes?: string;
  status: string;
  user_id?: string | null;
  user?: { id?: string; name?: string; username?: string } | null;
  created_at: string;
  updated_at: string;
}

export interface WarrantyClaim {
  id: string | number;
  warranty_id: string | number | null;
  service_report_id: string | number | null;
  claim_date: string;
  issue_description: string;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  wrap?: boolean;
  nowrap?: boolean;
}

export interface TrackedCustomerSummary {
  customer_id: string;
  company_name: string;
  category: string;
  pic_name: string;
  phone: string;
  email: string;
  address: string;
  relation_types: string[];
  relation_labels: string[];
  activity_count: number;
  total_qty: number;
  latest_status: string;
  latest_ref_no: string;
  latest_location?: string;
  first_interaction?: string | null;
  last_interaction?: string | null;
  is_currently_active: boolean;
}

export interface TrackedActivityItem {
  id: string;
  customer_id: string;
  company_name: string;
  customer_category: string;
  relation_type: string;
  relation_label: string;
  ref_no: string;
  record_id: string;
  date?: string | null;
  end_date?: string | null;
  status: string;
  qty: number;
  unit_price?: number;
  location?: string;
  technician?: string;
  related_unit?: string;
  notes?: string;
}

export interface CustomerTrackingResponse {
  target_kind: "unit" | "product";
  target_id: string;
  target_name: string;
  target_code: string;
  total_customers: number;
  total_activities: number;
  total_qty: number;
  customers: TrackedCustomerSummary[];
  activities: TrackedActivityItem[];
}

export interface MenuItem {
  label: string;
  icon: string;
  route: string;
  /** Restrict this item to specific (normalized) roles. When set, permission checks are skipped (module gate still applies). */
  roles?: string[];
  /** Explicit module key (e.g. "maintenance") that hides this menu when the module is inactive. */
  module?: string;
}

export interface MenuGroup {
  title: string;
  items: MenuItem[];
}

export interface SparepartRequest {
  id: string | number;
  request_no: string;
  group_no?: string | null;
  reference_type?: 'service_report' | 'sale' | 'rental' | string;
  service_report_id?: string | number | null;
  service_report?: ServiceReport | null;
  sale_id?: string | number | null;
  sale?: any | null;
  rental_id?: string | number | null;
  rental?: any | null;
  customer_id?: string | number | null;
  customer?: Customer | null;
  unit_id?: string | number | null;
  unit?: Unit | null;
  user_id?: string | number | null;
  user?: any | null;
  technician_id?: string | number | null;
  technician?: Technician | null;
  product_id?: string | number | null;
  product?: Product | null;
  item_name?: string;
  qty: number;
  status: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Indent {
  id: string | number;
  indent_no: string;
  sparepart_request_id: string | number | null;
  product_id: string | number | null;
  qty: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DeliveryOrder {
  id: string | number;
  delivery_no: string;
  contract_item_id: string | number | null;
  customer_id: string | number | null;
  delivery_date: string;
  status: string;
  assigned_to: number | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrder {
  id: string | number;
  po_no: string;
  sparepart_request_id: string | number | null;
  service_report_id?: string | number | null;
  supplier_id?: string | number | null;
  order_date: string;
  status: string;
  total_amount?: number;
  reason?: string;
  installation_date?: string;
  purchase_order_items?: PurchaseOrderItem[];
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: string | number;
  purchase_order_id: string | number | null;
  item_name?: string;
  product_id: string | number | null;
  qty: number;
  unit_price: number;
  total_price: number;
  created_at: string;
  updated_at: string;
}

export interface ProcurementDeliveryOrder {
  id: string | number;
  do_number: string;
  do_type?: string;
  purchase_order_id: string | number | null;
  rental_id?: string | number | null;
  rental?: { rental_no?: string } | null;
  recipient_name?: string;
  recipient_phone?: string;
  delivery_address?: string;
  delivery_date: string;
  status: string;
  notes?: string;
  delivery_order_items?: {
    id?: string | number;
    product_id?: string | null;
    product?: { name?: string } | null;
    unit_id?: string | null;
    unit?: { model?: string; serial_no?: string } | null;
    qty?: number;
    remarks?: string;
  }[];
  created_at: string;
  updated_at: string;
}

export interface ProcurementDOItem {
  id: string | number;
  procurement_delivery_order_id: string | number | null;
  purchase_order_item_id: string | number | null;
  product_id: string | number | null;
  deliver_qty: number;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string | number;
  created_at: string;
  updated_at: string;
}

export interface Contract {
  id: string | number;
  end_date?: string;
  created_at: string;
  updated_at: string;
}

export interface SystemSetting {
  id: string | number;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string | number;
  user_id?: string | null;
  title: string;
  message: string;
  type?: string;
  is_read: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  message: string;
  data: T[];
  meta: {
    page: number;
    limit: number;
    total_items: number;
    total_pages: number;
  };
}
