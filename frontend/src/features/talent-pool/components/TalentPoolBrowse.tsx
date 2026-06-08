// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
export function TalentPoolBrowse({ talentPool, jobs, candidates, resolveExistingByEmail, onMapToJob, onLogAudit, onBack, coolingMonths }) {
  const cm = typeof coolingMonths === "number" ? coolingMonths : 3;
  const [filters, setFilters] = useState({ role: "", skill: "", minExp: "", maxExp: "", location: "", source: "", keyword: "", fromDate: "", toDate: "" });
  const [selected, setSelected] = useState(null), [mapJobId, setMapJobId] = useState(""), [mapping, setMapping] = useState(false);
  const [resumePreview, setResumePreview] = useState(null);
  const filtered = talentPool.filter(t => {
    if (filters.role && !(t.desiredRoles || []).join(" ").toLowerCase().includes(filters.role.toLowerCase())) return false;
    if (filters.skill && !(t.skills || []).join(" ").toLowerCase().includes(filters.skill.toLowerCase())) return false;
    if (filters.minExp !== "" && (t.experience || 0) < parseInt(filters.minExp)) return false;
    if (filters.maxExp !== "" && (t.experience || 0) > parseInt(filters.maxExp)) return false;
    if (filters.location && !(t.location || "").toLowerCase().includes(filters.location.toLowerCase())) return false;
    if (filters.source && (t.source || "") !== filters.source) return false;
    if (filters.keyword) {
      const all = `${t.name} ${t.email} ${t.keywords} ${t.cvText} ${t.qualification || ""} ${t.currentCtc || ""} ${t.currentEmployer || ""} ${t.source || ""} ${t.coolingPeriod || ""} ${t.applicationDate || ""} ${(t.skills || []).join(" ")} ${(t.desiredRoles || []).join(" ")} ${t.preferredCity1 || ""} ${t.preferredCity2 || ""} ${t.preferredCity3 || ""}`.toLowerCase();
      if (!all.includes(filters.keyword.toLowerCase())) return false;
    }
    if (filters.fromDate && new Date(t.submittedAt) < new Date(filters.fromDate)) return false;
    if (filters.toDate && new Date(t.submittedAt) > new Date(filters.toDate + "T23:59:59")) return false;
    return true;
  });
  const hasFilters = Object.values(filters).some(v => v !== "");
  const view = (e) => { setSelected(e); onLogAudit("VIEW_TP_PROFILE", e.id, `Viewed ${e.name}`); };
  const hasCv = (e) => Boolean(e?.cvFile && cvFileHref(e.cvFile));
  const download = (e) => {
    if (!hasCv(e)) return;
    downloadCvFile(e.cvFile);
    onLogAudit("DOWNLOAD_TP_CV", e.id, `Downloaded ${e.name}'s CV`);
  };
  const viewResume = (e) => {
    if (!hasCv(e)) return;
    setResumePreview({
      dataUrl: e.cvFile.dataUrl,
      downloadUrl: e.cvFile.downloadUrl,
      fileName: e.cvFile.name,
      ext: e.cvFile.ext,
      cvText: e.cvText || "",
    });
    onLogAudit("VIEW_TP_CV", e.id, `In-app preview ${e.name}'s CV`);
  };
  const handleMap = async () => {
    if (!mapJobId || !selected) return;
    const job = jobs.find(j => j.id === mapJobId);
    let existing = candidates.find(c => c.email.toLowerCase() === selected.email.toLowerCase());
    if (!existing && resolveExistingByEmail) {
      try {
        existing = await resolveExistingByEmail(selected.email);
      } catch (e) {
        console.error(e);
      }
    }
    if (existing) {
      const status = getCoolingStatus(existing.applicationHistory, mapJobId, cm);
      if (status.pendingInterview) { alert(`Cannot map: ${existing.name} already has an active application (interview not completed).`); return; }
      if (!status.canApply) { alert(`Cannot map: ${existing.name} is in cooling period (${status.daysRemaining}d remaining).`); return; }
    }
    setMapping(true);
    try {
      await onMapToJob(selected, mapJobId);
      onLogAudit("MAP_TO_JOB", selected.id, `Mapped ${selected.name} → ${job?.title}`);
      alert(`✓ ${selected.name} mapped to "${job?.title}".`);
      setMapping(false); setMapJobId(""); setSelected(null);
    } catch (_e) {
      setMapping(false);
    }
  };
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
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center gap-3 flex-wrap"><button onClick={onBack} className="text-slate-400 hover:text-white text-sm">← Back</button><span className="font-bold">Talent Pool</span><span className="text-xs text-indigo-300 bg-indigo-900/50 px-2 py-0.5 rounded-full">{talentPool.length} profiles</span><span className="text-xs text-slate-400 ml-auto">All access logged (§8)</span></div>
      {selected && (
        <Modal title={selected.name} onClose={() => { setSelected(null); setMapping(false); setMapJobId(""); setResumePreview(null); }} wide>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {selected.phone && <div><p className="text-xs text-slate-400 font-bold">Phone</p><p>{selected.phone}</p></div>}
              <div><p className="text-xs text-slate-400 font-bold">Email</p><p>{selected.email}</p></div>
              {selected.location && <div><p className="text-xs text-slate-400 font-bold">Current city</p><p>{selected.location}</p></div>}
              {selected.preferredCity1 && <div><p className="text-xs text-slate-400 font-bold">Preferred city 1</p><p>{selected.preferredCity1}</p></div>}
              {selected.preferredCity2 && <div><p className="text-xs text-slate-400 font-bold">Preferred city 2</p><p>{selected.preferredCity2}</p></div>}
              {selected.preferredCity3 && <div><p className="text-xs text-slate-400 font-bold">Preferred city 3</p><p>{selected.preferredCity3}</p></div>}
              <div><p className="text-xs text-slate-400 font-bold">Experience</p><p>{selected.experience} yrs</p></div>
              <div><p className="text-xs text-slate-400 font-bold">Submitted</p><p>{fmtDate(selected.submittedAt)}</p></div>
              {selected.qualification && <div><p className="text-xs text-slate-400 font-bold">Qualification</p><p>{selected.qualification}</p></div>}
              {selected.currentCtc && <div><p className="text-xs text-slate-400 font-bold">Current CTC</p><p>{selected.currentCtc}</p></div>}
              {selected.currentEmployer && <div className="col-span-2"><p className="text-xs text-slate-400 font-bold">Current employer</p><p>{selected.currentEmployer}</p></div>}
              {selected.source && <div><p className="text-xs text-slate-400 font-bold">Source</p><p>{selected.source}</p></div>}
              {selected.applicationDate && <div><p className="text-xs text-slate-400 font-bold">Application date</p><p>{selected.applicationDate}</p></div>}
              {selected.coolingPeriod && <div className="col-span-2"><p className="text-xs text-slate-400 font-bold">Notice period</p><p>{selected.coolingPeriod}</p></div>}
            </div>
            {selected.desiredRoles?.length > 0 && <div><p className="text-xs text-slate-400 font-bold mb-2">Desired Roles</p><div className="flex gap-1 flex-wrap">{selected.desiredRoles.map(r => <span key={r} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg">{r}</span>)}</div></div>}
            {selected.skills?.length > 0 && <div><p className="text-xs text-slate-400 font-bold mb-2">Skills</p><div className="flex gap-1 flex-wrap">{selected.skills.map(s => <span key={s} className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-lg">{s}</span>)}</div></div>}
            {selected.keywords && <div><p className="text-xs text-slate-400 font-bold mb-1">Notes</p><p className="text-sm text-slate-700">{selected.keywords}</p></div>}
            <div>
              <p className="text-xs text-slate-400 font-bold mb-1">Resume</p>
              {selected.cvFile && cvFileHref(selected.cvFile) ? (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm min-w-0"><span className="text-2xl shrink-0">{fileIcon(selected.cvFile.ext)}</span><div className="min-w-0"><p className="font-bold text-slate-800 truncate max-w-xs">{selected.cvFile.name}</p><p className="text-xs text-slate-500">{selected.cvFile.ext.toUpperCase()} · {fmtSize(selected.cvFile.size)}</p></div></div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={() => viewResume(selected)} className="px-4 py-2 bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-50 text-xs font-bold rounded-lg">View</button>
                    <button type="button" onClick={() => download(selected)} className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg">⬇ Download</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">No CV on file for this profile.</p>
              )}
            </div>
            <div className="border-t border-slate-100 pt-4">
              {!mapping ? <button onClick={() => setMapping(true)} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl">→ Map to Job</button> : (
                <div className="space-y-3">
                  <select value={mapJobId} onChange={e => setMapJobId(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"><option value="">— Choose role —</option>{jobs.map(j => <option key={j.id} value={j.id}>{j.title} · {j.location}</option>)}</select>
                  <div className="flex gap-2"><button onClick={() => { setMapping(false); setMapJobId(""); }} className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl">Cancel</button><button onClick={handleMap} disabled={!mapJobId} className="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-xl disabled:bg-slate-200">Confirm</button></div>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-black text-slate-900 mb-1">Talent Pool</h1>
        <p className="text-slate-500 mb-6">Search, view, download, and map talent pool CVs.</p>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
          <h2 className="text-xs font-black text-slate-400 uppercase mb-3">🔍 Filters</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[["Role", "role", "text", "Embryologist"], ["Skill", "skill", "text", "ICSI"], ["Location", "location", "text", "Mumbai"], ["Keyword", "keyword", "text", "Free text"], ["Min Exp", "minExp", "number", ""], ["Max Exp", "maxExp", "number", ""], ["From Date", "fromDate", "date", ""], ["To Date", "toDate", "date", ""]].map(([l, k, t, p]) => <div key={k}><label className="block text-xs text-slate-500 mb-1">{l}</label><input type={t} value={filters[k]} onChange={e => setFilters(prev => ({ ...prev, [k]: e.target.value }))} placeholder={p} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"/></div>)}
            <div><label className="block text-xs text-slate-500 mb-1">Source</label><select value={filters.source} onChange={e => setFilters(prev => ({ ...prev, source: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-indigo-400"><option value="">All</option>{TP_SOURCE_OPTIONS.filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          </div>
          {hasFilters && <button onClick={() => setFilters({ role: "", skill: "", minExp: "", maxExp: "", location: "", source: "", keyword: "", fromDate: "", toDate: "" })} className="mt-3 text-xs text-indigo-500 font-bold">Clear all ✕</button>}
        </div>
        <p className="text-sm font-bold text-slate-600 mb-3">{filtered.length} {filtered.length === 1 ? "profile" : "profiles"}</p>
        {filtered.length === 0 ? <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center"><p className="text-slate-400">{talentPool.length === 0 ? "Talent pool is empty." : "No profiles match."}</p></div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{filtered.map(t => (
            <div key={t.id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg hover:border-indigo-200 transition-all">
              <div className="flex items-start justify-between mb-3"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-lg">{t.name[0]}</div><div><p className="font-bold text-slate-900">{t.name}</p><p className="text-xs text-slate-400">{t.email}</p></div></div><span className="text-xs font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-lg">{fmtDate(t.submittedAt)}</span></div>
              <div className="flex gap-3 text-xs text-slate-600 mb-3 flex-wrap">{t.location && <p>📍 {t.location}</p>}{[t.preferredCity1, t.preferredCity2, t.preferredCity3].filter(Boolean).length > 0 ? <p className="text-violet-700 font-medium">Pref: {[t.preferredCity1, t.preferredCity2, t.preferredCity3].filter(Boolean).join(" · ")}</p> : null}{t.source ? <p className="text-indigo-700 font-semibold">{TP_SOURCE_OPTIONS.find(o => o.value === t.source)?.label || t.source}</p> : null}<p>💼 {t.experience} yrs</p>{t.cvFile ? <p>{fileIcon(t.cvFile.ext)} {t.cvFile.ext.toUpperCase()}</p> : <p className="text-slate-400">No CV</p>}</div>
              {t.desiredRoles?.length > 0 && <div className="flex gap-1 flex-wrap mb-2">{t.desiredRoles.slice(0, 3).map(r => <span key={r} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg">{r}</span>)}</div>}
              {t.skills?.length > 0 && <div className="flex gap-1 flex-wrap mb-3">{t.skills.slice(0, 4).map(s => <span key={s} className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg">{s}</span>)}</div>}
              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button onClick={() => view(t)} className="flex-1 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg">View</button>
                <button onClick={() => download(t)} disabled={!hasCv(t)} title={hasCv(t) ? "Download CV" : "No CV on file"} className="px-3 py-2 border border-slate-200 text-slate-600 text-xs font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">⬇</button>
              </div>
            </div>
          ))}</div>
        )}
      </div>
    </div>
    </>
  );
}

const AUDIT_ACTION_META = {
  "interview.reattempt_approved":   { label: "Reattempt approved",    tone: "green" },
  "interview.reattempt_rejected":   { label: "Reattempt rejected",    tone: "red" },
  "interview.reattempt_requested":  { label: "Reattempt requested",   tone: "amber" },
  "interview.incomplete_technical": { label: "Interview ended early", tone: "orange" },
  VIEW_TP_PROFILE:                  { label: "Viewed talent profile", tone: "blue" },
  VIEW_TP_CV:                       { label: "Viewed CV",             tone: "blue" },
  DOWNLOAD_TP_CV:                   { label: "Downloaded CV",         tone: "purple" },
  MAP_TO_JOB:                       { label: "Mapped to job",         tone: "green" },
};

const AUDIT_TONE_CLASSES = {
  green:  "bg-green-50 text-green-700",
  red:    "bg-red-50 text-red-700",
  amber:  "bg-amber-50 text-amber-700",
  orange: "bg-orange-50 text-orange-700",
  blue:   "bg-blue-50 text-blue-700",
  purple: "bg-purple-50 text-purple-700",
  slate:  "bg-slate-100 text-slate-700",
};

