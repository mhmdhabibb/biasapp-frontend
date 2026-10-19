// @ts-nocheck
import { useMasterStore } from "@/composables/useMasterStore";
import { BIAS_LOGO_DATA_URL } from "@/utils/logoData";
import biasLogoUrl from "@/assets/bias-logo.png";

function trimSignature(dataUrl?: string): Promise<string> {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image")) {
    return Promise.resolve(dataUrl || "");
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) return resolve(dataUrl);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(dataUrl);

        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        let minX = w, minY = h, maxX = 0, maxY = 0;
        let found = false;

        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const a = data[idx + 3] ?? 0;
            const r = data[idx] ?? 255;
            const g = data[idx + 1] ?? 255;
            const b = data[idx + 2] ?? 255;

            // Dark stroke pixel: has opacity and is not white background
            if (a > 30 && (r < 235 || g < 235 || b < 235)) {
              found = true;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        if (!found || maxX <= minX || maxY <= minY) {
          return resolve(dataUrl);
        }

        const pad = 6;
        const cropX = Math.max(0, minX - pad);
        const cropY = Math.max(0, minY - pad);
        const cropW = Math.min(w - cropX, (maxX - minX) + pad * 2);
        const cropH = Math.min(h - cropY, (maxY - minY) + pad * 2);

        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const cropCtx = cropCanvas.getContext("2d");
        if (!cropCtx) return resolve(dataUrl);

        cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        resolve(cropCanvas.toDataURL("image/png"));
      } catch (e) {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function printDeliveryOrder(item: any): Promise<boolean> {
  if (!item) return false;
  // Open window synchronously to avoid popup blocker
  const win = window.open("", "_blank");
  if (!win) return false;

  const [assignerSig, techSig, custSig] = await Promise.all([
    trimSignature(item.assigner_signature),
    trimSignature(item.technician_signature),
    trimSignature(item.customer_signature),
  ]);

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

  const assignerName = item.assigner_name || item.user?.name || item.created_by?.name || "";
  const techName = item.technician_name || (item.technician ? (item.technician.name || item.technician.full_name) : "");
  const recipientName = item.customer_name || item.recipient_name || "";
  const logoSrc = BIAS_LOGO_DATA_URL || biasLogoUrl;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
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
          .logo { width: 70px; height: 70px; margin-right: 15px; flex-shrink: 0; object-fit: contain; }
          
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
          
          .signatures { display: flex; justify-content: space-between; clear: both; margin-top: 35px; text-align: center; font-size: 11px; padding: 0 10px; }
          .sig-box { width: 220px; display: flex; flex-direction: column; align-items: center; }
          .sig-title { font-weight: bold; font-size: 11px; height: 22px; display: flex; align-items: center; justify-content: center; text-transform: uppercase; }
          .sig-space { height: 70px; width: 100%; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 2px; }
          .sig-img { max-height: 65px; max-width: 170px; object-fit: contain; display: block; margin: 0 auto; }
          .sig-line { border-bottom: 1px solid #000; width: 85%; margin: 2px auto 6px auto; }
          .sig-name { font-weight: normal; font-size: 11px; min-height: 18px; line-height: 1.2; word-break: break-word; }
        </style>
      </head>
      <body>
        <div class="page-break" style="padding: 20px; box-sizing: border-box; max-width: 900px; margin: 0 auto;">
          <div class="header-grid">
            <div class="header-box">
              <div class="header-title">SHIPPER</div>
              <div class="logo-container">
                <img src="${logoSrc}" class="logo" alt="BiAS Logo" />
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
            <div class="sig-box">
              <div class="sig-title">PT BIAS SURYA TEKNOLOGI</div>
              <div class="sig-space">
                ${assignerSig ? `<img src="${assignerSig}" class="sig-img" alt="Signature" />` : ''}
              </div>
              <div class="sig-line"></div>
              <div class="sig-name">${assignerName || '( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )'}</div>
            </div>
            <div class="sig-box">
              <div class="sig-title">Delivered By,</div>
              <div class="sig-space">
                ${techSig ? `<img src="${techSig}" class="sig-img" alt="Signature" />` : ''}
              </div>
              <div class="sig-line"></div>
              <div class="sig-name">${techName || '( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )'}</div>
            </div>
            <div class="sig-box">
              <div class="sig-title">Received By,</div>
              <div class="sig-space">
                ${custSig ? `<img src="${custSig}" class="sig-img" alt="Signature" />` : ''}
              </div>
              <div class="sig-line"></div>
              <div class="sig-name">${recipientName || '( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )'}</div>
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

  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
