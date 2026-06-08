// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Badge } from "@/shared/components/ui/Badge";
export function RightsPanel({ candidate, jobs, onUpdate, onErase, onBack, dpo }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center gap-3"><button onClick={onBack} className="text-slate-400 text-sm">← Back</button><span className="font-bold">My Data Rights</span><Badge/></div>
      <div className="max-w-xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-black text-slate-900 mb-4">Your Data Rights (DPDPA 2023)</h1>
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="font-bold text-sm">§11 Right to Access</p><p className="text-xs text-slate-500 mt-1">Status: {candidate.status} · Job: {jobs.find(j => j.id === candidate.jobId)?.title || "N/A"}</p></div>
          <button onClick={() => { onUpdate({ consent: false, status: "WITHDRAWN" }); }} className="w-full bg-white border border-slate-200 rounded-xl p-4 text-left"><p className="font-bold text-sm">§6 Withdraw Consent</p></button>
          <button onClick={() => { if (window.confirm("Erase all data?")) onErase(); }} className="w-full bg-white border border-red-100 rounded-xl p-4 text-left"><p className="font-bold text-sm text-red-600">§12 Right to Erasure</p></button>
        </div>
        <div className="mt-6 text-xs text-slate-500 text-center">Grievance Officer: <b>{(dpo || {}).name || "—"}</b><br/>{(dpo || {}).email || ""}</div>
      </div>
    </div>
  );
}

// ── MAIN APP ─────────────────────────────────────────────────────────────────
