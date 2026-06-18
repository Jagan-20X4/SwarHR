// @ts-nocheck
import React, { useState } from "react";

export function ForgotPassword({ onBack }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const requestCode = async () => {
    setErr("");
    if (!email.trim()) {
      setErr("Enter your email.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 404) {
        setErr("Incorrect email — no account found.");
        return;
      }
      if (!res.ok) {
        setErr(data.error || "Could not send the code. Try again.");
        return;
      }
      setStep(2);
    } catch (e) {
      setErr("Cannot reach server. Start the backend and try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async () => {
    setErr("");
    if (!/^\d{6}$/.test(code.trim())) {
      setErr("Enter the 6-digit code from your email.");
      return;
    }
    if (newPassword.length < 8) {
      setErr("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setErr("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
          newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || "Could not reset password.");
        return;
      }
      setStep(3);
    } catch (e) {
      setErr("Cannot reach server. Start the backend and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button
          type="button"
          onClick={onBack}
          className="text-slate-400 hover:text-white mb-6 text-sm"
        >
          ← Back to Login
        </button>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="w-12 h-12 bg-amber-900/40 border border-amber-700 rounded-xl flex items-center justify-center mb-4 text-2xl">
            🔒
          </div>

          {step === 1 && (
            <>
              <h1 className="text-2xl font-black text-white mb-2">Forgot password</h1>
              <p className="text-slate-400 text-sm leading-relaxed mb-5">
                Enter your registered email and we'll send a 6-digit code to reset your password.
              </p>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErr(""); }}
                onKeyDown={(e) => e.key === "Enter" && requestCode()}
                placeholder="your@email.com"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-4"
              />
              {err && <p className="text-red-400 text-sm mb-4">⚠ {err}</p>}
              <button
                type="button"
                onClick={requestCode}
                disabled={busy || !email.trim()}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold rounded-xl"
              >
                {busy ? "Sending code…" : "Send code →"}
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-2xl font-black text-white mb-2">Enter code</h1>
              <p className="text-slate-400 text-sm leading-relaxed mb-5">
                We sent a 6-digit code to <span className="text-slate-200 font-semibold">{email}</span>. It expires in 10 minutes.
              </p>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Temporary code</label>
              <input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setErr(""); }}
                placeholder="123456"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white tracking-[0.4em] text-center font-bold placeholder-slate-600 focus:outline-none focus:border-indigo-500 mb-4"
              />
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">New password</label>
              <div className="relative mb-4">
                <input
                  type={showPw ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setErr(""); }}
                  placeholder="At least 8 characters"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold"
                >
                  {showPw ? "HIDE" : "SHOW"}
                </button>
              </div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Confirm password</label>
              <input
                type={showPw ? "text" : "password"}
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setErr(""); }}
                onKeyDown={(e) => e.key === "Enter" && submitReset()}
                placeholder="Re-enter new password"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-4"
              />
              {err && <p className="text-red-400 text-sm mb-4">⚠ {err}</p>}
              <button
                type="button"
                onClick={submitReset}
                disabled={busy || !code.trim() || !newPassword || !confirm}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold rounded-xl"
              >
                {busy ? "Changing password…" : "Change password →"}
              </button>
              <button
                type="button"
                onClick={() => { setStep(1); setErr(""); setCode(""); }}
                className="w-full mt-3 text-slate-400 hover:text-white text-sm"
              >
                Use a different email
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="text-2xl font-black text-white mb-2">Password changed ✓</h1>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                Your password has been updated. You can now sign in with your new password.
              </p>
              <button
                type="button"
                onClick={onBack}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl"
              >
                Back to Login →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
