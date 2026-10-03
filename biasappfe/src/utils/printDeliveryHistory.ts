// @ts-nocheck
import { useMasterStore } from "@/composables/useMasterStore";
import { BIAS_LOGO_DATA_URL } from "@/utils/logoData";

/** DO dianggap punya service history bila teknisi sudah mengisi formnya. */
export function hasDeliveryHistory(d: any): boolean {
  if (!d) return false;
  if (d.is_tested || d.is_completed) return true;
  if (d.time_in || d.time_out) return true;
  if (d.customer_signature || d.technician_signature) return true;
  if (d.action) return true;
  if (d.problem && !String(d.problem).startsWith("Auto-generated")) return true;
  return false;
}

function esc(v: unknown): string {
  return String(v ?? "-").replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[c] ?? c;
  });
}

/**
 * Cetak SERVICE HISTORY untuk delivery order (pekerjaan instalasi/
 * pengiriman yang dikerjakan teknisi via Job Order delivery).
 * Sumber data: field service-history di delivery_orders
 * (problem, action, time_in/out, tested/completed, signatures).
 */
export function printDeliveryServiceHistory(item: any): boolean {
  if (!item) return false;
  const { findCustomer, findUnit, findBrand, findTechnician } =
    useMasterStore();

  const customer: any = findCustomer(item.customer_id) || {};
  const firstLine: any = (item.delivery_order_items || [])[0] || {};
  const u: any =
    firstLine.unit || findUnit(firstLine.unit_id) || {};
  const brand: any = findBrand(u.brand_id) || {};
  const tech: any = findTechnician(item.technician_id) || {};

  const custName = customer.company_name || customer.name || "-";
  const custPhone = customer.phone || "-";
  const picName = customer.pic_name || "-";
  const dateStr = item.delivery_date
    ? new Date(item.delivery_date).toLocaleDateString("en-GB")
    : "-";
  const itemsCount = (item.delivery_order_items || []).length;
  const itemsList = (item.delivery_order_items || [])
    .map((line: any, i: number) => {
      const lu: any = line.unit || findUnit(line.unit_id) || {};
      const label = lu.model || line.product?.name || "Item";
      const sn = lu.serial_no ? ` (${lu.serial_no})` : "";
      return `${i + 1}. ${esc(label)}${esc(sn)} x${line.qty || 1}`;
    })
    .join("<br>");

  const html = `
    <html>
      <head>
        <title>Service History - ${esc(item.do_number || "")}</title>
        <style>
          @media print {
            @page { margin: 10mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 10px; color: #000; }
          .container { max-width: 800px; margin: 0 auto; border: 2px solid #000; box-sizing: border-box; }

          .header-table { width: 100%; border-collapse: collapse; }
          .header-table td { padding: 10px; }
          .logo-col { width: 100px; vertical-align: middle; border-bottom: 2px solid #000; }
          .info-col { text-align: right; vertical-align: middle; border-bottom: 2px solid #000; }

          .logo { width: 70px; height: 70px; }
          .company-name { font-size: 20px; font-weight: bold; color: #3399ff; margin: 0; }
          .tagline { font-size: 14px; font-style: italic; font-weight: bold; margin: 0; }
          .address { font-size: 9px; font-weight: bold; margin-top: 5px; }

          .title-bar { background-color: #000; color: #fff; text-align: center; font-size: 22px; font-weight: bold; padding: 5px; }

          .meta-table { width: 100%; border-collapse: collapse; font-weight: bold; }
          .meta-table td { border-bottom: 2px solid #000; padding: 5px; }

          .section-title { background-color: #2b579a; color: #fff; text-align: center; font-size: 14px; font-weight: bold; padding: 4px; border-bottom: 2px solid #000; }

          .data-table { width: 100%; border-collapse: collapse; font-weight: bold; font-size: 11px; }
          .data-table td { border-bottom: 1px solid #000; padding: 5px 8px; vertical-align: top; }
          .data-table tr:last-child td { border-bottom: 2px solid #000; }
          .data-table .label-col { width: 30%; border-right: 1px solid #000; }
          .data-table .val-col { width: 70%; }

          .bottom-table { width: 100%; border-collapse: collapse; font-weight: bold; font-size: 11px; }
          .bottom-table td { padding: 4px 8px; border-bottom: 1px solid #000; }
        </style>
      </head>
      <body>
        <div class="container">
          <table class="header-table">
            <tr>
              <td class="logo-col">
                <img src="${BIAS_LOGO_DATA_URL}" class="logo"  alt="BiAS Logo" />
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

          <div class="title-bar">SERVICE HISTORY</div>

          <table class="meta-table">
            <tr>
              <td style="width: 30%; border-right: 1px solid #000;">DO Number</td>
              <td>${esc(item.do_number || "-")}</td>
            </tr>
            <tr>
              <td style="border-right: 1px solid #000;">Delivery Date</td>
              <td>${esc(dateStr)}</td>
            </tr>
          </table>

          <div class="section-title">CUSTOMER DETAIL</div>
          <table class="data-table">
            <tr><td class="label-col">Company Name</td><td class="val-col">${esc(custName)}</td></tr>
            <tr><td class="label-col">Customer Type</td><td class="val-col">${esc(String(item.customer_category || customer.category || "Corporate"))}</td></tr>
            <tr><td class="label-col">Address</td><td class="val-col">${esc(customer.address || "-")}</td></tr>
            <tr><td class="label-col">Installation Address</td><td class="val-col">${esc(item.delivery_address || "-")}</td></tr>
            <tr><td class="label-col">Phone</td><td class="val-col">${esc(custPhone)}</td></tr>
            <tr><td class="label-col">Person in Charge</td><td class="val-col">${esc(picName)}</td></tr>
          </table>

          <div class="section-title">PRODUCT DETAIL</div>
          <table class="data-table">
            <tr><td class="label-col">Brand</td><td class="val-col">${esc(brand?.name || "-")}</td></tr>
            <tr><td class="label-col">Product Types</td><td class="val-col">: ${u.is_computer ? "Computer/Desktop" : "Photocopy"}</td></tr>
            <tr><td class="label-col">Model/Type</td><td class="val-col">${esc(u.model || "-")}</td></tr>
            <tr><td class="label-col">Serial Number</td><td class="val-col">${esc(u.serial_no || "-")}</td></tr>
            ${
              itemsCount > 1
                ? `<tr><td class="label-col">Items (${itemsCount})</td><td class="val-col">${itemsList}</td></tr>`
                : ""
            }
            <tr><td class="label-col" style="height: 50px;">Problem</td><td class="val-col">${esc(item.problem || "")}</td></tr>
            <tr><td class="label-col" style="height: 50px;">Action / Remarks</td><td class="val-col">${esc(item.action || item.notes || "")}</td></tr>
          </table>

          <table class="bottom-table">
            <tr>
              <td style="width: 30%;">

              </td>
              <td>
                <div style="display: flex;">
                  <div style="width: 80px; border-right: 1px solid #000; padding: 2px;">Tested</div><div style="padding: 2px;">${item.is_tested ? "YES" : "NO"}</div>
                </div>
                <div style="display: flex; border-top: 1px solid #000;">
                  <div style="width: 80px; border-right: 1px solid #000; padding: 2px;">Complete</div><div style="padding: 2px;">${item.is_completed ? "YES" : "NO"}</div>
                </div>
                <div style="display: flex; border-top: 1px solid #000;">
                  <div style="width: 80px; border-right: 1px solid #000; padding: 2px;">Time in</div><div style="padding: 2px;">${esc(item.time_in || "")}</div>
                </div>
                <div style="display: flex; border-top: 1px solid #000;">
                  <div style="width: 80px; border-right: 1px solid #000; padding: 2px;">Time Out</div><div style="padding: 2px;">${esc(item.time_out || "")}</div>
                </div>
              </td>
            </tr>
          </table>

          <div style="display: flex; justify-content: space-between; padding: 5px 20px 20px; font-weight: bold; border-top: 2px solid #000;">
            <div style="width: 45%; text-align: center;">
              <div>TESTED ${item.is_tested ? "YES" : "NO"}</div>
              <div style="min-height: 50px; border-bottom: 1px solid #000; text-align: center; margin-top: 10px;">
                ${item.technician_signature ? '<img src="' + item.technician_signature + '" style="max-height: 50px;" />' : ""}
              </div>
              <div style="margin-top: 5px;">${esc(item.technician_name || tech.name || tech.full_name || tech.user?.name || "")}</div>
            </div>
            <div style="width: 45%; text-align: center; display: flex; flex-direction: column; justify-content: flex-end;">
              <div style="margin-bottom: 10px;">COMPLETE ${item.is_completed ? "YES" : "NO"}</div>
              <div style="border-bottom: 1px solid #000; padding-bottom: 5px; min-height: 50px;">
                ${item.customer_signature ? '<img src="' + item.customer_signature + '" style="max-height: 50px;" />' : ""}
              </div>
              <div style="margin-top: 5px;">${esc(item.customer_name || picName || "")}</div>
            </div>
          </div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 500);
          }
        <\/script>
      </body>
    </html>
  `;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  printWindow.document.write(html);
  printWindow.document.close();
  return true;
}
