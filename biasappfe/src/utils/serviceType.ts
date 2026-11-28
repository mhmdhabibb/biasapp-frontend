export const SERVICE_REQUEST_TYPE_OPTIONS = [
  { value: "preventif", label: "Preventif" },
  { value: "korektif", label: "Korektif" },
  { value: "troubleshooting", label: "Troubleshooting" },
] as const;

export const SERVICE_TYPE_LABELS: Record<string, string> = {
  preventif: "Preventif",
  korektif: "Korektif",
  troubleshooting: "Troubleshooting",
  preventive: "Preventive",
  corrective: "Corrective",
  regular: "Regular",
  repair: "Repair",
  maintenance: "Maintenance",
  installation: "Installation",
  emergency: "Emergency",
  meter_reading: "Meter Reading",
  copier: "Copier",
  delivery: "Delivery",
  relocation: "Relocation",
};

export function formatServiceTypeLabel(type?: string | null): string {
  const key = String(type || "").trim().toLowerCase();
  if (!key) return "-";
  return (
    SERVICE_TYPE_LABELS[key] ||
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function getServiceTypeBadgeClass(type?: string | null): string {
  const key = String(type || "").trim().toLowerCase();
  if (key === "preventif" || key === "preventive" || key === "maintenance") {
    return "badge-success";
  }
  if (key === "troubleshooting" || key === "emergency") {
    return "badge-danger";
  }
  if (key === "korektif" || key === "corrective" || key === "repair") {
    return "badge-warning";
  }
  if (key === "copier" || key === "delivery" || key === "installation") {
    return "badge-info";
  }
  return "badge-secondary";
}
