export function getJobMemberTechIds(job: any): string[] {
  if (!job) return [];
  const leadId = String(job.technician_id || "");
  const ids = new Set<string>();
  if (Array.isArray(job.member_technician_ids)) {
    for (const id of job.member_technician_ids) {
      if (id && String(id) !== leadId) ids.add(String(id));
    }
  }
  if (Array.isArray(job.job_order_technicians)) {
    for (const jt of job.job_order_technicians) {
      if (
        jt?.role === "member" &&
        jt.technician_id &&
        String(jt.technician_id) !== leadId
      ) {
        ids.add(String(jt.technician_id));
      }
    }
  }
  return Array.from(ids);
}

export function isTechnicianAssignedToJob(
  job: any,
  techId: string | number | null | undefined,
): boolean {
  if (!job || !techId) return false;
  const tid = String(techId);
  if (String(job.technician_id || "") === tid) return true;
  if (String(job.technician?.id || "") === tid) return true;
  return getJobMemberTechIds(job).includes(tid);
}

export function isLeadTechnicianForJob(
  job: any,
  techId: string | number | null | undefined,
): boolean {
  if (!job || !techId) return false;
  if (!job.technician_id) return true;
  return String(job.technician_id) === String(techId);
}

export function isMemberTechnicianForJob(
  job: any,
  techId: string | number | null | undefined,
): boolean {
  if (!job || !techId) return false;
  const tid = String(techId);
  const leadId = String(job.technician_id || "");
  if (leadId === tid) return false;
  return getJobMemberTechIds(job).includes(tid);
}
