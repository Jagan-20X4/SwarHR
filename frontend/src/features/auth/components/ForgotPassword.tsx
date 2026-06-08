// @ts-nocheck
import React from "react";

/** Candidates cannot self-reset passwords; HR resets from the candidate detail screen. */
export function ForgotPassword({ onBack }) {
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
          <h1 className="text-2xl font-black text-white mb-2">Password reset</h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">
            For security, candidates cannot reset their password online. Only an
            authorised <strong className="text-slate-200">HR user</strong> can set
            a new password from the HR dashboard (open the candidate profile →
            Notes → Reset password).
          </p>
          <p className="text-slate-500 text-xs mb-6">
            If you forgot your password, contact your HR / recruitment team with
            the email you used to register.
          </p>
          <button
            type="button"
            onClick={onBack}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl"
          >
            Back to Login →
          </button>
        </div>
      </div>
    </div>
  );
}
