function dateValue(value: unknown): number | null {
  if (!value) return null;
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function dateKey(value: unknown): string | null {
  const parsed = dateValue(value);
  return parsed === null ? null : new Date(parsed).toISOString().slice(0, 10);
}

export function normalizeMeterMode(m: unknown): "bw" | "color" {
  return /colou?r/i.test(String(m || "")) ? "color" : "bw";
}

export interface MeterSizeSection {
  paper_size_id: string;
  paper_size_name: string;
  bw: { before: number; after: number } | null;
  color: { before: number; after: number } | null;
}

function numOrZero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Kelompokkan monthly readings per ukuran kertas + mode (B/W & Colour)
 *  untuk ditampilkan di report (digital & cetak). */
export function groupMeterReadingsBySize(readings: any[]): MeterSizeSection[] {
  const map = new Map<string, MeterSizeSection>();
  for (const r of readings || []) {
    const psId = String(r?.paper_size_id || "");
    const key = psId || "-";
    if (!map.has(key)) {
      map.set(key, {
        paper_size_id: psId,
        paper_size_name:
          r?.paper_size?.name ||
          r?.paper_size_name ||
          (psId ? `Ukuran ${psId.slice(0, 8)}` : "Tanpa ukuran"),
        bw: null,
        color: null,
      });
    }
    const sec = map.get(key)!;
    const mode = normalizeMeterMode(r?.color_mode);
    sec[mode] = {
      before: numOrZero(r?.start_meter),
      after: numOrZero(r?.end_meter),
    };
  }
  return [...map.values()].sort((a, b) =>
    a.paper_size_name.localeCompare(b.paper_size_name),
  );
}

export function findPreviousServiceReportMeter(
  currentReport: any,
  reports: any[],
  contractItems: any[] = [],
): number | null {
  const unitId = String(
    currentReport?.unit_id || currentReport?.unit?.id || "",
  );
  if (!unitId) return null;

  const customerId = String(
    currentReport?.customer_id || currentReport?.customer?.id || "",
  );
  const currentDate =
    currentReport?.service_date ||
    currentReport?.visit_date ||
    currentReport?.created_at;
  const currentTime = dateValue(currentDate);
  if (currentTime === null) return null;

  const matchingContracts = contractItems.filter(
    (item) =>
      String(item.unit_id || item.unit?.id || "") === unitId &&
      (!customerId ||
        String(item.customer_id || item.contract?.customer_id || "") ===
          customerId),
  );
  const currentDateKey = dateKey(currentDate);
  const contractPeriods = matchingContracts
    .map((item) => ({
      id: String(item.id || ""),
      start: dateKey(item.start_date || item.contract?.start_date),
      end: dateKey(item.end_date || item.contract?.end_date),
    }))
    .filter((period) => period.start || period.end);
  const explicitContractId = String(currentReport.contract_item_id || "");
  const currentPeriod =
    contractPeriods.find((period) => period.id === explicitContractId) ||
    contractPeriods.find(
      (period) =>
        currentDateKey &&
        (!period.start || currentDateKey >= period.start) &&
        (!period.end || currentDateKey <= period.end),
    );

  if (contractPeriods.length && !currentPeriod) return null;

  const previousReports = reports
    .filter((report) => {
      if (String(report.id) === String(currentReport.id)) return false;
      if (String(report.unit_id || report.unit?.id || "") !== unitId)
        return false;
      if (
        customerId &&
        String(report.customer_id || report.customer?.id || "") !== customerId
      )
        return false;

      const visitDate =
        report.service_date || report.visit_date || report.created_at;
      const visitTime = dateValue(visitDate);
      if (visitTime === null || visitTime >= currentTime) return false;

      if (currentPeriod) {
        const visitDateKey = dateKey(visitDate);
        if (
          !visitDateKey ||
          (currentPeriod.start && visitDateKey < currentPeriod.start) ||
          (currentPeriod.end && visitDateKey > currentPeriod.end)
        )
          return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aTime =
        dateValue(a.service_date || a.visit_date || a.created_at) || 0;
      const bTime =
        dateValue(b.service_date || b.visit_date || b.created_at) || 0;
      return bTime - aTime;
    });

  for (const report of previousReports) {
    const value = report.meter_reading_after ?? report.reading_counter;
    const meter = Number(value);
    if (
      value !== null &&
      value !== undefined &&
      Number.isFinite(meter) &&
      meter > 0
    )
      return meter;
  }
  return null;
}
