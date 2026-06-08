import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const helpersSrc = fs.readFileSync(
  path.join(root, "src/legacy/helpersModule.ts"),
  "utf8",
);
const helperExports = [
  ...helpersSrc.matchAll(/^export (?:async )?function (\w+)/gm),
  ...helpersSrc.matchAll(/^export const (\w+)/gm),
].map((m) => m[1]);

const COMPONENT_IMPORTS = {
  HRBridge: "@/features/hr/bridge/HRBridge",
  HRRedirectOnce: "@/features/hr/bridge/HRRedirectOnce",
  HRIframeShell: "@/features/hr/bridge/HRIframeShell",
  Badge: "@/shared/components/ui/Badge",
  Spin: "@/shared/components/ui/Spin",
  Modal: "@/shared/components/ui/Modal",
  PrivacyModal: "@/features/privacy/components/PrivacyModal",
  ForgotPassword: "@/features/auth/components/ForgotPassword",
  ConsentScreen: "@/features/auth/components/ConsentScreen",
  Login: "@/features/auth/components/LoginForm",
  CandReg: "@/features/auth/components/CandRegForm",
  ReattemptQueue: "@/features/hr/components/ReattemptQueue",
  HRDash: "@/features/hr/components/HRDash",
  CandidateDetail: "@/features/hr/components/CandidateDetail",
  JobMaster: "@/features/hr/components/JobMaster",
  JobBoardAuth: "@/features/jobs/components/JobBoardAuth",
  Jobs: "@/features/jobs/components/Jobs",
  CVUpload: "@/features/apply/components/CVUpload",
  TalentPoolSubmit: "@/features/talent-pool/components/TalentPoolSubmit",
  TalentPoolPdfPage: "@/features/talent-pool/components/TalentPoolPdfPage",
  TalentPoolPdfViewer: "@/features/talent-pool/components/TalentPoolPdfViewer",
  ResumePreviewModal: "@/shared/components/ResumePreviewModal",
  TalentPoolBrowse: "@/features/talent-pool/components/TalentPoolBrowse",
  AuditLogView: "@/features/audit/components/AuditLogView",
  CVResultCard: "@/features/cv-analyser/components/CVResultCard",
  CVAnalyserPage: "@/features/cv-analyser/pages/CvAnalyserPage",
  Screening: "@/features/hr/components/Screening",
  InterviewScheduleModal: "@/features/hr/components/InterviewScheduleModal",
  Intro: "@/features/interview/components/Intro",
  Interview: "@/features/interview/components/Interview",
  Done: "@/features/interview/components/Done",
  Analysis: "@/features/hr/components/Analysis",
  CandDash: "@/features/candidate-portal/components/CandDash",
  RightsPanel: "@/features/candidate-portal/components/RightsPanel",
};

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (ent.name.endsWith(".tsx") && !ent.name.includes("AppShell"))
      files.push(p);
  }
  return files;
}

const files = [
  ...walk(path.join(root, "src/features")),
  ...walk(path.join(root, "src/shared/components")),
];

for (const file of files) {
  let body = fs.readFileSync(file, "utf8");
  body = body.replace(/^\/\/ @ts-nocheck\n/, "");
  body = body.replace(
    /^import React[^\n]*\n\n?/,
    "",
  );

  const selfName = path.basename(file, ".tsx");
  const selfExportNames = new Set([
    selfName,
    selfName === "LoginForm" ? "Login" : null,
    selfName === "CandRegForm" ? "CandReg" : null,
  ]);

  const usedHelpers = helperExports.filter((name) => {
    const re = new RegExp(`\\b${name}\\b`);
    return re.test(body);
  });

  const usedComponents = Object.keys(COMPONENT_IMPORTS).filter((name) => {
    if (selfExportNames.has(name)) return false;
    if (new RegExp(`<${name}[\\s/>]`).test(body)) return true;
    if (new RegExp(`\\b${name}\\(`).test(body)) return true;
    return false;
  });

  const lines = ["// @ts-nocheck"];
  lines.push(
    'import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";',
  );

  if (usedHelpers.length) {
    lines.push(
      `import {\n  ${usedHelpers.join(",\n  ")},\n} from "@/legacy/helpersModule";`,
    );
  }

  for (const comp of usedComponents) {
    const importPath = COMPONENT_IMPORTS[comp];
    const importName =
      comp === "Login" && file.includes("LoginForm") ? comp : comp;
    lines.push(`import { ${comp} } from "${importPath}";`);
  }

  lines.push("");
  fs.writeFileSync(file, lines.join("\n") + body, "utf8");
  console.log(
    path.relative(root, file),
    `helpers:${usedHelpers.length} components:${usedComponents.length}`,
  );
}

/** Wire AppShell imports */
const appShellPath = path.join(root, "src/app/AppShell.tsx");
let appBody = fs.readFileSync(appShellPath, "utf8");
appBody = appBody.replace(/^\/\/ @ts-nocheck\n/, "");
appBody = appBody.replace(/^import React[^\n]*\n\n?/, "");

const appHelpers = helperExports.filter((n) =>
  new RegExp(`\\b${n}\\b`).test(appBody),
);

const appComponents = Object.keys(COMPONENT_IMPORTS).filter((name) =>
  new RegExp(`<${name}[\\s/>]`).test(appBody),
);

const appLines = [
  "// @ts-nocheck",
  'import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";',
  'import { useNavigate, useLocation } from "react-router-dom";',
  'import { flushPendingAbandonQueue } from "@/legacy/helpersModule";',
  `import {\n  ${appHelpers.filter((h) => h !== "flushPendingAbandonQueue").join(",\n  ")},\n} from "@/legacy/helpersModule";`,
];

for (const comp of appComponents) {
  appLines.push(`import { ${comp} } from "${COMPONENT_IMPORTS[comp]}";`);
}
appLines.push("");

fs.writeFileSync(appShellPath, appLines.join("\n") + appBody, "utf8");
console.log("Wired AppShell");
