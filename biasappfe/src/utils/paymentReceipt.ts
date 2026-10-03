export interface PaymentReceiptData {
  payment_no: string;
  invoice_no: string;
  customer_name: string;
  payment_date: string;
  amount: number;
  reference_no?: string;
  status: string;
  /** true bila invoice sudah lunas penuh (payment_status === 'paid') */
  lunas?: boolean;
  /** true bila invoice masih cicilan (payment_status === 'partially_paid') */
  partial?: boolean;
  /** Metode pembayaran: 'Tunai' / 'Transfer'. Kosong bila tidak diketahui. */
  method?: string;
  /** Nama pengirim dana (dari form payment). */
  sender_name?: string;
  /** Nama bank / rekening tujuan yang dicatat saat payment. */
  bank_name?: string;
  /** Berita/catatan saat payment. Hanya ditampilkan pada bukti bayar bila ada. */
  notes?: string;
}

/** 'CASH' -> Tunai, bank lain -> Transfer, kosong -> undefined */
export function paymentMethodOf(bankName?: string): string | undefined {
  const v = String(bankName || "").trim();
  if (!v || v === "-") return undefined;
  return v.toUpperCase() === "CASH" ? "Tunai" : "Transfer";
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function spellNumber(value: number): string {
  const number = Math.floor(Math.abs(value));
  const ones = [
    "nol",
    "satu",
    "dua",
    "tiga",
    "empat",
    "lima",
    "enam",
    "tujuh",
    "delapan",
    "sembilan",
    "sepuluh",
    "sebelas",
  ];
  if (number < 12) return ones[number] ?? String(number);
  if (number < 20) return `${spellNumber(number - 10)} belas`;
  if (number < 100) {
    return `${spellNumber(Math.floor(number / 10))} puluh${number % 10 ? ` ${spellNumber(number % 10)}` : ""}`;
  }
  if (number < 200)
    return `seratus${number % 100 ? ` ${spellNumber(number % 100)}` : ""}`;
  if (number < 1000) {
    return `${spellNumber(Math.floor(number / 100))} ratus${number % 100 ? ` ${spellNumber(number % 100)}` : ""}`;
  }
  if (number < 2000)
    return `seribu${number % 1000 ? ` ${spellNumber(number % 1000)}` : ""}`;
  if (number < 1000000) {
    return `${spellNumber(Math.floor(number / 1000))} ribu${number % 1000 ? ` ${spellNumber(number % 1000)}` : ""}`;
  }
  if (number < 1000000000) {
    return `${spellNumber(Math.floor(number / 1000000))} juta${number % 1000000 ? ` ${spellNumber(number % 1000000)}` : ""}`;
  }
  return String(number);
}

function formatMoney(value: number): string {
  return value.toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTransactionDate(value: string): { date: string; time: string } {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: "-", time: "-" };
  return {
    date: parsed.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).replace(/\//g, "-"),
    time: `${parsed.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })} WIB`,
  };
}

function extractSenderName(value?: string): string {
  const match = String(value || "").match(/A\/N:\s*([^)]*)/i);
  return match?.[1]?.trim() || "";
}

function extractSenderAccount(value?: string): string {
  const match = String(value || "").match(/-\s*([^()]+)\s*(?:\(|$)/);
  return match?.[1]?.trim() || "-";
}

function extractBankName(value?: string): string {
  const raw = String(value || "").trim();
  if (!raw || raw === "-") return "-";
  return raw.split("-")[0]?.trim() || raw;
}

export function printBankPaymentNote(payment: PaymentReceiptData): boolean {
  if (payment.status !== "approved" || !payment.lunas) return false;

  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;

  const { date, time } = formatTransactionDate(payment.payment_date);
  const bankName = payment.bank_name || payment.method || "-";
  const adminFee = 0;
  const total = payment.amount + adminFee;
  const notes = String(payment.notes || "").trim();
  const senderName = payment.sender_name || extractSenderName(payment.bank_name) || payment.customer_name || "-";
  const senderAccount = extractSenderAccount(payment.bank_name);
  const rows = [
    ["Nomor Referensi", payment.reference_no || "-"],
    ["Tanggal Transaksi", date],
    ["Waktu Transaksi", time],
    ["Nomor Rekening Tujuan", "-"],
    ["Nama Rekening Tujuan", "PT BIAS SURYA TEKNOLOGI"],
    ["Email Penerima", "-"],
    ["Bank Tujuan", extractBankName(bankName)],
    ["Nama Pengirim", senderName],
    ["Nomor Rekening Pengirim", senderAccount],
    ["Nominal", formatMoney(payment.amount)],
    ["Biaya Admin", formatMoney(adminFee)],
    ["Total", formatMoney(total)],
  ];
  const rowHtml = rows.map(([label, value], index) => `
    ${index === 9 ? '<div class="divider"></div>' : ''}
    <div class="row"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>
  `).join("");
  const notesHtml = notes
    ? `<div class="row"><div class="label">Berita</div><div class="value">${escapeHtml(notes)}</div></div>`
    : "";

  const html = `
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="utf-8">
        <title>Bukti Bayar - ${escapeHtml(payment.payment_no)}</title>
        <style>
          @page { size: 80mm auto; margin: 8mm; }
          body { margin: 0; background: #fff; color: #2d2f33; font-family: Arial, Helvetica, sans-serif; }
          .receipt { width: 100%; max-width: 360px; margin: 0 auto; padding: 18px 18px 22px; }
          .brand { font-size: 28px; font-weight: 800; letter-spacing: 0.5px; color: #1f6f64; margin-bottom: 72px; }
          .brand-mark { display: inline-block; color: #ef5b2a; margin-right: 6px; transform: skew(-10deg); }
          .title { text-align: center; font-size: 22px; margin-bottom: 28px; }
          .row { display: grid; grid-template-columns: 1fr 1.12fr; gap: 16px; align-items: start; margin: 22px 0; font-size: 16px; line-height: 1.45; }
          .label { color: #2f3439; }
          .value { color: #2f3439; text-align: right; word-break: break-word; }
          .divider { height: 1px; background: #ddd; margin: 28px 0 8px; }
          @media print { .receipt { max-width: none; } }
        </style>
      </head>
      <body>
        <main class="receipt">
          <div class="brand"><span class="brand-mark">▰</span>BIAS</div>
          <div class="title">Transaksi Berhasil</div>
          ${rowHtml}
          ${notesHtml}
        </main>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
  return true;
}

export function printPaymentReceipt(payment: PaymentReceiptData): boolean {
  if (payment.status !== "approved") return false;

  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;

  const paymentDate = new Date(payment.payment_date);
  const formattedDate = Number.isNaN(paymentDate.getTime())
    ? "-"
    : paymentDate.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
  const formattedAmount = `Rp ${payment.amount.toLocaleString("id-ID")}`;
  const words = spellNumber(payment.amount);
  const amountInWords = `${payment.amount < 0 ? "minus " : ""}${words.charAt(0).toUpperCase()}${words.slice(1)} rupiah`;
  const safe = {
    paymentNo: escapeHtml(payment.payment_no),
    invoiceNo: escapeHtml(payment.invoice_no),
    customerName: escapeHtml(payment.customer_name),
    referenceNo: escapeHtml(payment.reference_no || "-"),
    method: escapeHtml(payment.method || ""),
    date: escapeHtml(formattedDate),
    amount: escapeHtml(formattedAmount),
    amountInWords: escapeHtml(amountInWords),
  };
  const methodRow = safe.method
    ? `<div class="row"><div class="label">Metode</div><div class="value">${safe.method} (via CS)</div></div>`
    : "";

  const html = `
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="utf-8">
        <title>Bukti Pembayaran - ${safe.paymentNo}</title>
        <style>
          @page { size: A5 landscape; margin: 1.2cm; }
          body { font-family: Arial, sans-serif; color: #17212b; margin: 0; }
          .receipt { border: 1px solid #17212b; padding: 22px 26px; position: relative; min-height: 250px; }
          .header { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #17212b; padding-bottom: 12px; }
          h1 { font-size: 17px; margin: 0 0 4px; }
          h2 { font-size: 12px; margin: 0; letter-spacing: 1px; }
          .payment-no { font-size: 13px; font-weight: 700; }
          .row { display: grid; grid-template-columns: 145px 1fr; gap: 12px; margin: 14px 0; }
          .label { font-weight: 700; }
          .value { border-bottom: 1px dotted #59636e; padding-bottom: 4px; }
          .footer { display: flex; justify-content: space-between; align-items: end; gap: 20px; margin-top: 22px; }
          .amount { border: 1px solid #17212b; padding: 9px 16px; font-size: 17px; font-weight: 700; }
          .approval-stamp { border: 3px double #a3232d; border-radius: 50%; color: #a3232d; font-weight: 900; line-height: 1.2; padding: 16px 12px; text-align: center; transform: rotate(-8deg); }
          .approval-stamp small { display: block; font-size: 9px; margin-top: 3px; }
          .approval-stamp.lunas { border-color: #166534; color: #166534; }
          .approval-stamp.partial { border-color: #b45309; color: #b45309; }
          .pending-stamp { border: 3px double #57534e; border-radius: 50%; color: #57534e; font-weight: 900; line-height: 1.2; padding: 14px 10px; text-align: center; transform: rotate(-8deg); font-size: 12px; }
          .pending-stamp small { display: block; font-size: 8px; margin-top: 3px; }
          .notice { margin-top: 12px; font-size: 10px; color: #57534e; border-top: 1px dashed #a8a29e; padding-top: 8px; }
          .sign { min-width: 150px; text-align: center; }
          .sign-line { border-top: 1px solid #17212b; margin-top: 44px; padding-top: 5px; }
        </style>
      </head>
      <body>
        <main class="receipt">
          <header class="header">
            <div><h1>PT. BIAS SURYA TEKNOLOGI</h1><h2>KWITANSI / BUKTI PEMBAYARAN</h2></div>
            <div class="payment-no">No. ${safe.paymentNo}</div>
          </header>
          <div class="row"><div class="label">Diterima dari</div><div class="value">${safe.customerName}</div></div>
          <div class="row"><div class="label">Untuk pembayaran</div><div class="value">Invoice ${safe.invoiceNo}</div></div>
          <div class="row"><div class="label">Terbilang</div><div class="value"><i>${safe.amountInWords}</i></div></div>
          ${methodRow}
          <div class="row"><div class="label">Referensi</div><div class="value">${safe.referenceNo}</div></div>
          <footer class="footer">
            <div class="amount">${safe.amount}</div>
            ${payment.lunas ? `<div class="approval-stamp lunas">LUNAS<small>DANA DITERIMA</small></div>` : payment.partial ? `<div class="approval-stamp partial">CICILAN<small>BELUM LUNAS</small></div>` : ""}
            <div class="approval-stamp">DISETUJUI<small>ACCOUNTING</small></div>
            <div class="sign"><div>Batam, ${safe.date}</div><div class="sign-line">Penerima</div></div>
          </footer>
        </main>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
  return true;
}

/**
 * TANDA TERIMA PEMBAYARAN — bukti langsung untuk customer saat membayar,
 * sebelum accounting memverifikasi dana (payment masih pending).
 * BUKAN kwitansi pelunasan: tidak ada stempel LUNAS.
 */
export function printPaymentSlip(payment: PaymentReceiptData): boolean {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;

  const paymentDate = new Date(payment.payment_date);
  const formattedDate = Number.isNaN(paymentDate.getTime())
    ? "-"
    : paymentDate.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
  const formattedAmount = `Rp ${payment.amount.toLocaleString("id-ID")}`;
  const words = spellNumber(payment.amount);
  const amountInWords = `${payment.amount < 0 ? "minus " : ""}${words.charAt(0).toUpperCase()}${words.slice(1)} rupiah`;
  const safe = {
    paymentNo: escapeHtml(payment.payment_no),
    invoiceNo: escapeHtml(payment.invoice_no),
    customerName: escapeHtml(payment.customer_name),
    referenceNo: escapeHtml(payment.reference_no || "-"),
    method: escapeHtml(payment.method || ""),
    date: escapeHtml(formattedDate),
    amount: escapeHtml(formattedAmount),
    amountInWords: escapeHtml(amountInWords),
  };
  const methodRow = safe.method
    ? `<div class="row"><div class="label">Metode</div><div class="value">${safe.method} (via CS)</div></div>`
    : "";

  const html = `
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="utf-8">
        <title>Tanda Terima - ${safe.paymentNo}</title>
        <style>
          @page { size: A5 landscape; margin: 1.2cm; }
          body { font-family: Arial, sans-serif; color: #17212b; margin: 0; }
          .receipt { border: 1px solid #17212b; padding: 22px 26px; position: relative; min-height: 250px; }
          .header { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #17212b; padding-bottom: 12px; }
          h1 { font-size: 17px; margin: 0 0 4px; }
          h2 { font-size: 12px; margin: 0; letter-spacing: 1px; }
          .payment-no { font-size: 13px; font-weight: 700; }
          .row { display: grid; grid-template-columns: 145px 1fr; gap: 12px; margin: 14px 0; }
          .label { font-weight: 700; }
          .value { border-bottom: 1px dotted #59636e; padding-bottom: 4px; }
          .footer { display: flex; justify-content: space-between; align-items: end; gap: 20px; margin-top: 22px; }
          .amount { border: 1px solid #17212b; padding: 9px 16px; font-size: 17px; font-weight: 700; }
          .pending-stamp { border: 3px double #57534e; border-radius: 50%; color: #57534e; font-weight: 900; line-height: 1.2; padding: 14px 10px; text-align: center; transform: rotate(-8deg); font-size: 12px; }
          .pending-stamp small { display: block; font-size: 8px; margin-top: 3px; }
          .notice { margin-top: 12px; font-size: 10px; color: #57534e; border-top: 1px dashed #a8a29e; padding-top: 8px; }
          .sign { min-width: 150px; text-align: center; }
          .sign-line { border-top: 1px solid #17212b; margin-top: 44px; padding-top: 5px; }
        </style>
      </head>
      <body>
        <main class="receipt">
          <header class="header">
            <div><h1>PT. BIAS SURYA TEKNOLOGI</h1><h2>TANDA TERIMA PEMBAYARAN</h2></div>
            <div class="payment-no">No. ${safe.paymentNo}</div>
          </header>
          <div class="row"><div class="label">Diterima dari</div><div class="value">${safe.customerName}</div></div>
          <div class="row"><div class="label">Untuk pembayaran</div><div class="value">Invoice ${safe.invoiceNo}</div></div>
          <div class="row"><div class="label">Terbilang</div><div class="value"><i>${safe.amountInWords}</i></div></div>
          ${methodRow}
          <div class="row"><div class="label">Referensi</div><div class="value">${safe.referenceNo}</div></div>
          <footer class="footer">
            <div class="amount">${safe.amount}</div>
            <div class="pending-stamp">DITERIMA CS<small>MENUNGGU VERIFIKASI</small></div>
            <div class="sign"><div>Batam, ${safe.date}</div><div class="sign-line">CS Penerima</div></div>
          </footer>
          <div class="notice">Pembayaran diterima oleh Customer Service dan <b>BUKAN kwitansi pelunasan</b>. Kwitansi resmi berstempel LUNAS diterbitkan setelah Accounting memverifikasi dana masuk. Apabila dana tidak masuk, pembayaran ini dinyatakan batal.</div>
        </main>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
  return true;
}
