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

export function toLocalDateTimeInput(val?: string | Date | null): string {
  const d = val ? new Date(val) : new Date();
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${safe.getFullYear()}-${pad(safe.getMonth() + 1)}-${pad(safe.getDate())}T${pad(safe.getHours())}:${pad(safe.getMinutes())}`;
}

export function resolveTechDisplayName(
  techId: string | number | null | undefined,
  findTechnician: (id: any) => any,
  techObj?: any,
): string {
  if (techObj?.user?.name) return techObj.user.name;
  if (techObj?.name) return techObj.name;
  if (!techId) return "";
  const t = findTechnician(techId);
  return t?.user?.name || t?.name || "";
}

export function getAssignedTeamDisplay(
  jobOrRow: any,
  findTechnician: (id: any) => any,
): { leadName: string; memberNames: string[] } {
  if (!jobOrRow) return { leadName: "", memberNames: [] };
  const leadName = resolveTechDisplayName(
    jobOrRow.technician_id,
    findTechnician,
    jobOrRow.technician,
  );
  const memberIds = getJobMemberTechIds(jobOrRow);
  const memberNames = memberIds
    .map((id) => resolveTechDisplayName(id, findTechnician))
    .filter(Boolean);
  return { leadName, memberNames };
}
