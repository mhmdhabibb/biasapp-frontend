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
      return d.toLocaleString("id-ID", {
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
    dateStr: item.service_date
      ? new Date(item.service_date).toLocaleDateString("id-ID")
      : "-",
    contract: masterStore.findContractItem(item.contract_item_id),
    isCopier: !!u.is_copier,
  };
}

const companyHeaderHtml = `
  <table class="header-table">
    <tr>
      <td class="logo-col">
        <svg class="logo" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="40" stroke="#003366" stroke-width="12"/>
          <path d="M50 10 A40 40 0 0 1 90 50" stroke="#F4B042" stroke-width="12" fill="none"/>
          <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#F4B042" font-weight="bold" font-size="22">BiAS</text>
        </svg>
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

function copierSignaturesHtml(item: any, ctx: ReportCtx): string {
  return `
    <table class="grid-table" style="border-top: none;">
      <tr>
        <td style="width: 50%; text-align: center; border-top: none;">
          TESTED YES / NO<br><br><br>
          ${item.technician_signature ? '<img src="' + item.technician_signature + '" style="max-height: 50px;" />' : "<br><br>"}
        </td>
        <td style="width: 50%; text-align: center; border-top: none;">
          COMPLETE YES / NO<br><br><br>
          ${item.customer_signature ? '<img src="' + item.customer_signature + '" style="max-height: 50px;" />' : "<br><br>"}
        </td>
      </tr>
      <tr>
        <td style="text-align: center;">TECHNISI<br>${ctx.tech.name || ctx.tech.full_name || ""}</td>
        <td style="padding: 0; vertical-align: bottom;">
          <div style="text-align: center; margin-bottom: 2px;">CUSTOMER</div>
          <div class="bg-black" style="font-size: 9px; padding: 2px;">Signature & Company Stamp</div>
        </td>
      </tr>
    </table>
  `;
}

function signatureBlockHtml(item: any, ctx: ReportCtx): string {
  return `
    <div class="signature-block">
      <div class="sig-side">
        <div>TECHNISI</div>
        <div class="sig-line">${item.technician_signature ? '<img src="' + item.technician_signature + '" style="max-height: 50px;" />' : "<br><br><br>"}</div>
        <div class="sig-name">${ctx.tech.name || ctx.tech.full_name || ""}</div>
      </div>
      <div class="sig-side sig-customer">
        <div class="sig-cust">CUSTOMER<br>
          ${item.customer_signature ? '<img src="' + item.customer_signature + '" style="max-height: 50px;" />' : ""}
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
          <td>PRODUCT TYPES : ${ctx.u.is_computer ? "Komputer/Desktop" : ctx.isCopier ? "Fotocopy" : "Printer / Non-Fotocopy"}</td>
          <td class="right-col">DATE : ${ctx.dateStr}</td>
        </tr>
     
      </table>
      <div class="section-title">CUSTOMER DETAIL</div>
      <table class="data-table">
        <tr><td class="label-col">Company Name</td><td class="val-col"> ${ctx.custName}</td></tr>
        <tr><td class="label-col">Customer Type</td><td class="val-col"> ${ctx.customer.category || "-"}</td></tr>
        <tr><td class="label-col">Project Name</td><td class="val-col"> ${item.project_name || "-"}</td></tr>
        <tr><td class="label-col">Address</td><td class="val-col"> ${ctx.custAddress}</td></tr>
        <tr><td class="label-col">Telepon / Handphone</td><td class="val-col"> ${ctx.custPhone}</td></tr>
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
      ${signatureBlockHtml(item, ctx)}
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
          <td>Date In : ${ctx.dateStr}</td>
       
        </tr>
      </table>
      <div class="section-title">CUSTOMER DETAIL</div>
      <table class="data-table">
        <tr><td class="label-col">Company Name</td><td class="val-col"> ${ctx.custName}</td></tr>
        <tr><td class="label-col">Customer Type</td><td class="val-col"> ${ctx.customer.category || "-"}</td></tr>
        <tr><td class="label-col">Project Name</td><td class="val-col"> ${item.project_name || "-"}</td></tr>
        <tr><td class="label-col">Address</td><td class="val-col"> ${ctx.custAddress}</td></tr>
        <tr><td class="label-col">Telepon / Handphone</td><td class="val-col"> ${ctx.custPhone}</td></tr>
        <tr><td class="label-col">Personnel Incharges</td><td class="val-col"> ${ctx.picName}</td></tr>
      </table>
       <div class="section-title">PRODUCT DETAIL</div>
      <table class="data-table">
        <tr><td class="label-col">Brand</td><td class="val-col"> ${ctx.brand?.name || "-"}</td></tr>
        <tr><td class="label-col">Product Type</td><td class="val-col">  ${ctx.u.is_computer ? "Komputer/Desktop" : ctx.isCopier ? "Fotocopy" : "Printer / Non-Fotocopy"}</td></tr>
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
            <div class="kv"><div class="kv-k">Tested</div><div>: ${item.is_tested ? "YES" : "NO"}</div></div>
            <div class="kv"><div class="kv-k">Complete</div><div>: ${item.is_completed ? "YES" : "NO"}</div></div>
            <div class="kv"><div class="kv-k">Time in</div><div>: ${fmtTime(item.time_in)}</div></div>
            <div class="kv"><div class="kv-k">Time Out</div><div>: ${fmtTime(item.time_out)}</div></div>
          </td>
        </tr>
      </table>
      ${signatureBlockHtml(item, ctx)}
  `;
}

/* =========================================================
   FORM 3 — COPIER SERVICE REPORT (hanya unit is_copier)
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
          <td class="bg-black">TELP :</td>
          <td>${ctx.custPhone}</td>
          <td style="text-align: right;">SALES</td>
          <td style="text-align: center;"></td>
        </tr>
        <tr>
          <td class="bg-black">PRODUCT/TYPE</td>
          <td class="bg-black">SERIAL NUMBER</td>
          <td colspan="2" rowspan="11" style="vertical-align: top;">
            <div class="text-center" style="border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 3px;">REMARKS</div>
            <div style="font-weight: normal;">${item.remarks || ""}</div>
          </td>
        </tr>
        <tr>
          <td class="text-center">${ctx.u.model || "-"}</td>
          <td class="text-center">${ctx.u.serial_no || "-"}</td>
        </tr>
        <tr><td colspan="2" class="bg-black">METER READING</td></tr>
        <tr>
          <td class="text-center">BEFORE</td>
          <td class="text-center">AFTER</td>
        </tr>
        <tr>
          <td class="text-center">${item.meter_reading_before ?? ""}</td>
          <td class="text-center">${item.meter_reading_after ?? ""}</td>
        </tr>
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

/**
 * Semua form yang berlaku untuk laporan ini, berurutan:
 * Technical Report → Service Report → Copier Service Report (jika unit copier)
 */
function getReportPages(item: any): string[] {
  const ctx = buildCtx(item);
  const pages = [technicalReportBody(item, ctx), serviceReportBody(item, ctx)];
  if (ctx.isCopier) {
    pages.push(copierServiceReportBody(item, ctx));
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

/** Print/PDF — semua form dalam satu jendela, tiap form satu halaman. */
export function printServiceReport(item: any) {
  const html = wrapDocument(getReportPages(item), true);
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

/**
 * Returns the form HTML string without auto-print, suitable for iframe preview.
 * Berisi semua form berurutan (Technical, Service, + Copier jika unit copier).
 */
export function getServiceReportFormHtml(item: any): string {
  return wrapDocument(getReportPages(item), false);
}
