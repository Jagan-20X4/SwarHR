// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  LS_TOKEN,
} from "@/legacy/helpersModule";
export function HRRedirectOnce({ href }) {
  useEffect(() => {
    let dest = href;
    if (window.HR_PASS_SWAR_TOKEN === true) {
      const t = localStorage.getItem(LS_TOKEN);
      if (t) {
        const param = (typeof window.HR_TOKEN_QUERY_PARAM === "string" && window.HR_TOKEN_QUERY_PARAM.trim()) || "token";
        const sep = href.includes("?") ? "&" : "?";
        dest = href + sep + param + "=" + encodeURIComponent(t);
      }
    }
    window.location.replace(dest);
  }, [href]);
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3 p-6">
      <div className="w-10 h-10 border-4 border-indigo-800 border-t-indigo-400 rounded-full animate-spin"/>
      <p className="text-slate-400 text-sm">Redirecting to HR workspace…</p>
    </div>
  );
}

