// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  LS_TOKEN,
} from "@/legacy/helpersModule";
export function JobBoardAuth({
  authStripReady,
  sessionRole,
  candidateFirstName,
  onLoginClick,
  onLogoutClick,
  onGoToAts,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false);
    };
    const esc = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);
  if (!authStripReady) return null;
  const tok = localStorage.getItem(LS_TOKEN);
  const anon = !tok;
  const cand = sessionRole === "candidate" && tok;
  const hr = sessionRole === "hr" && tok;
  const ats = (typeof window.__ATS_URL__ === "string" && window.__ATS_URL__.trim()) || "";
  const first = candidateFirstName || "there";

  const goAts = (e) => {
    e.preventDefault();
    if (ats) {
      window.location.href = ats;
    } else {
      onGoToAts();
    }
    setMenuOpen(false);
  };

  return (
    <>
      <div className="hidden md:flex items-center flex-wrap gap-x-2 gap-y-1 text-sm text-white">
        {anon ? (
          <>
            <span className="text-slate-300 whitespace-nowrap">Already have an account?</span>
            <button type="button" onClick={onLoginClick} className="px-3 py-1.5 rounded-lg border border-white/40 text-white text-sm font-semibold hover:bg-white/10 transition-colors">Login</button>
          </>
        ) : null}
        {cand ? (
          <>
            <span className="text-white font-medium whitespace-nowrap">Hi, {first}</span>
            <span className="text-slate-600 select-none" aria-hidden>|</span>
            <button type="button" onClick={onLogoutClick} className="text-slate-200 hover:text-white text-sm font-semibold px-1 py-0.5 rounded border border-transparent hover:border-white/20">Logout</button>
          </>
        ) : null}
        {hr ? (
          <>
            <span className="text-slate-300 whitespace-nowrap">Logged in as HR</span>
            <span className="text-slate-600 select-none" aria-hidden>|</span>
            {ats ? (
              <a href={ats} className="text-indigo-300 hover:text-indigo-200 text-sm font-bold whitespace-nowrap">Go to ATS →</a>
            ) : (
              <button type="button" onClick={goAts} className="text-indigo-300 hover:text-indigo-200 text-sm font-bold whitespace-nowrap">Go to ATS →</button>
            )}
          </>
        ) : null}
      </div>

      <div className="md:hidden relative" ref={wrapRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="p-2 rounded-lg border border-white/30 text-white hover:bg-white/10"
          aria-expanded={menuOpen}
          aria-haspopup="true"
          aria-label="Account menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
        </button>
        {menuOpen ? (
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[220px] rounded-xl border border-slate-600 bg-slate-800 shadow-xl py-2">
            {anon ? (
              <div className="px-3 py-2 space-y-2">
                <p className="text-xs text-slate-400">Already have an account?</p>
                <button type="button" onClick={() => { onLoginClick(); setMenuOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg border border-white/30 text-white text-sm font-semibold hover:bg-white/10">Login</button>
              </div>
            ) : null}
            {cand ? (
              <div className="px-2 py-1 space-y-1">
                <p className="px-2 py-1 text-sm text-white font-medium">Hi, {first}</p>
                <button type="button" onClick={() => { onLogoutClick(); setMenuOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-slate-200 hover:bg-slate-700 text-sm">Logout</button>
              </div>
            ) : null}
            {hr ? (
              <div className="px-2 py-1 space-y-1">
                <p className="px-2 py-1 text-xs text-slate-400">Logged in as HR</p>
                {ats ? (
                  <a href={ats} className="block px-3 py-2 rounded-lg text-indigo-300 hover:bg-slate-700 text-sm font-bold" onClick={() => setMenuOpen(false)}>Go to ATS →</a>
                ) : (
                  <button type="button" onClick={(e) => { goAts(e); }} className="w-full text-left px-3 py-2 rounded-lg text-indigo-300 hover:bg-slate-700 text-sm font-bold">Go to ATS →</button>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

