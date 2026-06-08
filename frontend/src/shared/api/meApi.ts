import { api } from "@/shared/api/client";
import type { Candidate, Job, AppMeta, TalentPoolEntry, AuditEntry } from "@/types";

export async function fetchHrState(): Promise<{
  jobs: Job[];
  candidates: Candidate[];
  talentPool: TalentPoolEntry[];
  auditLog: AuditEntry[];
  meta: AppMeta | null;
}> {
  return api("/api/state");
}

export async function saveHrState(payload: {
  jobs: Job[];
  talentPool: TalentPoolEntry[];
  auditLog: AuditEntry[];
}): Promise<void> {
  await api("/api/state", {
    method: "PUT",
    body: JSON.stringify({ ...payload, saveCandidates: false }),
  });
}

export async function fetchCandidateMe(): Promise<Candidate> {
  return api("/api/me");
}

export async function saveCandidateMe(candidate: Candidate): Promise<void> {
  await api("/api/me", {
    method: "PUT",
    body: JSON.stringify({ candidate }),
  });
}
