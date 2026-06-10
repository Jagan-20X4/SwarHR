// @ts-nocheck
/* Auto-generated from helpers.js — migrate symbols to @/domain and @/shared over time */

/** Base URL for candidate-facing absolute links (invite emails). Uses VITE_PUBLIC_APP_URL when set, else window.location.origin. */
export function publicAppOrigin() {
  const raw = typeof window !== "undefined" ? window.__PUBLIC_APP_URL__ : "";
  if (raw && String(raw).trim()) return String(raw).trim().replace(/\/+$/, "");
  return typeof window !== "undefined" ? window.location.origin : "";
}
const INTERVIEW_CLAUDE_API_URL = "/api/interview/messages";

/** Candidate voice interview — requires applicationId; uses candidate auth, not HR. */
export async function callInterviewClaude(
  messages,
  system = "",
  applicationId,
) {
  if (!applicationId) {
    console.error("callInterviewClaude: applicationId required");
    return "Interview session is not ready. Please refresh and try again.";
  }
  if (!window.CLAUDE_API_URL) {
    await new Promise((r) => setTimeout(r, 600));
    const lastUser = messages[messages.length - 1]?.content || "";
    if (lastUser.includes("Start") || lastUser.includes("warm greeting"))
      return "Hello! Welcome to Indira IVF. To start, could you walk me through your most relevant experience for this role?";
    return "Thank you for sharing that. Could you tell me about a challenging situation you handled and how you approached it?";
  }
  try {
    const res = await fetch(INTERVIEW_CLAUDE_API_URL, {
      ...apiFetchInit({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: system || undefined,
          messages,
        }),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Interview API error:", data.error || res.status);
      return "I'm having trouble connecting right now. Please try again.";
    }
    const text = data.content?.find((b) => b.type === "text")?.text || "";
    return text;
  } catch (e) {
    console.error("Interview API error:", e);
    return "I'm having trouble connecting right now. Please try again.";
  }
}

export async function callClaude(messages, system = "", json = false) {
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
      ...apiFetchInit({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: system || undefined, messages }),
      }),
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
export function pickFemaleFirstSpeechVoice(langCode, voicesList) {
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
export const VALID_EXTS = ["jpg", "jpeg", "pdf", "doc", "docx"];
export const SB = { REGISTERED: "bg-slate-100 text-slate-600", APPLIED: "bg-amber-100 text-amber-700", SCHEDULED: "bg-sky-100 text-sky-800", SHORTLISTED: "bg-blue-100 text-blue-700", INTERVIEWED: "bg-teal-100 text-teal-700", REJECTED: "bg-red-100 text-red-600", WITHDRAWN: "bg-purple-100 text-purple-700", REATTMPT: "bg-violet-100 text-violet-800" };
export const TP_SOURCE_OPTIONS = [
  { value: "", label: "— Select source —" },
  { value: "Job Portal - Naukri", label: "Job Portal - Naukri" },
  { value: "Job Portal - Indeed", label: "Job Portal - Indeed" },
  { value: "Employee Referral", label: "Employee Referral" },
  { value: "Social Media - Whatsapp", label: "Social Media - Whatsapp" },
  { value: "Social Media - LinkedIn", label: "Social Media - LinkedIn" },
  { value: "Careers Website", label: "Careers Website" },
  { value: "Recruitment Consultant", label: "Recruitment Consultant" },
];
export const TALENT_POOL_NOTICE_PERIOD_OPTIONS = ["15 days", "30 days", "45 days", "60 days", "90 days"];

export const QUALIFICATION_LEVELS = [
  "Diploma",
  "Graduate",
  "Post Graduate",
  "Doctoral",
];

export const QUALIFICATION_BY_LEVEL = {
  Diploma: [
    "Diploma in Mechanical Engineering",
    "Diploma in Civil Engineering",
    "Diploma in Electrical Engineering",
    "GNM",
    "Operation Theatre",
    "Diploma in Pharmacy",
    "Diploma in Computer Applications (DCA)",
  ],
  Graduate: [
    "Bachelor of Technology (B.Tech)",
    "Bachelor of Engineering (B.E.)",
    "Bachelor of Medicine and Bachelor of Surgery (MBBS)",
    "Bachelor of Dental Surgery (BDS)",
    "Bachelor of Science (B.Sc)",
    "BHMS",
    "BAMS",
    "BUMS",
    "B.Sc - Nursing",
    "Bachelor of Commerce (B.Com)",
    "Bachelor of Arts (B.A)",
    "Bachelor of Laws (LLB)",
    "Bachelor of Computer Applications (BCA)",
    "Bachelor of Business Administration (BBA)",
    "Bachelor of Pharmacy",
    "Bachelor of Medical Laboratory Technology",
  ],
  "Post Graduate": [
    "Master of Technology (M.Tech)",
    "Master of Arts - Psychology",
    "Master of Business Administration (MBA)",
    "Master of Science - Embryology",
    "Master of Science - Clinical Psychology",
    "Master of Science",
    "Master of Commerce (M.Com)",
    "Doctor of Medicine (MD)",
    "Master of Surgery (MS)",
    "Master of Dental Surgery (MDS)",
    "Master of Computer Applications (MCA)",
    "Master of Laws (LLM)",
  ],
  Doctoral: [
    "Doctor of Philosophy (PhD)",
    "Doctorate of Medicine (DM)",
    "Magister Chirurgiae (MCh)",
  ],
};

/** Stored in talent_pool_entry.qualification for HR browse/search. */
export function formatTalentPoolQualification(level, degree) {
  const l = (level || "").trim();
  const d = (degree || "").trim();
  if (!l && !d) return "";
  if (!d) return l;
  if (!l) return d;
  return `${l} — ${d}`;
}

export function resolveTalentPoolCityPick(city, other) {
  if (!city) return "";
  if (city === "__OTHER__") return (other || "").trim();
  return city;
}
export const INDIAN_CITIES_FALLBACK = [
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
export const LS_TOKEN = "swar_token";
export const LS_ROLE = "swar_role";
export const LS_CANDIDATE_ID = "swar_candidate_id";
export const LS_HR_ID = "swar_hr_id";
export function authHeaders() {
  const t = localStorage.getItem(LS_TOKEN);
  if (t && t !== "cookie") return { Authorization: "Bearer " + t };
  return {};
}

export const API_FETCH_CREDENTIALS = "include" as RequestCredentials;

export function apiFetchInit(init: RequestInit = {}): RequestInit {
  return {
    credentials: API_FETCH_CREDENTIALS,
    ...init,
    headers: { ...authHeaders(), ...((init.headers as Record<string, string>) ?? {}) },
  };
}
export function isApiAttachmentUrl(url) {
  if (!url || typeof url !== "string") return false;
  return url.includes("/api/attachments/");
}
export function cvFetchInit(url) {
  return isApiAttachmentUrl(url) ? apiFetchInit({ headers: authHeaders() }) : undefined;
}
export function cvFileHref(cvFile) {
  if (!cvFile) return null;
  return cvFile.dataUrl || cvFile.downloadUrl || null;
}
export function downloadCvFile(cvFile) {
  if (!cvFile) return;
  const href = cvFileHref(cvFile);
  if (!href) return;
  if (cvFile.downloadUrl && !cvFile.dataUrl) {
    fetch(href, cvFetchInit(href))
      .then((r) => {
        if (!r.ok) throw new Error(`Download failed (${r.status})`);
        return r.blob();
      })
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
export const LS_ABANDON_QUEUE = "swar_abandon_queue_v1";
export const ABANDON_FETCH_TIMEOUT_MS = 8000;
export function readAbandonQueue() {
  try {
    const raw = localStorage.getItem(LS_ABANDON_QUEUE);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
export function writeAbandonQueue(items) {
  try {
    localStorage.setItem(LS_ABANDON_QUEUE, JSON.stringify(items.slice(0, 25)));
  } catch (_) {}
}
export function dequeueAbandonJob(applicationId) {
  const aid = parseInt(String(applicationId), 10);
  if (!Number.isFinite(aid)) return;
  writeAbandonQueue(readAbandonQueue().filter((x) => x.applicationId !== aid));
}
export function enqueueAbandonJob({ applicationId, clientDetail, token: tokenOpt }) {
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
export async function postInterviewAbandonWithFallback(applicationId, clientDetail, opts = {}) {
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
export async function flushPendingAbandonQueue() {
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
export function parsePath(pathname, search) {
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
export function matchJobsApplyDest(dest) {
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
export function getHrExternalConfig() {
  const rawUrl = typeof window.HR_FRONTEND_URL === "string" ? window.HR_FRONTEND_URL.trim() : "";
  const mode = String(window.HR_FRONTEND_MODE || "builtin").toLowerCase();
  if (!rawUrl) return { useExternal: false, mode: "builtin", url: "" };
  if (mode !== "iframe" && mode !== "redirect") return { useExternal: false, mode: "builtin", url: rawUrl };
  return { useExternal: true, mode, url: rawUrl };
}
export function fmtDate(d) { try { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch { return "—"; } }
export function fmtDateTime(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}
export function fmtSize(b) { return b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(1) + " KB" : (b / 1048576).toFixed(2) + " MB"; }
export function fileIcon(ext) { return ext === "pdf" ? "📕" : (ext === "docx" || ext === "doc") ? "📘" : "🖼️"; }
export function getLatestAppForJob(history, jobId) {
  const past = (history || []).filter((a) => a.jobId === jobId);
  if (past.length === 0) return null;
  return [...past].sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt))[0];
}
export function candidateHasAnyInterviewTranscript(c) {
  if (c?.hasTranscript) return true;
  if (c?.transcript?.length) return true;
  return (c?.applicationHistory || []).some((h) => h.transcript?.length > 0);
}
export function transcriptLinesForApplication(c, applicationId) {
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
export function activeRoleHasTranscript(c) {
  if (c?.hasTranscript && !c?.applicationHistory?.length) return true;
  const latest = getLatestAppForJob(c?.applicationHistory || [], c?.jobId);
  if (!latest) return false;
  if (applicationVoiceInterviewCompleted(latest)) return true;
  return !!(latest.transcript?.length ||
    (c?.transcript?.length && !(c.applicationHistory || []).some((h) => h.transcript?.length > 0)));
}
export const CANDIDATE_REATTEMPT_REASONS = [
  { value: "TECH_NETWORK", label: "Network / connectivity dropped" },
  { value: "MIC_DEVICE", label: "Microphone or device failed" },
  { value: "Genuine_CONSTRAINT", label: "Genuine constraint (power, emergency, etc.)" },
  { value: "OTHER", label: "Other (explain in notes)" },
];
export const HR_REATTEMPT_REASON_LABELS = {
  CANDIDATE_CONSTRAINTS: "Candidate faced genuine constraints",
  QUALITY_IMPACTED: "Interview quality impacted (noise, device, etc.)",
  BUSINESS_EXCEPTION: "Business exception approval",
  BORDERLINE_HIGH_POTENTIAL: "Borderline score – high potential reassessment",
};
/** HR-approved reattempt must be started within this many hours (reattempt_resolved_at). */
export const REATTEMPT_COMPLETION_HOURS = 72;
export const REATTEMPT_DEADLINE_MS = REATTEMPT_COMPLETION_HOURS * 60 * 60 * 1000;
export const REATTEMPT_DEADLINE_EXPIRED_MESSAGE =
  "Your reattempt window has closed (72 hours). Please contact career@indiraivf.in if you need assistance.";
export function isApprovedReattemptWindow(app) {
  if (!app?.reattemptResolvedAt || !app?.reattemptHrReasonCode) return false;
  const ic =
    app.interviewCompletionStatus ||
    (app.interviewCompletedAt ? "completed" : "not_started");
  return ic === "not_started" && !app.interviewCompletedAt;
}
export function reattemptDeadlineStatus(app, nowMs = Date.now()) {
  if (!isApprovedReattemptWindow(app)) {
    return { applies: false, expired: false, deadlineMs: null, remainingMs: null };
  }
  const resolvedMs = new Date(app.reattemptResolvedAt).getTime();
  if (Number.isNaN(resolvedMs)) {
    return { applies: false, expired: false, deadlineMs: null, remainingMs: null };
  }
  const deadlineMs = resolvedMs + REATTEMPT_DEADLINE_MS;
  return {
    applies: true,
    expired: nowMs >= deadlineMs,
    deadlineMs,
    remainingMs: Math.max(0, deadlineMs - nowMs),
  };
}
export function interviewEligibleForJob(c, jobId) {
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
  if (ic === "not_started" || ic === "in_progress") {
    const rd = reattemptDeadlineStatus(app);
    if (rd.applies && rd.expired && ic === "not_started") {
      return { ok: false, reason: REATTEMPT_DEADLINE_EXPIRED_MESSAGE };
    }
    return { ok: true };
  }
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
export const INTERVIEW_START_GRACE_MINUTES = 15;
export const INTERVIEW_START_GRACE_MS = INTERVIEW_START_GRACE_MINUTES * 60 * 1000;
export const INTERVIEW_SLOT_CLOSED_MESSAGE =
  "The scheduled window is closed. Please contact career@indiraivf.in";
/** When a slot is chosen, Start is only allowed from scheduled time until grace end (unless bypassSchedule). */
export function interviewStartSlotStatus(scheduledIso, bypassSchedule) {
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
/** Live countdown for a future slot, e.g. "19hr 23sec" or "50min 45sec". Null when start time has arrived. */
export function formatInterviewCountdown(scheduledIso, nowMs = Date.now()) {
  const schedMs = new Date(scheduledIso).getTime();
  if (Number.isNaN(schedMs)) return null;
  const ms = schedMs - nowMs;
  if (ms <= 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) return `${hours}hr ${seconds}sec`;
  return `${minutes}min ${seconds}sec`;
}
export function patchLatestApp(history, jobId, patch) {
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
export function patchApplicationById(history, applicationId, patch) {
  if (!Array.isArray(history) || applicationId == null) return history || [];
  return history.map((row) =>
    row.applicationId === applicationId ? { ...row, ...patch } : row,
  );
}
export function transcriptAvailableForJob(c, jobId) {
  const app = getLatestAppForJob(c?.applicationHistory || [], jobId);
  if (!app || app.applicationId == null) return false;
  const lines = transcriptLinesForApplication(c, app.applicationId);
  return !!(lines && lines.length > 0);
}
/** True when the latest application ended with a technical/session dropout and the candidate may submit (or re-submit after rejection) an HR reattempt request. */
export function applicationEligibleForTechnicalReattemptRequest(app) {
  if (!app || app.applicationId == null) return false;
  if (app.interviewCompletionStatus !== "incomplete_technical") return false;
  const rs = app.reattemptRequestStatus || "none";
  if (rs !== "none" && rs !== "rejected") return false;
  const hr = app.hrDecisionStatus;
  if (hr === "SHORTLISTED" || hr === "REJECTED") return false;
  return true;
}
/** True once the candidate has any reattempt workflow recorded (submitted, approved, or rejected). */
export function applicationHasReattemptHistory(app) {
  const rs = app?.reattemptRequestStatus || "none";
  return rs !== "none";
}
/** Voice interview finished for this application — HR decision is scoped to after this. */
export function applicationVoiceInterviewCompleted(app) {
  if (!app) return false;
  if (app.interviewCompletionStatus === "completed") return true;
  if (app.interviewCompletedAt) return true;
  return false;
}
export function portalStatusLabel(c, jobId) {
  const app = getLatestAppForJob(c?.applicationHistory || [], jobId);
  if (!app) return "—";
  if (app.hrDecisionStatus === "SHORTLISTED" || app.hrDecisionStatus === "REJECTED") return app.hrDecisionStatus;
  if (app.interviewCompletionStatus === "incomplete_technical") return "REATTMPT";
  if (app.interviewCompletedAt || app.interviewCompletionStatus === "completed") return "INTERVIEWED";
  if (app.interviewScheduledAt) return "SCHEDULED";
  return "APPLIED";
}
/** One row per distinct job (latest application), matching candidate portal pills — for HR Analysis tabs. */
export function hrAnalysisRoleRows(candidate) {
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
export function getCoolingStatus(history, jobId, coolingMonths) {
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
export async function processResumeFile(file, maxMb) {
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
export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
export function dataUrlToBlobUrl(dataUrl) {
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
export function getPdfjsLib() {
  return typeof window !== "undefined" && window.pdfjsLib ? window.pdfjsLib : null;
}
export function parseAuditDetails(d) {
  if (d == null) return null;
  if (typeof d === "object") return d;
  const s = String(d).trim();
  if (!s || !(s.startsWith("{") || s.startsWith("["))) return null;
  try { return JSON.parse(s); } catch { return null; }
}
export function humanizeClientDetail(s) {
  if (!s) return "";
  return String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
export function resolveActorLabel(actor, hrUsersMap, candidatesMap) {
  if (!actor) return "—";
  if (actor === "HR") return "HR";
  const hrName = hrUsersMap && hrUsersMap[actor];
  if (hrName && String(hrName).trim()) return `${String(hrName).trim()} (${actor})`;
  const candName = candidatesMap && candidatesMap[actor];
  if (candName && String(candName).trim()) return `${String(candName).trim()} (${actor})`;
  return actor;
}
export const AUDIT_ACTION_META = {
  "interview.reattempt_approved": { label: "Reattempt approved", tone: "green" },
  "interview.reattempt_rejected": { label: "Reattempt rejected", tone: "red" },
  "interview.reattempt_requested": { label: "Reattempt requested", tone: "amber" },
  "interview.incomplete_technical": { label: "Interview ended early", tone: "orange" },
  VIEW_TP_PROFILE: { label: "Viewed talent profile", tone: "blue" },
  VIEW_TP_CV: { label: "Viewed CV", tone: "blue" },
  DOWNLOAD_TP_CV: { label: "Downloaded CV", tone: "purple" },
  MAP_TO_JOB: { label: "Mapped to job", tone: "green" },
};

export const AUDIT_TONE_CLASSES = {
  green: "bg-green-50 text-green-700",
  red: "bg-red-50 text-red-700",
  amber: "bg-amber-50 text-amber-700",
  orange: "bg-orange-50 text-orange-700",
  blue: "bg-blue-50 text-blue-700",
  purple: "bg-purple-50 text-purple-700",
  slate: "bg-slate-100 text-slate-700",
};

export function formatAuditDate(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
export function formatAuditTime(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d
    .toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
    .replace(/\s*(am|pm)/i, (_, p) => " " + p.toUpperCase());
}
export function humanizeAuditEntry(entry, hrUsersMap, candidatesMap) {
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
export function verdictLabel(v) {
  const m = { senior: "Senior", mid: "Mid", junior: "Junior", fresher: "Fresher" };
  return m[v] || (v ? String(v) : "—");
}
export function buildCvAnalyserInviteEmail({ candidateName, jobTitle, interviewLink }) {
  const cn = (candidateName && String(candidateName).trim()) || "Candidate";
  const jt = (jobTitle && String(jobTitle).trim()) || "the position";
  const link = (interviewLink && String(interviewLink).trim()) || "";
  const subject = "Next Step: AI Interview";
  const body = `Dear ${cn},

Thank you for your interest in the ${jt} position at Indira IVF Hospital Ltd. We have received your CV.

As the first step in our hiring process, you are required to complete an AI-based interview. Please use the details below to access and complete your interview within 72 hours.

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

Thank you for your interest in joining Indira IVF Hospital Ltd. We wish you the very best in the process.

Warm regards,
Talent Acquisition Team`;
  return { subject, body };
}
export function savedAnalysisIsRenderable(a) {
  if (!a || typeof a !== "object") return false;
  if (String(a.summary || "").trim().length > 0) return true;
  if (typeof a.tech === "number" || typeof a.comm === "number") return true;
  if (Array.isArray(a.strengths) && a.strengths.length > 0) return true;
  if (Array.isArray(a.areas) && a.areas.length > 0) return true;
  const rec = String(a.rec || "").trim();
  if (rec.length > 0 && rec !== "Pending review") return true;
  return false;
}
export function normalizeSavedAnalysis(a) {
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
export function analysisInterviewMessages(transcript, jdTitle) {
  const tx = (transcript || []).map((t) => `${t.role === "ai" ? "SWAR" : "CAND"}: ${t.text}`).join("\n");
  return [{ role: "user", content: `Analyse for "${jdTitle}". Transcript:\n${tx}\n\nReturn JSON: {"summary":"3 sentences","strengths":["s1","s2","s3"],"areas":["a1","a2","a3"],"tech":7,"comm":8,"rec":"Hire"}` }];
}
