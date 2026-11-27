import { resources } from "@/services/resource.service";
import type {
  CustomerTrackingResponse,
  TrackedActivityItem,
  TrackedCustomerSummary,
} from "@/types";
import { formatUnitDisplayName } from "@/utils/format";

async function safeList(
  loader: () => Promise<{ data?: any[] }>,
): Promise<any[]> {
  try {
    const res = await loader();
    return Array.isArray(res?.data) ? res.data : [];
  } catch {
    return [];
  }
}

function isActiveRentalOrContract(relType: string, status: string): boolean {
  if (relType !== "rental" && relType !== "contract") return false;
  const s = (status || "").toLowerCase().trim();
  return s === "active" || s === "ongoing" || s === "running";
}

function isGoodsRelation(relType: string): boolean {
  return (
    relType === "sale" || relType === "rental" || relType === "service_sparepart"
  );
}

function toTimestamp(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const ms = new Date(dateStr).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function deliveryOrderRelationLabel(doType?: string): string {
  switch ((doType || "").toLowerCase().trim()) {
    case "service":
      return "Service History";
    case "return":
      return "Penarikan Unit (Return)";
    case "replacement":
      return "Penggantian Unit";
    default:
      return "Surat Jalan";
  }
}

/**
 * Fallback client-side aggregator when the dedicated `/customer-tracking` endpoint
 * is not yet available on the target API server (HTTP 404/405).
 */
export async function buildClientFallbackTracking(
  targetKind: "unit" | "product",
  item: any,
  displayTitle: string,
): Promise<CustomerTrackingResponse> {
  const targetId = String(item.id);
  const query = { page: 1, limit: 1000 };

  const [
    customers,
    units,
    rents,
    contractItems,
    contracts,
    sales,
    salesInvoices,
    deliveryOrders,
    serviceReports,
    serviceRequests,
    serviceSpareparts,
    warranties,
    surveys,
    purchaseOrders,
  ] = await Promise.all([
    safeList(() => resources.customers.list(query, false, true)),
    safeList(() => resources.units.list(query, false, true)),
    safeList(() => resources.rents.list(query, false, true)),
    safeList(() => resources.contractItems.list(query, false, true)),
    safeList(() => resources.contracts.list(query, false, true)),
    safeList(() => resources.sales.list(query, false, true)),
    safeList(() => resources.salesInvoices.list(query, false, true)),
    safeList(() => resources.deliveryOrders.list(query, false, true)),
    safeList(() => resources.serviceReports.list(query, false, true)),
    safeList(() => resources.serviceRequests.list(query, false, true)),
    safeList(() => resources.serviceSpareparts.list(query, false, true)),
    safeList(() => resources.warranties.list(query, false, true)),
    safeList(() => resources.surveys.list(query, false, true)),
    safeList(() => resources.purchaseOrders.list(query, false, true)),
  ]);

  const customerMap = new Map<string, any>();
  for (const c of customers) {
    if (c?.id) customerMap.set(String(c.id), c);
  }
  const unitMap = new Map<string, any>();
  for (const u of units) {
    if (u?.id) unitMap.set(String(u.id), u);
  }
  const srMap = new Map<string, any>();
  for (const sr of serviceReports) {
    if (sr?.id) srMap.set(String(sr.id), sr);
  }
  const saleMap = new Map<string, any>();
  for (const s of sales) {
    if (s?.id) saleMap.set(String(s.id), s);
  }
  const rentMap = new Map<string, any>();
  for (const r of rents) {
    if (r?.id) rentMap.set(String(r.id), r);
  }
  const contractMap = new Map<string, any>();
  for (const ct of contracts) {
    if (ct?.id) contractMap.set(String(ct.id), ct);
  }
  const spMap = new Map<string, any>();
  for (const sp of serviceSpareparts) {
    if (sp?.id) spMap.set(String(sp.id), sp);
  }

  const activities: TrackedActivityItem[] = [];
  const seenRowIds = new Set<string>();

  const pushActivity = (
    customerIdRaw: any,
    customerObj: any,
    entry: Omit<
      TrackedActivityItem,
      "customer_id" | "company_name" | "customer_category"
    >,
  ) => {
    const cid = customerIdRaw ? String(customerIdRaw) : "";
    if (!cid) return;
    if (seenRowIds.has(entry.id)) return;
    seenRowIds.add(entry.id);

    const c = customerObj || customerMap.get(cid);
    if (c && !customerMap.has(cid)) {
      customerMap.set(cid, c);
    }
    const companyName = String(
      c?.company_name || c?.name || `Customer (${cid})`,
    ).trim();
    const customerCat = String(c?.category || "").trim();

    activities.push({
      ...entry,
      customer_id: cid,
      company_name: companyName,
      customer_category: customerCat,
      qty: entry.qty > 0 ? entry.qty : 1,
    });
  };

  // 1. Rentals
  for (const r of rents) {
    const rItems = r.rental_items || r.items || [];
    for (let idx = 0; idx < rItems.length; idx++) {
      const ri = rItems[idx];
      const match =
        targetKind === "unit"
          ? String(ri.unit_id || "") === targetId
          : String(ri.product_id || "") === targetId;
      if (!match) continue;
      pushActivity(r.customer_id, r.customer, {
        id: `rental:${ri.id || `${r.id}_${idx}`}`,
        relation_type: "rental",
        relation_label: "Sewa / Rental",
        ref_no: r.rental_no || "",
        record_id: String(r.id),
        date: r.start_date || r.date || r.created_at || null,
        end_date: r.end_date || null,
        status: String(r.status || ""),
        qty: Number(ri.qty || 1),
        unit_price: Number(ri.monthly_rent || 0),
        location: String(
          ri.placement_location || r.installation_address || "",
        ).trim(),
        notes: String(ri.description || r.notes || "").trim(),
      });
    }
  }

  // 2. Contracts (unit only)
  if (targetKind === "unit") {
    for (const ci of contractItems) {
      if (String(ci.unit_id || "") !== targetId) continue;
      const parentContract =
        ci.contract || contractMap.get(String(ci.contract_id || ""));
      const cid = ci.customer_id || parentContract?.customer_id;
      pushActivity(cid, ci.customer || parentContract?.customer, {
        id: `contract:${ci.id}`,
        relation_type: "contract",
        relation_label: "Kontrak",
        ref_no: ci.contract_no || parentContract?.contract_no || "",
        record_id: String(ci.contract_id || ci.id),
        date: ci.start_date || parentContract?.start_date || ci.created_at || null,
        end_date: ci.end_date || parentContract?.end_date || null,
        status: String(ci.status || parentContract?.status || ""),
        qty: 1,
        unit_price: Number(ci.monthly_rent_fee || 0),
        location: String(ci.placement_location || "").trim(),
        notes: String(parentContract?.terms_notes || "").trim(),
      });
    }
    for (const ct of contracts) {
      const cItems = ct.contract_items || [];
      for (const ci of cItems) {
        if (String(ci.unit_id || "") !== targetId) continue;
        pushActivity(ct.customer_id, ct.customer, {
          id: `contract:${ci.id}`,
          relation_type: "contract",
          relation_label: "Kontrak",
          ref_no: ct.contract_no || "",
          record_id: String(ct.id),
          date: ct.start_date || ct.created_at || null,
          end_date: ct.end_date || null,
          status: String(ct.status || ""),
          qty: 1,
          unit_price: Number(ci.monthly_rent_fee || 0),
          location: String(ci.placement_location || "").trim(),
          notes: String(ct.terms_notes || "").trim(),
        });
      }
    }
  }

  // 3. Sales
  for (const s of sales) {
    const sItems = s.sale_items || s.items || [];
    for (let idx = 0; idx < sItems.length; idx++) {
      const si = sItems[idx];
      const match =
        targetKind === "unit"
          ? String(si.unit_id || "") === targetId
          : String(si.product_id || "") === targetId;
      if (!match) continue;
      pushActivity(s.customer_id, s.customer, {
        id: `sale:${si.id || `${s.id}_${idx}`}`,
        relation_type: "sale",
        relation_label: "Penjualan / Dibeli",
        ref_no: s.sale_no || "",
        record_id: String(s.id),
        date: s.date || s.sale_date || s.created_at || null,
        end_date: null,
        status: String(s.status || ""),
        qty: Number(si.qty || 1),
        unit_price: Number(si.price || 0),
        location: String(s.installation_address || "").trim(),
        notes: String(si.description || "").trim(),
      });
    }
  }

  // 4. Sales Invoices
  for (const inv of salesInvoices) {
    const iItems = inv.items || inv.sales_invoice_items || [];
    for (let idx = 0; idx < iItems.length; idx++) {
      const sii = iItems[idx];
      const match =
        targetKind === "unit"
          ? String(sii.unit_id || "") === targetId
          : String(sii.product_id || "") === targetId;
      if (!match) continue;
      pushActivity(inv.customer_id, inv.customer, {
        id: `sales_invoice:${sii.id || `${inv.id}_${idx}`}`,
        relation_type: "sales_invoice",
        relation_label: "Invoice Penjualan",
        ref_no: inv.invoice_no || "",
        record_id: String(inv.id),
        date: inv.invoice_date || inv.created_at || null,
        end_date: inv.due_date || null,
        status: String(inv.payment_status || inv.status || ""),
        qty: Number(sii.qty || 1),
        unit_price: Number(sii.price || 0),
        notes: String(inv.notes || "").trim(),
      });
    }
  }

  // 5. Delivery Orders
  for (const d of deliveryOrders) {
    if (!d?.customer_id) continue;
    const dItems = d.delivery_order_items || [];
    for (let idx = 0; idx < dItems.length; idx++) {
      const doi = dItems[idx];
      const match =
        targetKind === "unit"
          ? String(doi.unit_id || "") === targetId
          : String(doi.product_id || "") === targetId;
      if (!match) continue;
      pushActivity(d.customer_id, d.customer, {
        id: `delivery_order:${doi.id || `${d.id}_${idx}`}`,
        relation_type: "delivery_order",
        relation_label: deliveryOrderRelationLabel(d.do_type),
        ref_no: d.do_number || "",
        record_id: String(d.id),
        date: d.delivery_date || d.created_at || null,
        end_date: null,
        status: String(d.status || ""),
        qty: Number(doi.qty || 1),
        location: String(doi.delivery_address || d.delivery_address || "").trim(),
        technician: String(
          d.technician_name || d.technician?.user?.name || d.technician?.name || "",
        ).trim(),
        notes: String(d.action || d.problem || doi.remarks || d.notes || "").trim(),
      });
    }
  }

  // 6. Service Reports & Service Requests & Surveys (unit)
  if (targetKind === "unit") {
    for (const sr of serviceReports) {
      if (String(sr.unit_id || "") !== targetId) continue;
      pushActivity(sr.customer_id, sr.customer, {
        id: `service_report:${sr.id}`,
        relation_type: "service_report",
        relation_label: "Service Report",
        ref_no: sr.report_no || "",
        record_id: String(sr.id),
        date: sr.service_date || sr.created_at || null,
        end_date: null,
        status: String(sr.status || ""),
        qty: 1,
        location: String(sr.project_name || "").trim(),
        technician: String(
          sr.technician_name ||
            sr.technician_name_copier ||
            sr.technician_name_technical ||
            sr.technician?.user?.name ||
            sr.technician?.name ||
            "",
        ).trim(),
        notes: String(
          sr.machine_problem || sr.repair_action || sr.remarks || "",
        ).trim(),
      });
    }

    for (const srq of serviceRequests) {
      if (String(srq.unit_id || "") !== targetId) continue;
      pushActivity(srq.customer_id, srq.customer, {
        id: `service_request:${srq.id}`,
        relation_type: "service_request",
        relation_label: "Service Request",
        ref_no: srq.request_no || "",
        record_id: String(srq.id),
        date: srq.request_date || srq.created_at || null,
        end_date: null,
        status: String(srq.status || ""),
        qty: 1,
        location: String(srq.project_name || "").trim(),
        notes: String(srq.problem_description || "").trim(),
      });
    }

    for (const sv of surveys) {
      if (String(sv.unit_id || "") !== targetId) continue;
      pushActivity(sv.customer_id, sv.customer, {
        id: `survey:${sv.id}`,
        relation_type: "survey",
        relation_label: "Survey",
        ref_no: sv.survey_no || "",
        record_id: String(sv.id),
        date: sv.scheduled_date || sv.created_at || null,
        end_date: null,
        status: String(sv.status || ""),
        qty: 1,
        location: String(sv.survey_address || "").trim(),
        technician: String(
          sv.technician?.user?.name || sv.technician?.name || "",
        ).trim(),
        notes: String(sv.remarks || sv.technician_notes || "").trim(),
      });
    }
  }

  // 7. Service Spareparts
  for (const sp of serviceSpareparts) {
    const linkedSr = sp.service_report_id
      ? srMap.get(String(sp.service_report_id))
      : null;
    const match =
      targetKind === "unit"
        ? String(sp.unit_id || "") === targetId ||
          String(linkedSr?.unit_id || "") === targetId
        : String(sp.product_id || "") === targetId;
    if (!match) continue;

    const linkedSale = sp.sale_id ? saleMap.get(String(sp.sale_id)) : null;
    const linkedRent = sp.rental_id ? rentMap.get(String(sp.rental_id)) : null;
    const cid =
      sp.customer_id ||
      sp.service_report?.customer_id ||
      linkedSr?.customer_id ||
      sp.sale?.customer_id ||
      linkedSale?.customer_id ||
      sp.rental?.customer_id ||
      linkedRent?.customer_id;
    const custObj =
      sp.customer ||
      sp.service_report?.customer ||
      linkedSr?.customer ||
      sp.sale?.customer ||
      linkedSale?.customer ||
      sp.rental?.customer ||
      linkedRent?.customer;

    const u =
      sp.unit ||
      unitMap.get(String(sp.unit_id || linkedSr?.unit_id || "")) ||
      linkedSr?.unit;
    const relatedUnit =
      targetKind === "product" && u
        ? `${formatUnitDisplayName(u)}${u.serial_no ? ` (SN: ${u.serial_no})` : ""}`
        : "";

    const notes =
      targetKind === "unit"
        ? [sp.product?.name || sp.item_name || "", sp.notes || ""]
            .filter(Boolean)
            .join(" — ")
        : String(sp.notes || "").trim();

    pushActivity(cid, custObj, {
      id: `service_sparepart:${sp.id}`,
      relation_type: "service_sparepart",
      relation_label: "Request Sparepart",
      ref_no: sp.request_no || "",
      record_id: String(sp.id),
      date: sp.created_at || null,
      end_date: null,
      status: String(sp.status || ""),
      qty: Number(sp.qty || 1),
      location: String(sp.service_report?.report_no || linkedSr?.report_no || "").trim(),
      technician: String(
        sp.technician?.user?.name || sp.technician?.name || "",
      ).trim(),
      related_unit: relatedUnit,
      notes,
    });
  }

  // 8. Warranties
  for (const w of warranties) {
    const match =
      targetKind === "unit"
        ? String(w.unit_id || "") === targetId
        : String(w.product_id || "") === targetId;
    if (!match) continue;
    pushActivity(w.customer_id, w.customer, {
      id: `warranty:${w.id}`,
      relation_type: "warranty",
      relation_label: "Garansi",
      ref_no: w.warranty_no || "",
      record_id: String(w.id),
      date: w.start_date || w.created_at || null,
      end_date: w.end_date || null,
      status: String(w.status || ""),
      qty: 1,
      notes: String(w.terms_conditions || "").trim(),
    });
  }

  // 9. Purchase Orders
  for (const po of purchaseOrders) {
    const linkedSr = po.service_report_id
      ? srMap.get(String(po.service_report_id))
      : null;
    const linkedSp = po.sparepart_request_id
      ? spMap.get(String(po.sparepart_request_id))
      : null;
    const cid =
      po.customer_id ||
      po.service_report?.customer_id ||
      linkedSr?.customer_id ||
      linkedSp?.customer_id;
    const custObj =
      po.customer || po.service_report?.customer || linkedSr?.customer;

    if (targetKind === "unit") {
      if (String(po.unit_id || "") !== targetId) continue;
      pushActivity(cid, custObj, {
        id: `purchase_order:${po.id}`,
        relation_type: "purchase_order",
        relation_label: "PO / MRF",
        ref_no: po.po_no || "",
        record_id: String(po.id),
        date: po.order_date || po.created_at || null,
        end_date: null,
        status: String(po.status || ""),
        qty: 1,
        unit_price: Number(po.total_amount || 0),
        location: String(po.department || "").trim(),
        notes: String(po.reason || po.special_notes || "").trim(),
      });
    } else {
      const pItems = po.purchase_order_items || [];
      for (let idx = 0; idx < pItems.length; idx++) {
        const poi = pItems[idx];
        if (String(poi.product_id || "") !== targetId) continue;
        pushActivity(cid, custObj, {
          id: `purchase_order:${poi.id || `${po.id}_${idx}`}`,
          relation_type: "purchase_order",
          relation_label: "PO / MRF",
          ref_no: po.po_no || "",
          record_id: String(po.id),
          date: po.order_date || po.created_at || null,
          end_date: null,
          status: String(po.status || ""),
          qty: Number(poi.qty || 1),
          unit_price: Number(poi.unit_price || 0),
          location: String(po.department || "").trim(),
          notes: String(poi.purpose || po.reason || po.special_notes || "").trim(),
        });
      }
    }
  }

  activities.sort((a, b) => {
    const diff = toTimestamp(b.date) - toTimestamp(a.date);
    if (diff !== 0) return diff;
    return (a.ref_no || "").localeCompare(b.ref_no || "");
  });

  let totalQty = 0;
  const custAcc = new Map<string, TrackedCustomerSummary>();
  for (const act of activities) {
    if (isGoodsRelation(act.relation_type)) {
      totalQty += act.qty;
    }
    let summary = custAcc.get(act.customer_id);
    if (!summary) {
      const c = customerMap.get(act.customer_id);
      summary = {
        customer_id: act.customer_id,
        company_name: act.company_name,
        category: act.customer_category,
        pic_name: String(c?.pic_name || ""),
        phone: String(c?.phone || ""),
        email: String(c?.email || ""),
        address: String(c?.address || ""),
        relation_types: [],
        relation_labels: [],
        activity_count: 0,
        total_qty: 0,
        latest_status: "",
        latest_ref_no: "",
        latest_location: "",
        first_interaction: null,
        last_interaction: null,
        is_currently_active: false,
      };
      custAcc.set(act.customer_id, summary);
    }

    summary.activity_count++;
    if (isGoodsRelation(act.relation_type)) {
      summary.total_qty += act.qty;
    }
    if (isActiveRentalOrContract(act.relation_type, act.status)) {
      summary.is_currently_active = true;
    }
    if (act.relation_type && !summary.relation_types.includes(act.relation_type)) {
      summary.relation_types.push(act.relation_type);
      summary.relation_labels.push(act.relation_label);
    }
    if (act.date) {
      const ms = toTimestamp(act.date);
      if (ms > 0) {
        if (
          !summary.first_interaction ||
          ms < toTimestamp(summary.first_interaction)
        ) {
          summary.first_interaction = act.date;
        }
        if (
          !summary.last_interaction ||
          ms > toTimestamp(summary.last_interaction)
        ) {
          summary.last_interaction = act.date;
        }
      }
    }
    if (!summary.latest_ref_no && act.ref_no) summary.latest_ref_no = act.ref_no;
    if (!summary.latest_status && act.status) summary.latest_status = act.status;
    if (!summary.latest_location && act.location) {
      summary.latest_location = act.location;
    }
  }

  const summaries = Array.from(custAcc.values()).sort((a, b) => {
    if (a.is_currently_active !== b.is_currently_active) {
      return a.is_currently_active ? -1 : 1;
    }
    const diff =
      toTimestamp(b.last_interaction) - toTimestamp(a.last_interaction);
    if (diff !== 0) return diff;
    return a.company_name.localeCompare(b.company_name);
  });

  return {
    target_kind: targetKind,
    target_id: targetId,
    target_name: displayTitle,
    target_code:
      targetKind === "unit"
        ? String(item.serial_no || "")
        : String(item.sku || ""),
    total_customers: summaries.length,
    total_activities: activities.length,
    total_qty: totalQty,
    customers: summaries,
    activities,
  };
}
