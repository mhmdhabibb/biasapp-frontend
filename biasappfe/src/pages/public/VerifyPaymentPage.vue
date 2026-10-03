<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api, ApiError } from "@/services/api";

interface VerifyData {
  payment_no: string;
  invoice_no: string;
  customer_name: string;
  sender_name: string;
  amount: number;
  payment_date: string;
  method: string;
  reference_no: string;
  status: string;
  payment_status: string;
  verified_at: string;
}

const route = useRoute();
const loading = ref(true);
const notFound = ref(false);
const loadError = ref("");
const data = ref<VerifyData | null>(null);

function formatRupiah(val: number): string {
  return "Rp " + Number(val || 0).toLocaleString("id-ID");
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return (
    d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }) +
    " " +
    d.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  );
}

onMounted(async () => {
  const no = String(route.query.no || "").trim();
  if (!no) {
    loading.value = false;
    notFound.value = true;
    return;
  }
  try {
    const res = await api.get<{ data: VerifyData }>(
      `/public/payments/${encodeURIComponent(no)}`,
      false,
    );
    data.value = res.data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound.value = true;
    } else {
      loadError.value = "Gagal memuat data verifikasi. Coba lagi.";
    }
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="verify-page">
    <div class="verify-card">
      <div class="verify-brand">PT. BIAS SURYA TEKNOLOGI</div>
      <div class="verify-title">Verifikasi Bukti Pembayaran</div>

      <div v-if="loading" class="verify-state">Memuat data…</div>

      <div v-else-if="notFound" class="verify-result invalid">
        <div class="verify-icon">✕</div>
        <div class="verify-head">Data Tidak Ditemukan</div>
        <p>Nomor pembayaran tidak terdaftar di sistem kami.</p>
      </div>

      <div v-else-if="loadError" class="verify-result invalid">
        <div class="verify-icon">!</div>
        <div class="verify-head">Gagal Memuat</div>
        <p>{{ loadError }}</p>
      </div>

      <template v-else-if="data">
        <div
          v-if="data.status === 'approved'"
          class="verify-result valid"
        >
          <div class="verify-icon">✓</div>
          <div class="verify-head">Pembayaran Valid</div>
          <p>
            {{
              data.payment_status === "paid"
                ? "Dokumen ini adalah bukti pembayaran yang sah dan telah disetujui."
                : "Dokumen ini tercatat di sistem dan telah disetujui."
            }}
          </p>
        </div>
        <div v-else-if="data.status === 'rejected'" class="verify-result invalid">
          <div class="verify-icon">✕</div>
          <div class="verify-head">Pembayaran Ditolak</div>
          <p>Pembayaran ini ditolak dan tidak berlaku sebagai bukti bayar.</p>
        </div>
        <div v-else class="verify-result pending">
          <div class="verify-icon">…</div>
          <div class="verify-head">Menunggu Verifikasi</div>
          <p>Pembayaran tercatat namun belum disetujui oleh Accounting.</p>
        </div>

        <dl class="verify-detail">
          <div>
            <dt>No. Pembayaran</dt>
            <dd>{{ data.payment_no }}</dd>
          </div>
          <div>
            <dt>Invoice</dt>
            <dd>{{ data.invoice_no }}</dd>
          </div>
          <div>
            <dt>Diterima Dari</dt>
            <dd>
              {{ data.customer_name
              }}<template v-if="data.sender_name"> ({{ data.sender_name }})</template>
            </dd>
          </div>
          <div>
            <dt>Tanggal</dt>
            <dd>{{ formatDate(data.payment_date) }}</dd>
          </div>
          <div>
            <dt>Metode</dt>
            <dd>{{ data.method }}</dd>
          </div>
          <div>
            <dt>Referensi</dt>
            <dd>{{ data.reference_no || "-" }}</dd>
          </div>
          <div class="verify-total">
            <dt>Nominal</dt>
            <dd>{{ formatRupiah(data.amount) }}</dd>
          </div>
        </dl>
        <div class="verify-foot">
          Dicek pada {{ formatDate(data.verified_at) }}
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.verify-page {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 32px 16px;
  background: #f1f5f9;
  font-family: "Segoe UI", system-ui, sans-serif;
}
.verify-card {
  width: 100%;
  max-width: 440px;
  background: #fff;
  border-radius: 16px;
  padding: 28px 24px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
}
.verify-brand {
  text-align: center;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: #0f172a;
}
.verify-title {
  text-align: center;
  font-size: 13px;
  color: #64748b;
  margin: 4px 0 20px;
}
.verify-state {
  text-align: center;
  color: #64748b;
  padding: 24px 0;
}
.verify-result {
  text-align: center;
  border-radius: 12px;
  padding: 18px 14px;
  margin-bottom: 18px;
}
.verify-result.valid {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
}
.verify-result.invalid {
  background: #fef2f2;
  border: 1px solid #fecaca;
}
.verify-result.pending {
  background: #fffbeb;
  border: 1px solid #fde68a;
}
.verify-icon {
  width: 44px;
  height: 44px;
  margin: 0 auto 8px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 800;
}
.valid .verify-icon {
  background: #16a34a;
  color: #fff;
}
.invalid .verify-icon {
  background: #dc2626;
  color: #fff;
}
.pending .verify-icon {
  background: #d97706;
  color: #fff;
}
.verify-head {
  font-size: 18px;
  font-weight: 800;
}
.valid .verify-head {
  color: #166534;
}
.invalid .verify-head {
  color: #991b1b;
}
.pending .verify-head {
  color: #92400e;
}
.verify-result p {
  font-size: 13px;
  color: #475569;
  margin: 6px 0 0;
}
.verify-detail {
  margin: 0;
  border-top: 1px dashed #cbd5e1;
}
.verify-detail > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px dashed #e2e8f0;
  font-size: 14px;
}
.verify-detail dt {
  color: #64748b;
}
.verify-detail dd {
  margin: 0;
  font-weight: 600;
  text-align: right;
  word-break: break-word;
}
.verify-total dd {
  font-size: 17px;
  color: #0f172a;
}
.verify-foot {
  margin-top: 14px;
  font-size: 11px;
  color: #94a3b8;
  text-align: center;
}
</style>
