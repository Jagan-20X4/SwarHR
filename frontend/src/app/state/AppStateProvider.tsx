// @ts-nocheck
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { flushPendingAbandonQueue } from "@/legacy/helpersModule";
import {
  authHeaders,
  apiFetchInit,
  postInterviewAbandonWithFallback,
  parsePath,
  matchJobsApplyDest,
  fmtDate,
  fmtDateTime,
  getLatestAppForJob,
  transcriptLinesForApplication,
  interviewEligibleForJob,
  interviewStartSlotStatus,
  patchLatestApp,
  patchApplicationById,
  applicationVoiceInterviewCompleted,
  hrAnalysisRoleRows,
  getCoolingStatus,
  LS_TOKEN,
  LS_ROLE,
  LS_CANDIDATE_ID,
  LS_HR_ID,
  INTERVIEW_START_GRACE_MINUTES,
} from "@/legacy/helpersModule";
import {
  fetchCandidateById,
  patchCandidateById,
  mapTalentPoolToJob as mapTalentPoolToJobApi,
} from "@/shared/api/candidatesApi";
import { SS_PENDING_JOB_APPLY } from "@/constants/storageKeys";

function persistGuestJobApply(pending) {
  try {
    sessionStorage.setItem(SS_PENDING_JOB_APPLY, JSON.stringify(pending));
  } catch (_) {}
}

function loadGuestJobApplyFromStorage() {
  try {
    const raw = sessionStorage.getItem(SS_PENDING_JOB_APPLY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function clearGuestJobApplyStorage() {
  try {
    sessionStorage.removeItem(SS_PENDING_JOB_APPLY);
  } catch (_) {}
}

const AppStateContext = createContext(null);

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const routerNavigate = useNavigate();
  const location = useLocation();
  const loc = useMemo(
    () => ({ path: location.pathname, search: location.search }),
    [location.pathname, location.search],
  );
  const [registerPhase, setRegisterPhase] = useState("consent");
  const [interviewPhase, setInterviewPhase] = useState(null);
  const [role, setRole] = useState(null), [hrId, setHrId] = useState(null);
  const [activeId, setActiveId] = useState(null), [selJob, setSelJob] = useState(null), [pending, setPending] = useState([]);
  const [analysisApplicationId, setAnalysisApplicationId] = useState(null);
  const [analysisSessionId, setAnalysisSessionId] = useState(0);
  const [portalFocusJobId, setPortalFocusJobId] = useState(null);
  const [jobs, setJobs] = useState([]), [candidates, setCandidates] = useState([]), [talentPool, setTalentPool] = useState([]), [auditLog, setAuditLog] = useState([]);
  const [hrUsers, setHrUsers] = useState({});
  const [reattemptPendingCount, setReattemptPendingCount] = useState(0);
  const [reschedulePendingCount, setReschedulePendingCount] = useState(0);
  const [meta, setMeta] = useState(null);
  const [storageReady, setStorageReady] = useState(false);
  const [canPersist, setCanPersist] = useState(false);
  const [tpFromPortal, setTpFromPortal] = useState(false);
  const saveTimer = useRef(null);
  /** Latest HR payload for debounced save (avoids stale closure). */
  const hrSavePayloadRef = useRef(null);
  /** Only one PUT /api/state at a time; queue another if state changes mid-flight. */
  const hrSaveInFlightRef = useRef(false);
  const hrSaveQueuedRef = useRef(false);
  /** Skip one auto-save cycle after applying server candidate payload (avoids save loops). */
  const skipAutoSaveRef = useRef(false);
  /** When true, candidate login/register success ignores `returnTo` and goes to `/` (job board). Set only from JobBoardAuth “Login”. Cleared after success or when Apply / Talent Pool sends user to login. */
  const candidateLoginPreferHomeRef = useRef(false);
  /** Guest talent-pool form data + CV; set on TP submit before register, cleared after HR-visible save or abandon. */
  const tpGuestEntryRef = useRef(null);
  /** Guest job apply: CV + jobId saved before login/register; cleared after /api/me/apply. */
  const guestJobApplyRef = useRef(null);
  /** Prefill CandReg when guest continues from talent pool (stable props for controlled fields). */
  const [tpGuestRegPrefill, setTpGuestRegPrefill] = useState(null);
  /** After scheduling from Intro, highlights job card / portal: `{ jobId, at, rescheduled }`. */
  const [scheduleBoardFlash, setScheduleBoardFlash] = useState(null);

  const navigate = useCallback(
    (url, opts = {}) => {
      routerNavigate(url, opts);
    },
    [routerNavigate],
  );

  useEffect(() => {
    if (!scheduleBoardFlash) return undefined;
    const t = setTimeout(() => setScheduleBoardFlash(null), 180000);
    return () => clearTimeout(t);
  }, [scheduleBoardFlash]);

  const refreshReattemptCount = async () => {
    const tok = localStorage.getItem(LS_TOKEN);
    if (!tok || localStorage.getItem(LS_ROLE) !== "hr") return;
    try {
      const r = await fetch("/api/admin/reattempt-pending-count", apiFetchInit());
      if (r.ok) {
        const j = await r.json();
        setReattemptPendingCount(j.count ?? 0);
      }
    } catch (_) {}
    try {
      const r2 = await fetch("/api/admin/reschedule-pending-count", apiFetchInit());
      if (r2.ok) {
        const j2 = await r2.json();
        setReschedulePendingCount(j2.count ?? 0);
      }
    } catch (_) {}
  };
  useEffect(() => {
    refreshReattemptCount();
    const id = setInterval(refreshReattemptCount, 60000);
    return () => clearInterval(id);
  }, [role, storageReady]);

  const refreshHrUsers = async () => {
    const tok = localStorage.getItem(LS_TOKEN);
    if (!tok || localStorage.getItem(LS_ROLE) !== "hr") return;
    try {
      const r = await fetch("/api/admin/hr-users", apiFetchInit());
      if (!r.ok) return;
      const j = await r.json();
      const map = {};
      for (const u of j.users || []) {
        if (u && u.hrId) map[u.hrId] = u.displayName || "";
      }
      setHrUsers(map);
    } catch (_) {}
  };
  useEffect(() => {
    refreshHrUsers();
  }, [role, storageReady]);

  const syncStateFromServer = async () => {
    const r0 = localStorage.getItem(LS_ROLE);
    const jr = await fetch("/api/jobs", apiFetchInit());
    const jd = jr.ok ? await jr.json() : { jobs: [], meta: null };
    const boardJobs = jd.jobs || [];
    if (r0 === "candidate") {
      const meRes = await fetch("/api/me", apiFetchInit());
      if (!meRes.ok) throw new Error("state");
      const me = await meRes.json();
      setJobs(boardJobs);
      setCandidates([me]);
      setActiveId(me.id);
      setMeta(jd.meta || null);
      setCanPersist(true);
      refreshReattemptCount();
      return;
    }
    const sr = await fetch("/api/state?hrOnly=1", apiFetchInit());
    if (!sr.ok) throw new Error("state");
    const st = await sr.json();
    const sm = Object.fromEntries(
      boardJobs.map((j) => [
        j.id,
        { userStatus: j.userStatus, coolingDaysLeft: j.coolingDaysLeft },
      ]),
    );
    const merged = (st.jobs || []).map((j) => ({
      ...j,
      ...(sm[j.id] || {}),
    }));
    setJobs(merged.length ? merged : boardJobs);
    setCandidates([]);
    setTalentPool([]);
    setAuditLog(st.auditLog || []);
    setMeta(st.meta || jd.meta || null);
    setCanPersist(true);
    refreshReattemptCount();
  };

  useEffect(() => {
    (async () => {
      let loaded = false;
      let boardJobs = [];
      let boardMeta = null;
      try {
        const jRes = await fetch("/api/jobs", apiFetchInit());
        if (jRes.ok) {
          const jd = await jRes.json();
          boardJobs = jd.jobs || [];
          boardMeta = jd.meta || null;
        }
        const tok = localStorage.getItem(LS_TOKEN);
        const r0 = localStorage.getItem(LS_ROLE);
        if (tok && r0 === "hr") {
          const sr = await fetch("/api/state?hrOnly=1", apiFetchInit());
          if (sr.ok) {
            const st = await sr.json();
            const sm = Object.fromEntries(
              boardJobs.map((j) => [
                j.id,
                { userStatus: j.userStatus, coolingDaysLeft: j.coolingDaysLeft },
              ]),
            );
            const merged = (st.jobs || []).map((j) => ({
              ...j,
              ...(sm[j.id] || {}),
            }));
            setJobs(merged.length ? merged : boardJobs);
            setCandidates([]);
            setTalentPool([]);
            setAuditLog(st.auditLog || []);
            setMeta(st.meta || boardMeta);
            loaded = true;
            setCanPersist(true);
            const hid = localStorage.getItem(LS_HR_ID);
            if (hid) setHrId(hid);
            setRole("hr");
          } else {
            setJobs(boardJobs);
            setMeta(boardMeta);
            loaded = true;
            setCanPersist(false);
          }
        } else if (tok && r0 === "candidate") {
          const meRes = await fetch("/api/me", apiFetchInit());
          if (meRes.ok) {
            const me = await meRes.json();
            setJobs(boardJobs);
            setCandidates([me]);
            setMeta(boardMeta);
            loaded = true;
            setCanPersist(true);
            setActiveId(me.id);
            localStorage.setItem(LS_CANDIDATE_ID, me.id);
            setRole("candidate");
          } else {
            setJobs(boardJobs);
            setMeta(boardMeta);
            loaded = true;
            setCanPersist(false);
          }
        } else {
          setJobs(boardJobs);
          setMeta(boardMeta);
          loaded = true;
          setCanPersist(false);
        }
      } catch (e) {
        console.error(e);
        alert("Could not load data from the API. Start the backend (npm start), create the PostgreSQL database, set DATABASE_URL in backend/.env, and run database/schema.sql.");
      } finally {
        if (loaded) setStorageReady(true);
        else navigate("/login", { replace: true });
      }
    })();
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    if (!guestJobApplyRef.current) {
      const stored = loadGuestJobApplyFromStorage();
      if (stored) guestJobApplyRef.current = stored;
    }
  }, [storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    const rt = parsePath(loc.path, loc.search);
    if (rt.name !== "apply") return;
    const j = jobs.find((x) => x.id === rt.jobId);
    if (j) setSelJob(j);
  }, [loc.path, loc.search, storageReady, jobs]);

  useEffect(() => {
    if (!storageReady) return;
    void flushPendingAbandonQueue();
    const onOnline = () => void flushPendingAbandonQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [storageReady]);

  const flushHrStateSave = useCallback(async () => {
    if (hrSaveInFlightRef.current) {
      hrSaveQueuedRef.current = true;
      return;
    }
    const payload = hrSavePayloadRef.current;
    if (!payload) return;
    hrSaveInFlightRef.current = true;
    try {
      const r = await fetch(
        "/api/state",
        apiFetchInit({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        console.error("Save failed:", t);
      }
    } catch (err) {
      console.error(err);
    } finally {
      hrSaveInFlightRef.current = false;
      if (hrSaveQueuedRef.current) {
        hrSaveQueuedRef.current = false;
        void flushHrStateSave();
      }
    }
  }, []);

  useEffect(() => {
    if (!storageReady || !canPersist) return;
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return;
    }
    const r0 = localStorage.getItem(LS_ROLE);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (r0 === "hr") {
        hrSavePayloadRef.current = {
          jobs,
          auditLog,
          saveCandidates: false,
        };
        void flushHrStateSave();
      } else if (r0 === "candidate") {
        const me = candidates.find((c) => c.id === activeId);
        if (!me) return;
        fetch(
          "/api/me",
          apiFetchInit({
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ candidate: me }),
          }),
        )
          .then(async (r) => {
            if (!r.ok) {
              const t = await r.text().catch(() => "");
              console.error("Save failed:", t);
              return;
            }
            const updated = await r.json();
            if (updated?.id) {
              skipAutoSaveRef.current = true;
              setCandidates([updated]);
            }
          })
          .catch((err) => console.error(err));
      }
    }, 2000);
    return () => clearTimeout(saveTimer.current);
  }, [
    jobs,
    auditLog,
    candidates,
    storageReady,
    canPersist,
    activeId,
    role,
    flushHrStateSave,
  ]);

  const mergeCandidateInCache = useCallback((candidate) => {
    if (!candidate?.id) return;
    setCandidates((p) => {
      const i = p.findIndex((c) => c.id === candidate.id);
      if (i >= 0) {
        const n = [...p];
        n[i] = candidate;
        return n;
      }
      return [...p, candidate];
    });
  }, []);

  const fetchCandidateForHr = useCallback(
    async (id) => {
      const c = await fetchCandidateById(id);
      mergeCandidateInCache(c);
      return c;
    },
    [mergeCandidateInCache],
  );

  const patchCandidateForHr = useCallback(
    async (id, candidatePayload) => {
      const updated = await patchCandidateById(id, candidatePayload);
      mergeCandidateInCache(updated);
      return updated;
    },
    [mergeCandidateInCache],
  );

  const cancelPendingSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    hrSaveQueuedRef.current = false;
  }, []);

  const persistCandidateNow = useCallback(async (candidatePayload) => {
    const res = await fetch(
      "/api/me",
      apiFetchInit({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate: candidatePayload }),
      }),
    );
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Save failed");
    }
    const updated = await res.json();
    if (updated?.id) {
      skipAutoSaveRef.current = true;
      setCandidates([updated]);
    }
    return updated;
  }, []);

  /** HR-only: persist jobs (and audit) to the server immediately and report the
   *  result, instead of waiting for the 2s debounced auto-save. Used by Job Master
   *  so a Save click is confirmed-on-server before showing "Saved". */
  const saveJobsNow = useCallback(
    async (jobsArg) => {
      const r0 = localStorage.getItem(LS_ROLE);
      if (r0 !== "hr") return { ok: false, error: "Only HR can save jobs." };
      const nextJobs = Array.isArray(jobsArg) ? jobsArg : jobs;
      cancelPendingSave();
      skipAutoSaveRef.current = true;
      setJobs(nextJobs);
      try {
        const r = await fetch(
          "/api/state",
          apiFetchInit({
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jobs: nextJobs,
              auditLog,
              saveCandidates: false,
            }),
          }),
        );
        if (!r.ok) {
          const t = await r.text().catch(() => "");
          return { ok: false, error: t || `Save failed (${r.status}).` };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e?.message || e) };
      }
    },
    [jobs, auditLog, cancelPendingSave],
  );

  /** Safety net: if the tab is hidden/closed while a debounced HR save is still
   *  pending, flush it immediately so unsaved job/audit changes aren't lost. */
  useEffect(() => {
    const flush = () => {
      if (!saveTimer.current) return;
      if (localStorage.getItem(LS_ROLE) !== "hr") return;
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      hrSavePayloadRef.current = { jobs, auditLog, saveCandidates: false };
      void flushHrStateSave();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [jobs, auditLog, flushHrStateSave]);

  const active = candidates.find(c => c.id === activeId);
  const upd = useCallback(
    (u) => {
      if (!activeId) return;
      setCandidates((p) =>
        p.map((c) => {
          if (c.id !== activeId) return c;
          const merged = { ...c, ...u };
          if (localStorage.getItem(LS_ROLE) === "hr") {
            void patchCandidateForHr(activeId, merged).catch((err) =>
              console.error(err),
            );
          }
          return merged;
        }),
      );
    },
    [activeId, patchCandidateForHr],
  );
  const isAnalysisRoute = location.pathname.startsWith("/hr/analysis/");
  const ivResolveJid =
    (interviewPhase === "interview" || interviewPhase === "intro") && active
      ? selJob?.id || active?.jobId
      : null;
  const ivJid = interviewPhase === "interview" && active ? (selJob?.id || active?.jobId) : null;
  const latestAppIV = ivJid ? getLatestAppForJob(active?.applicationHistory, ivJid) : null;
  const [resolvedApplicationId, setResolvedApplicationId] = useState(null);
  useEffect(() => {
    if (!ivResolveJid || !active) {
      setResolvedApplicationId(null);
      return;
    }
    let cancelled = false;
    fetch(
      `/api/me/application-for-job/${encodeURIComponent(ivResolveJid)}`,
      apiFetchInit(),
    )
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => {
        if (cancelled || d.applicationId == null) return;
        const appId = Number(d.applicationId);
        setResolvedApplicationId(appId);
        setCandidates((prev) =>
          prev.map((c) => {
            if (c.id !== activeId) return c;
            const hist = c.applicationHistory || [];
            const latest = getLatestAppForJob(hist, ivResolveJid);
            if (latest?.applicationId === appId) return c;
            return {
              ...c,
              applicationHistory: patchLatestApp(hist, ivResolveJid, {
                applicationId: appId,
              }),
            };
          }),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [interviewPhase, active?.id, activeId, ivResolveJid]);
  const company = meta?.companyName || "Indira IVF";
  const jd = selJob ? { ...selJob, companyName: company } : { id: "default", title: "Open Role", description: "", companyName: company };
  const analysisRoleRows = active ? hrAnalysisRoleRows(active) : [];
  const analysisAppIds = analysisRoleRows.map((r) => r.applicationId).filter((id) => id != null);
  const resolvedAnalysisApplicationId =
    isAnalysisRoute && active
      ? analysisAppIds.length > 0
        ? analysisApplicationId != null && analysisAppIds.includes(analysisApplicationId)
          ? analysisApplicationId
          : analysisAppIds[0]
        : null
      : analysisApplicationId;
  const analysisDecisionRow =
    active && isAnalysisRoute
      ? analysisRoleRows.length > 0 && resolvedAnalysisApplicationId != null
        ? (active.applicationHistory || []).find((x) => x.applicationId === resolvedAnalysisApplicationId) || null
        : getLatestAppForJob(active.applicationHistory || [], active.jobId)
      : null;
  const hrDecisionAllowedAnalysis = applicationVoiceInterviewCompleted(analysisDecisionRow);
  const analysisLegacyOk = Boolean(
    active && analysisRoleRows.length === 0 && active.transcript && active.transcript.length > 0,
  );
  const analysisCanOpen = Boolean(active && (analysisRoleRows.length > 0 || analysisLegacyOk));
  const cmCooling = meta?.coolingMonths ?? 3;
  const maxCvMb = meta?.maxCvMb ?? 5;

  const logAudit = (action, target, details) => setAuditLog(p => [...p, { id: "AUD-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6), timestamp: new Date().toISOString(), actor: hrId || "HR", action, target, details }]);

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch (_e) {
      /* ignore */
    }
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_ROLE);
    localStorage.removeItem(LS_CANDIDATE_ID);
    localStorage.removeItem(LS_HR_ID);
    setRole(null);
    setHrId(null);
    setActiveId(null);
    setSelJob(null);
    setAnalysisApplicationId(null);
    setPortalFocusJobId(null);
    setCanPersist(false);
    setCandidates([]);
    setTalentPool([]);
    setAuditLog([]);
    navigate("/");
    setInterviewPhase(null);
    guestJobApplyRef.current = null;
    clearGuestJobApplyStorage();
    try {
      const jRes = await fetch("/api/jobs", apiFetchInit());
      if (jRes.ok) {
        const jd = await jRes.json();
        setJobs(jd.jobs || []);
        if (jd.meta != null) setMeta(jd.meta);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const startInterview = useCallback(() => {
    setInterviewPhase("intro");
    navigate("/interview");
  }, [navigate]);

  const handleApplyToJob = (job) => {
    if (!active) return;
    const latest = getLatestAppForJob(active.applicationHistory, job.id);
    if (latest && !latest.interviewCompletedAt) {
      setSelJob(job);
      startInterview();
      return;
    }
    const status = getCoolingStatus(active.applicationHistory, job.id, cmCooling);
    if (!status.canApply && !status.pendingInterview) { alert(`⏳ Cooling period active. Re-apply in ${status.daysRemaining} days (on ${fmtDate(status.eligibleAt)}).`); return; }
    setSelJob(job);
    navigate("/jobs/" + job.id + "/apply");
  };

  const handleJobBoardApply = (job) => {
    const r0 = localStorage.getItem(LS_ROLE);
    if (r0 !== "candidate") {
      candidateLoginPreferHomeRef.current = false;
      setSelJob(job);
      navigate("/jobs/" + job.id + "/apply");
      return;
    }
    if (!active) return;
    handleApplyToJob(job);
  };

  const clearGuestJobApply = useCallback(() => {
    guestJobApplyRef.current = null;
    clearGuestJobApplyStorage();
  }, []);

  const finalizeGuestJobApply = useCallback(async ({ mode = "login" } = {}) => {
    let pending = guestJobApplyRef.current;
    if (!pending) pending = loadGuestJobApplyFromStorage();
    if (!pending?.jobId || !pending?.cvFile) return false;

    // Identity safety: a pending guest CV must only ever be submitted to the
    // account of the person who uploaded it. A fresh registration right after
    // the upload is that person; an arbitrary login may not be.
    const GUEST_APPLY_MAX_AGE_MS = 30 * 60 * 1000;
    const age = pending.createdAt ? Date.now() - pending.createdAt : Infinity;
    if (age > GUEST_APPLY_MAX_AGE_MS) {
      guestJobApplyRef.current = null;
      clearGuestJobApplyStorage();
      return false;
    }
    if (mode === "login") {
      const fileName = pending.cvFile?.name || "your uploaded resume";
      const jt = pending.jobTitle || "the selected job";
      const ok = window.confirm(
        `A resume "${fileName}" was uploaded in this browser for "${jt}".\n\n` +
          `Is it yours? OK submits it as YOUR application; Cancel discards it.`,
      );
      if (!ok) {
        guestJobApplyRef.current = null;
        clearGuestJobApplyStorage();
        return false;
      }
    }

    guestJobApplyRef.current = null;
    clearGuestJobApplyStorage();
    cancelPendingSave();

    try {
      const res = await fetch(
        "/api/me/apply",
        apiFetchInit({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: pending.jobId,
            cv: pending.cvText || pending.cvFile.cvText || "",
            cvFile: pending.cvFile,
          }),
        }),
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(body.error || "Could not submit application. Please try again.");
        guestJobApplyRef.current = pending;
        persistGuestJobApply(pending);
        return false;
      }
      const me = body.candidate;
      if (!me?.id) {
        alert("Application saved but profile could not be loaded. Refresh and try again.");
        guestJobApplyRef.current = pending;
        persistGuestJobApply(pending);
        return false;
      }
      skipAutoSaveRef.current = true;
      setCandidates([me]);
      setActiveId(me.id);
      setCanPersist(true);
      const j = jobs.find((x) => x.id === pending.jobId);
      if (j) setSelJob(j);
      startInterview();
      return true;
    } catch (e) {
      console.error(e);
      alert("Could not reach server. Check your connection and try again.");
      guestJobApplyRef.current = pending;
      persistGuestJobApply(pending);
      return false;
    }
  }, [jobs, startInterview]);

  const handleGuestCVUploaded = async (file) => {
    if (!file || !selJob) return;
    const pending = {
      jobId: selJob.id,
      jobTitle: selJob.title,
      cvFile: file,
      cvText: file.cvText || "",
      createdAt: Date.now(),
    };
    guestJobApplyRef.current = pending;
    persistGuestJobApply(pending);
    candidateLoginPreferHomeRef.current = false;
    navigate("/login");
  };

  const handleCVUploaded = async (file) => {
    if (!file || !active || !selJob) return;
    cancelPendingSave();
    try {
      const res = await fetch(
        "/api/me/apply",
        apiFetchInit({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: selJob.id,
            cv: file.cvText || "",
            cvFile: file,
          }),
        }),
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(body.error || "Could not submit application. Please try again.");
        return;
      }
      const me = body.candidate;
      if (!me?.id) {
        alert("Application saved but profile could not be loaded. Refresh and try again.");
        return;
      }
      cancelPendingSave();
      skipAutoSaveRef.current = true;
      setCandidates([me]);
      setActiveId(me.id);
      setCanPersist(true);
      startInterview();
    } catch (e) {
      console.error(e);
      alert("Could not reach server. Check your connection and try again.");
    }
  };
  const handleTalentPoolMap = async (entry, jobId) => {
    try {
      const out = await mapTalentPoolToJobApi(entry.id, jobId);
      if (out.candidate) mergeCandidateInCache(out.candidate);
      return out;
    } catch (e) {
      console.error(e);
      alert(e.message || "Could not map talent pool entry to job.");
      throw e;
    }
  };

  const authCandidate = role === "candidate" && !!localStorage.getItem(LS_TOKEN);
  const authStripReady = storageReady && (role !== "candidate" || !localStorage.getItem(LS_CANDIDATE_ID) || Boolean(active));
  const candidateFirstName = (active?.name && String(active.name).trim().split(/\s+/)[0]) || "";


  const value = useMemo(
    () => ({
      loc,
      location,
      navigate,
      role,
      setRole,
      hrId,
      setHrId,
      activeId,
      setActiveId,
      selJob,
      setSelJob,
      pending,
      setPending,
      analysisApplicationId,
      setAnalysisApplicationId,
      analysisSessionId,
      setAnalysisSessionId,
      portalFocusJobId,
      setPortalFocusJobId,
      jobs,
      setJobs,
      candidates,
      setCandidates,
      talentPool,
      setTalentPool,
      auditLog,
      setAuditLog,
      hrUsers,
      reattemptPendingCount,
      reschedulePendingCount,
      meta,
      storageReady,
      canPersist,
      setCanPersist,
      tpFromPortal,
      setTpFromPortal,
      candidateLoginPreferHomeRef,
      tpGuestEntryRef,
      guestJobApplyRef,
      clearGuestJobApply,
      finalizeGuestJobApply,
      tpGuestRegPrefill,
      setTpGuestRegPrefill,
      scheduleBoardFlash,
      setScheduleBoardFlash,
      registerPhase,
      setRegisterPhase,
      interviewPhase,
      setInterviewPhase,
      active,
      upd,
      resolvedApplicationId,
      company,
      jd,
      analysisRoleRows,
      resolvedAnalysisApplicationId,
      analysisDecisionRow,
      hrDecisionAllowedAnalysis,
      analysisLegacyOk,
      analysisCanOpen,
      cmCooling,
      maxCvMb,
      authCandidate,
      authStripReady,
      candidateFirstName,
      syncStateFromServer,
      persistCandidateNow,
      saveJobsNow,
      cancelPendingSave,
      refreshReattemptCount,
      refreshHrUsers,
      logAudit,
      logout,
      startInterview,
      handleApplyToJob,
      handleJobBoardApply,
      handleCVUploaded,
      handleGuestCVUploaded,
      handleTalentPoolMap,
      mergeCandidateInCache,
      fetchCandidateForHr,
      patchCandidateForHr,
    }),
    [
      loc,
      location,
      navigate,
      role,
      hrId,
      activeId,
      selJob,
      pending,
      analysisApplicationId,
      analysisSessionId,
      portalFocusJobId,
      jobs,
      candidates,
      talentPool,
      auditLog,
      hrUsers,
      reattemptPendingCount,
      reschedulePendingCount,
      meta,
      storageReady,
      canPersist,
      tpFromPortal,
      tpGuestRegPrefill,
      scheduleBoardFlash,
      registerPhase,
      interviewPhase,
      active,
      resolvedApplicationId,
      company,
      jd,
      analysisRoleRows,
      resolvedAnalysisApplicationId,
      analysisDecisionRow,
      hrDecisionAllowedAnalysis,
      analysisLegacyOk,
      analysisCanOpen,
      cmCooling,
      maxCvMb,
      authCandidate,
      authStripReady,
      candidateFirstName,
      mergeCandidateInCache,
      fetchCandidateForHr,
      patchCandidateForHr,
      saveJobsNow,
      upd,
      clearGuestJobApply,
      finalizeGuestJobApply,
    ],
  );

  return (
    <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
  );
}
