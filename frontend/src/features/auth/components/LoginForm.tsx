// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Badge } from "@/shared/components/ui/Badge";
import { PrivacyModal } from "@/features/privacy/components/PrivacyModal";
export function Login({ onCandSuccess, onHrSuccess, onRegister, onForgot, coolingMonths, dpo }) {
  const [role, setRole] = useState("candidate"), [id, setId] = useState(""), [pw, setPw] = useState(""), [hrPw, setHrPw] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [showPw, setShowPw] = useState(false), [showP, setShowP] = useState(false);
  const submit = async () => {
    setErr("");
    if (role === "candidate" && (!id.trim() || !pw.trim())) return;
    if (role === "hr" && (!id.trim() || !hrPw.trim())) { setErr("Enter Corporate AD ID and password."); return; }
    setBusy(true);
    try {
      if (role === "hr") {
        const res = await fetch("/api/auth/login", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "hr", hrId: id.trim(), password: hrPw }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setErr(data.error || "HR login failed"); return; }
        await onHrSuccess({ hrId: data.hrId || id.trim(), token: data.token || "cookie" });
      } else {
        const res = await fetch("/api/auth/login", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "candidate", email: id.trim(), password: pw.trim() }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setErr(data.error || "Invalid email or password"); return; }
        await onCandSuccess({ candidateId: data.candidateId, token: data.token || "cookie" });
      }
    } catch (e) {
      setErr("Cannot reach server. Start backend (npm start) and check DATABASE_URL.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {showP && <PrivacyModal onClose={() => setShowP(false)} coolingMonths={coolingMonths} dpo={dpo}/>}
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-2xl"><span className="text-white text-2xl font-black">S</span></div>
            <h1 className="text-3xl font-black text-white">Swar AI</h1>
            <p className="text-slate-400 text-sm mt-1">Recruitment Intelligence Platform</p>
            <div className="mt-2 flex justify-center"><Badge/></div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
            <div className="flex rounded-xl overflow-hidden mb-6 border border-slate-700">
              {["candidate", "hr"].map(r => <button key={r} onClick={() => { setRole(r); setErr(""); setId(""); setPw(""); setHrPw(""); }} className={`flex-1 py-2.5 text-sm font-bold capitalize transition-all ${role === r ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}>{r === "hr" ? "HR Admin" : "Candidate"}</button>)}
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{role === "hr" ? "Corporate AD ID" : "Email"}</label>
                <input type={role === "hr" ? "text" : "email"} value={id} onChange={e => { setId(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && submit()} placeholder={role === "hr" ? "HR-TM-001" : "your@email.com"} className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"/>
              </div>
              {role === "candidate" && (
                <div>
                  <div className="flex items-center justify-between mb-2"><label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Password</label><button type="button" onClick={onForgot} className="text-xs text-indigo-400 font-medium">Forgot?</button></div>
                  <div className="relative">
                    <input type={showPw ? "text" : "password"} value={pw} onChange={e => { setPw(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && submit()} placeholder="••••••••" className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500 pr-16"/>
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">{showPw ? "HIDE" : "SHOW"}</button>
                  </div>
                </div>
              )}
              {role === "hr" && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Password</label>
                  <input type="password" value={hrPw} onChange={e => { setHrPw(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && submit()} placeholder="HR Password" className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500"/>
                </div>
              )}
              {err && <p className="text-red-400 text-sm">⚠ {err}</p>}
              <button type="button" onClick={submit} disabled={busy || !id.trim() || (role === "candidate" && !pw.trim()) || (role === "hr" && !hrPw.trim())} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold rounded-xl">{busy ? "Logging in…" : "Sign In →"}</button>
            </div>
            {role === "candidate" && (
              <div className="mt-6 pt-6 border-t border-slate-800 text-center space-y-2">
                <p className="text-slate-500 text-sm">New here? <button type="button" onClick={onRegister} className="text-indigo-400 font-bold">Register</button></p>
                <p className="text-slate-600 text-xs"></p>
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-slate-800 text-center"><button type="button" onClick={() => setShowP(true)} className="text-xs text-slate-500 underline">Privacy Policy</button></div>
          </div>
        </div>
      </div>
    </>
  );
}

