// @ts-nocheck
import { useMasterStore } from "@/composables/useMasterStore";
import { BIAS_LOGO_DATA_URL } from "@/utils/logoData";
import biasLogoUrl from "@/assets/bias-logo.png";
import { api } from "@/services/api";

function formatDate(val: any): string {
  if (!val) return "-";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(val);
  }
}

export async function getJobOrderHtml(job: any, autoPrint: boolean = false): Promise<string> {
  if (!job) return "";

  let fullJob = job;
  // Fetch full details if relations might be missing
  if (job.id && (!job.customer || !job.technician || !job.unit)) {
    try {
      const res: any = await api.get(`/job-orders/${job.id}`, true, false);
      const data = res?.data?.data || res?.data || res;
      if (data && data.id) {
        fullJob = { ...job, ...data };
      }
    } catch (e) {
      console.warn("Failed to fetch full job order for printing:", e);
    }
  }

  const masterStore = useMasterStore();
  const customerId = fullJob.customer_id || fullJob.customer?.id || fullJob.survey?.customer_id || fullJob.service_request?.customer_id || fullJob.delivery_order?.customer_id || null;
  const unitId = fullJob.unit_id || fullJob.unit?.id || fullJob.survey?.unit_id || fullJob.service_request?.unit_id || fullJob.delivery_order?.delivery_order_items?.[0]?.unit_id || null;
  const techId = fullJob.technician_id || fullJob.technician?.id || null;

  const customer: any = masterStore.findCustomer(customerId) || fullJob.customer || fullJob.survey?.customer || fullJob.delivery_order?.customer || {};
  const unit: any = masterStore.findUnit(unitId) || fullJob.unit || fullJob.survey?.unit || {};
  const tech: any = masterStore.findTechnician(techId) || fullJob.technician || {};

  const brand = unit.brand_id ? masterStore.findBrand(unit.brand_id) : (unit.brand || null);

  const logoSrc = BIAS_LOGO_DATA_URL || biasLogoUrl;

  const jobNo = fullJob.job_order_no || `JO-${fullJob.id || 'NEW'}`;
  const jobType = (fullJob.job_type || 'service').toUpperCase();
  const status = (fullJob.status || 'PENDING').toUpperCase().replace(/_/g, ' ');

  const refNo = fullJob.delivery_order?.do_number 
    || fullJob.service_request?.request_no 
    || fullJob.service_report?.report_no 
    || fullJob.survey?.survey_no 
    || '-';

  const custName = customer.company_name || customer.name || "-";
  const custAddress = customer.address || fullJob.delivery_order?.delivery_address || "-";
  const custPic = customer.pic_name || fullJob.delivery_order?.recipient_name || "-";
  const custPhone = customer.phone || fullJob.delivery_order?.recipient_phone || "-";

  const techName = tech.name || tech.full_name || fullJob.technician_name || "Teknisi";
  const techPhone = tech.phone || tech.mobile || "-";

  const unitModel = unit.model || fullJob.delivery_order?.delivery_order_items?.[0]?.model || "-";
  const unitSn = unit.serial_no || fullJob.delivery_order?.delivery_order_items?.[0]?.serial_no || "-";
  const brandName = brand?.name || unit.brand_name || "-";

  const problemDesc = fullJob.problem_description 
    || fullJob.service_request?.problem_description 
    || fullJob.instructions 
    || fullJob.remarks 
    || "-";

  const scheduledDate = formatDate(fullJob.scheduled_date || fullJob.delivery_order?.delivery_date || fullJob.created_at);

  // Group or gather items if this is a delivery job or has spareparts
  const doItems = fullJob.delivery_order?.delivery_order_items || [];
  let itemsTableHtml = "";
  if (doItems.length > 0) {
    itemsTableHtml = `
      <div style="margin-top: 15px;">
        <div style="font-weight: bold; font-size: 11px; margin-bottom: 6px; text-transform: uppercase; color: #1e3a8a;">
          Daftar Item / Unit / Barang Terkait:
        </div>
        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 35px;">No</th>
              <th>Deskripsi / Nama Barang</th>
              <th style="width: 70px;">Qty</th>
              <th style="width: 140px;">Serial Number</th>
              <th>Catatan / Keterangan</th>
            </tr>
          </thead>
          <tbody>
            ${doItems.map((it: any, idx: number) => {
              const p = it.product_id ? masterStore.findProduct(it.product_id) : null;
              const u = it.unit_id ? masterStore.findUnit(it.unit_id) : null;
              const desc = p?.name || u?.model || it.description || it.model || "-";
              const sn = u?.serial_no || it.serial_no || "-";
              return `
                <tr>
                  <td style="text-align: center;">${idx + 1}</td>
                  <td>${desc}</td>
                  <td style="text-align: center;">${it.qty || 1} Unit</td>
                  <td style="text-align: center; font-family: monospace;">${sn}</td>
                  <td>${it.remarks || '-'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  const printScript = autoPrint
    ? `<script>window.onload = function() { setTimeout(function() { window.print(); }, 500); }<\/script>`
    : "";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Surat Perintah Kerja (Job Order) - ${jobNo}</title>
        <style>
          @media print {
            @page { size: A4 portrait; margin: 10mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
          }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #0f172a;
            font-size: 11px;
            line-height: 1.4;
            margin: 0;
            padding: 0;
            background: #fff;
          }
          .spk-container {
            max-width: 840px;
            margin: 0 auto;
            padding: 24px 28px;
            box-sizing: border-box;
          }
          .header-table {
            width: 100%;
            border-bottom: 2px solid #0066cc;
            padding-bottom: 12px;
            margin-bottom: 16px;
          }
          .logo {
            width: 75px;
            height: 75px;
            object-fit: contain;
          }
          .company-name {
            font-size: 16px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: 0.5px;
          }
          .tagline {
            font-size: 11px;
            color: #64748b;
            font-style: italic;
            margin-bottom: 4px;
          }
          .company-address {
            font-size: 9.5px;
            color: #475569;
            line-height: 1.35;
          }
          .doc-badge {
            display: inline-block;
            background: #0066cc;
            color: #ffffff;
            font-size: 15px;
            font-weight: 800;
            padding: 6px 14px;
            border-radius: 4px;
            text-align: right;
            letter-spacing: 0.5px;
          }
          .doc-no {
            font-size: 12px;
            font-weight: 700;
            color: #1e3a8a;
            margin-top: 4px;
            text-align: right;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
            margin-bottom: 16px;
          }
          .box-card {
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            overflow: hidden;
            background: #ffffff;
          }
          .box-header {
            background: #f1f5f9;
            border-bottom: 1px solid #cbd5e1;
            padding: 6px 10px;
            font-weight: 700;
            font-size: 11px;
            color: #1e3a8a;
            text-transform: uppercase;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
          }
          .info-table td {
            padding: 5px 8px;
            border-bottom: 1px solid #f1f5f9;
            font-size: 11px;
            vertical-align: top;
          }
          .info-table tr:last-child td {
            border-bottom: none;
          }
          .td-label {
            width: 32%;
            font-weight: 600;
            color: #475569;
          }
          .td-colon {
            width: 8px;
            text-align: center;
            color: #94a3b8;
          }
          .td-val {
            color: #0f172a;
          }
          .unit-card {
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            margin-bottom: 16px;
            overflow: hidden;
          }
          .problem-card {
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            margin-bottom: 16px;
            overflow: hidden;
          }
          .problem-body {
            padding: 10px 12px;
            background: #fafaf9;
            min-height: 48px;
            font-size: 11.5px;
            white-space: pre-wrap;
            color: #1f2937;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10.5px;
          }
          .items-table th, .items-table td {
            border: 1px solid #cbd5e1;
            padding: 6px 8px;
          }
          .items-table th {
            background: #f8fafc;
            color: #334155;
            font-weight: 700;
            text-align: left;
          }
          .signatures-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 14px;
            margin-top: 30px;
            text-align: center;
          }
          .sig-box {
            border: 1px dashed #94a3b8;
            border-radius: 6px;
            padding: 8px 10px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-height: 120px;
            background: #ffffff;
          }
          .sig-header {
            font-weight: 700;
            font-size: 10.5px;
            color: #475569;
            text-transform: uppercase;
          }
          .sig-line {
            border-bottom: 1px solid #0f172a;
            margin: 6px auto;
            width: 80%;
          }
          .sig-name {
            font-weight: 600;
            font-size: 11px;
            color: #0f172a;
          }
          .sig-role {
            font-size: 9.5px;
            color: #64748b;
          }
          .badge-status {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-weight: 700;
            font-size: 10px;
            background: #e2e8f0;
            color: #334155;
          }
        </style>
      </head>
      <body>
        <div class="spk-container">
          <!-- Header -->
          <table class="header-table">
            <tr>
              <td style="width: 85px; vertical-align: top;">
                <img src="${logoSrc}" class="logo" alt="PT BIAS Logo" />
              </td>
              <td style="vertical-align: top; padding-left: 10px;">
                <div class="company-name">PT. BIAS SURYA TEKNOLOGI</div>
                <div class="tagline">The shape of smart</div>
                <div class="company-address">
                  Ruko Purimas Blok A No.47 Kota Batam, Kepulauan Riau - Indonesia<br>
                  Phone: +62811 704 5657 | Email: admin@biasbst.com | Web: www.biassuryateknologi.com
                </div>
              </td>
              <td style="vertical-align: top; text-align: right; width: 260px;">
                <div class="doc-badge">SURAT PERINTAH KERJA</div>
                <div class="doc-no">No. SPK: ${jobNo}</div>
                <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
                  Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}
                </div>
              </td>
            </tr>
          </table>

          <!-- 2 Box Info: Job Order Info & Customer Info -->
          <div class="info-grid">
            <!-- Box Left: Informasi Pekerjaan -->
            <div class="box-card">
              <div class="box-header">📋 Informasi Pekerjaan (SPK)</div>
              <table class="info-table">
                <tr>
                  <td class="td-label">No. SPK</td>
                  <td class="td-colon">:</td>
                  <td class="td-val font-semibold">${jobNo}</td>
                </tr>
                <tr>
                  <td class="td-label">Tipe Tugas</td>
                  <td class="td-colon">:</td>
                  <td class="td-val">
                    <span style="font-weight: bold; color: #0066cc;">${jobType}</span>
                  </td>
                </tr>
                <tr>
                  <td class="td-label">No. Referensi</td>
                  <td class="td-colon">:</td>
                  <td class="td-val font-mono">${refNo}</td>
                </tr>
                <tr>
                  <td class="td-label">Jadwal Tugas</td>
                  <td class="td-colon">:</td>
                  <td class="td-val">${scheduledDate}</td>
                </tr>
                <tr>
                  <td class="td-label">Status</td>
                  <td class="td-colon">:</td>
                  <td class="td-val">
                    <span class="badge-status">${status}</span>
                  </td>
                </tr>
                <tr>
                  <td class="td-label">Teknisi Tugas</td>
                  <td class="td-colon">:</td>
                  <td class="td-val font-semibold">${techName} (${techPhone})</td>
                </tr>
              </table>
            </div>

            <!-- Box Right: Informasi Pelanggan -->
            <div class="box-card">
              <div class="box-header">🏢 Pelanggan / Lokasi Pekerjaan</div>
              <table class="info-table">
                <tr>
                  <td class="td-label">Perusahaan</td>
                  <td class="td-colon">:</td>
                  <td class="td-val font-semibold">${custName}</td>
                </tr>
                <tr>
                  <td class="td-label">PIC</td>
                  <td class="td-colon">:</td>
                  <td class="td-val">${custPic}</td>
                </tr>
                <tr>
                  <td class="td-label">Kontak / Telepon</td>
                  <td class="td-colon">:</td>
                  <td class="td-val">${custPhone}</td>
                </tr>
                <tr>
                  <td class="td-label">Alamat</td>
                  <td class="td-colon">:</td>
                  <td class="td-val">${custAddress}</td>
                </tr>
              </table>
            </div>
          </div>

          <!-- Unit / Mesin -->
          <div class="unit-card">
            <div class="box-header">🖨️ Unit Mesin / Perangkat</div>
            <table class="info-table" style="width: 100%;">
              <tr>
                <td style="width: 15%;" class="td-label">Model Mesin</td>
                <td style="width: 10px;" class="td-colon">:</td>
                <td style="width: 34%;" class="td-val font-semibold">${unitModel}</td>
                <td style="width: 15%;" class="td-label">Brand / Merk</td>
                <td style="width: 10px;" class="td-colon">:</td>
                <td class="td-val">${brandName}</td>
              </tr>
              <tr>
                <td class="td-label">Serial Number</td>
                <td class="td-colon">:</td>
                <td class="td-val font-mono" style="font-weight: 700; color: #1e3a8a;">${unitSn}</td>
                <td class="td-label">Kategori Unit</td>
                <td class="td-colon">:</td>
                <td class="td-val">${unit.is_copier ? 'Copier / Mesin Fotocopy' : (unit.is_computer ? 'Komputer / PC' : 'Unit Standalone / Printer')}</td>
              </tr>
            </table>
          </div>

          <!-- Problem & Work Instructions -->
          <div class="problem-card">
            <div class="box-header">📝 Deskripsi Tugas & Instruksi Pengerjaan</div>
            <div class="problem-body">
              <strong>Uraian Tugas / Keluhan:</strong><br>
              ${problemDesc}
            </div>
          </div>

          <!-- Items (If Delivery Order or Parts) -->
          ${itemsTableHtml}

          <!-- Signatures (3 Kolom) -->
          <div class="signatures-grid">
            <div class="sig-box">
              <div class="sig-header">Disiapkan Oleh (Admin / CS)</div>
              <div style="height: 55px;"></div>
              <div>
                <div class="sig-line"></div>
                <div class="sig-name">( Admin PT BIAS )</div>
                <div class="sig-role">Customer Service / Dispatcher</div>
              </div>
            </div>

            <div class="sig-box">
              <div class="sig-header">Dilaksanakan Oleh (Teknisi)</div>
              <div style="height: 55px;"></div>
              <div>
                <div class="sig-line"></div>
                <div class="sig-name">${techName}</div>
                <div class="sig-role">Teknisi Lapangan BIAS</div>
              </div>
            </div>

            <div class="sig-box">
              <div class="sig-header">Diterima / Diketahui Oleh</div>
              <div style="height: 55px;"></div>
              <div>
                <div class="sig-line"></div>
                <div class="sig-name">${custPic !== '-' ? custPic : '( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )'}</div>
                <div class="sig-role">PIC Pelanggan / Customer</div>
              </div>
            </div>
          </div>
        </div>

        ${printScript}
      </body>
    </html>
  `;
}

export async function printJobOrder(job: any): Promise<boolean> {
  if (!job) return false;
  const win = window.open("", "_blank");
  if (!win) return false;

  const html = await getJobOrderHtml(job, true);
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}

export async function downloadJobOrderPdf(job: any): Promise<boolean> {
  if (!job) return false;
  try {
    const { default: html2pdf } = await import("html2pdf.js");
    const html = await getJobOrderHtml(job, false);
    const container = document.createElement("div");
    container.innerHTML = html;

    const jobNo = (job.job_order_no || `JO-${job.id || 'NEW'}`).replace(/[\/\\?%*:|"<>]/g, '_');
    const opt = {
      margin: [8, 8, 8, 8],
      filename: `SPK_${jobNo}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };

    await html2pdf().set(opt).from(container).save();
    return true;
  } catch (e) {
    console.error("Failed to download job order pdf:", e);
    return false;
  }
}

