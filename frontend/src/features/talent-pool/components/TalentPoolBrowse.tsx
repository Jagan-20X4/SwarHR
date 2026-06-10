// @ts-nocheck
import React, { useState, useEffect, useCallback } from "react";
import {
  cvFileHref,
  downloadCvFile,
  fmtDate,
  fmtSize,
  fileIcon,
  getCoolingStatus,
  TP_SOURCE_OPTIONS,
} from "@/legacy/helpersModule";
import { Modal } from "@/shared/components/ui/Modal";
import { ResumePreviewModal } from "@/shared/components/ResumePreviewModal";
import {
  fetchTalentPoolPage,
  fetchTalentPoolById,
  exportTalentPoolReport,
} from "@/shared/api/talentPoolApi";

const PAGE_SIZE = 50;

const EMPTY_FILTERS = {
  role: "",
  skill: "",
  minExp: "",
  maxExp: "",
  location: "",
  source: "",
  keyword: "",
  fromDate: "",
  toDate: "",
};

export function TalentPoolBrowse({
  jobs,
  candidates,
  resolveExistingByEmail,
  onMapToJob,
  onLogAudit,
  onBack,
  coolingMonths,
}) {
  const cm = typeof coolingMonths === "number" ? coolingMonths : 3;
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filtersDebounced, setFiltersDebounced] = useState(EMPTY_FILTERS);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mapJobId, setMapJobId] = useState("");
  const [mapping, setMapping] = useState(false);
  const [resumePreview, setResumePreview] = useState(null);
  const [list, setList] = useState({ items: [], total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFiltersDebounced(filters), 350);
    return () => clearTimeout(t);
  }, [filters]);

  useEffect(() => {
    setPage(1);
  }, [filtersDebounced]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const out = await fetchTalentPoolPage({
        page,
        limit: PAGE_SIZE,
        ...filtersDebounced,
      });
      setList({
        items: out.items || [],
        total: out.total ?? 0,
        totalPages: out.totalPages ?? 1,
      });
    } catch (e) {
      console.error(e);
      setListError("Could not load talent pool.");
      setList({ items: [], total: 0, totalPages: 1 });
    } finally {
      setLoading(false);
    }
  }, [page, filtersDebounced]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const hasFilters = Object.values(filters).some((v) => v !== "");

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportTalentPoolReport(filtersDebounced);
    } catch (e) {
      console.error(e);
      alert("Could not export talent pool report. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const loadDetail = async (entry) => {
    setDetailLoading(true);
    try {
      const full = await fetchTalentPoolById(entry.id);
      setSelected(full);
      onLogAudit("VIEW_TP_PROFILE", full.id, `Viewed ${full.name}`);
      return full;
    } catch (e) {
      console.error(e);
      alert("Could not load profile details.");
      return null;
    } finally {
      setDetailLoading(false);
    }
  };

  const view = (e) => {
    void loadDetail(e);
  };

  const hasCv = (e) => Boolean(e?.cvFile && cvFileHref(e.cvFile)) || Boolean(e?.hasCv);

  const download = async (e) => {
    let fileEntry = e;
    if (!cvFileHref(e?.cvFile)) {
      const full = await fetchTalentPoolById(e.id);
      if (!full?.cvFile || !cvFileHref(full.cvFile)) return;
      fileEntry = full;
    }
    downloadCvFile(fileEntry.cvFile);
    onLogAudit("DOWNLOAD_TP_CV", fileEntry.id, `Downloaded ${fileEntry.name}'s CV`);
  };

  const viewResume = async (e) => {
    let fileEntry = e;
    if (!cvFileHref(e?.cvFile)) {
      const full = await fetchTalentPoolById(e.id);
      if (!full?.cvFile || !cvFileHref(full.cvFile)) return;
      fileEntry = full;
    }
    setResumePreview({
      dataUrl: fileEntry.cvFile.dataUrl,
      downloadUrl: fileEntry.cvFile.downloadUrl,
      fileName: fileEntry.cvFile.name,
      ext: fileEntry.cvFile.ext,
      cvText: fileEntry.cvText || "",
    });
    onLogAudit("VIEW_TP_CV", fileEntry.id, `In-app preview ${fileEntry.name}'s CV`);
  };

  const handleMap = async () => {
    if (!mapJobId || !selected) return;
    const job = jobs.find((j) => j.id === mapJobId);
    let existing = candidates.find(
      (c) => c.email.toLowerCase() === selected.email.toLowerCase(),
    );
    if (!existing && resolveExistingByEmail) {
      try {
        existing = await resolveExistingByEmail(selected.email);
      } catch (e) {
        console.error(e);
      }
    }
    if (existing) {
      const status = getCoolingStatus(existing.applicationHistory, mapJobId, cm);
      if (status.pendingInterview) {
        alert(
          `Cannot map: ${existing.name} already has an active application (interview not completed).`,
        );
        return;
      }
      if (!status.canApply) {
        alert(
          `Cannot map: ${existing.name} is in cooling period (${status.daysRemaining}d remaining).`,
        );
        return;
      }
    }
    setMapping(true);
    try {
      await onMapToJob(selected, mapJobId);
      onLogAudit("MAP_TO_JOB", selected.id, `Mapped ${selected.name} → ${job?.title}`);
      alert(`✓ ${selected.name} mapped to "${job?.title}".`);
      setMapping(false);
      setMapJobId("");
      setSelected(null);
      void loadPage();
    } catch (_e) {
      setMapping(false);
    }
  };

  const items = list.items;

  return (
    <>
      {resumePreview ? (
        <ResumePreviewModal
          dataUrl={resumePreview.dataUrl}
          downloadUrl={resumePreview.downloadUrl}
          fileName={resumePreview.fileName}
          ext={resumePreview.ext}
          cvText={resumePreview.cvText}
          onClose={() => setResumePreview(null)}
        />
      ) : null}
      <div className="min-h-screen bg-slate-50">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center gap-3 flex-wrap">
          <button onClick={onBack} className="text-slate-400 hover:text-white text-sm">
            ← Back
          </button>
          <span className="font-bold">Talent Pool</span>
          <span className="text-xs text-indigo-300 bg-indigo-900/50 px-2 py-0.5 rounded-full">
            {list.total} profiles
          </span>
          <span className="text-xs text-slate-400 ml-auto"></span>
        </div>
        {selected && (
          <Modal
            title={selected.name}
            onClose={() => {
              setSelected(null);
              setMapping(false);
              setMapJobId("");
              setResumePreview(null);
            }}
            wide
          >
            {detailLoading ? (
              <p className="text-sm text-slate-500 py-8 text-center">Loading profile…</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {selected.phone && (
                    <div>
                      <p className="text-xs text-slate-400 font-bold">Phone</p>
                      <p>{selected.phone}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-slate-400 font-bold">Email</p>
                    <p>{selected.email}</p>
                  </div>
                  {selected.location && (
                    <div>
                      <p className="text-xs text-slate-400 font-bold">Current city</p>
                      <p>{selected.location}</p>
                    </div>
                  )}
                  {selected.preferredCity1 && (
                    <div>
                      <p className="text-xs text-slate-400 font-bold">Preferred city 1</p>
                      <p>{selected.preferredCity1}</p>
                    </div>
                  )}
                  {selected.preferredCity2 && (
                    <div>
                      <p className="text-xs text-slate-400 font-bold">Preferred city 2</p>
                      <p>{selected.preferredCity2}</p>
                    </div>
                  )}
                  {selected.preferredCity3 && (
                    <div>
                      <p className="text-xs text-slate-400 font-bold">Preferred city 3</p>
                      <p>{selected.preferredCity3}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-slate-400 font-bold">Experience</p>
                    <p>{selected.experience} yrs</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-bold">Submitted</p>
                    <p>{fmtDate(selected.submittedAt)}</p>
                  </div>
                  {selected.qualification && (
                    <div>
                      <p className="text-xs text-slate-400 font-bold">Qualification</p>
                      <p>{selected.qualification}</p>
                    </div>
                  )}
                  {selected.currentCtc && (
                    <div>
                      <p className="text-xs text-slate-400 font-bold">Current CTC</p>
                      <p>{selected.currentCtc}</p>
                    </div>
                  )}
                  {selected.currentEmployer && (
                    <div className="col-span-2">
                      <p className="text-xs text-slate-400 font-bold">Current employer</p>
                      <p>{selected.currentEmployer}</p>
                    </div>
                  )}
                  {selected.source && (
                    <div>
                      <p className="text-xs text-slate-400 font-bold">Source</p>
                      <p>{selected.source}</p>
                    </div>
                  )}
                  {selected.applicationDate && (
                    <div>
                      <p className="text-xs text-slate-400 font-bold">Application date</p>
                      <p>{selected.applicationDate}</p>
                    </div>
                  )}
                  {selected.coolingPeriod && (
                    <div className="col-span-2">
                      <p className="text-xs text-slate-400 font-bold">Notice period</p>
                      <p>{selected.coolingPeriod}</p>
                    </div>
                  )}
                </div>
                {selected.desiredRoles?.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 font-bold mb-2">Desired Roles</p>
                    <div className="flex gap-1 flex-wrap">
                      {selected.desiredRoles.map((r) => (
                        <span
                          key={r}
                          className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selected.skills?.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 font-bold mb-2">Skills</p>
                    <div className="flex gap-1 flex-wrap">
                      {selected.skills.map((s) => (
                        <span
                          key={s}
                          className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-lg"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selected.keywords && (
                  <div>
                    <p className="text-xs text-slate-400 font-bold mb-1">Notes</p>
                    <p className="text-sm text-slate-700">{selected.keywords}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-slate-400 font-bold mb-1">Resume</p>
                  {selected.cvFile && cvFileHref(selected.cvFile) ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm min-w-0">
                        <span className="text-2xl shrink-0">
                          {fileIcon(selected.cvFile.ext)}
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 truncate max-w-xs">
                            {selected.cvFile.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {selected.cvFile.ext.toUpperCase()} · {fmtSize(selected.cvFile.size)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => viewResume(selected)}
                          className="px-4 py-2 bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-50 text-xs font-bold rounded-lg"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => download(selected)}
                          className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg"
                        >
                          ⬇ Download
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
                      No CV on file for this profile.
                    </p>
                  )}
                </div>
                <div className="border-t border-slate-100 pt-4">
                  {!mapping ? (
                    <button
                      onClick={() => setMapping(true)}
                      className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl"
                    >
                      → Map to Job
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <select
                        value={mapJobId}
                        onChange={(e) => setMapJobId(e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"
                      >
                        <option value="">— Choose role —</option>
                        {jobs.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.title} · {j.location}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setMapping(false);
                            setMapJobId("");
                          }}
                          className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleMap}
                          disabled={!mapJobId}
                          className="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-xl disabled:bg-slate-200"
                        >
                          Confirm
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Modal>
        )}
        <div className="max-w-6xl mx-auto px-6 py-8">
          <h1 className="text-3xl font-black text-slate-900 mb-1">Talent Pool</h1>
          <p className="text-slate-500 mb-6">Search, view, download, and map talent pool CVs.</p>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
            <h2 className="text-xs font-black text-slate-400 uppercase mb-3">🔍 Filters</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {[
                ["Role", "role", "text", "Embryologist"],
                ["Skill", "skill", "text", "ICSI"],
                ["Location", "location", "text", "Mumbai"],
                ["Keyword", "keyword", "text", "Free text"],
                ["Min Exp", "minExp", "number", ""],
                ["Max Exp", "maxExp", "number", ""],
                ["From Date", "fromDate", "date", ""],
                ["To Date", "toDate", "date", ""],
              ].map(([l, k, t, p]) => (
                <div key={k}>
                  <label className="block text-xs text-slate-500 mb-1">{l}</label>
                  <input
                    type={t}
                    value={filters[k]}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, [k]: e.target.value }))
                    }
                    placeholder={p}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
                  />
                </div>
              ))}
              <div className="col-span-2 flex items-end gap-3">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs text-slate-500 mb-1">Source</label>
                  <select
                    value={filters.source}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, source: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-indigo-400"
                  >
                    <option value="">All</option>
                    {TP_SOURCE_OPTIONS.filter((o) => o.value).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => void handleExport()}
                  disabled={exporting}
                  className="shrink-0 px-4 py-2 bg-teal-700 hover:bg-teal-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 whitespace-nowrap"
                >
                  {exporting ? "Exporting…" : "Export Candidate details"}
                </button>
              </div>
            </div>
            {hasFilters && (
              <button
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="mt-3 text-xs text-indigo-500 font-bold"
              >
                Clear all ✕
              </button>
            )}
          </div>
          <p className="text-sm font-bold text-slate-600 mb-3">
            {loading ? "Loading…" : `${list.total} ${list.total === 1 ? "profile" : "profiles"}`}
            {hasFilters && !loading ? ` (page ${page} of ${list.totalPages})` : ""}
          </p>
          {listError ? (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-4 text-sm">
              {listError}
            </div>
          ) : null}
          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
              <p className="text-slate-400">Loading profiles…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center">
              <p className="text-slate-400">
                {list.total === 0 ? "Talent pool is empty." : "No profiles match."}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items.map((t) => (
                  <div
                    key={t.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg hover:border-indigo-200 transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-lg">
                          {t.name[0]}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{t.name}</p>
                          <p className="text-xs text-slate-400">{t.email}</p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-lg">
                        {fmtDate(t.submittedAt)}
                      </span>
                    </div>
                    <div className="flex gap-3 text-xs text-slate-600 mb-3 flex-wrap">
                      {t.location && <p>📍 {t.location}</p>}
                      {[t.preferredCity1, t.preferredCity2, t.preferredCity3].filter(Boolean)
                        .length > 0 ? (
                        <p className="text-violet-700 font-medium">
                          Pref:{" "}
                          {[t.preferredCity1, t.preferredCity2, t.preferredCity3]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}
                      {t.source ? (
                        <p className="text-indigo-700 font-semibold">
                          {TP_SOURCE_OPTIONS.find((o) => o.value === t.source)?.label ||
                            t.source}
                        </p>
                      ) : null}
                      <p>💼 {t.experience} yrs</p>
                      {t.cvFile || t.hasCv ? (
                        <p>
                          {fileIcon(t.cvFile?.ext || "pdf")}{" "}
                          {(t.cvFile?.ext || "pdf").toUpperCase()}
                        </p>
                      ) : (
                        <p className="text-slate-400">No CV</p>
                      )}
                    </div>
                    {t.desiredRoles?.length > 0 && (
                      <div className="flex gap-1 flex-wrap mb-2">
                        {t.desiredRoles.slice(0, 3).map((r) => (
                          <span
                            key={r}
                            className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                    {t.skills?.length > 0 && (
                      <div className="flex gap-1 flex-wrap mb-3">
                        {t.skills.slice(0, 4).map((s) => (
                          <span
                            key={s}
                            className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 pt-3 border-t border-slate-100">
                      <button
                        onClick={() => view(t)}
                        className="flex-1 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg"
                      >
                        View
                      </button>
                      <button
                        onClick={() => download(t)}
                        disabled={!hasCv(t)}
                        title={hasCv(t) ? "Download CV" : "No CV on file"}
                        className="px-3 py-2 border border-slate-200 text-slate-600 text-xs font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        ⬇
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {list.totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-8">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold disabled:opacity-40"
                  >
                    ← Previous
                  </button>
                  <span className="text-sm text-slate-600">
                    Page {page} of {list.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= list.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
