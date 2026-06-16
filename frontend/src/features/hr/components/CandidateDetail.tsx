// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  downloadCvFile,
  fmtDate,
  fmtDateTime,
  fmtSize,
  fileIcon,
  getLatestAppForJob,
  transcriptLinesForApplication,
  patchApplicationById,
  transcriptAvailableForJob,
  portalStatusLabel,
  applicationVoiceInterviewCompleted,
  interviewStartSlotStatus,
  SB,
  apiFetchInit,
} from "@/legacy/helpersModule";
import { Badge } from "@/shared/components/ui/Badge";
import { InterviewTranscriptPanel, buildTranscriptSections } from "@/features/hr/components/InterviewTranscriptPanel";
import { InterviewScheduleModal } from "@/features/hr/components/InterviewScheduleModal";
import { hrResetCandidatePassword } from "@/shared/api/candidatesApi";
import { exportTranscriptPdf } from "@/shared/pdf/exportPdf";
export function CandidateDetail({ candidate, jobs, onUpdate, onInterview, onAnalysis, onReschedule, autoOpenReschedule = false, onBack }) {
  const [showCV, setShowCV] = useState(false), [showTranscript, setShowTranscript] = useState(true), [remarks, setRemarks] = useState(candidate.remarks || ""), [flash, setFlash] = useState("");
  const [newPw, setNewPw] = useState(""), [confirmPw, setConfirmPw] = useState(""), [pwErr, setPwErr] = useState(""), [pwBusy, setPwBusy] = useState(false);
  const [detailTab, setDetailTab] = useState("timeline");
  const [interviewAns, setInterviewAns] = useState(null);
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [selectedApplicationId, setSelectedApplicationId] = useState(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  useEffect(() => {
    if (autoOpenReschedule) setShowReschedule(true);
  }, [autoOpenReschedule]);
  const appliedList = (candidate.applicationHistory || []).map(a => ({ ...a, job: jobs.find(j => j.id === a.jobId) })).filter(a => a.job);
  useEffect(() => {
    const valid = new Set((candidate.applicationHistory || []).map((a) => a.applicationId).filter((id) => id != null));
    setSelectedApplicationId((prev) => {
      if (prev != null && valid.has(prev)) return prev;
      return getLatestAppForJob(candidate.applicationHistory, candidate.jobId)?.applicationId ?? [...valid][0] ?? null;
    });
  }, [candidate.id, candidate.jobId, JSON.stringify((candidate.applicationHistory || []).map((a) => [a.applicationId, a.jobId]))]);
  const selectedAppRow = appliedList.find((a) => a.applicationId === selectedApplicationId) || null;
  useEffect(() => {
    if (selectedAppRow) {
      const appRm = selectedAppRow.hrRemarks != null ? String(selectedAppRow.hrRemarks) : "";
      setRemarks(appRm);
    } else {
      setRemarks(candidate.remarks || "");
    }
  }, [selectedApplicationId, candidate.id, candidate.remarks, selectedAppRow]);
  const bubbleTranscript = transcriptLinesForApplication(candidate, selectedApplicationId);
  const analysisForSelected = selectedAppRow?.analysis || candidate.analysis;
  const headerStatusLabel = portalStatusLabel(
    candidate,
    selectedAppRow?.jobId || candidate.jobId,
  );
  const headerStatusKey =
    headerStatusLabel !== "—" ? headerStatusLabel : candidate.status;
  const submitHrPasswordReset = async () => {
    setPwErr("");
    if (newPw.length < 6) {
      setPwErr("Password must be at least 6 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setPwErr("Passwords do not match.");
      return;
    }
    if (!window.confirm(`Set a new login password for ${candidate.name}?`)) return;
    setPwBusy(true);
    try {
      await hrResetCandidatePassword(candidate.id, newPw);
      setNewPw("");
      setConfirmPw("");
      setFlash("Password updated — share the new password with the candidate securely.");
      setTimeout(() => setFlash(""), 5000);
    } catch (e) {
      setPwErr(e.message || "Reset failed");
    } finally {
      setPwBusy(false);
    }
  };
  const setStatus = (s) => {
    if (selectedApplicationId != null) {
      onUpdate({
        applicationHistory: patchApplicationById(candidate.applicationHistory, selectedApplicationId, {
          hrDecisionStatus: s,
          hrRemarks: remarks,
        }),
        status: s,
      });
    } else {
      onUpdate({ status: s, remarks });
    }
    setFlash(`Updated to ${s}`);
    setTimeout(onBack, 800);
  };
  useEffect(() => {
    if (detailTab !== "timeline" && detailTab !== "interview") {
      setInterviewAns(null);
      return;
    }
    if (selectedApplicationId == null) return;
    setInterviewLoading(true);
    fetch(
      `/api/admin/applications/${selectedApplicationId}/interview-answers`,
      apiFetchInit(),
    )
      .then((r) => (r.ok ? r.json() : { answers: [] }))
      .then(setInterviewAns)
      .catch(() => setInterviewAns({ answers: [] }))
      .finally(() => setInterviewLoading(false));
  }, [detailTab, selectedApplicationId]);
  const interviewAnswers = interviewAns?.answers || [];
  const hasTranscriptData =
    interviewAnswers.length > 0 || (bubbleTranscript || []).length > 0;
  const handleExportTranscript = () => {
    const sections = buildTranscriptSections(interviewAnswers, bubbleTranscript || []);
    exportTranscriptPdf({
      candidateName: candidate.name,
      jobTitle: selectedAppRow?.job?.title || "Role",
      lang: candidate.lang,
      sections,
    });
  };
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center gap-3"><button type="button" onClick={onBack} className="text-slate-400 hover:text-white text-sm">← Back</button><span className="font-bold">Candidate Details</span><Badge/></div>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        {flash && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">✓ {flash}</div>}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {[
            { id: "timeline", label: "Timeline" },
            { id: "interview", label: "Interview" },
            { id: "notes", label: "Notes" },
          ].map((t) => (
            <button key={t.id} type="button" onClick={() => setDetailTab(t.id)} className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${detailTab === t.id ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-indigo-200"}`}>{t.label}</button>
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black">{candidate.name[0]}</div>
            <div><h1 className="text-2xl font-black text-slate-900">{candidate.name}</h1><p className="text-slate-500 text-sm">{candidate.email}</p><p className="text-xs text-slate-400 mt-1">{candidate.id}{candidate.fromTalentPool && " · 🌟 From Talent Pool"}</p></div>
          </div>
          <span className={`text-xs font-black uppercase px-3 py-1.5 rounded-lg ${SB[headerStatusKey] || SB[candidate.status] || "bg-slate-100"}`}>{headerStatusLabel !== "—" ? headerStatusLabel : candidate.status}</span>
        </div>
        {detailTab === "timeline" ? (<>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-xs font-black text-slate-400 uppercase mb-3">DPDPA Consent</h2>
          {candidate.consent ? <p className="text-sm text-slate-700">✓ Granted on {fmtDate(candidate.consentAt)}</p> : <p className="text-sm text-red-700">⚠ No consent — cannot process per §6</p>}
        </div>
        {appliedList.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-xs font-black text-slate-400 uppercase mb-1">Application History ({appliedList.length})</h2>
            <p className="text-xs text-slate-500 mb-3">Tap a role to view its full voice interview transcript below.</p>
            <div className="space-y-2">{appliedList.map((a) => (
              <button
                key={a.applicationId ?? `${a.jobId}-${a.appliedAt}`}
                type="button"
                onClick={() => a.applicationId != null && setSelectedApplicationId(a.applicationId)}
                className={`w-full text-left flex items-center justify-between p-3 rounded-xl transition-all ${a.applicationId === selectedApplicationId ? "ring-2 ring-indigo-400 ring-offset-2" : ""} ${a.jobId === candidate.jobId ? "bg-indigo-50 border border-indigo-200" : "bg-slate-50 border border-transparent hover:border-slate-200"}`}
              >
                <div>
                  <p className="font-bold text-slate-900 text-sm">{a.job.title}</p>
                  <p className="text-xs text-slate-500">{a.job.location} · Applied {fmtDate(a.appliedAt)}</p>
                  {a.interviewScheduledAt ? <p className="text-xs text-teal-700 font-semibold mt-0.5">Scheduled: {fmtDateTime(a.interviewScheduledAt)}</p> : null}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {a.jobId === candidate.jobId && <span className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">Active</span>}
                  {applicationVoiceInterviewCompleted(a) ? <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">Interviewed</span> : null}
                </div>
              </button>
            ))}</div>
            {typeof onReschedule === "function" && candidate.consent && selectedAppRow && selectedApplicationId != null && selectedAppRow.interviewScheduledAt && interviewStartSlotStatus(selectedAppRow.interviewScheduledAt, false).tooLate && !applicationVoiceInterviewCompleted(selectedAppRow) && portalStatusLabel(candidate, selectedAppRow?.jobId || candidate.jobId) !== "REJECTED" ? (
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs text-slate-500">{selectedAppRow.interviewScheduledAt ? "Candidate missed or needs a new slot? Set a new interview time." : "Set an interview time for this role."}</p>
                <button type="button" onClick={() => setShowReschedule(true)} className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-xl shrink-0">📅 Reschedule interview</button>
              </div>
            ) : null}
          </div>
        )}
        {candidate.cv && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <button type="button" onClick={() => setShowCV(!showCV)} className="w-full flex items-center justify-between"><h2 className="text-xs font-black text-slate-400 uppercase">CV / Resume {candidate.cvFile && `(${candidate.cvFile.ext.toUpperCase()})`}</h2><span className="text-indigo-500 text-xs font-bold">{showCV ? "▲ Hide" : "▼ Show"}</span></button>
            {showCV && (
              <div className="mt-4 bg-slate-50 rounded-xl p-4 border border-slate-100">
                {candidate.cvFile && (
                  <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-200">
                    <div className="flex items-center gap-2 text-sm"><span className="text-2xl">{fileIcon(candidate.cvFile.ext)}</span><div><p className="font-bold text-slate-800">{candidate.cvFile.name}</p><p className="text-xs text-slate-500">{fmtSize(candidate.cvFile.size)}</p></div></div>
                    <button type="button" onClick={() => downloadCvFile(candidate.cvFile)} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg">⬇ Download</button>
                  </div>
                )}
                <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">{candidate.cv}</pre>
              </div>
            )}
          </div>
        )}
        {selectedApplicationId != null ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            {hasTranscriptData ? (
              <div className="flex justify-end mb-3">
                <button type="button" onClick={handleExportTranscript} className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg">⬇ Export PDF</button>
              </div>
            ) : null}
            <InterviewTranscriptPanel
              jobTitle={selectedAppRow?.job?.title}
              lang={candidate.lang}
              loading={interviewLoading}
              answers={interviewAnswers}
              chatLines={bubbleTranscript || []}
              collapsed={!showTranscript}
              onToggleCollapsed={() => setShowTranscript(!showTranscript)}
            />
          </div>
        ) : null}
        {analysisForSelected && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3"><h2 className="text-xs font-black text-slate-400 uppercase">AI Analysis · {selectedAppRow?.job?.title || "—"}</h2><span className="px-3 py-1 rounded-lg text-white font-black text-xs bg-indigo-600">{analysisForSelected.rec}</span></div>
            <p className="text-slate-700 text-sm mb-3">{analysisForSelected.summary}</p>
            <div className="grid grid-cols-2 gap-3"><div className="bg-indigo-50 rounded-xl p-3"><p className="text-xs text-indigo-500 font-bold mb-1">Technical</p><p className="text-2xl font-black text-indigo-700">{analysisForSelected.tech}/10</p></div><div className="bg-teal-50 rounded-xl p-3"><p className="text-xs text-teal-500 font-bold mb-1">Communication</p><p className="text-2xl font-black text-teal-700">{analysisForSelected.comm}/10</p></div></div>
          </div>
        )}
        </>) : null}
        {detailTab === "interview" ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <p className="text-sm text-slate-600">
              Full stepwise transcript (opening, HR script, Swar AI follow-up, closing) is on the{" "}
              <button
                type="button"
                onClick={() => setDetailTab("timeline")}
                className="text-indigo-600 font-bold underline"
              >
                Timeline
              </button>{" "}
              tab for the selected application.
            </p>
            {selectedApplicationId != null && hasTranscriptData ? (
              <div className="flex justify-end">
                <button type="button" onClick={handleExportTranscript} className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg">⬇ Export PDF</button>
              </div>
            ) : null}
            {selectedApplicationId != null && (
              <InterviewTranscriptPanel
                jobTitle={selectedAppRow?.job?.title}
                lang={candidate.lang}
                loading={interviewLoading}
                answers={interviewAnswers}
                chatLines={bubbleTranscript || []}
                showHeader={false}
              />
            )}
          </div>
        ) : null}
        {detailTab === "notes" ? (
        <>
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5">
          <h2 className="text-xs font-black text-amber-800 uppercase mb-2">Reset candidate password (HR only)</h2>
          <p className="text-xs text-slate-500 mb-3">Candidates cannot reset passwords themselves. Set a temporary password and share it through your official channel.</p>
          <div className="space-y-3 max-w-md">
            <input type="password" value={newPw} onChange={(e) => { setNewPw(e.target.value); setPwErr(""); }} placeholder="New password (min 6)" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" autoComplete="new-password"/>
            <input type="password" value={confirmPw} onChange={(e) => { setConfirmPw(e.target.value); setPwErr(""); }} placeholder="Confirm password" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" autoComplete="new-password"/>
            {pwErr && <p className="text-red-600 text-xs">{pwErr}</p>}
            <button type="button" disabled={pwBusy || !newPw || !confirmPw} onClick={submitHrPasswordReset} className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-300 text-white font-bold rounded-xl text-sm">{pwBusy ? "Saving…" : "Set new password"}</button>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-xs font-black text-slate-400 uppercase mb-3">HR Actions · {selectedAppRow?.job?.title || "role"}</h2>
          <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks for this application…" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none mb-4"/>
          <div className="grid grid-cols-2 gap-2">
            {candidate.consent && portalStatusLabel(candidate, selectedAppRow?.jobId || candidate.jobId) === "APPLIED" && <button type="button" onClick={() => setStatus("SHORTLISTED")} className="py-2.5 bg-blue-600 text-white font-bold rounded-xl text-sm">✓ Shortlist</button>}
            {candidate.consent && selectedAppRow?.jobId && !transcriptAvailableForJob(candidate, selectedAppRow.jobId) && !selectedAppRow.interviewScheduledAt && (portalStatusLabel(candidate, selectedAppRow.jobId) === "SHORTLISTED" || portalStatusLabel(candidate, selectedAppRow.jobId) === "APPLIED") && <button type="button" onClick={() => typeof onInterview === "function" && onInterview(selectedAppRow.jobId)} className="py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-sm">🎤 Start interview</button>}
            {(portalStatusLabel(candidate, selectedAppRow?.jobId || candidate.jobId) === "INTERVIEWED" || analysisForSelected) && (
              <button type="button" onClick={() => typeof onAnalysis === "function" && onAnalysis(selectedApplicationId)} className="py-2.5 bg-teal-600 text-white font-bold rounded-xl text-sm">📊 Analysis</button>
            )}
            {typeof onReschedule === "function" && candidate.consent && selectedAppRow && selectedApplicationId != null && selectedAppRow.interviewScheduledAt && interviewStartSlotStatus(selectedAppRow.interviewScheduledAt, false).tooLate && !applicationVoiceInterviewCompleted(selectedAppRow) && portalStatusLabel(candidate, selectedAppRow?.jobId || candidate.jobId) !== "REJECTED" && (
              <button type="button" onClick={() => setShowReschedule(true)} className="py-2.5 bg-rose-600 text-white font-bold rounded-xl text-sm">📅 Reschedule</button>
            )}
            {portalStatusLabel(candidate, selectedAppRow?.jobId || candidate.jobId) !== "REJECTED" && candidate.status !== "WITHDRAWN" && <button type="button" onClick={() => { if (window.confirm("Reject this application?")) setStatus("REJECTED"); }} className="py-2.5 border-2 border-red-100 text-red-600 font-bold rounded-xl text-sm">✕ Reject</button>}
          </div>
        </div>
        </>
        ) : null}
      </div>
      {showReschedule && (
        <InterviewScheduleModal
          jobTitle={selectedAppRow?.job?.title}
          busy={rescheduleBusy}
          onCancel={() => !rescheduleBusy && setShowReschedule(false)}
          onConfirm={async (iso) => {
            if (selectedApplicationId == null) return;
            setRescheduleBusy(true);
            try {
              await onReschedule(selectedApplicationId, iso);
              setShowReschedule(false);
              setFlash(`Interview rescheduled to ${fmtDateTime(iso)}`);
              setTimeout(() => setFlash(""), 5000);
            } catch (e) {
              window.alert("Could not reschedule. Please try again.");
            } finally {
              setRescheduleBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
