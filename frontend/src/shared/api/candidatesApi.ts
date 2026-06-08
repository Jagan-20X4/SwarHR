// @ts-nocheck
import { apiFetchInit } from "@/shared/lib/authStorage";

export async function fetchCandidateStats() {
  const r = await fetch("/api/candidates/stats", apiFetchInit());
  if (!r.ok) throw new Error("stats");
  return r.json();
}

export async function fetchCandidatesPage({
  page = 1,
  limit = 50,
  cursor,
  status,
  search,
  consentOnly,
  includeCvText,
} = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (cursor) q.set("cursor", cursor);
  if (status) q.set("status", status);
  if (search) q.set("search", search);
  if (consentOnly) q.set("consentOnly", "true");
  if (includeCvText) q.set("includeCvText", "true");
  const r = await fetch(`/api/candidates?${q}`, apiFetchInit());
  if (!r.ok) throw new Error("list");
  return r.json();
}

export async function fetchAllConsentedWithCv({ limit = 100 } = {}) {
  const all = [];
  let cursor;
  let guard = 0;
  do {
    const out = await fetchCandidatesPage({
      page: 1,
      limit,
      cursor,
      consentOnly: true,
      includeCvText: true,
    });
    all.push(...(out.candidates || []));
    cursor = out.nextCursor;
    guard += 1;
  } while (cursor && guard < 20);
  return all.filter((c) => c.jobId && c.cv);
}

export async function fetchCandidateById(id) {
  const r = await fetch(
    `/api/candidates/${encodeURIComponent(id)}`,
    apiFetchInit(),
  );
  if (!r.ok) throw new Error("candidate");
  return r.json();
}

export async function patchCandidateById(id, candidate) {
  const r = await fetch(
    `/api/candidates/${encodeURIComponent(id)}`,
    apiFetchInit({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate }),
    }),
  );
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "patch");
  }
  return r.json();
}

export async function bulkUpdateCandidateStatus(updates) {
  const r = await fetch(
    "/api/candidates/bulk-status",
    apiFetchInit({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    }),
  );
  if (!r.ok) throw new Error("bulk-status");
  return r.json();
}

export async function mapTalentPoolToJob(talentPoolId, jobId) {
  const r = await fetch(
    "/api/candidates/map-talent-pool",
    apiFetchInit({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ talentPoolId, jobId }),
    }),
  );
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "map");
  }
  return r.json();
}

export async function hrResetCandidatePassword(candidateId, newPassword) {
  const r = await fetch(
    `/api/candidates/${encodeURIComponent(candidateId)}/reset-password`,
    apiFetchInit({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    }),
  );
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "reset-password");
  }
  return r.json();
}

export async function findCandidateIdByEmail(email) {
  const q = new URLSearchParams({ email });
  const r = await fetch(`/api/candidates/by-email?${q}`, apiFetchInit());
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("by-email");
  const j = await r.json();
  return j.id;
}
