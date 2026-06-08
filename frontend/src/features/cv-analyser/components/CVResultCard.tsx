// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  publicAppOrigin,
  verdictLabel,
  buildCvAnalyserInviteEmail,
} from "@/legacy/helpersModule";
import { Modal } from "@/shared/components/ui/Modal";
export function CVResultCard({ row, jobTitle, inviteUrl }) {
  const [open, setOpen] = useState(false);
  const [inviteModal, setInviteModal] = useState(false);
  if (row.loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 flex items-center justify-center gap-3">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin shrink-0" aria-hidden />
        <span className="text-slate-600 text-sm font-medium truncate">{row.filename}</span>
      </div>
    );
  }
  if (row.status === "error") {
    return (
      <div className="bg-white rounded-2xl border border-red-200 shadow-sm px-5 py-4 text-sm text-red-800">
        <span className="font-semibold">{row.filename}</span>
        <span className="text-red-700"> — {row.error || "Could not analyse this file."}</span>
      </div>
    );
  }
  const a = row.analysis || {};
  const initial = (a.candidateName && String(a.candidateName).trim()[0]) || "?";
  const canInvite = Boolean(inviteUrl && String(inviteUrl).trim());
  const candLabel = a.candidateName && String(a.candidateName).trim() ? String(a.candidateName).trim() : "Candidate";
  const jtLabel = jobTitle && String(jobTitle).trim() ? String(jobTitle).trim() : "the position";
  const { subject: inviteSubject, body: inviteBody } = buildCvAnalyserInviteEmail({
    candidateName: candLabel,
    jobTitle: jtLabel,
    interviewLink: inviteUrl || "",
  });
  const copyFullEmail = () => {
    const text = `Subject: ${inviteSubject}\n\n${inviteBody}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => window.alert("Copied full email to clipboard.")).catch(() => window.alert("Could not copy."));
    } else {
      window.prompt("Copy this email:", text);
    }
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-full bg-slate-800 text-white flex items-center justify-center text-lg font-black shrink-0">{initial}</div>
          <div className="min-w-0">
            <p className="font-bold text-slate-900 truncate">{a.candidateName || "—"}</p>
            <p className="text-sm text-slate-500 truncate">{a.email || "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {row.analysisMode === "pdf_vision" ? <span className="text-xs font-bold text-indigo-800 bg-indigo-100 px-2 py-1 rounded-full">Visual PDF</span> : null}
          {row.cached ? <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">Cached</span> : null}
          <span className="text-xs font-bold text-white bg-slate-700 px-3 py-1 rounded-full">{verdictLabel(a.verdict)}</span>
        </div>
      </div>
      <p className="text-sm text-slate-600 mb-3">
        {[a.currentRole, a.yearsExperience != null ? `${a.yearsExperience} yrs` : null, a.phone].filter(Boolean).join(" · ") || "—"}
      </p>
      {Number.isFinite(a.overallFitScore) ? (
        <div className="mb-4 rounded-2xl bg-gradient-to-br from-indigo-50 via-white to-teal-50 border border-indigo-100/80 p-4 shadow-sm">
          <div className="flex flex-wrap items-stretch gap-4">
            <div className="flex flex-col items-center justify-center min-w-[5.5rem] rounded-2xl bg-indigo-600 text-white px-4 py-3 shadow-md shadow-indigo-900/15">
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-200">Fit</span>
              <span className="text-4xl font-black leading-none">{Math.round(a.overallFitScore)}</span>
              <span className="text-[10px] font-bold text-indigo-200 mt-0.5">/ 100</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-slate-500 uppercase mb-1.5">Match to your JD</p>
              <p className="text-sm text-slate-800 leading-snug">{a.fitSummary || "—"}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {[
                  { k: "technicalScore", label: "Technical" },
                  { k: "experienceScore", label: "Experience" },
                  { k: "educationScore", label: "Education" },
                  { k: "cultureScore", label: "Culture" },
                ].map(({ k, label }) => (
                  <span key={k} className="inline-flex items-baseline gap-1 text-xs font-bold bg-white/90 border border-slate-200/80 text-slate-700 px-2.5 py-1 rounded-full shadow-sm">
                    <span className="text-slate-500 font-semibold">{label}</span>
                    <span className="text-indigo-700">{a[k] != null ? Number(a[k]).toFixed(1) : "—"}</span>
                    <span className="text-slate-400 font-medium">/5</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <p className="text-sm text-slate-800 leading-snug line-clamp-2 mb-4">{a.summary || ""}</p>
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="border-l-2 border-green-500 pl-3">
          <p className="text-xs font-black text-slate-500 uppercase mb-2">Strengths</p>
          <ul className="text-sm text-slate-700 space-y-1 list-disc list-inside">{(a.strengths || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
        <div className="border-l-2 border-amber-500 pl-3">
          <p className="text-xs font-black text-slate-500 uppercase mb-2">Gaps</p>
          <ul className="text-sm text-slate-700 space-y-1 list-disc list-inside">{(a.gaps || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {(a.skills || []).slice(0, 8).map((sk) => (
          <span key={sk} className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-1 rounded-full">{sk}</span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <button
          type="button"
          disabled={!canInvite}
          title={canInvite ? "Open email draft with interview link" : "Link a careers job in Job Master (Careers job — interview invite link) and save."}
          onClick={() => canInvite && setInviteModal(true)}
          className={`text-xs font-bold px-4 py-2 rounded-xl border transition-colors ${canInvite ? "border-teal-600 text-teal-800 bg-teal-50 hover:bg-teal-100" : "border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed"}`}
        >
          Sent invite
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
          {open ? "Hide details" : "Show details"}
        </button>
      </div>
      {open ? (
        <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-700 space-y-2">
          <div>
            <p className="text-xs font-black text-slate-400 uppercase mb-1">Education</p>
            <ul className="list-disc list-inside space-y-0.5">{(a.education || []).map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
          {(a.redFlags || []).length > 0 ? (
            <div>
              <p className="text-xs font-black text-slate-400 uppercase mb-1">Red flags</p>
              <ul className="list-disc list-inside text-amber-900 space-y-0.5">{a.redFlags.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {inviteModal ? (
        <Modal title="Interview invite email" onClose={() => setInviteModal(false)} wide>
          <p className="text-xs text-slate-500 mb-3">Copy into your email client. Interview link base: <span className="font-mono text-[11px]">{publicAppOrigin()}</span> (set <span className="font-mono text-[10px]">VITE_PUBLIC_APP_URL</span> in <span className="font-mono text-[10px]">frontend/.env</span> for production; otherwise uses this tab&apos;s origin).</p>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Subject</label>
          <input readOnly className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mb-3 bg-slate-50" value={inviteSubject} onFocus={(e) => e.target.select()} />
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Body</label>
          <textarea readOnly rows={20} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed mb-4" value={inviteBody} onFocus={(e) => e.target.select()} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copyFullEmail} className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold">Copy subject + body</button>
            <button type="button" onClick={() => setInviteModal(false)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold">Close</button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

