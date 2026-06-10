// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  INTERVIEW_START_GRACE_MINUTES,
} from "@/legacy/helpersModule";
import { Modal } from "@/shared/components/ui/Modal";
export function InterviewScheduleModal({ jobTitle, onConfirm, onCancel, busy = false }) {
  const [local, setLocal] = useState("");
  useEffect(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setLocal(d.toISOString().slice(0, 16));
  }, []);
  return (
    <Modal title={jobTitle ? `Schedule · ${jobTitle}` : "Schedule interview"} onClose={busy ? undefined : onCancel}>
      <p className="text-xs text-slate-500 mb-3"></p>
      <button
        type="button"
        disabled={busy || !local}
        onClick={() => { if (!local || busy) return; onConfirm(new Date(local).toISOString()); }}
        className="w-full py-3 bg-teal-700 hover:bg-teal-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl mb-4"
      >
        {busy ? "Saving…" : "Confirm slot"}
      </button>
      <input type="datetime-local" value={local} onChange={e => setLocal(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 mb-4 text-slate-800" />
      <button type="button" disabled={busy} onClick={onCancel} className="w-full text-slate-500 disabled:text-slate-300 text-sm py-2">Cancel</button>
    </Modal>
  );
}

