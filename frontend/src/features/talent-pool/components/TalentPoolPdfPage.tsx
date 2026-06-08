// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
export function TalentPoolPdfPage({ pdf, pageNum }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    pdf.getPage(pageNum).then((page) => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const scale = 1.35;
      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      page.render({ canvasContext: ctx, viewport }).promise.catch(() => {});
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [pdf, pageNum]);
  return <canvas ref={canvasRef} className="mb-3 shadow-md bg-white mx-auto max-w-full block rounded border border-slate-200" />;
}

