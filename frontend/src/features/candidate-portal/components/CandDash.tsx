// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  authHeaders,
  fmtDateTime,
  getLatestAppForJob,
  interviewEligibleForJob,
  interviewStartSlotStatus,
  formatInterviewCountdown,
  INTERVIEW_SLOT_CLOSED_MESSAGE,
  applicationEligibleForTechnicalReattemptRequest,
  applicationEligibleForRescheduleRequest,
  portalStatusLabel,
  SB,
  CANDIDATE_REATTEMPT_REASONS,
  CANDIDATE_RESCHEDULE_REASONS,
} from "@/legacy/helpersModule";
import { Badge } from "@/shared/components/ui/Badge";
export function CandDash({ candidate, jobs, portalFocusJobId, onPortalFocusJob, onApply, onTalentPool, onInterview, onRights, onLogout, talentPoolSelected, onSync, scheduleFlash = null }) {
  const focusJobId = portalFocusJobId || candidate.jobId;
  const jobIdsOrdered = (() => {
    const out = [];
    const seen = new Set();
    for (const a of candidate.applicationHistory || []) {
      if (a.jobId && !seen.has(a.jobId)) {
        seen.add(a.jobId);
        out.push(a.jobId);
      }
    }
    if (candidate.jobId && !seen.has(candidate.jobId)) out.push(candidate.jobId);
    return out;
  })();
  const job = jobs.find((j) => j.id === focusJobId);
  const latestApp = job ? getLatestAppForJob(candidate.applicationHistory, focusJobId) : null;
  const iv = job ? interviewEligibleForJob(candidate, focusJobId) : { ok: false };
  const roleLab = focusJobId ? portalStatusLabel(candidate, focusJobId) : "—";
  const hrNote =
    latestApp?.hrRemarks != null && String(latestApp.hrRemarks).trim()
      ? String(latestApp.hrRemarks).trim()
      : "";
  const [rrCode, setRrCode] = useState("TECH_NETWORK");
  const [rrText, setRrText] = useState("");
  const [rrBusy, setRrBusy] = useState(false);
  const [clockTick, setClockTick] = useState(0);
  const schedAt = latestApp?.interviewScheduledAt;
  const schedSlot = schedAt ? interviewStartSlotStatus(schedAt, false) : null;
  const interviewCountdown =
    schedAt && schedSlot?.tooEarly ? formatInterviewCountdown(schedAt) : null;
  const interviewSlotClosed =
    schedAt && schedSlot?.tooLate && !latestApp?.interviewCompletedAt;
  useEffect(() => {
    if (!schedAt || latestApp?.interviewCompletedAt) return undefined;
    const id = setInterval(() => setClockTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [schedAt, latestApp?.interviewCompletedAt]);
  void clockTick;
  const canRequestReattempt = latestApp ? applicationEligibleForTechnicalReattemptRequest(latestApp) : false;
  const [rsCode, setRsCode] = useState("MISSED_EMERGENCY");
  const [rsText, setRsText] = useState("");
  const [rsBusy, setRsBusy] = useState(false);
  const canRequestReschedule = latestApp
    ? applicationEligibleForRescheduleRequest(latestApp, !!interviewSlotClosed)
    : false;
  const submitReschedule = async () => {
    if (!latestApp?.applicationId) return;
    setRsBusy(true);
    try {
      const r = await fetch("/api/voice-bot/reschedule-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          applicationId: latestApp.applicationId,
          candidateReasonCode: rsCode,
          candidateReasonText: rsText.trim(),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        window.alert(j.error || "Could not submit reschedule request");
      } else {
        window.alert("Reschedule request submitted. HR will review and set a new interview time.");
        setRsText("");
        if (typeof onSync === "function") await onSync();
      }
    } finally {
      setRsBusy(false);
    }
  };
  const submitReattempt = async () => {
    if (!latestApp?.applicationId) return;
    setRrBusy(true);
    try {
      const r = await fetch("/api/voice-bot/reattempt-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          applicationId: latestApp.applicationId,
          candidateReasonCode: rrCode,
          candidateReasonText: rrText.trim(),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        window.alert(j.error || "Could not submit request");
      } else {
        window.alert("Request submitted. HR will review and you will be notified here when approved.");
        setRrText("");
        if (typeof onSync === "function") await onSync();
      }
    } finally {
      setRrBusy(false);
    }
  };
  const canInterviewBtn =
    (roleLab === "SHORTLISTED" || roleLab === "APPLIED" || roleLab === "SCHEDULED") && iv.ok;
  const showInterviewBlock =
    (roleLab === "SHORTLISTED" || roleLab === "APPLIED" || roleLab === "SCHEDULED" || roleLab === "REATTMPT") && !iv.ok;
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3"><div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-black text-sm">S</div><span className="font-bold">Candidate Portal</span><Badge/></div>
        <div className="flex gap-2"><button type="button" onClick={onRights} className="px-3 py-1.5 border border-slate-600 text-slate-300 rounded-lg text-xs font-bold">🔒 Rights</button><button type="button" onClick={onLogout} className="text-slate-400 text-sm px-3">Logout</button></div>
      </div>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-5"><div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black">{candidate.name[0]}</div><div><h1 className="text-2xl font-black text-slate-900">{candidate.name}</h1><p className="text-slate-500 text-sm">{candidate.email}</p></div></div>
        {jobIdsOrdered.length > 0 ? (
          <div className="mb-4">
            <p className="text-xs font-black text-slate-400 uppercase mb-2">Your applications</p>
            <div className="flex flex-wrap gap-2">
              {jobIdsOrdered.map((jid) => {
                const j = jobs.find((x) => x.id === jid);
                const lab = portalStatusLabel(candidate, jid);
                const sel = jid === focusJobId;
                return (
                  <button
                    key={jid}
                    type="button"
                    onClick={() => typeof onPortalFocusJob === "function" && onPortalFocusJob(jid)}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-full border text-sm font-bold transition-all ${sel ? "bg-indigo-600 text-white border-indigo-600 shadow-md" : "bg-white text-slate-800 border-slate-200 hover:border-indigo-300"}`}
                  >
                    <span>{j?.title || jid}</span>
                    <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full ${SB[lab] || "bg-slate-100 text-slate-600"}`}>{lab}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {job ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-4">
            <p className="text-xs font-black text-slate-400 uppercase mb-3">Selected role</p>
            <div className="flex items-start justify-between mb-4 flex-wrap gap-2"><div><h2 className="text-xl font-bold text-slate-900">{job.title}</h2><p className="text-slate-500 text-sm">{job.designation} · {job.location}</p></div><span className={`text-xs font-black uppercase px-3 py-1.5 rounded-lg ${SB[roleLab] || "bg-slate-100"}`}>{roleLab}</span></div>
            {hrNote ? (
              <div className="bg-slate-50 rounded-xl p-4 mb-4"><p className="text-xs font-bold text-slate-400 mb-1">HR Remarks</p><p className="text-slate-700 text-sm italic">&quot;{hrNote}&quot;</p></div>
            ) : null}
            {getLatestAppForJob(candidate.applicationHistory, focusJobId)?.interviewScheduledAt ? (
              <p className={`text-xs font-bold text-teal-700 ${scheduleFlash && scheduleFlash.jobId === focusJobId && scheduleFlash.rescheduled ? "mb-1" : "mb-3"}`}>📅 Scheduled: {fmtDateTime(getLatestAppForJob(candidate.applicationHistory, focusJobId).interviewScheduledAt)}</p>
            ) : null}
            {scheduleFlash && scheduleFlash.jobId === focusJobId && scheduleFlash.rescheduled ? (
              <p className="text-xs font-semibold text-indigo-700 mb-3">* Rescheduled to {fmtDateTime(scheduleFlash.at)}</p>
            ) : null}
            {latestApp?.interviewCompletionStatus === "incomplete_technical" ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-xs text-amber-900">
                <p className="font-bold">Incomplete – technical / session issue</p>
                <p className="mt-1 text-amber-800">If the interview stopped due to network, mic, or device problems, you can request one reattempt after HR approves.</p>
              </div>
            ) : null}
            {latestApp?.reattemptRequestStatus === "pending" ? (
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 mb-3 text-xs text-slate-700 font-semibold">✓ Under Review — reattempt request pending HR approval for this role.</div>
            ) : null}
            {latestApp?.reattemptRequestStatus === "approved" && latestApp?.interviewCompletionStatus === "not_started" ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-3 text-xs text-green-800 font-semibold">HR approved a reattempt. You can start the interview again.</div>
            ) : null}
            {latestApp?.reattemptRequestStatus === "rejected" ? (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-3 text-xs text-red-800">Your last reattempt request was not approved for this role. You may submit a new request if your situation changed.</div>
            ) : null}
            {canRequestReattempt ? (
              <div className="bg-white border border-indigo-200 rounded-xl p-4 mb-3 space-y-2">
                <p className="text-xs font-black text-slate-500 uppercase">Request interview reattempt · this role</p>
                <select value={rrCode} onChange={(e) => setRrCode(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {CANDIDATE_REATTEMPT_REASONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <textarea value={rrText} onChange={(e) => setRrText(e.target.value)} rows={2} placeholder="Short details (optional)" className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
                <button type="button" disabled={rrBusy} onClick={submitReattempt} className="w-full py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg disabled:bg-slate-300">{rrBusy ? "Sending…" : "Submit request to HR"}</button>
              </div>
            ) : null}
            {canInterviewBtn && interviewSlotClosed ? (
              <div className="space-y-2">
                <p className="w-full py-3 px-4 bg-amber-50 border border-amber-200 text-amber-900 text-sm font-semibold rounded-xl text-center leading-snug">{INTERVIEW_SLOT_CLOSED_MESSAGE}</p>
                {latestApp?.rescheduleRequestStatus === "pending" ? (
                  <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 font-semibold">✓ Under Review — reschedule request pending HR approval. HR will set a new interview time.</div>
                ) : null}
                {latestApp?.rescheduleRequestStatus === "rejected" ? (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-800">Your last reschedule request was not approved for this role. You may submit a new request if your situation changed.</div>
                ) : null}
                {canRequestReschedule ? (
                  <div className="bg-white border border-indigo-200 rounded-xl p-4 space-y-2">
                    <p className="text-xs font-black text-slate-500 uppercase">Apply for reschedule · this role</p>
                    <select value={rsCode} onChange={(e) => setRsCode(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                      {CANDIDATE_RESCHEDULE_REASONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <textarea value={rsText} onChange={(e) => setRsText(e.target.value)} rows={2} placeholder="Short details (optional)" className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
                    <button type="button" disabled={rsBusy} onClick={submitReschedule} className="w-full py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg disabled:bg-slate-300">{rsBusy ? "Sending…" : "Submit reschedule request to HR"}</button>
                  </div>
                ) : null}
              </div>
            ) : canInterviewBtn && interviewCountdown ? (
              <button type="button" disabled className="w-full py-3 bg-slate-200 text-slate-600 font-bold rounded-xl cursor-not-allowed">Starts in {interviewCountdown}</button>
            ) : canInterviewBtn ? (
              <button type="button" onClick={() => onInterview(candidate.id)} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl">🎤 Start Voice Interview →</button>
            ) : showInterviewBlock ? (
              <p className="text-xs text-slate-500 mb-2">{iv.reason}</p>
            ) : null}
            {roleLab === "INTERVIEWED" && <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-center mt-3"><p className="text-teal-700 font-bold text-sm">✓ Under Review</p></div>}
            {roleLab === "REJECTED" && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center mt-3"><p className="text-red-700 font-bold text-sm">Not Selected — this role</p></div>}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center mb-4"><p className="text-slate-400 mb-4">No active application.</p><button onClick={onApply} className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl">Browse Jobs</button></div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onApply} className="py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 text-sm">Browse Jobs</button>
          <button type="button" onClick={onTalentPool} className={`py-3 bg-gradient-to-r from-indigo-50 to-purple-50 border text-indigo-700 font-bold rounded-xl text-sm ${talentPoolSelected ? "ring-2 ring-indigo-400 border-indigo-300" : "border-indigo-200"}`}>🌟 Talent Pool</button>
        </div>
      </div>
    </div>
  );
}

