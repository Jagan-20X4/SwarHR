// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Badge } from "@/shared/components/ui/Badge";
import { PrivacyModal } from "@/features/privacy/components/PrivacyModal";
export function ConsentScreen({ onAccept, onDecline, dataCategories, coolingMonths, dpo }) {
  const [agreed, setAgreed] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const cats = dataCategories && dataCategories.length > 0 ? dataCategories : [];
  return (
    <>
      {showPolicy && <PrivacyModal onClose={() => setShowPolicy(false)} coolingMonths={coolingMonths} dpo={dpo}/>}
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl">
          <div className="bg-indigo-700 px-6 py-5">
            <div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center font-black text-white text-sm">S</div><Badge/></div>
            <h1 className="text-xl font-black text-white">Consent & Privacy Notice</h1>
          </div>
          <div className="p-6 space-y-3">
            <p className="text-slate-300 text-sm">Data we will process for your recruitment:</p>
            <div className="space-y-2">
              {cats.map(d => (
                <div key={d.id} className="flex gap-3 p-3 rounded-xl border border-slate-700 bg-slate-800/50">
                  <div className="w-5 h-5 rounded-full bg-indigo-900/50 border border-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                  </div>
                  <div>
                    <p className="text-white text-sm font-semibold">{d.label}</p>
                    <p className="text-slate-400 text-xs">{d.items}</p>
                    <p className="text-indigo-300 text-xs mt-0.5"><b>Purpose:</b> {d.purpose}</p>
                  </div>
                </div>
              ))}
            </div>
            <label className={`flex gap-3 p-4 rounded-xl border cursor-pointer transition-all mt-4 ${agreed ? "border-indigo-500 bg-indigo-900/30" : "border-slate-700 bg-slate-800/50"}`}>
              <input type="checkbox" checked={agreed} onChange={() => setAgreed(!agreed)} className="mt-0.5 w-5 h-5 accent-indigo-500 shrink-0"/>
              <div><p className="text-white text-sm font-bold">I consent to all of the above</p><p className="text-slate-400 text-xs mt-0.5">I agree to processing of my data and confirm I am 18+</p></div>
            </label>
            <p className="text-slate-500 text-xs">By proceeding you confirm you have read our <button onClick={() => setShowPolicy(true)} className="text-indigo-400 underline">Privacy Policy</button>.</p>
            <div className="flex gap-3 pt-1">
              <button onClick={onDecline} className="flex-1 py-3 border border-slate-600 text-slate-400 font-bold rounded-xl hover:bg-slate-800 text-sm">Decline</button>
              <button onClick={() => agreed && onAccept(cats.map(d => d.id))} disabled={!agreed || cats.length === 0} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold rounded-xl text-sm">I Consent →</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

