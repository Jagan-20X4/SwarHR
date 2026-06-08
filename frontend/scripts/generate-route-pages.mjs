import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shellPath = path.join(__dirname, "../src/app/AppShell.tsx");
const outDir = path.join(__dirname, "../src/app/pages");
const shell = fs.readFileSync(shellPath, "utf8");

const replacements = [
  [/setStep\("HOME"\)/g, ""],
  [/setStep\("LOGIN"\)/g, ""],
  [/setStep\("PORTAL"\)/g, ""],
  [/setStep\("HR"\)/g, ""],
  [/setStep\("INTRO"\)/g, ""],
  [/setStep\("CVUP"\)/g, ""],
  [/setStep\("CV_ANALYSER"\)/g, ""],
  [/setStep\("CONSENT"\)/g, 'setRegisterPhase("consent")'],
  [/setStep\("REG"\)/g, 'setRegisterPhase("form")'],
  [/setStep\("FORGOT"\)/g, 'navigate("/login/forgot")'],
  [/setStep\("INTERVIEW"\)/g, 'setInterviewPhase("interview")'],
  [/setStep\("DONE"\)/g, 'setInterviewPhase("done")'],
  [/setStep\("TP_SUBMIT"\)/g, 'navigate("/talent-pool")'],
  [/setStep\("TP_DONE"\)/g, 'navigate("/talent-pool/done")'],
  [/setStep\("RIGHTS"\)/g, 'navigate("/portal/rights")'],
  [/setStep\("CAND_DETAIL"\)/g, ""],
  [/setStep\("JOBMASTER"\)/g, 'navigate("/hr/jobs")'],
  [/setStep\("SCREEN"\)/g, 'navigate("/hr/screening")'],
  [/setStep\("TP_BROWSE"\)/g, 'navigate("/hr/talent-pool")'],
  [/setStep\("AUDIT"\)/g, 'navigate("/hr/audit")'],
  [/setStep\("REATTEMPT"\)/g, 'navigate("/hr/reattempts")'],
  [/setStep\("ANALYSIS"\)/g, ""],
  [/;\s*setStep\("HOME"\)/g, ""],
  [/onView=\{id => \{ setActiveId\(id\); setStep\("CAND_DETAIL"\); \}\}/g,
    'onView={id => { setActiveId(id); navigate(`/hr/candidates/${id}`); }}'],
  [/onInterview=\{id => \{ setActiveId\(id\); const cand = candidates\.find\(c => c\.id === id\); const j = cand && jobs\.find\(x => x\.id === cand\.jobId\); if \(j\) setSelJob\(j\); setStep\("INTRO"\); \}\}/g,
    "onInterview={id => { setActiveId(id); const cand = candidates.find(c => c.id === id); const j = cand && jobs.find(x => x.id === cand.jobId); if (j) setSelJob(j); startInterview(); }}"],
  [/onAnalysis=\{id => \{ setActiveId\(id\); setAnalysisApplicationId\(null\); setAnalysisSessionId\(\(x\) => x \+ 1\); setStep\("ANALYSIS"\); \}\}/g,
    "onAnalysis={id => { setActiveId(id); setAnalysisApplicationId(null); setAnalysisSessionId(x => x + 1); navigate(`/hr/analysis/${id}`); }}"],
  [/onCvAnalyser=\{\(\) => \{ navigate\("\/cv-analyser"\); setStep\("CV_ANALYSER"\); \}\}/g,
    'onCvAnalyser={() => navigate("/cv-analyser")}'],
  [/onJobs=\{\(\) => setStep\("JOBMASTER"\)\}/g, 'onJobs={() => navigate("/hr/jobs")}'],
  [/onScreen=\{\(\) => setStep\("SCREEN"\)\}/g, 'onScreen={() => navigate("/hr/screening")}'],
  [/onTalentPool=\{\(\) => setStep\("TP_BROWSE"\)\}/g, 'onTalentPool={() => navigate("/hr/talent-pool")}'],
  [/onAuditLog=\{\(\) => setStep\("AUDIT"\)\}/g, 'onAuditLog={() => navigate("/hr/audit")}'],
  [/onReattempts=\{\(\) => setStep\("REATTEMPT"\)\}/g, 'onReattempts={() => navigate("/hr/reattempts")}'],
];

function transform(block) {
  let b = block;
  for (const [from, to] of replacements) b = b.replace(from, to);
  b = b.replace(/if \(dest === "\/portal"\) \s*;/g, "");
  b = b.replace(/else if \(applyDest\) \s*;/g, "");
  b = b.replace(/else \s*;/g, "");
  b = b.replace(/if \(dest === "\/cv-analyser"\) \s*;/g, "");
  b = b.replace(/else if \(dest === "\/" \|\| dest === ""\) \s*;/g, "");
  b = b.replace(/else \s*setStep\("HR"\)/g, "");
  return b;
}

console.log("generator placeholder - write pages manually");
