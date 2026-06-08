import type { ApplicationRecord } from "@/types";

export function getLatestAppForJob(
  history: ApplicationRecord[] | undefined,
  jobId: string,
): ApplicationRecord | null {
  const past = (history || []).filter((a) => a.jobId === jobId);
  if (past.length === 0) return null;
  return [...past].sort(
    (a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime(),
  )[0];
}

export function patchLatestApp(
  history: ApplicationRecord[] | undefined,
  jobId: string,
  patch: Partial<ApplicationRecord>,
): ApplicationRecord[] {
  const h = [...(history || [])];
  let bestI = -1;
  let bestT = 0;
  h.forEach((a, i) => {
    if (a.jobId !== jobId) return;
    const t = new Date(a.appliedAt).getTime();
    if (t >= bestT) {
      bestT = t;
      bestI = i;
    }
  });
  if (bestI < 0) return history || [];
  h[bestI] = { ...h[bestI], ...patch };
  return h;
}

export function patchApplicationById(
  history: ApplicationRecord[] | undefined,
  applicationId: number,
  patch: Partial<ApplicationRecord>,
): ApplicationRecord[] {
  if (!Array.isArray(history) || applicationId == null) return history || [];
  return history.map((row) =>
    row.applicationId === applicationId ? { ...row, ...patch } : row,
  );
}
