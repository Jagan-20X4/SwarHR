// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  INTERVIEW_START_GRACE_MINUTES,
} from "@/legacy/helpersModule";
import { Modal } from "@/shared/components/ui/Modal";
export function InterviewScheduleModal({ jobTitle, onConfirm, onCancel }) {
  const [local, setLocal] = useState("");
  useEffect(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setLocal(d.toISOString().slice(0, 16));
  }, []);
  return (
    <Modal title={jobTitle ? `Schedule · ${jobTitle}` : "Schedule interview"} onClose={onCancel}>
      <p className="text-xs text-slate-500 mb-3">Date and time use your device timezone. Start unlocks at this time; you have {INTERVIEW_START_GRACE_MINUTES} minutes after that to begin (HR can always start from the dashboard).</p>
      <input type="datetime-local" value={local} onChange={e => setLocal(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 mb-4 text-slate-800" />
      <button type="button" onClick={() => { if (!local) return; onConfirm(new Date(local).toISOString()); }} className="w-full py-3 bg-teal-700 hover:bg-teal-600 text-white font-bold rounded-xl">Confirm slot</button>
      <button type="button" onClick={onCancel} className="w-full mt-2 text-slate-500 text-sm py-2">Cancel</button>
    </Modal>
  );
}

