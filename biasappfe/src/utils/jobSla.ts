export const SLA_LIMIT_HOURS = 2;

export function getJobScheduledDate(job: any): string {
  return (
    job?.scheduled_date ||
    job?.delivery_order?.delivery_date ||
    job?.survey?.scheduled_date ||
    job?.service_report?.service_date ||
    job?.created_at ||
    ""
  );
}

export function getJobSlaHours(jobOrDate: any): number {
  const targetStr =
    typeof jobOrDate === "string"
      ? jobOrDate
      : getJobScheduledDate(jobOrDate) || jobOrDate?.created_at;
  if (!targetStr) return 0;
  const target = new Date(targetStr).getTime();
  if (Number.isNaN(target)) return 0;
  return (Date.now() - target) / (1000 * 60 * 60);
}

export function isJobOverSla(job: any): boolean {
  if (!job) return false;
  const status = String(job.status || "").toLowerCase();
  if (status === "completed" || status === "done" || status === "cancelled") {
    return false;
  }
  return getJobSlaHours(job) > SLA_LIMIT_HOURS;
}

export function formatJobSlaLabel(job: any): string {
  const schedStr = getJobScheduledDate(job);
  const targetTime = schedStr
    ? new Date(schedStr).getTime()
    : new Date(job?.created_at || Date.now()).getTime();
  const now = Date.now();
  if (targetTime > now) {
    const diffHours = (targetTime - now) / (1000 * 60 * 60);
    if (diffHours >= 24) {
      return `Jadwal: H-${Math.ceil(diffHours / 24)} hari`;
    }
    return `Jadwal: ${diffHours.toFixed(1)} jam lagi`;
  }
  const hours = (now - targetTime) / (1000 * 60 * 60);
  if (hours > SLA_LIMIT_HOURS) {
    return `Over SLA (+${(hours - SLA_LIMIT_HOURS).toFixed(1)}h)`;
  }
  return `${hours.toFixed(1)}h / ${SLA_LIMIT_HOURS}.0h`;
}
