// @ts-nocheck
import { useMasterStore } from "@/composables/useMasterStore";

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

  if (po.customer_id) {
    const direct = store?.findCustomer ? store.findCustomer(po.customer_id) : null;
    if (direct) return direct;
    const direct2 = customers.find((c: any) => String(c.id).trim().toLowerCase() === String(po.customer_id).trim().toLowerCase());
    if (direct2) return direct2;
  }

  const req = resolvePORequest(po, store);
  if (req?.customer) return req.customer;
  if (req?.service_report?.customer) return req.service_report.customer;
  if (req?.service_report?.customer_id) {
    const cId = String(req.service_report.customer_id).trim().toLowerCase();
    const viaReq = (store?.findCustomer ? store.findCustomer(cId) : null) ||
      customers.find((c: any) => String(c.id).trim().toLowerCase() === cId);
    if (viaReq) return viaReq;
  }

  const sr = resolvePOServiceReport(po, store);
  if (sr?.customer) return sr.customer;
  if (sr?.customer_id) {
    const viaSr = (store?.findCustomer ? store.findCustomer(sr.customer_id) : null) ||
      customers.find((c: any) => String(c.id).trim().toLowerCase() === String(sr.customer_id).trim().toLowerCase());
    if (viaSr) return viaSr;
  }

  if (po.sparepart_request_id) {
    const sprIdStr = String(po.sparepart_request_id).trim().toLowerCase();
    const viaSpr = (store?.findCustomer ? store.findCustomer(sprIdStr) : null) ||
      customers.find((c: any) => String(c.id).trim().toLowerCase() === sprIdStr);
    if (viaSpr) return viaSpr;
  }

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

function resolvePOTechnician(po: any, store: any) {
  if (!po) return null;
  const req = resolvePORequest(po, store);
  const sr = resolvePOServiceReport(po, store);

  if (req?.technician) return req.technician;
  if (req?.technician_id && store?.findTechnician) {
    const t = store.findTechnician(req.technician_id);
    if (t) return t;
  }
  if (sr?.technician) return sr.technician;
  if (sr?.technician_id && store?.findTechnician) {
    const t = store.findTechnician(sr.technician_id);
    if (t) return t;
  }
  return null;
}

function resolvePOUnit(po: any, store: any) {
  if (!po) return null;
  const sr = resolvePOServiceReport(po, store);
  if (po.unit) return po.unit;
  if (po.unit_id && store?.findUnit) {
    const u = store.findUnit(po.unit_id);
    if (u) return u;
  }
  if (sr?.unit) return sr.unit;
  if (sr?.unit_id && store?.findUnit) {
    const u = store.findUnit(sr.unit_id);
    if (u) return u;
  }
  return null;
}

function resolvePOLineItems(po: any, store: any) {
  const items = po.purchase_order_items || po.request_form_items;
  if (items && items.length > 0) {
    return items.map((item: any) => ({
      name:
        item.product?.name ||
        item.item_name ||
        (store?.findProduct ? store.findProduct(item.product_id)?.name : null) ||
        (po.reason ? `Sparepart (${po.reason})` : "Sparepart"),
      qty: item.qty || 1,
      uom: item.uom || "Pcs",
      price: item.unit_price || 0,
      total: item.total_price || (item.qty || 1) * (item.unit_price || 0),
      purpose: item.purpose || "",
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
        uom: req.uom || "Pcs",
        price,
        total: price * qty,
        purpose: req.purpose || "",
      },
    ];
  }

  return [];
}

export function generatePurchaseOrderHtml(po: any, currentUser?: any): string {
  if (!po) return "";
  const store = useMasterStore();

  const customer = resolvePOCustomer(po, store);
  const custName = escapeHtml(customer?.company_name || customer?.name || "-");

  const req = resolvePORequest(po, store);
  const sr = resolvePOServiceReport(po, store);
  const tech = resolvePOTechnician(po, store);
  const unit = resolvePOUnit(po, store);

  // 1. Request Form No.
  const rawReqNo = po.po_no || po.request_form_no || req?.request_no || (po.id ? `Bi-MRF-${String(po.id).slice(-4)}` : "Bi-MRF-001");
  const requestFormNo = escapeHtml(rawReqNo);

  // 2. Dates
  const orderDateRaw = po.order_date || po.created_at;
  const tanggalPengajuan = orderDateRaw
    ? new Date(orderDateRaw).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

  const installDateRaw = po.installation_date || req?.installation_date || po.order_date || po.created_at;
  const tanggalDibutuhkan = installDateRaw
    ? new Date(installDateRaw).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "-";

  // 3. Pemohon Info
  const namaPemohon = escapeHtml(
    tech?.user?.name ||
    tech?.user?.username ||
    tech?.name ||
    po.requester_name ||
    currentUser?.value?.name ||
    currentUser?.name ||
    "tech"
  );
  const divisiDepartemen = escapeHtml(po.department || "Technical / Service");
  const posisi = escapeHtml(po.requester_position || "Technician");
  const idCard = escapeHtml(tech?.code || tech?.id_card || tech?.id ? String(tech.code || tech.id_card || tech.id) : "-");
  const prioritas = escapeHtml(po.priority || "Normal / Mendesak");

  // 4. Default Purpose
  const defaultPurposeParts = [];
  if (unit?.model) {
    defaultPurposeParts.push(`Unit ${unit.model}${unit.serial_number ? ` (SN: ${unit.serial_number})` : ""}`);
  }
  if (custName && custName !== "-") {
    defaultPurposeParts.push(custName);
  }
  if (sr?.report_no || sr?.service_report_no) {
    defaultPurposeParts.push(`SR: ${sr.report_no || sr.service_report_no}`);
  }
  const defaultPurpose = defaultPurposeParts.join(" - ") || "Operasional / Service";

  // 5. Line items
  const lineItems = resolvePOLineItems(po, store);
  let totalEstimasi = 0;

  const itemRows = lineItems.map((item: any, idx: number) => {
    totalEstimasi += item.total || 0;
    const priceStr = item.price ? item.price.toLocaleString("id-ID") : "-";
    const totalStr = item.total ? item.total.toLocaleString("id-ID") : "-";
    const purposeStr = escapeHtml(item.purpose || defaultPurpose);

    return `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td style="text-align: left;">${escapeHtml(item.name)}</td>
        <td style="text-align: center;">${escapeHtml(item.qty)}</td>
        <td style="text-align: center;">${escapeHtml(item.uom || "Pcs")}</td>
        <td style="text-align: right;">${priceStr}</td>
        <td style="text-align: right;">${totalStr}</td>
        <td style="text-align: left;">${purposeStr}</td>
      </tr>
    `;
  });

  // Target exactly 10 rows in the items table as shown in the original physical PDF
  const totalDisplayRows = 10;
  const emptyRowsNeeded = Math.max(0, totalDisplayRows - lineItems.length);
  const emptyRows = [];
  for (let i = lineItems.length + 1; i <= lineItems.length + emptyRowsNeeded; i++) {
    emptyRows.push(`
      <tr>
        <td style="text-align: center;">${i}</td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    `);
  }

  const grandTotal = totalEstimasi || po.total_amount || 0;
  const totalEstimasiStr = grandTotal > 0 ? grandTotal.toLocaleString("id-ID") : "-";

  // 6. Justifikasi / Alasan
  const reasonStr =
    po.reason && po.reason.trim() !== "-"
      ? po.reason.trim()
      : req?.reason && req.reason.trim() !== "-"
      ? req.reason.trim()
      : sr?.remarks && sr.remarks.trim() !== "-"
      ? sr.remarks.trim()
      : "-";

  // 7. Internal Verification
  const isStockAvailable = po.warehouse_status === "tersedia" || po.warehouse_status === "Tersedia di Stok";
  const isApproved = po.status === "approved" || po.status === "do_created" || po.status === "completed";
  const isRejected = po.status === "rejected" || po.status === "cancelled";
  const isPending = !isApproved && !isRejected;
  const specialNotes = escapeHtml(po.special_notes || "");

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Material Requisition Form - ${requestFormNo}</title>
    <style>
      @media print {
        @page {
          size: A4 portrait;
          margin: 8mm 10mm;
        }
        body {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
      * {
        box-sizing: border-box;
      }
      body {
        font-family: Arial, Helvetica, sans-serif;
        color: #000;
        font-size: 11px;
        margin: 0;
        padding: 0;
        background: #fff;
      }
      .page-container {
        max-width: 820px;
        margin: 0 auto;
        padding: 15px 20px;
      }

      /* Header */
      .doc-header {
        text-align: center;
        margin-bottom: 12px;
      }
      .doc-title {
        font-size: 17px;
        font-weight: bold;
        letter-spacing: 0.5px;
        color: #000;
        text-transform: uppercase;
      }
      .doc-subtitle {
        font-size: 11px;
        font-style: italic;
        color: #444;
        margin-top: 3px;
      }

      /* Section Banner */
      .section-banner {
        background-color: #1e4e79 !important;
        color: #ffffff !important;
        font-weight: bold;
        font-size: 10.5px;
        padding: 4px 8px;
        margin-top: 10px;
        letter-spacing: 0.3px;
        border: 1px solid #1e4e79;
      }

      /* Form Table */
      table.form-table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid #1e4e79;
      }
      table.form-table td {
        border: 1px solid #7ea8ce;
        padding: 4px 7px;
        font-size: 10.5px;
        vertical-align: middle;
      }
      .label-cell {
        background-color: #f2f6fa !important;
        color: #111;
        font-weight: normal;
      }
      .value-cell {
        background-color: #ffffff;
        color: #000;
      }

      /* Items Table */
      table.items-table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid #1e4e79;
      }
      table.items-table th {
        background-color: #1e4e79 !important;
        color: #ffffff !important;
        font-size: 9.5px;
        font-weight: bold;
        border: 1px solid #1e4e79;
        padding: 5px 3px;
        text-align: center;
        vertical-align: middle;
      }
      table.items-table td {
        border: 1px solid #7ea8ce;
        padding: 3px 6px;
        font-size: 10px;
        height: 20px;
        vertical-align: middle;
      }
      .total-row td {
        background-color: #d9e1f2 !important;
        font-weight: bold;
        font-size: 10px;
        border-top: 1px solid #1e4e79;
      }

      /* Justifikasi */
      .justifikasi-box {
        border: 1px solid #1e4e79;
        padding: 6px 8px;
        min-height: 46px;
        background-color: #fff;
      }
      .justifikasi-sub {
        font-size: 9px;
        font-style: italic;
        color: #555;
        margin-bottom: 4px;
      }
      .justifikasi-text {
        font-size: 10.5px;
        color: #000;
        line-height: 1.35;
      }

      /* Otorisasi */
      table.otorisasi-table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid #1e4e79;
      }
      table.otorisasi-table th {
        border: 1px solid #7ea8ce;
        background-color: #f2f6fa !important;
        font-size: 10px;
        font-weight: normal;
        padding: 4px 6px;
        text-align: left;
      }
      table.otorisasi-table td {
        border: 1px solid #7ea8ce;
        font-size: 10px;
      }
      .sig-space {
        height: 52px;
      }
      .sig-name {
        text-align: center;
        padding: 4px;
        font-size: 10px;
      }

      /* Verifikasi Internal */
      .verifikasi-box {
        border: 1px solid #1e4e79;
        padding: 6px 8px;
        background-color: #fff;
      }
      .verifikasi-grid {
        display: flex;
        justify-content: space-between;
        font-size: 10px;
      }
      .checkbox-box {
        display: inline-block;
        width: 12px;
        height: 12px;
        border: 1px solid #333;
        text-align: center;
        line-height: 11px;
        font-size: 9px;
        font-weight: bold;
        margin-right: 2px;
        vertical-align: middle;
      }
    </style>
  </head>
  <body>
    <div class="page-container">
      <!-- Document Header -->
      <div class="doc-header">
        <div class="doc-title">MATERIAL REQUISITION FORM</div>
        <div class="doc-subtitle">Internal Request Form</div>
      </div>

      <!-- A. INFORMASI PEMOHON -->
      <div class="section-banner">A. INFORMASI PEMOHON</div>
      <table class="form-table">
        <tr>
          <td class="label-cell" style="width: 14%;">Nomor</td>
          <td class="value-cell" style="width: 36%; font-weight: bold;">${requestFormNo}</td>
          <td class="label-cell" style="width: 22%;">Tanggal Pengajuan</td>
          <td class="value-cell" style="width: 28%;">${tanggalPengajuan}</td>
        </tr>
        <tr>
          <td class="label-cell">Nama</td>
          <td class="value-cell">${namaPemohon}</td>
          <td class="label-cell">Divisi / Departemen</td>
          <td class="value-cell">${divisiDepartemen}</td>
        </tr>
        <tr>
          <td class="label-cell">Posisi</td>
          <td class="value-cell">${posisi}</td>
          <td class="label-cell">Tanggal Dibutuhkan</td>
          <td class="value-cell">${tanggalDibutuhkan}</td>
        </tr>
        <tr>
          <td class="label-cell">ID CARD</td>
          <td class="value-cell">${idCard}</td>
          <td class="label-cell">Tingkat Prioritas</td>
          <td class="value-cell">${prioritas}</td>
        </tr>
      </table>

      <!-- B. DETAIL BARANG YANG DIMINTA -->
      <div class="section-banner">B. DETAIL BARANG YANG DIMINTA</div>
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 4%;">No</th>
            <th style="width: 34%; text-align: left; padding-left: 6px;">Nama Barang &amp; Spesifikasi Teknis</th>
            <th style="width: 7%;">Volume</th>
            <th style="width: 7%;">Satuan</th>
            <th style="width: 14%;">Estimasi Harga Satuan<br><span style="font-weight: normal; font-size: 8.5px;">(Rp)</span></th>
            <th style="width: 14%;">Total Estimasi<br><span style="font-weight: normal; font-size: 8.5px;">(Rp)</span></th>
            <th style="width: 20%;">Keperluan / Peruntukan</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows.join("")}
          ${emptyRows.join("")}
          <tr class="total-row">
            <td colspan="4" style="text-align: right; padding-right: 8px;">TOTAL ESTIMASI KESELURUHAN</td>
            <td colspan="2" style="text-align: right; padding-right: 8px;">${totalEstimasiStr}</td>
            <td style="text-align: center;">-</td>
          </tr>
        </tbody>
      </table>

      <!-- JUSTIFIKASI / ALASAN KEBUTUHAN PENGADAAN -->
      <div class="section-banner">JUSTIFIKASI / ALASAN KEBUTUHAN PENGADAAN</div>
      <div class="justifikasi-box">
        <div class="justifikasi-sub">Tuliskan alasan pengadaan barang (misal: penggantian inventaris lama rusak, penambahan kebutuhan staf baru, keperluan operasional proyek, dll):</div>
        <div class="justifikasi-text">${escapeHtml(reasonStr)}</div>
      </div>

      <!-- OTORISASI -->
      <div class="section-banner">OTORISASI</div>
      <table class="otorisasi-table">
        <tr>
          <th style="width: 25%;">Dibuat Oleh:</th>
          <th style="width: 25%;">Diajukan Oleh:</th>
          <th style="width: 25%;">Dikeluarkan :</th>
          <th style="width: 25%;">Disetujui :</th>
        </tr>
        <tr>
          <td class="sig-space"></td>
          <td class="sig-space"></td>
          <td class="sig-space"></td>
          <td class="sig-space"></td>
        </tr>
        <tr>
          <td class="sig-name">( ${namaPemohon} )</td>
          <td class="sig-name">( Admin Sales )</td>
          <td class="sig-name">( STORE )</td>
          <td class="sig-name">( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</td>
        </tr>
      </table>

      <!-- VERIFIKASI INTERNAL -->
      <div class="section-banner">VERIFIKASI INTERNAL</div>
      <div class="verifikasi-box">
        <div class="verifikasi-grid">
          <div style="flex: 1; padding-right: 15px;">
            <div style="margin-bottom: 5px;">
              Status Stok Gudang : &nbsp;
              <span class="checkbox-box">${isStockAvailable ? "&#10003;" : ""}</span> Tersedia di Stok &nbsp;&nbsp;
              <span class="checkbox-box">${!isStockAvailable ? "&#10003;" : ""}</span> Pengadaan Baru
            </div>
            <div>
              Status Pengajuan : &nbsp;
              <span class="checkbox-box">${isApproved ? "&#10003;" : ""}</span> Disetujui &nbsp;&nbsp;
              <span class="checkbox-box">${isPending ? "&#10003;" : ""}</span> Ditunda &nbsp;&nbsp;
              <span class="checkbox-box">${isRejected ? "&#10003;" : ""}</span> Ditolak
            </div>
          </div>
          <div style="flex: 1; border-left: 1px dotted #999; padding-left: 15px;">
            Catatan Khusus : <span style="border-bottom: 1px dotted #333; display: inline-block; min-width: 180px;">${specialNotes}</span>
          </div>
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
