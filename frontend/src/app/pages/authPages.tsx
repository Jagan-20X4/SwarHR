// @ts-nocheck
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  apiFetchInit,
  matchJobsApplyDest,
  LS_TOKEN,
  LS_ROLE,
  LS_CANDIDATE_ID,
  LS_HR_ID,
} from "@/legacy/helpersModule";
import { Login } from "@/features/auth/components/LoginForm";
import { ForgotPassword } from "@/features/auth/components/ForgotPassword";
import { ConsentScreen } from "@/features/auth/components/ConsentScreen";
import { CandReg } from "@/features/auth/components/CandRegForm";
import { CVUpload } from "@/features/apply/components/CVUpload";
import { useAppState } from "@/app/state/AppStateProvider";

export function LoginPage() {
  const {
    meta,
    navigate,
    setRole,
    setActiveId,
    setHrId,
    setSelJob,
    syncStateFromServer,
    candidateLoginPreferHomeRef,
  } = useAppState();

  return (
    <Login
      coolingMonths={meta?.coolingMonths}
      dpo={meta?.dpo}
      onCandSuccess={async ({ candidateId, token }) => {
        localStorage.setItem(LS_TOKEN, token || "cookie");
        localStorage.setItem(LS_ROLE, "candidate");
        localStorage.setItem(LS_CANDIDATE_ID, candidateId);
        setRole("candidate");
        setActiveId(candidateId);
        try {
          await syncStateFromServer();
        } catch (e) {}
        const preferHome = candidateLoginPreferHomeRef.current;
        candidateLoginPreferHomeRef.current = false;
        const sp = new URLSearchParams(window.location.search);
        const dest = preferHome ? "/" : sp.get("returnTo") || "/";
        const applyDest = matchJobsApplyDest(dest);
        if (applyDest) {
          const jr2 = await fetch("/api/jobs", apiFetchInit());
          if (jr2.ok) {
            const jd2 = await jr2.json();
            const jj = (jd2.jobs || []).find((x) => x.id === applyDest.jobId);
            if (jj) setSelJob(jj);
          }
        }
        navigate(dest);
      }}
      onHrSuccess={async ({ hrId, token }) => {
        localStorage.setItem(LS_TOKEN, token || "cookie");
        localStorage.setItem(LS_ROLE, "hr");
        localStorage.setItem(LS_HR_ID, hrId);
        setRole("hr");
        setHrId(hrId);
        try {
          await syncStateFromServer();
        } catch (e) {}
        const sp = new URLSearchParams(window.location.search);
        navigate(sp.get("returnTo") || "/hr");
      }}
      onRegister={() => {
        const sp = new URLSearchParams(window.location.search);
        const r = sp.get("returnTo");
        navigate("/register" + (r ? "?returnTo=" + encodeURIComponent(r) : ""));
      }}
      onForgot={() => navigate("/login/forgot")}
    />
  );
}

export function ForgotPasswordPage() {
  const { navigate } = useAppState();
  return <ForgotPassword onBack={() => navigate("/login")} />;
}

export function RegisterPage() {
  const {
    meta,
    navigate,
    pending,
    setPending,
    registerPhase,
    setRegisterPhase,
    tpGuestEntryRef,
    tpGuestRegPrefill,
    setTpGuestRegPrefill,
    candidateLoginPreferHomeRef,
    setRole,
    setActiveId,
    setSelJob,
    setTalentPool,
    syncStateFromServer,
  } = useAppState();

  useEffect(() => {
    setRegisterPhase("consent");
  }, [setRegisterPhase]);

  if (registerPhase === "consent") {
    return (
      <ConsentScreen
        dataCategories={meta?.dataCategories}
        coolingMonths={meta?.coolingMonths}
        dpo={meta?.dpo}
        onAccept={(p) => {
          setPending(p);
          setRegisterPhase("form");
        }}
        onDecline={() => {
          if (tpGuestEntryRef.current) {
            navigate("/talent-pool");
            return;
          }
          const sp = new URLSearchParams(window.location.search);
          const r = sp.get("returnTo");
          navigate("/login" + (r ? "?returnTo=" + encodeURIComponent(r) : ""));
        }}
      />
    );
  }

  return (
    <CandReg
      key={tpGuestRegPrefill ? `tp-reg-${tpGuestRegPrefill.email}` : "reg"}
      initialName={tpGuestRegPrefill?.name || ""}
      initialEmail={tpGuestRegPrefill?.email || ""}
      onRegister={async (f) => {
        if (!f.name.trim()) return;
        try {
          const res = await fetch(
            "/api/auth/register",
            apiFetchInit({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: f.name,
              email: f.email,
              password: f.password,
              purposes: pending,
            }),
          }),
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            alert(data.error || "Registration failed");
            return;
          }
          localStorage.setItem(LS_TOKEN, data.token || "cookie");
          localStorage.setItem(LS_ROLE, "candidate");
          if (data.candidateId) localStorage.setItem(LS_CANDIDATE_ID, data.candidateId);
          setRole("candidate");
          setActiveId(data.candidateId);
          try {
            await syncStateFromServer();
          } catch (e) {}
          const tpPending = tpGuestEntryRef.current;
          if (tpPending && data.candidateId) {
            tpGuestEntryRef.current = null;
            setTpGuestRegPrefill(null);
            candidateLoginPreferHomeRef.current = false;
            const finalized = {
              ...tpPending,
              candidateId: data.candidateId,
              id: tpPending.id || "TP-" + Date.now(),
            };
            try {
              await fetch(
                "/api/talent-pool",
                apiFetchInit({
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(finalized),
                }),
              );
            } catch (_) {}
            setTalentPool((p) => [...p, finalized]);
            navigate("/talent-pool/done");
            return;
          }
          const preferHome = candidateLoginPreferHomeRef.current;
          candidateLoginPreferHomeRef.current = false;
          const sp = new URLSearchParams(window.location.search);
          const dest = preferHome ? "/" : sp.get("returnTo") || "/";
          const applyDest = matchJobsApplyDest(dest);
          if (applyDest) {
            const jr2 = await fetch("/api/jobs", apiFetchInit());
            if (jr2.ok) {
              const jd2 = await jr2.json();
              const jj = (jd2.jobs || []).find((x) => x.id === applyDest.jobId);
              if (jj) setSelJob(jj);
            }
          }
          navigate(dest);
        } catch (e) {
          alert("Could not reach server.");
        }
      }}
      onBack={() => {
        if (tpGuestEntryRef.current) {
          navigate("/talent-pool");
          return;
        }
        const sp = new URLSearchParams(window.location.search);
        const r = sp.get("returnTo");
        navigate("/login" + (r ? "?returnTo=" + encodeURIComponent(r) : ""));
      }}
    />
  );
}

export function ApplyPage() {
  const { jobId } = useParams();
  const {
    jobs,
    selJob,
    setSelJob,
    maxCvMb,
    handleCVUploaded,
    navigate,
    storageReady,
  } = useAppState();

  useEffect(() => {
    if (!storageReady || !jobId) return;
    const j = jobs.find((x) => x.id === jobId);
    if (j) setSelJob(j);
  }, [storageReady, jobId, jobs, setSelJob]);

  const job = selJob || jobs.find((x) => x.id === jobId);
  if (!job) return null;

  return (
    <CVUpload
      jobTitle={job.title}
      maxCvMb={maxCvMb}
      onComplete={handleCVUploaded}
      onBack={() => {
        navigate("/");
        setSelJob(null);
      }}
    />
  );
}
