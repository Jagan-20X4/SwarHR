import * as pdfjs from "pdfjs-dist";

export const PDFJS_WORKER_URL = new URL(
  "pdfjs-dist/build/pdf.worker.min.js",
  import.meta.url,
).toString();

export function setupPdfJs(): void {
  if (typeof window === "undefined") return;
  (window as Window & { pdfjsLib?: typeof pdfjs }).pdfjsLib = pdfjs;
}

export function getPdfjsLib(): typeof pdfjs | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { pdfjsLib?: typeof pdfjs }).pdfjsLib ?? null;
}
