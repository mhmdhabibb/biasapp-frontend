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
  'Lexmark', 'Dell', 'Lenovo', 'ASUS', 'Asus', 'Acer', 'Apple', 'Hikvision', 'Dahua'
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
  const rawProject = cleanString(u.project_name);
  const rawDesc = cleanString(u.description);
  const combined = `${rawTypeName} ${rawModel} ${rawName} ${rawProject} ${rawDesc}`.toLowerCase();

  const isCopier = Boolean(u.is_copier) ||
    combined.includes('copier') ||
    combined.includes('photocopy') ||
    combined.includes('fotokopi') ||
    combined.includes('fotocopy') ||
    /\b(ir|ir-adv|imagerunner|bizhub|apeosport|docucentre|taskalfa)\b/i.test(combined);

  const isPrinter = !isCopier && (
    Boolean(u.is_printer) ||
    combined.includes('printer') ||
    /\b(laserjet|deskjet|inkjet|ecotank|pixma|stylus|tank|smart\s*tank|l\d{3,4}|dcp-|mfc-|hl-)\b/i.test(combined)
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

  // 2. Cek keyword pada model, nama, project_name, atau spesifikasi
  const combined = `${cleanString(u.model)} ${cleanString(u.name)} ${cleanString(u.project_name)} ${cleanString(u.specs)}`.toLowerCase();
  if (/\blaser\b|\blaserjet\b|\btoner\b/i.test(combined)) return 'Laser';
  if (/\binject\b|\binkjet\b|\bink\s*tank\b|\becotank\b|\bdeskjet\b|\bpixma\b|(\b|_)(l\d{3,4}|l-\w+)\b|\b(t\d{3,4})\b/i.test(combined)) return 'Inject';

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
 * [Item / Tipe Unit] [Laser / Inject jika printer/copier] [Merek / Brand] [Model]
 * Contoh: "Laptop Lenovo Thinkpad KK", "Laptop ASUS Vivobook 990", "Photocopy Machine Inject Epson L44400", "Printer Inject Brother DCP - T888"
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

  const rawHay = `${cleanString(u.model)} ${cleanString(u.name)} ${cleanString(u.project_name)} ${cleanString(u.description)}`;
  const hayLower = rawHay.toLowerCase();

  // Heuristic brand jika belum ada
  if (!brandName) {
    for (const b of KNOWN_BRANDS) {
      if (containsWord(rawHay, b)) {
        brandName = b;
        break;
      }
    }
    if (!brandName) {
      if (/\b(thinkpad|ideapad|legion|yoga|thinkcentre|thinkstation)\b/i.test(rawHay)) {
        brandName = 'Lenovo';
      } else if (/\b(vivobook|zenbook|rog|tuf|expertbook|zephyrus|proart)\b/i.test(rawHay)) {
        brandName = 'ASUS';
      } else if (/\b(latitude|optiplex|vostro|inspiron|precision|xps|alienware)\b/i.test(rawHay)) {
        brandName = 'Dell';
      } else if (/\b(aspire|predator|swift|spin|travelmate|nitro)\b/i.test(rawHay)) {
        brandName = 'Acer';
      } else if (/\b(macbook|imac|mac\s*mini|mac\s*pro|mac\s*studio)\b/i.test(rawHay)) {
        brandName = 'Apple';
      } else if (/\b(l\d{3,4}|ecotank|workforce|stylus|surecolor)\b/i.test(rawHay)) {
        brandName = 'Epson';
      } else if (/\b(imagerunner|ir\s*\d+|ir-adv|pixma|maxify)\b/i.test(rawHay)) {
        brandName = 'Canon';
      } else if (/\b(laserjet|deskjet|pagewide|designjet|officejet)\b/i.test(rawHay)) {
        brandName = 'HP';
      } else if (/\b(bizhub|accutiopress)\b/i.test(rawHay)) {
        brandName = 'Konica Minolta';
      } else if (/\b(docucentre|apeosport)\b/i.test(rawHay)) {
        brandName = 'Fuji Xerox';
      } else if (/\b(taskalfa|ecosys)\b/i.test(rawHay)) {
        brandName = 'Kyocera';
      } else if (/\b(dcp-|mfc-|hl-)\b/i.test(rawHay)) {
        brandName = 'Brother';
      } else if (/\b(hikvision|dahua|ezviz)\b/i.test(rawHay)) {
        brandName = 'Hikvision';
      } else if (/\b(ricoh|gestetner|aficio)\b/i.test(rawHay)) {
        brandName = 'Ricoh';
      }
    }
  }

  // Canonical casing untuk brand
  if (brandName) {
    const known = KNOWN_BRANDS.find((b) => b.toLowerCase() === brandName.toLowerCase());
    if (known) {
      brandName = known;
    } else {
      brandName = brandName
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
  }

  // 2. Type Name (Item / Tipe Unit)
  let typeName = cleanString(u.type?.name || u.unit_type?.name || u.type_name || (typeof u.type === 'string' ? u.type : ''));
  if (!typeName && (u.type_id || u.unit_type_id) && lookups?.findUnitType) {
    typeName = cleanString(lookups.findUnitType(u.type_id || u.unit_type_id)?.name);
  }

  // Normalisasi nama tipe unit
  if (/copier\s*machine/i.test(typeName)) {
    typeName = 'Photocopy Machine';
  } else if (/^komputer$/i.test(typeName)) {
    typeName = 'Computer';
  }

  const { isCopier, isPrinter, isPrinterOrCopier } = isCopierOrPrinter({ ...u, type_name: typeName });
  const tech = resolvePrintTech({ ...u, is_copier: isCopier, type_name: typeName });

  if (!typeName) {
    if (
      /\b(laptop|notebook|vivobook|thinkpad|expertbook|zenbook|rog|ideapad|macbook|latitude|inspiron|vostro|pavilion|probook|elitebook|aspire|travelmate|swift|legion|yoga|zephyrus|tuf)\b/i.test(hayLower) ||
      /\b110-14\w*\b/i.test(hayLower) ||
      /\bx441\w*\b/i.test(hayLower)
    ) {
      typeName = 'Laptop';
    } else if (/\b(cctv|camera|ip\s*cam|dome\s*cam|indoor\s*cam)\b/i.test(hayLower)) {
      typeName = 'CCTV';
    } else if (Boolean(u.is_computer) || /\b(pc|desktop|all-in-one|aio|optiplex|tower|komputer|computer|thinkcentre|prodesk)\b/i.test(hayLower)) {
      typeName = 'Computer';
    } else if (isCopier) {
      typeName = 'Photocopy Machine';
    } else if (isPrinter) {
      typeName = 'Printer';
    } else if (/\b(server|poweredge|proliant)\b/i.test(hayLower)) {
      typeName = 'Server';
    } else if (/\b(scanner|scansnap)\b/i.test(hayLower)) {
      typeName = 'Scanner';
    }
  }

  // 3. Model
  let model = cleanString(u.model);
  if (!model) {
    model = cleanString(u.name);
  }

  // 4. Bersihkan duplikasi typeName, tech, brandName di awal model (sembarang urutan)
  let changed = true;
  while (changed && model) {
    changed = false;
    if (typeName) {
      const typeRegex = new RegExp(`^${typeName}\\b[\\s-_]*`, 'i');
      if (typeRegex.test(model)) {
        model = model.replace(typeRegex, '').trim();
        changed = true;
      }
    }
    // Jika typeName adalah Photocopy Machine, bersihkan variasi kata copier / photocopy
    if (typeName === 'Photocopy Machine') {
      const copierRegex = /^(photocopy\s*machine|copier\s*machine|copier|photocopy|fotocopy|fotokopi)\b[\s-_]*/i;
      if (copierRegex.test(model)) {
        model = model.replace(copierRegex, '').trim();
        changed = true;
      }
    }
    if (tech) {
      const techRegex = new RegExp(`^${tech}\\b[\\s-_]*`, 'i');
      if (techRegex.test(model)) {
        model = model.replace(techRegex, '').trim();
        changed = true;
      }
    }
    if (brandName) {
      const brandRegex = new RegExp(`^${brandName}\\b[\\s-_]*`, 'i');
      if (brandRegex.test(model)) {
        model = model.replace(brandRegex, '').trim();
        changed = true;
      }
    }
  }

  // Susun bagian-bagian: [Item / Tipe Unit] [Laser/Inject jika printer/copier] [Merek / Brand] [Model]
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

