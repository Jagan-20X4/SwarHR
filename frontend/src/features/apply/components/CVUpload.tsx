// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  fmtSize,
  fileIcon,
  processResumeFile,
} from "@/legacy/helpersModule";
export function CVUpload({ jobTitle, onComplete, onBack, maxCvMb }) {
  const [file, setFile] = useState(null), [processing, setProcessing] = useState(false), [submitting, setSubmitting] = useState(false), [error, setError] = useState(""), [ack, setAck] = useState(false);
  const ref = useRef();
  const mb = typeof maxCvMb === "number" ? maxCvMb : 5;
  const handleFile = async (f) => { if (!f) return; setError(""); setProcessing(true); try { setFile(await processResumeFile(f, mb)); } catch (e) { setError(e.message); setFile(null); } finally { setProcessing(false); } };
  const handleSubmit = async () => {
    if (!file || !ack || processing || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await onComplete(file);
    } catch (e) {
      setError(e?.message || "Submit failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };
  const busy = processing || submitting;
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <button onClick={onBack} disabled={submitting} className="text-slate-500 hover:text-slate-700 mb-6 text-sm disabled:opacity-50">← Back</button>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8">
          <h1 className="text-2xl font-black text-slate-900 mb-1">Upload Resume</h1>
          <p className="text-slate-500 text-sm mb-4">For: <span className="font-bold text-indigo-600">{jobTitle}</span></p>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-xs"><p className="font-bold text-slate-700 mb-1">📎 Accepted formats</p><p className="text-slate-600">JPG · JPEG · PDF · DOC · DOCX <span className="text-slate-400">(max {mb} MB)</span></p></div>
          <div onClick={() => !busy && ref.current?.click()} className={`border-2 border-dashed rounded-xl p-6 text-center ${busy ? "cursor-wait opacity-80" : "cursor-pointer"} mb-3 ${error ? "border-red-300 bg-red-50" : file ? "border-green-300 bg-green-50" : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50"}`}>
            {processing ? <><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2"/><p className="text-slate-500 text-sm">Processing…</p></> :
             file ? <><div className="text-3xl mb-1">{fileIcon(file.ext)}</div><p className="text-slate-700 text-sm font-semibold truncate">{file.name}</p><p className="text-slate-500 text-xs mt-1">{file.ext.toUpperCase()} · {fmtSize(file.size)} · ✓ Validated</p><p className="text-indigo-500 text-xs mt-2 underline">Choose different</p></> :
             <><svg className="w-10 h-10 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg><p className="text-slate-700 text-sm font-semibold">Click to upload</p><p className="text-slate-400 text-xs mt-1">JPG · JPEG · PDF · DOC · DOCX</p></>}
          </div>
          <input ref={ref} type="file" accept=".jpg,.jpeg,.pdf,.doc,.docx" onChange={e => handleFile(e.target.files?.[0])} className="hidden"/>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm mb-4 flex gap-2"><span>⚠</span><span>{error}</span></div>}
          <label className={`flex gap-3 p-3 rounded-xl border mb-4 ${busy ? "opacity-60" : "cursor-pointer"} ${ack ? "border-indigo-300 bg-indigo-50" : "border-slate-200"}`}><input type="checkbox" checked={ack} onChange={() => setAck(!ack)} disabled={busy} className="mt-0.5 w-4 h-4 accent-indigo-500 shrink-0"/><p className="text-xs text-slate-600">I acknowledge processing for recruitment.</p></label>
          <button onClick={handleSubmit} disabled={!file || !ack || busy} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 text-white font-bold rounded-xl">{submitting ? "Submitting application…" : "Submit →"}</button>
        </div>
      </div>
    </div>
  );
}

