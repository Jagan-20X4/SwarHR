// @ts-nocheck
import React, { useState, useEffect, useCallback } from "react";
import {
  fmtDateTime,
  getLatestAppForJob,
  candidateHasAnyInterviewTranscript,
  activeRoleHasTranscript,
  SB,
} from "@/legacy/helpersModule";
import { Badge } from "@/shared/components/ui/Badge";
import {
  fetchCandidateStats,
  fetchCandidatesPage,
  exportCandidateReport,
} from "@/shared/api/candidatesApi";
import { fetchTalentPoolStats } from "@/shared/api/talentPoolApi";

const PAGE_SIZE = 50;

export function HRDash({
  jobs,
  reattemptPendingCount,
  onView,
  onInterview,
  onAnalysis,
  onCvAnalyser,
  onJobs,
  onScreen,
  onTalentPool,
  onAuditLog,
  onReattempts,
  onLogout,
}) {
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [cursorStack, setCursorStack] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [stats, setStats] = useState(null);
  const [list, setList] = useState({ candidates: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [talentPoolTotal, setTalentPoolTotal] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchTalentPoolStats()
      .then((s) => setTalentPoolTotal(s.total ?? 0))
      .catch(() => setTalentPoolTotal(null));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
    setCursorStack([]);
    setNextCursor(null);
  }, [filter, searchDebounced]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchCandidateStats();
        if (!cancelled) setStats(s);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const cursor =
        page > 1 && cursorStack.length >= page - 1
          ? cursorStack[page - 2]
          : undefined;
      const out = await fetchCandidatesPage({
        page,
        limit: PAGE_SIZE,
        cursor,
        status: filter === "ALL" ? undefined : filter,
        search: searchDebounced || undefined,
      });
      setList(out);
      setNextCursor(out.nextCursor || null);
    } catch (e) {
      console.error(e);
      setListError("Could not load candidates.");
      setList({ candidates: [], total: 0, totalPages: 1 });
    } finally {
      setLoading(false);
    }
  }, [page, filter, searchDebounced, cursorStack]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const statCards = stats
    ? [
        { l: "Total", v: stats.total, s: "ALL" },
        { l: "Applied", v: stats.applied, s: "APPLIED" },
        { l: "Shortlisted", v: stats.shortlisted, s: "SHORTLISTED" },
        { l: "Interviewed", v: stats.interviewed, s: "INTERVIEWED" },
        { l: "Rejected", v: stats.rejected, s: "REJECTED" },
      ]
    : [
        { l: "Total", v: "—", s: "ALL" },
        { l: "Applied", v: "—", s: "APPLIED" },
        { l: "Shortlisted", v: "—", s: "SHORTLISTED" },
        { l: "Interviewed", v: "—", s: "INTERVIEWED" },
        { l: "Rejected", v: "—", s: "REJECTED" },
      ];

  const jt = (id) => jobs.find((j) => j.id === id)?.title || "—";
  const schedFor = (c) =>
    c.interviewScheduledAt ||
    getLatestAppForJob(c.applicationHistory, c.jobId)?.interviewScheduledAt;
  const filtered = list.candidates || [];
  const totalPages = list.totalPages || 1;

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportCandidateReport({
        status: filter === "ALL" ? undefined : filter,
        search: searchDebounced || undefined,
        activeJobOnly: true,
      });
    } catch (e) {
      console.error(e);
      alert("Could not export candidate report. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-black text-sm">
            S
          </div>
          <span className="font-bold">HR Portal</span>
          <Badge />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={onCvAnalyser}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 hover:-translate-y-0.5 text-white rounded-lg text-sm font-medium transition-transform"
          >
            CV Analyser
          </button>
          <button
            onClick={onJobs}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 hover:-translate-y-0.5 text-white rounded-lg text-sm font-medium transition-transform"
          >
            Jobs
          </button>
          <button
            onClick={onTalentPool}
            className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 hover:-translate-y-0.5 text-white rounded-lg text-sm font-medium transition-transform"
          >
            🌟 Talent Pool ({talentPoolTotal ?? "…"})
          </button>
          <button
            type="button"
            onClick={onReattempts}
            className="px-3 py-1.5 bg-amber-800 hover:bg-amber-700 hover:-translate-y-0.5 text-white rounded-lg text-sm font-medium transition-transform relative"
          >
            Reattempts
            {typeof reattemptPendingCount === "number" &&
            reattemptPendingCount > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-1 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">
                {reattemptPendingCount > 9 ? "9+" : reattemptPendingCount}
              </span>
            ) : null}
          </button>
          <button
            onClick={onAuditLog}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 hover:-translate-y-0.5 text-white rounded-lg text-sm font-medium transition-transform"
          >
            📋 Audit
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="px-3 py-1.5 bg-red-900/50 hover:bg-red-900 text-red-300 rounded-lg text-sm font-medium"
          >
            Logout
          </button>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-black text-slate-900 mb-1">
          Recruitment Dashboard
        </h1>
        <p className="text-slate-500 text-sm mb-6">
        </p>
        <div className="grid grid-cols-5 gap-4 mb-6">
          {statCards.map((s) => (
            <button
              key={s.l}
              onClick={() => setFilter(s.s)}
              className={`text-left bg-white rounded-2xl p-5 border shadow-sm transition-all hover:shadow-md ${filter === s.s ? "border-indigo-400 ring-2 ring-indigo-100" : "border-slate-100"}`}
            >
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                {s.l}
              </p>
              <p className="text-3xl font-black text-slate-900">{s.v}</p>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-xl font-bold text-slate-800">
            Candidates{" "}
            {filter !== "ALL" && (
              <span className="text-sm text-slate-500 font-normal">· {filter}</span>
            )}
            {list.total > 0 && (
              <span className="text-sm text-slate-400 font-normal ml-2">
                ({list.total} total)
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email…"
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-56"
            />
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting}
              className="px-3 py-2 bg-teal-700 hover:bg-teal-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 whitespace-nowrap"
            >
              {exporting ? "Exporting…" : "Export Candidate details"}
            </button>
            {filter !== "ALL" && (
              <button
                onClick={() => setFilter("ALL")}
                className="text-xs text-indigo-600 font-bold"
              >
                Clear filter ✕
              </button>
            )}
          </div>
        </div>
        {listError ? (
          <div className="bg-red-50 text-red-700 rounded-xl p-4 text-sm mb-4">
            {listError}
          </div>
        ) : null}
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-slate-500">
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center">
            <p className="text-slate-400">No candidates on this page.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((c) => (
              <div
                key={c.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg hover:border-indigo-200 transition-all cursor-pointer"
                onClick={() => onView(c.id)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-lg">
                      {c.name[0]}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{c.name}</p>
                      <p className="text-xs text-slate-400">{c.email}</p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-black uppercase px-2 py-1 rounded-lg ${SB[c.status] || "bg-slate-100"}`}
                  >
                    {c.status}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-700 mb-1">
                  {c.jobId ? jt(c.jobId) : "—"}
                  {c.fromTalentPool ? (
                    <span className="text-xs font-semibold text-amber-700 ml-1.5">
                      *talent pool
                    </span>
                  ) : null}
                </p>
                {schedFor(c) ? (
                  <p className="text-xs font-bold text-teal-700 mb-2">
                    📅 Interview scheduled: {fmtDateTime(schedFor(c))}
                  </p>
                ) : null}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <div
                    className={`text-xs font-bold px-2 py-1 rounded-lg ${c.consent ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}
                  >
                    {c.consent ? "✓ Consent" : "⚠ No consent"}
                  </div>
                  {candidateHasAnyInterviewTranscript(c) && (
                    <div className="text-xs font-bold px-2 py-1 rounded-lg bg-teal-50 text-teal-600">
                      🎤 Done
                    </div>
                  )}
                  {(c.applicationCount > 1 ||
                    (c.applicationHistory || []).length > 1) && (
                    <div className="text-xs font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-600">
                      {c.applicationCount ||
                        (c.applicationHistory || []).length}{" "}
                      apps
                    </div>
                  )}
                </div>
                <div
                  className="flex gap-2 pt-3 border-t border-slate-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => onView(c.id)}
                    className="flex-1 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg"
                  >
                    View
                  </button>
                  {c.consent &&
                    !activeRoleHasTranscript(c) &&
                    (c.status === "SHORTLISTED" || c.status === "APPLIED") &&
                    !schedFor(c) && (
                      <button
                        onClick={() => onInterview(c.id)}
                        className="flex-1 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg"
                      >
                        Start interview
                      </button>
                    )}
                  {(c.status === "INTERVIEWED" ||
                    c.analysis ||
                    c.hasAnalysis ||
                    candidateHasAnyInterviewTranscript(c) ||
                    (c.applicationHistory || []).some(
                      (a) => a.analysis || a.interviewCompletedAt,
                    )) && (
                    <button
                      onClick={() => onAnalysis(c.id)}
                      className="flex-1 py-2 bg-teal-600 text-white text-xs font-bold rounded-lg"
                    >
                      Analysis
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && (page > 1 || nextCursor) && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-bold disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="text-sm text-slate-600">
              Page {page}
              {list.total != null ? ` · ${list.total} total` : ""}
            </span>
            <button
              type="button"
              disabled={!nextCursor}
              onClick={() => {
                if (nextCursor) {
                  setCursorStack((s) => {
                    const copy = [...s];
                    copy[page - 1] = nextCursor;
                    return copy;
                  });
                }
                setPage((p) => p + 1);
              }}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-bold disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
