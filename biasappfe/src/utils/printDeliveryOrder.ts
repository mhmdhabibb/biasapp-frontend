// @ts-nocheck
import { useMasterStore } from "@/composables/useMasterStore";
import { BIAS_LOGO_DATA_URL } from "@/utils/logoData";

export function printDeliveryOrder(item: any): boolean {
  if (!item) return false;
  const masterStore = useMasterStore();

  const customer: any = masterStore.findCustomer(item.customer_id) || {};
  const custName = customer.company_name || customer.name || "-";
  const custAddress = customer.address || "-";
  const custPhone = customer.phone || "-";
  const pic = customer.pic_name || "-";
  const gender = customer.pic_gender;
  let prefix = "Bapak/Ibu ";
  if (gender === "L") prefix = "Bapak ";
  if (gender === "P") prefix = "Ibu ";
  const picDisplay = pic !== "-" ? prefix + pic : "-";

  const dateStr = item.delivery_date
    ? new Date(item.delivery_date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "2-digit",
      })
    : "-";

  // Group items by Model/Product Name
  const groupedItems: any[] = [];
  const items = item.delivery_order_items || [];
  
  items.forEach((doi: any) => {
    let pName = doi.description || "-";
    let remarks = doi.remarks || "-";
    let serialNo = "-";

    if (doi.product_id) {
      const p = masterStore.findProduct(doi.product_id);
      pName = p ? p.name : "Product ID: " + doi.product_id;
    }
    
    if (doi.unit_id) {
      const u = masterStore.findUnit(doi.unit_id);
      if (!doi.product_id) {
        pName = u ? u.name || u.model : "Unit Only";
      }
      serialNo = u ? u.serial_no : "-";
    }

    const qty = doi.qty || 1;
    
    const existing = groupedItems.find((gi) => gi.name === pName && gi.remarks === remarks);
    if (existing) {
      existing.qty += qty;
      if (serialNo !== "-") existing.serial_numbers.push(serialNo);
    } else {
      groupedItems.push({
        name: pName,
        qty: qty,
        remarks: remarks,
        serial_numbers: serialNo !== "-" ? [serialNo] : []
      });
    }
  });

  let itemsHtml = "";
  if (groupedItems.length > 0) {
    itemsHtml = groupedItems
      .map((gi: any, idx: number) => {
        let rowHtml = `
          <tr>
            <td style="text-align: center;">${idx + 1}</td>
            <td>${gi.name}</td>
            <td style="text-align: center;">${gi.qty}</td>
            <td style="text-align: center;">Unit</td>
            <td style="text-align: center;">${gi.remarks}</td>
          </tr>
        `;
        
        // S/N Grid
        if (gi.serial_numbers && gi.serial_numbers.length > 0) {
          rowHtml += `
            <tr>
              <td></td>
              <td>S/N :</td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          `;
          
          for (let i = 0; i < gi.serial_numbers.length; i += 2) {
            const sn1 = gi.serial_numbers[i];
            const sn2 = gi.serial_numbers[i + 1] || "";
            rowHtml += `
              <tr>
                <td></td>
                <td style="padding: 0;">
                  <div style="display: grid; grid-template-columns: 50% 50%; width: 100%; height: 100%;">
                    <div style="padding: 4px;">${sn1}</div>
                    <div style="padding: 4px;">${sn2}</div>
                  </div>
                </td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            `;
          }
        }
        
        return rowHtml;
      })
      .join("");
  } else {
    itemsHtml = `<tr><td colspan="5" style="text-align: center; color: #666; padding: 10px;">No item data available</td></tr>`;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Delivery Order - ${item.do_number}</title>
        <style>
          @media print {
            @page { size: A4 portrait; margin: 10mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .page-break { page-break-after: always; break-after: page; }
            .page-break:last-child { page-break-after: auto; break-after: auto; }
          }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 0; color: #000; font-size: 11px; margin: 0; }
          .page-break { page-break-after: always; break-after: page; min-height: 95vh; box-sizing: border-box; }
          .page-break:last-child { page-break-after: auto; break-after: auto; }
          
          .header-grid {
            display: grid;
            grid-template-columns: 50% 50%;
            border: 1px solid #0066cc;
            margin-bottom: 15px;
          }
          
          .header-box { border-right: 1px solid #0066cc; }
          .header-box:last-child { border-right: none; }
          .header-title { font-weight: bold; text-align: center; border-bottom: 1px solid #0066cc; padding: 4px; }
          
          .logo-container { display: flex; align-items: center; padding: 10px; }
          .logo { width: 70px; height: 70px; margin-right: 15px; flex-shrink: 0; }
          
          .company-details h1 { margin: 0; font-size: 16px; font-weight: bold; }
          .company-details h2 { margin: 0; font-size: 12px; font-style: italic; font-weight: normal; margin-bottom: 5px; color: #333; }
          .company-details p { margin: 0; font-size: 8px; line-height: 1.4; }
          
          .meta-table { width: 100%; border-collapse: collapse; font-size: 11px; }
          .meta-table td { border-bottom: 1px solid #0066cc; padding: 4px; }
          .meta-table td:first-child { border-right: 1px solid #0066cc; width: 60px; font-weight: bold; }
          
          .invoice-text { font-size: 22px; font-weight: bold; text-align: center; margin-bottom: 15px; letter-spacing: 1px; }
          
          .items-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          .items-table th, .items-table td { border: 1px solid #0066cc; padding: 4px; vertical-align: top; }
          .items-table th { font-weight: bold; text-align: center; }
          
          .signatures { display: flex; justify-content: space-between; clear: both; padding-top: 40px; text-align: center; font-weight: bold; font-size: 10px; padding-left: 20px; padding-right: 20px;}
          .sig-box { width: 200px; }
          .sig-line { margin-top: 60px; border-bottom: 1px solid #000; padding-bottom: 5px; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <div class="page-break" style="padding: 20px; box-sizing: border-box; max-width: 900px; margin: 0 auto;">
          <div class="header-grid">
            <div class="header-box">
              <div class="header-title">SHIPPER</div>
              <div class="logo-container">
                <img src="${BIAS_LOGO_DATA_URL}" class="logo" alt="BiAS Logo" />
                <div class="company-details">
                  <h1>PT. BIAS SURYA</h1>
                  <h1>TEKNOLOGI</h1>
                  <h2>The shape of smart</h2>
                  <p>Ruko Purimas Blok A No.47 Kota Batam,<br>
                  Kepulauan Riau - Indonesia<br>
                  Phone: +62811 704 5657<br>
                  Email: admin@biasbst.com<br>
                  Website: www.biassuryateknologi.com</p>
                </div>
              </div>
            </div>
            
            <div class="header-box">
              <div class="header-title">Recipient</div>
              <table class="meta-table">
                <tr><td>Date</td><td>${dateStr}</td></tr>
                <tr><td>DO No.</td><td>${item.do_number || "-"}</td></tr>
                <tr><td>PO No.</td><td>${item.purchase_order?.po_no || "-"}</td></tr>
                <tr><td colspan="2" style="border-right: none; font-weight: bold; background: #f0f0f0;">${custName}</td></tr>
                <tr><td colspan="2" style="border-right: none; border-bottom: 1px solid #0066cc;">${custAddress}</td></tr>
                <tr><td>PIC</td><td>${picDisplay}</td></tr>
                <tr><td style="border-bottom: none;">Phone</td><td style="border-bottom: none;">${custPhone}</td></tr>
              </table>
            </div>
          </div>
          
          <div class="invoice-text">DELIVERY ORDER</div>
          
          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 40px;">No</th>
                <th>Description</th>
                <th style="width: 50px;">Qty</th>
                <th style="width: 50px;">UOM</th>
                <th style="width: 150px;">REMARKS</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          
          <div class="signatures">
            <div class="sig-box" style="text-align: center;">
              PT BIAS SURYA TEKNOLOGI
              ${item.assigner_signature ? `<div style="height: 70px; display: flex; align-items: flex-end; justify-content: center;"><img src="${item.assigner_signature}" style="max-height: 60px; object-fit: contain;" /></div>` : '<div style="height: 70px;"></div>'}
              <div style="border-bottom: 1px solid #000; margin: 5px auto; width: 80%;"></div>
              <div style="font-weight: normal;">${item.assigner_name || ""}</div>
            </div>
            <div class="sig-box" style="text-align: center;">
              Delivered By,
              ${item.technician_signature ? `<div style="height: 70px; display: flex; align-items: flex-end; justify-content: center;"><img src="${item.technician_signature}" style="max-height: 60px; object-fit: contain;" /></div>` : '<div style="height: 70px;"></div>'}
              <div style="border-bottom: 1px solid #000; margin: 5px auto; width: 80%;"></div>
              <div style="font-weight: normal;">${item.technician_name || ""}</div>
            </div>
            <div class="sig-box" style="text-align: center;">
              Received By,
              ${item.customer_signature ? `<div style="height: 70px; display: flex; align-items: flex-end; justify-content: center;"><img src="${item.customer_signature}" style="max-height: 60px; object-fit: contain;" /></div>` : '<div style="height: 70px;"></div>'}
              <div style="border-bottom: 1px solid #000; margin: 5px auto; width: 80%;"></div>
              <div style="font-weight: normal;">${item.customer_name || item.recipient_name || ""}</div>
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

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    return true;
  }
  return false;
}
