/** Base URL for candidate-facing absolute links (invite emails). Uses VITE_PUBLIC_APP_URL when set, else window.location.origin. */
function publicAppOrigin() {
  const raw = typeof window !== "undefined" ? window.__PUBLIC_APP_URL__ : "";
  if (raw && String(raw).trim()) return String(raw).trim().replace(/\/+$/, "");
  return typeof window !== "undefined" ? window.location.origin : "";
}
async function callClaude(messages, system = "", json = false) {
  // If no API URL configured, return mock data (lets you preview the UI)
  if (!window.CLAUDE_API_URL) {
    await new Promise(r => setTimeout(r, 600));
    if (json) return { overallScore: 72, summary: "Strong match with relevant experience.", recommendation: "shortlist", strengths: ["Domain knowledge", "Communication", "Problem solving"], areas: ["Stakeholder management", "Tech leadership", "Strategic thinking"], tech: 7, comm: 8, rec: "Hire" };
    const lastUser = messages[messages.length - 1]?.content || "";
    if (lastUser.includes("Start") || lastUser.includes("warm greeting")) return "Hello! Welcome to Indira IVF. To start, could you walk me through your most relevant experience for this role?";
    return "Thank you for sharing that. Could you tell me about a challenging situation you handled and how you approached it?";
  }
  try {
    const res = await fetch(window.CLAUDE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: system || undefined, messages }),
    });
    const data = await res.json();
    const text = data.content?.find(b => b.type === "text")?.text || "";
    if (json) { try { return JSON.parse(text.replace(/```json|```/g, "").trim()); } catch { return null; } }
    return text;
  } catch (e) {
    console.error("API error:", e);
    return json ? null : "I'm having trouble connecting right now. Please try again.";
  }
}
/**
 * Browser Speech Synthesis has no standard gender field — prefer voices whose names hint female / neural.
 * Falls back to best-scoring locale match; quality varies by OS and browser (free, no cloud TTS).
 */
function pickFemaleFirstSpeechVoice(langCode, voicesList) {
  const list = Array.isArray(voicesList) ? voicesList : [];
  if (!list.length) return null;
  const lc = (langCode || "en-IN").toLowerCase();
  const base = lc.split("-")[0];
  const langMatches = (vo) => {
    const vl = (vo.lang || "").toLowerCase();
    return vl === lc || vl.startsWith(base + "-") || vl === base;
  };
  let pool = list.filter(langMatches);
  if (!pool.length) pool = list.filter((vo) => (vo.lang || "").toLowerCase().startsWith(base));
  if (!pool.length) pool = list.slice();
  const lower = (vo) => (vo.name || "").toLowerCase();
  const femaleHint = (n) =>
    /\bfemale\b|\bwoman\b|\bzira\b|\bsamantha\b|\bvictoria\b|\bkaren\b|\bmoira\b|\btessa\b|\bfiona\b|\bveena\b|\blatika\b|\bgoogle\b[^\w]*female|\bmicrosoft[^\w]*female|\bnatural\b|\bpremium\b/.test(n);
  const maleHint = (n) =>
    /\bmale\b|\bman\b|\bgoogle\b[^\w]*male|\bmicrosoft[^\w]*male/.test(n);
  const score = (vo) => {
    const n = lower(vo);
    let s = 0;
    if (femaleHint(n)) s += 100;
    if (maleHint(n)) s -= 130;
    if (/neural|natural|enhanced|online|premium/.test(n)) s += 14;
    if (vo.localService === false) s += 8;
    return s;
  };
  pool.sort((a, b) => score(b) - score(a));
  return pool[0] || null;
}
const VALID_EXTS = ["jpg", "jpeg", "pdf", "doc", "docx"];
const SB = { REGISTERED: "bg-slate-100 text-slate-600", APPLIED: "bg-amber-100 text-amber-700", SCHEDULED: "bg-sky-100 text-sky-800", SHORTLISTED: "bg-blue-100 text-blue-700", INTERVIEWED: "bg-teal-100 text-teal-700", REJECTED: "bg-red-100 text-red-600", WITHDRAWN: "bg-purple-100 text-purple-700", REATTMPT: "bg-violet-100 text-violet-800" };
const TP_SOURCE_OPTIONS = [
  { value: "", label: "— Select source —" },
  { value: "Job Portal - Naukri", label: "Job Portal - Naukri" },
  { value: "Job Portal - Indeed", label: "Job Portal - Indeed" },
  { value: "Employee Referral", label: "Employee Referral" },
  { value: "Social Media - Whatsapp", label: "Social Media - Whatsapp" },
  { value: "Social Media - LinkedIn", label: "Social Media - LinkedIn" },
  { value: "Careers Website", label: "Careers Website" },
  { value: "Recruitment Consultant", label: "Recruitment Consultant" },
];
const TALENT_POOL_NOTICE_PERIOD_OPTIONS = ["15 days", "30 days", "45 days", "60 days", "90 days"];
function resolveTalentPoolCityPick(city, other) {
  if (!city) return "";
  if (city === "__OTHER__") return (other || "").trim();
  return city;
}
const INDIAN_CITIES_FALLBACK = [
  "Agartala", "Agra", "Ahmedabad", "Aizawl", "Ajmer", "Akola", "Aligarh", "Allahabad", "Ambala", "Amravati", "Amritsar", "Asansol", "Aurangabad",
  "Bangalore", "Bareilly", "Belgaum", "Bhopal", "Bhubaneswar", "Bikaner", "Bilaspur", "Bokaro", "Chandigarh", "Chennai", "Coimbatore", "Cuttack",
  "Dehradun", "Delhi", "Dhanbad", "Dibrugarh", "Dimapur", "Durgapur", "Erode", "Faridabad", "Firozabad", "Ghaziabad", "Gorakhpur", "Guntur", "Guwahati", "Gwalior",
  "Hisar", "Hubli", "Hyderabad", "Imphal", "Indore", "Itanagar", "Jabalpur", "Jaipur", "Jalandhar", "Jammu", "Jamnagar", "Jamshedpur", "Jodhpur", "Jorhat",
  "Kalyan", "Kanpur", "Kochi", "Kohima", "Kolhapur", "Kolkata", "Kollam", "Kota", "Kozhikode",
  "Lucknow", "Ludhiana", "Madurai", "Mangalore", "Meerut", "Moradabad", "Mumbai", "Muzaffarpur", "Mysore",
  "Nagpur", "Nashik", "Nellore", "New Delhi", "Noida",
  "Goa", "Panaji", "Panipat", "Patna", "Pondicherry", "Pune", "Raipur", "Rajkot", "Ranchi", "Rohtak", "Rourkela",
  "Salem", "Shillong", "Shimla", "Silchar", "Siliguri", "Solapur", "Srinagar", "Surat",
  "Thane", "Thiruvananthapuram", "Thrissur", "Tiruchirappalli", "Tirupati", "Udaipur", "Ujjain", "Vadodara", "Varanasi", "Vijayawada", "Visakhapatnam", "Warangal",
].map((s) => s.trim()).filter(Boolean);
const LS_TOKEN = "swar_token";
const LS_ROLE = "swar_role";
const LS_CANDIDATE_ID = "swar_candidate_id";
const LS_HR_ID = "swar_hr_id";
function authHeaders() {
  const t = localStorage.getItem(LS_TOKEN);
  return t ? { Authorization: "Bearer " + t } : {};
}
function cvFileHref(cvFile) {
  if (!cvFile) return null;
  return cvFile.dataUrl || cvFile.downloadUrl || null;
}
function downloadCvFile(cvFile) {
  if (!cvFile) return;
  const href = cvFileHref(cvFile);
  if (!href) return;
  if (cvFile.downloadUrl && !cvFile.dataUrl) {
    fetch(href)
      .then((r) => r.blob())
      .then((blob) => {
        const u = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = u;
        a.download = cvFile.name || "resume";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(u);
      })
      .catch(() => window.open(href, "_blank"));
    return;
  }
  downloadDataUrl(href, cvFile.name || "resume");
}
const LS_ABANDON_QUEUE = "swar_abandon_queue_v1";
const ABANDON_FETCH_TIMEOUT_MS = 8000;
function readAbandonQueue() {
  try {
    const raw = localStorage.getItem(LS_ABANDON_QUEUE);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function writeAbandonQueue(items) {
  try {
    localStorage.setItem(LS_ABANDON_QUEUE, JSON.stringify(items.slice(0, 25)));
  } catch (_) {}
}
function dequeueAbandonJob(applicationId) {
  const aid = parseInt(String(applicationId), 10);
  if (!Number.isFinite(aid)) return;
  writeAbandonQueue(readAbandonQueue().filter((x) => x.applicationId !== aid));
}
function enqueueAbandonJob({ applicationId, clientDetail, token: tokenOpt }) {
  const token = tokenOpt || localStorage.getItem(LS_TOKEN);
  const aid = parseInt(String(applicationId), 10);
  if (!token || !Number.isFinite(aid)) return;
  const q = readAbandonQueue();
  if (q.some((x) => x.applicationId === aid)) return;
  q.push({
    applicationId: aid,
    clientDetail: String(clientDetail || "").slice(0, 2000),
    token,
    ts: Date.now(),
  });
  writeAbandonQueue(q);
}
/**
 * POST abandon (8s cap) → sendBeacon with token in JSON body → optional localStorage queue for `online` retry.
 * @param {object} [opts]
 * @param {boolean} [opts.noEnqueue] — do not enqueue on total failure (used when flushing queued items).
 * @param {string} [opts.token] — JWT (defaults to LS_TOKEN).
 */
async function postInterviewAbandonWithFallback(applicationId, clientDetail, opts = {}) {
  const { noEnqueue = false, token: tokenOpt = null } = opts;
  const aid = parseInt(String(applicationId), 10);
  if (!Number.isFinite(aid)) return false;
  const detail = String(clientDetail || "").slice(0, 2000);
  const token = (tokenOpt && String(tokenOpt)) || localStorage.getItem(LS_TOKEN);
  if (!token) return false;
  const bodyJson = JSON.stringify({ applicationId: aid, clientDetail: detail });
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ABANDON_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("/api/voice-bot/interview-session-abandon", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: bodyJson,
      signal: ctrl.signal,
      keepalive: true,
    });
    clearTimeout(tid);
    if (res.ok) {
      dequeueAbandonJob(aid);
      return true;
    }
  } catch (_) {
    clearTimeout(tid);
  }
  try {
    const blob = new Blob([JSON.stringify({ applicationId: aid, clientDetail: detail, token })], {
      type: "application/json",
    });
    if (navigator.sendBeacon("/api/voice-bot/interview-session-abandon-beacon", blob)) {
      dequeueAbandonJob(aid);
      return true;
    }
  } catch (_) {}
  if (!noEnqueue) enqueueAbandonJob({ applicationId: aid, clientDetail: detail, token });
  return false;
}
async function flushPendingAbandonQueue() {
  const q = readAbandonQueue();
  if (q.length === 0) return;
  const remaining = [];
  for (const item of q) {
    const token = item.token || localStorage.getItem(LS_TOKEN);
    if (!token) {
      remaining.push(item);
      continue;
    }
    const ok = await postInterviewAbandonWithFallback(item.applicationId, item.clientDetail, {
      noEnqueue: true,
      token,
    });
    if (!ok) remaining.push(item);
  }
  writeAbandonQueue(remaining);
}
function parsePath(pathname, search) {
  const q = new URLSearchParams(search || "");
  const ret = q.get("returnTo") || "";
  const path = pathname || "/";
  if (path === "/" || path === "") return { name: "home", returnTo: ret };
  if (path === "/login") return { name: "login", returnTo: ret };
  if (path === "/register") return { name: "register", returnTo: ret };
  if (path === "/portal") return { name: "portal", returnTo: ret };
  if (path === "/hr") return { name: "hr", returnTo: ret };
  if (path === "/cv-analyser") return { name: "cvAnalyser", returnTo: ret };
  const m = path.match(/^\/jobs\/([^/]+)\/apply$/);
  if (m) {
    const invite = q.get("invite") === "1" || q.get("invite") === "true";
    return { name: "apply", jobId: m[1], returnTo: ret, invite };
  }
  return { name: "home", returnTo: ret };
}
/** Match post-login returnTo like /jobs/{id}/apply or /jobs/{id}/apply?invite=1 */
function matchJobsApplyDest(dest) {
  if (!dest || typeof dest !== "string") return null;
  const qIdx = dest.indexOf("?");
  const pathOnly = qIdx >= 0 ? dest.slice(0, qIdx) : dest;
  const qs = qIdx >= 0 ? dest.slice(qIdx + 1) : "";
  const m = pathOnly.match(/^\/jobs\/([^/]+)\/apply$/);
  if (!m) return null;
  const params = new URLSearchParams(qs);
  const invite = params.get("invite") === "1" || params.get("invite") === "true";
  return { jobId: m[1], invite };
}
function getHrExternalConfig() {
  const rawUrl = typeof window.HR_FRONTEND_URL === "string" ? window.HR_FRONTEND_URL.trim() : "";
  const mode = String(window.HR_FRONTEND_MODE || "builtin").toLowerCase();
  if (!rawUrl) return { useExternal: false, mode: "builtin", url: "" };
  if (mode !== "iframe" && mode !== "redirect") return { useExternal: false, mode: "builtin", url: rawUrl };
  return { useExternal: true, mode, url: rawUrl };
}
function fmtDate(d) { try { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch { return "—"; } }
function fmtDateTime(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}
function fmtSize(b) { return b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(1) + " KB" : (b / 1048576).toFixed(2) + " MB"; }
function fileIcon(ext) { return ext === "pdf" ? "📕" : (ext === "docx" || ext === "doc") ? "📘" : "🖼️"; }
function getLatestAppForJob(history, jobId) {
  const past = (history || []).filter((a) => a.jobId === jobId);
  if (past.length === 0) return null;
  return [...past].sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt))[0];
}
function candidateHasAnyInterviewTranscript(c) {
  if (c?.transcript?.length) return true;
  return (c?.applicationHistory || []).some((h) => h.transcript?.length > 0);
}
function transcriptLinesForApplication(c, applicationId) {
  if (applicationId == null) return null;
  const app = (c?.applicationHistory || []).find((a) => a.applicationId === applicationId);
  if (app?.transcript?.length) return app.transcript;
  const latest = getLatestAppForJob(c?.applicationHistory || [], c?.jobId);
  if (
    latest?.applicationId === applicationId &&
    c?.transcript?.length &&
    !(c.applicationHistory || []).some((h) => h.transcript?.length > 0)
  )
    return c.transcript;
  return null;
}
function activeRoleHasTranscript(c) {
  const latest = getLatestAppForJob(c?.applicationHistory || [], c?.jobId);
  if (!latest) return false;
  return !!(latest.transcript?.length ||
    (c?.transcript?.length && !(c.applicationHistory || []).some((h) => h.transcript?.length > 0)));
}
const CANDIDATE_REATTEMPT_REASONS = [
  { value: "TECH_NETWORK", label: "Network / connectivity dropped" },
  { value: "MIC_DEVICE", label: "Microphone or device failed" },
  { value: "Genuine_CONSTRAINT", label: "Genuine constraint (power, emergency, etc.)" },
  { value: "OTHER", label: "Other (explain in notes)" },
];
const HR_REATTEMPT_REASON_LABELS = {
  CANDIDATE_CONSTRAINTS: "Candidate faced genuine constraints",
  QUALITY_IMPACTED: "Interview quality impacted (noise, device, etc.)",
  BUSINESS_EXCEPTION: "Business exception approval",
  BORDERLINE_HIGH_POTENTIAL: "Borderline score – high potential reassessment",
};
function interviewEligibleForJob(c, jobId) {
  const app = getLatestAppForJob(c?.applicationHistory || [], jobId);
  if (!app) return { ok: false, reason: "No application for this role." };
  const hasMeta =
    app.interviewCompletionStatus != null || app.reattemptRequestStatus != null;
  const ic =
    app.interviewCompletionStatus ||
    (app.interviewCompletedAt ? "completed" : "not_started");
  const rs = app.reattemptRequestStatus || "none";
  if (!hasMeta && (ic === "completed" || app.interviewCompletedAt) && rs === "none" && transcriptAvailableForJob(c, jobId)) {
    return { ok: false, reason: "Interview already completed. Use Request reattempt on your dashboard if HR allows another attempt." };
  }
  if (ic === "not_started" || ic === "in_progress") return { ok: true };
  if (ic === "incomplete_technical") {
    if (rs === "approved") return { ok: true };
    if (rs === "pending") return { ok: false, reason: "Your reattempt request is pending HR approval." };
    return { ok: false, reason: "Interview did not finish (technical). Submit a reattempt request from your dashboard." };
  }
  if (ic === "completed") {
    if (rs === "approved") return { ok: true };
    return { ok: false, reason: "Interview already completed. Request HR reassessment from your dashboard if applicable." };
  }
  return { ok: true };
}
/** After scheduled start, candidate may press Start for this many minutes (single source of truth). */
const INTERVIEW_START_GRACE_MINUTES = 15;
const INTERVIEW_START_GRACE_MS = INTERVIEW_START_GRACE_MINUTES * 60 * 1000;
/** When a slot is chosen, Start is only allowed from scheduled time until grace end (unless bypassSchedule). */
function interviewStartSlotStatus(scheduledIso, bypassSchedule) {
  if (bypassSchedule || !scheduledIso) {
    return { blocked: false, tooEarly: false, tooLate: false, hasSlot: false, windowEndIso: null };
  }
  const schedMs = new Date(scheduledIso).getTime();
  if (Number.isNaN(schedMs)) {
    return { blocked: false, tooEarly: false, tooLate: false, hasSlot: false, windowEndIso: null };
  }
  const now = Date.now();
  const endMs = schedMs + INTERVIEW_START_GRACE_MS;
  const tooEarly = now < schedMs;
  const tooLate = now >= endMs;
  return {
    blocked: tooEarly || tooLate,
    tooEarly,
    tooLate,
    hasSlot: true,
    windowEndIso: new Date(endMs).toISOString(),
  };
}
function patchLatestApp(history, jobId, patch) {
  const h = [...(history || [])];
  let bestI = -1;
  let bestT = 0;
  h.forEach((a, i) => {
    if (a.jobId !== jobId) return;
    const t = new Date(a.appliedAt).getTime();
    if (t >= bestT) {
      bestT = t;
      bestI = i;
    }
  });
  if (bestI < 0) return history;
  h[bestI] = { ...h[bestI], ...patch };
  return h;
}
function patchApplicationById(history, applicationId, patch) {
  if (!Array.isArray(history) || applicationId == null) return history || [];
  return history.map((row) =>
    row.applicationId === applicationId ? { ...row, ...patch } : row,
  );
}
function transcriptAvailableForJob(c, jobId) {
  const app = getLatestAppForJob(c?.applicationHistory || [], jobId);
  if (!app || app.applicationId == null) return false;
  const lines = transcriptLinesForApplication(c, app.applicationId);
  return !!(lines && lines.length > 0);
}
/** True when the latest application ended with a technical/session dropout and the candidate may submit (or re-submit after rejection) an HR reattempt request. */
function applicationEligibleForTechnicalReattemptRequest(app) {
  if (!app || app.applicationId == null) return false;
  if (app.interviewCompletionStatus !== "incomplete_technical") return false;
  const rs = app.reattemptRequestStatus || "none";
  if (rs !== "none" && rs !== "rejected") return false;
  const hr = app.hrDecisionStatus;
  if (hr === "SHORTLISTED" || hr === "REJECTED") return false;
  return true;
}
/** True once the candidate has any reattempt workflow recorded (submitted, approved, or rejected). */
function applicationHasReattemptHistory(app) {
  const rs = app?.reattemptRequestStatus || "none";
  return rs !== "none";
}
/** Voice interview finished for this application — HR decision is scoped to after this. */
function applicationVoiceInterviewCompleted(app) {
  if (!app) return false;
  if (app.interviewCompletionStatus === "completed") return true;
  if (app.interviewCompletedAt) return true;
  return false;
}
function portalStatusLabel(c, jobId) {
  const app = getLatestAppForJob(c?.applicationHistory || [], jobId);
  if (!app) return "—";
  if (app.hrDecisionStatus === "SHORTLISTED" || app.hrDecisionStatus === "REJECTED") return app.hrDecisionStatus;
  if (app.interviewCompletionStatus === "incomplete_technical") return "REATTMPT";
  if (app.interviewCompletedAt || app.interviewCompletionStatus === "completed") return "INTERVIEWED";
  if (app.interviewScheduledAt) return "SCHEDULED";
  return "APPLIED";
}
/** One row per distinct job (latest application), matching candidate portal pills — for HR Analysis tabs. */
function hrAnalysisRoleRows(candidate) {
  if (!candidate) return [];
  const hist = candidate.applicationHistory || [];
  const jobIdsOrdered = [];
  const seen = new Set();
  for (const a of hist) {
    if (a.jobId && !seen.has(a.jobId)) {
      seen.add(a.jobId);
      jobIdsOrdered.push(a.jobId);
    }
  }
  if (candidate.jobId && !seen.has(candidate.jobId)) jobIdsOrdered.push(candidate.jobId);
  const rows = [];
  for (const jid of jobIdsOrdered) {
    const app = getLatestAppForJob(hist, jid);
    if (app && app.applicationId != null) {
      rows.push({ applicationId: app.applicationId, jobId: jid });
    }
  }
  return rows;
}
function getCoolingStatus(history, jobId, coolingMonths) {
  const cm = typeof coolingMonths === "number" ? coolingMonths : 3;
  const past = (history || []).filter((a) => a.jobId === jobId);
  if (past.length === 0) return { canApply: true, hasApplied: false };
  const last = [...past].sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt))[0];
  if (!last.interviewCompletedAt) {
    return { canApply: false, hasApplied: true, pendingInterview: true, lastAppliedAt: last.appliedAt };
  }
  const eligible = new Date(last.interviewCompletedAt);
  eligible.setMonth(eligible.getMonth() + cm);
  const now = new Date();
  if (now >= eligible) return { canApply: true, hasApplied: true, lastAppliedAt: last.appliedAt, lastCompletedAt: last.interviewCompletedAt };
  const daysRemaining = Math.ceil((eligible - now) / 86400000);
  return { canApply: false, hasApplied: true, daysRemaining, eligibleAt: eligible.toISOString(), lastAppliedAt: last.appliedAt, lastCompletedAt: last.interviewCompletedAt };
}
async function processResumeFile(file, maxMb) {
  const mb = typeof maxMb === "number" ? maxMb : 5;
  if (!file) throw new Error("No file selected.");
  const name = file.name || "resume";
  const ext = (name.includes(".") ? name.split(".").pop() : "").toLowerCase();
  if (!VALID_EXTS.includes(ext)) throw new Error(`Unsupported format. Only JPG, JPEG, PDF, DOC, and DOCX accepted. You uploaded: .${ext || "unknown"}`);
  if (file.size > mb * 1024 * 1024) throw new Error(`File exceeds ${mb} MB limit. Your file is ${fmtSize(file.size)}.`);
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Could not read file."));
    r.readAsDataURL(file);
  });
  let cvText = "";
  if (ext === "docx" && window.mammoth) {
    try {
      const buffer = await file.arrayBuffer();
      const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
      cvText = (result?.value || "").trim() || `[Word document: ${name}]`;
    } catch { cvText = `[Word document: ${name} — extraction failed]`; }
  } else if (ext === "doc") cvText = `[Legacy Word: ${name}]`;
  else if (ext === "pdf") cvText = `[PDF resume: ${name}]`;
  else cvText = `[Image resume: ${name}]`;
  return { name, mime: file.type || `image/${ext}`, ext, size: file.size, dataUrl, cvText };
}
function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
function dataUrlToBlobUrl(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith("data:")) return null;
  try {
    const parts = dataUrl.split(",");
    const base64 = parts[1];
    if (base64 == null) return null;
    const mimeMatch = parts[0].match(/data:(.*?)(;|$)/);
    const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  } catch {
    return null;
  }
}
function getPdfjsLib() {
  return typeof window !== "undefined" && window.pdfjsLib ? window.pdfjsLib : null;
}
function parseAuditDetails(d) {
  if (d == null) return null;
  if (typeof d === "object") return d;
  const s = String(d).trim();
  if (!s || !(s.startsWith("{") || s.startsWith("["))) return null;
  try { return JSON.parse(s); } catch { return null; }
}
function humanizeClientDetail(s) {
  if (!s) return "";
  return String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function resolveActorLabel(actor, hrUsersMap, candidatesMap) {
  if (!actor) return "—";
  if (actor === "HR") return "HR";
  const hrName = hrUsersMap && hrUsersMap[actor];
  if (hrName && String(hrName).trim()) return `${String(hrName).trim()} (${actor})`;
  const candName = candidatesMap && candidatesMap[actor];
  if (candName && String(candName).trim()) return `${String(candName).trim()} (${actor})`;
  return actor;
}
function formatAuditDate(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function formatAuditTime(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d
    .toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
    .replace(/\s*(am|pm)/i, (_, p) => " " + p.toUpperCase());
}
function humanizeAuditEntry(entry, hrUsersMap, candidatesMap) {
  const meta = AUDIT_ACTION_META[entry.action] || { label: entry.action, tone: "slate" };
  const parsed = parseAuditDetails(entry.details);
  if (!parsed) {
    return {
      label: meta.label,
      tone: meta.tone,
      sentence: typeof entry.details === "string" ? entry.details : "",
    };
  }
  const app = parsed.applicationId != null ? `Application #${parsed.applicationId}` : "this application";
  const candidateLabel = parsed.candidateId
    ? resolveActorLabel(parsed.candidateId, hrUsersMap, candidatesMap)
    : null;
  const candidateReasonLabel = (() => {
    const code = parsed.candidateReasonCode;
    if (!code) return null;
    const found = CANDIDATE_REATTEMPT_REASONS.find((r) => r.value === code);
    return found ? found.label : code;
  })();
  const hrReasonLabel = parsed.hrReasonCode
    ? HR_REATTEMPT_REASON_LABELS[parsed.hrReasonCode] || parsed.hrReasonCode
    : null;
  switch (entry.action) {
    case "interview.reattempt_approved": {
      const who = candidateLabel || "candidate —";
      const reason = hrReasonLabel || "—";
      const notes = parsed.hasNotes ? " HR notes attached." : "";
      return { ...meta, sentence: `Approved reattempt for ${who} on ${app}. Reason: ${reason}.${notes}` };
    }
    case "interview.reattempt_rejected": {
      const who = candidateLabel || "candidate —";
      const reason = hrReasonLabel || "—";
      const notes = parsed.hasNotes ? " HR notes attached." : "";
      return { ...meta, sentence: `Rejected reattempt for ${who} on ${app}. Reason: ${reason}.${notes}` };
    }
    case "interview.reattempt_requested": {
      const reason = candidateReasonLabel || "—";
      const note = parsed.hasText ? " Candidate added a written note." : "";
      return { ...meta, sentence: `Candidate requested an interview reattempt for ${app}. Reason: ${reason}.${note}` };
    }
    case "interview.incomplete_technical": {
      const lab = parsed.label ? parsed.label : "Technical failure";
      const detail = parsed.clientDetail ? ` — ${humanizeClientDetail(parsed.clientDetail)}` : "";
      return { ...meta, sentence: `Interview for ${app} ended early (${lab})${detail}.` };
    }
    default: {
      const parts = Object.entries(parsed)
        .filter(([k]) => k !== "applicationId")
        .map(([k, v]) => `${k}: ${typeof v === "boolean" ? (v ? "yes" : "no") : v}`);
      return {
        ...meta,
        sentence: parts.length ? `${app} — ${parts.join(" · ")}` : `${app}.`,
      };
    }
  }
}
function verdictLabel(v) {
  const m = { senior: "Senior", mid: "Mid", junior: "Junior", fresher: "Fresher" };
  return m[v] || (v ? String(v) : "—");
}
function buildCvAnalyserInviteEmail({ candidateName, jobTitle, interviewLink }) {
  const cn = (candidateName && String(candidateName).trim()) || "Candidate";
  const jt = (jobTitle && String(jobTitle).trim()) || "the position";
  const link = (interviewLink && String(interviewLink).trim()) || "";
  const subject = "Thank You for Applying – Next Step: AI Interview";
  const body = `Dear ${cn},
Thank you for applying for the ${jt} position at Indira IVF Hospital Ltd.
As the first step in our hiring process, you are required to complete an AI‑based interview. Please use the details below to access and complete your interview within 72 hours.
AI Interview Link: ${link}
Important guidelines for your AI interview
To ensure your responses are captured accurately by the AI system, please make sure to:
· Sit in a well-lit area with a plain white or light-coloured background
· Ensure stable internet connectivity throughout the interview
· Choose a quiet location with minimal background noise
· Use a device with a properly functioning camera and microphone
· Speak clearly and at a natural pace, and answer each question in full before moving ahead
· Avoid interruptions, as the AI interview works best when completed in one continuous session
Following these guidelines will help the system accurately evaluate your responses.
Thank you for your interest in joining Indira IVF Hospital Ltd. We wish you the very best in the process.`;
  return { subject, body };
}
function savedAnalysisIsRenderable(a) {
  if (!a || typeof a !== "object") return false;
  if (String(a.summary || "").trim().length > 0) return true;
  if (typeof a.tech === "number" || typeof a.comm === "number") return true;
  if (Array.isArray(a.strengths) && a.strengths.length > 0) return true;
  if (Array.isArray(a.areas) && a.areas.length > 0) return true;
  const rec = String(a.rec || "").trim();
  if (rec.length > 0 && rec !== "Pending review") return true;
  return false;
}
function normalizeSavedAnalysis(a) {
  return {
    summary: a.summary || "",
    tech: typeof a.tech === "number" ? a.tech : null,
    comm: typeof a.comm === "number" ? a.comm : null,
    rec: a.rec || "Pending review",
    strengths: Array.isArray(a.strengths) ? a.strengths : [],
    areas: Array.isArray(a.areas) ? a.areas : [],
    noTranscript: false,
    pendingManualGenerate: false,
  };
}
function analysisInterviewMessages(transcript, jdTitle) {
  const tx = (transcript || []).map((t) => `${t.role === "ai" ? "SWAR" : "CAND"}: ${t.text}`).join("\n");
  return [{ role: "user", content: `Analyse for "${jdTitle}". Transcript:\n${tx}\n\nReturn JSON: {"summary":"3 sentences","strengths":["s1","s2","s3"],"areas":["a1","a2","a3"],"tech":7,"comm":8,"rec":"Hire"}` }];
}
