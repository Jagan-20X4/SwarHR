// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  dataUrlToBlobUrl,
  cvFetchInit,
} from "@/legacy/helpersModule";
import { TalentPoolPdfViewer } from "@/features/talent-pool/components/TalentPoolPdfViewer";
export function ResumePreviewModal({ onClose, dataUrl, downloadUrl, fileName, ext, cvText }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [remoteDataUrl, setRemoteDataUrl] = useState(null);
  const [loadError, setLoadError] = useState(null);
  useEffect(() => {
    let revoke = null;
    setLoadError(null);
    if (dataUrl) {
      const u = dataUrlToBlobUrl(dataUrl);
      setBlobUrl(u);
      setRemoteDataUrl(null);
      revoke = u;
      return () => { if (revoke) URL.revokeObjectURL(revoke); };
    }
    if (downloadUrl) {
      let cancelled = false;
      fetch(downloadUrl, cvFetchInit(downloadUrl))
        .then((r) => {
          if (!r.ok) throw new Error(`Could not load file (${r.status})`);
          return r.blob();
        })
        .then((blob) => {
          if (cancelled) return;
          const u = URL.createObjectURL(blob);
          setBlobUrl(u);
          revoke = u;
          const reader = new FileReader();
          reader.onload = () => {
            if (!cancelled) setRemoteDataUrl(reader.result);
          };
          reader.readAsDataURL(blob);
        })
        .catch((err) => {
          if (!cancelled) setLoadError(String(err?.message || err || "Failed to load resume"));
        });
      return () => {
        cancelled = true;
        if (revoke) URL.revokeObjectURL(revoke);
      };
    }
    setBlobUrl(null);
    setRemoteDataUrl(null);
  }, [dataUrl, downloadUrl]);
  const ex = (ext || "").toLowerCase();
  const effectiveDataUrl = dataUrl || remoteDataUrl;
  const isPdf = ex === "pdf" || (effectiveDataUrl && effectiveDataUrl.indexOf("data:application/pdf") === 0);
  const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(ex);
  const src = blobUrl || effectiveDataUrl || downloadUrl;
  return (
    <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h2 className="font-bold text-slate-800 truncate pr-6">{fileName || "Resume"}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center">✕</button>
        </div>
        <div className="flex-1 overflow-auto bg-slate-100 p-3 min-h-[45vh]">
          {isPdf && src ? (
            <TalentPoolPdfViewer blobUrl={blobUrl} dataUrl={effectiveDataUrl} />
          ) : isImage && src ? (
            <div className="flex justify-center">
              <img src={src} alt="" className="max-w-full max-h-[82vh] object-contain rounded-lg shadow bg-white" />
            </div>
          ) : loadError ? (
            <div className="p-6 text-center">
              <p className="text-sm text-red-600 mb-2">{loadError}</p>
              <p className="text-sm text-slate-500">Try Download again after refreshing the page, or contact HR if the issue persists.</p>
            </div>
          ) : (
            <div className="p-4">
              <p className="text-sm text-slate-600 mb-3">In-app preview works best for PDF and images. For Word documents, use the extracted text below or Download.</p>
              {cvText ? (
                <pre className="whitespace-pre-wrap font-sans text-xs bg-white p-4 rounded-xl border border-slate-200 max-h-[72vh] overflow-auto text-slate-800">{cvText}</pre>
              ) : (
                <p className="text-sm text-slate-500">No preview available. Use Download.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

