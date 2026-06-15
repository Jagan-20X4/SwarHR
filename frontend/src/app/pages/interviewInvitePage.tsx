// @ts-nocheck
import React, { useEffect } from "react";
import { useAppState } from "@/app/state/AppStateProvider";
import { LS_ROLE } from "@/legacy/helpersModule";

export function InterviewInvitePage() {
  const { jobs, navigate } = useAppState();

  const sp = new URLSearchParams(window.location.search);
  const jobId = sp.get("jobId") || "";

  const role = localStorage.getItem(LS_ROLE);
  const job = jobs.find((j) => j.id === jobId);
  const jobTitle = job?.title || "";

  // Candidate already logged in → go straight to their portal
  useEffect(() => {
    if (role === "candidate") {
      navigate("/portal");
    }
  }, [role, navigate]);

  if (role === "candidate") return null;

  const handleLogin = () => {
    navigate("/login?returnTo=" + encodeURIComponent("/portal"));
  };

  const handleRegister = () => {
    if (jobId) {
      navigate("/jobs/" + encodeURIComponent(jobId) + "/apply");
    } else {
      navigate("/register?returnTo=" + encodeURIComponent("/portal"));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black mx-auto mb-3 shadow-2xl">
            S
          </div>
          <p className="text-indigo-300 text-xs font-semibold uppercase tracking-widest">
            Swar · AI Interview Platform
          </p>
        </div>

        {/* Main card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <div className="text-center mb-6">
            <span className="text-5xl mb-3 block">🎤</span>
            <h1 className="text-2xl font-black text-slate-900 mb-1">
              You're Invited to Interview
            </h1>
            {jobTitle && (
              <p className="text-indigo-600 font-bold text-sm mt-1">
                {jobTitle} · Indira IVF Hospital Ltd.
              </p>
            )}
          </div>

          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-6">
            <p className="text-slate-700 text-sm leading-relaxed">
              Your AI voice interview is ready and waiting. Please log in with
              your registered email to begin.
            </p>
          </div>

          {/* Guidelines */}
          <div className="mb-6">
            <p className="text-xs font-black text-slate-400 uppercase mb-3">
              Before you begin, make sure you have
            </p>
            <div className="space-y-2">
              {[
                "Stable internet connection throughout",
                "Quiet location with minimal background noise",
                "Well-lit area with a plain light background",
                "A working microphone on your device",
                "Time to complete the interview in one session",
              ].map((g) => (
                <div key={g} className="flex items-start gap-2 text-sm text-slate-600">
                  <span className="text-indigo-400 font-bold mt-0.5">·</span>
                  <span>{g}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Primary CTA */}
          <button
            type="button"
            onClick={handleLogin}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-black rounded-2xl text-base shadow-lg transition-colors"
          >
            Log in to Start Interview →
          </button>

          {/* Secondary — new candidates */}
          <p className="text-center text-xs text-slate-400 mt-4">
            Don&apos;t have an account yet?{" "}
            <button
              type="button"
              onClick={handleRegister}
              className="text-indigo-500 font-bold underline"
            >
              Create account &amp; apply
            </button>
          </p>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          Indira IVF Hospital Ltd. · Powered by Swar AI
        </p>
      </div>
    </div>
  );
}
