// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  publicAppOrigin,
  apiFetchInit,
  fmtSize,
} from "@/legacy/helpersModule";
import { CV_ANALYSER_MAX, CV_ANALYSER_MB } from "@/constants/cvAnalyserLimits";
import { CVResultCard } from "@/features/cv-analyser/components/CVResultCard";
export function CVAnalyserPage({ onBack, onSynced, jobs: boardJobs = [] }) {
  const inputRef = useRef(null);
  const [staged, setStaged] = useState([]);
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState("");
  const [cvJobs, setCvJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedCareersJobId, setSelectedCareersJobId] = useState(null);
  const [recruitmentJobs, setRecruitmentJobs] = useState([]);
  const [jobForm, setJobForm] = useState({
    title: "",
    companyName: "Indira IVF",
    designation: "",
    location: "Mumbai",
    description: "",
    recruitmentJobId: "",
  });
  const [saveJobBusy, setSaveJobBusy] = useState(false);

  const defaultJobForm = () => ({
    title: "",
    companyName: "Indira IVF",
    designation: "",
    location: "Mumbai",
    description: "",
    recruitmentJobId: "",
  });

  const loadJobs = async () => {
    setJobsLoading(true);
    try {
      const res = await fetch("/api/admin/cv-analyser/jobs", apiFetchInit());
      const data = await res.json().catch(() => ({}));
      if (res.status === 503 && String(data.error || "").toLowerCase().includes("migration")) {
        setBanner("Run database migration: migration_cv_analyser_job.sql, then refresh.");
        setCvJobs([]);
        return;
      }
      if (!res.ok) {
        setBanner(data.error || `Could not load saved jobs (${res.status}). The list was not cleared — try Refresh list.`);
        return;
      }
      const list = data.jobs || [];
      setCvJobs(list);
      setSelectedJobId((sid) => {
        if (sid == null) return null;
        return list.some((x) => Number(x.id) === Number(sid)) ? sid : null;
      });
      setSelectedCareersJobId((cid) => {
        if (cid == null) return null;
        return list.some((x) => String(x.recruitmentJobId) === String(cid)) ? cid : null;
      });
    } catch {
      setBanner("Could not reach server to load saved jobs.");
    } finally {
      setJobsLoading(false);
    }
  };

  const loadRecruitmentJobs = async () => {
    try {
      const res = await fetch("/api/admin/cv-analyser/recruitment-jobs", apiFetchInit());
      const data = await res.json().catch(() => ({}));
      if (res.ok) setRecruitmentJobs(data.jobs || []);
      else setRecruitmentJobs([]);
    } catch {
      setRecruitmentJobs([]);
    }
  };

  useEffect(() => {
    loadJobs();
    loadRecruitmentJobs();
  }, []);

  const applyJobToForm = (j) => {
    setJobForm({
      title: j.title || "",
      companyName: j.companyName || "Indira IVF",
      designation: j.designation || "",
      location: j.location || "Mumbai",
      description: j.description || "",
      recruitmentJobId: j.recruitmentJobId != null && j.recruitmentJobId !== "" ? String(j.recruitmentJobId) : "",
    });
  };

  const onSelectJob = async (e) => {
    const jid = e.target.value;
    if (!jid) {
      setSelectedCareersJobId(null);
      setSelectedJobId(null);
      return;
    }
    const job = (boardJobs || []).find((x) => String(x.id) === String(jid));
    if (!job) return;
    const nextForm = {
      ...jobForm,
      title: job.title || "",
      designation: job.designation || "",
      description: job.description || "",
      recruitmentJobId: jid,
    };
    setJobForm(nextForm);
    setBanner("");
    const existingCv = cvJobs.find((c) => String(c.recruitmentJobId) === String(jid));
    setSaveJobBusy(true);
    try {
      const out = await persistJobPosting(nextForm, existingCv?.id ?? null);
      if (!out.ok) {
        setBanner(out.error || "Could not save posting for analysis.");
        return;
      }
      setSelectedCareersJobId(jid);
      await loadJobs();
      try {
        if (typeof onSynced === "function") await onSynced();
      } catch (_) {}
      if (out.data && out.data.id != null) setSelectedJobId(out.data.id);
      if (out.data) applyJobToForm(out.data);
    } catch {
      setBanner("Could not save posting.");
    } finally {
      setSaveJobBusy(false);
    }
  };

  const startNewJob = () => {
    setSelectedJobId(null);
    setSelectedCareersJobId(null);
    setJobForm(defaultJobForm());
  };

  const persistJobPosting = async (form, idForPatch) => {
    const title = String(form.title || "").trim();
    if (!title) return { ok: false, error: "Enter a job title before saving." };
    const body = JSON.stringify({
      title: String(form.title).trim(),
      companyName: String(form.companyName || "Indira IVF").trim() || "Indira IVF",
      designation: String(form.designation || "").trim(),
      location: String(form.location || "Mumbai").trim() || "Mumbai",
      description: String(form.description || "").trim(),
      recruitmentJobId:
        form.recruitmentJobId && String(form.recruitmentJobId).trim()
          ? String(form.recruitmentJobId).trim()
          : null,
    });
    const headers = { "Content-Type": "application/json" };
    try {
      if (idForPatch != null) {
        const res = await fetch(
          `/api/admin/cv-analyser/jobs/${idForPatch}`,
          apiFetchInit({ method: "PATCH", headers, body }),
        );
        const data = await res.json().catch(() => ({}));
        if (res.status === 404) {
          const res2 = await fetch(
            "/api/admin/cv-analyser/jobs",
            apiFetchInit({ method: "POST", headers, body }),
          );
          const data2 = await res2.json().catch(() => ({}));
          if (!res2.ok) {
            return { ok: false, error: data2.error || "Could not save job posting." };
          }
          return { ok: true, data: data2, recreated: true };
        }
        if (!res.ok) return { ok: false, error: data.error || "Could not save job posting." };
        return { ok: true, data };
      }
      const res = await fetch(
        "/api/admin/cv-analyser/jobs",
        apiFetchInit({ method: "POST", headers, body }),
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || "Could not save job posting." };
      return { ok: true, data };
    } catch {
      return { ok: false, error: "Could not save job posting." };
    }
  };

  const saveJob = async () => {
    const title = jobForm.title.trim();
    if (!title) {
      setBanner("Enter a job title before saving.");
      return;
    }
    setSaveJobBusy(true);
    setBanner("");
    try {
      const out = await persistJobPosting(jobForm, selectedJobId);
      if (!out.ok) {
        setBanner(out.error || "Could not save job posting.");
        return;
      }
      await loadJobs();
      if (out.data && out.data.id != null) setSelectedJobId(out.data.id);
      if (out.data) applyJobToForm(out.data);
      if (out.data && out.data.recruitmentJobId != null && String(out.data.recruitmentJobId).trim() !== "") {
        setSelectedCareersJobId(String(out.data.recruitmentJobId));
      }
    } catch {
      setBanner("Could not save job posting.");
    } finally {
      setSaveJobBusy(false);
    }
  };

  const validateAndAddFiles = (fileList) => {
    const arr = Array.from(fileList || []);
    if (arr.length === 0) return;
    setBanner("");
    const maxBytes = CV_ANALYSER_MB * 1024 * 1024;
    const next = [...staged];
    for (const f of arr) {
      if (next.length >= CV_ANALYSER_MAX) {
        setBanner(`Maximum ${CV_ANALYSER_MAX} files.`);
        break;
      }
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      if (ext !== "pdf" && ext !== "docx") {
        setBanner("Only PDF or DOCX files are allowed.");
        continue;
      }
      if (f.size > maxBytes) {
        setBanner(`Each file must be ≤ ${CV_ANALYSER_MB} MB.`);
        continue;
      }
      next.push({ id: "f-" + Math.random().toString(36).slice(2) + Date.now(), file: f });
    }
    setStaged(next);
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    validateAndAddFiles(e.dataTransfer.files);
  };

  const runAnalyse = async () => {
    if (staged.length === 0) return;
    if (selectedJobId == null) {
      setBanner("Select or save a job posting first. CVs are scored against that JD.");
      return;
    }
    setBanner("");
    setBusy(true);
    const placeholders = staged.map((s) => ({ loading: true, filename: s.file.name, fileId: null }));
    setResults(placeholders);
    const fd = new FormData();
    staged.forEach((s) => fd.append("files", s.file, s.file.name));
    fd.append("jobProfileId", String(selectedJobId));
    try {
      const res = await fetch(
        "/api/admin/cv-analyser/batch",
        apiFetchInit({ method: "POST", body: fd }),
      );
      const data = await res.json().catch(() => ({}));
      if (res.status === 503 && (data.code === "AI_UNAVAILABLE" || /unavailable/i.test(data.error || ""))) {
        setBanner("AI service unavailable. Check ANTHROPIC_API_KEY on the server.");
        setResults([]);
        return;
      }
      if (res.status === 429) {
        setBanner(data.error || "Too many requests. Try again in a minute.");
        setResults([]);
        return;
      }
      if (res.status === 404) {
        setBanner(data.error || "Job posting not found. Refresh the job list and try again.");
        setResults([]);
        return;
      }
      if (!res.ok) {
        setBanner(data.error || "Batch request failed.");
        setResults([]);
        return;
      }
      setResults(data.results || []);
      if ((data.meta && data.meta.succeeded > 0) && typeof onSynced === "function") {
        try { await onSynced(); } catch (_) { /* ignore */ }
      }
    } catch {
      setBanner("Could not reach server.");
      setResults([]);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    const ids = (results || []).filter((r) => r.status === "ok" && r.fileId).map((r) => r.fileId);
    if (ids.length === 0) return;
    try {
      const res = await fetch(
        "/api/admin/cv-analyser/export?fileIds=" + encodeURIComponent(ids.join(",")),
        apiFetchInit(),
      );
      if (!res.ok) {
        const t = await res.json().catch(() => ({}));
        alert(t.error || "Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cv-analyser-export.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed");
    }
  };

  const okCount = (results || []).filter((r) => r.status === "ok").length;
  const selectedCvJobRow = selectedJobId != null ? cvJobs.find((x) => x.id === selectedJobId) : null;
  const inviteJobTitle =
    (jobForm.title && jobForm.title.trim()) || selectedCvJobRow?.title || "";
  const inviteRecruitmentId =
    (jobForm.recruitmentJobId && String(jobForm.recruitmentJobId).trim()) ||
    (selectedCvJobRow?.recruitmentJobId != null && String(selectedCvJobRow.recruitmentJobId).trim()) ||
    "";
  const inviteApplyUrl =
    typeof window !== "undefined" && inviteRecruitmentId
      ? `${publicAppOrigin()}/jobs/${encodeURIComponent(inviteRecruitmentId)}/apply?invite=1`
      : "";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center gap-3 flex-wrap">
        <button type="button" onClick={onBack} className="text-slate-400 hover:text-white text-sm">← Back</button>
        <span className="font-bold">CV Analyser</span>
      </div>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-black text-slate-900 mb-1">CV Analyser</h1>
        <p className="text-slate-500 mb-6">Pick a role from Job Master (HR Job Postings), then upload CVs. Each CV is scored against the Description field as JD.</p>
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-black text-slate-900">Job Master</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={jobsLoading || saveJobBusy}
                onClick={async () => {
                  await loadJobs();
                  try {
                    if (typeof onSynced === "function") await onSynced();
                  } catch (_) {}
                }}
                className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Refresh list
              </button>
              <button type="button" disabled={saveJobBusy} onClick={startNewJob} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-800 hover:bg-slate-200">New job</button>
            </div>
          </div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Job posting (Job Master)</label>
          <select
            value={selectedCareersJobId != null ? String(selectedCareersJobId) : ""}
            onChange={onSelectJob}
            disabled={jobsLoading || saveJobBusy}
            className="w-full mb-4 px-3 py-2.5 rounded-xl border border-slate-200 text-slate-900 text-sm bg-white disabled:opacity-50"
          >
            <option value="">— Select a role —</option>
            {(boardJobs || []).map((j) => (
              <option key={j.id} value={String(j.id)}>{j.title}{j.location ? ` · ${j.location}` : ""}</option>
            ))}
          </select>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Job title</label>
              <input value={jobForm.title} onChange={(e) => setJobForm((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. Clinical Embryologist" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Company</label>
              <input value={jobForm.companyName} onChange={(e) => setJobForm((p) => ({ ...p, companyName: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Location</label>
              <input value={jobForm.location} onChange={(e) => setJobForm((p) => ({ ...p, location: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Designation</label>
              <input value={jobForm.designation} onChange={(e) => setJobForm((p) => ({ ...p, designation: e.target.value }))} placeholder="Official designation / grade" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Job description (JD)</label>
              <textarea value={jobForm.description} onChange={(e) => setJobForm((p) => ({ ...p, description: e.target.value }))} rows={5} placeholder="Responsibilities, must-have skills, clinic context…" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm resize-y min-h-[120px]" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Careers job — interview invite link</label>
              <p className="text-xs text-slate-500 mb-2">Maps this CV-analyser posting to a role on the careers board so <strong className="font-semibold text-slate-700">Sent invite</strong> can include <span className="font-mono text-[11px]">/jobs/&lt;id&gt;/apply?invite=1</span> for the AI interview.</p>
              <select
                value={jobForm.recruitmentJobId || ""}
                onChange={(e) => setJobForm((p) => ({ ...p, recruitmentJobId: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
              >
                <option value="">— Not linked —</option>
                {(recruitmentJobs || []).map((j) => (
                  <option key={j.id} value={j.id}>{j.title}{j.location ? ` · ${j.location}` : ""}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-100">
            <button type="button" disabled={saveJobBusy} onClick={saveJob} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold disabled:opacity-40">
              {saveJobBusy ? "Saving…" : selectedJobId != null ? "Save changes" : "Save job posting"}
            </button>
            <p className="text-xs text-slate-500">
              {selectedJobId != null ? (
                <>Profile #{selectedJobId} — JD from Job Master Description; edit fields and Save if needed before analysing CVs.</>
              ) : (
                <>Pick a Job Master role above (loads title, designation, JD from HR Job Postings). Then analyse CVs.</>
              )}
            </p>
          </div>
        </div>
        {banner ? <div className="mb-4 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">{banner}</div> : null}
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current && inputRef.current.click(); } }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={onDrop}
          onClick={() => !busy && inputRef.current && inputRef.current.click()}
          className={`border-2 border-dashed border-slate-300 rounded-2xl bg-white p-10 text-center cursor-pointer transition hover:border-indigo-400 hover:bg-slate-50/80 ${busy ? "opacity-60 pointer-events-none" : ""}`}
        >
          <input ref={inputRef} type="file" multiple accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => { validateAndAddFiles(e.target.files); e.target.value = ""; }} />
          <div className="flex justify-center mb-3 text-slate-400">
            <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
          </div>
          <p className="text-slate-800 font-semibold mb-1">Drag &amp; drop CVs here, or click to browse</p>
          <p className="text-sm text-slate-500">PDF or DOCX · Up to 20 files · Max {CV_ANALYSER_MB}MB each</p>
        </div>
        {staged.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {staged.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-2 text-sm bg-white border border-slate-200 rounded-full px-3 py-1.5 text-slate-700">
                <span className="truncate max-w-[200px]">{s.file.name}</span>
                <span className="text-slate-400">· {fmtSize(s.file.size)}</span>
                <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); setStaged((p) => p.filter((x) => x.id !== s.id)); }} className="text-slate-500 hover:text-red-600 font-bold" aria-label="Remove">✕</button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button type="button" disabled={busy} onClick={() => { setStaged([]); setBanner(""); }} className="text-sm font-bold text-slate-600 hover:text-slate-900">Clear All</button>
          <button type="button" disabled={busy || staged.length === 0 || selectedJobId == null || jobsLoading} onClick={runAnalyse} className="px-6 py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold rounded-xl text-sm transition-colors">
            {busy ? "Analysing…" : `Analyse ${staged.length} CV${staged.length === 1 ? "" : "s"} →`}
          </button>
        </div>
        {results.length > 0 ? (
          <div className="mt-10 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
              <p className="text-sm font-bold text-slate-800">{results.length} CV{results.length === 1 ? "" : "s"} analysed{okCount < results.length ? ` · ${okCount} succeeded` : ""}</p>
              <div className="flex gap-2">
                <button type="button" onClick={exportCsv} disabled={okCount === 0} className="px-4 py-2 text-sm font-bold border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40">Export CSV</button>
                <button type="button" onClick={() => { setResults([]); setBanner(""); }} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Clear Results</button>
              </div>
            </div>
            <div className="space-y-4">
              {results.map((row, i) => (
                <CVResultCard
                  key={row.fileId || row.filename + "-" + i}
                  row={row}
                  jobTitle={inviteJobTitle}
                  inviteUrl={inviteApplyUrl}
                  recruitmentJobId={inviteRecruitmentId}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

