// @ts-nocheck
import { apiFetchInit } from "@/shared/lib/authStorage";

export async function fetchTalentPoolStats() {
  const r = await fetch("/api/talent-pool/stats", apiFetchInit());
  if (!r.ok) throw new Error("stats");
  return r.json();
}

export async function fetchTalentPoolPage({
  page = 1,
  limit = 50,
  cursor,
  role,
  skill,
  minExp,
  maxExp,
  location,
  source,
  keyword,
  fromDate,
  toDate,
} = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (cursor) q.set("cursor", cursor);
  if (role) q.set("role", role);
  if (skill) q.set("skill", skill);
  if (minExp !== "" && minExp != null) q.set("minExp", String(minExp));
  if (maxExp !== "" && maxExp != null) q.set("maxExp", String(maxExp));
  if (location) q.set("location", location);
  if (source) q.set("source", source);
  if (keyword) q.set("keyword", keyword);
  if (fromDate) q.set("fromDate", fromDate);
  if (toDate) q.set("toDate", toDate);
  const r = await fetch(`/api/talent-pool?${q}`, apiFetchInit());
  if (!r.ok) throw new Error("list");
  return r.json();
}

export async function fetchTalentPoolById(id) {
  const r = await fetch(
    `/api/talent-pool/${encodeURIComponent(id)}`,
    apiFetchInit(),
  );
  if (!r.ok) throw new Error("detail");
  return r.json();
}

export async function exportTalentPoolReport({
  role,
  skill,
  minExp,
  maxExp,
  location,
  source,
  keyword,
  fromDate,
  toDate,
} = {}) {
  const q = new URLSearchParams();
  if (role) q.set("role", role);
  if (skill) q.set("skill", skill);
  if (minExp !== "" && minExp != null) q.set("minExp", String(minExp));
  if (maxExp !== "" && maxExp != null) q.set("maxExp", String(maxExp));
  if (location) q.set("location", location);
  if (source) q.set("source", source);
  if (keyword) q.set("keyword", keyword);
  if (fromDate) q.set("fromDate", fromDate);
  if (toDate) q.set("toDate", toDate);
  const r = await fetch(`/api/talent-pool/export?${q}`, apiFetchInit());
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "export");
  }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `talent-pool-report-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
