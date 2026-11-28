export type DeliveryOrderItemKind = 'unit' | 'unit_manual' | 'product' | 'product_manual'

export interface DeliveryOrderItemLookups {
  findUnit?: (id: any) => any
  findProduct?: (id: any) => any
  findBrand?: (id: any) => any
  findUnitType?: (id: any) => any
}

/**
 * Determine whether a delivery order item represents a unit (DB or manual)
 * or a product/consumable/sparepart (DB or manual).
 *
 * Manual products store their name in `description` (and have no `unit_type_id`),
 * while manual units leave `description` empty and store model/SN in `model`/`serial_no`.
 */
export function resolveDeliveryOrderItemKind(it: any): DeliveryOrderItemKind {
  if (!it) return 'unit_manual'
  if (it.unit_id) return 'unit'
  if (it.product_id) return 'product'
  if (it.description && !it.unit_type_id) return 'product_manual'
  return 'unit_manual'
}

/**
 * Returns true when an unlinked delivery order item (no `unit_id`/`product_id`)
 * represents a manual product/sparepart rather than a manual/external unit.
 */
export function isManualProductItem(it: any): boolean {
  return resolveDeliveryOrderItemKind(it) === 'product_manual'
}

/**
 * Human-readable badge metadata for a delivery order item.
 */
export function getDeliveryOrderItemBadge(it: any): { label: string; isUnit: boolean; isManual: boolean } {
  const kind = resolveDeliveryOrderItemKind(it)
  switch (kind) {
    case 'unit':
      return { label: 'Unit', isUnit: true, isManual: false }
    case 'unit_manual':
      return { label: 'Unit (Manual)', isUnit: true, isManual: true }
    case 'product':
      return { label: 'Produk', isUnit: false, isManual: false }
    case 'product_manual':
      return { label: 'Produk (Manual)', isUnit: false, isManual: true }
  }
}

function prefixWithoutDuplicate(prefix: string, text: string): string {
  const p = prefix.trim()
  const t = text.trim()
  if (!p) return t
  if (!t) return p
  if (t.toLowerCase().includes(p.toLowerCase())) return t
  return `${p} ${t}`
}

/**
 * Formats a single delivery order item into a readable label,
 * supporting DB units/products as well as manual units/products.
 */
export function formatDeliveryOrderItemLabel(
  it: any,
  lookups: DeliveryOrderItemLookups = {},
  options: { includeQty?: boolean } = {},
): string {
  if (!it) return '-'
  const kind = resolveDeliveryOrderItemKind(it)
  let baseLabel = ''

  if (kind === 'unit') {
    const storeUnit = lookups.findUnit?.(it.unit_id)
    const u = it.unit ? { ...(storeUnit || {}), ...it.unit } : storeUnit
    if (u) {
      const brand = u.brand || (u.brand_id ? lookups.findBrand?.(u.brand_id) : null)
      const nameCore = prefixWithoutDuplicate(brand?.name || '', u.model || u.name || 'Unit')
      const sn = u.serial_no || it.serial_no
      baseLabel = sn ? `${nameCore} (${sn})` : nameCore
    } else {
      const nameCore = it.model || 'Unit'
      baseLabel = it.serial_no ? `${nameCore} (${it.serial_no})` : nameCore
    }
  } else if (kind === 'product') {
    const storeProd = lookups.findProduct?.(it.product_id)
    const p = it.product ? { ...(storeProd || {}), ...it.product } : storeProd
    const nameCore = p?.name || it.description || it.model || 'Product'
    baseLabel = it.serial_no ? `${nameCore} (${it.serial_no})` : nameCore
  } else {
    const brand = it.brand || (it.brand_id ? lookups.findBrand?.(it.brand_id) : null)
    const unitType = it.unit_type || (it.unit_type_id ? lookups.findUnitType?.(it.unit_type_id) : null)
    const rawName = (kind === 'product_manual' ? (it.description || it.model || '') : (it.model || it.description || '')).trim()
    let combined = rawName
    if (brand?.name) {
      combined = prefixWithoutDuplicate(brand.name, combined)
    }
    if (kind === 'unit_manual' && unitType?.name && !combined.toLowerCase().includes(unitType.name.toLowerCase())) {
      combined = combined ? `${unitType.name} ${combined}` : unitType.name
    }
    if (!combined) {
      combined = kind === 'product_manual' ? 'Produk Manual' : 'Unit Manual'
    }
    baseLabel = it.serial_no ? `${combined} (${it.serial_no})` : combined
  }

  if (options.includeQty && Number(it.qty) > 1) {
    return `${baseLabel} x${it.qty}`
  }
  return baseLabel || '-'
}

/**
 * Joins all items in a delivery order row into a compact comma-separated summary string.
 */
export function formatDeliveryOrderItemsSummary(
  row: any,
  lookups: DeliveryOrderItemLookups = {},
  emptyText = '-',
): string {
  const items = row?.delivery_order_items || []
  if (!items.length) return emptyText
  return items
    .map((it: any) => formatDeliveryOrderItemLabel(it, lookups, { includeQty: true }))
    .join(', ')
}
