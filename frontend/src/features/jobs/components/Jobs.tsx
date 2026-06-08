// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  fmtDate,
  fmtDateTime,
  getLatestAppForJob,
  applicationEligibleForTechnicalReattemptRequest,
  applicationHasReattemptHistory,
  getCoolingStatus,
} from "@/legacy/helpersModule";
export function Jobs({ jobs, applicationHistory = [], onApply, onContinueInterview, onReattemptPortal, onTalentPool, onBack, coolingMonths, showBack = true, authCandidate = false, onTalentPoolPortal, jobBoardAuth, authStripReady = false, scheduleFlash = null }) {
  const [q, setQ] = useState("");
  const cm = typeof coolingMonths === "number" ? coolingMonths : 3;
  const f = jobs.filter(j => j.title.toLowerCase().includes(q.toLowerCase()) || j.location.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {showBack ? <button type="button" onClick={onBack} className="text-slate-400 hover:text-white">←</button> : null}
          <span className="font-bold">Your Next Career Move Starts Here</span>
        </div>
        <div className="flex items-center gap-2 md:gap-3 flex-wrap justify-end">
          {authStripReady && authCandidate && onTalentPoolPortal ? (
            <button type="button" onClick={onTalentPoolPortal} className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-violet-100 text-indigo-900 border border-violet-200 hover:bg-violet-50 transition-colors">
              <span aria-hidden>☀</span> Talent Pool
            </button>
          ) : null}
          {jobBoardAuth}
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-black text-slate-900 mb-2">We’re Hiring🚀</h1>
        <p className="text-slate-500 mb-5">Indira IVF — India's Leading Fertility Healthcare Chain</p>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search jobs…" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl mb-4 shadow-sm focus:outline-none focus:border-indigo-400"/>
        {onTalentPool ? (
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-5 mb-5 flex items-center justify-between flex-wrap gap-3">
            <div><p className="font-bold text-indigo-900 mb-0.5">🌟 Don't see a matching role?</p><p className="text-xs text-indigo-600">Submit your CV to our talent pool — we'll reach out when something opens.</p></div>
            <button type="button" onClick={onTalentPool} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl text-sm shrink-0">Join Talent Pool →</button>
          </div>
        ) : null}
        <div className="space-y-4">{f.map(j => {
          let coolingDays = null;
          let showApplied = false;
          let doApply = false;
          let showContinue = false;
          let locked = false;
          let extraCoolingLine = null;
          const personal = authCandidate;
          if (personal && j.userStatus === "cooling") {
            locked = true;
            coolingDays = j.coolingDaysLeft;
            const st = getCoolingStatus(applicationHistory, j.id, cm);
            if (!st.canApply && st.eligibleAt) extraCoolingLine = (<p className="text-xs text-amber-600 mt-2 font-medium">Last completed interview {fmtDate(st.lastCompletedAt || st.lastAppliedAt)}. Re-apply on {fmtDate(st.eligibleAt)} ({cm}-month cooling period).</p>);
          } else if (personal && j.userStatus === "interview_pending") {
            showContinue = true;
          } else if (personal && j.userStatus === "applied") {
            showApplied = true;
          } else if (personal && j.userStatus === "open") {
            doApply = true;
          } else {
            const status = getCoolingStatus(applicationHistory, j.id, cm);
            if (status.pendingInterview) {
              showContinue = true;
            } else if (!status.canApply) {
              locked = true;
              coolingDays = status.daysRemaining;
              extraCoolingLine = (<p className="text-xs text-amber-600 mt-2 font-medium">Last completed interview {fmtDate(status.lastCompletedAt || status.lastAppliedAt)}. Re-apply on {fmtDate(status.eligibleAt)} ({cm}-month cooling period).</p>);
            } else if (status.hasApplied) {
              showApplied = true;
            } else {
              doApply = true;
            }
          }
          const dim = locked || showApplied;
          const latestAppForJob = personal ? getLatestAppForJob(applicationHistory, j.id) : null;
          const showReattemptPortal =
            personal &&
            typeof onReattemptPortal === "function" &&
            applicationEligibleForTechnicalReattemptRequest(latestAppForJob);
          const reattemptedNote =
            personal && latestAppForJob && applicationHasReattemptHistory(latestAppForJob);
          return (
            <div key={j.id} className={`bg-white rounded-2xl border p-6 flex items-start justify-between flex-wrap gap-3 ${dim ? "border-slate-200 opacity-75" : "border-slate-200 hover:shadow-lg hover:border-indigo-200"}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h2 className="text-xl font-bold text-slate-900">{j.title}</h2>
                  {locked && coolingDays != null ? <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Cooling: {coolingDays}d left</span> : null}
                  {reattemptedNote ? <span className="text-xs font-semibold text-violet-700">(*reattempted)</span> : null}
                </div>
                <p className="text-slate-500 text-sm">{j.designation} · {j.location}</p>
                <p className="text-slate-600 text-sm mt-2 line-clamp-2">{j.description}</p>
                {latestAppForJob?.interviewScheduledAt ? (
                  <p className="text-xs font-bold text-teal-700 mt-2">📅 Interview scheduled: {fmtDateTime(latestAppForJob.interviewScheduledAt)}</p>
                ) : null}
                {scheduleFlash && scheduleFlash.jobId === j.id && scheduleFlash.rescheduled ? (
                  <p className="text-xs font-semibold text-indigo-700 mt-1">* Rescheduled to {fmtDateTime(scheduleFlash.at)}</p>
                ) : null}
                {extraCoolingLine}
              </div>
              <div className="shrink-0 flex flex-col items-end gap-2">
                {doApply ? <button type="button" onClick={() => onApply(j)} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl text-sm">Apply</button> : null}
                {showContinue ? (
                  <button type="button" onClick={() => onContinueInterview(j)} className="px-5 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl text-sm">Continue interview →</button>
                ) : null}
                {showReattemptPortal ? (
                  <button type="button" onClick={() => onReattemptPortal(j)} className="px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl text-sm">Reattempt</button>
                ) : null}
                {locked ? <button type="button" disabled className="px-5 py-2 bg-slate-100 text-slate-400 font-bold rounded-xl text-sm">Locked</button> : null}
                {showApplied ? <button type="button" disabled className="px-5 py-2 bg-slate-100 text-slate-500 font-bold rounded-xl text-sm">Applied</button> : null}
              </div>
            </div>
          );
        })}{f.length === 0 ? <p className="text-center text-slate-400 py-12">No matching jobs.</p> : null}</div>
      </div>
    </div>
  );
}

