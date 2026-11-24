// @ts-nocheck
import { printServiceReport, downloadServiceReportPdf } from "@/utils/printReport";

/** DO dianggap punya service history bila teknisi sudah mengisi formnya. */
export function hasDeliveryHistory(d: any): boolean {
  if (!d) return false;
  if (d.is_tested || d.is_completed) return true;
  if (d.time_in || d.time_out) return true;
  if (d.customer_signature || d.technician_signature) return true;
  if (d.photo_before || d.photo_progress || d.photo_after) return true;
  if (d.action) return true;
  if (d.problem && !String(d.problem).startsWith("Auto-generated")) return true;
  return false;
}

/**
 * Cetak SERVICE HISTORY untuk delivery order.
 * Menggunakan sistem form Service History terpadu:
 * jika unit/item di DO lebih dari 1, otomatis dicetak terpisah (1 halaman per unit/SN).
 */
export async function printDeliveryServiceHistory(item: any): Promise<boolean> {
  if (!item) return false;
  return printServiceReport(item, "history");
}

/**
 * Download PDF SERVICE HISTORY untuk delivery order.
 */
export async function downloadDeliveryServiceHistoryPdf(item: any): Promise<boolean> {
  if (!item) return false;
  return downloadServiceReportPdf(item, "history");
}
