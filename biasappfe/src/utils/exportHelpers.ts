/**
 * Helper functions untuk export (Excel & PDF).
 *
 * Catatan:
 * - Paket `xlsx` (SheetJS Community Edition) TIDAK mempertahankan style/border
 *   sel saat write, sehingga file .xlsx hasil export tidak bergaris.
 * - Solusinya: gunakan `exceljs` yang menghasilkan file .xlsx asli dengan
 *   dukungan penuh border, merge cell, bold, warna, dll.
 */

import type * as ExcelJSType from 'exceljs'

/**
 * Ambil tahun (number) dari berbagai format tanggal.
 * Return null jika tidak ditemukan/valid.
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
 * Filter item berdasarkan tahun, dengan prioritas field tanggal.
 * Hanya data yang tahun-nya sama persis dengan `year` yang dikembalikan,
 * sehingga data tahun lain (mis. 2027) tidak ikut saat export tahun 2026.
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
    // Semua tanggal pada record harus berada di tahun yang dipilih,
    // sehingga data tahun 2027 tidak ikut saat export tahun 2026.
    return years.every((yy) => String(yy) === y)
  })
}

// ============================================================
// Styled Excel (.xlsx via exceljs) dengan garis/border sel
// ============================================================

export interface StyledCell {
  v?: string | number | null
  /** jumlah kolom yang di-merge ke kanan (0 = tidak merge) */
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
 * Buat workbook .xlsx (exceljs) dengan dukungan border/garis sel,
 * lalu unduh sebagai file .xlsx.
 */
export async function downloadStyledExcel(
  sheets: Array<{
    name: string
    columnWidths?: number[]
    rows: StyledCell[][]
  }>,
  filename: string,
): Promise<void> {
  // Lazy-load exceljs agar tidak membebani bundle awal (di-split ke chunk terpisah)
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
      if (!row || row.length === 0) continue // baris kosong

      const excelRow = ws.getRow(rowIndex)
      // tulis nilai & style per sel
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

      // merge cell (setelah semua sel di baris ditulis)
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
