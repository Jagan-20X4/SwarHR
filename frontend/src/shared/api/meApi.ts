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
  talentPool?: TalentPoolEntry[];
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

export async function sendIntroInterviewEmail(payload: {
  jobId: string;
  applicationId?: number | null;
}): Promise<{ ok?: boolean; skipped?: boolean; reason?: string }> {
  return api("/api/me/interview-email/intro", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function sendScheduledInterviewEmail(payload: {
  jobId: string;
  scheduledAt: string;
  applicationId?: number | null;
}): Promise<{ ok?: boolean; skipped?: boolean; reason?: string }> {
  return api("/api/me/interview-email/scheduled", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function sendCompletionInterviewEmail(payload: {
  jobId: string;
  applicationId?: number | null;
}): Promise<{ ok?: boolean; skipped?: boolean; reason?: string }> {
  return api("/api/me/interview-email/completed", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
