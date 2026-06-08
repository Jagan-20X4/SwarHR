import { api } from "@/shared/api/client";
import type { Job, AppMeta } from "@/types";

export async function fetchJobs(): Promise<{ jobs: Job[]; meta: AppMeta | null }> {
  return api("/api/jobs");
}

export async function deleteJob(id: string): Promise<void> {
  await api(`/api/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
}
