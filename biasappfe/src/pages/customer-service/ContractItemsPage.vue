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
  { key: 'customer_id', label: 'Company' },
  { key: 'pic_name', label: 'PIC Name' },
  { key: 'start_date', label: 'Start Date' },
  { key: 'end_date', label: 'End Date' },
  { key: 'monthly_rent_fee', label: 'Total' },
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

function formatRomanMonth(monthIndex: number): string {
  const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  return romans[monthIndex] || 'I';
}

function generateContractNumber(seq: number = 480, isCopier: boolean = true, date: Date = new Date()): string {
  const romanMonth = formatRomanMonth(date.getMonth());
  const year = date.getFullYear();
  const typeCode = isCopier ? 'PSMMF' : 'PSMP';
  return `${seq}/BiAS-${typeCode}/${romanMonth}-${year}`;
}

const defaultForm = { ...form }

function openAdd() {
  editingItem.value = null
  const nextSeq = 480 + (data.value ? data.value.length : 0)
  const autoNo = generateContractNumber(nextSeq, true, new Date())
  Object.assign(form, { ...defaultForm, contract_no: autoNo, rates: [] })
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

function getContractUnits(item: any): any[] {
  if (!item) return []
  const cNo = item.contract?.contract_no || item.contract_no
  const cId = item.contract_id || item.contract?.id
  
  let matches = data.value.filter((d: any) => {
    const dNo = d.contract?.contract_no || d.contract_no
    const dId = d.contract_id || d.contract?.id
    if (cNo && dNo) return cNo === dNo
    if (cId && dId) return cId === dId
    return false
  })
  
  if (!matches || matches.length === 0) {
    matches = [item]
  }
  return matches
}

function printContract(item: any) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const unitsInContract = getContractUnits(item);
  const totalUnitsCount = unitsInContract.length;

  const hasCopier = unitsInContract.some((uItem: any) => {
    const targetUnit = findUnit(uItem.unit_id) || uItem.unit;
    return targetUnit?.is_copier === true || targetUnit?.is_copier === 1 || uItem.unit?.is_copier === true || uItem.is_copier === true;
  });
  const hasPrinter = unitsInContract.some((uItem: any) => {
    const targetUnit = findUnit(uItem.unit_id) || uItem.unit;
    const isCopier = targetUnit?.is_copier === true || targetUnit?.is_copier === 1 || uItem.unit?.is_copier === true || uItem.is_copier === true;
    return !isCopier;
  });

  let machineTypeName = 'MESIN FOTOCOPI';
  let machineWord = 'mesin fotokopi';
  let machineWordCd = 'mesin fotocopi';

  if (hasCopier && hasPrinter) {
    machineTypeName = 'MESIN FOTOCOPI DAN PRINTER';
    machineWord = 'mesin fotokopi dan printer';
    machineWordCd = 'mesin fotocopi dan printer';
  } else if (hasPrinter && !hasCopier) {
    machineTypeName = 'PRINTER';
    machineWord = 'printer';
    machineWordCd = 'printer';
  }

  const customerId = item.contract?.customer_id || item.customer_id;
  const customer = findCustomer(customerId) || item.customer || item.contract?.customer;
  const custName = customer?.company_name || customer?.name || '';
  const custAddress = customer?.address || '-';
  const custPhone = customer?.phone || '-';
  const custPicName = customer?.pic_name || '-';
  const custFax = customer?.fax || '-';
  const custPicPosition = customer?.pic_position || '-';
  const custEmail = customer?.email || '-';
  const contractNo = item.contract?.contract_no || item.contract_no || '';
  const startDate = item.contract?.start_date ? item.contract.start_date.slice(0,10) : (item.start_date ? item.start_date.slice(0,10) : '');
  const endDate = item.contract?.end_date ? item.contract.end_date.slice(0,10) : (item.end_date ? item.end_date.slice(0,10) : '');
  
  // Calculate total monthly rent across all units in contract if multiple
  const sumUnitsFee = unitsInContract.reduce((sum: number, u: any) => sum + (u.monthly_rent_fee || u.total_value || 0), 0);
  const totalMonthlyFee = sumUnitsFee > 0 ? sumUnitsFee : (item.contract?.total_value || item.monthly_rent_fee || 0);
  const freeQuota = item.free_quota_color || item.free_copy_quota || 0;
  const bwRate = item.rates?.[0]?.rate_per_page_bw || item.rate_per_page_bw || 150;
  const colorRate = item.rates?.[0]?.rate_per_page_color || item.rate_per_page_color || 1300;

  // Parse date for Indonesian format (e.g. 03 Januari 2024)
  const d = new Date(startDate || new Date());
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const dayName = days[d.getDay()];
  const dateNum = d.getDate();
  const monthName = months[d.getMonth()];
  const yearNum = d.getFullYear();

  const spellNumber = (n: number): string => {
    const words = ['Nol', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
    if (n < 12) return words[n];
    if (n < 20) return spellNumber(n - 10) + ' Belas';
    if (n < 100) return spellNumber(Math.floor(n / 10)) + ' Puluh' + (n % 10 ? ' ' + spellNumber(n % 10) : '');
    if (n < 200) return 'Seratus' + (n % 100 ? ' ' + spellNumber(n % 100) : '');
    if (n < 1000) return spellNumber(Math.floor(n / 100)) + ' Ratus' + (n % 100 ? ' ' + spellNumber(n % 100) : '');
    if (n < 2000) return 'Seribu' + (n % 1000 ? ' ' + spellNumber(n % 1000) : '');
    if (n < 1000000) return spellNumber(Math.floor(n / 1000)) + ' Ribu' + (n % 1000 ? ' ' + spellNumber(n % 1000) : '');
    return n.toString();
  };
  const spellYear = (y: number) => {
    return spellNumber(y);
  };

  let durationText = '2 (dua) tahun';
  if (startDate && endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
      let years = e.getFullYear() - s.getFullYear();
      let months = e.getMonth() - s.getMonth();
      let days = e.getDate() - s.getDate();
      if (days < 0) {
        months--;
      }
      if (months < 0) {
        years--;
        months += 12;
      }
      
      // If days > 25 (e.g., month end adjustment), treat it as an extra month
      if (days >= 28) {
        months++;
        if (months === 12) {
          years++;
          months = 0;
        }
      }
      
      const parts = [];
      if (years > 0) {
        parts.push(`${years} (${spellNumber(years).toLowerCase()}) tahun`);
      }
      if (months > 0) {
        parts.push(`${months} (${spellNumber(months).toLowerCase()}) bulan`);
      }
      
      if (parts.length > 0) {
        durationText = parts.join(' dan ');
      }
    }
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Surat Perjanjian - ${contractNo}</title>
        <style>
          @page { size: A4; margin: 1.8cm 2cm 1.8cm 2cm; }
          body { font-family: "Times New Roman", Times, serif; font-size: 11pt; line-height: 1.45; color: #000; margin: 0; padding: 0; text-align: justify; }
          
          /* Header */
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 10px; }
          .header-left { display: flex; align-items: center; gap: 15px; }
          .header-logo { width: 48px; height: 48px; background: #004d99; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-style: italic; font-size: 15px; border: 3px solid #ffcc00; box-shadow: -2px 2px 0px #0088cc;}
          .header-title-company { font-family: Arial, sans-serif; }
          .header-title-company h1 { margin: 0; font-size: 15pt; color: #002b5e; font-weight: 900; letter-spacing: 0.5px; }
          .header-title-company h2 { margin: 0; font-size: 10.5pt; color: #333; font-weight: bold; font-style: italic; }
          .header-right { font-family: Arial, sans-serif; font-size: 8pt; text-align: right; line-height: 1.25; font-weight: bold; }
          
          .doc-title { text-align: center; margin-top: 15px; margin-bottom: 20px; }
          .doc-title h3 { margin: 0; font-size: 13.5pt; text-decoration: underline; font-weight: bold; letter-spacing: 0.5px; }
          .doc-title p { margin: 3px 0 0 0; font-size: 10pt; font-weight: bold; }

          .content-block { margin-bottom: 12px; }
          .indent { padding-left: 25px; }
          
          .party-info { display: grid; grid-template-columns: 25px 140px 10px 1fr; margin-bottom: 4px; }
          
          .pasal-block { page-break-inside: avoid; margin-top: 15px; }
          .pasal-title { text-align: center; font-weight: bold; margin-top: 16px; margin-bottom: 8px; page-break-after: avoid; }
          
          .list-item { display: flex; margin-bottom: 6px; page-break-inside: avoid; }
          .list-item .bullet { width: 35px; flex-shrink: 0; text-align: right; padding-right: 12px; }
          .list-item .text { flex-grow: 1; }

          .unit-info-grid { display: grid; grid-template-columns: 160px 15px 1fr; row-gap: 2px; margin-left: 20px; margin-top: 4px; page-break-inside: avoid; }

          .signature-section { display: flex; justify-content: space-between; margin-top: 40px; text-align: center; page-break-inside: avoid; }
          .signature-box { width: 45%; display: flex; flex-direction: column; justify-content: space-between; min-height: 140px; }
          .signature-box-top { font-weight: bold; }
          .signature-box-bottom { margin-top: auto; }
          .signature-name { font-weight: bold; text-decoration: underline; }
          .signature-title { font-style: italic; }
          .signature-nip { margin-top: 0px; }
        </style>
      </head>
      <body>
        <div class="contract-container">
          <!-- Header -->
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

          <!-- Document Title -->
          <div class="doc-title">
            <h3>SURAT PERJANJIAN SEWA ${machineTypeName}</h3>
            <p>Nomor : ${contractNo}</p>
          </div>

          <!-- Preamble -->
          <div class="content-block">
            <b>PERJANJIAN SEWA ${machineTypeName}</b> (selanjutnya disebut ”Perjanjian”) ini dibuat dan ditandatangani pada hari ${dayName} , tanggal ${spellNumber(dateNum)} bulan ${monthName} Tahun ${spellYear(yearNum)} ( ${String(dateNum).padStart(2,'0')} ${monthName} ${yearNum} ), Oleh dan Antara:
          </div>

          <!-- Pihak Pertama -->
          <div class="content-block indent">
            <div class="party-info">
              <div>1.</div><div>Nama</div><div>:</div><div><b>Rosmalinda Hutagalung</b></div>
              <div></div><div>Nama Perusahaan</div><div>:</div><div><b>PT. BIAS SURYA TEKNOLOGI</b></div>
              <div></div><div>Alamat</div><div>:</div><div>Ruko Puri Mas Blok A No.40, Batam Centre, Batam</div>
              <div></div><div>Telepon</div><div>:</div><div>+62 811.704.5657</div>
              <div></div><div>Email</div><div>:</div><div>bias.bst@gmail.com</div>
              <div></div><div>Jabatan</div><div>:</div><div><b>Direktur</b></div>
            </div>
            <br>Selanjutnya disebut sebagai <b>PIHAK PERTAMA</b>
          </div>

          <!-- Pihak Kedua -->
          <div class="content-block indent">
            <div class="party-info">
              <div>2.</div><div>Nama</div><div>:</div><div><b>${custPicName}</b></div>
              <div></div><div>Nama Kantor</div><div>:</div><div><b>${custName}</b></div>
              <div></div><div>Alamat</div><div>:</div><div>${custAddress}</div>
              <div></div><div>Telepon</div><div>:</div><div>${custPhone}</div>
              <div></div><div>Faximili</div><div>:</div><div>${custFax}</div>
              <div></div><div>Jabatan</div><div>:</div><div><b>${custPicPosition}</b></div>
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
            <div class="text">Bahwa Pihak Pertama adalah Perusahaan yang berpengalaman di bidang jasa <i>(service)</i> penyewaan ${machineWord};</div>
          </div>
          <div class="list-item">
            <div class="bullet">b.</div>
            <div class="text">Bahwa Pihak Kedua adalah Kantor berlokasi di Batam yang dalam operasionalnya memerlukan jasa penyewaan ${machineWord};</div>
          </div>
          <div class="list-item">
            <div class="bullet">c.</div>
            <div class="text">Bahwa Pihak Kedua setuju untuk menunjuk Pihak Pertama untuk menyediakan jasa <i>(service)</i> dalam pengadaan ${machineWord}, termasuk di dalamnya penyediaan jasa <i>(service)</i> teknik;</div>
          </div>
          <div class="list-item">
            <div class="bullet">d.</div>
            <div class="text">Bahwa Para Pihak bersepakat untuk menggunakan ${totalUnitsCount} (${spellNumber(totalUnitsCount).toLowerCase()}) unit ${machineWordCd} milik Pihak Pertama, yang ditempatkan di lokasi dan dengan rincian sebagai berikut:</div>
          </div>

          <!-- Unit Details -->
          <div style="margin-top: 10px; margin-bottom: 15px; page-break-inside: avoid;">
            ${unitsInContract.map((uItem: any, index: number) => {
              const targetUnit = findUnit(uItem.unit_id) || uItem.unit;
              const isCopier = targetUnit?.is_copier === true || targetUnit?.is_copier === 1 || uItem.unit?.is_copier === true || uItem.is_copier === true;
              const uName = unitOnlyName(uItem.unit_id, uItem.unit);
              const uBrand = uItem.unit?.brand?.name || targetUnit?.brand?.name || 'EPSON';
              const uSerial = unitSerialNo(uItem.unit_id, uItem.unit);
              const uLoc = uItem.contract?.location || uItem.placement_location || uItem.location || '-';
              const uStartBw = uItem.start_mono_value || uItem.start_meter_bw || 0;
              const uStartColor = uItem.start_color_value || uItem.start_meter_color || 0;
              
              const showMeter = isCopier || uStartBw > 0 || uStartColor > 0;

              const meterHtml = showMeter ? `
                    <div>Start Meter Reading</div><div>:</div><div>${uStartBw} (B/W)</div>
                    <div>Start Meter Reading</div><div>:</div><div>${uStartColor} (Colour)</div>
              ` : '';

              return `
                <div style="margin-bottom: 12px;">
                  <div><b>${index + 1}. ${uLoc}</b></div>
                  <div class="unit-info-grid">
                    <div>Brand</div><div>:</div><div><b>${uBrand}</b></div>
                    <div>Type</div><div>:</div><div>${uName}</div>
                    <div>Nomor Seri</div><div>:</div><div>${uSerial}</div>
                    ${meterHtml}
                    <div>Jumlah</div><div>:</div><div>1 (satu) Unit</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          
          <div class="content-block">
            untuk dipergunakan sebagai sarana operasional Pihak Kedua dengan syarat dan ketentuan sebagai berikut:
          </div>

          <!-- Pasal 1 -->
          <div class="pasal-block">
            <div class="pasal-title">
              Pasal 1<br>
              JANGKA WAKTU PERJANJIAN
            </div>
            <div class="content-block">
              Para Pihak sepakat bahwa Jangka Waktu Perjanjian ini adalah ${durationText}, terhitung sejak tanggal <b>${item.contract?.start_date ? item.contract.start_date.slice(0,10) : '-'} s/d ${item.contract?.end_date ? item.contract.end_date.slice(0,10) : '-'}</b> dan masa sewa dapat diperpanjang kembali atas persetujuan kedua belah pihak dengan pemberitahuan terlebih dahulu oleh Pihak Kedua selambat-lambatnya 2 (dua) minggu sebelum masa sewa berakhir. <i>Dan apabila tidak ada pemberitahuan maka kontrak ini otomatis diperpanjang</i>.
            </div>
          </div>

          <!-- Pasal 2 -->
          <div class="pasal-block">
            <div class="pasal-title">
              Pasal 2<br>
              HARGA SEWA DAN MEKANISME PEMBAYARAN
            </div>
            <div class="list-item">
              <div class="bullet">(1)</div>
              <div class="text">Harga Sewa yang disepakati Para Pihak adalah sebagai berikut :
                <table style="width: 100%; margin-top: 5px; border: none; font-size: 11pt;">
                  <tr>
                    <td style="width: 20px; vertical-align: top;">-</td>
                    <td>Sewa mesin per bulan per unit ${hasCopier && freeQuota > 0 ? `termasuk pembuatan ${freeQuota} lembar per bulan untuk hasil warna` : ''}</td>
                    <td style="width: 30px;">Rp</td>
                    <td style="text-align: right; width: 120px;">${formatRupiah(totalMonthlyFee).replace('Rp ', '')}</td>
                  </tr>
                  ${hasCopier ? `
                  <tr>
                    <td style="vertical-align: top;">-</td>
                    <td>Biaya perlembar setelah pemakaian ${freeQuota} lembar hasil warna :</td>
                    <td>Rp</td>
                    <td style="text-align: right;">${colorRate},-</td>
                  </tr>
                  <tr>
                    <td style="vertical-align: top;">-</td>
                    <td>Biaya perlembar untuk pemakaian hitam putih :</td>
                    <td>Rp</td>
                    <td style="text-align: right;">${bwRate},-</td>
                  </tr>
                  ` : ''}
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
              <div class="text">Pihak Pertama harus mengajukan invoice/faktur yang dilengkapi dengan validasi tandatangan Penanggung jawab Pihak Pertama atau pihak lain yang berwenang di Pihak Pertama, dan Pihak Kedua dapat menolak invoice/faktur apabila tidak sesuai dengan validasi tersebut.</div>
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
          </div>

          <!-- Pasal 3 -->
          <div class="pasal-block">
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
          </div>

          <!-- Pasal 4 -->
          <div class="pasal-block">
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
          </div>

          <!-- Pasal 5 -->
          <div class="pasal-block">
            <div class="pasal-title">
              Pasal 5<br>
              PENGAKHIRAN PERJANJIAN
            </div>
            <div class="list-item">
              <div class="bullet">(1)</div>
              <div class="text">Jika ${machineWord} dan jasa <i>(service)</i> yang disediakan oleh Pihak Pertama tidak memuaskan dan setelah diberikan peringatan tertulis sebanyak 3 (tiga) kali berturut-turut tidak menunjukkan perbaikan, maka Pihak kedua sewaktu-waktu berhak mengakhiri Perjanjian ini secara sepihak.</div>
            </div>
          </div>

          <!-- Pasal 6 -->
          <div class="pasal-block">
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
          </div>

          <!-- Pasal 7 -->
          <div class="pasal-block">
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
              <div class="text">Pihak Kedua berjanji akan menggunakan ${machineWordCd} yang disewa dengan baik dan tidak dapat dipindahtangankan kepada pihak lain.</div>
            </div>
          </div>

          <!-- Pasal 8 -->
          <div class="pasal-block">
            <div class="pasal-title">
              Pasal 8<br>
              KERAHASIAAN
            </div>
            <div class="content-block">
              Para Pihak pada Perjanjian ini harus mempertahankan Perjanjian ini, kondisi ini dan hal lain yang berkaitan dengan Perjanjian ini sebagai rahasia (dan/atau informasi rahasia) dan tidak diperkenankan untuk menyebarluaskan informasi di dalam Perjanjian ini, selama Perjanjian ini dan setelah Perjanjian ini berakhir.
            </div>
          </div>

          <!-- Pasal 9 -->
          <div class="pasal-block">
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
          </div>

          <!-- Pasal 10 -->
          <div class="pasal-block">
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
                Faximili : ${custFax}<br>
                Untuk Penerima : ${custPicName}<br>
                E-mail : ${custEmail}<br>
              </div>
            </div>
            <div class="list-item">
              <div class="bullet">(2)</div>
              <div class="text">Para Pihak berhak untuk mengubah alamat masing-masing dengan kewajiban untuk menyampaikan pemberitahuan kepada satu sama lain maksimum 7 (tujuh) hari kerja sejak tanggal perubahan.</div>
            </div>
          </div>

          <!-- Pasal 11 -->
          <div class="pasal-block">
            <div class="pasal-title">
              Pasal 11<br>
              KETENTUAN LAIN
            </div>
            <div class="list-item">
              <div class="bullet">(1)</div>
              <div class="text">Para Pihak sepakat bahwa hal-hal yang belum cukup diatur dalam Perjanjian ini, termasuk tetapi tidak terbatas pada hal-hal mengenai perubahan-perubahannya dan tambahan-tambahannya akan diatur oleh Para Pihak dalam suatu Addendum tersendiri yang merupakan suatu kesatuan yang tidak terpisahkan dari Perjanjian ini.</div>
            </div>
            <div class="list-item">
              <div class="bullet">(2)</div>
              <div class="text">Para Pihak sepakat untuk melaksanakan Perjanjian ini dengan itikad baik dan penuh tanggung jawab.</div>
            </div>
          </div>
          
          <div class="content-block" style="margin-top: 25px; page-break-inside: avoid;">
            Demikian Perjanjian ini dibuat dan ditandatangani pada hari dan tanggal tersebut di atas, dalam rangkap 2 (dua), masing-masing bermaterai Rp.10.000,- dan mempunyai kekuatan hukum yang sama bagi kepentingan Para Pihak.
          </div>

          <!-- Signature -->
          <div class="signature-section">
            <div class="signature-box">
              <div class="signature-box-top">
                PT. BIAS SURYA TEKNOLOGI
              </div>
              <div class="signature-box-bottom">
                <div class="signature-name">Rosmalinda Hutagalung</div>
                <div class="signature-title">Direktur</div>
              </div>
            </div>
            <div class="signature-box">
              <div class="signature-box-top">
                ${custPicPosition ? `<div>${custPicPosition.toUpperCase()}</div>` : ''}
                <div>${custName.toUpperCase()}</div>
              </div>
              <div class="signature-box-bottom">
                <div class="signature-name">${custPicName}</div>
                <div class="signature-nip">${customer?.nip || customer?.pic_nip ? 'NIP. ' + (customer?.nip || customer?.pic_nip) : ''}</div>
              </div>
            </div>
          </div>
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

function formatDate(val: any): string {
  if (!val) return '-'
  const d = new Date(val)
  if (isNaN(d.getTime())) return String(val).slice(0, 10)
  const day = String(d.getDate()).padStart(2, '0')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = months[d.getMonth()]
  const year = d.getFullYear()
  return `${day} ${month} ${year}`
}

function customerName(id: any): string {
  const c = findCustomer(id as any)
  return c ? c.company_name || c.name || '-' : '-'
}

function customerPicName(id: any): string {
  const c = findCustomer(id as any)
  return c ? c.pic_name || '-' : '-'
}

function customerPhone(id: any): string {
  const c = findCustomer(id as any)
  return c ? c.phone || '-' : '-'
}

function unitOnlyName(id: any, rowUnit?: any): string {
  if (rowUnit?.name) return rowUnit.name
  const u = findUnit(id)
  return u ? u.name || u.model || '-' : '-'
}

function unitSerialNo(id: any, rowUnit?: any): string {
  if (rowUnit?.serial_no) return rowUnit.serial_no
  const u = findUnit(id)
  return u ? u.serial_no || '-' : '-'
}
</script>

<template>
  <div>
    <PageHeader title="Contract Items" button-label="Add Contract" @add="openAdd" />
    <DataTable :columns="columns" :data="data" search-placeholder="Search contracts..." @edit="openEdit" @delete="openDelete">
      <template #cell-contract_no="{ row }">
        <span class="cell-contract-no">{{ row.contract?.contract_no || row.contract_no || '-' }}</span>
      </template>
      <template #cell-customer_id="{ row }">
        <span class="font-medium">{{ customerName(row.contract?.customer_id || row.customer_id) }}</span>
      </template>
      <template #cell-pic_name="{ row }">
        {{ customerPicName(row.contract?.customer_id || row.customer_id) }}
      </template>
      <template #cell-start_date="{ row }">
        {{ formatDate(row.contract?.start_date || row.start_date) }}
      </template>
      <template #cell-end_date="{ row }">
        {{ formatDate(row.contract?.end_date || row.end_date) }}
      </template>
      <template #cell-monthly_rent_fee="{ row }">
        <span class="font-semibold">{{ formatRupiah(row.contract?.total_value || row.monthly_rent_fee || 0) }}</span>
      </template>
      <template #cell-status="{ row }">
        <span :class="(row.status || row.contract?.status) === 'active' ? 'badge badge-success' : (row.status || row.contract?.status) === 'expired' ? 'badge badge-danger' : 'badge badge-neutral'">
          {{ ((row.status || row.contract?.status) || '-').toUpperCase() }}
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
        <input id="ci-no" v-model="form.contract_no" type="text" class="form-input" placeholder="480/BiAS-PSMMF/I-2024">
      </div>
      <div class="form-group">
        <label for="ci-customer" class="form-label">Company</label>
        <select id="ci-customer" v-model="form.customer_id" class="form-select">
          <option :value="null">-- Select Company --</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.company_name || c.name || '-' }}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="ci-unit" class="form-label">Unit</label>
        <select id="ci-unit" v-model="form.unit_id" class="form-select">
          <option :value="null">-- Select Unit --</option>
          <option v-for="u in units" :key="u.id" :value="u.id">{{ u.name }} (S/N: {{ u.serial_no }})</option>
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
      <div v-if="detailItem" class="detail-card-container">
        <!-- Hero Banner Header -->
        <div class="detail-hero">
          <div class="detail-hero-info">
            <span class="detail-label">Contract Number</span>
            <h3 class="detail-contract-no">{{ detailItem.contract?.contract_no || detailItem.contract_no || '-' }}</h3>
          </div>
          <span class="badge badge-lg" :class="(detailItem.status || detailItem.contract?.status) === 'active' ? 'badge-success' : 'badge-danger'">
            {{ ((detailItem.status || detailItem.contract?.status) || 'active').toUpperCase() }}
          </span>
        </div>

        <!-- Section 1: Company & Contact -->
        <div class="detail-section">
          <div class="detail-section-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M3 7v14M21 7v14M6 11h.01M6 15h.01M6 19h.01M10 11h.01M10 15h.01M10 19h.01M14 11h.01M14 15h.01M14 19h.01M18 11h.01M18 15h.01M18 19h.01M3 7l9-4 9 4"/></svg>
            Company & Contact Information
          </div>
          <div class="detail-grid-2">
            <div class="detail-box">
              <span class="box-label">Company Name</span>
              <span class="box-value font-semibold">{{ customerName(detailItem.contract?.customer_id || detailItem.customer_id) }}</span>
            </div>
            <div class="detail-box">
              <span class="box-label">PIC Name</span>
              <span class="box-value">{{ customerPicName(detailItem.contract?.customer_id || detailItem.customer_id) }}</span>
            </div>
            <div class="detail-box">
              <span class="box-label">Phone</span>
              <span class="box-value">{{ customerPhone(detailItem.contract?.customer_id || detailItem.customer_id) }}</span>
            </div>
            <div class="detail-box">
              <span class="box-label">Installation Location</span>
              <span class="box-value">{{ detailItem.contract?.location || detailItem.placement_location || '-' }}</span>
            </div>
          </div>
        </div>

        <!-- Section 2: Machine & Equipment -->
        <div class="detail-section">
          <div class="detail-section-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>
            Machine & Equipment Details ({{ getContractUnits(detailItem).length }} Unit{{ getContractUnits(detailItem).length > 1 ? 's' : '' }})
          </div>
          <div v-for="(u, idx) in getContractUnits(detailItem)" :key="idx" :style="idx > 0 ? 'margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--color-border-light);' : ''">
            <div v-if="getContractUnits(detailItem).length > 1" class="box-label font-semibold" style="margin-bottom: 6px; color: var(--color-primary);">
              Unit #{{ idx + 1 }} - {{ u.contract?.location || u.placement_location || u.location || 'Location N/A' }}
            </div>
            <div class="detail-grid-2">
              <div class="detail-box">
                <span class="box-label">Unit Model</span>
                <span class="box-value font-semibold">{{ unitOnlyName(u.unit_id, u.unit) }}</span>
              </div>
              <div class="detail-box">
                <span class="box-label">Serial Number (S/N)</span>
                <span class="box-value font-mono">{{ unitSerialNo(u.unit_id, u.unit) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Section 3: Period & Financial Billing -->
        <div class="detail-section">
          <div class="detail-section-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            Contract Period & Financial Billing
          </div>
          <div class="detail-grid-3">
            <div class="detail-box">
              <span class="box-label">Start Date</span>
              <span class="box-value">{{ formatDate(detailItem.contract?.start_date || detailItem.start_date) }}</span>
            </div>
            <div class="detail-box">
              <span class="box-label">End Date</span>
              <span class="box-value">{{ formatDate(detailItem.contract?.end_date || detailItem.end_date) }}</span>
            </div>
            <div class="detail-box highlight-box">
              <span class="box-label">Monthly Rent Fee</span>
              <span class="box-value price-text">{{ formatRupiah(detailItem.contract?.total_value || detailItem.monthly_rent_fee || 0) }}</span>
            </div>
          </div>
          <div class="detail-grid-3" style="margin-top: 10px;">
            <div class="detail-box">
              <span class="box-label">Free Quota (Color)</span>
              <span class="box-value">{{ detailItem.free_quota_color || detailItem.free_copy_quota || 0 }} pages</span>
            </div>
            <div class="detail-box" v-if="detailItem.rate_per_page_bw || detailItem.rates?.length">
              <span class="box-label">BW Rate / page</span>
              <span class="box-value">{{ formatRupiah(detailItem.rate_per_page_bw || detailItem.rates?.[0]?.rate_per_page_bw || 0) }}</span>
            </div>
            <div class="detail-box" v-if="detailItem.rate_per_page_color || detailItem.rates?.length">
              <span class="box-label">Color Rate / page</span>
              <span class="box-value">{{ formatRupiah(detailItem.rate_per_page_color || detailItem.rates?.[0]?.rate_per_page_color || 0) }}</span>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <button type="button" class="btn btn-outline" @click="showDetailModal = false">Close</button>
        <button type="button" class="btn btn-primary" @click="printContract(detailItem)">Print to PDF</button>
      </template>
    </FormModal>
    <ConfirmDialog :open="showConfirm" title="Delete Contract" :message="`Are you sure you want to delete contract '${deletingItem?.contract?.contract_no || deletingItem?.contract_no || '-'}'?`" @close="showConfirm = false" @confirm="handleDelete" />
  </div>
</template>

<style scoped>
.cell-contract-no {
  font-family: monospace;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: -0.3px;
}
.font-medium {
  font-weight: var(--font-weight-medium);
}
.font-semibold {
  font-weight: var(--font-weight-bold);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-base);
}

.detail-card-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 0;
}

.detail-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.detail-hero-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.detail-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--color-text-muted);
  font-weight: 700;
}

.detail-contract-no {
  font-family: monospace;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.badge-lg {
  padding: 6px 14px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  border-radius: 20px;
}

.detail-section {
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  padding: 14px 16px;
}

.detail-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--color-primary);
  margin-bottom: 12px;
  padding-bottom: 6px;
  border-bottom: 1px dashed var(--color-border-light);
}

.detail-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.detail-grid-3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}

.detail-box {
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: var(--color-surface-sunken);
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-light);
}

.box-label {
  font-size: 0.72rem;
  color: var(--color-text-muted);
}

.box-value {
  font-size: var(--font-size-sm);
  color: var(--color-text);
  word-break: break-word;
}

.highlight-box {
  background: var(--color-primary-surface);
  border-color: var(--color-primary-surface);
}

.price-text {
  font-weight: 700;
  color: var(--color-primary);
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
