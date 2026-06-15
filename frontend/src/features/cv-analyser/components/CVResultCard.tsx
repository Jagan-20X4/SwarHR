// @ts-nocheck
import React, { useState } from "react";
import { apiFetchInit, verdictLabel } from "@/legacy/helpersModule";
export function CVResultCard({ row, jobTitle, inviteUrl, recruitmentJobId }) {
  const [open, setOpen] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
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
  const candEmail = a.email && String(a.email).trim() ? String(a.email).trim() : "";
  const candName = a.candidateName && String(a.candidateName).trim() ? String(a.candidateName).trim() : "Candidate";
  const canInvite = Boolean(
    inviteUrl && String(inviteUrl).trim() && recruitmentJobId && candEmail,
  );
  const sendInvite = async () => {
    if (!canInvite || inviteBusy || inviteSent) return;
    setInviteBusy(true);
    try {
      const r = await fetch(
        "/api/admin/cv-analyser/send-invite",
        apiFetchInit({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidateName: candName,
            email: candEmail,
            jobTitle: jobTitle && String(jobTitle).trim() ? String(jobTitle).trim() : "",
            recruitmentJobId: String(recruitmentJobId),
          }),
        }),
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        window.alert(data.error || "Could not send invite email.");
        return;
      }
      setInviteSent(true);
    } catch {
      window.alert("Could not reach server.");
    } finally {
      setInviteBusy(false);
    }
  };
  const inviteDisabledReason = !recruitmentJobId || !inviteUrl
    ? "Link a careers job in Job Master (Careers job — interview invite link) and save."
    : !candEmail
      ? "No email found on this CV — cannot send invite."
      : "";
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
          disabled={!canInvite || inviteBusy || inviteSent}
          title={canInvite ? `Send interview invite to ${candEmail}` : inviteDisabledReason}
          onClick={sendInvite}
          className={`text-xs font-bold px-4 py-2 rounded-xl border transition-colors ${
            inviteSent
              ? "border-green-600 text-green-800 bg-green-50 cursor-default"
              : canInvite
                ? "border-teal-600 text-teal-800 bg-teal-50 hover:bg-teal-100"
                : "border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed"
          }`}
        >
          {inviteBusy ? "Sending…" : inviteSent ? "Invite sent ✓" : "Send invite"}
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
    </div>
  );
}
