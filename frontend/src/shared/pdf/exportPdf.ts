// @ts-nocheck
import { jsPDF } from "jspdf";

const MARGIN = 48;
const LINE = 16;

function slugify(s) {
  return String(s || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "export";
}

/** Lightweight writer that tracks the cursor and adds pages as needed. */
function createWriter(doc) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - MARGIN * 2;
  let y = MARGIN;

  const ensure = (needed = LINE) => {
    if (y + needed > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const text = (str, { size = 10, style = "normal", color = [30, 41, 59], gap = 0, indent = 0 } = {}) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(String(str ?? ""), maxWidth - indent);
    lines.forEach((ln) => {
      ensure(LINE);
      doc.text(ln, MARGIN + indent, y);
      y += LINE;
    });
    if (gap) y += gap;
  };

  const rule = (gap = 6) => {
    ensure(gap);
    doc.setDrawColor(226, 232, 240);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    y += gap;
  };

  const space = (h = LINE) => {
    ensure(h);
    y += h;
  };

  return { text, rule, space, ensure, maxWidth };
}

function addFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - MARGIN, pageHeight - 24, { align: "right" });
    doc.text("Indira IVF · Swar AI", MARGIN, pageHeight - 24);
  }
}

/**
 * Export a full interview transcript to PDF.
 * sections: [{ label, items: [{ questionText, answerText, index, askedAt }] }]
 */
export function exportTranscriptPdf({ candidateName, jobTitle, lang, sections = [], generatedAt = new Date() }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const w = createWriter(doc);

  w.text("Interview Transcript", { size: 18, style: "bold", color: [124, 45, 78] });
  w.text(candidateName || "Candidate", { size: 13, style: "bold", color: [15, 23, 42], gap: 2 });
  w.text(`${jobTitle || "Role"}${lang ? ` · ${lang}` : ""}`, { size: 10, color: [100, 116, 139] });
  w.text(`Generated: ${generatedAt.toLocaleString()}`, { size: 9, color: [148, 163, 184], gap: 6 });
  w.rule(10);

  if (!sections.length) {
    w.text("No interview transcript is stored for this application.", { size: 10, color: [100, 116, 139] });
  }

  sections.forEach((section) => {
    w.space(6);
    w.text(`${section.label} (${section.items.length})`, { size: 11, style: "bold", color: [79, 70, 229], gap: 4 });
    section.items.forEach((a, idx) => {
      const qno = a.index ?? idx + 1;
      w.text(`Q${qno}: ${a.questionText || "—"}`, { size: 10, style: "bold", color: [30, 41, 59] });
      w.text(`A: ${a.answerText || "(No answer)"}`, { size: 10, color: [51, 65, 85], indent: 12, gap: 8 });
    });
  });

  addFooter(doc);
  doc.save(`${slugify(candidateName)}_${slugify(jobTitle)}_transcript.pdf`);
}

/**
 * Export an interview analysis to PDF.
 * data: { rec, summary, tech, comm, strengths: [], areas: [] }
 */
export function exportAnalysisPdf({ candidateName, jobTitle, data = {}, generatedAt = new Date() }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const w = createWriter(doc);

  w.text("Interview Analysis", { size: 18, style: "bold", color: [124, 45, 78] });
  w.text(candidateName || "Candidate", { size: 13, style: "bold", color: [15, 23, 42], gap: 2 });
  w.text(jobTitle || "Role", { size: 10, color: [100, 116, 139] });
  if (data.rec) w.text(`Recommendation: ${data.rec}`, { size: 10, style: "bold", color: [79, 70, 229] });
  w.text(`Generated: ${generatedAt.toLocaleString()}`, { size: 9, color: [148, 163, 184], gap: 6 });
  w.rule(10);

  if (data.summary) {
    w.text("Summary", { size: 11, style: "bold", color: [100, 116, 139], gap: 2 });
    w.text(data.summary, { size: 10, color: [51, 65, 85], gap: 10 });
  }

  if (data.tech != null || data.comm != null) {
    w.text("Scores", { size: 11, style: "bold", color: [100, 116, 139], gap: 2 });
    if (data.tech != null) w.text(`Technical: ${data.tech}/10`, { size: 10, color: [51, 65, 85] });
    if (data.comm != null) w.text(`Communication: ${data.comm}/10`, { size: 10, color: [51, 65, 85] });
    w.space(8);
  }

  if ((data.strengths || []).length) {
    w.text("Strengths", { size: 11, style: "bold", color: [22, 163, 74], gap: 2 });
    data.strengths.forEach((s) => w.text(`• ${s}`, { size: 10, color: [51, 65, 85], indent: 6 }));
    w.space(8);
  }

  if ((data.areas || []).length) {
    w.text("Improvements", { size: 11, style: "bold", color: [217, 119, 6], gap: 2 });
    data.areas.forEach((a) => w.text(`• ${a}`, { size: 10, color: [51, 65, 85], indent: 6 }));
    w.space(8);
  }

  addFooter(doc);
  doc.save(`${slugify(candidateName)}_${slugify(jobTitle)}_analysis.pdf`);
}
