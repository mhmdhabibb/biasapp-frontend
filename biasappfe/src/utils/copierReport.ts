/**
 * Klasifikasi "copier service report".
 *
 * `service_type === 'copier'` saja tidak cukup: tidak ada alur (form CS
 * maupun form teknisi) yang menulis nilai tersebut — form copier hanya
 * mengisi field meter, tanda tangan copier, dan monthly readings pada report
 * yang sudah ada (biasanya bertipe corrective/maintenance/dll).
 *
 * Report dianggap copier bila SALAH SATU terpenuhi:
 * - service_type 'copier' (termasuk hasil auto-generate bulanan), atau
 * - ada data meter (before/after), atau
 * - ada tanda tangan khusus copier, atau
 * - ada monthly meter readings terhubung.
 */
export function isCopierReport(item: any): boolean {
  if (!item) return false
  if (String(item.service_type || '').toLowerCase() === 'copier') return true
  if (Number(item.meter_reading_before || 0) > 0) return true
  if (Number(item.meter_reading_after || 0) > 0) return true
  if (item.customer_signature_copier || item.technician_signature_copier) return true
  const readings = item.monthly_meter_readings || item.monthlyMeterReadings
  if (Array.isArray(readings) && readings.length > 0) return true
  return false
}
