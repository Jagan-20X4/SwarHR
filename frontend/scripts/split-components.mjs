import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "src/legacy/components.json"), "utf8"),
);
const rawLines = fs.readFileSync(path.join(root, "src/legacy/rawApp.jsx"), "utf8").split(/\r?\n/);
// Use rawApp + offset: index line N -> rawApp line N - 134
const BABEL_START = 135;

const COMPONENT_PATHS = {
  HRBridge: "src/features/hr/bridge/HRBridge.tsx",
  HRRedirectOnce: "src/features/hr/bridge/HRRedirectOnce.tsx",
  HRIframeShell: "src/features/hr/bridge/HRIframeShell.tsx",
  Badge: "src/shared/components/ui/Badge.tsx",
  Spin: "src/shared/components/ui/Spin.tsx",
  Modal: "src/shared/components/ui/Modal.tsx",
  PrivacyModal: "src/features/privacy/components/PrivacyModal.tsx",
  ForgotPassword: "src/features/auth/components/ForgotPassword.tsx",
  ConsentScreen: "src/features/auth/components/ConsentScreen.tsx",
  Login: "src/features/auth/components/LoginForm.tsx",
  ReattemptQueue: "src/features/hr/components/ReattemptQueue.tsx",
  HRDash: "src/features/hr/components/HRDash.tsx",
  CandidateDetail: "src/features/hr/components/CandidateDetail.tsx",
  JobMaster: "src/features/hr/components/JobMaster.tsx",
  CandReg: "src/features/auth/components/CandRegForm.tsx",
  JobBoardAuth: "src/features/jobs/components/JobBoardAuth.tsx",
  Jobs: "src/features/jobs/components/Jobs.tsx",
  CVUpload: "src/features/apply/components/CVUpload.tsx",
  TalentPoolSubmit: "src/features/talent-pool/components/TalentPoolSubmit.tsx",
  TalentPoolPdfPage: "src/features/talent-pool/components/TalentPoolPdfPage.tsx",
  TalentPoolPdfViewer: "src/features/talent-pool/components/TalentPoolPdfViewer.tsx",
  ResumePreviewModal: "src/shared/components/ResumePreviewModal.tsx",
  TalentPoolBrowse: "src/features/talent-pool/components/TalentPoolBrowse.tsx",
  AuditLogView: "src/features/audit/components/AuditLogView.tsx",
  CVResultCard: "src/features/cv-analyser/components/CVResultCard.tsx",
  CVAnalyserPage: "src/features/cv-analyser/pages/CvAnalyserPage.tsx",
  Screening: "src/features/hr/components/Screening.tsx",
  InterviewScheduleModal: "src/features/hr/components/InterviewScheduleModal.tsx",
  Intro: "src/features/interview/components/Intro.tsx",
  Interview: "src/features/interview/components/Interview.tsx",
  Done: "src/features/interview/components/Done.tsx",
  Analysis: "src/features/hr/components/Analysis.tsx",
  CandDash: "src/features/candidate-portal/components/CandDash.tsx",
  RightsPanel: "src/features/candidate-portal/components/RightsPanel.tsx",
  App: "src/app/AppShell.tsx",
};

function indexToRaw(startLine, endLine) {
  const start = startLine - BABEL_START;
  const end = endLine - BABEL_START;
  return rawLines.slice(start, end).map((l) => (l.startsWith("    ") ? l.slice(4) : l));
}

const REACT_IMPORT = `import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";\n\n`;

let written = 0;
for (const comp of manifest.components) {
  const rel = COMPONENT_PATHS[comp.name];
  if (!rel) continue;
  const lines = indexToRaw(comp.startLine, comp.endLine);
  let body = lines.join("\n");
  body = body.replace(/^function (\w+)/m, "export function $1");
  if (comp.name === "App") {
    body = body.replace(/^export function App/m, "export function AppShell");
  }
  const full = REACT_IMPORT + body + "\n";
  const out = path.join(root, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, full, "utf8");
  written++;
  console.log("Wrote", rel);
}

// Helpers block (before first component)
const helperEnd = manifest.components[0].startLine - BABEL_START;
const helperLines = rawLines.slice(1, helperEnd).map((l) => (l.startsWith("    ") ? l.slice(4) : l));
fs.mkdirSync(path.join(root, "src/legacy"), { recursive: true });
fs.writeFileSync(
  path.join(root, "src/legacy/helpers.js"),
  helperLines.join("\n") + "\n",
  "utf8",
);
console.log(`Split ${written} components + helpers (${helperLines.length} lines)`);
