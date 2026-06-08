// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { getPdfjsLib, PDFJS_WORKER_URL } from "@/shared/utils/pdfjs";
import { TalentPoolPdfPage } from "@/features/talent-pool/components/TalentPoolPdfPage";
export function TalentPoolPdfViewer({ blobUrl, dataUrl }) {
  const [pdf, setPdf] = useState(null);
  const [nPages, setNPages] = useState(0);
  const [useIframe, setUseIframe] = useState(false);
  const url = blobUrl || dataUrl;
  useEffect(() => {
    if (!url) return;
    const lib = getPdfjsLib();
    if (!lib || typeof lib.getDocument !== "function") {
      setUseIframe(true);
      return;
    }
    lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    let cancelled = false;
    lib.getDocument({ url }).promise.then((p) => {
      if (cancelled) return;
      setPdf(p);
      setNPages(p.numPages);
    }).catch(() => {
      if (!cancelled) setUseIframe(true);
    });
    return () => { cancelled = true; };
  }, [url]);
  if (useIframe && url) {
    return <iframe title="Resume PDF" src={url} className="w-full min-h-[75vh] rounded-lg border-0 bg-white" />;
  }
  if (!pdf) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }
  return (
    <div className="overflow-y-auto max-h-[75vh] space-y-2 py-2">
      {Array.from({ length: nPages }, (_, i) => (
        <TalentPoolPdfPage key={i + 1} pdf={pdf} pageNum={i + 1} />
      ))}
    </div>
  );
}

