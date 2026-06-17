// @ts-nocheck
import { useEffect, useState } from "react";
import { useParams, useSearchParams, Outlet } from "react-router-dom";
import {
  patchLatestApp,
  patchApplicationById,
  transcriptLinesForApplication,
  apiFetchInit,
} from "@/legacy/helpersModule";
import { HRBridge } from "@/features/hr/bridge/HRBridge";
import { HRDash } from "@/features/hr/components/HRDash";
import { CandidateDetail } from "@/features/hr/components/CandidateDetail";
import { JobMaster } from "@/features/hr/components/JobMaster";
import { Screening } from "@/features/hr/components/Screening";
import { TalentPoolBrowse } from "@/features/talent-pool/components/TalentPoolBrowse";
import { AuditLogView } from "@/features/audit/components/AuditLogView";
import { ReattemptQueue } from "@/features/hr/components/ReattemptQueue";
import { RescheduleQueue } from "@/features/hr/components/RescheduleQueue";
import { Analysis } from "@/features/hr/components/Analysis";
import { CVAnalyserPage } from "@/features/cv-analyser/pages/CvAnalyserPage";
import { useAppState } from "@/app/state/AppStateProvider";

export function HrLayout() {
  const { logout } = useAppState();
  return (
    <HRBridge onLogout={logout}>
      <Outlet />
    </HRBridge>
  );
}

export function HrDashboardPage() {
  const {
    jobs,
    reattemptPendingCount,
    reschedulePendingCount,
    setActiveId,
    setSelJob,
    setAnalysisApplicationId,
    setAnalysisSessionId,
    navigate,
    startInterview,
    fetchCandidateForHr,
    logout,
  } = useAppState();

  return (
    <HRDash
      jobs={jobs}
      reattemptPendingCount={reattemptPendingCount}
      reschedulePendingCount={reschedulePendingCount}
      onView={(id) => {
        setActiveId(id);
        navigate(`/hr/candidates/${id}`);
      }}
      onInterview={async (id) => {
        setActiveId(id);
        try {
          const cand = await fetchCandidateForHr(id);
          const j = cand && jobs.find((x) => x.id === cand.jobId);
          if (j) setSelJob(j);
          startInterview();
        } catch (e) {
          console.error(e);
          alert("Could not load candidate for interview.");
        }
      }}
      onAnalysis={(id) => {
        setActiveId(id);
        setAnalysisApplicationId(null);
        setAnalysisSessionId((x) => x + 1);
        navigate(`/hr/analysis/${id}`);
      }}
      onCvAnalyser={() => navigate("/cv-analyser")}
      onJobs={() => navigate("/hr/jobs")}
      onScreen={() => navigate("/hr/screening")}
      onTalentPool={() => navigate("/hr/talent-pool")}
      onAuditLog={() => navigate("/hr/audit")}
      onReattempts={() => navigate("/hr/reattempts")}
      onReschedules={() => navigate("/hr/reschedules")}
      onReschedule={(id) => {
        setActiveId(id);
        navigate(`/hr/candidates/${id}?reschedule=1`);
      }}
      onLogout={logout}
    />
  );
}

export function HrCandidateDetailPage() {
  const { candidateId } = useParams();
  const [searchParams] = useSearchParams();
  const autoOpenReschedule = searchParams.get("reschedule") === "1";
  const {
    active,
    activeId,
    setActiveId,
    candidates,
    jobs,
    upd,
    setSelJob,
    setAnalysisApplicationId,
    setAnalysisSessionId,
    navigate,
    startInterview,
    fetchCandidateForHr,
    patchCandidateForHr,
  } = useAppState();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (candidateId && candidateId !== activeId) setActiveId(candidateId);
  }, [candidateId, activeId, setActiveId]);

  useEffect(() => {
    if (!candidateId) return;
    const cached = candidates.find((c) => c.id === candidateId);
    if (cached?.applicationHistory?.length && cached.cv !== undefined) {
      setLoading(false);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchCandidateForHr(candidateId)
      .then(() => {
        if (!cancelled) setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) {
          setLoadError("Could not load candidate.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [candidateId, candidates, fetchCandidateForHr]);

  const candidate = active || candidates.find((c) => c.id === candidateId);
  if (loading && !candidate) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">
        Loading candidate…
      </div>
    );
  }
  if (loadError && !candidate) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <p className="text-red-600">{loadError}</p>
        <button
          type="button"
          onClick={() => navigate("/hr")}
          className="text-indigo-600 font-bold"
        >
          ← Back to dashboard
        </button>
      </div>
    );
  }
  if (!candidate) return null;

  return (
    <CandidateDetail
      candidate={candidate}
      jobs={jobs}
      onUpdate={upd}
      onInterview={(jobId) => {
        const j = jobs.find((x) => x.id === (jobId || candidate.jobId));
        if (j) setSelJob(j);
        startInterview();
      }}
      onAnalysis={(appId) => {
        setAnalysisApplicationId(appId ?? null);
        setAnalysisSessionId((x) => x + 1);
        navigate(`/hr/analysis/${candidate.id}${appId != null ? `?appId=${appId}` : ""}`);
      }}
      onReschedule={async (applicationId, iso) => {
        const nextHist = patchApplicationById(candidate.applicationHistory, applicationId, {
          interviewScheduledAt: iso,
          interviewCompletionStatus: "not_started",
        });
        const merged = { ...candidate, applicationHistory: nextHist };
        upd({ applicationHistory: nextHist });
        await patchCandidateForHr(candidate.id, merged);
        void fetch(
          `/api/admin/applications/${applicationId}/reschedule-notify`,
          apiFetchInit({ method: "POST" }),
        ).catch((err) => console.error("reschedule-notify email failed:", err));
      }}
      autoOpenReschedule={autoOpenReschedule}
      onBack={() => navigate("/hr")}
    />
  );
}

export function HrJobMasterPage() {
  const { jobs, setJobs, saveJobsNow, navigate } = useAppState();
  return (
    <JobMaster
      jobs={jobs}
      onSave={setJobs}
      onSaveNow={saveJobsNow}
      onBack={() => navigate("/hr")}
    />
  );
}

export function HrScreeningPage() {
  const { jobs, navigate } = useAppState();
  return (
    <Screening
      jobs={jobs}
      onShortlist={() => navigate("/hr")}
      onBack={() => navigate("/hr")}
    />
  );
}

export function HrTalentPoolPage() {
  const {
    jobs,
    candidates,
    handleTalentPoolMap,
    fetchCandidateForHr,
    logAudit,
    cmCooling,
    navigate,
  } = useAppState();

  const resolveExistingByEmail = async (email) => {
    const cached = candidates.find(
      (c) => c.email?.toLowerCase() === email?.toLowerCase(),
    );
    if (cached) return cached;
    const { findCandidateIdByEmail } = await import("@/shared/api/candidatesApi");
    const id = await findCandidateIdByEmail(email);
    if (!id) return null;
    return fetchCandidateForHr(id);
  };

  return (
    <TalentPoolBrowse
      jobs={jobs}
      candidates={candidates}
      resolveExistingByEmail={resolveExistingByEmail}
      onMapToJob={handleTalentPoolMap}
      onLogAudit={logAudit}
      onBack={() => navigate("/hr")}
      coolingMonths={cmCooling}
    />
  );
}

export function HrAuditPage() {
  const { auditLog, candidates, hrUsers, refreshHrUsers, navigate } = useAppState();
  return (
    <AuditLogView
      auditLog={auditLog}
      candidates={candidates}
      hrUsers={hrUsers}
      onRefresh={refreshHrUsers}
      onBack={() => navigate("/hr")}
    />
  );
}

export function HrReattemptsPage() {
  const { navigate, refreshReattemptCount, syncStateFromServer } = useAppState();
  return (
    <ReattemptQueue
      onBack={() => {
        navigate("/hr");
        refreshReattemptCount();
      }}
      onResolved={async () => {
        await syncStateFromServer();
        await refreshReattemptCount();
      }}
    />
  );
}

export function HrReschedulesPage() {
  const { navigate, refreshReattemptCount, syncStateFromServer } = useAppState();
  return (
    <RescheduleQueue
      onBack={() => {
        navigate("/hr");
        refreshReattemptCount();
      }}
      onResolved={async () => {
        await syncStateFromServer();
        await refreshReattemptCount();
      }}
    />
  );
}

export function HrAnalysisPage() {
  const { candidateId } = useParams();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const {
    active,
    activeId,
    setActiveId,
    candidates,
    jobs,
    company,
    analysisRoleRows,
    resolvedAnalysisApplicationId,
    analysisSessionId,
    analysisCanOpen,
    hrDecisionAllowedAnalysis,
    setAnalysisApplicationId,
    upd,
    logout,
    navigate,
    fetchCandidateForHr,
  } = useAppState();

  useEffect(() => {
    if (candidateId && candidateId !== activeId) setActiveId(candidateId);
  }, [candidateId, activeId, setActiveId]);

  useEffect(() => {
    if (!candidateId) return;
    const cached = candidates.find((c) => c.id === candidateId);
    if (cached?.applicationHistory?.length) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchCandidateForHr(candidateId)
      .then(() => {
        if (!cancelled) setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [candidateId, candidates, fetchCandidateForHr]);

  useEffect(() => {
    const appId = searchParams.get("appId");
    if (appId) setAnalysisApplicationId(Number(appId));
  }, [searchParams, setAnalysisApplicationId]);

  const candidate = active || candidates.find((c) => c.id === candidateId);
  if (loading && !candidate) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">
        Loading analysis…
      </div>
    );
  }
  if (!candidate || !analysisCanOpen) return null;

  return (
    <Analysis
      key={`hr-analysis-${analysisSessionId}`}
      context={{
        jd: (() => {
          if (analysisRoleRows.length > 0 && resolvedAnalysisApplicationId != null) {
            const row = candidate.applicationHistory.find(
              (x) => x.applicationId === resolvedAnalysisApplicationId,
            );
            const jj = row && jobs.find((x) => x.id === row.jobId);
            return jj
              ? { ...jj, companyName: company }
              : { id: "default", title: "Open Role", description: "", companyName: company };
          }
          const lj = jobs.find((x) => x.id === candidate.jobId);
          return lj
            ? { ...lj, companyName: company }
            : { id: "default", title: "Open Role", description: "", companyName: company };
        })(),
        candidateName: candidate.name,
        language: candidate.lang || "English",
      }}
      transcript={
        analysisRoleRows.length > 0 && resolvedAnalysisApplicationId != null
          ? transcriptLinesForApplication(candidate, resolvedAnalysisApplicationId) || []
          : candidate.transcript || []
      }
      savedAnalysis={(() => {
        if (resolvedAnalysisApplicationId == null) return candidate.analysis;
        const row = (candidate.applicationHistory || []).find(
          (x) => x.applicationId === resolvedAnalysisApplicationId,
        );
        return row?.analysis != null ? row.analysis : candidate.analysis;
      })()}
      roleTabs={analysisRoleRows.map((row) => ({
        applicationId: row.applicationId,
        label: jobs.find((j) => j.id === row.jobId)?.title || row.jobId || "Role",
      }))}
      selectedApplicationId={resolvedAnalysisApplicationId}
      onSelectApplication={setAnalysisApplicationId}
      initialRemarks={(() => {
        if (resolvedAnalysisApplicationId == null) return candidate.remarks || "";
        const row = (candidate.applicationHistory || []).find(
          (x) => x.applicationId === resolvedAnalysisApplicationId,
        );
        return row?.hrRemarks != null ? String(row.hrRemarks) : "";
      })()}
      hrDecisionAllowed={hrDecisionAllowedAnalysis}
      onDecision={(s, r, a) => {
        const analysisToSave =
          a && typeof a === "object"
            ? {
                summary: a.summary || "",
                tech: a.tech != null ? a.tech : 0,
                comm: a.comm != null ? a.comm : 0,
                rec: a.rec || "",
                strengths: a.strengths || [],
                areas: a.areas || [],
              }
            : a;
        if (resolvedAnalysisApplicationId != null && analysisRoleRows.length > 0) {
          upd({
            applicationHistory: patchApplicationById(
              candidate.applicationHistory,
              resolvedAnalysisApplicationId,
              { hrRemarks: r, hrDecisionStatus: s, analysis: analysisToSave },
            ),
            status: s,
            analysis: analysisToSave,
          });
        } else {
          upd({ status: s, remarks: r, analysis: analysisToSave });
        }
        navigate("/hr");
      }}
      onBack={() => navigate("/hr")}
      onLogout={logout}
    />
  );
}

export function CvAnalyserRoutePage() {
  const { jobs, navigate, syncStateFromServer, logout } = useAppState();
  return (
    <HRBridge onLogout={logout}>
      <CVAnalyserPage
        jobs={jobs}
        onBack={() => navigate("/hr")}
        onSynced={syncStateFromServer}
      />
    </HRBridge>
  );
}
