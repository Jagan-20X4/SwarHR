// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  fmtDateTime,
  apiFetchInit,
  HR_REATTEMPT_REASON_LABELS,
} from "@/legacy/helpersModule";
import { Badge } from "@/shared/components/ui/Badge";
export function ReattemptQueue({ onBack, onResolved }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const [decision, setDecision] = useState("approve");
  const [hrCode, setHrCode] = useState("QUALITY_IMPACTED");
  const [hrNotes, setHrNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => {
    setLoading(true);
    fetch("/api/admin/reattempt-pending", apiFetchInit())
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  const submit = async () => {
    if (!sel) return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/admin/applications/${sel.applicationId}/reattempt-resolve`,
        apiFetchInit({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, hrReasonCode: hrCode, hrNotes: hrNotes.trim() }),
        }),
      );
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        window.alert(e.error || "Request failed");
      } else {
        setSel(null);
        setHrNotes("");
        load();
        if (typeof onResolved === "function") await onResolved();
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center gap-3">
        <button type="button" onClick={onBack} className="text-slate-400 hover:text-white text-sm">← Back</button>
        <span className="font-bold">Reattempt approvals</span>
        <Badge />
      </div>
      <div className="max-w-3xl mx-auto px-6 py-8">
        {loading ? <p className="text-slate-500 text-sm">Loading…</p> : items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-sm">No pending reattempt requests.</div>
        ) : (
          <div className="space-y-3">
            {items.map((row) => (
              <button
                key={row.applicationId}
                type="button"
                onClick={() => { setSel(row); setDecision("approve"); setHrCode("QUALITY_IMPACTED"); }}
                className="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 hover:border-indigo-300 transition-colors"
              >
                <p className="font-bold text-slate-900">{row.candidateName}</p>
                <p className="text-xs text-slate-500">{row.candidateEmail}</p>
                <p className="text-sm text-indigo-700 font-semibold mt-1">{row.jobTitle || "—"} · Application #{row.applicationId}</p>
                <p className="text-xs text-slate-400 mt-1">Requested: {row.requestedAt ? fmtDateTime(row.requestedAt) : "—"}</p>
                {row.candidateReasonCode && <p className="text-xs text-slate-600 mt-2">Candidate: {row.candidateReasonCode}{row.candidateReasonText ? ` — ${row.candidateReasonText.slice(0, 200)}` : ""}</p>}
              </button>
            ))}
          </div>
        )}
        {sel && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => !busy && setSel(null)}>
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-black text-slate-900 mb-2">Resolve reattempt</h3>
              <p className="text-sm text-slate-600 mb-4">{sel.candidateName} · {sel.jobTitle}</p>
              {sel.candidateReasonCode ? (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-1.5">Candidate request</p>
                  <p className="text-sm text-slate-800 leading-snug">
                    Candidate: {sel.candidateReasonCode}
                    {sel.candidateReasonText ? ` — ${String(sel.candidateReasonText).trim()}` : ""}
                  </p>
                </div>
              ) : null}
              <label className="block text-xs font-bold text-slate-500 mb-1">Decision</label>
              <select value={decision} onChange={(e) => setDecision(e.target.value)} className="w-full border rounded-xl px-3 py-2 mb-3 text-sm">
                <option value="approve">Approve (clears prior answers &amp; transcript for this application)</option>
                <option value="reject">Reject</option>
              </select>
              <label className="block text-xs font-bold text-slate-500 mb-1">HR reason (required)</label>
              <select value={hrCode} onChange={(e) => setHrCode(e.target.value)} className="w-full border rounded-xl px-3 py-2 mb-3 text-sm">
                {Object.keys(HR_REATTEMPT_REASON_LABELS).map((k) => <option key={k} value={k}>{HR_REATTEMPT_REASON_LABELS[k]}</option>)}
              </select>
              <label className="block text-xs font-bold text-slate-500 mb-1">Notes (optional)</label>
              <textarea value={hrNotes} onChange={(e) => setHrNotes(e.target.value)} rows={3} className="w-full border rounded-xl px-3 py-2 mb-4 text-sm resize-none" placeholder="Internal notes…" />
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => setSel(null)} className="flex-1 py-2 border rounded-xl text-sm font-bold">Cancel</button>
                <button type="button" disabled={busy} onClick={submit} className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold">{busy ? "…" : "Submit"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

