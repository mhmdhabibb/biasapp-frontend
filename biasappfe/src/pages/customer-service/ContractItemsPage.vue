<script setup lang="ts">
// @ts-nocheck
import { ref, reactive } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormModal from '@/components/ui/FormModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useMasterStore } from '@/composables/useMasterStore'
import { resources } from '@/services/resource.service'
import { onMounted } from 'vue'
import type { TableColumn, ContractItem } from '@/types'

const {
  contractItems: data,
  customers,
  units,
  findCustomer,
  findUnit,
} = useMasterStore()

const columns: TableColumn[] = [
  { key: 'contract_no', label: 'Contract No.' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'unit_id', label: 'Unit' },
  { key: 'monthly_rent_fee', label: 'Monthly Rent Fee' },
  { key: 'status', label: 'Status' },
]

const showModal = ref(false)
const showDetailModal = ref(false)
const showConfirm = ref(false)
const editingItem = ref<ContractItem | null>(null)
const deletingItem = ref<ContractItem | null>(null)
const detailItem = ref<any>(null)
const paperSizes = ref<{id: string, name: string}[]>([])

onMounted(async () => {
  try {
    const res = await resources.paperSizes.list()
    paperSizes.value = res.data as any
  } catch(e) {}
})
const form = reactive({
  contract_no: '',
  customer_id: null as string | null,
  unit_id: null as string | null,
  start_date: '',
  end_date: '',
  location: '',
  total_value: 0,
  free_quota_color: 0,
  rates: [] as any[],
  status: 'active',
})

function addRate() {
  form.rates.push({ paper_size_id: '', rate_per_page_bw: 0, rate_per_page_color: 0 })
}

function removeRate(index: number) {
  form.rates.splice(index, 1)
}

const defaultForm = { ...form }

function openAdd() {
  editingItem.value = null
  Object.assign(form, { ...defaultForm, contract_no: `CNT-${Date.now().toString().slice(-6)}`, rates: [] })
  showModal.value = true
}

function openEdit(item: any) {
  editingItem.value = item
  Object.assign(form, {
    contract_no: item.contract?.contract_no || item.contract_no,
    customer_id: item.contract?.customer_id || item.customer_id,
    unit_id: item.unit_id,
    start_date: item.contract?.start_date ? item.contract.start_date.slice(0, 10) : item.start_date,
    end_date: item.contract?.end_date ? item.contract.end_date.slice(0, 10) : item.end_date,
    location: item.contract?.location || item.placement_location || '',
    total_value: item.contract?.total_value || item.monthly_rent_fee || 0,
    free_quota_color: item.free_quota_color || item.free_copy_quota || 0,
    rates: Array.isArray(item.rates) ? item.rates.map((r: any) => ({
      paper_size_id: r.paper_size_id,
      rate_per_page_bw: r.rate_per_page_bw,
      rate_per_page_color: r.rate_per_page_color
    })) : [],
    status: item.status,
  })
  showModal.value = true
}

function handleSubmit() {
  if (!form.contract_no.trim()) return
  if (editingItem.value) {
    const idx = data.value.findIndex(d => d.id === editingItem.value!.id)
    if (idx >= 0) data.value[idx] = { ...data.value[idx]!, ...form, updated_at: new Date().toISOString() }
  } else {
    data.value.push({ id: Date.now(), ...form, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })
  }
  showModal.value = false
}

function openDelete(item: ContractItem) { deletingItem.value = item; showConfirm.value = true }
function handleDelete() {
  if (deletingItem.value) data.value = data.value.filter(d => d.id !== deletingItem.value!.id)
  showConfirm.value = false
}

function openDetail(item: any) {
  detailItem.value = item
  showDetailModal.value = true
}

function printContract(item: any) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const customerId = item.contract?.customer_id || item.customer_id;
  const customer = findCustomer(customerId) || item.customer || item.contract?.customer;
  const custName = customer?.company_name || customer?.name || '';
  const custAddress = customer?.address || '-';
  const custPhone = customer?.phone || '-';
  const custPicName = customer?.pic_name || '(Nama Pimpinan)';
  const contractNo = item.contract?.contract_no || item.contract_no || '';
  const startDate = item.contract?.start_date ? item.contract.start_date.slice(0,10) : (item.start_date ? item.start_date.slice(0,10) : '');
  const rentFee = formatRupiah(item.contract?.total_value || item.monthly_rent_fee || 0);

  // Parse date for Indonesian format (e.g. 03 Januari 2024)
  const d = new Date(startDate || new Date());
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const dayName = days[d.getDay()];
  const dateNum = d.getDate();
  const monthName = months[d.getMonth()];
  const yearNum = d.getFullYear();

  const spellNumber = (n: number) => {
    const words = ['Nol', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas', 'Dua Belas', 'Tiga Belas', 'Empat Belas', 'Lima Belas', 'Enam Belas', 'Tujuh Belas', 'Delapan Belas', 'Sembilan Belas', 'Dua Puluh', 'Dua Puluh Satu', 'Dua Puluh Dua', 'Dua Puluh Tiga', 'Dua Puluh Empat', 'Dua Puluh Lima', 'Dua Puluh Enam', 'Dua Puluh Tujuh', 'Dua Puluh Delapan', 'Dua Puluh Sembilan', 'Tiga Puluh', 'Tiga Puluh Satu'];
    return words[n] || n.toString();
  };
  const spellYear = (y: number) => {
    return 'Dua Ribu Dua Puluh Empat'; // Just an example, can be dynamic
  };

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Surat Perjanjian - ${contractNo}</title>
        <style>
          @page { size: A4; margin: 2.5cm 2cm; }
          body { font-family: "Times New Roman", Times, serif; font-size: 11pt; line-height: 1.5; color: #000; margin: 0; padding: 0; }
          .page { page-break-after: always; text-align: justify; }
          .page:last-child { page-break-after: auto; }
          
          /* Header */
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
          .header-left { display: flex; align-items: center; gap: 15px; }
          .header-logo { width: 50px; height: 50px; background: #004d99; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-style: italic; font-size: 16px; border: 3px solid #ffcc00; box-shadow: -2px 2px 0px #0088cc;}
          .header-title-company { font-family: Arial, sans-serif; }
          .header-title-company h1 { margin: 0; font-size: 16pt; color: #002b5e; font-weight: 900; letter-spacing: 1px; }
          .header-title-company h2 { margin: 0; font-size: 11pt; color: #333; font-weight: bold; font-style: italic; }
          .header-right { font-family: Arial, sans-serif; font-size: 8pt; text-align: left; line-height: 1.3; font-weight: bold; }
          
          .doc-title { text-align: center; margin-top: 30px; margin-bottom: 30px; }
          .doc-title h3 { margin: 0; font-size: 14pt; text-decoration: underline; font-weight: bold; }
          .doc-title p { margin: 5px 0 0 0; font-size: 10pt; font-weight: bold; }

          .content-block { margin-bottom: 15px; }
          .indent { padding-left: 30px; }
          
          .party-info { display: grid; grid-template-columns: 30px 150px 10px 1fr; margin-bottom: 5px; }
          
          .pasal-title { text-align: center; font-weight: bold; margin-top: 20px; margin-bottom: 10px; }
          
          .list-item { display: flex; margin-bottom: 8px; }
          .list-item .bullet { width: 40px; flex-shrink: 0; text-align: right; padding-right: 15px; }
          .list-item .text { flex-grow: 1; }

          .signature-section { display: flex; justify-content: space-between; margin-top: 50px; text-align: center; }
          .signature-box { width: 45%; }
          .signature-name { margin-top: 80px; font-weight: bold; text-decoration: underline; }
          .signature-title { font-style: italic; }
          .signature-nip { margin-top: 0px; }
          
          .footer-paging { text-align: left; font-size: 10pt; border-top: 1px solid #ccc; padding-top: 5px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <!-- PAGE 1 -->
        <div class="page">
          <div class="header">
            <div class="header-left">
              <div class="header-logo">BiAS</div>
              <div class="header-title-company">
                <h1>PT. BIAS SURYA TEKNOLOGI</h1>
                <h2>Your Office Solution</h2>
              </div>
            </div>
            <div class="header-right">
              Greenland Housing Blok E6 No.11<br>
              Batam Centre<br>
              Telepon +62 778 468017<br>
              Faximili +62 778 468017<br>
              Batam, Kepulauan Riau
            </div>
          </div>

          <div class="doc-title">
            <h3>SURAT PERJANJIAN SEWA MESIN FOTOCOPI</h3>
            <p>Nomor : ${contractNo} – ${custName.toUpperCase()}</p>
          </div>

          <div class="content-block">
            <b>PERJANJIAN SEWA MESIN FOTOCOPI</b> (selanjutnya disebut "Perjanjian") ini dibuat dan ditandatangani pada hari ${dayName}, tanggal ${spellNumber(dateNum)} bulan ${monthName} Tahun ${spellYear(yearNum)} ( ${String(dateNum).padStart(2,'0')} ${monthName} ${yearNum} ), Oleh dan Antara:
          </div>

          <div class="content-block indent">
            <div class="party-info">
              <div>1.</div><div>Nama</div><div>:</div><div><b>Rosmalinda Hutagalung</b></div>
              <div></div><div>Nama Perusahaan</div><div>:</div><div><b>PT. BIAS SURYA TEKNOLOGI</b></div>
              <div></div><div>Alamat</div><div>:</div><div>Ruko Puri Mas Blok A No.40<br>Batam Centre, Batam</div>
              <div></div><div>Telepon</div><div>:</div><div>+62 811.704.5657</div>
              <div></div><div>Email</div><div>:</div><div>bias.bst@gmail.com</div>
              <div></div><div>Jabatan</div><div>:</div><div><b>Direktur</b></div>
            </div>
            <br>Selanjutnya disebut sebagai <b>PIHAK PERTAMA</b>
          </div>

          <div class="content-block indent">
            <div class="party-info">
              <div>2.</div><div>Nama</div><div>:</div><div><b>${custPicName}</b></div>
              <div></div><div>Nama Kantor</div><div>:</div><div><b>${custName}</b></div>
              <div></div><div>Alamat</div><div>:</div><div>${custAddress}</div>
              <div></div><div>Telepon</div><div>:</div><div>${custPhone}</div>
              <div></div><div>Faximili</div><div>:</div><div>-</div>
              <div></div><div>Jabatan</div><div>:</div><div><b>PIC / Kepala Bagian</b></div>
            </div>
            <br>Selanjutnya disebut sebagai <b>PIHAK KEDUA</b>
          </div>

          <div class="content-block">
            Selanjutnya Pihak Pertama dan Pihak Kedua secara bersama-sama dalam Perjanjian ini disebut "Para Pihak".
          </div>
          
          <div class="content-block">
            Para Pihak menerangkan terlebih dahulu hal-hal sebagai berikut:
          </div>
          
          <div class="list-item">
            <div class="bullet">a.</div>
            <div class="text">Bahwa Pihak Pertama adalah Perusahaan yang berpengalaman di bidang jasa <i>(service)</i> penyewaan mesin fotokopi;</div>
          </div>
          <div class="list-item">
            <div class="bullet">b.</div>
            <div class="text">Bahwa Pihak Kedua adalah Kantor berlokasi di Batam yang dalam operasionalnya memerlukan jasa penyewaan mesin fotokopi;</div>
          </div>
          <div class="list-item">
            <div class="bullet">c.</div>
            <div class="text">Bahwa Pihak Kedua setuju untuk menunjuk Pihak Pertama untuk menyediakan jasa <i>(service)</i> dalam pengadaan mesin fotokopi, termasuk di dalamnya penyediaan jasa <i>(service)</i> teknik;</div>
          </div>
          <div class="list-item">
            <div class="bullet">d.</div>
            <div class="text">Bahwa Para Pihak bersepakat untuk menggunakan unit mesin fotokopi milik Pihak Pertama, yang ditempatkan di lokasi dan dengan rincian sebagai berikut: <br>
              Unit: ${unitName(item.unit_id)}
            </div>
          </div>
          <div class="footer-paging"><b>1</b> | P a g e</div>
        </div>

        <!-- PAGE 2 -->
        <div class="page">
          <div class="indent">
            <div style="margin-left: 20px;">
              <div style="margin-bottom: 20px;">
                <div>1. ${item.contract?.location || item.placement_location || '-'}</div>
                <div class="party-info" style="margin-left: 15px; margin-top: 5px;">
                  <div></div><div style="width: 140px;">Brand</div><div>:</div><div><b>${item.unit?.brand?.name || 'EPSON'}</b></div>
                  <div></div><div style="width: 140px;">Type</div><div>:</div><div>${unitName(item.unit_id)}</div>
                  <div></div><div style="width: 140px;">Nomor Seri</div><div>:</div><div>${item.unit?.serial_no || '-'}</div>
                  <div></div><div style="width: 140px;">Start Meter Reading</div><div>:</div><div>${item.start_meter_bw || 0} (B/W)</div>
                  <div></div><div style="width: 140px;">Start Meter Reading</div><div>:</div><div>${item.start_meter_color || 0} (Colour)</div>
                  <div></div><div style="width: 140px;">Jumlah</div><div>:</div><div>1 (satu) Unit</div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="content-block">
            untuk dipergunakan sebagai sarana operasional Pihak Kedua dengan syarat dan ketentuan sebagai berikut:
          </div>

          <div class="pasal-title">
            Pasal 1<br>
            JANGKA WAKTU PERJANJIAN
          </div>
          <div class="content-block">
            Para Pihak sepakat bahwa Jangka Waktu Perjanjian ini adalah 2 (dua) tahun, terhitung sejak tanggal <b>${item.contract?.start_date ? item.contract.start_date.slice(0,10) : '-'} s/d ${item.contract?.end_date ? item.contract.end_date.slice(0,10) : '-'}</b> dan masa sewa dapat diperpanjang kembali atas persetujuan kedua belah pihak dengan pemberitahuan terlebih dahulu oleh Pihak Kedua selambat-lambatnya 2 (dua) minggu sebelum masa sewa berakhir. <i>Dan apabila tidak ada pemberitahuan maka kontrak ini otomatis diperpanjang</i>
          </div>

          <div class="pasal-title">
            Pasal 2<br>
            HARGA SEWA DAN MEKANISME PEMBAYARAN
          </div>
          <div class="list-item">
            <div class="bullet">(1)</div>
            <div class="text">Harga Sewa yang disepakati Para Pihak adalah sebagai berikut :
              <table style="width: 100%; margin-top: 5px; border: none;">
                <tr>
                  <td style="width: 20px; vertical-align: top;">-</td>
                  <td>Sewa mesin per bulan per unit termasuk pembuatan ${item.free_quota_color || item.free_copy_quota || 0} lembar per bulan untuk hasil warna</td>
                  <td style="width: 40px;">Rp</td>
                  <td style="text-align: right; width: 120px;">${formatRupiah(item.contract?.total_value || item.monthly_rent_fee || 0).replace('Rp ', '')}</td>
                </tr>
                <tr>
                  <td style="vertical-align: top;">-</td>
                  <td>Biaya perlembar setelah pemakaian ${item.free_quota_color || item.free_copy_quota || 0} lembar hasil warna :</td>
                  <td>Rp</td>
                  <td style="text-align: right;">${item.rates?.[0]?.rate_per_page_color || 1300},-</td>
                </tr>
                <tr>
                  <td style="vertical-align: top;">-</td>
                  <td>Biaya perlembar untuk pemakaian hitam putih :</td>
                  <td>Rp</td>
                  <td style="text-align: right;">${item.rates?.[0]?.rate_per_page_bw || 150},-</td>
                </tr>
              </table>
            </div>
          </div>
          <div class="list-item">
            <div class="bullet">(2)</div>
            <div class="text">Harga Sewa tersebut di atas sudah termasuk jasa <i>(service)</i> teknik, biaya pengiriman, <i>maintenance</i>, <i>toner</i>, <i>sparepart</i>.</div>
          </div>
          <div class="list-item">
            <div class="bullet">(3)</div>
            <div class="text">Pembayaran dilaksanakan setiap bulannya yaitu 30 (tiga puluh) hari setelah invoice/faktur diterima oleh Pihak Kedua, disesuaikan dengan jadwal pembayaran yang disepakati Bersama.</div>
          </div>
          <div class="list-item">
            <div class="bullet">(4)</div>
            <div class="text">Perubahan syarat dan harga sewa setiap mesin dapat dilakukan dengan ketentuan dan syarat yang merujuk pada kesepakatan bersama Para Pihak, dengan memberikan pemberitahuan secara tertulis selambat-lambatnya 25 (dua puluh lima) hari kerja sebelum perubahan dilaksanakan. Bila perubahan tersebut tidak disepakati bersama, maka Perjanjian ini dapat dibatalkan dengan pemberitahuan secara tertulis 5 (lima) hari kerja sebelumnya.</div>
          </div>
          <div class="list-item">
            <div class="bullet">(5)</div>
            <div class="text">Pihak Pertama harus mengajukan invoice/faktur yang dilengkapi dengan validasi tandatangan Penanggung jawab Pihak Pertama atau pihak lain yang berwenang di</div>
          </div>
          <div class="footer-paging"><b>2</b> | P a g e</div>
        </div>

        <!-- PAGE 3 -->
        <div class="page">
          <div class="content-block" style="padding-left: 40px; margin-bottom: 20px;">
            Pihak Pertama, dan Pihak Kedua dapat menolak invoice/faktur apabila tidak sesuai dengan validasi tersebut.
          </div>
          <div class="list-item">
            <div class="bullet">(6)</div>
            <div class="text">Pembayaran invoice/faktur dapat dilakukan secara langsung atau dapat ditransfer melalui rekening Pihak Pertama, dengan data sebagai berikut:<br>
              <table style="width: 100%; margin-top: 5px; border: none; font-size: 11pt;">
                <tr><td style="width: 150px; padding: 0;">Nama Rekening</td><td style="width: 10px; padding: 0;">:</td><td style="padding: 0;"><b>PT. BIAS SURYA TEKNOLOGI</b></td></tr>
                <tr><td style="padding: 0;">Nomor Rekening</td><td style="padding: 0;">:</td><td style="padding: 0;">1060885757</td></tr>
                <tr><td style="padding: 0;">Nama Bank</td><td style="padding: 0;">:</td><td style="padding: 0;">Bank Riau Kepri</td></tr>
                <tr><td style="padding: 0;">Nama Cabang</td><td style="padding: 0;">:</td><td style="padding: 0;">Batam</td></tr>
              </table>
            </div>
          </div>

          <div class="pasal-title">
            Pasal 3<br>
            PAJAK
          </div>
          <div class="list-item">
            <div class="bullet">(1)</div>
            <div class="text">Pajak yang timbul akibat dari perjanjian Sewa-Menyewa ini dibebankan kepada pihak pertama (dibayarkan oleh pihak kedua dan biaya tersebut dipotong langsung dari biaya sewa pada saat pembayaran). Pihak kedua berkewajiban memberikan bukti setor pajak sebagaimana dimaksud dalam pasal ini.</div>
          </div>
          <div class="list-item">
            <div class="bullet">(2)</div>
            <div class="text">Perubahan Peraturan Perpajakan Indonesia. Para Pihak sepakat untuk menyesuaikan Perjanjian ini dengan semua perubahan Peraturan Perpajakan yang berlaku di Indonesia.</div>
          </div>

          <div class="pasal-title">
            Pasal 4<br>
            PENGATURAN PENYEDIAAN JASA (SERVICE) TEKNIK
          </div>
          <div class="list-item">
            <div class="bullet">(1)</div>
            <div class="text">Para Pihak sepakat bahwa jasa <i>(service)</i> teknik termasuk <i>maintenance</i>, penggantian toner,spareparts, telah termasuk di dalam Harga Sewa dan Pihak Pertama wajib memberikan jasa <i>(service)</i> teknik tersebut di atas kepada Pihak Kedua selama jam kerja reguler sebagaimana diatur di dalam Pasal 4 ayat (2) berlangsung.</div>
          </div>
          <div class="list-item">
            <div class="bullet">(2)</div>
            <div class="text">Jam kerja reguler Pihak Pertama adalah hari Senin sampai dengan hari Jum'at, mulai pukul 09.00 sampai dengan 17.00 WIB. Untuk panggilan service yang dilakukan diatas jam 15.30 akan dilayani pada keesokan harinya.</div>
          </div>
          <div class="list-item">
            <div class="bullet">(3)</div>
            <div class="text">Teknisi Pihak Pertama akan melakukan pencatatan kedudukan meter setiap mesin 1 (satu) bulan sekali pada tanggal yang telah disepakati yaitu tanggal 30 (tiga puluh) dan hasil pencatatan tersebut akan ditandatangani kedua belah pihak yang telah di tunjuk oleh masing-masing dari Para Pihak.</div>
          </div>
          <div class="list-item">
            <div class="bullet">(4)</div>
            <div class="text">Pihak Kedua dapat meminta penambahan mesin bila diperlukan dengan memberikan order pemesanan pada Pihak Pertama dan menandatangani formulir konfirmasi serta daftar harga atas mesin dimaksud.</div>
          </div>
          <div class="list-item">
            <div class="bullet">(5)</div>
            <div class="text">Pihak kedua dapat meminta penukaran jika mesin tidak berfungsi dengan baik tanpa dikenakan biaya pengiriman apapun (Biaya ditanggung oleh Pihak Pertama).</div>
          </div>
          <div class="list-item">
            <div class="bullet">(6)</div>
            <div class="text">Jika kerusakan mesin terjadi atas kelalaian Pihak Kedua yang mana hal tersebut harus dibuktikan terlebih dahulu melalui pemeriksaan dan penyelidikan secara kronologis yang obyektif sesuai dengan prosedur hukum yang berlaku, maka Pihak Pertama berhak untuk mengenakan biaya tambahan sesuai dengan besarnya kerusakan yang terjadi dan biaya tambahan tersebut harus diketahui oleh Pihak Kedua terlebih dahulu.</div>
          </div>

          <div class="pasal-title">
            Pasal 5<br>
            PENGAKHIRAN PERJANJIAN
          </div>
          <div class="list-item">
            <div class="bullet">(1)</div>
            <div class="text">Jika mesin fotokopi dan jasa <i>(service)</i> yang disediakan oleh Pihak Pertama tidak memuaskan dan setelah diberikan peringatan tertulis sebanyak 3 (tiga) kali berturut-turut tidak menunjukkan perbaikan, maka Pihak kedua sewaktu-waktu</div>
          </div>
          <div class="footer-paging"><b>3</b> | P a g e</div>
        </div>

        <!-- PAGE 4 -->
        <div class="page">
          <div class="pasal-title">
            Pasal 6<br>
            FORCE MAJEURE
          </div>
          <div class="list-item">
            <div class="bullet">(1)</div>
            <div class="text">Yang dimaksud dengan <i>Force Majeure</i> ialah hal-hal yang secara langsung maupun tidak langsung dapat mempengaruhi pelaksanaan pekerjaan yang terjadi diluar kekuasaan/kemampuan manusia serta tidak dapat diduga sebelumnya.</div>
          </div>
          <div class="list-item">
            <div class="bullet">(2)</div>
            <div class="text">Hal-hal yang dapat digolongkan dalam keadaan <i>Force Majeure</i> adalah peristiwa-peristiwa yang termasuk, tetapi tidak terbatas pada:<br>
              &nbsp;&nbsp;a. Bencana alam (gempa bumi, banjir, wabah penyakit);<br>
              &nbsp;&nbsp;b. Tindakan sabotase, peperangan, huru – hara nasional;<br>
              &nbsp;&nbsp;c. Tindakan pemerintah dalam bidang ekonomi dan keuangan <i>(government event)</i>;<br>
              &nbsp;&nbsp;d. Curah hujan yang terus menerus sehingga menghambat pelaksanaan pekerjaan;<br>
              &nbsp;&nbsp;e. Penerapan peraturan perundangan yang berlaku.<br>
              &nbsp;&nbsp;f. Kebakaran
            </div>
          </div>
          <div class="list-item">
            <div class="bullet">(3)</div>
            <div class="text"><i>Force Majeure</i> harus diberitahukan secara tertulis oleh Pihak yang terkena <i>Force Majeure</i> kepada Pihak lainnya dalam waktu 7 (tujuh) hari kalender sejak terjadinya keadaan/peristiwa tersebut, dengan menyertakan bukti-bukti yang sah dari instansi yang berwenang serta akibatnya pada pekerjaan. Apabila dalam waktu 7 (tujuh) hari setelah menerima pemberitahuan tersebut Pihak yang menerima pemberitahuan tersebut tidak memberikan jawaban kepada Pihak yang terkena <i>Force Majeure</i>, maka Pihak tersebut dianggap menyetujui/mengakui adanya <i>Force Majeure</i> (keadaan memaksa) seperti yang disampaikan oleh Pihak yang terkena <i>Force Majeure</i>.</div>
          </div>
          <div class="list-item">
            <div class="bullet">(4)</div>
            <div class="text">Kegagalan dalam menyampaikan <i>Force Majeure</i> menjadi alasan batalnya <i>Force Majeure</i> tersebut.</div>
          </div>
          <div class="list-item">
            <div class="bullet">(5)</div>
            <div class="text">Jika terjadi <i>Force Majeure</i>, maka Pihak tersebut dibebaskan dari kewajiban yang tertunda selama masa yang ditimbulkan sebagai akibat dari peristiwa tersebut, akan tetapi tidak dibebaskan dari masing-masing kewajibannya sebelum saat terjadinya <i>Force Majeure</i> tersebut. Kedua belah pihak sepakat bahwa jika <i>Force Majeure</i> terjadi selama 1 (satu) bulan berturut-turut, maka akan diadakan perundingan kembali mengenai tindakan-tindakan yang harus atau akan diambil sehubungan dengan kejadian <i>Force Majeure</i> tersebut.</div>
          </div>

          <div class="pasal-title">
            Pasal 7<br>
            PENGALIHAN
          </div>
          <div class="list-item">
            <div class="bullet">(1)</div>
            <div class="text">Pihak Kedua setuju untuk tidak mengalihkan perjanjian ini secara menyeluruh atau sebagian tanpa persetujuan tertulis dari Pihak Pertama.</div>
          </div>
          <div class="list-item">
            <div class="bullet">(2)</div>
            <div class="text">Pihak Kedua berjanji akan menggunakan mesin fotocopi yang disewa dengan baik dan tidak dapat dipindahtangankan kepada pihak lain.</div>
          </div>
          <div class="footer-paging"><b>4</b> | P a g e</div>
        </div>

        <!-- PAGE 5 -->
        <div class="page">
          <div class="pasal-title">
            Pasal 8<br>
            KERAHASIAAN
          </div>
          <div class="content-block">
            Para Pihak pada Perjanjian ini harus mempertahankan Perjanjian ini, kondisi ini dan hal lain yang berkaitan dengan Perjanjian ini sebagai rahasia (dan/atau informasi rahasia) dan tidak diperkenankan untuk menyebarluaskan informasi di dalam Perjanjian ini, selama Perjanjian ini dan setelah Perjanjian ini berakhir.
          </div>

          <div class="pasal-title">
            Pasal 9<br>
            HUKUM YANG BERLAKU DAN PENYELESAIAN PERSELISIHAN
          </div>
          <div class="list-item">
            <div class="bullet">(1)</div>
            <div class="text">Perjanjian ini dan segala yang timbul akibat adanya Perjanjian ini tunduk pada hukum serta peraturan perundang-undangan yang berlaku di Negara Republik Indonesia.</div>
          </div>
          <div class="list-item">
            <div class="bullet">(2)</div>
            <div class="text">Apabila terjadi perselisihan sehubungan dengan pelaksanaan dari Perjanjian ini, maka Para Pihak sepakat untuk menyelesaikan secara musyawarah mufakat.</div>
          </div>
          <div class="list-item">
            <div class="bullet">(3)</div>
            <div class="text">Apabila dalam jangka waktu 40 (empat puluh) hari setelah perselisihan timbul musyawarah mufakat tidak tercapai, maka Para Pihak sepakat untuk menyelesaikan di Kantor Pengadilan Negeri Batam.</div>
          </div>

          <div class="pasal-title">
            Pasal 10<br>
            KORESPONDENSI
          </div>
          <div class="list-item">
            <div class="bullet">(1)</div>
            <div class="text">Setiap pemberitahuan yang disyaratkan sesuai dengan Perjanjian ini akan diberikan atau dikirimkan melalui pos, kurir, e-mail atau faksimili kepada masing-masing alamat atau nomor faksimili dari masing-masing pihak/wakilnya seperti tercantum di bawah ini atau alamat atau nomor faksimili yang diberikan oleh masing-masing pihak secara tertulis untuk kepentingan masing-masing pihak.<br><br>
              <b>PT. BIAS SURYA TEKNOLOGI</b><br>
              Ruko Puri Mas Blok A No.40<br>
              Batam Centre, Batam<br>
              Telepon : +62 811.704.5657<br>
              Faximili : -<br>
              Untuk Penerima : Linda Hoega<br>
              E-mail : bias.bst@gmail.com<br><br>
              
              <b>${custName.toUpperCase()}</b><br>
              ${custAddress}<br>
              Telepon : ${custPhone}<br>
              Faximili : -<br>
              Untuk Penerima : ${custPicName}<br>
              E-mail : -<br>
            </div>
          </div>
          <div class="list-item">
            <div class="bullet">(2)</div>
            <div class="text">Para Pihak berhak untuk mengubah alamat masing-masing dengan kewajiban untuk menyampaikan pemberitahuan kepada satu sama lain maksimum 7 (tujuh) hari kerja sejak tanggal perubahan.</div>
          </div>

          <div class="pasal-title">
            Pasal 11<br>
            KETENTUAN LAIN
          </div>
          <div class="list-item">
            <div class="bullet">(1)</div>
            <div class="text">Para Pihak sepakat bahwa hal-hal yang belum cukup diatur dalam Perjanjian ini, termasuk tetapi tidak terbatas pada hal-hal mengenai perubahan-perubahannya dan tambahan-tambahannya akan diatur oleh Para Pihak dalam suatu Addendum tersendiri yang merupakan suatu kesatuan yang tidak terpisahkan dari Perjanjian ini.</div>
          </div>
          <div class="footer-paging"><b>5</b> | P a g e</div>
        </div>

        <!-- PAGE 6 -->
        <div class="page">
          <div class="list-item">
            <div class="bullet">(2)</div>
            <div class="text">Para Pihak sepakat untuk melaksanakan Perjanjian ini dengan itikad baik dan penuh tanggung jawab.</div>
          </div>
          
          <div class="content-block" style="margin-top: 30px;">
            Demikian Perjanjian ini dibuat dan ditandatangani pada hari dan tanggal tersebut di atas, dalam rangkap 2 (dua), masing-masing bermaterai Rp.10.000,- dan mempunyai kekuatan hukum yang sama bagi kepentingan Para Pihak.
          </div>

          <div class="signature-section">
            <div class="signature-box">
              <b>PT. BIAS SURYA TEKNOLOGI</b>
              <div class="signature-name">Rosmalinda Hutagalung</div>
              <div class="signature-title">Direktur</div>
            </div>
            <div class="signature-box">
              <b>${custName.toUpperCase()}</b>
              <div class="signature-name">${custPicName}</div>
              <div class="signature-title">PIC / Kepala Bagian</div>
              <div class="signature-nip"></div>
            </div>
          </div>
          <div class="footer-paging" style="margin-top: 200px;"><b>6</b> | P a g e</div>
        </div>
      </body>
    </html>
  `;
  
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 500);
}

function formatRupiah(val: number): string {
  return 'Rp ' + val.toLocaleString('id-ID')
}

function customerName(id: any): string {
  const c = findCustomer(id as any)
  return c ? c.company_name || c.name || '-' : '-'
}

function unitName(id: any): string {
  const u = findUnit(id)
  return u ? `${u.name} (${u.serial_no})` : '-'
}
</script>

<template>
  <div>
    <PageHeader title="Contract Items" button-label="Add Contract" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Search contracts..." @edit="openEdit" @delete="openDelete">
      <template #cell-contract_no="{ row }">{{ row.contract?.contract_no || row.contract_no || '-' }}</template>
      <template #cell-customer_id="{ row }">{{ customerName(row.contract?.customer_id || row.customer_id) }}</template>
      <template #cell-unit_id="{ value }">{{ unitName(value) }}</template>
      <template #cell-monthly_rent_fee="{ row }">{{ formatRupiah(row.contract?.total_value || row.monthly_rent_fee || 0) }}</template>
      <template #cell-status="{ row }">
        <span :class="(row.status || row.contract?.status) === 'active' ? 'badge badge-success' : (row.status || row.contract?.status) === 'expired' ? 'badge badge-danger' : 'badge badge-neutral'">
          {{ (row.status || row.contract?.status) === 'active' ? 'Active' : (row.status || row.contract?.status) === 'expired' ? 'Expired' : (row.status || row.contract?.status || '-') }}
        </span>
      </template>
      <template #actions="{ row }">
        <button class="action-btn" title="Print to PDF" @click="printContract(row)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
        </button>
        <button class="action-btn" title="Detail" @click="openDetail(row)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
        <button class="action-btn action-btn--edit" title="Edit" @click="openEdit(row)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="action-btn action-btn--delete" title="Delete" @click="openDelete(row)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </template>
    </DataTable>
    <FormModal :open="showModal" :title="editingItem ? 'Edit Contract' : 'Add Contract'" @close="showModal = false" @submit="handleSubmit">
      <div class="form-group">
        <label for="ci-no" class="form-label">Contract No.</label>
        <input id="ci-no" v-model="form.contract_no" type="text" class="form-input" placeholder="CNT-XXXXXX">
      </div>
      <div class="form-group">
        <label for="ci-customer" class="form-label">Customer</label>
        <select id="ci-customer" v-model="form.customer_id" class="form-select">
          <option :value="null">-- Select Customer --</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.company_name || c.name || '-' }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="ci-unit" class="form-label">Unit</label>
        <select id="ci-unit" v-model="form.unit_id" class="form-select">
          <option :value="null">-- Select Unit --</option>
          <option v-for="u in units" :key="u.id" :value="u.id">{{ u.name }} ({{ u.serial_no }})</option>
        </select>
      </div>
      <div class="form-group">
        <label for="ci-location" class="form-label">Location</label>
        <input id="ci-location" v-model="form.location" type="text" class="form-input" placeholder="Unit location address">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="ci-start" class="form-label">Start Date</label>
          <input id="ci-start" v-model="form.start_date" type="date" class="form-input">
        </div>
        <div class="form-group">
          <label for="ci-end" class="form-label">End Date</label>
          <input id="ci-end" v-model="form.end_date" type="date" class="form-input">
        </div>
      </div>
      <div class="form-group">
        <label for="ci-rent" class="form-label">Total Value (Rp)</label>
        <input id="ci-rent" v-model.number="form.total_value" type="number" class="form-input" min="0">
      </div>
      <div class="form-group">
        <label for="ci-freecopy" class="form-label">Free Quota Color</label>
        <input id="ci-freecopy" v-model.number="form.free_quota_color" type="number" class="form-input" min="0">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="ci-mono-rate" class="form-label">BW Rate/page</label>
          <input id="ci-mono-rate" v-model.number="form.rate_per_page_bw" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="ci-color-rate" class="form-label">Color Rate/page</label>
          <input id="ci-color-rate" v-model.number="form.rate_per_page_color" type="number" class="form-input" min="0">
        </div>
      </div>
      <div class="form-group">
        <label for="ci-status" class="form-label">Status</label>
        <select id="ci-status" v-model="form.status" class="form-select">
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="terminated">Terminated</option>
        </select>
      </div>
    </FormModal>
    
    <FormModal :open="showDetailModal" title="Detail Contract & Item" @close="showDetailModal = false">
      <div v-if="detailItem" class="detail-container">
        <div class="detail-group">
          <strong>Contract No:</strong> <span>{{ detailItem.contract?.contract_no || detailItem.contract_no }}</span>
        </div>
        <div class="detail-group">
          <strong>Customer:</strong> <span>{{ customerName(detailItem.contract?.customer_id || detailItem.customer_id) }}</span>
        </div>
        <div class="detail-group">
          <strong>Unit:</strong> <span>{{ unitName(detailItem.unit_id) }}</span>
        </div>
        <div class="detail-group">
          <strong>Location:</strong> <span>{{ detailItem.contract?.location || detailItem.placement_location || '-' }}</span>
        </div>
        <div class="detail-group">
          <strong>Start Date:</strong> <span>{{ detailItem.contract?.start_date ? detailItem.contract.start_date.slice(0,10) : detailItem.start_date }}</span>
        </div>
        <div class="detail-group">
          <strong>End Date:</strong> <span>{{ detailItem.contract?.end_date ? detailItem.contract.end_date.slice(0,10) : detailItem.end_date }}</span>
        </div>
        <div class="detail-group">
          <strong>Monthly Rent Fee:</strong> <span>{{ formatRupiah(detailItem.contract?.total_value || detailItem.monthly_rent_fee || 0) }}</span>
        </div>
        <div class="detail-group">
          <strong>Free Quota Color:</strong> <span>{{ detailItem.free_quota_color || detailItem.free_copy_quota || 0 }} pages</span>
        </div>
        <div class="detail-group">
          <strong>Status:</strong> <span>{{ detailItem.status }}</span>
        </div>
      </div>
      <template #footer>
        <button type="button" class="btn btn-outline" @click="showDetailModal = false">Close</button>
        <button type="button" class="btn btn-primary" @click="printContract(detailItem)">Print to PDF</button>
      </template>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Contract" :message="`Are you sure you want to delete contract '${deletingItem?.contract_no}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-base);
}

.detail-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-group {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-border-light);
  padding-bottom: 8px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid var(--color-border-light);
  background: transparent;
  color: var(--color-text-muted);
  transition: all var(--transition-fast);
}
.action-btn:hover {
  background: var(--color-surface-raised);
}
.action-btn--edit:hover {
  color: var(--color-primary);
  border-color: var(--color-primary-surface);
  background: var(--color-primary-surface);
}
.action-btn--delete:hover {
  color: var(--color-danger);
  border-color: var(--color-danger-surface);
  background: var(--color-danger-surface);
}
</style>
