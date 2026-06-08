import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const legacyPath = path.join(root, "src/legacy/LegacyApp.jsx");
const lines = fs.readFileSync(legacyPath, "utf8").split(/\r?\n/);

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

/** First PascalCase component in LegacyApp.jsx (after top-level helpers). */
const FIRST_COMPONENT_LINE = 291;

const chunks = [];
let current = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const fnMatch = line.match(/^function ([A-Z]\w*)/);
  const appMatch = line.match(/^export function App\b/);
  const camelFn = line.match(/^function ([a-z]\w*)/);

  if (fnMatch || appMatch) {
    if (current) chunks.push(current);
    const name = appMatch ? "App" : fnMatch[1];
    current = { name, start: i, lines: [line] };
  } else if (camelFn && current && /^[A-Z]/.test(current.name)) {
    // Legacy file embeds duplicate helper functions between UI components — stop chunk here.
    chunks.push(current);
    current = null;
  } else if (current) {
    current.lines.push(line);
  }
}
if (current) chunks.push(current);

const REACT_HEADER = `// @ts-nocheck\nimport React, { useState, useEffect, useRef, useCallback, useMemo } from "react";\n\n`;

for (const chunk of chunks) {
  const rel = COMPONENT_PATHS[chunk.name];
  if (!rel) {
    console.warn("Skip unknown component", chunk.name);
    continue;
  }
  let body = chunk.lines.join("\n");
  body = body.replace(/^function /m, "export function ");
  if (chunk.name === "App") {
    body = body.replace(/^export function App/m, "export function AppShell");
  }
  const out = path.join(root, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, REACT_HEADER + body + "\n", "utf8");
  console.log("Wrote", rel, `(${chunk.lines.length} lines)`);
}

/** All non-component lines become shared helpers. */
const componentLines = new Set();
for (const chunk of chunks) {
  for (let i = chunk.start; i < chunk.start + chunk.lines.length; i++) {
    componentLines.add(i);
  }
}
const helperLines = [];
for (let i = 3; i < lines.length; i++) {
  if (componentLines.has(i)) continue;
  const t = lines[i].trim();
  if (!t || t.startsWith("export default")) continue;
  helperLines.push(lines[i]);
}
fs.writeFileSync(
  path.join(root, "src/legacy/helpers.js"),
  helperLines.join("\n") + "\n",
  "utf8",
);
console.log(`Helpers: ${helperLines.length} lines`);
