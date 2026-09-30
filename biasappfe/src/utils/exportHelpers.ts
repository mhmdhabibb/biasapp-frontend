/**
 * Helper functions for export (Excel & PDF).
 *
 * Note:
 * - The `xlsx` package (SheetJS Community Edition) does NOT preserve cell
 *   styles/borders when writing, so exported .xlsx files have no grid lines.
 * - Solution: use `exceljs` which produces native .xlsx files with
 *   full support for borders, merged cells, bold, colors, etc.
 */

import type * as ExcelJSType from 'exceljs'

/**
 * Extract the year (number) from various date formats.
 * Return null if not found/valid.
 */
export function extractYear(dateStr: unknown): number | null {
  if (!dateStr) return null
  const s = String(dateStr).trim()
  const m = s.match(/(\d{4})/)
  if (!m || !m[1]) return null
  const y = parseInt(m[1], 10)
  if (isNaN(y) || y < 1900 || y > 2100) return null
  return y
}

/**
 * Date field used for yearly filtering.
 * Kept consistent across all invoice pages so yearly export behavior stays uniform.
 */
export const RENTAL_INVOICE_YEAR_FIELDS = ['invoice_date', 'monthly_date', 'period_start', 'period_end', 'created_at']
export const SALES_INVOICE_YEAR_FIELDS = ['invoice_date', 'due_date', 'created_at']

/**
 * Normalize year input to a number 1900..2100, or null if invalid.
 */
export function normalizeExportYear(input: unknown): number | null {
  const y = typeof input === 'number' ? input : parseInt(String(input ?? '').trim(), 10)
  if (!Number.isInteger(y) || y < 1900 || y > 2100) return null
  return y
}

/**
 * Check that an invoice is approved AND paid.
 * Approved: `status === 'approved'` (backend format; `approval_status` supported
 * as a legacy-format fallback). Paid: `payment_status === 'paid'`.
 */
export function isApprovedAndPaid(item: any): boolean {
  const approved = item?.approval_status === 'approved' || item?.status === 'approved'
  const paid = item?.payment_status === 'paid' || item?.status === 'paid'
  return approved && paid
}

/**
 * Keep only invoices that are approved and paid.
 * Used for yearly (Excel & PDF) rental/sales invoice exports.
 */
export function filterApprovedPaid<T = any>(items: T[]): T[] {
  return items.filter((it) => isApprovedAndPaid(it))
}

/**
 * Unique Excel sheet name (max 31 chars, no forbidden characters).
 * `used` holds already-used names (lowercase) and is filled automatically.
 */
export function uniqueSheetName(base: unknown, used: Set<string>): string {
  const clean = String(base || 'Customer').replace(/[\\/*?:\[\]]/g, '').trim().slice(0, 31) || 'Customer'
  let name = clean
  let n = 2
  while (used.has(name.toLowerCase())) {
    const suf = `_${n++}`
    name = `${clean.slice(0, 31 - suf.length)}${suf}`
  }
  used.add(name.toLowerCase())
  return name
}

export interface RecapRow {
  no: number
  customer: string
  invoiceNo: string
  period: string
  total: number
}

/**
 * "Recap" sheet placed first in yearly exports:
 * title + summary table + grand total.
 */
export function buildRecapSheet(
  title: string,
  subtitle: string,
  rows: RecapRow[],
): { name: string; columnWidths: number[]; rows: StyledCell[][] } {
  const fmtRp = (n: number) => (n > 0 ? n.toLocaleString('id-ID') : n === 0 ? '0' : String(n))
  const sheetRows: StyledCell[][] = [
    [{ v: title, mergeAcross: 4, style: 'titleCell' }],
    [{ v: subtitle, mergeAcross: 4, style: 'subTitleCell' }],
    [],
    [
      { v: 'No', style: 'headerCell' },
      { v: 'Customer', style: 'headerCell' },
      { v: 'Invoice No', style: 'headerCell' },
      { v: 'Period / Date', style: 'headerCell' },
      { v: 'Total (Rp)', style: 'headerCell' },
    ],
  ]
  let grandTotal = 0
  for (const r of rows) {
    grandTotal += r.total
    sheetRows.push([
      { v: r.no, style: 'borderCenter' },
      { v: r.customer, style: 'border' },
      { v: r.invoiceNo, style: 'border' },
      { v: r.period, style: 'border' },
      { v: fmtRp(r.total), style: 'borderRight' },
    ])
  }
  sheetRows.push([
    { v: `Grand Total (${rows.length} invoice)`, mergeAcross: 3, style: 'grandTotalCell' },
    { v: fmtRp(grandTotal), style: 'grandTotalCell' },
  ])
  return { name: 'Recap', columnWidths: [6, 32, 22, 22, 20], rows: sheetRows }
}

/**
 * Filter items by year.
 * Only records whose year exactly matches `year` are returned,
 * so other years (e.g. 2027) are excluded when exporting 2026.
 */
export function filterByYear<T = any>(
  items: T[],
  year: number | string,
  dateFields: string[] = ['invoice_date', 'monthly_date', 'period_start', 'created_at'],
): T[] {
  const y = String(year).trim()
  return items.filter((it: any) => {
    const years = dateFields.map((f) => extractYear(it?.[f])).filter((v) => v !== null) as number[]
    if (years.length === 0) return false
    // All dates on the record must fall in the selected year,
    // so 2027 data is excluded when exporting 2026.
    return years.every((yy) => String(yy) === y)
  })
}

// ============================================================
// Styled Excel (.xlsx via exceljs) with cell borders/grid lines
// ============================================================

export interface StyledCell {
  v?: string | number | null
  /** number of columns merged to the right (0 = no merge) */
  mergeAcross?: number
  /**
   * id style:
   * 'border' | 'borderRight' | 'borderCenter' | 'borderBold' |
   * 'headerCell' | 'totalCell' | 'grandTotalCell' |
   * 'titleCell' | 'subTitleCell' | 'plainBold'
   */
  style?: string
  align?: 'Left' | 'Center' | 'Right'
}

const THIN: Partial<ExcelJSType.Border> = { style: 'thin', color: { argb: 'FF000000' } }
const ALL_BORDERS: Partial<ExcelJSType.Borders> = { top: THIN, bottom: THIN, left: THIN, right: THIN }

function applyCellStyle(cell: ExcelJSType.Cell, styleId?: string): void {
  if (!styleId) return
  switch (styleId) {
    case 'border':
      cell.border = ALL_BORDERS
      cell.alignment = { vertical: 'middle' }
      break
    case 'borderRight':
      cell.border = ALL_BORDERS
      cell.alignment = { vertical: 'middle', horizontal: 'right' }
      break
    case 'borderCenter':
      cell.border = ALL_BORDERS
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      break
    case 'borderBold':
      cell.border = ALL_BORDERS
      cell.font = { name: 'Calibri', size: 11, bold: true }
      cell.alignment = { vertical: 'middle' }
      break
    case 'headerCell':
      cell.border = ALL_BORDERS
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A56DB' } }
      cell.alignment = { vertical: 'middle' }
      break
    case 'totalCell':
      cell.border = ALL_BORDERS
      cell.font = { name: 'Calibri', size: 11, bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
      cell.alignment = { vertical: 'middle' }
      break
    case 'grandTotalCell':
      cell.border = ALL_BORDERS
      cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A56DB' } }
      cell.alignment = { vertical: 'middle' }
      break
    case 'titleCell':
      cell.font = { name: 'Calibri', size: 16, bold: true }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      break
    case 'subTitleCell':
      cell.font = { name: 'Calibri', size: 11, italic: true }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      break
    case 'plainBold':
      cell.font = { name: 'Calibri', size: 11, bold: true }
      cell.alignment = { vertical: 'middle' }
      break
    case 'borderBoldCenter':
      cell.border = ALL_BORDERS
      cell.font = { name: 'Calibri', size: 11, bold: true }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      break
    case 'borderBoldRight':
      cell.border = ALL_BORDERS
      cell.font = { name: 'Calibri', size: 11, bold: true }
      cell.alignment = { vertical: 'middle', horizontal: 'right' }
      break
    case 'plainRight':
      cell.alignment = { vertical: 'middle', horizontal: 'right' }
      break
    case 'plainCenter':
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      break
    case 'plainLeft':
      cell.alignment = { vertical: 'middle', horizontal: 'left' }
      break
    case 'plainBoldCenter':
      cell.font = { name: 'Calibri', size: 11, bold: true }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      break
  }
}

/**
 * Create a .xlsx workbook (exceljs) with cell border/grid-line support,
 * then download it as a .xlsx file.
 */
export async function downloadStyledExcel(
  sheets: Array<{
    name: string
    columnWidths?: number[]
    rows: StyledCell[][]
  }>,
  filename: string,
): Promise<void> {
  // Lazy-load exceljs so the initial bundle stays light (split into a separate chunk)
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const usedNames = new Set<string>()

  for (const sheet of sheets) {
    let safeName = String(sheet.name || 'Sheet').replace(/[\\/*?:\[\]]/g, '').trim().slice(0, 31) || 'Sheet'
    let n = 2
    while (usedNames.has(safeName.toLowerCase())) {
      const suf = `_${n++}`
      safeName = `${safeName.slice(0, 31 - suf.length)}${suf}`
    }
    usedNames.add(safeName.toLowerCase())

    const ws = workbook.addWorksheet(safeName)

    if (sheet.columnWidths) {
      ws.columns = sheet.columnWidths.map((w) => ({ width: w }))
    }

    let rowIndex = 0
    for (const row of sheet.rows) {
      rowIndex++
      if (!row || row.length === 0) continue // empty row

      const excelRow = ws.getRow(rowIndex)
      // write value & style per cell
      for (let c = 0; c < row.length; c++) {
        const cellDef = row[c]
        if (!cellDef) continue
        const excelCell = excelRow.getCell(c + 1)
        if (cellDef.v !== undefined && cellDef.v !== null && cellDef.v !== '') {
          excelCell.value = cellDef.v as any
        }
        applyCellStyle(excelCell, cellDef.style)
      }
      excelRow.commit?.()

      // merge cells (after all cells in the row are written)
      let colIndex = 1
      for (const cellDef of row) {
        if (cellDef?.mergeAcross && cellDef.mergeAcross > 0) {
          ws.mergeCells(rowIndex, colIndex, rowIndex, colIndex + cellDef.mergeAcross)
          colIndex += cellDef.mergeAcross + 1
        } else {
          colIndex++
        }
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
