<script setup lang="ts">
// @ts-nocheck
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import HardDeleteDialog from '@/components/ui/HardDeleteDialog.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { useAuth } from '@/composables/useAuth'
import { useHardDelete } from '@/composables/useHardDelete'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import { resources } from '@/services/resource.service'
import type { RentalInvoice, TableColumn } from '@/types'
import { buildRecapSheet, downloadStyledExcel, filterApprovedPaid, filterByYear, normalizeExportYear, NUMFMT_COUNT, NUMFMT_RP, NUMFMT_RP_RATE, RENTAL_INVOICE_YEAR_FIELDS, uniqueSheetName, type RecapRow, type StyledCell } from '@/utils/exportHelpers'
import { BIAS_LOGO_DATA_URL } from '@/utils/logoData'
import { printPaymentSlip, printPaymentStruk, paymentMethodOf, buildPaymentTimestamp, buildPaymentVerifyUrl, generatePaymentQrDataUrl } from '@/utils/paymentReceipt'
import { computed, reactive, ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'

const toast = useToast()
const route = useRoute()
const masterStore = useMasterStore()
const {
  rentalInvoices: data,
  contractItems,
  customers,
  payments,
  units,
  products,
  rents,
  findContractItem,
  findCustomer,
  findUnit,
  findProduct,
  findBrand,
  findUnitType,
  refresh,
  refreshInBackground,
  ensureResourcesLoaded,
  formatUnitDisplayName,
  formatProductDisplayName,
} = masterStore

const isLoading = ref(false)
let rentalInvTimer: any = null
let lastSilentRefresh = 0

function silentRefresh() {
  if (document.visibilityState === 'visible' && Date.now() - lastSilentRefresh > 15000) {
    lastSilentRefresh = Date.now()
    void refreshInBackground()
  }
}

onMounted(async () => {
  isLoading.value = true
  await ensureResourcesLoaded(route.path)
  isLoading.value = false
  rentalInvTimer = setInterval(silentRefresh, 30000)
  window.addEventListener('focus', silentRefresh)
  window.addEventListener('bias:data-mutated', silentRefresh)
})

onUnmounted(() => {
  if (rentalInvTimer) clearInterval(rentalInvTimer)
  window.removeEventListener('focus', silentRefresh)
  window.removeEventListener('bias:data-mutated', silentRefresh)
})

const { can } = usePermission()
const { currentUser } = useAuth()

const columns: TableColumn[] = [
  { key: 'invoice_no', label: 'Invoice No' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'contract_item_id', label: 'Contract' },
  { key: 'period_start', label: 'Period Start' },
  { key: 'period_end', label: 'Period End' },
  { key: 'due_date', label: 'Due Date' },
  { key: 'total_pay', label: 'Total' },
  { key: 'status', label: 'Approval Status' },
  { key: 'payment_status', label: 'Status' },
]

function formatDate(value: any): string {
  if (!value) return '-'
  const d = new Date(value)
  if (isNaN(d.getTime())) return String(value).slice(0, 10)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function approvalStatus(status: string): string {
  if (status === 'pending_meter_reading') return 'pending_meter_reading'
  if (status === 'approved') return 'approved'
  if (status === 'rejected') return 'rejected'
  return 'pending'
}

function meterReadingStatusLabel(status: string): string {
  if (status === 'pending_meter_reading') return 'Awaiting Meter Reading'
  return approvalStatusLabel(status)
}

function approvalStatusLabel(status: string): string {
  if (status === 'approved') return 'Approved'
  if (status === 'rejected') return 'Rejected'
  if (status === 'pending_meter_reading') return 'Awaiting Meter Reading'
  return 'Unpaid'
}

function isPaymentBlocked(item: any): boolean {
  return item?.status === 'pending_meter_reading'
}

function isCopierUnit(unit: any): boolean {
  if (!unit) return false
  if (unit.is_computer === true || unit.is_computer === 1) return false
  const modelStr = `${unit.model || ''} ${unit.name || ''}`.toLowerCase()
  return unit.is_copier === true || unit.is_copier === 1 ||
    modelStr.includes('copier') ||
    modelStr.includes('fotocopy') ||
    modelStr.includes('fotokopi') ||
    modelStr.includes('bizhub') ||
    modelStr.includes('am-c') ||
    modelStr.includes('imagerunner') ||
    modelStr.includes('workforce')
}

function invoicePayments(item: any) {
  return payments.value.filter((p: any) => String(p.rental_invoice_id) === String(item.id))
}

const showDetail = ref(false)
const detailItem = ref<any>(null)
const detailPayments = computed(() => detailItem.value ? invoicePayments(detailItem.value) : [])

const detailCustomer = computed(() => detailItem.value ? findCustomer(detailItem.value.customer_id) : null)
const detailContract = computed(() => detailItem.value ? findContractItem(detailItem.value.contract_item_id) : null)
const detailUnit = computed(() => detailContract.value ? findUnit(detailContract.value.unit_id) : null)

const isLoadingDetail = ref(false)

async function openDetail(item: any) {
  isLoadingDetail.value = true
  try {
    const response = await api.get<{ data: any }>(`/rental-invoices/${item.id}`, false)
    detailItem.value = response.data
  } catch (error) {
    console.warn('Failed to load full detail, using list data:', error)
    detailItem.value = item
  } finally {
    isLoadingDetail.value = false
    showDetail.value = true
  }
}

const showModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<RentalInvoice | null>(null)
const deletingItem = ref<RentalInvoice | null>(null)

const hardDelete = useHardDelete(
  (id, cascade) => resources.rentalInvoices.hardRemove(id, cascade),
  () => useMasterStore().refreshInBackground(),
  'rental_invoice:delete',
)

function openDelete(item: RentalInvoice) {
  deletingItem.value = item
  showConfirm.value = true
}

async function handleDelete() {
  if (deletingItem.value) {
    try {
      await resources.rentalInvoices.remove(String(deletingItem.value.id))
      await useMasterStore().refreshInBackground()
      toast.success('Invoice deleted successfully!')
    } catch (error: any) {
      toast.error('Failed to delete invoice: ' + (error?.message || 'Error'))
    }
  }
  showConfirm.value = false
}

// Date Range & Month Filters
const startDateFilter = ref('')
const endDateFilter = ref('')
const monthFilter = ref('')
const customerFilter = ref('')
const yearFilter = ref(new Date().getFullYear())
// Lock so double-clicking Export Excel does not produce 2 files.
const isExporting = ref(false)

function onMonthFilterChange() {
  if (!monthFilter.value) return
  const [yearStr, monthStr] = monthFilter.value.split('-')
  const year = parseInt(yearStr)
  const month = parseInt(monthStr)

  const firstDay = `${yearStr}-${monthStr.padStart(2, '0')}-01`
  const lastDayNum = new Date(year, month, 0).getDate()
  const lastDay = `${yearStr}-${monthStr.padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`

  startDateFilter.value = firstDay
  endDateFilter.value = lastDay
}

function resetFilters() {
  startDateFilter.value = ''
  endDateFilter.value = ''
  monthFilter.value = ''
  customerFilter.value = ''
}

const filteredData = computed(() => {
  let items = data.value
  if (customerFilter.value) {
    items = items.filter((d: any) => String(d.customer_id) === customerFilter.value)
  }
  if (startDateFilter.value) {
    items = items.filter((d: any) => {
      const itemDate = d.monthly_date || d.period_start || d.created_at
      if (!itemDate) return false
      return String(itemDate).slice(0, 10) >= startDateFilter.value
    })
  }
  if (endDateFilter.value) {
    items = items.filter((d: any) => {
      const itemDate = d.monthly_date || d.period_start || d.created_at
      if (!itemDate) return false
      return String(itemDate).slice(0, 10) <= endDateFilter.value
    })
  }
  return items
})

function resolveInvoiceAsset(item: any) {
  const customer = findCustomer(item.customer_id)
  const custName = customer?.company_name || customer?.name || '-'
  const custAddress = customer?.address || '-'
  const pic = customer?.pic_name || '-'
  const gender = customer?.pic_gender
  let prefix = 'Bapak/Ibu '
  if (gender === 'L') prefix = 'Bapak '
  if (gender === 'P') prefix = 'Ibu '
  const picDisplay = pic !== '-' ? prefix + pic : 'Finance'
  const signer = item?.user?.name || item?.user?.username || currentUser.value?.name || currentUser.value?.username || '-'

  const rawDate = item.invoice_date || item.monthly_date || item.period_end
  let dateStr = '-'
  if (rawDate) {
    const d = new Date(rawDate)
    if (!isNaN(d.getTime())) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      dateStr = `${d.getDate()}-${months[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`
    }
  }

  const periodDate = item.period_start ? new Date(item.period_start) : (item.monthly_date ? new Date(item.monthly_date) : (item.invoice_date ? new Date(item.invoice_date) : new Date()))
  let periodStr = '-'
  if (!isNaN(periodDate.getTime())) {
    periodStr = periodDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  }

  // Contract Item
  const ci = findContractItem(item.contract_item_id) ||
    (contractItems.value as any[]).find((c: any) => String(c.id) === String(item.contract_item_id)) ||
    (contractItems.value as any[]).find((c: any) => String(c.contract_id) === String(item.contract_id))

  // Direct or Contract Unit
  let unit = ci?.unit_id ? findUnit(ci.unit_id) : (ci?.unit || null)
  if (!unit && item.unit_id) {
    unit = findUnit(item.unit_id)
  }
  if (!unit && item.unit) {
    unit = item.unit
  }

  // From meter details if available
  const meterDetails: any[] = item.meter_details || []
  if (!unit && meterDetails.length > 0) {
    for (const md of meterDetails) {
      if (md.contract_item?.unit) {
        unit = md.contract_item.unit
        break
      }
      if (md.contract_item_id) {
        const mdCi = findContractItem(md.contract_item_id)
        if (mdCi?.unit_id) {
          unit = findUnit(mdCi.unit_id)
          if (unit) break
        }
      }
    }
  }

  // From Rental & Rental Items
  const rentsList = (rents?.value || (masterStore as any).rents || []) as any[]
  const rental = item.rental || (item.rental_id ? rentsList.find((r: any) => String(r.id) === String(item.rental_id)) : null)
  let rentalItem: any = null
  let product: any = item.product || (item.product_id && findProduct ? findProduct(item.product_id) : null)

  if (rental) {
    const rawItems = rental.rental_items || rental.rentalItems || []
    if (Array.isArray(rawItems) && rawItems.length > 0) {
      rentalItem = rawItems[0]
      if (!unit && rentalItem.unit_id) {
        unit = findUnit(rentalItem.unit_id)
      }
      if (!unit && rentalItem.unit) {
        unit = rentalItem.unit
      }
      if (!product && rentalItem.product_id && findProduct) {
        product = findProduct(rentalItem.product_id)
      }
      if (!product && rentalItem.product) {
        product = rentalItem.product
      }
    }
  }

  // Determine if copier
  let isCopier = false
  if (meterDetails.length > 0) {
    isCopier = true
  } else if (unit) {
    isCopier = isCopierUnit(unit)
  } else if (item.meter_start || item.meter_end || ci?.start_meter_bw) {
    isCopier = true
  }

  // Serial Number
  let serialNo = ''
  if (item.serial_no || item.sn) {
    serialNo = String(item.serial_no || item.sn).trim()
  } else if (unit?.serial_no) {
    serialNo = String(unit.serial_no).trim()
  } else if (rentalItem?.unit?.serial_no) {
    serialNo = String(rentalItem.unit.serial_no).trim()
  } else if (ci?.unit?.serial_no) {
    serialNo = String(ci.unit.serial_no).trim()
  } else if (ci?.serial_no) {
    serialNo = String(ci.serial_no).trim()
  } else if (rentalItem?.specs) {
    try {
      const parsed = typeof rentalItem.specs === 'string' ? JSON.parse(rentalItem.specs) : rentalItem.specs
      serialNo = parsed.serial_no || parsed.sn || ''
    } catch {
      const match = String(rentalItem.specs).match(/(?:s\/n|sn|serial)\s*[:=]\s*([^\s,;]+)/i)
      if (match) serialNo = match[1]
    }
  } else if (ci?.specs) {
    try {
      const parsed = typeof ci.specs === 'string' ? JSON.parse(ci.specs) : ci.specs
      serialNo = parsed.serial_no || parsed.sn || ''
    } catch {
      const match = String(ci.specs).match(/(?:s\/n|sn|serial)\s*[:=]\s*([^\s,;]+)/i)
      if (match) serialNo = match[1]
    }
  }
  if (!serialNo && product?.sku) {
    serialNo = product.sku
  }
  if (!serialNo && product?.serial_no) {
    serialNo = product.serial_no
  }

  // Brand and Model description
  let brandModel = ''
  let assetCategory = isCopier ? 'Mesin Fotocopy' : 'Unit'

  if (unit) {
    const brand = unit.brand?.name || (findBrand ? findBrand(unit.brand_id)?.name : '') || ''
    const model = unit.model || unit.name || ''
    brandModel = [brand, model].filter(Boolean).join(' ')
    if (!isCopier) {
      if (unit.is_computer || /computer|komputer|laptop|pc/i.test(model)) {
        assetCategory = 'Komputer'
      } else if (unit.type?.name) {
        assetCategory = unit.type.name
      } else {
        assetCategory = 'Unit'
      }
    }
  } else if (product) {
    brandModel = product.name || ''
    if (!isCopier) {
      assetCategory = product.is_computer ? 'Komputer' : (product.category?.name || 'Unit')
    }
  } else if (ci?.description) {
    brandModel = ci.description
  } else {
    brandModel = isCopier ? 'Mesin Fotocopy' : 'Product / Unit Rental'
  }

  if (!isCopier && /copier|fotocopy|fotokopi|bizhub|am-c|imagerunner|workforce/i.test(brandModel)) {
    isCopier = true
    assetCategory = 'Mesin Fotocopy'
  }

  const poNo = (item.po_no || item.rental?.po_no || rental?.po_no || '').trim()

  return {
    customer,
    custName,
    custAddress,
    picDisplay,
    signer,
    dateStr,
    periodStr,
    unit,
    product,
    ci,
    rental,
    rentalItem,
    isCopier,
    serialNo,
    assetCategory,
    brandModel,
    meterDetails,
    poNo,
  }
}

function renderRentalInvoiceBody(item: any): string {
  const assetInfo = resolveInvoiceAsset(item)
  const {
    custName,
    custAddress,
    picDisplay,
    signer,
    dateStr,
    periodStr,
    isCopier,
    serialNo,
    assetCategory,
    brandModel,
    meterDetails,
    poNo,
    ci,
  } = assetInfo

  const baseRentalFee = item.base_rental_fee || item.basis_rental_fee || 0

  const fmtVal = (n: number) => n === 0 ? '-' : n.toLocaleString('id-ID')
  const fmtPcs = (n: number) => n < 0 ? `(${Math.abs(n).toLocaleString('id-ID')})` : n === 0 ? '-' : n.toLocaleString('id-ID')

  function renderMeterBlock(label: string, start: number, last: number, free: number, total: number, net: number): string {
    const hasFree = free > 0
    return `
      <div style="margin-top: 10px; width: 310px;">
        <div style="font-weight: 700; font-size: 11px; margin-bottom: 2px;">${label}</div>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; line-height: 1.5; border: none;">
          <tr>
            <td style="border: none; padding: 1px 0; text-align: left;">Start Meter Reading</td>
            <td style="border: none; padding: 1px 6px; text-align: right; width: 85px;">${fmtVal(start)}</td>
            <td style="border: none; padding: 1px 0 1px 4px; width: 24px; text-align: left;"></td>
          </tr>
          <tr>
            <td style="border: none; padding: 1px 0; text-align: left;">Last Meter Reading</td>
            <td style="border: none; border-bottom: 1.5px solid #111; padding: 1px 6px; text-align: right; width: 85px;">${fmtVal(last)}</td>
            <td style="border: none; border-bottom: 1.5px solid #111; padding: 1px 0 1px 4px; width: 24px; text-align: left;">(-)</td>
          </tr>
          <tr>
            <td style="border: none; padding: 1px 0; text-align: left;">Total Copies</td>
            <td style="border: none; padding: 1px 6px; text-align: right; font-weight: 700; width: 85px;">${fmtPcs(total)}</td>
            <td style="border: none; padding: 1px 0 1px 4px; width: 24px; text-align: left;"></td>
          </tr>
          ${hasFree ? `
          <tr>
            <td style="border: none; padding: 1px 0; text-align: left;">Free Copies</td>
            <td style="border: none; border-bottom: 1.5px solid #111; padding: 1px 6px; text-align: right; width: 85px;">${fmtVal(free)}</td>
            <td style="border: none; border-bottom: 1.5px solid #111; padding: 1px 0 1px 4px; width: 24px; text-align: left;">(-)</td>
          </tr>
          <tr>
            <td style="border: none; padding: 1px 0; text-align: left;">Total Copies</td>
            <td style="border: none; padding: 1px 6px; text-align: right; font-weight: 700; width: 85px;">${fmtPcs(net)}</td>
            <td style="border: none; padding: 1px 0 1px 4px; width: 24px; text-align: left;"></td>
          </tr>` : ''}
        </table>
      </div>`
  }

  function renderChargeRow(num: number, label: string, rate: number, amount: number): string {
    return `
      <tr>
        <td class="no-col">${num}</td>
        <td colspan="3" style="padding: 6px 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span>${label}</span>
            <span style="padding-right: 20px;">(x)&nbsp;&nbsp;Rp&nbsp;&nbsp;${rate.toLocaleString('id-ID')}</span>
          </div>
        </td>
        <td class="rp-col">Rp</td>
        <td class="val-col">${amount > 0 ? amount.toLocaleString('id-ID') : '-'}</td>
      </tr>`
  }

  let meterBlocksHtml = ''
  let chargeRowsHtml = ''

  if (isCopier) {
    const contractRates = ci?.rates || rentalItem?.rates || item.contract_item?.rates || item.rental?.rental_items?.[0]?.rates || []
    const hasConfiguredPaperSize = Array.isArray(contractRates) && contractRates.length > 0 && contractRates.some((r: any) => Boolean(r.paper_size_id && String(r.paper_size_id).trim() !== ''))
    const distinctSizes = new Set(
      meterDetails
        .map((d: any) => d.paper_size?.name || d.paper_size_name || '')
        .filter((s: string) => Boolean(s.trim()))
    )
    const hasExplicitPaperSize = hasConfiguredPaperSize || distinctSizes.size > 1

    if (meterDetails.length > 0) {
      const byPaperSize = new Map<string, any[]>()
      for (const detail of meterDetails) {
        const psName = hasExplicitPaperSize ? (detail.paper_size?.name || '') : ''
        const ptName = detail.paper_type?.name || ''
        const key = ptName ? (psName ? `${psName}/${ptName}` : ptName) : psName
        if (!byPaperSize.has(key)) byPaperSize.set(key, [])
        byPaperSize.get(key)!.push(detail)
      }

      let rowIdx = 2
      for (const [paperSize, details] of byPaperSize) {
        const bwDetails = details.filter((d: any) => /bw|mono|b\/w/i.test(d.color_mode || ''))
        const colorDetails = details.filter((d: any) => /colou?r/i.test(d.color_mode || ''))
        // Jika tidak ada ukuran kertasnya kosongin aja
        const sizeLabel = (paperSize && paperSize.trim() && hasExplicitPaperSize) ? ` ${paperSize.trim()}` : ''

        for (const d of bwDetails) {
          const start = d.start_meter_reading || 0
          const last = d.last_meter_reading || 0
          const total = d.total_copies ?? (last - start)
          const free = d.free_quota ?? 0
          const net = total - free
          meterBlocksHtml += renderMeterBlock(`B/W${sizeLabel}`, start, last, free, total, net)
          chargeRowsHtml += renderChargeRow(rowIdx++, `Copies Charges B/W${sizeLabel}`, d.rate_per_page || 0, d.total_amount || 0)
        }

        for (const d of colorDetails) {
          const start = d.start_meter_reading || 0
          const last = d.last_meter_reading || 0
          const total = d.total_copies ?? (last - start)
          const free = d.free_quota ?? 0
          const net = total - free
          meterBlocksHtml += renderMeterBlock(`Colour${sizeLabel}`, start, last, free, total, net)
          chargeRowsHtml += renderChargeRow(rowIdx++, `Copies Charges Colour${sizeLabel}`, d.rate_per_page || 0, d.total_amount || 0)
        }
      }
    } else {
      // Standar copier meter readings (persis foto invoice)
      const bwStart = Number(item.meter_start || item.meter_start_bw || ci?.start_meter_bw || 0)
      const bwEnd = Number(item.meter_end || item.meter_end_bw || bwStart)
      const bwFree = Number(item.free_copies ?? ci?.free_copy_quota ?? 0)
      const bwRate = Number(item.rate_per_page || 150)
      const bwTotal = Math.max(0, bwEnd - bwStart)
      const bwNet = bwTotal - bwFree
      const bwBillable = Math.max(0, bwNet)
      const bwAmount = bwBillable * bwRate
      // Tanpa ukuran kertas jika tidak dikonfigurasi (kosongin aja)
      const sizeSuffix = ''

      meterBlocksHtml += renderMeterBlock(`B/W${sizeSuffix}`, bwStart, bwEnd, bwFree, bwTotal, bwNet)
      chargeRowsHtml += renderChargeRow(2, `Copies Charges B/W${sizeSuffix}`, bwRate, bwAmount)

      const colStart = Number(ci?.start_meter_color || item.meter_start_colour || item.meter_start_color || 0)
      const colEnd = Number(item.meter_end_colour || item.meter_end_color || colStart)
      const colFree = Number(ci?.free_quota_color || 0)
      const colRate = Number(ci?.rate_per_page_color || 1000)
      if (colStart > 0 || colFree > 0 || colEnd > colStart) {
        const colTotal = Math.max(0, colEnd - colStart)
        const colNet = colTotal - colFree
        const colBillable = Math.max(0, colNet)
        const colAmount = colBillable * colRate
        meterBlocksHtml += renderMeterBlock(`Colour${sizeSuffix}`, colStart, colEnd, colFree, colTotal, colNet)
        chargeRowsHtml += renderChargeRow(3, `Copies Charges Colour${sizeSuffix}`, colRate, colAmount)
      }
    }
  }

  const totalNum = item.subtotal || baseRentalFee + (item.excess_copies_fee || item.excess_amount || 0)
  const taxNum = item.tax || 0
  const totalPayNum = item.total_pay || (totalNum + taxNum)
  const total = totalNum === 0 ? '-' : totalNum.toLocaleString('id-ID')
  const totalPay = totalPayNum === 0 ? '-' : totalPayNum.toLocaleString('id-ID')

  const dppVal = taxNum > 0 ? totalNum.toLocaleString('id-ID') : ''
  const taxVal = taxNum > 0 ? taxNum.toLocaleString('id-ID') : ''

  const snDisplay = serialNo ? `S/N : ${serialNo}` : 'S/N : -'

  return `
<div class="inv-container">
  <!-- Header -->
  <div class="header-wrap">
    <div class="left-box">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
        <img src="${BIAS_LOGO_DATA_URL}" style="width: 50px; height: 50px; object-fit: contain;" alt="BiAS Logo" />
        <div>
          <div class="co-name" style="margin-bottom: 2px;">PT. BiAS SURYA TEKNOLOGI</div>
          <div style="font-size: 10px; font-style: italic; color: #4b5563;">The shape of smart</div>
        </div>
      </div>
      <div class="co-addr">Ruko Purimas Blok A No.47 Kota Batam<br>Kepulauan Riau - Indonesia</div>
      <div class="co-contact">
        Telp : +62 811 7045 657<br>
        Email : admin@biasbst.com<br>
        www.biassuryateknologi.com
      </div>
    </div>
    <div class="right-box">
      <table class="right-table">
        <tr>
          <td class="lbl">Inv No. :</td>
          <td class="val">${item.invoice_no || '-'}</td>
        </tr>
        <tr>
          <td class="lbl">Date :</td>
          <td class="val">${dateStr}</td>
        </tr>
        ${poNo ? `<tr><td class="lbl">PO No. :</td><td class="val" style="font-weight: 700;">${poNo}</td></tr>` : ''}
        <tr>
          <td colspan="2" class="kepada-lbl">Kepada Yth.</td>
        </tr>
        <tr>
          <td colspan="2" class="cust-name">${custName}</td>
        </tr>
        <tr>
          <td colspan="2" class="cust-addr">${custAddress}</td>
        </tr>
        <tr>
          <td class="up-lbl">Up</td>
          <td class="up-val">${picDisplay}</td>
        </tr>
      </table>
    </div>
  </div>

  <div class="inv-title-wrap"><div class="inv-title">INVOICE</div></div>
  <div class="period-header">Periode : ${periodStr}</div>

  <!-- Main Table -->
  <table class="main-table">
    <thead>
      <tr>
        <th class="no-col">No</th>
        <th colspan="3">Description</th>
        <th class="rp-col">Rp</th>
        <th style="text-align:right; width:110px;">${baseRentalFee.toLocaleString('id-ID')}</th>
      </tr>
    </thead>
    <tbody>
      <!-- Row 1: Rental charge and machine details -->
      <tr>
        <td class="no-col">1</td>
        <td colspan="3" style="vertical-align: top;">
          <div style="font-weight: 700; font-size: 11px; margin-bottom: 3px;">Rental Charges ${assetCategory} ${custName}</div>
          <div style="font-weight: 700; font-size: 11px; margin-bottom: 6px;">${brandModel} ${snDisplay} 1 Unit</div>
          ${meterBlocksHtml}
        </td>
        <td class="rp-col"></td>
        <td class="val-col"></td>
      </tr>

      ${chargeRowsHtml}

      <!-- Total rows -->
      <tr class="total-row">
        <td colspan="4" class="total-lbl">TOTAL</td>
        <td class="rp-col">Rp</td>
        <td class="val-col">${total}</td>
      </tr>
      <tr class="total-row">
        <td colspan="4" class="total-lbl">D.P.P</td>
        <td class="rp-col">${taxNum > 0 ? 'Rp' : ''}</td>
        <td class="val-col">${dppVal}</td>
      </tr>
      <tr class="total-row">
        <td colspan="4" class="total-lbl">PPN</td>
        <td class="rp-col">${taxNum > 0 ? 'Rp' : ''}</td>
        <td class="val-col">${taxVal}</td>
      </tr>
      <tr class="total-row grand">
        <td colspan="4" class="total-lbl">TOTAL PAY</td>
        <td class="rp-col">Rp</td>
        <td class="val-col">${totalPay}</td>
      </tr>
    </tbody>
  </table>

  <!-- Footer -->
  <div class="bottom-wrap">
    <div class="bank-box">
      <div class="bank-header">Pembayaran Transfer ke rekening :</div>
      <div class="bank-header">PT. BIAS SURYA TEKNOLOGI</div>
      NPWP : 0941.8395.0822.5000<br>
      <span class="bank-name">BANK RIAU KEPRI SYARIAH CAB. BATAM</span><br>
      Rek No. 1060885757<br>
      <span class="bank-name">BANK MANDIRI CABANG BATAM</span><br>
      Rek No. 109-00-3388575-7
    </div>
    <div class="sig-area">
      <div class="sig-col">
        <span class="sig-label">Received By,</span>
        <div class="sig-line"></div>
        <div class="sig-name">${picDisplay}</div>
      </div>
      <div class="sig-col">
        <span class="sig-label">PT. BiAS SURYA TEKNOLOGI</span>
        <div class="sig-line"></div>
        <div class="sig-name">${signer}</div>
        <div class="sig-role">Admin Finance</div>
      </div>
    </div>
  </div>
</div>`
}

function renderRentalInvoicesPdf(items: any[], title: string): string {
  const bodyContent = items.map(item => `<div class="inv-page">${renderRentalInvoiceBody(item)}</div>`).join('')
  return `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>
    @media print {
      @page { margin: 10mm 10mm; size: portrait; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .inv-page { page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; }
      .inv-page:last-child { page-break-after: auto; break-after: auto; }
    }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; margin: 0; padding: 20px; color: #1a1a1a; background: #fff; }
    .inv-page { margin-bottom: 30px; }
    @media print {
      .inv-page { margin-bottom: 0; }
    }
    .inv-container { max-width: 760px; margin: 0 auto; }

    /* Header */
    .header-wrap { display: flex; justify-content: space-between; align-items: stretch; gap: 16px; margin-bottom: 16px; }
    .left-box { width: 44%; background: #f0f7ff; border-radius: 8px; padding: 14px 16px; }
    .left-box .co-name { color: #1a56db; font-size: 14px; font-weight: 700; margin-bottom: 8px; letter-spacing: 0.3px; }
    .left-box .co-addr { font-size: 10.5px; color: #374151; line-height: 1.6; padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid #bfdbfe; }
    .left-box .co-contact { font-size: 10.5px; color: #374151; line-height: 1.8; }
    .right-box { width: 54%; }
    .right-table { width: 100%; border-collapse: collapse; font-size: 11px; border: 1.5px solid #2563eb; background: #fff; }
    .right-table td { border: 1px solid #60a5fa; padding: 4px 8px; vertical-align: top; color: #111827; }
    .right-table .lbl { width: 85px; font-weight: 700; text-align: right; white-space: nowrap; }
    .right-table .val { font-weight: 400; text-align: left; }
    .right-table .kepada-lbl { font-weight: 700; font-size: 11px; text-align: left; padding-top: 5px; padding-bottom: 5px; }
    .right-table .cust-name { font-weight: 700; font-size: 11.5px; text-align: left; }
    .right-table .cust-addr { font-weight: 400; font-size: 10.5px; line-height: 1.45; text-align: left; min-height: 38px; }
    .right-table .up-lbl { width: 85px; font-weight: 700; text-align: left; }
    .right-table .up-val { font-weight: 700; font-size: 11px; text-align: center; }

    /* Invoice Title */
    .inv-title-wrap { text-align: center; margin: 14px 0 4px; }
    .inv-title { font-size: 26px; font-weight: 800; letter-spacing: 6px; color: #111827; }
    .period-header { font-style: italic; font-size: 11px; font-weight: 700; color: #111827; margin: 10px 0 4px 0; text-align: left; }

    /* Main Table */
    .main-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; border: 1.5px solid #2563eb; }
    .main-table thead tr { background: #f8fafc; color: #111827; }
    .main-table th { border: 1px solid #60a5fa; padding: 6px 10px; font-weight: 700; font-size: 11px; text-align: left; }
    .main-table th.center { text-align: center; }
    .main-table td { border: 1px solid #93c5fd; padding: 6px 10px; vertical-align: top; }
    .main-table tbody tr { background: #fff; }
    .no-col { width: 32px; text-align: center; font-weight: 700; }
    .rp-col { width: 28px; border-right: none !important; text-align: left; font-weight: 700; font-size: 11px; }
    .val-col { border-left: none !important; text-align: right; width: 110px; font-weight: 700; font-size: 11px; }

    /* Total rows */
    .total-row td { font-weight: 700; background: #fff; border: 1px solid #93c5fd; padding: 5px 10px; }
    .total-row.grand td { font-weight: 800; font-size: 11.5px; background: #f0f7ff; color: #1e3a8a; }
    .total-lbl { text-align: right; padding-right: 12px; font-weight: 700; color: #111827; }

    /* Footer */
    .bottom-wrap { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-top: 16px; }
    .bank-box { width: 44%; background: #f0f7ff; border-radius: 8px; padding: 12px 14px; font-size: 10px; line-height: 1.7; color: #374151; }
    .bank-box .bank-header { font-weight: 700; color: #1a56db; text-align: center; font-size: 10.5px; margin-bottom: 4px; }
    .bank-box .bank-name { font-weight: 700; margin-top: 4px; }
    .sig-area { width: 52%; display: flex; justify-content: space-between; padding-top: 4px; }
    .sig-col { width: 46%; text-align: center; display: flex; flex-direction: column; align-items: center; font-size: 11px; }
    .sig-label { font-size: 10.5px; color: #6b7280; margin-bottom: 48px; }
    .sig-line { width: 85%; border-bottom: 1.5px solid #374151; margin-bottom: 4px; }
    .sig-name { font-weight: 700; font-size: 11px; }
    .sig-role { font-style: italic; font-size: 10px; color: #6b7280; }
  
/* Per-Row Export Action Buttons & Separator */
.row-actions-container {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: nowrap;
}

.action-btn--pdf {
  background: #fee2e2 !important;
  color: #dc2626 !important;
  border: 1px solid #fca5a5 !important;
}
.action-btn--pdf:hover {
  background: #dc2626 !important;
  color: #ffffff !important;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(220, 38, 38, 0.35);
}

.action-btn--excel {
  background: #dcfce7 !important;
  color: #15803d !important;
  border: 1px solid #86efac !important;
}
.action-btn--excel:hover {
  background: #15803d !important;
  color: #ffffff !important;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(21, 128, 61, 0.35);
}

.action-btn--receipt {
  background: #e0f2fe !important;
  color: #0284c7 !important;
  border: 1px solid #7dd3fc !important;
}
.action-btn--receipt:hover {
  background: #0284c7 !important;
  color: #ffffff !important;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(2, 132, 199, 0.35);
}

.action-divider {
  display: inline-block;
  width: 1px;
  height: 22px;
  background-color: #cbd5e1;
  margin: 0 3px;
  flex-shrink: 0;
}

</style>
</head>
<body>
  ${bodyContent}
  <script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script>
</body>
</html>`
}

async function exportMonthToExcel() {
  if (isExporting.value) return
  const items = filteredData.value
  if (items.length === 0) {
    toast.warning('No rental invoice data to export!')
    return
  }

  let periodLabel = 'All_Periods'
  if (monthFilter.value) {
    periodLabel = monthFilter.value
  } else if (startDateFilter.value || endDateFilter.value) {
    periodLabel = `${startDateFilter.value || 'Start'}_to_${endDateFilter.value || 'End'}`
  }

  isExporting.value = true
  try {
    await exportInvoicesToExcel(items, `RentalInvoice_${periodLabel}`, [])
    toast.success('Excel report downloaded successfully')
  } finally {
    isExporting.value = false
  }
}

async function exportInvoicesToExcel(
  items: any[],
  filename: string,
  leadingSheets: Array<{ name: string; columnWidths: number[]; rows: StyledCell[][] }> = [],
) {
  const sortedItems = [...items].sort((a, b) => {
    const da = a.period_start || a.monthly_date || a.invoice_date || ''
    const db = b.period_start || b.monthly_date || b.invoice_date || ''
    return String(da).localeCompare(String(db))
  })

  const sheets: Array<{ name: string; columnWidths: number[]; rows: StyledCell[][] }> = []
  const usedSheetNames = new Set<string>()
  const columnWidths = [4.2, 39.2, 7.8, 13, 31.2]

  for (const item of sortedItems) {
    const assetInfo = resolveInvoiceAsset(item)
    const { isCopier, assetCategory, brandModel, serialNo, custName, custAddress, picDisplay, poNo, signer, ci } = assetInfo

    const rows: StyledCell[][] = []
    const addRow = (r: StyledCell[] = []) => rows.push(r)
    let rawSheetName = (item.invoice_no || `Inv_${item.id || 'draft'}`).replace(/[:\\/?*[\]]/g, '_').slice(0, 31)
    let sheetName = rawSheetName
    let counter = 1
    while (usedSheetNames.has(sheetName)) {
      sheetName = `${rawSheetName.slice(0, 28)}_${counter++}`
    }
    usedSheetNames.add(sheetName)

    const dateVal = item.invoice_date || item.monthly_date || item.period_end || ''
    const dateLabel = dateVal ? formatDate(dateVal) : '-'

    let periodLabel = '-'
    if (item.period_start && item.period_end) {
      periodLabel = `${formatDate(item.period_start)} - ${formatDate(item.period_end)}`
    } else if (item.monthly_date) {
      const d = new Date(item.monthly_date)
      if (!isNaN(d.getTime())) {
        periodLabel = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
      }
    } else if (item.period_start) {
      const d = new Date(item.period_start)
      if (!isNaN(d.getTime())) {
        periodLabel = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
      }
    }
    const baseRentalFee = Number(item.base_rental_fee || item.rental_rate || item.basis_rental_fee || ci?.monthly_fee || 0)

    // Row 1: Company name + Inv No.
    addRow([
      { v: 'PT. BiAS SURYA TEKNOLOGI', mergeAcross: 1, style: 'borderBold' }, {},
      {},
      { v: 'Inv No. :', style: 'borderBoldRight' },
      { v: item.invoice_no || '-', style: 'border' },
    ])
    // Row 2: Address line 1 + Date
    addRow([
      { v: 'Ruko Purimas Blok A No.47 Kota Batam', mergeAcross: 1, style: 'borderCenter' }, {},
      {},
      { v: 'Date :', style: 'borderBoldRight' },
      { v: dateLabel, style: 'border' },
    ])
    // Row 3: Address line 2 + PO No / Kepada Yth.
    if (poNo) {
      addRow([
        { v: 'Kepulauan Riau - Indonesia', mergeAcross: 1, style: 'borderCenter' }, {},
        {},
        { v: 'PO No. :', style: 'borderBoldRight' },
        { v: poNo, style: 'border' },
      ])
      addRow([
        { v: 'Telp : +62 811 7045 657', mergeAcross: 1, style: 'borderCenter' }, {},
        {},
        { v: 'Kepada Yth.', mergeAcross: 1, style: 'borderBold' }, {},
      ])
      addRow([
        { v: 'Email : admin@biasbst.com', mergeAcross: 1, style: 'borderCenter' }, {},
        {},
        { v: custName || '-', mergeAcross: 1, style: 'borderBold' }, {},
      ])
      addRow([
        { v: 'www.biassuryateknologi.com', mergeAcross: 1, style: 'borderCenter' }, {},
        {},
        { v: custAddress, mergeAcross: 1, style: 'border' }, {},
      ])
      addRow([
        { style: 'border' }, { style: 'border' },
        {},
        { v: 'Up', style: 'borderBold' },
        { v: picDisplay, style: 'borderBoldCenter' },
      ])
    } else {
      addRow([
        { v: 'Kepulauan Riau - Indonesia', mergeAcross: 1, style: 'borderCenter' }, {},
        {},
        { v: 'Kepada Yth.', mergeAcross: 1, style: 'borderBold' }, {},
      ])
      addRow([
        { v: 'Telp : +62 811 7045 657', mergeAcross: 1, style: 'borderCenter' }, {},
        {},
        { v: custName || '-', mergeAcross: 1, style: 'borderBold' }, {},
      ])
      addRow([
        { v: 'Email : admin@biasbst.com', mergeAcross: 1, style: 'borderCenter' }, {},
        {},
        { v: custAddress, mergeAcross: 1, style: 'border' }, {},
      ])
      addRow([
        { v: 'www.biassuryateknologi.com', mergeAcross: 1, style: 'borderCenter' }, {},
        {},
        { v: 'Up', style: 'borderBold' },
        { v: picDisplay, style: 'borderBoldCenter' },
      ])
    }
    // Spacer
    addRow([
      { style: 'border' }, { style: 'border' },
      {},
      { style: 'border' }, { style: 'border' },
    ])

    // Title + Period
    addRow([{ v: 'INVOICE', mergeAcross: 4, style: 'titleCell' }])
    addRow([{ v: 'Periode : ' + periodLabel, mergeAcross: 1, style: 'borderBold' }, {}])

    // Table Header
    addRow([
      { v: 'No', style: 'borderBoldCenter' },
      { v: 'Description', style: 'borderBold' },
      { style: 'border' },
      { style: 'border' },
      { v: baseRentalFee, style: 'borderBoldRight', numFmt: NUMFMT_RP },
    ])

    const snDisplay = serialNo ? `S/N : ${serialNo}` : 'S/N : -'
    addRow([
      { v: 1, style: 'borderCenter' },
      { v: `Rental Charges ${assetCategory} ${custName}`, style: 'borderBold' },
      {}, {},
      { style: 'border' },
    ])
    addRow([
      {},
      { v: `${brandModel} ${snDisplay} 1 Unit`, style: 'borderBold' },
      {}, {},
      { style: 'border' },
    ])

    let rowNum = 2
    if (isCopier) {
      const contractRates = ci?.rates || rentalItem?.rates || item.contract_item?.rates || item.rental?.rental_items?.[0]?.rates || []
      const hasConfiguredPaperSize = Array.isArray(contractRates) && contractRates.length > 0 && contractRates.some((r: any) => Boolean(r.paper_size_id && String(r.paper_size_id).trim() !== ''))
      const distinctSizes = new Set(
        (item.meter_details || [])
          .map((d: any) => d.paper_size?.name || d.paper_size_name || '')
          .filter((s: string) => Boolean(s.trim()))
      )
      const hasExplicitPaperSize = hasConfiguredPaperSize || distinctSizes.size > 1

      // Format Excel persis foto invoice: Start, Last (-), Total Copies (dan Free Copies HANYA jika free > 0)
      const pushMeterSection = (sectionLabel: string, start: number, last: number, free: number, explicitTotal?: number) => {
        const total = explicitTotal !== undefined ? explicitTotal : (last - start)
        const net = total - free
        const billable = Math.max(0, net)
        addRow([{ style: 'border' }, { v: sectionLabel, style: 'borderBold' }, { style: 'border' }, { style: 'border' }, { style: 'border' }])
        addRow([{}, { v: 'Start Meter Reading', style: 'border' }, { v: start, style: 'borderRight', numFmt: NUMFMT_COUNT }, { style: 'border' }, { style: 'border' }])
        addRow([{}, { v: 'Last Meter Reading', style: 'border' }, { v: last, style: 'borderRight', numFmt: NUMFMT_COUNT }, { v: '(-)', style: 'borderCenter' }, { style: 'border' }])
        addRow([{}, { v: 'Total Copies', style: 'border' }, { v: total, style: 'borderBoldRight', numFmt: NUMFMT_COUNT }, { style: 'border' }, { style: 'border' }])
        if (free > 0) {
          addRow([{}, { v: 'Free Copies', style: 'border' }, { v: free, style: 'borderRight', numFmt: NUMFMT_COUNT }, { v: '(-)', style: 'borderCenter' }, { style: 'border' }])
          addRow([{}, { v: 'Total Copies', style: 'border' }, { v: net, style: 'borderBoldRight', numFmt: NUMFMT_COUNT }, { style: 'border' }, { style: 'border' }])
        }
        return { total, billable }
      }

      const chargeRow = (desc: string, rate: number, amount: number) => {
        addRow([
          { v: rowNum++, style: 'borderCenter' },
          { v: desc, style: 'border' },
          { v: '(x)', style: 'borderCenter' },
          { v: rate, style: 'borderRight', numFmt: NUMFMT_RP_RATE },
          { v: amount, style: 'borderBoldRight', numFmt: NUMFMT_RP },
        ])
      }

      const meterDetails: any[] = item.meter_details || []

      if (meterDetails.length > 0) {
        const byPaperSize = new Map<string, any[]>()
        for (const detail of meterDetails) {
          const psName = hasExplicitPaperSize ? (detail.paper_size?.name || '') : ''
          const ptName = detail.paper_type?.name || ''
          const key = ptName ? (psName ? `${psName}/${ptName}` : ptName) : psName
          if (!byPaperSize.has(key)) byPaperSize.set(key, [])
          byPaperSize.get(key)!.push(detail)
        }

        for (const [paperSize, details] of byPaperSize) {
          const bwDetails = details.filter((d: any) => /bw|mono|b\/w/i.test(d.color_mode || ''))
          const colorDetails = details.filter((d: any) => /colou?r/i.test(d.color_mode || ''))
          // Jika tidak ada ukuran kertasnya kosongin aja
          const sizeLabel = (paperSize && paperSize.trim() && hasExplicitPaperSize) ? ` ${paperSize.trim()}` : ''

          for (const detail of bwDetails) {
            const start = detail.start_meter_reading || 0
            const last = detail.last_meter_reading || 0
            const free = detail.free_quota ?? 0
            pushMeterSection(`B/W${sizeLabel}`, start, last, free)
            chargeRow(`Copies Charges B/W${sizeLabel}`, detail.rate_per_page || 0, detail.total_amount || 0)
          }

          for (const detail of colorDetails) {
            const start = detail.start_meter_reading || 0
            const last = detail.last_meter_reading || 0
            const free = detail.free_quota ?? 0
            pushMeterSection(`Colour${sizeLabel}`, start, last, free)
            chargeRow(`Copies Charges Colour${sizeLabel}`, detail.rate_per_page || 0, detail.total_amount || 0)
          }
        }
      } else {
        const bwStart = item.meter_start || item.meter_start_bw || ci?.start_meter_bw || 0
        const bwEnd = item.meter_end || item.meter_end_bw || bwStart
        const bwFree = item.free_copies ?? ci?.free_copy_quota ?? 0
        const bwRate = item.rate_per_page || 150
        const sizeSuffix = '' // Kosongin jika tidak ada ukuran kertas
        const bw = pushMeterSection(`B/W${sizeSuffix}`, bwStart, bwEnd, bwFree)
        chargeRow(`Copies Charges B/W${sizeSuffix}`, bwRate, bw.billable * bwRate)

        const colorStart = ci?.start_meter_color || 0
        const colorEnd = item.meter_end_colour || colorStart
        const colorFree = ci?.free_quota_color || 0
        const colorRate = ci?.rate_per_page_color || bwRate
        if (colorStart > 0 || colorFree > 0 || colorEnd > colorStart) {
          const col = pushMeterSection(`Colour${sizeSuffix}`, colorStart, colorEnd, colorFree)
          chargeRow(`Copies Charges Colour${sizeSuffix}`, colorRate, col.billable * colorRate)
        }
      }
    }

    const subtotal = item.subtotal ?? (baseRentalFee + (item.excess_copies_fee || item.excess_amount || 0))
    const tax = item.tax || 0
    const totalPay = item.total_pay ?? subtotal + tax

    addRow([{}, {}, {}, { v: 'TOTAL', style: 'borderBoldRight' }, { v: subtotal, style: 'borderBoldRight', numFmt: NUMFMT_RP }])
    addRow([
      { v: 'Pembayaran Transfer ke rekening :', mergeAcross: 1, style: 'border' }, {},
      { style: 'border' },
      { v: 'D.P.P', style: 'borderBoldRight' },
      tax > 0 ? { v: subtotal, style: 'borderBoldRight', numFmt: NUMFMT_RP } : { style: 'border' },
    ])
    addRow([
      { v: 'PT. BIAS SURYA TEKNOLOGI', mergeAcross: 1, style: 'borderBoldCenter' }, {},
      { style: 'border' },
      { v: 'PPN', style: 'borderBoldRight' },
      tax > 0 ? { v: tax, style: 'borderBoldRight', numFmt: NUMFMT_RP } : { style: 'border' },
    ])
    addRow([
      { v: 'NPWP : 0941.8395.0822.5000', mergeAcross: 1, style: 'borderBoldCenter' }, {},
      { style: 'border' },
      { v: 'TOTAL PAY', style: 'borderBoldRight' },
      { v: totalPay, style: 'borderBoldRight', numFmt: NUMFMT_RP },
    ])
    addRow([{ v: 'BANK RIAU KEPRI SYARIAH CAB. BATAM', mergeAcross: 1, style: 'borderBold' }, {}, { style: 'border' }, { style: 'border' }, { style: 'border' }])
    addRow([{ v: 'Rek No. 1060885757', mergeAcross: 1, style: 'borderBold' }, {}, { style: 'border' }, { style: 'border' }, { style: 'border' }])
    addRow([{ v: 'BANK MANDIRI CABANG BATAM', mergeAcross: 1, style: 'borderBold' }, {}, { style: 'border' }, { style: 'border' }, { style: 'border' }])
    addRow([{ v: 'Rek No. 109-00-3388575-7', mergeAcross: 1, style: 'borderBold' }, {}, { style: 'border' }, { style: 'border' }, { style: 'border' }])

    // Signatures
    addRow([])
    addRow([{ v: 'Received By,', mergeAcross: 1, style: 'plainBoldCenter' }, {}, {}, { v: 'PT. BiAS SURYA TEKNOLOGI', mergeAcross: 1, style: 'plainBoldCenter' }])
    addRow([])
    addRow([{ v: '_______________________', mergeAcross: 1, style: 'plainCenter' }, {}, {}, { v: '_______________________', mergeAcross: 1, style: 'plainCenter' }])
    addRow([{ v: picDisplay, mergeAcross: 1, style: 'plainBoldCenter' }, {}, {}, { v: signer, mergeAcross: 1, style: 'plainBoldCenter' }])
    addRow([{}, {}, {}, { v: 'Admin Finance', mergeAcross: 1, style: 'plainCenter' }])

    sheets.push({ name: sheetName, columnWidths, rows })
  }

  await downloadStyledExcel([...leadingSheets, ...sheets], filename)
}

function exportMonthToPdf() {
  const items = filteredData.value
  if (items.length === 0) {
    toast.warning('No rental invoice data to export to PDF!')
    return
  }
  let periodLabel = 'Semua Periode'
  if (monthFilter.value) {
    const [y, m] = monthFilter.value.split('-')
    const mName = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
    periodLabel = mName
  } else if (startDateFilter.value || endDateFilter.value) {
    periodLabel = `${startDateFilter.value || 'Awal'} s/d ${endDateFilter.value || 'Akhir'}`
  }
  const html = renderRentalInvoicesPdf(items, `Rental Invoices - ${periodLabel}`)
  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
  }
}

function exportAnnualPdf() {
  const year = normalizeExportYear(yearFilter.value)
  if (year === null) {
    toast.warning('Invalid year (1900–2100)!')
    return
  }
  const items = filterApprovedPaid(filterByYear(data.value, year, RENTAL_INVOICE_YEAR_FIELDS))
  if (items.length === 0) {
    toast.warning(`No approved & paid rental invoice data for year ${year}!`)
    return
  }
  const html = renderRentalInvoicesPdf(items, `Rental Invoices Annual ${year}`)
  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
  }
}

const form = reactive({
  invoice_no: '',
  contract_item_id: null as any,
  customer_id: null as any,
  period_start: '',
  period_end: '',
  monthly_date: '',
  due_date: '',
  basis_rental_fee: 0,
  excess_amount: 0,
  subtotal: 0,
  tax: 0,
  total_pay: 0,
  status: 'unpaid',
  meter_start: 0,
  meter_end: 0,
  free_copies: 2000,
  rate_per_page: 150
})

const defaultForm = { ...form }

const customerFilterOptions = computed(() => [
  { value: '', label: 'All Customers' },
  ...(customers.value as any[]).map((customer: any) => ({
    value: String(customer.id),
    label: customer.company_name || customer.name || '-',
  })),
])
const riContractOptions = computed(() =>
  (contractItems.value as any[]).map((ci: any) => ({
    value: ci.id,
    label: ci.contract_no,
  })),
)
const riCustomerOptions = computed(() =>
  (customers.value as any[]).map((c: any) => ({
    value: c.id,
    label: c.company_name || c.name || '-',
  })),
)
const riStatusOptions = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
]
const riPaymentMethodOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Bank Transfer' },
  { value: 'credit_card', label: 'Credit / Debit Card' },
]

async function exportAnnualExcel() {
  if (isExporting.value) return
  // Strict filter: only records with ALL dates inside the selected year,
  // so other-year data (e.g. 2027) is excluded when exporting 2026.
  const year = normalizeExportYear(yearFilter.value)
  if (year === null) {
    toast.warning('Invalid year (1900–2100)!')
    return
  }
  // Annual export only for invoices that are approved AND paid.
  const items = filterApprovedPaid(filterByYear(data.value, year, RENTAL_INVOICE_YEAR_FIELDS))
  if (items.length === 0) {
    toast.warning(`No approved & paid rental invoice data for year ${year}!`)
    return
  }
  isExporting.value = true
  try {
    await exportInvoicesToExcel(items, `RentalInvoice_Annual_${year}`, [])
    toast.success('Annual Excel report downloaded successfully')
  } finally {
    isExporting.value = false
  }
}

function onContractChange() {
  const ci = findContractItem(form.contract_item_id)
  if (ci) {
    form.customer_id = ci.customer_id
    form.basis_rental_fee = ci.monthly_rent_fee
    recalculate()
  }
}

function recalculate() {
  const ci = findContractItem(form.contract_item_id)
  const isComputer = ci && ci.specs && ci.specs.length > 5

  if (!isComputer) {
    const totalUsage = Math.max(0, form.meter_end - form.meter_start)
    const excess = Math.max(0, totalUsage - form.free_copies)
    form.excess_amount = excess * form.rate_per_page
  }

  form.subtotal = form.basis_rental_fee + form.excess_amount
  form.total_pay = form.subtotal + form.tax
}

function openAdd() {
  editingItem.value = null
  Object.assign(form, { ...defaultForm, invoice_no: `INV-R-${Date.now().toString().slice(-6)}` })
  showModal.value = true
}

function openEdit(item: RentalInvoice) {
  editingItem.value = item
  Object.assign(form, {
    invoice_no: item.invoice_no,
    contract_item_id: item.contract_item_id,
    customer_id: item.customer_id,
    period_start: item.period_start,
    period_end: item.period_end,
    monthly_date: item.monthly_date,
    due_date: item.due_date,
    basis_rental_fee: item.basis_rental_fee,
    excess_amount: item.excess_amount,
    subtotal: item.subtotal,
    tax: item.tax,
    total_pay: item.total_pay,
    status: item.status,
    meter_start: item.meter_start || 0,
    meter_end: item.meter_end || 0,
    free_copies: item.free_copies || 2000,
    rate_per_page: item.rate_per_page || 150
  })
  showModal.value = true
}

async function handleUpdateStatus(item: any, newStatus: string) {
  try {
    await api.patch(`/rental-invoices/${item.id}`, { status: newStatus })
    await refreshInBackground()
    toast.success(`Invoice status updated to ${newStatus}`)
  } catch (error: any) {
    toast.error('Failed to update status: ' + (error.message || 'Error'))
  }
}

const showPaymentModal = ref(false)
const paymentInvoiceId = ref<string | null>(null)
const paymentForm = reactive({
  amount: 0,
  payment_date: new Date().toISOString().split('T')[0],
  payment_method: 'transfer',
  reference: '',
  notes: '',
  bank_name: '',
  account_number: '',
  sender_name: ''
})

function openPaymentModal(item: any) {
  if (item?.status === 'pending_meter_reading') {
    toast.warning('Payment blocked: technician has not submitted the meter reading for this period yet.')
    return
  }
  paymentInvoiceId.value = item.id
  paymentForm.amount = item.total_pay || item.subtotal || 0
  paymentForm.payment_date = new Date().toISOString().split('T')[0]
  paymentForm.payment_method = 'transfer'
  paymentForm.reference = ''
  paymentForm.notes = ''
  paymentForm.bank_name = ''
  paymentForm.account_number = ''
  paymentForm.sender_name = ''
  showPaymentModal.value = true
}

async function submitPayment() {
  if (!paymentInvoiceId.value || paymentForm.amount <= 0) {
    toast.error('Invalid payment amount')
    return
  }
  try {
    let finalBankName = paymentForm.bank_name
    if (paymentForm.payment_method === 'transfer' || paymentForm.payment_method === 'credit_card') {
      finalBankName = `${paymentForm.bank_name} - ${paymentForm.account_number} (A/N: ${paymentForm.sender_name})`
    }

    const payNo = `PAY-${Date.now()}`
    const paymentTs = buildPaymentTimestamp(paymentForm.payment_date)
    await api.post(`/payments`, {
      payment_no: payNo,
      rental_invoice_id: paymentInvoiceId.value,
      payment_date: paymentTs,
      amount: paymentForm.amount,
      payment_method: paymentForm.payment_method,
      bank_name: paymentForm.payment_method === 'cash' ? 'CASH' : finalBankName,
      sender_name: paymentForm.sender_name,
      reference_no: paymentForm.reference || '-',
      notes: paymentForm.notes
    })
    toast.success('Payment recorded successfully')
    const inv = data.value.find((d: any) => String(d.id) === String(paymentInvoiceId.value))
    const opened = printPaymentSlip({
      payment_no: payNo,
      invoice_no: inv?.invoice_no || '-',
      customer_name: customerName(inv?.customer_id),
      payment_date: paymentTs,
      amount: Number(paymentForm.amount || 0),
      reference_no: paymentForm.reference || '-',
      sender_name: paymentForm.sender_name,
      notes: paymentForm.notes,
      bank_name: finalBankName,
      status: 'pending',
      method: paymentForm.payment_method === 'cash' ? 'Tunai' : 'Transfer',
      cs_name: currentUser.value?.name?.trim() || '-',
    })
    if (!opened) toast.warning('Izinkan pop-up browser untuk mencetak tanda terima.')
    showPaymentModal.value = false
    refreshInBackground()
  } catch (error: any) {
    toast.error('Failed to record payment: ' + (error.message || 'Error'))
  }
}

function handleSubmit() {
  if (!form.invoice_no.trim()) return
  recalculate()
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx]!, ...form, updated_at: new Date().toISOString() }
  } else {
    data.value.push({ id: Date.now(), ...form, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })
  }
  showModal.value = false
}



function customerName(id: any): string {
  const c = findCustomer(id as any)
  return c ? c.company_name || c.name || '-' : '-'
}

function contractNo(id: any): string {
  const ci = findContractItem(id)
  return ci ? ci.contract_no : '-'
}

function formatRupiah(val: number): string {
  return 'Rp ' + val.toLocaleString('id-ID')
}

function invoiceHtml(item: any): string {
  return renderRentalInvoicesPdf([item], `Invoice - ${item.invoice_no || 'Rental'}`)
}

function printReceipt(item: any) {
  const approved = invoicePayments(item).find((payment: any) => payment.status === 'approved')
  if (!approved) {
    toast.warning('Bukti bayar tersedia setelah pembayaran disetujui Accounting.')
    return
  }
  printReceiptAsync(item, approved)
}

async function printReceiptAsync(item: any, approved: any) {
  const payload = {
    payment_no: approved.payment_no,
    invoice_no: item.invoice_no,
    customer_name: customerName(item.customer_id),
    payment_date: approved.payment_date,
    amount: Number(approved.amount || 0),
    reference_no: approved.reference_no || '-',
    sender_name: approved.sender_name,
    bank_name: approved.bank_name,
    notes: approved.notes,
    status: approved.status,
    lunas: true,
    method: paymentMethodOf(approved.bank_name) || (approved.bank_name ? 'Transfer' : undefined),
    cs_name: approved.user?.name || approved.user?.username || currentUser.value?.name?.trim() || '-',
  }
  const win = window.open('', '_blank')
  if (!win) {
    toast.warning('Izinkan pop-up browser untuk mencetak bukti bayar.')
    return
  }
  payload.qr_data_url = await generatePaymentQrDataUrl(buildPaymentVerifyUrl(payload))
  const opened = printPaymentStruk(payload, win)
  if (!opened) toast.warning('Izinkan pop-up browser untuk mencetak bukti bayar.')
}

function exportSingleRentalInvoiceToPdf(item: any) {
  const html = invoiceHtml(item)
  const w = window.open('', '_blank')
  if (w) {
    w.document.write(html)
    w.document.close()
  } else {
    toast.warning('Izinkan pop-up browser untuk mencetak / download PDF.')
  }
}

async function exportSingleRentalInvoiceToExcel(item: any) {
  if (isExporting.value) return
  isExporting.value = true
  try {
    const invNo = (item.invoice_no || `Inv_${item.id || 'draft'}`).replace(/[:\\/?*[\]]/g, '_')
    await exportInvoicesToExcel([item], `RentalInvoice_${invNo}`, [])
    toast.success(`Excel Rental Invoice ${item.invoice_no || ''} berhasil diunduh`)
  } catch (err: any) {
    toast.error('Gagal export Excel: ' + (err?.message || 'Error'))
  } finally {
    isExporting.value = false
  }
}

function printInvoice(item: any) {
  exportSingleRentalInvoiceToPdf(item)
}
</script>

<template>
  <div>
    <PageHeader title="Rental Invoices"/>

    <!-- Filter & Export Toolbar -->
    <div class="filter-toolbar">
      <div class="filter-inputs">
        <div class="filter-item">
          <label class="filter-label">Start Date</label>
          <input v-model="startDateFilter" type="date" class="form-input filter-input">
        </div>
        <div class="filter-item">
          <label class="filter-label">End Date</label>
          <input v-model="endDateFilter" type="date" class="form-input filter-input">
        </div>
        <div class="filter-item">
          <label class="filter-label">Month Filter</label>
          <input v-model="monthFilter" type="month" class="form-input filter-input" @change="onMonthFilterChange">
        </div>
        <div class="filter-item">
          <label class="filter-label">Year</label>
          <input v-model.number="yearFilter" type="number" min="1900" max="9999" class="form-input filter-input">
        </div>
        <div class="filter-item">
          <label class="filter-label">Customer</label>
          <CustomSelect v-model="customerFilter" :options="customerFilterOptions" class="form-select filter-input" />
        </div>
        <button v-if="startDateFilter || endDateFilter || monthFilter || customerFilter" type="button"
          class="btn btn-outline btn-sm filter-reset-btn" @click="resetFilters">
          Reset Filter
        </button>
      </div>

      <div class="export-actions">
        <button v-if="can('rental_invoice:read')" type="button" class="btn btn-export-pdf" @click="exportMonthToPdf"
          title="Export PDF (Filtered)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
          Export PDF
        </button>
        <button v-if="can('rental_invoice:read')" type="button" class="btn btn-export-excel" @click="exportMonthToExcel"
          :disabled="isExporting" title="Export Excel (Filtered)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="8" y1="13" x2="16" y2="13"></line>
            <line x1="8" y1="17" x2="16" y2="17"></line>
          </svg>
          Export Excel
        </button>
        <button v-if="can('rental_invoice:read')" type="button" class="btn btn-export-pdf" @click="exportAnnualPdf"
          title="Export Annual (PDF)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
          Annual PDF
        </button>
        <button v-if="can('rental_invoice:read')" type="button" class="btn btn-export-excel" @click="exportAnnualExcel"
          :disabled="isExporting" title="Export Annual (Excel)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="8" y1="13" x2="16" y2="13"></line>
            <line x1="8" y1="17" x2="16" y2="17"></line>
          </svg>
          Annual Excel
        </button>
      </div>
    </div>

    <div v-if="isLoading" style="padding: 40px; text-align: center; color: var(--color-text-muted);">
      Loading rental invoices...
    </div>
    <DataTable v-else :columns="columns" :data="filteredData" search-placeholder="Search invoices..." @edit="openEdit"
      @delete="openDelete" :perPage="20">
      <template #cell-customer_id="{ value }">{{ customerName(value as any) }}</template>
      <template #cell-contract_item_id="{ value }">{{ contractNo(value as any) }}</template>
      <template #cell-period_start="{ value }">{{ formatDate(value) }}</template>
      <template #cell-period_end="{ value }">{{ formatDate(value) }}</template>
      <template #cell-due_date="{ value }">{{ formatDate(value) }}</template>
      <template #cell-total_pay="{ value }">{{ formatRupiah(value || 0) }}</template>
      <template #cell-status="{ row }">
        <span
          :class="row.status === 'approved' ? 'badge badge-info' : row.status === 'rejected' ? 'badge badge-danger' : row.status === 'pending_meter_reading' ? 'badge badge-warning' : 'badge badge-warning'"
          :title="row.status === 'pending_meter_reading' ? 'Payment blocked until technician submits meter reading' : ''">
          {{ approvalStatusLabel(row.status) }}
        </span>
      </template>
      <template #cell-payment_status="{ value }">
        <span
          :class="value === 'paid' ? 'badge badge-success' : value === 'overdue' ? 'badge badge-danger' : value === 'partially_paid' ? 'badge badge-info' : 'badge badge-warning'">
          {{ value === 'paid' ? 'Paid' : value === 'overdue' ? 'Overdue' : value === 'partially_paid' ?
            'Partial' : 'Unpaid' }}
        </span>
      </template>
      <template #actions="{ row }">
        <div class="row-actions-container">
          <!-- GROUP 1: EXPORT DOKUMEN PER BARIS (PDF & EXCEL) -->
          <button
            v-if="can('rental_invoice:read')"
            class="action-btn action-btn--pdf"
            :title="`Export PDF / Cetak Invoice (${row.invoice_no || 'Draft'})`"
            @click.stop="exportSingleRentalInvoiceToPdf(row)"
            style="width: 36px; height: 36px;"
          >
            <svg class="action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </button>

          <button
            v-if="can('rental_invoice:read')"
            class="action-btn action-btn--excel"
            :title="`Export Excel Invoice (${row.invoice_no || 'Draft'})`"
            :disabled="isExporting"
            @click.stop="exportSingleRentalInvoiceToExcel(row)"
            style="width: 36px; height: 36px;"
          >
            <svg class="action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="8" y1="13" x2="16" y2="13"></line>
              <line x1="8" y1="17" x2="16" y2="17"></line>
              <line x1="12" y1="11" x2="12" y2="19"></line>
            </svg>
          </button>

          <button
            v-if="row.payment_status === 'paid' && can('rental_invoice:read')"
            class="action-btn action-btn--receipt"
            :title="`Cetak Bukti Pembayaran Struk (${row.invoice_no || ''})`"
            @click.stop="printReceipt(row)"
            style="width: 36px; height: 36px;"
          >
            <svg class="action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"></path>
              <line x1="8" y1="10" x2="16" y2="10"></line>
              <line x1="8" y1="14" x2="16" y2="14"></line>
            </svg>
          </button>

          <!-- Divider Pemisah Kategori -->
          <span class="action-divider"></span>

          <!-- GROUP 2: STATUS & OPERASIONAL (Bayar, Detail, Edit, Hapus) -->
          <button
            v-if="(row.status === 'unpaid' || row.status === 'draft' || row.status === 'partially_paid') && (can('payment:create') || can('rental_invoice:update'))"
            class="action-btn action-btn--edit" title="Bayar (Input Payment)" @click.stop="openPaymentModal(row)"
            style="color: #059669; width: 36px; height: 36px;">
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"></rect>
              <line x1="2" y1="10" x2="22" y2="10"></line>
            </svg>
          </button>
          <button
            v-if="row.status === 'pending_meter_reading' && can('rental_invoice:read')"
            class="action-btn" disabled
            title="Payment blocked: technician has not submitted the meter reading for this period"
            style="color: var(--color-text-muted); width: 36px; height: 36px; opacity: 0.5; cursor: not-allowed;">
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"></rect>
              <line x1="2" y1="10" x2="22" y2="10"></line>
              <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="2"></line>
            </svg>
          </button>
          <button v-if="can('rental_invoice:read')" class="action-btn action-btn--edit" title="Lihat Detail Invoice"
            @click.stop="openDetail(row)" style="color: var(--color-text-muted); width: 36px; height: 36px;">
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <button v-if="can('rental_invoice:update')" class="action-btn action-btn--edit" title="Edit Invoice"
            @click.stop="openEdit(row)" style="width: 36px; height: 36px;">
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button v-if="can('rental_invoice:delete')" class="action-btn action-btn--delete" title="Hapus Invoice"
            @click.stop="openDelete(row)" style="width: 36px; height: 36px;">
            <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
          <button
            v-if="hardDelete.isSuperadmin"
            class="action-btn action-btn--hard"
            title="Hapus permanen dari database (superadmin)"
            @click.stop="hardDelete.open(row)"
            style="width: 36px; height: 36px;"
          >
            <svg
              class="action-icon"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
              <line x1="12" y1="11" x2="12" y2="17"></line>
            </svg>
          </button>
        </div>
      </template>
    </DataTable>
 
    <ConfirmDialog :open="showConfirm" title="Delete Invoice"
      :message="`Are you sure you want to delete invoice '${deletingItem?.invoice_no}'?`" @close="showConfirm = false"
      @confirm="handleDelete" />

    <HardDeleteDialog
      :open="hardDelete.show"
      title="Hapus Permanen Rental Invoice"
      :item-label="hardDelete.expected"
      :expected="hardDelete.expected"
      :confirm-valid="hardDelete.confirmed"
      :show-cascade-option="true"
      :cascade="hardDelete.cascade"
      @update:cascade="hardDelete.cascade = $event"
      @update:input="hardDelete.input = $event"
      @confirm="hardDelete.confirm"
      @close="hardDelete.close"
    />

    <FormModal :open="showDetail" :title="detailItem ? `Invoice Details ${detailItem.invoice_no}` : 'Invoice Details'"
      @close="showDetail = false">
      <template v-if="isLoadingDetail">
        <div style="padding: 40px; text-align: center; color: var(--color-text-muted);">
          Loading invoice details...
        </div>
      </template>
      <template v-else-if="detailItem">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
          <div class="form-group">
            <label class="form-label">No. Invoice</label>
            <div>{{ detailItem.invoice_no }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Customer</label>
            <div>{{ detailCustomer.value?.company_name || detailCustomer.value?.name || '-' }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Contract</label>
            <div>{{ detailContract.value?.contract_no || '-' }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Total Amount</label>
            <div>{{ formatRupiah(detailItem.total_pay || detailItem.subtotal || 0) }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Approval Status</label>
            <span
              :class="approvalStatus(detailItem.status) === 'approved' ? 'badge badge-info' : approvalStatus(detailItem.status) === 'rejected' ? 'badge badge-danger' : 'badge badge-warning'">
              {{ approvalStatus(detailItem.status) === 'approved' ? 'Approved' : approvalStatus(detailItem.status) ===
                'rejected' ? 'Rejected' : 'Pending' }}
            </span>
          </div>
          <div class="form-group">
            <label class="form-label">Payment Status</label>
            <span
              :class="detailItem.payment_status === 'paid' ? 'badge badge-success' : detailItem.payment_status === 'overdue' ? 'badge badge-danger' : detailItem.payment_status === 'partially_paid' ? 'badge badge-info' : 'badge badge-warning'">
              {{ detailItem.payment_status === 'paid' ? 'Paid' : detailItem.payment_status === 'overdue' ? 'Overdue' :
                detailItem.payment_status === 'partially_paid' ? 'Partial' : 'Unpaid' }}
            </span>
          </div>
        </div>

        <div class="form-section-title" style="margin-bottom: 8px;">Payment History</div>
        <div v-if="detailPayments.length > 0"
          style="border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: var(--font-size-sm);">
            <thead style="background: var(--color-surface-raised); border-bottom: 1px solid var(--color-border);">
              <tr>
                <th style="padding: 12px;">Payment No.</th>
                <th style="padding: 12px;">Date</th>
                <th style="padding: 12px;">Method / Bank</th>
                <th style="padding: 12px;">Ref No.</th>
                <th style="padding: 12px; text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(pay, idx) in detailPayments" :key="idx"
                style="border-bottom: 1px solid var(--color-border-light);">
                <td style="padding: 12px;">{{ pay.payment_no || '-' }}</td>
                <td style="padding: 12px;">{{ pay.payment_date ? String(pay.payment_date).substring(0, 10) : '-' }}</td>
                <td style="padding: 12px;">{{ pay.bank_name || '-' }}</td>
                <td style="padding: 12px;">{{ pay.reference_no || '-' }}</td>
                <td style="padding: 12px; text-align: right; font-weight: 600; color: var(--color-success);">{{
                  formatRupiah(pay.amount || 0) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else
          style="padding: 16px; text-align: center; color: var(--color-text-muted); background: var(--color-surface); border-radius: var(--radius-md);">
          No payment history yet.
        </div>
      </template>
      <template #footer>
        <button class="btn btn-outline" @click="showDetail = false">Close</button>
      </template>
    </FormModal>

    <FormModal :open="showPaymentModal" title="Process Payment" @close="showPaymentModal = false"
      @submit="submitPayment">
      <div class="form-group">
        <label class="form-label">Payment Date</label>
        <input v-model="paymentForm.payment_date" type="date" class="form-input" required>
      </div>
      <div class="form-group">
        <label class="form-label">Payment Method</label>
        <CustomSelect v-model="paymentForm.payment_method" :options="riPaymentMethodOptions" class="form-select" />
      </div>

      <template v-if="paymentForm.payment_method === 'transfer'">
        <div class="form-group">
          <label class="form-label">Bank Name</label>
          <input type="text" class="form-input" v-model="paymentForm.bank_name" placeholder="E.g. BCA, Mandiri, BRI"
            required />
        </div>
        <div class="form-group">
          <label class="form-label">Account Number</label>
          <input type="text" class="form-input" v-model="paymentForm.account_number" placeholder="Sender account number"
            required />
        </div>
        <div class="form-group">
          <label class="form-label">Sender Name</label>
          <input type="text" class="form-input" v-model="paymentForm.sender_name" placeholder="Account holder name"
            required />
        </div>
      </template>

      <template v-if="paymentForm.payment_method === 'credit_card'">
        <div class="form-group">
          <label class="form-label">Card Provider / Bank</label>
          <input type="text" class="form-input" v-model="paymentForm.bank_name" placeholder="E.g. Visa, Mastercard, BCA"
            required />
        </div>
        <div class="form-group">
          <label class="form-label">Card Number (Last 4 Digits)</label>
          <input type="text" class="form-input" v-model="paymentForm.account_number" placeholder="E.g. 1234"
            maxlength="16" required />
        </div>
        <div class="form-group">
          <label class="form-label">Cardholder Name</label>
          <input type="text" class="form-input" v-model="paymentForm.sender_name" placeholder="Name as shown on card"
            required />
        </div>
      </template>

      <div class="form-group">
        <label class="form-label">Payment Amount (Rp)</label>
        <input :value="Number(paymentForm.amount || 0).toLocaleString('id-ID')" type="text" class="form-input" readonly title="Otomatis dari total invoice" style="background: var(--color-surface-raised); cursor: not-allowed;">
      </div>
      <div class="form-group">
        <label class="form-label">Reference No. / Receipt (Optional)</label>
        <input v-model="paymentForm.reference" type="text" class="form-input" placeholder="Enter reference number...">
      </div>
      <div class="form-group">
        <label class="form-label">Notes (Optional)</label>
        <textarea v-model="paymentForm.notes" class="form-input" rows="2" placeholder="Add payment notes..."></textarea>
      </div>
    </FormModal>
  </div>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-base);
}

.sale-summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-md);
  border-radius: var(--radius-base);
  background: var(--color-surface-raised);
}

.summary-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.summary-total {
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-xs);
}

.filter-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  background: var(--color-surface, #ffffff);
  padding: 16px;
  border-radius: var(--radius-lg, 12px);
  border: 1px solid var(--color-border-light, #e2e8f0);
  margin-bottom: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.filter-inputs {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-text-muted, #64748b);
  letter-spacing: 0.5px;
}

.filter-input {
  padding: 7px 12px;
  font-size: 13px;
  border-radius: 6px;
  border: 1px solid var(--color-border, #cbd5e1);
  background: var(--color-background, #ffffff);
}

.filter-reset-btn {
  height: 35px;
  align-self: flex-end;
}

.export-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-export-pdf {
  display: flex;
  align-items: center;
  background: #dc2626;
  color: white;
  border: none;
  padding: 8px 14px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-export-pdf:hover {
  background: #b91c1c;
  transform: translateY(-1px);
}

.btn-export-excel {
  display: flex;
  align-items: center;
  background: #16a34a;
  color: white;
  border: none;
  padding: 8px 14px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-export-excel:hover {
  background: #15803d;
  transform: translateY(-1px);
}

.btn-export-excel:disabled,
.btn-export-pdf:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.form-section-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
}

/* Per-Row Export Action Buttons & Separator */
.row-actions-container {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: nowrap;
}

.action-btn--pdf {
  background: #fee2e2 !important;
  color: #dc2626 !important;
  border: 1px solid #fca5a5 !important;
}
.action-btn--pdf:hover {
  background: #dc2626 !important;
  color: #ffffff !important;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(220, 38, 38, 0.35);
}

.action-btn--excel {
  background: #dcfce7 !important;
  color: #15803d !important;
  border: 1px solid #86efac !important;
}
.action-btn--excel:hover {
  background: #15803d !important;
  color: #ffffff !important;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(21, 128, 61, 0.35);
}

.action-btn--receipt {
  background: #e0f2fe !important;
  color: #0284c7 !important;
  border: 1px solid #7dd3fc !important;
}
.action-btn--receipt:hover {
  background: #0284c7 !important;
  color: #ffffff !important;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(2, 132, 199, 0.35);
}

.action-divider {
  display: inline-block;
  width: 1px;
  height: 22px;
  background-color: #cbd5e1;
  margin: 0 3px;
  flex-shrink: 0;
}

</style>
