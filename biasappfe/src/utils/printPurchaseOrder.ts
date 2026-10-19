// @ts-nocheck
import { useMasterStore } from "@/composables/useMasterStore";
import { BIAS_LOGO_DATA_URL } from "@/utils/logoData";
import biasLogoUrl from "@/assets/bias-logo.png";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c] || c));
}

function isUuid(val: any): boolean {
  if (!val || typeof val !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
}

function resolvePORequest(po: any, store: any) {
  if (!po) return null;
  if (po.sparepart_request) return po.sparepart_request;
  const requests = store?.sparepartRequests?.value || store?.sparepartRequests || [];
  const id = po.sparepart_request_id;
  if (id != null) {
    const strId = String(id).trim().toLowerCase();
    const found = requests.find((r: any) =>
      String(r.id).trim().toLowerCase() === strId ||
      String(r.service_report_id || "").trim().toLowerCase() === strId ||
      String(r.request_no || "").trim().toLowerCase() === strId
    );
    if (found) return found;
  }
  if (po.service_report_id) {
    const srStr = String(po.service_report_id).trim().toLowerCase();
    const foundBySR = requests.find((r: any) =>
      String(r.service_report_id || "").trim().toLowerCase() === srStr ||
      String(r.id || "").trim().toLowerCase() === srStr
    );
    if (foundBySR) return foundBySR;
  }
  return null;
}

function resolvePOServiceReport(po: any, store: any) {
  if (!po) return null;
  if (po.service_report) return po.service_report;
  const req = resolvePORequest(po, store);
  if (req?.service_report) return req.service_report;

  const requests = store?.sparepartRequests?.value || store?.sparepartRequests || [];
  const reports = store?.serviceReports?.value || store?.serviceReports || [];

  const candidateIds = [
    req?.service_report_id,
    po.service_report_id,
    po.sparepart_request_id,
  ].filter(Boolean).map((x) => String(x).trim().toLowerCase());

  for (const cId of candidateIds) {
    const matchedReq = requests.find((r: any) =>
      String(r.id || "").trim().toLowerCase() === cId ||
      String(r.service_report_id || "").trim().toLowerCase() === cId
    );
    if (matchedReq?.service_report) return matchedReq.service_report;

    const foundReport = reports.find((s: any) =>
      String(s.id || "").trim().toLowerCase() === cId ||
      String(s.report_no || "").trim().toLowerCase() === cId
    );
    if (foundReport) return foundReport;

    if (store?.findServiceReport) {
      const fromStore = store.findServiceReport(cId);
      if (fromStore) return fromStore;
    }
  }

  return null;
}

function resolvePOCustomer(po: any, store: any) {
  if (!po) return null;
  if (po.customer) return po.customer;
  const customers = store?.customers?.value || store?.customers || [];
  const requests = store?.sparepartRequests?.value || store?.sparepartRequests || [];

  // 1. Direct po.customer_id
  if (po.customer_id) {
    const direct = store?.findCustomer ? store.findCustomer(po.customer_id) : null;
    if (direct) return direct;
    const direct2 = customers.find((c: any) => String(c.id).trim().toLowerCase() === String(po.customer_id).trim().toLowerCase());
    if (direct2) return direct2;
  }

  // 2. Via resolved sparepart request
  const req = resolvePORequest(po, store);
  if (req?.customer) return req.customer;
  if (req?.service_report?.customer) return req.service_report.customer;
  if (req?.service_report?.customer_id) {
    const cId = String(req.service_report.customer_id).trim().toLowerCase();
    const viaReq = (store?.findCustomer ? store.findCustomer(cId) : null) ||
      customers.find((c: any) => String(c.id).trim().toLowerCase() === cId);
    if (viaReq) return viaReq;
  }

  // 3. Via resolved service report
  const sr = resolvePOServiceReport(po, store);
  if (sr?.customer) return sr.customer;
  if (sr?.customer_id) {
    const viaSr = (store?.findCustomer ? store.findCustomer(sr.customer_id) : null) ||
      customers.find((c: any) => String(c.id).trim().toLowerCase() === String(sr.customer_id).trim().toLowerCase());
    if (viaSr) return viaSr;
  }

  // 4. Check if po.sparepart_request_id matches a customer directly
  if (po.sparepart_request_id) {
    const sprIdStr = String(po.sparepart_request_id).trim().toLowerCase();
    const viaSpr = (store?.findCustomer ? store.findCustomer(sprIdStr) : null) ||
      customers.find((c: any) => String(c.id).trim().toLowerCase() === sprIdStr);
    if (viaSpr) return viaSpr;
  }

  // 5. Check if any sparepartRequest in store has customer matching PO
  const candidateIds = [po.sparepart_request_id, po.service_report_id].filter(Boolean).map((x) => String(x).toLowerCase().trim());
  for (const r of requests) {
    const rId = String(r.id || "").toLowerCase().trim();
    const rSrId = String(r.service_report_id || "").toLowerCase().trim();
    if (candidateIds.includes(rId) || candidateIds.includes(rSrId)) {
      if (r.service_report?.customer) return r.service_report.customer;
      if (r.customer) return r.customer;
      if (r.service_report?.customer_id) {
        const c = customers.find((c: any) => String(c.id).trim().toLowerCase() === String(r.service_report.customer_id).trim().toLowerCase());
        if (c) return c;
      }
    }
  }

  // 6. Customer name string fallback on service report
  if (sr?.customer_name || sr?.customer_name_copier || sr?.customer_name_technical) {
    const name = sr.customer_name || sr.customer_name_copier || sr.customer_name_technical;
    return {
      company_name: name,
      name,
      address: sr.customer_address || "-",
      phone: sr.customer_phone || "-",
      pic_name: sr.pic_name || "-",
    };
  }
  return null;
}

function resolvePOLineItems(po: any, store: any) {
  if (po.purchase_order_items && po.purchase_order_items.length > 0) {
    return po.purchase_order_items.map((item: any) => ({
      name:
        item.product?.name ||
        item.item_name ||
        (store?.findProduct ? store.findProduct(item.product_id)?.name : null) ||
        (po.reason ? `Sparepart (${po.reason})` : "Sparepart"),
      qty: item.qty || 1,
      price: item.unit_price || 0,
      total: item.total_price || (item.qty || 1) * (item.unit_price || 0),
    }));
  }

  const req = resolvePORequest(po, store);
  if (req) {
    const product =
      req.product || (store?.findProduct ? store.findProduct(req.product_id) : null);
    const price = req.unit_price || product?.price || 0;
    const qty = req.qty || 1;
    return [
      {
        name: req.item_name || product?.name || (po.reason ? `Sparepart (${po.reason})` : "Sparepart"),
        qty,
        price,
        total: price * qty,
      },
    ];
  }

  return [];
}

function poSignerName(po: any, currentUser?: any): string {
  return (
    po?.user?.name ||
    po?.user?.username ||
    currentUser?.value?.name ||
    currentUser?.name ||
    "testacc"
  );
}

export function generatePurchaseOrderHtml(po: any, currentUser?: any): string {
  if (!po) return "";
  const store = useMasterStore();

  const customer = resolvePOCustomer(po, store);
  const custName = escapeHtml(customer?.company_name || customer?.name || "-");
  const custAddress = escapeHtml(customer?.address || "-");
  const custPhone = escapeHtml(customer?.phone || "-");
  const pic = customer?.pic_name || "-";
  const gender = customer?.pic_gender;
  let prefix = "Bapak/Ibu ";
  if (gender === "L") prefix = "Bapak ";
  if (gender === "P") prefix = "Ibu ";
  const picDisplay = escapeHtml(pic && pic !== "-" ? prefix + pic : "-");

  const req = resolvePORequest(po, store);
  const sr = resolvePOServiceReport(po, store);

  let rawReqNo = req?.request_no || po.sparepart_request?.request_no;
  if (!rawReqNo) {
    if (sr?.service_spareparts?.[0]?.request_no) {
      rawReqNo = sr.service_spareparts[0].request_no;
    } else if (sr?.report_no) {
      rawReqNo = sr.report_no;
    } else if (po.sparepart_request_id) {
      const s = String(po.sparepart_request_id).trim();
      if (!isUuid(s)) {
        rawReqNo = s.startsWith("SPR") ? s : `SPR-${s}`;
      }
    }
  }
  const requestNo = escapeHtml(rawReqNo && !isUuid(rawReqNo) ? rawReqNo : "-");

  const signer = escapeHtml(poSignerName(po, currentUser));

  const orderDateRaw = po.order_date || po.created_at;
  const orderDateStr = orderDateRaw
    ? new Date(orderDateRaw).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "-";

  const reasonStr = escapeHtml(
    po.reason && po.reason.trim() !== "-"
      ? po.reason.trim()
      : req?.reason && req.reason.trim() !== "-"
      ? req.reason.trim()
      : sr?.remarks && sr.remarks.trim() !== "-"
      ? sr.remarks.trim()
      : "-"
  );

  const items = resolvePOLineItems(po, store);
  const subTotal = items.reduce((sum: number, item: any) => sum + item.total, 0);
  const tax = subTotal * 0.11;
  const grandTotal = subTotal + tax;

  const itemsHtml =
    items.length > 0
      ? items
          .map(
            (item: any, idx: number) => `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td>${escapeHtml(item.name)}</td>
          <td style="text-align: center;">${item.qty}</td>
          <td style="text-align: center;">unit</td>
          <td class="rp-col">Rp</td><td class="val-col">${(item.price || 0).toLocaleString("id-ID")}</td>
          <td class="rp-col">Rp</td><td class="val-col">${(item.total || 0).toLocaleString("id-ID")}</td>
        </tr>
      `
          )
          .join("")
      : `<tr><td colspan="8" style="text-align: center; color: #666; padding: 12px;">Item data unavailable</td></tr>`;

  const subTotalStr = subTotal.toLocaleString("id-ID");
  const taxStr = tax.toLocaleString("id-ID");
  const amountStr = grandTotal.toLocaleString("id-ID");

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Invoice - ${escapeHtml(po.po_no)}</title>
    <style>
      @media print {
        @page { size: A4 portrait; margin: 10mm; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        padding: 0;
        color: #000;
        font-size: 12px;
        margin: 0;
        background: #fff;
      }
      .container {
        max-width: 900px;
        margin: 0 auto;
        padding: 20px;
        box-sizing: border-box;
      }

      /* Header Table */
      .header-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
      }
      .header-table td {
        vertical-align: top;
        padding: 0;
      }
      .logo-col {
        width: 50%;
        padding-right: 20px;
      }
      .info-col {
        width: 50%;
      }

      .logo-container {
        display: flex;
        align-items: center;
        margin-bottom: 10px;
      }
      .logo {
        width: 80px;
        height: 80px;
        margin-right: 15px;
        flex-shrink: 0;
      }

      .company-details h1 {
        margin: 0;
        font-size: 22px;
        font-weight: bold;
        color: #000;
        line-height: 1.15;
      }
      .company-details h2 {
        margin: 0;
        font-size: 14px;
        font-style: italic;
        font-weight: normal;
        margin-bottom: 10px;
        color: #333;
      }
      .company-details p {
        margin: 0;
        font-size: 11px;
        line-height: 1.4;
        color: #222;
      }

      .invoice-text {
        font-size: 28px;
        font-weight: bold;
        text-align: center;
        margin-top: 24px;
        margin-bottom: 10px;
        letter-spacing: 1px;
        color: #000;
      }

      .po-number-banner {
        font-size: 20px;
        font-weight: bold;
        text-align: right;
        margin-bottom: 10px;
        font-family: monospace;
        color: #003366;
        letter-spacing: 0.5px;
      }

      /* Meta Table */
      .meta-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
        border: 1px solid #7ea8ce;
      }
      .meta-table td, .meta-table th {
        border: 1px solid #7ea8ce;
        padding: 4px 8px;
      }
      .meta-table .bg-blue {
        background-color: #003366;
        color: white;
        font-weight: bold;
      }
      .meta-table .label {
        width: 90px;
        font-weight: bold;
      }

      /* Items Table */
      .items-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
      }
      .items-table th {
        background-color: #003366;
        color: white;
        border: 1px solid #7ea8ce;
        padding: 8px;
        text-align: center;
        font-size: 12px;
      }
      .items-table td {
        border: 1px solid #7ea8ce;
        padding: 8px;
        vertical-align: top;
      }
      .items-table .rp-col {
        border-right: none;
        width: 20px;
        padding-right: 2px;
        color: #333;
      }
      .items-table .val-col {
        border-left: none;
        text-align: right;
      }

      /* Summary Table */
      .summary-table {
        width: 350px;
        float: right;
        border-collapse: collapse;
        margin-top: 0;
        margin-bottom: 20px;
      }
      .summary-table td {
        border: 1px solid #7ea8ce;
        padding: 6px 8px;
        background-color: #dbeaf4;
        font-weight: bold;
        font-size: 12px;
      }
      .summary-table .label {
        text-align: right;
        padding-right: 10px;
      }

      /* Payment Details */
      .payment-info {
        clear: left;
        float: left;
        margin-top: 10px;
        font-size: 12px;
        font-weight: bold;
        line-height: 1.6;
        color: #000;
      }

      /* Signatures Section */
      .signatures {
        display: flex;
        justify-content: space-between;
        clear: both;
        margin-top: 40px;
        text-align: center;
      }
      .sig-box {
        width: 220px;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .sig-title {
        font-weight: bold;
        font-size: 11px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .sig-space {
        height: 65px;
        width: 100%;
      }
      .sig-line {
        border-bottom: 1px solid #000;
        width: 85%;
        margin: 2px auto 6px auto;
      }
      .sig-name {
        font-weight: normal;
        font-size: 11px;
        min-height: 18px;
        word-break: break-word;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <!-- Header Table -->
      <table class="header-table">
        <tr>
          <td class="logo-col">
            <div class="logo-container">
              <img src="${BIAS_LOGO_DATA_URL || biasLogoUrl}" class="logo" alt="BiAS Logo" />
              <div class="company-details">
                <h1>PT. BIAS SURYA</h1>
                <h1>TEKNOLOGI</h1>
                <h2>The shape of smart</h2>
              </div>
            </div>
            <div class="company-details" style="padding-left: 95px;">
              <p>
                Ruko Purimas Blok A No.47 Kota Batam,<br>
                Kepulauan Riau - Indonesia<br>
                Phone: +62811 704 5657<br>
                Email: admin@biasbst.com<br>
                Website: www.biassuryateknologi.com
              </p>
            </div>
            <div class="invoice-text">INVOICE</div>
          </td>
          <td class="info-col">
            <div class="po-number-banner">PO NO.  :  ${escapeHtml(po.po_no)}</div>
            <table class="meta-table">
              <tr>
                <td class="label">Date :</td>
                <td>${orderDateStr}</td>
              </tr>
              <tr>
                <td class="label">Request :</td>
                <td>${requestNo}</td>
              </tr>
              ${reasonStr !== "-" ? `
              <tr>
                <td class="label">Reason :</td>
                <td>${reasonStr}</td>
              </tr>` : ""}
              <tr>
                <td colspan="2" class="bg-blue">To :</td>
              </tr>
              <tr>
                <td colspan="2" style="font-weight: bold; min-height: 35px; vertical-align: top; padding: 6px 8px;">${custName}</td>
              </tr>
              <tr>
                <td colspan="2" class="bg-blue" style="height: 10px; padding: 4px 8px;">Address :</td>
              </tr>
              <tr>
                <td colspan="2" style="min-height: 45px; vertical-align: top; padding: 6px 8px;">${custAddress}</td>
              </tr>
              <tr>
                <td class="label">Phone :</td>
                <td>${custPhone}</td>
              </tr>
              <tr>
                <td class="label">Attn.:</td>
                <td>${picDisplay}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Items Table -->
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 40px;">No</th>
            <th>Description</th>
            <th style="width: 50px;">Qty</th>
            <th style="width: 60px;">UOM</th>
            <th colspan="2" style="width: 140px;">Unit Price</th>
            <th colspan="2" style="width: 140px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
          <tr style="height: 100px;">
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td class="rp-col"></td><td class="val-col"></td>
            <td class="rp-col"></td><td class="val-col"></td>
          </tr>
        </tbody>
      </table>

      <!-- Summary Table -->
      <table class="summary-table">
        <tr>
          <td class="label">Sub Total</td>
          <td class="rp-col" style="border-right: none; width: 30px; padding-right: 0;">Rp</td>
          <td class="val-col" style="border-left: none; text-align: right; width: 110px;">${subTotalStr}</td>
        </tr>
        <tr>
          <td class="label">Tax (11%)</td>
          <td class="rp-col" style="border-right: none; padding-right: 0;">Rp</td>
          <td class="val-col" style="border-left: none; text-align: right;">${taxStr}</td>
        </tr>
        <tr>
          <td class="label">Amount</td>
          <td class="rp-col" style="border-right: none; padding-right: 0;">Rp</td>
          <td class="val-col" style="border-left: none; text-align: right;">${amountStr}</td>
        </tr>
      </table>

      <!-- Payment Info -->
      <div class="payment-info">
        Payment via bank transfer to:<br>
        BANK BRKSYARIAH Cabang Batam<br>
        Account No. 106-08-85757<br>
        Account Name : PT. BIAS SURYA TEKNOLOGI<br>
        NPWP : 0941.8395.0822.5000
      </div>

      <!-- Signatures -->
      <div class="signatures">
        <div class="sig-box">
          <div class="sig-title">Received By,</div>
          <div class="sig-space"></div>
          <div class="sig-line"></div>
          <div class="sig-name">( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</div>
        </div>
        <div class="sig-box">
          <div class="sig-title">Sincerely,</div>
          <div class="sig-space"></div>
          <div class="sig-line"></div>
          <div class="sig-name">${signer || "( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )"}</div>
        </div>
      </div>
    </div>

    <script>
      window.onload = function() {
        setTimeout(function() {
          window.print();
        }, 500);
      };
    <\/script>
  </body>
</html>`;
}

export async function printPurchaseOrder(po: any, currentUser?: any): Promise<boolean> {
  if (!po) return false;
  const store = useMasterStore();
  let customer = resolvePOCustomer(po, store);
  let req = resolvePORequest(po, store);
  let sr = resolvePOServiceReport(po, store);

  const targetId = po.sparepart_request_id || po.service_report_id;
  const { resources } = await import("@/services/resource.service");

  if (!req && targetId) {
    try {
      const res = await resources.serviceSpareparts.get(String(targetId));
      if (res?.data) {
        const d = res.data as any;
        req = d;
        if (d.service_report) sr = d.service_report;
        if (d.service_report?.customer) customer = d.service_report.customer;
      }
    } catch {
      // fallback to service report
    }
  }

  if ((!customer || !sr) && targetId) {
    try {
      const srId = po.service_report_id || req?.service_report_id || targetId;
      const res = await resources.serviceReports.get(String(srId));
      if (res?.data) {
        sr = res.data;
        if (res.data.customer) customer = res.data.customer;
        if (!req && Array.isArray(res.data.service_spareparts) && res.data.service_spareparts.length > 0) {
          req = res.data.service_spareparts[0];
        }
      }
    } catch {
      // fallback to customer
    }
  }

  if (!customer && (po.customer_id || sr?.customer_id || targetId)) {
    try {
      const custId = po.customer_id || sr?.customer_id || targetId;
      const res = await resources.customers.get(String(custId));
      if (res?.data) {
        customer = res.data;
      }
    } catch {
      // fallback silently
    }
  }

  const enrichedPO = {
    ...po,
    customer: customer || po.customer,
    sparepart_request: req || po.sparepart_request,
    service_report: sr || po.service_report,
  };

  const html = generatePurchaseOrderHtml(enrichedPO, currentUser);
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    return true;
  }
  return false;
}
