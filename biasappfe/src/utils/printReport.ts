import { useMasterStore } from "@/composables/useMasterStore";


interface ReportCtx {
  masterStore: any;
  customer: any;
  u: any;
  brand: any;
  tech: any;
  custName: string;
  custPhone: string;
  picName: string;
  custAddress: string;
  custCategory: string;
  dateStr: string;
  contract: any;
  isCopier: boolean;
}

function fmtTime(v: any): string {
  if (!v) return "-";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString("en-GB", {
        dateStyle: "short",
        timeStyle: "short",
      });
    }
  }
  return s;
}

function buildCtx(item: any): ReportCtx {
  const masterStore = useMasterStore();

  const customer: any = masterStore.findCustomer(item.customer_id) || {};
  const u: any = masterStore.findUnit(item.unit_id) || {};
  const brand: any = masterStore.findBrand(u.brand_id);
  const tech: any = masterStore.findTechnician(item.technician_id) || {};

  const contractItems: any[] =
    (masterStore.contractItems as any)?.value || masterStore.contractItems || [];
  // Service reports have no contract_item_id — find the contract via the unit.
  // Contract item rates = copies of rental_item_rates (auto-created with the rental).
  const contractByUnit = contractItems.find(
    (ci: any) =>
      String(ci.unit_id || ci.unit?.id || "") === String(item.unit_id || u?.id || "") &&
      String(ci.unit_id || ci.unit?.id || "") !== "",
  );

  return {
    masterStore,
    customer,
    u,
    brand,
    tech,
    custName: customer.company_name || customer.name || "-",
    custPhone: customer.phone || "-",
    picName: customer.pic_name || "-",
    custAddress: customer.address || "-",
    custCategory: item.customer_category || customer.category || "Corporate",
    dateStr: item.service_date
      ? new Date(item.service_date).toLocaleDateString("en-GB")
      : "-",
    contract:
      masterStore.findContractItem(item.contract_item_id) || contractByUnit,
    isCopier: !!u.is_copier,
  };
}

import biasLogoUrl from '@/assets/bias-logo.png';

const companyHeaderHtml = `
  <table class="header-table">
    <tr>
      <td class="logo-col">
        <img src="${biasLogoUrl}" class="logo" alt="BiAS Logo" style="width: 75px; height: 75px; object-fit: contain;" />
      </td>
      <td class="info-col">
        <div class="company-name">PT. BIAS SURYA TEKNOLOGI</div>
        <div class="tagline">The shape of smart</div>
        <div class="address">
          Ruko Purimas Blok A No.47 Kota Batam, Kepulauan Riau - Indonesia<br>
          Phone: +62811 704 5657  Email: admin@biasbst.com<br>
          Website: www.biassuryateknologi.com
        </div>
      </td>
    </tr>
  </table>
`;

function sparepartsListHtml(item: any, ctx: ReportCtx): string {
  return (item.service_spareparts || item.spareparts || [])
    .map((sp: any, i: number) => {
      const p = ctx.masterStore.findProduct(sp.product_id);
      return (
        "<div>" + (i + 1) + ". " + (p ? p.name : "") + " (" + sp.qty + ")</div>"
      );
    })
    .join("");
}

function componentsGridHtml(item: any, ctx: ReportCtx): string {
  return Array.from({ length: 8 })
    .map((_, i) => {
      const sp = (item.service_spareparts || item.spareparts || [])[i];
      if (sp) {
        const p = ctx.masterStore.findProduct(sp.product_id);
        return (
          '<div class="comp-item">' +
          (i + 1) +
          ". " +
          (p ? p.name : "") +
          " (" +
          sp.qty +
          ")</div>"
        );
      }
      return '<div class="comp-item">' + (i + 1) + ". </div>";
    })
    .join("");
}

function testedCompleteTableHtml(item: any): string {
  return `
    <table class="tested-table">
      <tr>
        <td class="tt-label">Tested</td>
        <td class="tt-val">: ${item.is_tested ? "YES" : "NO"}</td>
      </tr>
      <tr>
        <td class="tt-label">Complete</td>
        <td class="tt-val">: ${item.is_completed ? "YES" : "NO"}</td>
      </tr>
      <tr>
        <td class="tt-label">Time in</td>
        <td class="tt-val">: ${fmtTime(item.time_in)}</td>
      </tr>
      <tr>
        <td class="tt-label">Time Out</td>
        <td class="tt-val">: ${fmtTime(item.time_out)}</td>
      </tr>
    </table>
  `;
}

function numVal(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Print "before" meter: same fallback as the technician form.
 *  1. saved meter_reading_before / reading_counter
 *  2. largest end_meter from linked monthly readings
 *  3. unit current_meter (||, not ??)
 *  4. contract start_mono/color values. */
function resolveMeterBefore(item: any, ctx: ReportCtx): string {
  const saved = numVal(item.meter_reading_before) || numVal(item.reading_counter)
  if (saved > 0) return String(saved)
  const readings: any[] =
    item.monthly_meter_readings || item.monthlyMeterReadings || []
  let lastEnd = 0
  for (const r of readings) {
    lastEnd = Math.max(lastEnd, numVal(r.end_meter) || numVal(r.start_meter))
  }
  if (lastEnd > 0) return String(lastEnd)
  const fromUnit = numVal(ctx.u?.current_meter_bw) || numVal(ctx.u?.current_meter_color)
  if (fromUnit > 0) return String(fromUnit)
  const rates: any = ctx.contract
  const fromContract = numVal(rates?.start_mono_value) || numVal(rates?.start_color_value)
  if (fromContract > 0) return String(fromContract)
  return item.meter_reading_before ?? item.reading_counter ?? ""
}

function resolveMeterAfter(item: any): string {
  const after = numVal(item.meter_reading_after) || numVal(item.reading_counter)
  if (after > 0) return String(after)
  return item.meter_reading_after ?? item.reading_counter ?? ""
}

/** Blok METER READING form cetak copier: rincian per ukuran kertas bila
 *  readings terhubung sudah ada, else ringkasan BEFORE/AFTER tunggal (legacy). */
/** Blok METER READING form cetak copier: tanpa rincian paper size — selalu
 *  total Before dan After. Bila readings terhubung ada, nilainya penjumlahan
 *  semua baris (1 ukuran = nilainya sendiri); bila tidak ada, fallback ke
 *  resolveMeterBefore/After (simpanan -> unit -> kontrak). */
function copierMeterBlockHtml(item: any, ctx: ReportCtx): string {
  const readings: any[] =
    item.monthly_meter_readings || item.monthlyMeterReadings || [];
  let before = "";
  let after = "";
  if (readings.length > 0) {
    let totalBefore = 0;
    let totalAfter = 0;
    for (const r of readings) {
      totalBefore += Number(r.start_meter || 0);
      totalAfter += Number(r.last_meter ?? r.end_meter ?? 0);
    }
    before = totalBefore.toLocaleString("id-ID");
    after = totalAfter.toLocaleString("id-ID");
  } else {
    before = resolveMeterBefore(item, ctx);
    after = resolveMeterAfter(item);
  }
  return `
        <tr><td colspan="2" class="bg-black">METER READING</td></tr>
        <tr>
          <td class="text-center">BEFORE</td>
          <td class="text-center">AFTER</td>
        </tr>
        <tr>
          <td class="text-center">${before}</td>
          <td class="text-center">${after}</td>
        </tr>`;
}

function copierSignaturesHtml(item: any, ctx: ReportCtx): string {
  const techName = item.technician_name_copier || item.technician_name || ctx.tech.name || ctx.tech.full_name || ctx.tech.user?.name || "";
  const custName = item.customer_name_copier || item.customer_name || ctx.picName || "";
  return `
    <table class="grid-table" style="border-top: none;">
      <tr>
        <td style="width: 50%; text-align: center; border-top: none;">
          TESTED YES / NO<br><br><br>
          ${item.technician_signature_copier ? '<img src="' + item.technician_signature_copier + '" style="max-height: 50px;" />' : "<br><br>"}
        </td>
        <td style="width: 50%; text-align: center; border-top: none;">
          COMPLETE YES / NO<br><br><br>
          ${item.customer_signature_copier ? '<img src="' + item.customer_signature_copier + '" style="max-height: 50px;" />' : "<br><br>"}
        </td>
      </tr>
      <tr>
          <td style="text-align: center;">TECHNICIAN<br>${techName}</td>
        <td style="padding: 0; vertical-align: bottom;">
          <div style="text-align: center; margin-bottom: 2px;">CUSTOMER<br>${custName}</div>
          <div class="bg-black" style="font-size: 9px; padding: 2px;">Signature & Company Stamp</div>
        </td>
      </tr>
    </table>
  `;
}

function signatureBlockHtml(item: any, ctx: ReportCtx, type: 'technical' | 'history' = 'history'): string {
  const techSig = type === 'technical' ? item.technician_signature_technical : item.technician_signature;
  const custSig = type === 'technical' ? item.customer_signature_technical : item.customer_signature;
  const techName = type === 'technical'
    ? item.technician_name_technical || item.technician_name || ctx.tech.user?.name || ctx.tech.name || ctx.tech.full_name || ""
    : item.technician_name || ctx.tech.user?.name || ctx.tech.name || ctx.tech.full_name || "";
  const custName = type === 'technical'
    ? item.customer_name_technical || item.customer_name || ctx.picName
    : item.customer_name || ctx.picName;
  return `
    <div class="signature-block">
      <div class="sig-side">
        <div>TECHNICIAN</div>
        <div class="sig-line">${techSig ? '<img src="' + techSig + '" style="max-height: 50px;" />' : "<br><br><br>"}</div>
        <div class="sig-name">${techName}</div>
      </div>
      <div class="sig-side sig-customer">
        <div class="sig-cust">CUSTOMER<br>
          ${custSig ? '<img src="' + custSig + '" style="max-height: 50px;" />' : ""}
          <div class="sig-name">${custName}</div>
        </div>
        <div class="sig-stamp">Signature & Company Stamp</div>
      </div>
    </div>
  `;
}

/* =========================================================
   FORM 1 — TECHNICAL REPORT FORM
   ========================================================= */
function technicalReportBody(item: any, ctx: ReportCtx): string {
  return `
    <div class="container">
      ${companyHeaderHtml}
      <div class="title-bar" style="font-size: 22px;">Technical Report Form</div>
      <table class="meta-table">
        <tr>
          <td>PRODUCT TYPES : ${ctx.u.is_computer ? "Computer/Desktop" : ctx.isCopier ? "Photocopy" : "Printer / Non-Photocopy"}</td>
          <td class="right-col">DATE : ${ctx.dateStr}</td>
        </tr>
     
      </table>
      <div class="section-title">CUSTOMER DETAIL</div>
      <table class="data-table">
        <tr><td class="label-col">Company Name</td><td class="val-col"> ${ctx.custName}</td></tr>
        <tr><td class="label-col">Customer Type</td><td class="val-col"> ${ctx.custCategory}</td></tr>
        <tr><td class="label-col">Project Name</td><td class="val-col"> ${item.project_name || "-"}</td></tr>
        <tr><td class="label-col">Address</td><td class="val-col"> ${ctx.custAddress}</td></tr>
        <tr><td class="label-col">Phone</td><td class="val-col"> ${ctx.custPhone}</td></tr>
        <tr><td class="label-col">Personnel Incharges</td><td class="val-col"> ${ctx.picName}</td></tr>
      </table>
      <div class="section-title">PRODUCT DETAIL</div>
      <table class="data-table">
        <tr><td class="label-col">Brand</td><td class="val-col"> ${ctx.brand?.name || "-"}</td></tr>
        <tr><td class="label-col">Model/Type</td><td class="val-col"> ${ctx.u.model || "-"}</td></tr>
        <tr><td class="label-col">Serial Number</td><td class="val-col"> ${ctx.u.serial_no || "-"}</td></tr>
        <tr><td class="label-col" style="height: 50px;">Problem</td><td class="val-col"> ${item.machine_problem || "-"}</td></tr>
        <tr><td class="label-col" style="height: 50px;">Repair Action</td><td class="val-col">${item.repair_action || "-"}</td></tr>
        <tr>
          <td class="label-col">Component Replacement</td>
          <td class="val-col"><div class="components-grid">${componentsGridHtml(item, ctx)}</div></td>
        </tr>
        <tr>
          <td class="label-col">Service Result</td>
          <td class="val-col"> ${item.status === "in_progress" ? "Continue" : item.status === "completed" ? "Done (Test OK)" : item.status || "-"}
            ${item.status === "in_progress" && item.next_sparepart ? "<br>&nbsp;&nbsp;Next Sparepart: " + item.next_sparepart : ""}
          </td>
        </tr>
        <tr><td class="label-col" style="height: 40px;">Remarks</td><td class="val-col"> ${item.remarks || "-"}</td></tr>
      </table>
      <table class="bottom-table">
        <tr>
          <td style="width: 50%; border-right: 2px solid #000;">
            <div style="margin-bottom: 20px;">TESTED YES / NO</div>
          </td>
          <td>
            <div class="kv"><div class="kv-k">Tested</div><div>: ${item.is_tested ? "YES" : "NO"}</div></div>
            <div class="kv"><div class="kv-k">Complete</div><div>: ${item.is_completed ? "YES" : "NO"}</div></div>
            <div class="kv"><div class="kv-k">Time in</div><div>: ${fmtTime(item.time_in)}</div></div>
            <div class="kv"><div class="kv-k">Time Out</div><div>: ${fmtTime(item.time_out)}</div></div>
          </td>
        </tr>
      </table>
      ${signatureBlockHtml(item, ctx, 'technical')}
    </div>
  `;
}

/* =========================================================
   FORM 2 — SERVICE REPORT FORM
   ========================================================= */
function serviceReportBody(item: any, ctx: ReportCtx): string {
  return `
    <div class="container">
      ${companyHeaderHtml}
      <div class="title-bar" style="font-size: 22px;">SERVICE HISTORY</div>
      <table class="meta-table">
       
       
        <tr>
          <td>Date In ${ctx.dateStr}</td>
       
        </tr>
      </table>
      <div class="section-title">CUSTOMER DETAIL</div>
      <table class="data-table">
        <tr><td class="label-col">Company Name</td><td class="val-col"> ${ctx.custName}</td></tr>
        <tr><td class="label-col">Customer Type</td><td class="val-col"> ${ctx.custCategory}</td></tr>
        <tr><td class="label-col">Project Name</td><td class="val-col"> ${item.project_name || "-"}</td></tr>
        <tr><td class="label-col">Address</td><td class="val-col"> ${ctx.custAddress}</td></tr>
        <tr><td class="label-col">Phone</td><td class="val-col"> ${ctx.custPhone}</td></tr>
        <tr><td class="label-col">Personnel Incharges</td><td class="val-col"> ${ctx.picName}</td></tr>
      </table>
       <div class="section-title">PRODUCT DETAIL</div>
      <table class="data-table">
        <tr><td class="label-col">Brand</td><td class="val-col"> ${ctx.brand?.name || "-"}</td></tr>
        <tr><td class="label-col">Product Type</td><td class="val-col">  ${ctx.u.is_computer ? "Computer/Desktop" : ctx.isCopier ? "Photocopy" : "Printer / Non-Photocopy"}</td></tr>
        <tr><td class="label-col">Model/Type</td><td class="val-col"> ${ctx.u.model || "-"}</td></tr>
        <tr><td class="label-col">Serial Number</td><td class="val-col"> ${ctx.u.serial_no || "-"}</td></tr>
        <tr><td class="label-col" style="height: 50px;">Problem</td><td class="val-col"> ${item.machine_problem || "-"}</td></tr>
       
        
        <tr><td class="label-col" style="height: 40px;">Remarks</td><td class="val-col"> ${item.remarks || "-"}</td></tr>
      </table>
 
      <table class="bottom-table">
        <tr>
          <td style="width: 50%; border-right: 2px solid #000;">
            <div style="margin-bottom: 20px;">TESTED YES / NO</div>
          </td>
          <td>
            <div class="kv"><div class="kv-k">Tested</div><div>${item.is_tested ? "YES" : "NO"}</div></div>
            <div class="kv"><div class="kv-k">Complete</div><div>${item.is_completed ? "YES" : "NO"}</div></div>
            <div class="kv"><div class="kv-k">Time in</div><div>${fmtTime(item.time_in)}</div></div>
            <div class="kv"><div class="kv-k">Time Out</div><div>${fmtTime(item.time_out)}</div></div>
          </td>
        </tr>
      </table>
      ${signatureBlockHtml(item, ctx, 'history')}
  `;
}

/* =========================================================
   FORM 3 — COPIER SERVICE REPORT (copier units only)
   ========================================================= */
function copierServiceReportBody(item: any, ctx: ReportCtx): string {
  return `
    <div class="container">
      ${companyHeaderHtml}
      <div class="title-bar">COPIER SERVICE REPORT</div>
      <table class="grid-table">
        <tr>
          <td colspan="2" class="text-center" style="width: 60%;">SERVICE REPORT</td>
          <td colspan="2">DATE : ${ctx.dateStr}</td>
        </tr>
        <tr>
          <td style="width: 25%;" class="bg-black">COMPANY NAME :</td>
          <td style="width: 35%;">${ctx.custName}</td>
          <td colspan="2" class="text-center">CUSTOMER TYPE</td>
        </tr>
        <tr>
          <td rowspan="2" class="bg-black">ADDRESS :</td>
          <td rowspan="2">${ctx.custAddress}</td>
          <td style="width: 20%; text-align: right;">CONTRACT</td>
          <td style="width: 20%; text-align: center;">${ctx.contract ? "✓" : ""}</td>
        </tr>
        <tr>
          <td style="text-align: right;">RENTAL</td>
          <td style="text-align: center;">${!ctx.contract ? "✓" : ""}</td>
        </tr>
        <tr>
          <td class="bg-black">PHONE :</td>
          <td>${ctx.custPhone}</td>
          <td style="text-align: right;">SALES</td>
          <td style="text-align: center;"></td>
        </tr>
        <tr>
          <td class="bg-black">PRODUCT/TYPE</td>
          <td class="bg-black">SERIAL NUMBER</td>
          <td colspan="2" rowspan="13" style="vertical-align: top;">
            <div class="text-center" style="border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 3px;">REMARKS</div>
            <div style="font-weight: normal;">${item.remarks || ""}</div>
          </td>
        </tr>
        <tr>
          <td class="text-center">${ctx.u.model || "-"}</td>
          <td class="text-center">${ctx.u.serial_no || "-"}</td>
        </tr>
        ${copierMeterBlockHtml(item, ctx)}
        <tr><td colspan="2" class="bg-black">CHANGE SPAREPART</td></tr>
        <tr>
          <td colspan="2" style="height: 60px; vertical-align: top; font-weight: normal;">${sparepartsListHtml(item, ctx)}</td>
        </tr>
        <tr><td colspan="2" class="bg-black">MACHINE PROBLEM</td></tr>
        <tr>
          <td colspan="2" style="height: 60px; vertical-align: top; font-weight: normal;">${item.machine_problem || ""}</td>
        </tr>
        <tr>
          <td colspan="2" style="height: 40px; vertical-align: top; font-weight: normal;">${item.repair_action || ""}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding: 0;">${testedCompleteTableHtml(item)}</td>
        </tr>
      </table>
      ${copierSignaturesHtml(item, ctx)}
    </div>
  `;
}

function servicePhotosBody(item: any): string {
  if (!item.photo_before && !item.photo_after) return "";
  return `
    <div class="container" style="border: none;">
      <div class="title-bar" style="font-size: 22px; margin-bottom: 20px;">SERVICE PHOTOS</div>
      <div style="display: flex; gap: 20px; justify-content: space-around;">
        ${item.photo_before ? `<div style="text-align: center; width: 48%;">
          <div style="font-weight: bold; margin-bottom: 10px;">BEFORE SERVICE</div>
          <img src="${item.photo_before}" style="max-width: 100%; max-height: 400px; border: 1px solid #000;" />
        </div>` : ""}
        ${item.photo_after ? `<div style="text-align: center; width: 48%;">
          <div style="font-weight: bold; margin-bottom: 10px;">AFTER SERVICE</div>
          <img src="${item.photo_after}" style="max-width: 100%; max-height: 400px; border: 1px solid #000;" />
        </div>` : ""}
      </div>
    </div>
  `;
}

/* =========================================================
   PHOTO DOKUMENTASI — satu halaman, tabel multi-row
   Kolom: No | Project Name | Model/Type | Serial Number |
           Repair Action | Foto Problem | Foto At-Service
   ========================================================= */
function photoDokumentasiBody(items: any[]): string {
  const masterStore = useMasterStore();

  const rows = items.map((item: any, idx: number) => {
    const u: any = masterStore.findUnit(item.unit_id) || item.unit || {};
    const brand: any = masterStore.findBrand(u.brand_id);
    const modelType = [brand?.name, u.model].filter(Boolean).join(" ") || "-";
    const serialNo = u.serial_no || u.serial_number || "-";
    const projectName = item.project_name || "-";
    const repairAction = item.repair_action || "-";

    const photoBefore = item.photo_before
      ? `<img src="${item.photo_before}" style="max-width:100%; max-height:120px; object-fit:cover; display:block; margin:0 auto;" />`
      : `<div style="color:#aaa; font-size:9px; text-align:center; padding:10px 0;">No Photo</div>`;

    const photoAfter = item.photo_after
      ? `<img src="${item.photo_after}" style="max-width:100%; max-height:120px; object-fit:cover; display:block; margin:0 auto;" />`
      : `<div style="color:#aaa; font-size:9px; text-align:center; padding:10px 0;">No Photo</div>`;

    return `
      <tr>
        <td class="pd-center">${idx + 1}</td>
        <td>${projectName}</td>
        <td>${modelType}</td>
        <td>${serialNo}</td>
        <td>${repairAction}</td>
        <td class="pd-photo">${photoBefore}</td>
        <td class="pd-photo">${photoAfter}</td>
      </tr>`;
  }).join("");

  // Get surat pesanan no from first item if available
  const firstItem = items[0] || {};
  const spNo = firstItem.report_no || firstItem.service_report_no || "";

  return `
    <div class="pd-container">
      ${companyHeaderHtml}
      <div class="pd-title">PHOTO DOKUMENTASI</div>
      <div class="pd-subtitle">SURAT PESANAN NO : ${spNo}</div>
      <table class="pd-table">
        <thead>
          <tr>
            <th class="pd-th pd-center" style="width:4%;">No</th>
            <th class="pd-th" style="width:16%;">Project Name</th>
            <th class="pd-th" style="width:16%;">Model/Type</th>
            <th class="pd-th" style="width:14%;">Serial Number</th>
            <th class="pd-th" style="width:20%;">Repair Action</th>
            <th class="pd-th pd-center" style="width:15%;">Foto Dokumentasi Problem</th>
            <th class="pd-th pd-center" style="width:15%;">Foto dokumentasi at-service</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>`;
}

const PD_CSS = `
  .pd-container { max-width: 820px; margin: 0 auto; font-family: Arial, sans-serif; font-size: 10px; color: #000; }
  .pd-title { text-align: center; font-size: 14px; font-weight: bold; margin: 10px 0 2px; letter-spacing: 1px; }
  .pd-subtitle { text-align: center; font-size: 10px; font-weight: bold; margin-bottom: 10px; text-decoration: underline; }
  .pd-table { width: 100%; border-collapse: collapse; }
  .pd-th { background: #4da6ff; color: #000; font-weight: bold; font-size: 9px; text-align: center; border: 1px solid #000; padding: 5px 4px; }
  .pd-table td { border: 1px solid #000; padding: 5px 6px; vertical-align: middle; font-size: 9px; }
  .pd-center { text-align: center; }
  .pd-photo { padding: 4px; text-align: center; }
  @media print {
    @page { margin: 8mm; size: A4 landscape; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

function wrapDokumentasiDocument(body: string, autoPrint: boolean): string {
  const printScript = autoPrint
    ? `<script>window.onload = function() { setTimeout(function() { window.print(); }, 600); }<\/script>`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}${PD_CSS}</style></head><body>${body}${printScript}</body></html>`;
}

/** Print Photo Dokumentasi untuk satu atau banyak service report sekaligus */
export function printPhotoDokumentasi(items: any | any[]) {
  const arr = Array.isArray(items) ? items : [items];
  const body = photoDokumentasiBody(arr);
  const html = wrapDokumentasiDocument(body, true);
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

export type ReportType = 'technical' | 'history' | 'copier';

/**
 * All forms applicable to this report, in order or by type.
 */
function getReportPages(item: any, type?: ReportType): string[] {
  const ctx = buildCtx(item);
  let pages: string[] = [];
  
  if (type === 'technical') pages = [technicalReportBody(item, ctx)];
  else if (type === 'history') pages = [serviceReportBody(item, ctx)];
  else if (type === 'copier') pages = ctx.isCopier ? [copierServiceReportBody(item, ctx)] : [];
  else {
    pages = [technicalReportBody(item, ctx), serviceReportBody(item, ctx)];
    if (ctx.isCopier) {
      pages.push(copierServiceReportBody(item, ctx));
    }
  }
  
  return pages;
}

const CSS = `
  @media print {
    @page { margin: 10mm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { page-break-after: always; break-after: page; margin: 0; }
    .page:last-child { page-break-after: auto; break-after: auto; }
  }
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 20px; color: #000; background: #fff; }
  .page { margin-bottom: 24px; }
  .page:last-child { margin-bottom: 0; }
  .container { max-width: 800px; margin: 0 auto; border: 2px solid #000; box-sizing: border-box; }
  .header-table { width: 100%; border-collapse: collapse; }
  .header-table td { padding: 10px; }
  .logo-col { width: 100px; vertical-align: middle; border-bottom: 2px solid #000; }
  .info-col { text-align: right; vertical-align: middle; border-bottom: 2px solid #000; }
  .logo { width: 70px; height: 70px; }
  .company-name { font-size: 20px; font-weight: bold; color: #3399ff; margin: 0; }
  .tagline { font-size: 14px; font-style: italic; font-weight: bold; margin: 0; }
  .address { font-size: 9px; font-weight: bold; margin-top: 5px; }
  .title-bar { background-color: #000; color: #fff; text-align: center; font-size: 18px; font-weight: bold; padding: 5px; }
  .grid-table { width: 100%; border-collapse: collapse; font-weight: bold; text-transform: uppercase; font-size: 10px; }
  .grid-table td { border: 1px solid #000; padding: 3px 6px; }
  .bg-black { background-color: #000; color: #fff; text-align: center; }
  .text-center { text-align: center; }
  .section-title { background-color: #2b579a; color: #fff; text-align: center; font-size: 14px; font-weight: bold; padding: 4px; border-bottom: 2px solid #000; }
  .data-table { width: 100%; border-collapse: collapse; font-weight: bold; font-size: 11px; }
  .data-table td { border-bottom: 1px solid #000; padding: 5px 8px; vertical-align: top; }
  .data-table tr:last-child td { border-bottom: 2px solid #000; }
  .data-table .label-col { width: 30%; border-right: 1px solid #000; }
  .data-table .val-col { width: 70%; }
  .meta-table { width: 100%; border-collapse: collapse; font-weight: bold; }
  .meta-table td { border-bottom: 2px solid #000; padding: 5px; width: 50%; }
  .meta-table .right-col { border-left: 2px solid #000; }
  .components-grid { display: grid; grid-template-columns: 1fr 1fr; }
  .comp-item { padding: 2px 0; border-bottom: 1px dotted #999; margin-right: 10px; }
  .bottom-table { width: 100%; border-collapse: collapse; font-weight: bold; font-size: 11px; }
  .bottom-table td { padding: 4px 8px; border-bottom: 1px solid #000; vertical-align: top; }
  .kv { display: flex; }
  .kv-k { width: 80px; }
  .tested-table { width: 100%; border-collapse: collapse; font-weight: normal; }
  .tested-table td { border-bottom: 1px solid #000; padding: 2px 4px; }
  .tested-table tr:last-child td { border-bottom: none; }
  .tested-table .tt-label { width: 40%; border-right: 1px solid #000; font-weight: bold; }
  .tested-table .tt-val { padding-left: 8px; }
  .signature-block { display: flex; justify-content: space-between; padding: 5px 20px 20px; font-weight: bold; text-align: center; }
  .sig-side { width: 45%; }
  .sig-line { margin-top: 20px; min-height: 50px; border-bottom: 1px solid #000; }
  .sig-name { margin-top: 5px; }
  .sig-customer { display: flex; flex-direction: column; justify-content: flex-end; }
  .sig-cust { border-bottom: 1px solid #000; padding-bottom: 5px; min-height: 50px; }
  .sig-stamp { background-color: #000; color: #fff; padding: 4px; font-size: 10px; }
`;

function wrapDocument(pages: string[], autoPrint: boolean): string {
  const body = pages.map((p) => `<div class="page">${p}</div>`).join("\n");
  const printScript = autoPrint
    ? `<script>window.onload = function() { setTimeout(function() { window.print(); }, 500); }<\/script>`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}${printScript}</body></html>`;
}

/** Print/PDF — all forms in one window, one page per form. */
export function printServiceReport(item: any, type?: ReportType) {
  const pages = getReportPages(item, type);
  if (pages.length === 0) {
    alert("This item does not have this type of report (e.g. not a copier).");
    return;
  }
  const html = wrapDocument(pages, true);
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

export function printMultipleServiceReports(items: any[], type?: ReportType) {
  const allPages = items.flatMap((item) => getReportPages(item, type));
  if (allPages.length === 0) {
    alert("No valid reports found for the selected type.");
    return;
  }
  const html = wrapDocument(allPages, true);
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

/**
 * Returns the form HTML string without auto-print, suitable for iframe preview.
 * Contains all forms in order (Technical, Service, + Copier for copier units).
 */
export function getServiceReportFormHtml(item: any, type?: ReportType): string {
  return wrapDocument(getReportPages(item, type), false);
}
