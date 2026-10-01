export interface PaymentReceiptData {
  payment_no: string;
  invoice_no: string;
  customer_name: string;
  payment_date: string;
  amount: number;
  reference_no?: string;
  status: string;
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
    date: escapeHtml(formattedDate),
    amount: escapeHtml(formattedAmount),
    amountInWords: escapeHtml(amountInWords),
  };

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
          <div class="row"><div class="label">Referensi</div><div class="value">${safe.referenceNo}</div></div>
          <footer class="footer">
            <div class="amount">${safe.amount}</div>
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
