// @ts-nocheck
import { useEffect } from "react";
import {
  parsePath,
  patchLatestApp,
  patchApplicationById,
  interviewEligibleForJob,
  interviewStartSlotStatus,
  getLatestAppForJob,
  fmtDateTime,
  postInterviewAbandonWithFallback,
  INTERVIEW_START_GRACE_MINUTES,
} from "@/legacy/helpersModule";
import { Intro } from "@/features/interview/components/Intro";
import { Interview } from "@/features/interview/components/Interview";
import { Done } from "@/features/interview/components/Done";
import { useAppState } from "@/app/state/AppStateProvider";

export function InterviewFlowPage() {
  const {
    active,
    role,
    jobs,
    selJob,
    jd,
    interviewPhase,
    setInterviewPhase,
    upd,
    logout,
    navigate,
    syncStateFromServer,
    setScheduleBoardFlash,
    resolvedApplicationId,
    persistCandidateNow,
    patchCandidateForHr,
  } = useAppState();

  useEffect(() => {
    if (!interviewPhase) setInterviewPhase("intro");
  }, [interviewPhase, setInterviewPhase]);

  if (!active) return null;

  if (interviewPhase === "done") {
    return (
      <Done
        isHR={role === "hr"}
        onDash={() => {
          setInterviewPhase(null);
          if (role === "hr") navigate("/hr");
          else {
            const rt = parsePath(window.location.pathname, window.location.search);
            if (rt.name === "apply") navigate("/");
            else navigate("/portal");
          }
        }}
      />
    );
  }

  if (interviewPhase === "interview") {
    return (
      <Interview
        context={{
          jd,
          candidateName: active.name,
          language: active.lang || "English",
        }}
        applicationId={resolvedApplicationId}
        onAbandon={async (detail) => {
          const aid = resolvedApplicationId;
          if (aid) await postInterviewAbandonWithFallback(aid, detail);
          try {
            await syncStateFromServer();
          } catch (_) {}
          setInterviewPhase(null);
          navigate(role === "hr" ? "/hr" : "/portal");
        }}
        onEnd={async (t) => {
          if (!t || !t.length) {
            try {
              await syncStateFromServer();
            } catch (_) {}
            setInterviewPhase(null);
            navigate(role === "hr" ? "/hr" : "/portal");
            return;
          }
          const completedAt = new Date().toISOString();
          const jid = selJob?.id || active?.jobId;
          const appId = resolvedApplicationId;
          let nextHist = active.applicationHistory || [];
          const appPatch = {
            interviewCompletedAt: completedAt,
            transcript: t,
            interviewCompletionStatus: "completed",
            reattemptRequestStatus: "none",
          };
          if (appId != null) {
            nextHist = patchApplicationById(nextHist, appId, appPatch);
          } else if (jid) {
            nextHist = patchLatestApp(nextHist, jid, appPatch);
          }
          const merged = {
            ...active,
            transcript: t,
            status: "INTERVIEWED",
            applicationHistory: nextHist,
          };
          upd({
            transcript: t,
            status: "INTERVIEWED",
            applicationHistory: nextHist,
          });
          try {
            if (role === "hr") {
              await patchCandidateForHr(active.id, merged);
            } else {
              await persistCandidateNow(merged);
            }
          } catch (err) {
            console.error("Interview save failed:", err);
          }
          setInterviewPhase("done");
        }}
      />
    );
  }

  return (
    <Intro
      candidate={active}
      job={selJob || jobs.find((j) => j.id === active?.jobId)}
      bypassSchedule={role === "hr"}
      eligibilityBlock={
        role === "hr"
          ? null
          : (() => {
              const j = selJob || jobs.find((x) => x.id === active?.jobId);
              if (!j?.id) return null;
              const e = interviewEligibleForJob(active, j.id);
              return e.ok ? null : e.reason;
            })()
      }
      interviewScheduledAt={
        getLatestAppForJob(active.applicationHistory, selJob?.id || active?.jobId)
          ?.interviewScheduledAt
      }
      onSchedule={(iso) => {
        const jid = selJob?.id || active?.jobId;
        if (!jid) return;
        const prev = getLatestAppForJob(active.applicationHistory, jid)?.interviewScheduledAt;
        upd({
          applicationHistory: patchLatestApp(active.applicationHistory, jid, {
            interviewScheduledAt: iso,
          }),
        });
        const wasReschedule = !!(prev && String(prev) !== String(iso));
        setScheduleBoardFlash({ jobId: jid, at: iso, rescheduled: wasReschedule });
        setTimeout(() => {
          syncStateFromServer().catch(() => {});
        }, 1000);
      }}
      onLogout={logout}
      onStart={(lang) => {
        const j = selJob || jobs.find((x) => x.id === active?.jobId);
        if (j?.id && role !== "hr") {
          const e = interviewEligibleForJob(active, j.id);
          if (!e.ok) {
            window.alert(e.reason || "Interview cannot start.");
            return;
          }
          const sched = getLatestAppForJob(active.applicationHistory, j.id)?.interviewScheduledAt;
          const slot = interviewStartSlotStatus(sched, false);
          if (slot.blocked) {
            window.alert(
              slot.tooEarly
                ? `Start unlocks at ${fmtDateTime(sched)}. You have ${INTERVIEW_START_GRACE_MINUTES} minutes after that to begin.`
                : `This slot closed at ${fmtDateTime(slot.windowEndIso)}. Pick a new time with Maybe later.`,
            );
            return;
          }
        }
        upd({ lang });
        setInterviewPhase("interview");
      }}
      onBack={() => {
        setInterviewPhase(null);
        if (role === "hr") navigate("/hr");
        else {
          const rt = parsePath(window.location.pathname, window.location.search);
          if (rt.name === "apply") navigate("/");
          else navigate("/portal");
        }
      }}
    />
  );
}
