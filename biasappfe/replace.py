import codecs

content = codecs.open('d:/hansenjonatann/project/freelance-project/biasapp/biasapp-frontend/biasappfe/src/pages/customer-service/SalesInvoicesPage.vue', 'r', 'utf-8').read()

replacement = """function formatRupiah(val: number): string {
  return 'Rp ' + val.toLocaleString('id-ID')
}

function printInvoice(item: any) {
  const customer = findCustomer(item.customer_id)
  const custName = customer?.company_name || customer?.name || '-'
  const custAddress = customer?.address || '-'
  const custPhone = customer?.phone || '-'
  const pic = customer?.pic_name || '-'
  const gender = customer?.pic_gender
  let prefix = 'Bapak/Ibu '
  if (gender === 'L') prefix = 'Bapak '
  if (gender === 'P') prefix = 'Ibu '
  const picDisplay = pic !== '-' ? prefix + pic : '-'
  
  const invoiceNo = item.invoice_no || '-'
  const invoiceDate = item.created_at || item.due_date
  
  const dateStr = invoiceDate ? new Date(invoiceDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'

  let itemsHtml = ''
  const sale = findSale(item.sale_id)
  if (sale && sale.sale_items && sale.sale_items.length > 0) {
    itemsHtml = sale.sale_items.map((si: any, idx: number) => {
      const p = findProduct(si.product_id)
      const pName = p ? p.name : ('Produk ID: ' + si.product_id)
      return `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td>${pName}</td>
          <td style="text-align: center;">${si.qty || 1}</td>
          <td style="text-align: center;">unit</td>
          <td class="rp-col">Rp</td><td class="val-col">${(si.unit_price || si.price || 0).toLocaleString('id-ID')}</td>
          <td class="rp-col">Rp</td><td class="val-col">${((si.unit_price || si.price || 0) * (si.qty || 1)).toLocaleString('id-ID')}</td>
        </tr>
      `
    }).join('')
  } else {
    itemsHtml = `<tr><td colspan="8" style="text-align: center; color: #666;">Data item tidak tersedia</td></tr>`
  }

  const subTotalStr = (item.subtotal || item.total_amount || item.total || 0).toLocaleString('id-ID')
  const grandTotalStr = (item.total_amount || item.total || 0).toLocaleString('id-ID')

  const html = `
    <html>
      <head>
        <title>Invoice - ${invoiceNo}</title>
        <style>
          @media print {
            @page { margin: 10mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 0; color: #000; font-size: 12px; margin: 0; }
          .container { max-width: 900px; margin: 0 auto; padding: 20px; }
          
          .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .header-table td { vertical-align: top; padding: 0; }
          
          .logo-col { width: 50%; padding-right: 20px; }
          .info-col { width: 50%; }
          
          .logo-container { display: flex; align-items: center; margin-bottom: 10px; }
          .logo { width: 80px; height: 80px; margin-right: 15px; flex-shrink: 0; }
          
          .company-details h1 { margin: 0; font-size: 22px; font-weight: bold; }
          .company-details h2 { margin: 0; font-size: 14px; font-style: italic; font-weight: normal; margin-bottom: 10px; color: #333; }
          .company-details p { margin: 0; font-size: 11px; line-height: 1.4; }
          
          .invoice-text { font-size: 28px; font-weight: bold; text-align: center; margin-top: 20px; margin-bottom: 10px; letter-spacing: 1px; }
          
          .meta-table { width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #7ea8ce; }
          .meta-table td, .meta-table th { border: 1px solid #7ea8ce; padding: 4px 8px; }
          .meta-table .bg-blue { background-color: #003366; color: white; font-weight: bold; }
          .meta-table .label { width: 90px; font-weight: bold; }
          
          .items-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          .items-table th { background-color: #003366; color: white; border: 1px solid #7ea8ce; padding: 8px; text-align: center; font-size: 12px; }
          .items-table td { border: 1px solid #7ea8ce; padding: 8px; vertical-align: top; }
          .items-table .rp-col { border-right: none; width: 20px; padding-right: 2px; }
          .items-table .val-col { border-left: none; text-align: right; }
          
          .summary-table { width: 350px; float: right; border-collapse: collapse; margin-top: 0; margin-bottom: 20px; }
          .summary-table td { border: 1px solid #7ea8ce; padding: 6px; background-color: #dbeaf4; font-weight: bold; }
          .summary-table .label { text-align: right; padding-right: 10px; }
          
          .payment-info { clear: left; float: left; margin-top: 10px; font-size: 12px; font-weight: bold; line-height: 1.6; }
          
          .signatures { display: flex; justify-content: space-between; clear: both; padding-top: 50px; text-align: center; font-weight: bold; }
          .sig-box { width: 250px; }
          .sig-line { margin-top: 80px; border-bottom: 1px solid #000; padding-bottom: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <table class="header-table">
            <tr>
              <td class="logo-col">
                <div class="logo-container">
                  <svg class="logo" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="50" cy="50" r="40" stroke="#003366" stroke-width="12"/>
                    <path d="M50 10 A40 40 0 0 1 90 50" stroke="#F4B042" stroke-width="12" fill="none"/>
                    <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#F4B042" font-weight="bold" font-size="22">BiAS</text>
                  </svg>
                  <div class="company-details">
                    <h1>PT. BIAS SURYA</h1>
                    <h1>TEKNOLOGI</h1>
                    <h2>The shape of smart</h2>
                  </div>
                </div>
                <div class="company-details" style="padding-left: 95px;">
                  <p>Ruko Purimas Blok A No.47 Kota Batam,<br>
                  Kepulauan Riau - Indonesia<br>
                  Phone: +62811 704 5657<br>
                  Email: admin@biasbst.com<br>
                  Website: www.biassuryateknologi.com</p>
                </div>
                <div class="invoice-text">INVOICE</div>
              </td>
              <td class="info-col">
                <div style="font-size: 20px; font-weight: bold; text-align: right; margin-bottom: 10px; font-family: monospace;">INVOICE NO. : ${invoiceNo}</div>
                <table class="meta-table">
                  <tr>
                    <td class="label">Date :</td>
                    <td>${dateStr}</td>
                  </tr>
                  <tr>
                    <td class="label">PO NO.:</td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colspan="2" class="bg-blue">Kepada Yth. :</td>
                  </tr>
                  <tr>
                    <td colspan="2" style="font-weight: bold; height: 35px; vertical-align: top;">${custName}</td>
                  </tr>
                  <tr>
                    <td colspan="2" class="bg-blue" style="height: 10px; padding: 4px 8px;">Address :</td>
                  </tr>
                  <tr>
                    <td colspan="2" style="height: 45px; vertical-align: top;">${custAddress}</td>
                  </tr>
                  <tr>
                    <td class="label">Phone :</td>
                    <td>${custPhone}</td>
                  </tr>
                  <tr>
                    <td class="label">Up.:</td>
                    <td>${picDisplay}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

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

          <table class="summary-table">
            <tr>
              <td class="label">Sub Total</td>
              <td class="rp-col" style="border-right: none; width: 30px; padding-right: 0;">Rp</td>
              <td class="val-col" style="border-left: none; text-align: right; width: 110px;">${subTotalStr}</td>
            </tr>
            <tr>
              <td class="label">Discount</td>
              <td class="rp-col" style="border-right: none; padding-right: 0;">Rp</td>
              <td class="val-col" style="border-left: none; text-align: right;">-</td>
            </tr>
            <tr>
              <td class="label">Amount</td>
              <td class="rp-col" style="border-right: none; padding-right: 0;">Rp</td>
              <td class="val-col" style="border-left: none; text-align: right;">${grandTotalStr}</td>
            </tr>
          </table>

          <div class="payment-info">
            Pembayaran Transfer ke rekening :<br>
            BANK BRKSYARIAH Cabang Batam<br>
            Rek No. 106-08-85757<br>
            A/N : PT. BIAS SURYA TEKNOLOGI<br>
            NPWP : 0941.8395.0822.5000
          </div>

          <div class="signatures">
            <div class="sig-box">
              Received By,
              <div class="sig-line"></div>
            </div>
            <div class="sig-box">
              Hormat Kami,
              <div class="sig-line">Grace</div>
            </div>
          </div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(() => { window.print(); }, 500);
          }
        </script>
      </body>
    </html>
  `
  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
  }
}
</script>"""

if 'function printInvoice' not in content:
    target1 = "function formatRupiah(val: number): string {\r\n  return 'Rp ' + val.toLocaleString('id-ID')\r\n}\r\n</script>"
    target2 = "function formatRupiah(val: number): string {\n  return 'Rp ' + val.toLocaleString('id-ID')\n}\n</script>"
    
    if target1 in content:
        content = content.replace(target1, replacement)
    elif target2 in content:
        content = content.replace(target2, replacement)
        
    codecs.open('d:/hansenjonatann/project/freelance-project/biasapp/biasapp-frontend/biasappfe/src/pages/customer-service/SalesInvoicesPage.vue', 'w', 'utf-8').write(content)
    print('Replaced')
else:
    print('Already has printInvoice')
