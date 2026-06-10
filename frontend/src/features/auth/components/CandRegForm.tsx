// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
export function CandReg({ onRegister, onBack, initialName = "", initialEmail = "" }) {
  const [f, setF] = useState({ name: initialName || "", email: initialEmail || "", password: "" });
  const canSubmit = Boolean(f.name.trim() && f.email.trim() && f.password.trim());

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onRegister(f);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button type="button" onClick={onBack} className="text-slate-400 hover:text-white mb-6 text-sm">← Back</button>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <h1 className="text-2xl font-black text-white mb-6">Create Account</h1>
          <form onSubmit={submit} className="space-y-4">
            {[["name", "Full Name", "text"], ["email", "Email", "email"], ["password", "Password", "password"]].map(([k, l, t]) => (
              <div key={k}>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{l}</label>
                <input
                  type={t}
                  value={f[k]}
                  onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            ))}
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold rounded-xl"
            >
              Register →
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

