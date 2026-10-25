export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatDateDDMMYYYY(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Daftar brand populer untuk printer, copier, dan IT equipment.
 */
export const KNOWN_BRANDS = [
  'Canon', 'Epson', 'HP', 'Hewlett-Packard', 'Kyocera', 'Fuji Xerox', 'Xerox',
  'Brother', 'Konica Minolta', 'Ricoh', 'Sharp', 'Toshiba', 'Samsung', 'Panasonic',
  'Lexmark', 'Dell', 'Lenovo', 'Asus', 'Acer'
];

function cleanString(str: any): string {
  if (!str || typeof str !== 'string') return '';
  return str.trim();
}

function containsWord(text: string, word: string): boolean {
  if (!text || !word) return false;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\b|\\s)${escaped}(\\b|\\s|$)`, 'i').test(text);
}

/**
 * Deteksi apakah unit merupakan Copier (Mesin Fotokopi) atau Printer.
 */
export function isCopierOrPrinter(u: any): { isCopier: boolean; isPrinter: boolean; isPrinterOrCopier: boolean } {
  if (!u) return { isCopier: false, isPrinter: false, isPrinterOrCopier: false };

  const rawTypeName = cleanString(u.type?.name || u.unit_type?.name || u.type_name || (typeof u.type === 'string' ? u.type : ''));
  const rawModel = cleanString(u.model);
  const rawName = cleanString(u.name);
  const combined = `${rawTypeName} ${rawModel} ${rawName}`.toLowerCase();

  const isCopier = Boolean(u.is_copier) ||
    combined.includes('copier') ||
    combined.includes('photocopy') ||
    combined.includes('fotokopi') ||
    combined.includes('fotocopy') ||
    /\b(ir|ir-adv|imagerunner|bizhub|apeosport|docucentre|taskalfa)\b/i.test(combined);

  const isPrinter = !isCopier && (
    combined.includes('printer') ||
    /\b(laserjet|deskjet|inkjet|ecotank|pixma|stylus|tank)\b/i.test(combined)
  );

  return {
    isCopier,
    isPrinter,
    isPrinterOrCopier: isCopier || isPrinter,
  };
}

/**
 * Resolusi teknologi cetak (Laser vs Inject) untuk printer atau copier.
 */
export function resolvePrintTech(u: any): 'Laser' | 'Inject' | '' {
  if (!u) return '';
  const { isCopier, isPrinter, isPrinterOrCopier } = isCopierOrPrinter(u);
  if (!isPrinterOrCopier) return '';

  // 1. Nilai eksplisit dari print_tech
  const explicit = cleanString(u.print_tech || u.specs?.print_tech);
  if (/laser/i.test(explicit)) return 'Laser';
  if (/inject|inkjet|ink/i.test(explicit)) return 'Inject';

  // 2. Cek keyword pada model, nama, atau spesifikasi
  const combined = `${cleanString(u.model)} ${cleanString(u.name)} ${cleanString(u.specs)}`.toLowerCase();
  if (/\blaser\b|\blaserjet\b|\btoner\b/i.test(combined)) return 'Laser';
  if (/\binject\b|\binkjet\b|\bink\s*tank\b|\becotank\b|\bdeskjet\b|\bpixma\b/i.test(combined)) return 'Inject';

  // 3. Fallback default:
  // Mesin fotokopi kantor (Copier) adalah mesin Laser
  if (isCopier) return 'Laser';

  // Jika printer: seri laserjet / lbp / mfp adalah Laser, seri botol/cartridge tinta adalah Inject
  if (isPrinter) {
    if (/\b(lbp|mfp|hl-)\b/i.test(combined)) return 'Laser';
    return 'Inject';
  }

  return '';
}

/**
 * Format nama lengkap unit dengan susunan:
 * [Tipe] [Laser / Inject jika printer/copier] [Brand] [Model]
 * Contoh: "Photocopy Machine Laser Canon iR 2006N", "Printer Inject Epson L3210"
 */
export function formatUnitDisplayName(
  u: any,
  lookups?: { findBrand?: (id: any) => any; findUnitType?: (id: any) => any }
): string {
  if (!u) return '-';
  if (typeof u === 'string') return u.trim() || '-';

  // 1. Brand Name
  let brandName = cleanString(u.brand?.name || u.brand_name || (typeof u.brand === 'string' ? u.brand : ''));
  if ((!brandName || brandName === '-') && u.brand_id && lookups?.findBrand) {
    brandName = cleanString(lookups.findBrand(u.brand_id)?.name);
  }
  if (brandName === '-') brandName = '';

  // Heuristic brand jika belum ada
  if (!brandName) {
    const hay = `${cleanString(u.model)} ${cleanString(u.name)}`;
    for (const b of KNOWN_BRANDS) {
      if (containsWord(hay, b)) {
        brandName = b;
        break;
      }
    }
  }

  // 2. Type Name
  let typeName = cleanString(u.type?.name || u.unit_type?.name || u.type_name || (typeof u.type === 'string' ? u.type : ''));
  if (!typeName && (u.type_id || u.unit_type_id) && lookups?.findUnitType) {
    typeName = cleanString(lookups.findUnitType(u.type_id || u.unit_type_id)?.name);
  }

  const { isCopier, isPrinter, isPrinterOrCopier } = isCopierOrPrinter({ ...u, type_name: typeName });
  const tech = resolvePrintTech({ ...u, is_copier: isCopier, type_name: typeName });

  if (isCopier && !typeName) {
    typeName = 'Photocopy Machine';
  } else if (isPrinter && !typeName) {
    typeName = 'Printer';
  }

  // 3. Model
  let model = cleanString(u.model);
  if (!model) {
    model = cleanString(u.name);
  }

  // 4. Bersihkan duplikasi brand atau type di dalam model
  if (brandName && model) {
    const brandRegex = new RegExp(`^${brandName}\\b[\\s-_]*`, 'i');
    if (brandRegex.test(model)) {
      model = model.replace(brandRegex, '').trim();
    }
  }
  if (typeName && model) {
    const typeRegex = new RegExp(`^${typeName}\\b[\\s-_]*`, 'i');
    if (typeRegex.test(model)) {
      model = model.replace(typeRegex, '').trim();
    }
  }
  if (tech && model) {
    const techRegex = new RegExp(`^${tech}\\b[\\s-_]+`, 'i');
    if (techRegex.test(model)) {
      model = model.replace(techRegex, '').trim();
    }
  }

  // Susun bagian-bagian
  const parts: string[] = [];
  if (typeName) parts.push(typeName);
  if (isPrinterOrCopier && tech) parts.push(tech);
  if (brandName) parts.push(brandName);
  if (model) parts.push(model);

  const result = parts.filter(Boolean).join(' ').trim();
  return result || cleanString(u.name) || cleanString(u.model) || '-';
}

/**
 * Format nama lengkap produk / consumable / sparepart agar selalu memuat Brand.
 * Contoh: "Canon Toner NPG-59 Black", "Epson Tinta 003 Black"
 */
export function formatProductDisplayName(
  p: any,
  lookups?: { findBrand?: (id: any) => any }
): string {
  if (!p) return '-';
  if (typeof p === 'string') return p.trim() || '-';

  const rawName = cleanString(p.name);
  let brandName = cleanString(p.brand?.name || p.brand_name || (typeof p.brand === 'string' ? p.brand : ''));
  if ((!brandName || brandName === '-') && p.brand_id && lookups?.findBrand) {
    brandName = cleanString(lookups.findBrand(p.brand_id)?.name);
  }
  if (brandName === '-') brandName = '';

  if (!brandName) {
    for (const b of KNOWN_BRANDS) {
      if (containsWord(rawName, b)) {
        brandName = b;
        break;
      }
    }
  }

  if (!brandName) {
    return rawName || '-';
  }

  // Jika nama sudah memuat brand, tidak perlu diduplikasi
  if (containsWord(rawName, brandName)) {
    return rawName;
  }

  return `${brandName} ${rawName}`.trim();
}

