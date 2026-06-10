// @ts-nocheck
import React, { useState, useEffect } from "react";
import {
  fmtDateTime,
  interviewStartSlotStatus,
  formatInterviewCountdown,
  INTERVIEW_SLOT_CLOSED_MESSAGE,
} from "@/legacy/helpersModule";
import { InterviewScheduleModal } from "@/features/hr/components/InterviewScheduleModal";
export function Intro({ candidate, job, onStart, onBack, onLogout, onSchedule, interviewScheduledAt, bypassSchedule, eligibilityBlock }) {
  const [lang, setLang] = useState("English");
  const [showSched, setShowSched] = useState(false);
  const [schedBusy, setSchedBusy] = useState(false);
  const [clockTick, setClockTick] = useState(0);
  useEffect(() => {
    if (bypassSchedule || !interviewScheduledAt) return undefined;
    const id = setInterval(() => setClockTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [bypassSchedule, interviewScheduledAt]);
  void clockTick;
  const slot = interviewStartSlotStatus(interviewScheduledAt, bypassSchedule);
  const blockSchedule = Boolean(slot.blocked);
  const blockInterview = Boolean(eligibilityBlock);
  const startDisabled = blockSchedule || blockInterview;
  const countdown =
    slot.hasSlot && slot.tooEarly && interviewScheduledAt
      ? formatInterviewCountdown(interviewScheduledAt)
      : null;
  const startLabel = countdown ? `Starts in ${countdown}` : "🎤 Start →";
  const handleScheduleConfirm = async (iso) => {
    setSchedBusy(true);
    try {
      await onSchedule(iso);
      setShowSched(false);
    } finally {
      setSchedBusy(false);
    }
  };
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
        <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto flex items-center justify-center mb-4 text-3xl">🎤</div>
        <h1 className="text-2xl font-black text-white mb-1">Voice Interview</h1>
        <p className="text-slate-400 text-sm mb-1">Hello, <span className="text-white font-bold">{candidate?.name}</span></p>
        <p className="text-indigo-300 font-semibold mb-4">{job?.title}</p>
        {interviewScheduledAt ? (
          <p className="text-xs text-teal-300 mb-3">📅 Scheduled: {fmtDateTime(interviewScheduledAt)}</p>
        ) : null}
        <div className="bg-indigo-900/40 border border-indigo-800 rounded-xl p-3 mb-5 text-left text-xs text-indigo-200"><p className="font-bold text-indigo-100 mb-1">🎙️ How it works</p><p>Press Start once on the next screen. Swar asks each question aloud; your reply is captured automatically after a short pause.</p></div>
        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Language</label>
        <select value={lang} onChange={e => setLang(e.target.value)} className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white mb-5">{["English", "Hindi", "Bengali", "Tamil", "Telugu", "Kannada", "Marathi", "Gujarati", "Malayalam"].map(l => <option key={l} value={l}>{l}</option>)}</select>
        {eligibilityBlock ? <p className="text-amber-200/90 text-xs mb-3 text-left bg-amber-950/40 border border-amber-800/50 rounded-lg p-3">{eligibilityBlock}</p> : null}
        {slot.hasSlot && slot.tooEarly ? <p className="text-amber-200/90 text-xs mb-3 text-left">Start unlocks at {fmtDateTime(interviewScheduledAt)} (your time).</p> : null}
        {slot.hasSlot && slot.tooLate ? <p className="text-amber-200/90 text-xs mb-3 text-left bg-amber-950/30 border border-amber-800/40 rounded-lg p-3">{INTERVIEW_SLOT_CLOSED_MESSAGE}</p> : null}
        <button type="button" disabled={startDisabled} onClick={() => onStart(lang)} className={`w-full py-3 font-bold rounded-xl mb-3 ${startDisabled ? "bg-slate-700 text-slate-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-500 text-white"}`}>{startLabel}</button>
        {!bypassSchedule && slot.hasSlot && slot.tooLate ? null : (
          <button type="button" onClick={() => setShowSched(true)} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl mb-3 border border-indigo-500/50">Maybe later</button>
        )}
        <button type="button" onClick={onLogout} className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold rounded-xl mb-2">Logout</button>
        <button type="button" onClick={onBack} className="text-slate-500 text-sm hover:text-slate-300">← Back</button>
        {showSched ? (
          <InterviewScheduleModal
            jobTitle={job?.title}
            busy={schedBusy}
            onConfirm={handleScheduleConfirm}
            onCancel={() => { if (!schedBusy) setShowSched(false); }}
          />
        ) : null}
      </div>
    </div>
  );
}
