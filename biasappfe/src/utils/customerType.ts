const GENERIC_CUSTOMER_CATEGORIES = new Set([
  'corporate',
  'personal',
  'individual',
  'government',
  'umkm',
  'retail',
  'b2b',
  'b2c',
  '-',
  '',
])

function isGenericCategory(val?: string | null): boolean {
  return GENERIC_CUSTOMER_CATEGORIES.has(String(val || '').trim().toLowerCase())
}

function unwrapArray(source: any): any[] {
  if (!source) return []
  if (Array.isArray(source)) return source
  if (Array.isArray(source.value)) return source.value
  return []
}

/**
 * Resolve the Customer Type label from the job/report/request transaction
 * instead of the static customer profile category (e.g. Corporate/Personal).
 */
export function resolveTransactionCustomerType(
  item: any,
  masterStore?: {
    contractItems?: any
    sales?: any
    jobOrders?: any
    serviceRequests?: any
    deliveryOrders?: any
  },
): string {
  if (!item) return 'Service'

  const directCat = String(item.customer_category || '').trim()
  if (directCat && !isGenericCategory(directCat)) {
    return directCat
  }

  const jo =
    item.job_order ||
    (item.job_order_id && masterStore
      ? unwrapArray(masterStore.jobOrders).find(
          (j: any) => String(j.id) === String(item.job_order_id),
        )
      : null)

  const sr =
    item.service_request ||
    jo?.service_request ||
    ((item.service_request_id || jo?.service_request_id) && masterStore
      ? unwrapArray(masterStore.serviceRequests).find(
          (r: any) =>
            String(r.id) === String(item.service_request_id || jo?.service_request_id),
        )
      : null)

  const doObj =
    item.delivery_order ||
    jo?.delivery_order ||
    ((item.delivery_order_id || jo?.delivery_order_id) && masterStore
      ? unwrapArray(masterStore.deliveryOrders).find(
          (d: any) =>
            String(d.id) === String(item.delivery_order_id || jo?.delivery_order_id),
        )
      : null)

  const srCat = String(sr?.customer_category || '').trim()
  if (srCat && !isGenericCategory(srCat)) return srCat

  const doCat = String(doObj?.customer_category || '').trim()
  if (doCat && !isGenericCategory(doCat)) return doCat

  const reqNo = String(sr?.request_no || item.request_no || '').toUpperCase()
  const problem = String(
    sr?.problem_description || item.problem_description || item.machine_problem || '',
  )
  const svcType = String(item.service_type || sr?.service_type || '').toLowerCase()
  const jobType = String(item.job_type || jo?.job_type || '').toLowerCase()
  const doType = String(item.do_type || doObj?.do_type || '').toLowerCase()
  const doNumber = String(item.do_number || doObj?.do_number || '').toUpperCase()

  // 1. External service request
  if (item.is_external || sr?.is_external || reqNo.startsWith('REQ-EXT')) {
    return 'Service External'
  }

  // 2. Service Warranty / Maintenance
  if (
    reqNo.startsWith('MT-') ||
    problem.includes('[MAINTENANCE_VISIT]') ||
    jobType === 'maintenance_visit' ||
    jobType === 'maintenance' ||
    svcType === 'maintenance' ||
    svcType === 'warranty'
  ) {
    return 'Service Warranty'
  }

  // 3. Stand Alone Service
  if (doType === 'standalone' || item.is_standalone || doNumber.startsWith('SA-')) {
    return 'Stand Alone'
  }

  // 4. Survey
  if (item.survey_id || jo?.survey_id || jobType === 'survey') {
    return 'Survey'
  }

  // 5. Rental / Contract
  const unitId = item.unit_id || jo?.unit_id || sr?.unit_id
  const customerId = item.customer_id || jo?.customer_id || sr?.customer_id || doObj?.customer_id
  const contractItems = unwrapArray(masterStore?.contractItems)
  const isContractUnit =
    unitId &&
    customerId &&
    contractItems.some(
      (ci: any) =>
        String(ci.unit_id) === String(unitId) &&
        String(ci.customer_id) === String(customerId),
    )

  if (
    item.contract_item_id ||
    item.rental_id ||
    doObj?.rental_id ||
    doObj?.contract_id ||
    svcType === 'copier' ||
    isContractUnit
  ) {
    return 'Rental'
  }

  // 6. Sales
  const salesList = unwrapArray(masterStore?.sales)
  const isSaleUnit =
    unitId &&
    customerId &&
    salesList.some(
      (s: any) =>
        String(s.customer_id) === String(customerId) &&
        (s.sale_items || []).some((si: any) => String(si.unit_id) === String(unitId)),
    )

  if (item.sale_id || item.sales_invoice_id || doObj?.sale_id || isSaleUnit) {
    return 'Sales'
  }

  // 7. Delivery
  if (
    item.delivery_order_id ||
    item.delivery_order ||
    item.do_number ||
    item.do_type ||
    svcType === 'delivery'
  ) {
    return 'Delivery'
  }

  // 8. Default for internal service
  if (sr || item.request_no || item.service_request_id || item.report_no) {
    return 'Service Contract'
  }

  return directCat || 'Service'
}
