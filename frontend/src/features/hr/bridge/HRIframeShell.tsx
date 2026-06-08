// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  LS_TOKEN,
} from "@/legacy/helpersModule";
export function HRIframeShell({ baseUrl, onLogout }) {
  const param = (typeof window.HR_TOKEN_QUERY_PARAM === "string" && window.HR_TOKEN_QUERY_PARAM.trim()) || "token";
  const qs = window.HR_PASS_SWAR_TOKEN === true ? (() => {
    const t = localStorage.getItem(LS_TOKEN);
    if (!t) return "";
    const sep = baseUrl.includes("?") ? "&" : "?";
    return sep + param + "=" + encodeURIComponent(t);
  })() : "";
  const src = baseUrl + qs;
  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900 text-white">
        <span className="text-sm font-bold tracking-tight">Swar AI · HR</span>
        <button type="button" onClick={onLogout} className="text-xs font-bold text-slate-300 hover:text-white underline">Logout</button>
      </div>
      <iframe title="HR workspace" src={src} className="flex-1 w-full min-h-0 border-0 bg-white" style={{ height: "calc(100vh - 52px)" }} />
    </div>
  );
}

