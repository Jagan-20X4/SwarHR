// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  authHeaders,
} from "@/legacy/helpersModule";
import {
  MANDATORY_OPENING_DEFAULTS,
  MANDATORY_CLOSING_DEFAULTS,
} from "@/constants/interviewQuestions";
export function JobMaster({ jobs, onSave, onBack }) {
  const MAX_ROLE_Q = 20;
  const MAX_OPEN_Q = 10;
  const MAX_CLOSE_Q = 5;
  const phaseCap = (phase) => {
    if (phase === "mandatory_open") return MAX_OPEN_Q;
    if (phase === "mandatory_close") return MAX_CLOSE_Q;
    return MAX_ROLE_Q;
  };
  const phaseLabel = (phase) => {
    if (phase === "mandatory_open") return "opening";
    if (phase === "mandatory_close") return "closing";
    return "role";
  };
  const defaultNewQuestionRows = () => [
    ...MANDATORY_OPENING_DEFAULTS.map((question) => ({ question, questionType: "open_ended", questionPhase: "mandatory_open" })),
    ...Array.from({ length: 5 }, () => ({ question: "", questionType: "open_ended", questionPhase: "role" })),
    ...MANDATORY_CLOSING_DEFAULTS.map((question) => ({ question, questionType: "open_ended", questionPhase: "mandatory_close" })),
  ];
  const [local, setLocal] = useState(jobs);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({ title: "", designation: "", location: "", description: "", requirements: "" });
  const [questionRows, setQuestionRows] = useState(defaultNewQuestionRows);
  const [qErrors, setQErrors] = useState({});
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState("");
  const [removingId, setRemovingId] = useState(null);
  const normalizeRowsFromJob = (j) => {
    const phaseOrder = { mandatory_open: 0, role: 1, mandatory_close: 2 };
    const iq = (j.interviewQuestions || []).slice().sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    const mapped = iq
      .map((q) => ({
        question: q.question || "",
        questionType: ["open_ended", "yes_no", "scale_1_5"].includes(q.questionType) ? q.questionType : "open_ended",
        questionPhase: ["mandatory_open", "role", "mandatory_close"].includes(q.questionPhase) ? q.questionPhase : "role",
        id: q.id,
      }))
      .sort((a, b) => (phaseOrder[a.questionPhase] ?? 1) - (phaseOrder[b.questionPhase] ?? 1));
    if (mapped.length === 0) return defaultNewQuestionRows();
    const hasEmptyRole = mapped.some((r) => r.questionPhase === "role" && !r.question.trim());
    if (!hasEmptyRole) return [...mapped, { question: "", questionType: "open_ended", questionPhase: "role" }];
    return mapped;
  };
  const removeJob = async (job) => {
    if (!job || !job.id) return;
    const label = job.title || "this job";
    if (!window.confirm(`Remove "${label}"? This will hide it from the careers page for candidates immediately.`)) return;
    setRemovingId(job.id);
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(job.id)}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        setToast(data.error || `Could not remove job (${res.status}).`);
        setTimeout(() => setToast(""), 4000);
        return;
      }
      const next = local.filter((x) => x.id !== job.id);
      setLocal(next);
      onSave(next);
      if (edit === job.id) setEdit(null);
      setToast(`Removed "${label}".`);
      setTimeout(() => setToast(""), 4000);
    } catch (_e) {
      setToast("Network error — could not remove job.");
      setTimeout(() => setToast(""), 4000);
    } finally {
      setRemovingId(null);
    }
  };
  const saveJob = () => {
    if (!form.title.trim()) return;
    const errs = {};
    const filled = [];
    questionRows.forEach((row, i) => {
      const t = row.question.trim();
      if (!t) return;
      if (t.length < 10 || t.length > 500) errs[i] = "Min 10 characters, max 500.";
      filled.push({
        question: t,
        questionType: ["open_ended", "yes_no", "scale_1_5"].includes(row.questionType) ? row.questionType : "open_ended",
        questionPhase: ["mandatory_open", "role", "mandatory_close"].includes(row.questionPhase) ? row.questionPhase : "role",
      });
    });
    setQErrors(errs);
    if (Object.keys(errs).length) return;
    const roleN = filled.filter((q) => q.questionPhase === "role").length;
    const openN = filled.filter((q) => q.questionPhase === "mandatory_open").length;
    const closeN = filled.filter((q) => q.questionPhase === "mandatory_close").length;
    if (roleN > MAX_ROLE_Q) {
      setToast(`Maximum ${MAX_ROLE_Q} role-specific questions.`);
      setTimeout(() => setToast(""), 4000);
      return;
    }
    if (openN > MAX_OPEN_Q) {
      setToast(`Maximum ${MAX_OPEN_Q} mandatory opening questions.`);
      setTimeout(() => setToast(""), 4000);
      return;
    }
    if (closeN > MAX_CLOSE_Q) {
      setToast(`Maximum ${MAX_CLOSE_Q} mandatory closing questions.`);
      setTimeout(() => setToast(""), 4000);
      return;
    }
    const interviewQuestions = filled.map((q, idx) => ({ ...q, displayOrder: idx + 1 }));
    const payload = { ...form, interviewQuestions };
    if (edit === "new") {
      setLocal((p) => [...p, { ...payload, id: "j-" + Date.now() }]);
    } else {
      setLocal((p) => p.map((j) => (j.id === edit ? { ...j, ...payload } : j)));
    }
    setToast(`Saved: ${openN} opening · ${roleN} role · ${closeN} closing.`);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    setTimeout(() => setToast(""), 4000);
    setEdit(null);
    setQErrors({});
  };
  const moveRow = (from, to) => {
    if (to < 0 || to >= questionRows.length) return;
    setQuestionRows((rows) => {
      const next = [...rows];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return next;
    });
  };
  const addRow = (phase) => {
    const cap = phaseCap(phase);
    const filled = questionRows.filter((r) => r.questionPhase === phase && r.question.trim()).length;
    if (filled >= cap) return;
    setQuestionRows((rows) => {
      const next = [...rows];
      let insertAt;
      if (phase === "mandatory_open") {
        const firstRole = next.findIndex((r) => r.questionPhase === "role");
        const firstClose = next.findIndex((r) => r.questionPhase === "mandatory_close");
        if (firstRole >= 0) insertAt = firstRole;
        else if (firstClose >= 0) insertAt = firstClose;
        else insertAt = next.length;
      } else if (phase === "mandatory_close") {
        insertAt = next.length;
      } else {
        const closeIdx = next.findIndex((r) => r.questionPhase === "mandatory_close");
        insertAt = closeIdx >= 0 ? closeIdx : next.length;
      }
      next.splice(insertAt, 0, { question: "", questionType: "open_ended", questionPhase: phase });
      return next;
    });
  };
  const countJobQuestions = (j) => {
    const iq = j.interviewQuestions || [];
    const ok = (q) => q.question && String(q.question).trim().length >= 10;
    const open = iq.filter((q) => q.questionPhase === "mandatory_open" && ok(q)).length;
    const role = iq.filter((q) => (q.questionPhase === "role" || !q.questionPhase) && ok(q)).length;
    const close = iq.filter((q) => q.questionPhase === "mandatory_close" && ok(q)).length;
    return { open, role, close };
  };
  const renderQuestionSection = (phaseFilter, sectionTitle, hint, allowRemove) => {
    const indices = questionRows.map((r, i) => ({ r, i })).filter(({ r }) => r.questionPhase === phaseFilter);
    const filledForPhase = indices.filter(({ r }) => r.question.trim()).length;
    const capForPhase = phaseCap(phaseFilter);
    const labelForPhase = phaseLabel(phaseFilter);
    return (
      <div key={phaseFilter} className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-xs font-black text-slate-700 uppercase tracking-wide">{sectionTitle}</h4>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">{phaseFilter === "role" ? "HR script" : "Mandatory"}</span>
        </div>
        {hint ? <p className="text-xs text-slate-500 mb-3">{hint}</p> : null}
        <div className="space-y-2">
          {indices.map(({ r: row, i }, localIdx) => (
            <div key={i} className={`flex flex-wrap items-start gap-2 ${qErrors[i] ? "rounded-xl ring-2 ring-red-300 bg-red-50/50 p-2 -mx-2" : ""}`}>
              <div className="flex flex-col gap-0.5 pt-2 shrink-0">
                <button type="button" disabled={localIdx === 0} onClick={() => moveRow(i, indices[localIdx - 1].i)} className="text-slate-400 hover:text-slate-700 disabled:opacity-30 text-xs leading-none" aria-label="Move up">↑</button>
                <button type="button" disabled={localIdx >= indices.length - 1} onClick={() => moveRow(i, indices[localIdx + 1].i)} className="text-slate-400 hover:text-slate-700 disabled:opacity-30 text-xs leading-none" aria-label="Move down">↓</button>
              </div>
              <span className="text-xs font-bold text-slate-500 pt-3 w-8 shrink-0">Q{localIdx + 1}</span>
              <input value={row.question} placeholder={phaseFilter === "role" ? "e.g. Walk me through your most recent IVF lab experience" : "Interview question"} onChange={(e) => { const v = e.target.value; setQuestionRows((rows) => rows.map((r, j) => j === i ? { ...r, question: v } : r)); setQErrors((e0) => { const n = { ...e0 }; delete n[i]; return n; }); }} className="flex-1 min-w-[200px] px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-800 text-white placeholder:text-slate-500"/>
              <select value={row.questionType} onChange={(e) => setQuestionRows((rows) => rows.map((r, j) => j === i ? { ...r, questionType: e.target.value } : r))} className="px-2 py-2 border border-slate-300 rounded-lg text-xs bg-slate-800 text-white shrink-0">
                <option value="open_ended">Open-ended</option>
                <option value="yes_no">Yes / No</option>
                <option value="scale_1_5">Scale 1–5</option>
              </select>
              {allowRemove ? (
                <button type="button" disabled={indices.length <= 1} onClick={() => setQuestionRows((rows) => rows.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 disabled:opacity-30 text-lg px-1 shrink-0" aria-label="Remove">✕</button>
              ) : null}
              {qErrors[i] ? <p className="w-full text-xs text-red-600 font-semibold pl-20">{qErrors[i]}</p> : null}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
          {filledForPhase < capForPhase ? (
            <button type="button" onClick={() => addRow(phaseFilter)} className="text-sm font-bold text-indigo-600 hover:text-indigo-800">+ Add {labelForPhase} question</button>
          ) : (
            <span className="text-xs text-amber-700 font-semibold">Maximum {capForPhase} {labelForPhase} questions.</span>
          )}
          <span className="text-xs text-slate-500">{labelForPhase.charAt(0).toUpperCase() + labelForPhase.slice(1)} questions: {filledForPhase} / {capForPhase}</span>
        </div>
      </div>
    );
  };
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3"><button type="button" onClick={() => { onSave(local); onBack(); }} className="text-slate-400 hover:text-white">← Back</button><span className="font-bold">Job Master</span></div>
        <button type="button" onClick={() => { onSave(local); setSaved(true); setTimeout(() => setSaved(false), 2000); }} className={`px-4 py-1.5 rounded-lg text-sm font-bold ${saved ? "bg-green-600 text-white" : "bg-indigo-600 hover:bg-indigo-500 text-white"}`}>{saved ? "✓ Saved" : "Save"}</button>
      </div>
      {toast ? <div className="bg-teal-600 text-white text-center text-sm py-2 font-semibold">{toast}</div> : null}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6"><h1 className="text-2xl font-black text-slate-900">Job Postings</h1><button type="button" onClick={() => { setForm({ title: "", designation: "", location: "", description: "", requirements: "" }); setQuestionRows(defaultNewQuestionRows()); setQErrors({}); setEdit("new"); }} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl">+ New</button></div>
        {edit && (
          <div className="bg-white rounded-2xl border border-indigo-200 shadow-lg p-6 mb-6">
            <div className="grid grid-cols-2 gap-4 mb-4">{[["title", "Title"], ["designation", "Designation"], ["location", "Location"]].map(([k, l]) => <div key={k}><label className="text-xs font-bold text-slate-500 mb-1 block">{l}</label><input value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"/></div>)}</div>
            {[["description", "Description"], ["requirements", "Requirements"]].map(([k, l]) => <div key={k} className="mb-4"><label className="text-xs font-bold text-slate-500 mb-1 block">{l}</label><textarea value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none bg-white"/></div>)}
            <div className="border-t border-slate-200 pt-5 mt-2 mb-4">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide mb-1">Interview Questions</h3>
              {renderQuestionSection("mandatory_open", "Mandatory opening", "Asked first. Placeholders: {{candidateName}}, {{jobTitle}}, {{companyName}}.", true)}
              {renderQuestionSection("role", "Role-specific (HR script)", "Asked after opening, before AI follow-ups.", true)}
              {renderQuestionSection("mandatory_close", "Mandatory closing", "Asked last after AI follow-ups.", true)}
            </div>
            <div className="flex gap-3"><button type="button" onClick={saveJob} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg">Save</button><button type="button" onClick={() => setEdit(null)} className="px-6 py-2 border border-slate-200 text-slate-600 font-bold rounded-lg">Cancel</button></div>
          </div>
        )}
        <div className="space-y-4">{local.map((j) => <div key={j.id} className="bg-white rounded-xl border border-slate-200 p-5 flex items-start justify-between"><div><h3 className="font-bold text-slate-900">{j.title}</h3><p className="text-sm text-slate-500">{j.designation} · {j.location}</p>{(() => { const c = countJobQuestions(j); return c.open + c.role + c.close > 0 ? <p className="text-xs text-teal-700 font-semibold mt-1">{c.open} opening · {c.role} role · {c.close} closing</p> : null; })()}</div><div className="flex gap-2 ml-4 shrink-0"><button type="button" onClick={() => { setForm({ title: j.title, designation: j.designation || "", location: j.location || "", description: j.description || "", requirements: j.requirements || "" }); setQuestionRows(normalizeRowsFromJob(j)); setQErrors({}); setEdit(j.id); }} className="text-xs px-3 py-1.5 border border-slate-200 text-slate-600 font-bold rounded-lg">Edit</button><button type="button" disabled={removingId === j.id} onClick={() => removeJob(j)} className="text-xs px-3 py-1.5 border border-red-100 text-red-500 font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">{removingId === j.id ? "Removing…" : "Remove"}</button></div></div>)}</div>
      </div>
    </div>
  );
}

