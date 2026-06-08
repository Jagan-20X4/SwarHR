// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  callClaude,
  savedAnalysisIsRenderable,
  normalizeSavedAnalysis,
  analysisInterviewMessages,
} from "@/legacy/helpersModule";
import { Spin } from "@/shared/components/ui/Spin";
export function Analysis({ context, transcript, savedAnalysis, roleTabs, selectedApplicationId, onSelectApplication, initialRemarks, onDecision, onBack, onLogout, hrDecisionAllowed = true }) {
  const [data, setData] = useState(null), [busy, setBusy] = useState(true), [err, setErr] = useState(null), [remarks, setRemarks] = useState(initialRemarks || "");
  const autoClaudeConsumedRef = useRef(false);
  const tabs = roleTabs || [];
  const showRoleTabs = tabs.length > 0 && typeof onSelectApplication === "function";

  useEffect(() => {
    setRemarks(initialRemarks || "");
  }, [initialRemarks, selectedApplicationId]);

  useEffect(() => {
    const noTx = !transcript || !transcript.length;
    if (noTx) {
      setBusy(false);
      setErr(null);
      setData({
        summary:
          "No AI interview transcript is stored for this role yet. Complete or schedule a voice interview to generate automated scores.",
        tech: null,
        comm: null,
        rec: "Pending review",
        strengths: [],
        areas: [],
        noTranscript: true,
        pendingManualGenerate: false,
      });
      return undefined;
    }

    if (savedAnalysisIsRenderable(savedAnalysis)) {
      setBusy(false);
      setErr(null);
      setData({ ...normalizeSavedAnalysis(savedAnalysis), pendingManualGenerate: false });
      return undefined;
    }

    if (!autoClaudeConsumedRef.current) {
      autoClaudeConsumedRef.current = true;
      let cancelled = false;
      setBusy(true);
      setErr(null);
      setData(null);
      (async () => {
        try {
          const r = await callClaude(analysisInterviewMessages(transcript, context.jd.title), "Return only JSON.", true);
          if (!cancelled) {
            if (r) setData({ ...r, noTranscript: false, pendingManualGenerate: false });
            else setErr("Could not parse.");
          }
        } catch (e) {
          if (!cancelled) setErr(e.message);
        } finally {
          if (!cancelled) setBusy(false);
        }
      })();
      return () => { cancelled = true; };
    }

    setBusy(false);
    setErr(null);
    setData({
      summary:
        "AI summary has not been generated for this role yet. Use “Generate AI summary” below (optional).",
      tech: null,
      comm: null,
      rec: "Pending review",
      strengths: [],
      areas: [],
      noTranscript: false,
      pendingManualGenerate: true,
    });
    return undefined;
  }, [JSON.stringify(transcript), context.jd.title, JSON.stringify(savedAnalysis), selectedApplicationId]);

  const handleManualGenerate = async () => {
    if (!transcript || !transcript.length) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await callClaude(analysisInterviewMessages(transcript, context.jd.title), "Return only JSON.", true);
      if (r) setData({ ...r, noTranscript: false, pendingManualGenerate: false });
      else setErr("Could not parse.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (busy) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Spin label="Generating analysis…"/></div>;
  if (!data) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-center p-8 bg-white rounded-2xl"><p className="text-red-500 mb-4 text-sm">{err}</p><button type="button" onClick={handleManualGenerate} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl mr-2">Retry</button><button onClick={onBack} className="px-5 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl">Back</button></div></div>;
  const recC = { "Strong Hire": "bg-green-500", "Hire": "bg-blue-500", "Weak Hire": "bg-amber-500", "No Hire": "bg-red-500", "Pending review": "bg-slate-500" };
  const decisionPayload = (() => {
    const { pendingManualGenerate: _p, ...rest } = data;
    return { ...rest, noTranscript: Boolean(data.noTranscript) };
  })();
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-indigo-900 text-white px-6 py-8"><div className="max-w-4xl mx-auto flex items-start justify-between flex-wrap gap-3"><div><h2 className="text-3xl font-black mb-1">{context.candidateName}</h2><p className="text-indigo-200 text-sm">{context.jd.title}</p></div><div className="flex items-center gap-3"><span className={`px-4 py-2 rounded-xl text-white font-black text-sm ${recC[data.rec] || "bg-blue-500"}`}>{data.rec}</span><button onClick={onLogout} className="text-indigo-300 text-sm">Logout</button></div></div></div>
      {showRoleTabs ? (
        <div className="max-w-4xl mx-auto px-6 pt-4 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.applicationId}
              type="button"
              onClick={() => onSelectApplication(t.applicationId)}
              className={`px-4 py-2 rounded-full text-sm font-bold border transition-colors ${selectedApplicationId === t.applicationId ? "bg-indigo-600 text-white border-indigo-600 shadow-md" : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {data.pendingManualGenerate ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-amber-950">No AI summary stored for this role yet. Generate one to populate scores and narrative (optional).</p>
            <button type="button" onClick={handleManualGenerate} disabled={busy} className="px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl whitespace-nowrap disabled:opacity-50 shrink-0">Generate AI summary</button>
          </div>
        ) : null}
        {err ? <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700">{err}</div> : null}
        <div className="bg-white rounded-2xl border border-slate-100 p-6"><h3 className="text-xs font-black text-slate-400 uppercase mb-3">Summary</h3><p className="text-slate-700">{data.summary}</p></div>
        {data.tech != null && data.comm != null ? (
          <div className="grid grid-cols-2 gap-4">{[["Technical", data.tech, "#6366f1"], ["Communication", data.comm, "#14b8a6"]].map(([l, v, col]) => <div key={l} className="bg-white rounded-2xl border border-slate-100 p-5"><p className="text-xs font-bold text-slate-400 mb-3">{l}</p><div className="flex items-center gap-3"><div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${v * 10}%`, backgroundColor: col }}/></div><span className="font-black text-slate-800 text-lg">{v}/10</span></div></div>)}</div>
        ) : null}
        {(data.strengths || []).length > 0 || (data.areas || []).length > 0 ? (
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-100 p-6"><h3 className="text-xs font-black text-green-600 uppercase mb-4">Strengths</h3><ul className="space-y-2">{(data.strengths || []).map((s, i) => <li key={i} className="flex gap-2 text-sm text-slate-700"><span className="text-green-500 font-bold">•</span>{s}</li>)}</ul></div>
            <div className="bg-white rounded-2xl border border-slate-100 p-6"><h3 className="text-xs font-black text-amber-600 uppercase mb-4">Improvements</h3><ul className="space-y-2">{(data.areas || []).map((a, i) => <li key={i} className="flex gap-2 text-sm text-slate-700"><span className="text-amber-500 font-bold">•</span>{a}</li>)}</ul></div>
          </div>
        ) : null}
        {!hrDecisionAllowed ? (
          <div className="bg-slate-100 border border-slate-200 rounded-2xl p-5 text-sm text-slate-700">
            <p className="font-bold text-slate-900 mb-1">HR decision locked</p>
            <p className="text-slate-600">Reject / Shortlist unlocks only after the candidate completes the voice interview for this role (interviewed).</p>
          </div>
        ) : (
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h3 className="text-xs font-black text-slate-400 uppercase mb-3">HR Decision</h3>
          <textarea rows={3} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Final remarks…" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none mb-4"/>
          <div className="flex gap-3"><button type="button" onClick={() => onDecision("REJECTED", remarks, decisionPayload)} className="flex-1 py-3 border-2 border-red-100 text-red-600 font-bold rounded-xl">Reject</button><button type="button" onClick={() => onDecision("SHORTLISTED", remarks, decisionPayload)} className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl">Shortlist ✓</button></div>
        </div>
        )}
        <button type="button" onClick={onBack} className="w-full py-3 border border-slate-200 text-slate-500 font-bold rounded-xl">← Back</button>
      </div>
    </div>
  );
}

