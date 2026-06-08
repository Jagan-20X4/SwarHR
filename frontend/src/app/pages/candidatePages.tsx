// @ts-nocheck
import { LS_TOKEN, LS_ROLE } from "@/legacy/helpersModule";
import { Jobs } from "@/features/jobs/components/Jobs";
import { JobBoardAuth } from "@/features/jobs/components/JobBoardAuth";
import { CandDash } from "@/features/candidate-portal/components/CandDash";
import { RightsPanel } from "@/features/candidate-portal/components/RightsPanel";
import { useAppState } from "@/app/state/AppStateProvider";

export function HomePage() {
  const {
    jobs,
    active,
    scheduleBoardFlash,
    handleJobBoardApply,
    setPortalFocusJobId,
    navigate,
    setSelJob,
    startInterview,
    setTpFromPortal,
    candidateLoginPreferHomeRef,
    cmCooling,
    authStripReady,
    authCandidate,
    role,
    candidateFirstName,
    logout,
  } = useAppState();

  return (
    <Jobs
      jobs={jobs}
      applicationHistory={active?.applicationHistory || []}
      scheduleFlash={scheduleBoardFlash}
      onApply={handleJobBoardApply}
      onReattemptPortal={(job) => {
        setPortalFocusJobId(job.id);
        navigate("/portal");
      }}
      onContinueInterview={(job) => {
        setSelJob(job);
        startInterview();
      }}
      onTalentPool={() => {
        setTpFromPortal(false);
        const tok = localStorage.getItem(LS_TOKEN);
        const r0 = localStorage.getItem(LS_ROLE);
        if (tok && r0 !== "candidate") {
          candidateLoginPreferHomeRef.current = false;
          navigate("/login?returnTo=" + encodeURIComponent("/"));
          return;
        }
        navigate("/talent-pool");
      }}
      onBack={() => {}}
      coolingMonths={cmCooling}
      showBack={false}
      authStripReady={authStripReady}
      authCandidate={authCandidate}
      onTalentPoolPortal={() => navigate("/portal")}
      jobBoardAuth={
        <JobBoardAuth
          authStripReady={authStripReady}
          sessionRole={role}
          candidateFirstName={candidateFirstName}
          onLoginClick={() => {
            candidateLoginPreferHomeRef.current = true;
            navigate("/login");
          }}
          onLogoutClick={logout}
          onGoToAts={() => navigate("/hr")}
        />
      }
    />
  );
}

export function PortalPage() {
  const {
    active,
    jobs,
    portalFocusJobId,
    setPortalFocusJobId,
    navigate,
    setTpFromPortal,
    setSelJob,
    startInterview,
    logout,
    syncStateFromServer,
    scheduleBoardFlash,
  } = useAppState();

  if (!active) return null;

  return (
    <CandDash
      candidate={active}
      jobs={jobs}
      portalFocusJobId={portalFocusJobId}
      onPortalFocusJob={setPortalFocusJobId}
      onApply={() => navigate("/")}
      onTalentPool={() => {
        setTpFromPortal(true);
        navigate("/talent-pool");
      }}
      onInterview={() => {
        const jid = portalFocusJobId || active.jobId;
        const j = jobs.find((x) => x.id === jid);
        if (j) setSelJob(j);
        startInterview();
      }}
      onRights={() => navigate("/portal/rights")}
      onLogout={logout}
      talentPoolSelected={true}
      onSync={syncStateFromServer}
      scheduleFlash={scheduleBoardFlash}
    />
  );
}

export function RightsPage() {
  const {
    active,
    jobs,
    meta,
    upd,
    activeId,
    setCandidates,
    setActiveId,
    setCanPersist,
    navigate,
  } = useAppState();

  if (!active) return null;

  return (
    <RightsPanel
      candidate={active}
      jobs={jobs}
      dpo={meta?.dpo}
      onUpdate={upd}
      onErase={() => {
        setCandidates((p) => p.filter((c) => c.id !== activeId));
        setActiveId(null);
        localStorage.removeItem(LS_TOKEN);
        localStorage.removeItem(LS_ROLE);
        localStorage.removeItem(LS_CANDIDATE_ID);
        navigate("/login");
        setCanPersist(false);
      }}
      onBack={() => navigate("/portal")}
    />
  );
}
