import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";


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

function HRBridge({ children, onLogout }) {
  const { useExternal, mode, url } = getHrExternalConfig();
  if (!useExternal) return children;
  if (mode === "redirect") return <HRRedirectOnce href={url} />;
  return <HRIframeShell baseUrl={url} onLogout={onLogout} />;
}

function HRRedirectOnce({ href }) {
  useEffect(() => {
    let dest = href;
    if (window.HR_PASS_SWAR_TOKEN === true) {
      const t = localStorage.getItem(LS_TOKEN);
      if (t) {
        const param = (typeof window.HR_TOKEN_QUERY_PARAM === "string" && window.HR_TOKEN_QUERY_PARAM.trim()) || "token";
        const sep = href.includes("?") ? "&" : "?";
        dest = href + sep + param + "=" + encodeURIComponent(t);
      }
    }
    window.location.replace(dest);
  }, [href]);
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3 p-6">
      <div className="w-10 h-10 border-4 border-indigo-800 border-t-indigo-400 rounded-full animate-spin"/>
      <p className="text-slate-400 text-sm">Redirecting to HR workspace…</p>
    </div>
  );
}

function HRIframeShell({ baseUrl, onLogout }) {
  const param = (typeof window.HR_TOKEN_QUERY_PARAM === "string" && window.HR_TOKEN_QUERY_PARAM.trim()) || "token";
  const qs = window.HR_PASS_SWAR_TOKEN === true ? (() => {
    const t = localStorage.getItem(LS_TOKEN);
    if (!t) return "";
    const sep = baseUrl.includes("?") ? "&" : "?";
    return sep + param + "=" + encodeURIComponent(t);
  })() : "";
  const src = baseUrl + qs;
  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900 text-white">
        <span className="text-sm font-bold tracking-tight">Swar AI · HR</span>
        <button type="button" onClick={onLogout} className="text-xs font-bold text-slate-300 hover:text-white underline">Logout</button>
      </div>
      <iframe title="HR workspace" src={src} className="flex-1 w-full min-h-0 border-0 bg-white" style={{ height: "calc(100vh - 52px)" }} />
    </div>
  );
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

function Badge() { return <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">🛡 DPDPA</span>; }
function Spin({ label = "Loading…" }) { return <div className="flex flex-col items-center justify-center py-20 gap-4"><div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"/><p className="text-slate-500 text-sm animate-pulse">{label}</p></div>; }

function Modal({ title, children, onClose, wide }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-screen overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="font-bold text-slate-800">{title}</h2>
          {onClose && <button onClick={onClose} className="text-slate-400 hover:text-slate-700 w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center">✕</button>}
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function PrivacyModal({ onClose, coolingMonths, dpo }) {
  const cm = coolingMonths ?? 3;
  const d = dpo || { name: "DPO", email: "", phone: "" };
  return (
    <Modal title="Privacy Policy" onClose={onClose} wide>
      <p className="text-xs text-slate-400 mb-4">DPDPA 2023 & DPDP Rules 2025</p>
      {[
        ["1. Data Fiduciary", "Indira IVF Hospital Pvt. Ltd. (§2(j))."],
        ["2. Legal Basis", "Explicit consent (§6) and employment legitimate use (§7)."],
        ["3. Third-Party Sharing", "Anthropic, Inc. (USA) via Claude API for AI screening only. Not retained."],
        ["4. Talent Pool", `CVs stored independently. Authorized HR SPOCs only. Access logged (§8).`],
        ["5. Cooling Period", `${cm}-month cooling period between applications to the same role.`],
        ["6. Your Rights", "§11 Access · §12 Correction & Erasure · §6(4) Withdraw · §13 Grievance · §14 Nominate."],
        ["7. Grievance Officer", `${d.name} · ${d.email} · ${d.phone}. 7-day SLA. Escalate to dpb.gov.in.`],
      ].map(([h, b]) => <div key={h} className="mb-4"><h3 className="font-bold text-slate-900 text-sm mb-1">{h}</h3><p className="text-slate-600 text-sm leading-relaxed">{b}</p></div>)}
    </Modal>
  );
}

function ForgotPassword({ candidates, onReset, onBack }) {
  const [phase, setPhase] = useState("email"), [email, setEmail] = useState(""), [newPw, setNewPw] = useState(""), [confirmPw, setConfirmPw] = useState(""), [err, setErr] = useState("");
  const find = () => { setErr(""); const u = candidates.find(c => c.email.toLowerCase() === email.trim().toLowerCase()); if (!u) { setErr("No account found."); return; } setPhase("reset"); };
  const reset = () => { setErr(""); if (newPw.length < 6) { setErr("Min. 6 characters."); return; } if (newPw !== confirmPw) { setErr("Passwords don't match."); return; } onReset(email.trim().toLowerCase(), newPw); setPhase("done"); };
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button onClick={onBack} className="text-slate-400 hover:text-white mb-6 text-sm">← Back to Login</button>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          {phase === "done" ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-900/40 text-green-400 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
              <h2 className="text-2xl font-black text-white mb-2">Password Reset!</h2>
              <button onClick={onBack} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl">Back to Login →</button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <div className="w-12 h-12 bg-indigo-900/50 border border-indigo-700 rounded-xl flex items-center justify-center mb-4 text-2xl">🔑</div>
                <h1 className="text-2xl font-black text-white mb-1">{phase === "email" ? "Forgot Password?" : "Reset Password"}</h1>
              </div>
              {phase === "email" ? (
                <div className="space-y-4">
                  <input type="email" value={email} onChange={e => { setEmail(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && find()} placeholder="your@email.com" className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"/>
                  {err && <p className="text-red-400 text-sm">⚠ {err}</p>}
                  <button onClick={find} disabled={!email.trim()} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold rounded-xl">Continue →</button>
                </div>
              ) : (
                <div className="space-y-4">
                  <input type="password" value={newPw} onChange={e => { setNewPw(e.target.value); setErr(""); }} placeholder="New password (min 6)" className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"/>
                  <input type="password" value={confirmPw} onChange={e => { setConfirmPw(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && reset()} placeholder="Confirm password" className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"/>
                  {err && <p className="text-red-400 text-sm">⚠ {err}</p>}
                  <button onClick={reset} disabled={!newPw || !confirmPw} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold rounded-xl">Reset →</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ConsentScreen({ onAccept, onDecline, dataCategories, coolingMonths, dpo }) {
  const [agreed, setAgreed] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const cats = dataCategories && dataCategories.length > 0 ? dataCategories : [];
  return (
    <>
      {showPolicy && <PrivacyModal onClose={() => setShowPolicy(false)} coolingMonths={coolingMonths} dpo={dpo}/>}
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl">
          <div className="bg-indigo-700 px-6 py-5">
            <div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center font-black text-white text-sm">S</div><Badge/></div>
            <h1 className="text-xl font-black text-white">Consent & Privacy Notice</h1>
          </div>
          <div className="p-6 space-y-3">
            <p className="text-slate-300 text-sm">Data we will process for your recruitment:</p>
            <div className="space-y-2">
              {cats.map(d => (
                <div key={d.id} className="flex gap-3 p-3 rounded-xl border border-slate-700 bg-slate-800/50">
                  <div className="w-5 h-5 rounded-full bg-indigo-900/50 border border-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                  </div>
                  <div>
                    <p className="text-white text-sm font-semibold">{d.label}</p>
                    <p className="text-slate-400 text-xs">{d.items}</p>
                    <p className="text-indigo-300 text-xs mt-0.5"><b>Purpose:</b> {d.purpose}</p>
                  </div>
                </div>
              ))}
            </div>
            <label className={`flex gap-3 p-4 rounded-xl border cursor-pointer transition-all mt-4 ${agreed ? "border-indigo-500 bg-indigo-900/30" : "border-slate-700 bg-slate-800/50"}`}>
              <input type="checkbox" checked={agreed} onChange={() => setAgreed(!agreed)} className="mt-0.5 w-5 h-5 accent-indigo-500 shrink-0"/>
              <div><p className="text-white text-sm font-bold">I consent to all of the above</p><p className="text-slate-400 text-xs mt-0.5">I agree to processing of my data and confirm I am 18+</p></div>
            </label>
            <p className="text-slate-500 text-xs">By proceeding you confirm you have read our <button onClick={() => setShowPolicy(true)} className="text-indigo-400 underline">Privacy Policy</button>.</p>
            <div className="flex gap-3 pt-1">
              <button onClick={onDecline} className="flex-1 py-3 border border-slate-600 text-slate-400 font-bold rounded-xl hover:bg-slate-800 text-sm">Decline</button>
              <button onClick={() => agreed && onAccept(cats.map(d => d.id))} disabled={!agreed || cats.length === 0} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold rounded-xl text-sm">I Consent →</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Login({ onCandSuccess, onHrSuccess, onRegister, onForgot, coolingMonths, dpo }) {
  const [role, setRole] = useState("candidate"), [id, setId] = useState(""), [pw, setPw] = useState(""), [hrPw, setHrPw] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [showPw, setShowPw] = useState(false), [showP, setShowP] = useState(false);
  const submit = async () => {
    setErr("");
    if (role === "candidate" && (!id.trim() || !pw.trim())) return;
    if (role === "hr" && (!id.trim() || !hrPw.trim())) { setErr("Enter Corporate AD ID and password."); return; }
    setBusy(true);
    try {
      if (role === "hr") {
        const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "hr", hrId: id.trim(), password: hrPw }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setErr(data.error || "HR login failed"); return; }
        await onHrSuccess({ hrId: data.hrId || id.trim(), token: data.token });
      } else {
        const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "candidate", email: id.trim(), password: pw.trim() }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setErr(data.error || "Invalid email or password"); return; }
        await onCandSuccess({ candidateId: data.candidateId, token: data.token });
      }
    } catch (e) {
      setErr("Cannot reach server. Start backend (npm start) and check DATABASE_URL.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {showP && <PrivacyModal onClose={() => setShowP(false)} coolingMonths={coolingMonths} dpo={dpo}/>}
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-2xl"><span className="text-white text-2xl font-black">S</span></div>
            <h1 className="text-3xl font-black text-white">Swar AI</h1>
            <p className="text-slate-400 text-sm mt-1">Recruitment Intelligence Platform</p>
            <div className="mt-2 flex justify-center"><Badge/></div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
            <div className="flex rounded-xl overflow-hidden mb-6 border border-slate-700">
              {["candidate", "hr"].map(r => <button key={r} onClick={() => { setRole(r); setErr(""); setId(""); setPw(""); setHrPw(""); }} className={`flex-1 py-2.5 text-sm font-bold capitalize transition-all ${role === r ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}>{r === "hr" ? "HR Admin" : "Candidate"}</button>)}
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{role === "hr" ? "Corporate AD ID" : "Email"}</label>
                <input type={role === "hr" ? "text" : "email"} value={id} onChange={e => { setId(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && submit()} placeholder={role === "hr" ? "HR-TM-001" : "your@email.com"} className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"/>
              </div>
              {role === "candidate" && (
                <div>
                  <div className="flex items-center justify-between mb-2"><label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Password</label><button type="button" onClick={onForgot} className="text-xs text-indigo-400 font-medium">Forgot?</button></div>
                  <div className="relative">
                    <input type={showPw ? "text" : "password"} value={pw} onChange={e => { setPw(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && submit()} placeholder="••••••••" className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500 pr-16"/>
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">{showPw ? "HIDE" : "SHOW"}</button>
                  </div>
                </div>
              )}
              {role === "hr" && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Password</label>
                  <input type="password" value={hrPw} onChange={e => { setHrPw(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && submit()} placeholder="HR Password" className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500"/>
                </div>
              )}
              {err && <p className="text-red-400 text-sm">⚠ {err}</p>}
              <button type="button" onClick={submit} disabled={busy || !id.trim() || (role === "candidate" && !pw.trim()) || (role === "hr" && !hrPw.trim())} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold rounded-xl">{busy ? "Logging in…" : "Sign In →"}</button>
            </div>
            {role === "candidate" && (
              <div className="mt-6 pt-6 border-t border-slate-800 text-center space-y-2">
                <p className="text-slate-500 text-sm">New here? <button type="button" onClick={onRegister} className="text-indigo-400 font-bold">Register</button></p>
                <p className="text-slate-600 text-xs"></p>
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-slate-800 text-center"><button type="button" onClick={() => setShowP(true)} className="text-xs text-slate-500 underline">Privacy Policy</button></div>
          </div>
        </div>
      </div>
    </>
  );
}

function ReattemptQueue({ onBack, onResolved }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const [decision, setDecision] = useState("approve");
  const [hrCode, setHrCode] = useState("QUALITY_IMPACTED");
  const [hrNotes, setHrNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => {
    setLoading(true);
    const tok = localStorage.getItem(LS_TOKEN);
    fetch("/api/admin/reattempt-pending", { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  const submit = async () => {
    if (!sel) return;
    setBusy(true);
    try {
      const tok = localStorage.getItem(LS_TOKEN);
      const r = await fetch(`/api/admin/applications/${sel.applicationId}/reattempt-resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ decision, hrReasonCode: hrCode, hrNotes: hrNotes.trim() }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        window.alert(e.error || "Request failed");
      } else {
        setSel(null);
        setHrNotes("");
        load();
        if (typeof onResolved === "function") await onResolved();
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center gap-3">
        <button type="button" onClick={onBack} className="text-slate-400 hover:text-white text-sm">← Back</button>
        <span className="font-bold">Reattempt approvals</span>
        <Badge />
      </div>
      <div className="max-w-3xl mx-auto px-6 py-8">
        {loading ? <p className="text-slate-500 text-sm">Loading…</p> : items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-sm">No pending reattempt requests.</div>
        ) : (
          <div className="space-y-3">
            {items.map((row) => (
              <button
                key={row.applicationId}
                type="button"
                onClick={() => { setSel(row); setDecision("approve"); setHrCode("QUALITY_IMPACTED"); }}
                className="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 hover:border-indigo-300 transition-colors"
              >
                <p className="font-bold text-slate-900">{row.candidateName}</p>
                <p className="text-xs text-slate-500">{row.candidateEmail}</p>
                <p className="text-sm text-indigo-700 font-semibold mt-1">{row.jobTitle || "—"} · Application #{row.applicationId}</p>
                <p className="text-xs text-slate-400 mt-1">Requested: {row.requestedAt ? fmtDateTime(row.requestedAt) : "—"}</p>
                {row.candidateReasonCode && <p className="text-xs text-slate-600 mt-2">Candidate: {row.candidateReasonCode}{row.candidateReasonText ? ` — ${row.candidateReasonText.slice(0, 200)}` : ""}</p>}
              </button>
            ))}
          </div>
        )}
        {sel && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => !busy && setSel(null)}>
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-black text-slate-900 mb-2">Resolve reattempt</h3>
              <p className="text-sm text-slate-600 mb-4">{sel.candidateName} · {sel.jobTitle}</p>
              {sel.candidateReasonCode ? (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-1.5">Candidate request</p>
                  <p className="text-sm text-slate-800 leading-snug">
                    Candidate: {sel.candidateReasonCode}
                    {sel.candidateReasonText ? ` — ${String(sel.candidateReasonText).trim()}` : ""}
                  </p>
                </div>
              ) : null}
              <label className="block text-xs font-bold text-slate-500 mb-1">Decision</label>
              <select value={decision} onChange={(e) => setDecision(e.target.value)} className="w-full border rounded-xl px-3 py-2 mb-3 text-sm">
                <option value="approve">Approve (clears prior answers &amp; transcript for this application)</option>
                <option value="reject">Reject</option>
              </select>
              <label className="block text-xs font-bold text-slate-500 mb-1">HR reason (required)</label>
              <select value={hrCode} onChange={(e) => setHrCode(e.target.value)} className="w-full border rounded-xl px-3 py-2 mb-3 text-sm">
                {Object.keys(HR_REATTEMPT_REASON_LABELS).map((k) => <option key={k} value={k}>{HR_REATTEMPT_REASON_LABELS[k]}</option>)}
              </select>
              <label className="block text-xs font-bold text-slate-500 mb-1">Notes (optional)</label>
              <textarea value={hrNotes} onChange={(e) => setHrNotes(e.target.value)} rows={3} className="w-full border rounded-xl px-3 py-2 mb-4 text-sm resize-none" placeholder="Internal notes…" />
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => setSel(null)} className="flex-1 py-2 border rounded-xl text-sm font-bold">Cancel</button>
                <button type="button" disabled={busy} onClick={submit} className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold">{busy ? "…" : "Submit"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HRDash({ candidates, jobs, talentPool, auditLog, reattemptPendingCount, onView, onInterview, onAnalysis, onCvAnalyser, onJobs, onScreen, onTalentPool, onAuditLog, onReattempts, onLogout }) {
  const [filter, setFilter] = useState("ALL");
  const stats = [{ l: "Total", v: candidates.length, s: "ALL" }, { l: "Applied", v: candidates.filter(c => c.status === "APPLIED").length, s: "APPLIED" }, { l: "Shortlisted", v: candidates.filter(c => c.status === "SHORTLISTED").length, s: "SHORTLISTED" }, { l: "Interviewed", v: candidates.filter(c => c.status === "INTERVIEWED").length, s: "INTERVIEWED" }, { l: "Rejected", v: candidates.filter(c => c.status === "REJECTED").length, s: "REJECTED" }];
  const jt = id => jobs.find(j => j.id === id)?.title || "—";
  const schedFor = (c) => getLatestAppForJob(c.applicationHistory, c.jobId)?.interviewScheduledAt;
  const filtered = filter === "ALL" ? candidates : candidates.filter(c => c.status === filter);
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3"><div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-black text-sm">S</div><span className="font-bold">HR Portal</span><Badge/></div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={onCvAnalyser} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 hover:-translate-y-0.5 text-white rounded-lg text-sm font-medium transition-transform">CV Analyser</button>
          <button onClick={onJobs} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 hover:-translate-y-0.5 text-white rounded-lg text-sm font-medium transition-transform">Jobs</button>
          <button onClick={onTalentPool} className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 hover:-translate-y-0.5 text-white rounded-lg text-sm font-medium transition-transform">🌟 Talent Pool ({talentPool.length})</button>
          <button onClick={onScreen} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 hover:-translate-y-0.5 text-white rounded-lg text-sm font-medium transition-transform">Screen</button>
          <button type="button" onClick={onReattempts} className="px-3 py-1.5 bg-amber-800 hover:bg-amber-700 hover:-translate-y-0.5 text-white rounded-lg text-sm font-medium transition-transform relative">
            Reattempts{typeof reattemptPendingCount === "number" && reattemptPendingCount > 0 ? <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-1 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">{reattemptPendingCount > 9 ? "9+" : reattemptPendingCount}</span> : null}
          </button>
          <button onClick={onAuditLog} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 hover:-translate-y-0.5 text-white rounded-lg text-sm font-medium transition-transform">📋 Audit</button>
          <button type="button" onClick={onLogout} className="px-3 py-1.5 bg-red-900/50 hover:bg-red-900 text-red-300 rounded-lg text-sm font-medium">Logout</button>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-black text-slate-900 mb-1">Recruitment Dashboard</h1>
        <p className="text-slate-500 text-sm mb-6">Click any stat or candidate to drill in.</p>
        <div className="grid grid-cols-5 gap-4 mb-6">{stats.map(s => <button key={s.l} onClick={() => setFilter(s.s)} className={`text-left bg-white rounded-2xl p-5 border shadow-sm transition-all hover:shadow-md ${filter === s.s ? "border-indigo-400 ring-2 ring-indigo-100" : "border-slate-100"}`}><p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{s.l}</p><p className="text-3xl font-black text-slate-900">{s.v}</p></button>)}</div>
        <div className="flex items-center justify-between mb-4"><h2 className="text-xl font-bold text-slate-800">Candidates {filter !== "ALL" && <span className="text-sm text-slate-500 font-normal">· {filter}</span>}</h2>{filter !== "ALL" && <button onClick={() => setFilter("ALL")} className="text-xs text-indigo-600 font-bold">Clear ✕</button>}</div>
        {filtered.length === 0 ? <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center"><p className="text-slate-400">No candidates.</p></div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{filtered.map(c => (
            <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg hover:border-indigo-200 transition-all cursor-pointer" onClick={() => onView(c.id)}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-lg">{c.name[0]}</div><div><p className="font-bold text-slate-900">{c.name}</p><p className="text-xs text-slate-400">{c.email}</p></div></div>
                <span className={`text-xs font-black uppercase px-2 py-1 rounded-lg ${SB[c.status] || "bg-slate-100"}`}>{c.status}</span>
              </div>
              <p className="text-sm font-semibold text-slate-700 mb-1">{jt(c.jobId)}</p>
              {schedFor(c) ? <p className="text-xs font-bold text-teal-700 mb-2">📅 Interview scheduled: {fmtDateTime(schedFor(c))}</p> : null}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <div className={`text-xs font-bold px-2 py-1 rounded-lg ${c.consent ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>{c.consent ? "✓ Consent" : "⚠ No consent"}</div>
                {candidateHasAnyInterviewTranscript(c) && <div className="text-xs font-bold px-2 py-1 rounded-lg bg-teal-50 text-teal-600">🎤 Done</div>}
                {c.fromTalentPool && <div className="text-xs font-bold px-2 py-1 rounded-lg bg-amber-50 text-amber-700">🌟 Pool</div>}
                {(c.applicationHistory || []).length > 1 && <div className="text-xs font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-600">{c.applicationHistory.length} apps</div>}
              </div>
              <div className="flex gap-2 pt-3 border-t border-slate-100" onClick={e => e.stopPropagation()}>
                <button onClick={() => onView(c.id)} className="flex-1 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg">View</button>
                {c.consent && !activeRoleHasTranscript(c) && (c.status === "SHORTLISTED" || c.status === "APPLIED") && !schedFor(c) && (
                  <button onClick={() => onInterview(c.id)} className="flex-1 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg">Start interview</button>
                )}
                {(c.status === "INTERVIEWED" || c.analysis || candidateHasAnyInterviewTranscript(c) || (c.applicationHistory || []).some((a) => a.analysis || a.interviewCompletedAt)) && (
                  <button onClick={() => onAnalysis(c.id)} className="flex-1 py-2 bg-teal-600 text-white text-xs font-bold rounded-lg">Analysis</button>
                )}
              </div>
            </div>
          ))}</div>
        )}
      </div>
    </div>
  );
}

function CandidateDetail({ candidate, jobs, onUpdate, onInterview, onAnalysis, onBack }) {
  const [showCV, setShowCV] = useState(false), [showTranscript, setShowTranscript] = useState(true), [remarks, setRemarks] = useState(candidate.remarks || ""), [flash, setFlash] = useState("");
  const [detailTab, setDetailTab] = useState("timeline");
  const [interviewAns, setInterviewAns] = useState(null);
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [selectedApplicationId, setSelectedApplicationId] = useState(null);
  const appliedList = (candidate.applicationHistory || []).map(a => ({ ...a, job: jobs.find(j => j.id === a.jobId) })).filter(a => a.job);
  useEffect(() => {
    const valid = new Set((candidate.applicationHistory || []).map((a) => a.applicationId).filter((id) => id != null));
    setSelectedApplicationId((prev) => {
      if (prev != null && valid.has(prev)) return prev;
      return getLatestAppForJob(candidate.applicationHistory, candidate.jobId)?.applicationId ?? [...valid][0] ?? null;
    });
  }, [candidate.id, candidate.jobId, JSON.stringify((candidate.applicationHistory || []).map((a) => [a.applicationId, a.jobId]))]);
  const selectedAppRow = appliedList.find((a) => a.applicationId === selectedApplicationId) || null;
  useEffect(() => {
    if (selectedAppRow) {
      const appRm = selectedAppRow.hrRemarks != null ? String(selectedAppRow.hrRemarks) : "";
      setRemarks(appRm);
    } else {
      setRemarks(candidate.remarks || "");
    }
  }, [selectedApplicationId, candidate.id, candidate.remarks, selectedAppRow]);
  const bubbleTranscript = transcriptLinesForApplication(candidate, selectedApplicationId);
  const analysisForSelected = selectedAppRow?.analysis || candidate.analysis;
  const setStatus = (s) => {
    if (selectedApplicationId != null) {
      onUpdate({
        applicationHistory: patchApplicationById(candidate.applicationHistory, selectedApplicationId, {
          hrDecisionStatus: s,
          hrRemarks: remarks,
        }),
        status: s,
      });
    } else {
      onUpdate({ status: s, remarks });
    }
    setFlash(`Updated to ${s}`);
    setTimeout(onBack, 800);
  };
  useEffect(() => {
    if (detailTab !== "interview") {
      setInterviewAns(null);
      return;
    }
    if (selectedApplicationId == null) return;
    setInterviewLoading(true);
    const tok = localStorage.getItem(LS_TOKEN);
    fetch(`/api/admin/applications/${selectedApplicationId}/interview-answers`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
      .then((r) => (r.ok ? r.json() : { answers: [] }))
      .then(setInterviewAns)
      .catch(() => setInterviewAns({ answers: [] }))
      .finally(() => setInterviewLoading(false));
  }, [detailTab, selectedApplicationId]);
  const interviewAnswers = interviewAns?.answers || [];
  const interviewDur = interviewAnswers.reduce((s, a) => s + (a.durationSeconds || 0), 0);
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center gap-3"><button type="button" onClick={onBack} className="text-slate-400 hover:text-white text-sm">← Back</button><span className="font-bold">Candidate Details</span><Badge/></div>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        {flash && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">✓ {flash}</div>}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {[
            { id: "timeline", label: "Timeline" },
            { id: "interview", label: "Interview" },
            { id: "notes", label: "Notes" },
          ].map((t) => (
            <button key={t.id} type="button" onClick={() => setDetailTab(t.id)} className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${detailTab === t.id ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-indigo-200"}`}>{t.label}</button>
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black">{candidate.name[0]}</div>
            <div><h1 className="text-2xl font-black text-slate-900">{candidate.name}</h1><p className="text-slate-500 text-sm">{candidate.email}</p><p className="text-xs text-slate-400 mt-1">{candidate.id}{candidate.fromTalentPool && " · 🌟 From Talent Pool"}</p></div>
          </div>
          <span className={`text-xs font-black uppercase px-3 py-1.5 rounded-lg ${SB[candidate.status] || "bg-slate-100"}`}>{candidate.status}</span>
        </div>
        {detailTab === "timeline" ? (<>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-xs font-black text-slate-400 uppercase mb-3">DPDPA Consent</h2>
          {candidate.consent ? <p className="text-sm text-slate-700">✓ Granted on {fmtDate(candidate.consentAt)}</p> : <p className="text-sm text-red-700">⚠ No consent — cannot process per §6</p>}
        </div>
        {appliedList.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-xs font-black text-slate-400 uppercase mb-1">Application History ({appliedList.length})</h2>
            <p className="text-xs text-slate-500 mb-3">Tap a role to view its AI interview (voice Q&amp;A and chat transcript).</p>
            <div className="space-y-2">{appliedList.map((a) => (
              <button
                key={a.applicationId ?? `${a.jobId}-${a.appliedAt}`}
                type="button"
                onClick={() => a.applicationId != null && setSelectedApplicationId(a.applicationId)}
                className={`w-full text-left flex items-center justify-between p-3 rounded-xl transition-all ${a.applicationId === selectedApplicationId ? "ring-2 ring-indigo-400 ring-offset-2" : ""} ${a.jobId === candidate.jobId ? "bg-indigo-50 border border-indigo-200" : "bg-slate-50 border border-transparent hover:border-slate-200"}`}
              >
                <div>
                  <p className="font-bold text-slate-900 text-sm">{a.job.title}</p>
                  <p className="text-xs text-slate-500">{a.job.location} · Applied {fmtDate(a.appliedAt)}</p>
                  {a.interviewScheduledAt ? <p className="text-xs text-teal-700 font-semibold mt-0.5">Scheduled: {fmtDateTime(a.interviewScheduledAt)}</p> : null}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {a.jobId === candidate.jobId && <span className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">Active</span>}
                  {a.interviewCompletedAt ? <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">Interviewed</span> : null}
                </div>
              </button>
            ))}</div>
          </div>
        )}
        {candidate.cv && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <button type="button" onClick={() => setShowCV(!showCV)} className="w-full flex items-center justify-between"><h2 className="text-xs font-black text-slate-400 uppercase">CV / Resume {candidate.cvFile && `(${candidate.cvFile.ext.toUpperCase()})`}</h2><span className="text-indigo-500 text-xs font-bold">{showCV ? "▲ Hide" : "▼ Show"}</span></button>
            {showCV && (
              <div className="mt-4 bg-slate-50 rounded-xl p-4 border border-slate-100">
                {candidate.cvFile && (
                  <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-200">
                    <div className="flex items-center gap-2 text-sm"><span className="text-2xl">{fileIcon(candidate.cvFile.ext)}</span><div><p className="font-bold text-slate-800">{candidate.cvFile.name}</p><p className="text-xs text-slate-500">{fmtSize(candidate.cvFile.size)}</p></div></div>
                    <button type="button" onClick={() => downloadCvFile(candidate.cvFile)} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg">⬇ Download</button>
                  </div>
                )}
                <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">{candidate.cv}</pre>
              </div>
            )}
          </div>
        )}
        {bubbleTranscript && bubbleTranscript.length > 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <button type="button" onClick={() => setShowTranscript(!showTranscript)} className="w-full flex items-center justify-between text-left gap-2">
              <h2 className="text-xs font-black text-slate-400 uppercase">Interview transcript · AI · {selectedAppRow?.job?.title || "—"} · {bubbleTranscript.length} msgs · {candidate.lang || "English"}</h2>
              <span className="text-indigo-500 text-xs font-bold shrink-0">{showTranscript ? "▲" : "▼"}</span>
            </button>
            {showTranscript && <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">{bubbleTranscript.map((e, i) => <div key={i} className={`flex ${e.role === "ai" ? "justify-start" : "justify-end"}`}><div className={`max-w-md p-3 rounded-2xl text-sm ${e.role === "ai" ? "bg-slate-100 text-slate-800" : "bg-indigo-600 text-white"}`}><p className="text-xs uppercase font-black mb-1 opacity-50">{e.role === "ai" ? "Swar" : "Candidate"}</p>{e.text}</div></div>)}</div>}
          </div>
        ) : selectedApplicationId != null ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs font-black text-slate-400 uppercase mb-1">Interview transcript · {selectedAppRow?.job?.title || "—"}</p>
            <p className="text-sm text-slate-500">No AI chat transcript stored for this application yet.</p>
          </div>
        ) : null}
        {analysisForSelected && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3"><h2 className="text-xs font-black text-slate-400 uppercase">AI Analysis · {selectedAppRow?.job?.title || "—"}</h2><span className="px-3 py-1 rounded-lg text-white font-black text-xs bg-indigo-600">{analysisForSelected.rec}</span></div>
            <p className="text-slate-700 text-sm mb-3">{analysisForSelected.summary}</p>
            <div className="grid grid-cols-2 gap-3"><div className="bg-indigo-50 rounded-xl p-3"><p className="text-xs text-indigo-500 font-bold mb-1">Technical</p><p className="text-2xl font-black text-indigo-700">{analysisForSelected.tech}/10</p></div><div className="bg-teal-50 rounded-xl p-3"><p className="text-xs text-teal-500 font-bold mb-1">Communication</p><p className="text-2xl font-black text-teal-700">{analysisForSelected.comm}/10</p></div></div>
          </div>
        )}
        </>) : null}
        {detailTab === "interview" ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="border-b border-slate-100 pb-3 space-y-2">
              <h2 className="text-xs font-black text-slate-400 uppercase">Voice interview · {selectedAppRow?.job?.title || "—"}</h2>
              <p className="text-xs text-slate-500">Pick the job application to load voice Q&amp;A for that interview.</p>
              {appliedList.length > 0 ? (
                <div>
                  <label className="text-xs font-bold text-slate-500">Application</label>
                  <select
                    value={selectedApplicationId != null ? String(selectedApplicationId) : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSelectedApplicationId(v ? Number(v) : null);
                    }}
                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-indigo-400"
                  >
                    {appliedList.map((a) => (
                      <option key={a.applicationId ?? `${a.jobId}-${a.appliedAt}`} value={a.applicationId != null ? String(a.applicationId) : ""} disabled={a.applicationId == null}>
                        {a.job.title} · {a.job.location}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
            {selectedApplicationId == null ? (
              <p className="text-sm text-slate-500">No application selected.</p>
            ) : interviewLoading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : interviewAnswers.length === 0 ? (
              <p className="text-sm text-slate-500">Voice interview not yet completed for this role.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-4 text-sm text-slate-600 border-b border-slate-100 pb-3">
                  <span><span className="font-bold text-slate-800">{interviewAnswers.filter((a) => a.answerText).length}</span> / {interviewAnswers.length} answered</span>
                  <span>Total audio: <span className="font-bold text-slate-800">{interviewDur}s</span></span>
                </div>
                <div className="space-y-4">
                  {interviewAnswers.map((a) => {
                    const typeLabel = a.questionType === "yes_no" ? "Yes/No" : a.questionType === "scale_1_5" ? "Scale 1–5" : "Open-ended";
                    return (
                      <div key={`${a.index}-${a.questionText?.slice(0, 20)}`} className="border border-slate-200 rounded-xl p-4 bg-slate-50/80">
                        <p className="text-xs text-slate-500 mb-1">Q{a.index} · {typeLabel}{a.askedAt ? ` · Asked ${fmtDateTime(a.askedAt)}` : ""}</p>
                        <p className="text-sm font-semibold text-slate-900 mb-2">&quot;{a.questionText}&quot;</p>
                        <div className="border-t border-slate-200 pt-2 mt-2">
                          <p className="text-xs font-bold text-teal-700 mb-1">Answer{a.durationSeconds ? ` (${a.durationSeconds}s)` : ""}</p>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">{a.answerText || "—"}</p>
                          {a.audioUrl ? <audio controls className="mt-2 w-full max-w-md" src={a.audioUrl}><track kind="captions"/></audio> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : null}
        {detailTab === "notes" ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-xs font-black text-slate-400 uppercase mb-3">HR Actions · {selectedAppRow?.job?.title || "role"}</h2>
          <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks for this application…" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none mb-4"/>
          <div className="grid grid-cols-2 gap-2">
            {candidate.consent && portalStatusLabel(candidate, selectedAppRow?.jobId || candidate.jobId) === "APPLIED" && <button type="button" onClick={() => setStatus("SHORTLISTED")} className="py-2.5 bg-blue-600 text-white font-bold rounded-xl text-sm">✓ Shortlist</button>}
            {candidate.consent && selectedAppRow?.jobId && !transcriptAvailableForJob(candidate, selectedAppRow.jobId) && !selectedAppRow.interviewScheduledAt && (portalStatusLabel(candidate, selectedAppRow.jobId) === "SHORTLISTED" || portalStatusLabel(candidate, selectedAppRow.jobId) === "APPLIED") && <button type="button" onClick={() => typeof onInterview === "function" && onInterview(selectedAppRow.jobId)} className="py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-sm">🎤 Start interview</button>}
            {(portalStatusLabel(candidate, selectedAppRow?.jobId || candidate.jobId) === "INTERVIEWED" || analysisForSelected) && (
              <button type="button" onClick={() => typeof onAnalysis === "function" && onAnalysis(selectedApplicationId)} className="py-2.5 bg-teal-600 text-white font-bold rounded-xl text-sm">📊 Analysis</button>
            )}
            {portalStatusLabel(candidate, selectedAppRow?.jobId || candidate.jobId) !== "REJECTED" && candidate.status !== "WITHDRAWN" && <button type="button" onClick={() => { if (window.confirm("Reject this application?")) setStatus("REJECTED"); }} className="py-2.5 border-2 border-red-100 text-red-600 font-bold rounded-xl text-sm">✕ Reject</button>}
          </div>
        </div>
        ) : null}
      </div>
    </div>
  );
}

const MANDATORY_OPENING_DEFAULTS = [
  "Hello {{candidateName}}, welcome. Please introduce yourself and confirm your full name for our records.",
  "Tell me about yourself — your background, experience, and what brings you to this opportunity.",
  "What motivated you to apply for the {{jobTitle}} role at {{companyName}}?",
  "What are your key strengths that make you a good fit for this position?",
];
const MANDATORY_CLOSING_DEFAULTS = [
  "Thank you for completing this interview. We have recorded your responses and our team will review them and get back to you soon. Have a great day.",
];

function JobMaster({ jobs, onSave, onBack }) {
  const MAX_ROLE_Q = 20;
  const MAX_OPEN_Q = 10;
  const MAX_CLOSE_Q = 5;
  const phaseCap = (phase) => {
    if (phase === "mandatory_open") return MAX_OPEN_Q;
    if (phase === "mandatory_close") return MAX_CLOSE_Q;
    return MAX_ROLE_Q;
  };
  const phaseLabel = (phase) => {
    if (phase === "mandatory_open") return "opening";
    if (phase === "mandatory_close") return "closing";
    return "role";
  };
  const defaultNewQuestionRows = () => [
    ...MANDATORY_OPENING_DEFAULTS.map((question) => ({ question, questionType: "open_ended", questionPhase: "mandatory_open" })),
    ...Array.from({ length: 5 }, () => ({ question: "", questionType: "open_ended", questionPhase: "role" })),
    ...MANDATORY_CLOSING_DEFAULTS.map((question) => ({ question, questionType: "open_ended", questionPhase: "mandatory_close" })),
  ];
  const [local, setLocal] = useState(jobs);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({ title: "", designation: "", location: "", description: "", requirements: "" });
  const [questionRows, setQuestionRows] = useState(defaultNewQuestionRows);
  const [qErrors, setQErrors] = useState({});
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState("");
  const [removingId, setRemovingId] = useState(null);
  const normalizeRowsFromJob = (j) => {
    const phaseOrder = { mandatory_open: 0, role: 1, mandatory_close: 2 };
    const iq = (j.interviewQuestions || []).slice().sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    const mapped = iq
      .map((q) => ({
        question: q.question || "",
        questionType: ["open_ended", "yes_no", "scale_1_5"].includes(q.questionType) ? q.questionType : "open_ended",
        questionPhase: ["mandatory_open", "role", "mandatory_close"].includes(q.questionPhase) ? q.questionPhase : "role",
        id: q.id,
      }))
      .sort((a, b) => (phaseOrder[a.questionPhase] ?? 1) - (phaseOrder[b.questionPhase] ?? 1));
    if (mapped.length === 0) return defaultNewQuestionRows();
    const hasEmptyRole = mapped.some((r) => r.questionPhase === "role" && !r.question.trim());
    if (!hasEmptyRole) return [...mapped, { question: "", questionType: "open_ended", questionPhase: "role" }];
    return mapped;
  };
  const removeJob = async (job) => {
    if (!job || !job.id) return;
    const label = job.title || "this job";
    if (!window.confirm(`Remove "${label}"? This will hide it from the careers page for candidates immediately.`)) return;
    setRemovingId(job.id);
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(job.id)}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        setToast(data.error || `Could not remove job (${res.status}).`);
        setTimeout(() => setToast(""), 4000);
        return;
      }
      const next = local.filter((x) => x.id !== job.id);
      setLocal(next);
      onSave(next);
      if (edit === job.id) setEdit(null);
      setToast(`Removed "${label}".`);
      setTimeout(() => setToast(""), 4000);
    } catch (_e) {
      setToast("Network error — could not remove job.");
      setTimeout(() => setToast(""), 4000);
    } finally {
      setRemovingId(null);
    }
  };
  const saveJob = () => {
    if (!form.title.trim()) return;
    const errs = {};
    const filled = [];
    questionRows.forEach((row, i) => {
      const t = row.question.trim();
      if (!t) return;
      if (t.length < 10 || t.length > 500) errs[i] = "Min 10 characters, max 500.";
      filled.push({
        question: t,
        questionType: ["open_ended", "yes_no", "scale_1_5"].includes(row.questionType) ? row.questionType : "open_ended",
        questionPhase: ["mandatory_open", "role", "mandatory_close"].includes(row.questionPhase) ? row.questionPhase : "role",
      });
    });
    setQErrors(errs);
    if (Object.keys(errs).length) return;
    const roleN = filled.filter((q) => q.questionPhase === "role").length;
    const openN = filled.filter((q) => q.questionPhase === "mandatory_open").length;
    const closeN = filled.filter((q) => q.questionPhase === "mandatory_close").length;
    if (roleN > MAX_ROLE_Q) {
      setToast(`Maximum ${MAX_ROLE_Q} role-specific questions.`);
      setTimeout(() => setToast(""), 4000);
      return;
    }
    if (openN > MAX_OPEN_Q) {
      setToast(`Maximum ${MAX_OPEN_Q} mandatory opening questions.`);
      setTimeout(() => setToast(""), 4000);
      return;
    }
    if (closeN > MAX_CLOSE_Q) {
      setToast(`Maximum ${MAX_CLOSE_Q} mandatory closing questions.`);
      setTimeout(() => setToast(""), 4000);
      return;
    }
    const interviewQuestions = filled.map((q, idx) => ({ ...q, displayOrder: idx + 1 }));
    const payload = { ...form, interviewQuestions };
    if (edit === "new") {
      setLocal((p) => [...p, { ...payload, id: "j-" + Date.now() }]);
    } else {
      setLocal((p) => p.map((j) => (j.id === edit ? { ...j, ...payload } : j)));
    }
    setToast(`Saved: ${openN} opening · ${roleN} role · ${closeN} closing.`);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    setTimeout(() => setToast(""), 4000);
    setEdit(null);
    setQErrors({});
  };
  const moveRow = (from, to) => {
    if (to < 0 || to >= questionRows.length) return;
    setQuestionRows((rows) => {
      const next = [...rows];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return next;
    });
  };
  const addRow = (phase) => {
    const cap = phaseCap(phase);
    const filled = questionRows.filter((r) => r.questionPhase === phase && r.question.trim()).length;
    if (filled >= cap) return;
    setQuestionRows((rows) => {
      const next = [...rows];
      let insertAt;
      if (phase === "mandatory_open") {
        const firstRole = next.findIndex((r) => r.questionPhase === "role");
        const firstClose = next.findIndex((r) => r.questionPhase === "mandatory_close");
        if (firstRole >= 0) insertAt = firstRole;
        else if (firstClose >= 0) insertAt = firstClose;
        else insertAt = next.length;
      } else if (phase === "mandatory_close") {
        insertAt = next.length;
      } else {
        const closeIdx = next.findIndex((r) => r.questionPhase === "mandatory_close");
        insertAt = closeIdx >= 0 ? closeIdx : next.length;
      }
      next.splice(insertAt, 0, { question: "", questionType: "open_ended", questionPhase: phase });
      return next;
    });
  };
  const countJobQuestions = (j) => {
    const iq = j.interviewQuestions || [];
    const ok = (q) => q.question && String(q.question).trim().length >= 10;
    const open = iq.filter((q) => q.questionPhase === "mandatory_open" && ok(q)).length;
    const role = iq.filter((q) => (q.questionPhase === "role" || !q.questionPhase) && ok(q)).length;
    const close = iq.filter((q) => q.questionPhase === "mandatory_close" && ok(q)).length;
    return { open, role, close };
  };
  const renderQuestionSection = (phaseFilter, sectionTitle, hint, allowRemove) => {
    const indices = questionRows.map((r, i) => ({ r, i })).filter(({ r }) => r.questionPhase === phaseFilter);
    const filledForPhase = indices.filter(({ r }) => r.question.trim()).length;
    const capForPhase = phaseCap(phaseFilter);
    const labelForPhase = phaseLabel(phaseFilter);
    return (
      <div key={phaseFilter} className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-xs font-black text-slate-700 uppercase tracking-wide">{sectionTitle}</h4>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">{phaseFilter === "role" ? "HR script" : "Mandatory"}</span>
        </div>
        {hint ? <p className="text-xs text-slate-500 mb-3">{hint}</p> : null}
        <div className="space-y-2">
          {indices.map(({ r: row, i }, localIdx) => (
            <div key={i} className={`flex flex-wrap items-start gap-2 ${qErrors[i] ? "rounded-xl ring-2 ring-red-300 bg-red-50/50 p-2 -mx-2" : ""}`}>
              <div className="flex flex-col gap-0.5 pt-2 shrink-0">
                <button type="button" disabled={localIdx === 0} onClick={() => moveRow(i, indices[localIdx - 1].i)} className="text-slate-400 hover:text-slate-700 disabled:opacity-30 text-xs leading-none" aria-label="Move up">↑</button>
                <button type="button" disabled={localIdx >= indices.length - 1} onClick={() => moveRow(i, indices[localIdx + 1].i)} className="text-slate-400 hover:text-slate-700 disabled:opacity-30 text-xs leading-none" aria-label="Move down">↓</button>
              </div>
              <span className="text-xs font-bold text-slate-500 pt-3 w-8 shrink-0">Q{localIdx + 1}</span>
              <input value={row.question} placeholder={phaseFilter === "role" ? "e.g. Walk me through your most recent IVF lab experience" : "Interview question"} onChange={(e) => { const v = e.target.value; setQuestionRows((rows) => rows.map((r, j) => j === i ? { ...r, question: v } : r)); setQErrors((e0) => { const n = { ...e0 }; delete n[i]; return n; }); }} className="flex-1 min-w-[200px] px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-800 text-white placeholder:text-slate-500"/>
              <select value={row.questionType} onChange={(e) => setQuestionRows((rows) => rows.map((r, j) => j === i ? { ...r, questionType: e.target.value } : r))} className="px-2 py-2 border border-slate-300 rounded-lg text-xs bg-slate-800 text-white shrink-0">
                <option value="open_ended">Open-ended</option>
                <option value="yes_no">Yes / No</option>
                <option value="scale_1_5">Scale 1–5</option>
              </select>
              {allowRemove ? (
                <button type="button" disabled={indices.length <= 1} onClick={() => setQuestionRows((rows) => rows.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 disabled:opacity-30 text-lg px-1 shrink-0" aria-label="Remove">✕</button>
              ) : null}
              {qErrors[i] ? <p className="w-full text-xs text-red-600 font-semibold pl-20">{qErrors[i]}</p> : null}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
          {filledForPhase < capForPhase ? (
            <button type="button" onClick={() => addRow(phaseFilter)} className="text-sm font-bold text-indigo-600 hover:text-indigo-800">+ Add {labelForPhase} question</button>
          ) : (
            <span className="text-xs text-amber-700 font-semibold">Maximum {capForPhase} {labelForPhase} questions.</span>
          )}
          <span className="text-xs text-slate-500">{labelForPhase.charAt(0).toUpperCase() + labelForPhase.slice(1)} questions: {filledForPhase} / {capForPhase}</span>
        </div>
      </div>
    );
  };
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3"><button type="button" onClick={() => { onSave(local); onBack(); }} className="text-slate-400 hover:text-white">← Back</button><span className="font-bold">Job Master</span></div>
        <button type="button" onClick={() => { onSave(local); setSaved(true); setTimeout(() => setSaved(false), 2000); }} className={`px-4 py-1.5 rounded-lg text-sm font-bold ${saved ? "bg-green-600 text-white" : "bg-indigo-600 hover:bg-indigo-500 text-white"}`}>{saved ? "✓ Saved" : "Save"}</button>
      </div>
      {toast ? <div className="bg-teal-600 text-white text-center text-sm py-2 font-semibold">{toast}</div> : null}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6"><h1 className="text-2xl font-black text-slate-900">Job Postings</h1><button type="button" onClick={() => { setForm({ title: "", designation: "", location: "", description: "", requirements: "" }); setQuestionRows(defaultNewQuestionRows()); setQErrors({}); setEdit("new"); }} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl">+ New</button></div>
        {edit && (
          <div className="bg-white rounded-2xl border border-indigo-200 shadow-lg p-6 mb-6">
            <div className="grid grid-cols-2 gap-4 mb-4">{[["title", "Title"], ["designation", "Designation"], ["location", "Location"]].map(([k, l]) => <div key={k}><label className="text-xs font-bold text-slate-500 mb-1 block">{l}</label><input value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"/></div>)}</div>
            {[["description", "Description"], ["requirements", "Requirements"]].map(([k, l]) => <div key={k} className="mb-4"><label className="text-xs font-bold text-slate-500 mb-1 block">{l}</label><textarea value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none bg-white"/></div>)}
            <div className="border-t border-slate-200 pt-5 mt-2 mb-4">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide mb-1">Interview Questions</h3>
              {renderQuestionSection("mandatory_open", "Mandatory opening", "Asked first. Placeholders: {{candidateName}}, {{jobTitle}}, {{companyName}}.", true)}
              {renderQuestionSection("role", "Role-specific (HR script)", "Asked after opening, before AI follow-ups.", true)}
              {renderQuestionSection("mandatory_close", "Mandatory closing", "Asked last after AI follow-ups.", true)}
            </div>
            <div className="flex gap-3"><button type="button" onClick={saveJob} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg">Save</button><button type="button" onClick={() => setEdit(null)} className="px-6 py-2 border border-slate-200 text-slate-600 font-bold rounded-lg">Cancel</button></div>
          </div>
        )}
        <div className="space-y-4">{local.map((j) => <div key={j.id} className="bg-white rounded-xl border border-slate-200 p-5 flex items-start justify-between"><div><h3 className="font-bold text-slate-900">{j.title}</h3><p className="text-sm text-slate-500">{j.designation} · {j.location}</p>{(() => { const c = countJobQuestions(j); return c.open + c.role + c.close > 0 ? <p className="text-xs text-teal-700 font-semibold mt-1">{c.open} opening · {c.role} role · {c.close} closing</p> : null; })()}</div><div className="flex gap-2 ml-4 shrink-0"><button type="button" onClick={() => { setForm({ title: j.title, designation: j.designation || "", location: j.location || "", description: j.description || "", requirements: j.requirements || "" }); setQuestionRows(normalizeRowsFromJob(j)); setQErrors({}); setEdit(j.id); }} className="text-xs px-3 py-1.5 border border-slate-200 text-slate-600 font-bold rounded-lg">Edit</button><button type="button" disabled={removingId === j.id} onClick={() => removeJob(j)} className="text-xs px-3 py-1.5 border border-red-100 text-red-500 font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">{removingId === j.id ? "Removing…" : "Remove"}</button></div></div>)}</div>
      </div>
    </div>
  );
}

function CandReg({ onRegister, onBack, initialName = "", initialEmail = "" }) {
  const [f, setF] = useState({ name: initialName || "", email: initialEmail || "", password: "" });
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button onClick={onBack} className="text-slate-400 hover:text-white mb-6 text-sm">← Back</button>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <h1 className="text-2xl font-black text-white mb-6">Create Account</h1>
          <div className="space-y-4">
            {[["name", "Full Name", "text"], ["email", "Email", "email"], ["password", "Password", "password"]].map(([k, l, t]) => <div key={k}><label className="block text-xs font-bold text-slate-400 uppercase mb-2">{l}</label><input type={t} value={f[k]} onChange={e => setF(p => ({ ...p, [k]: e.target.value }))} className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500"/></div>)}
            <button onClick={() => onRegister(f)} disabled={!f.name.trim() || !f.email.trim() || !f.password.trim()} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold rounded-xl">Register →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function JobBoardAuth({
  authStripReady,
  sessionRole,
  candidateFirstName,
  onLoginClick,
  onLogoutClick,
  onGoToAts,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false);
    };
    const esc = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);
  if (!authStripReady) return null;
  const tok = localStorage.getItem(LS_TOKEN);
  const anon = !tok;
  const cand = sessionRole === "candidate" && tok;
  const hr = sessionRole === "hr" && tok;
  const ats = (typeof window.__ATS_URL__ === "string" && window.__ATS_URL__.trim()) || "";
  const first = candidateFirstName || "there";

  const goAts = (e) => {
    e.preventDefault();
    if (ats) {
      window.location.href = ats;
    } else {
      onGoToAts();
    }
    setMenuOpen(false);
  };

  return (
    <>
      <div className="hidden md:flex items-center flex-wrap gap-x-2 gap-y-1 text-sm text-white">
        {anon ? (
          <>
            <span className="text-slate-300 whitespace-nowrap">Already have an account?</span>
            <button type="button" onClick={onLoginClick} className="px-3 py-1.5 rounded-lg border border-white/40 text-white text-sm font-semibold hover:bg-white/10 transition-colors">Login</button>
          </>
        ) : null}
        {cand ? (
          <>
            <span className="text-white font-medium whitespace-nowrap">Hi, {first}</span>
            <span className="text-slate-600 select-none" aria-hidden>|</span>
            <button type="button" onClick={onLogoutClick} className="text-slate-200 hover:text-white text-sm font-semibold px-1 py-0.5 rounded border border-transparent hover:border-white/20">Logout</button>
          </>
        ) : null}
        {hr ? (
          <>
            <span className="text-slate-300 whitespace-nowrap">Logged in as HR</span>
            <span className="text-slate-600 select-none" aria-hidden>|</span>
            {ats ? (
              <a href={ats} className="text-indigo-300 hover:text-indigo-200 text-sm font-bold whitespace-nowrap">Go to ATS →</a>
            ) : (
              <button type="button" onClick={goAts} className="text-indigo-300 hover:text-indigo-200 text-sm font-bold whitespace-nowrap">Go to ATS →</button>
            )}
          </>
        ) : null}
      </div>

      <div className="md:hidden relative" ref={wrapRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="p-2 rounded-lg border border-white/30 text-white hover:bg-white/10"
          aria-expanded={menuOpen}
          aria-haspopup="true"
          aria-label="Account menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
        </button>
        {menuOpen ? (
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[220px] rounded-xl border border-slate-600 bg-slate-800 shadow-xl py-2">
            {anon ? (
              <div className="px-3 py-2 space-y-2">
                <p className="text-xs text-slate-400">Already have an account?</p>
                <button type="button" onClick={() => { onLoginClick(); setMenuOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg border border-white/30 text-white text-sm font-semibold hover:bg-white/10">Login</button>
              </div>
            ) : null}
            {cand ? (
              <div className="px-2 py-1 space-y-1">
                <p className="px-2 py-1 text-sm text-white font-medium">Hi, {first}</p>
                <button type="button" onClick={() => { onLogoutClick(); setMenuOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-slate-200 hover:bg-slate-700 text-sm">Logout</button>
              </div>
            ) : null}
            {hr ? (
              <div className="px-2 py-1 space-y-1">
                <p className="px-2 py-1 text-xs text-slate-400">Logged in as HR</p>
                {ats ? (
                  <a href={ats} className="block px-3 py-2 rounded-lg text-indigo-300 hover:bg-slate-700 text-sm font-bold" onClick={() => setMenuOpen(false)}>Go to ATS →</a>
                ) : (
                  <button type="button" onClick={(e) => { goAts(e); }} className="w-full text-left px-3 py-2 rounded-lg text-indigo-300 hover:bg-slate-700 text-sm font-bold">Go to ATS →</button>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

function Jobs({ jobs, applicationHistory = [], onApply, onContinueInterview, onReattemptPortal, onTalentPool, onBack, coolingMonths, showBack = true, authCandidate = false, onTalentPoolPortal, jobBoardAuth, authStripReady = false, scheduleFlash = null }) {
  const [q, setQ] = useState("");
  const cm = typeof coolingMonths === "number" ? coolingMonths : 3;
  const f = jobs.filter(j => j.title.toLowerCase().includes(q.toLowerCase()) || j.location.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {showBack ? <button type="button" onClick={onBack} className="text-slate-400 hover:text-white">←</button> : null}
          <span className="font-bold">Your Next Career Move Starts Here</span>
        </div>
        <div className="flex items-center gap-2 md:gap-3 flex-wrap justify-end">
          {authStripReady && authCandidate && onTalentPoolPortal ? (
            <button type="button" onClick={onTalentPoolPortal} className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-violet-100 text-indigo-900 border border-violet-200 hover:bg-violet-50 transition-colors">
              <span aria-hidden>☀</span> Talent Pool
            </button>
          ) : null}
          {jobBoardAuth}
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-black text-slate-900 mb-2">We’re Hiring🚀</h1>
        <p className="text-slate-500 mb-5">Indira IVF — India's Leading Fertility Healthcare Chain</p>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search jobs…" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl mb-4 shadow-sm focus:outline-none focus:border-indigo-400"/>
        {onTalentPool ? (
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-5 mb-5 flex items-center justify-between flex-wrap gap-3">
            <div><p className="font-bold text-indigo-900 mb-0.5">🌟 Don't see a matching role?</p><p className="text-xs text-indigo-600">Submit your CV to our talent pool — we'll reach out when something opens.</p></div>
            <button type="button" onClick={onTalentPool} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl text-sm shrink-0">Join Talent Pool →</button>
          </div>
        ) : null}
        <div className="space-y-4">{f.map(j => {
          let coolingDays = null;
          let showApplied = false;
          let doApply = false;
          let showContinue = false;
          let locked = false;
          let extraCoolingLine = null;
          const personal = authCandidate;
          if (personal && j.userStatus === "cooling") {
            locked = true;
            coolingDays = j.coolingDaysLeft;
            const st = getCoolingStatus(applicationHistory, j.id, cm);
            if (!st.canApply && st.eligibleAt) extraCoolingLine = (<p className="text-xs text-amber-600 mt-2 font-medium">Last completed interview {fmtDate(st.lastCompletedAt || st.lastAppliedAt)}. Re-apply on {fmtDate(st.eligibleAt)} ({cm}-month cooling period).</p>);
          } else if (personal && j.userStatus === "interview_pending") {
            showContinue = true;
          } else if (personal && j.userStatus === "applied") {
            showApplied = true;
          } else if (personal && j.userStatus === "open") {
            doApply = true;
          } else {
            const status = getCoolingStatus(applicationHistory, j.id, cm);
            if (status.pendingInterview) {
              showContinue = true;
            } else if (!status.canApply) {
              locked = true;
              coolingDays = status.daysRemaining;
              extraCoolingLine = (<p className="text-xs text-amber-600 mt-2 font-medium">Last completed interview {fmtDate(status.lastCompletedAt || status.lastAppliedAt)}. Re-apply on {fmtDate(status.eligibleAt)} ({cm}-month cooling period).</p>);
            } else if (status.hasApplied) {
              showApplied = true;
            } else {
              doApply = true;
            }
          }
          const dim = locked || showApplied;
          const latestAppForJob = personal ? getLatestAppForJob(applicationHistory, j.id) : null;
          const showReattemptPortal =
            personal &&
            typeof onReattemptPortal === "function" &&
            applicationEligibleForTechnicalReattemptRequest(latestAppForJob);
          const reattemptedNote =
            personal && latestAppForJob && applicationHasReattemptHistory(latestAppForJob);
          return (
            <div key={j.id} className={`bg-white rounded-2xl border p-6 flex items-start justify-between flex-wrap gap-3 ${dim ? "border-slate-200 opacity-75" : "border-slate-200 hover:shadow-lg hover:border-indigo-200"}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h2 className="text-xl font-bold text-slate-900">{j.title}</h2>
                  {locked && coolingDays != null ? <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Cooling: {coolingDays}d left</span> : null}
                  {reattemptedNote ? <span className="text-xs font-semibold text-violet-700">(*reattempted)</span> : null}
                </div>
                <p className="text-slate-500 text-sm">{j.designation} · {j.location}</p>
                <p className="text-slate-600 text-sm mt-2 line-clamp-2">{j.description}</p>
                {latestAppForJob?.interviewScheduledAt ? (
                  <p className="text-xs font-bold text-teal-700 mt-2">📅 Interview scheduled: {fmtDateTime(latestAppForJob.interviewScheduledAt)}</p>
                ) : null}
                {scheduleFlash && scheduleFlash.jobId === j.id && scheduleFlash.rescheduled ? (
                  <p className="text-xs font-semibold text-indigo-700 mt-1">* Rescheduled to {fmtDateTime(scheduleFlash.at)}</p>
                ) : null}
                {extraCoolingLine}
              </div>
              <div className="shrink-0 flex flex-col items-end gap-2">
                {doApply ? <button type="button" onClick={() => onApply(j)} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl text-sm">Apply</button> : null}
                {showContinue ? (
                  <button type="button" onClick={() => onContinueInterview(j)} className="px-5 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl text-sm">Continue interview →</button>
                ) : null}
                {showReattemptPortal ? (
                  <button type="button" onClick={() => onReattemptPortal(j)} className="px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl text-sm">Reattempt</button>
                ) : null}
                {locked ? <button type="button" disabled className="px-5 py-2 bg-slate-100 text-slate-400 font-bold rounded-xl text-sm">Locked</button> : null}
                {showApplied ? <button type="button" disabled className="px-5 py-2 bg-slate-100 text-slate-500 font-bold rounded-xl text-sm">Applied</button> : null}
              </div>
            </div>
          );
        })}{f.length === 0 ? <p className="text-center text-slate-400 py-12">No matching jobs.</p> : null}</div>
      </div>
    </div>
  );
}

function CVUpload({ jobTitle, onComplete, onBack, maxCvMb }) {
  const [file, setFile] = useState(null), [processing, setProcessing] = useState(false), [error, setError] = useState(""), [ack, setAck] = useState(false);
  const ref = useRef();
  const mb = typeof maxCvMb === "number" ? maxCvMb : 5;
  const handleFile = async (f) => { if (!f) return; setError(""); setProcessing(true); try { setFile(await processResumeFile(f, mb)); } catch (e) { setError(e.message); setFile(null); } finally { setProcessing(false); } };
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <button onClick={onBack} className="text-slate-500 hover:text-slate-700 mb-6 text-sm">← Back</button>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8">
          <h1 className="text-2xl font-black text-slate-900 mb-1">Upload Resume</h1>
          <p className="text-slate-500 text-sm mb-4">For: <span className="font-bold text-indigo-600">{jobTitle}</span></p>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-xs"><p className="font-bold text-slate-700 mb-1">📎 Accepted formats</p><p className="text-slate-600">JPG · JPEG · PDF · DOC · DOCX <span className="text-slate-400">(max {mb} MB)</span></p></div>
          <div onClick={() => ref.current?.click()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer mb-3 ${error ? "border-red-300 bg-red-50" : file ? "border-green-300 bg-green-50" : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50"}`}>
            {processing ? <><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2"/><p className="text-slate-500 text-sm">Processing…</p></> :
             file ? <><div className="text-3xl mb-1">{fileIcon(file.ext)}</div><p className="text-slate-700 text-sm font-semibold truncate">{file.name}</p><p className="text-slate-500 text-xs mt-1">{file.ext.toUpperCase()} · {fmtSize(file.size)} · ✓ Validated</p><p className="text-indigo-500 text-xs mt-2 underline">Choose different</p></> :
             <><svg className="w-10 h-10 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg><p className="text-slate-700 text-sm font-semibold">Click to upload</p><p className="text-slate-400 text-xs mt-1">JPG · JPEG · PDF · DOC · DOCX</p></>}
          </div>
          <input ref={ref} type="file" accept=".jpg,.jpeg,.pdf,.doc,.docx" onChange={e => handleFile(e.target.files?.[0])} className="hidden"/>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm mb-4 flex gap-2"><span>⚠</span><span>{error}</span></div>}
          <label className={`flex gap-3 p-3 rounded-xl border mb-4 cursor-pointer ${ack ? "border-indigo-300 bg-indigo-50" : "border-slate-200"}`}><input type="checkbox" checked={ack} onChange={() => setAck(!ack)} className="mt-0.5 w-4 h-4 accent-indigo-500 shrink-0"/><p className="text-xs text-slate-600">I acknowledge processing for recruitment.</p></label>
          <button onClick={() => onComplete(file)} disabled={!file || !ack || processing} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 text-white font-bold rounded-xl">Submit →</button>
        </div>
      </div>
    </div>
  );
}

function TalentPoolSubmit({ candidate, onSubmit, onGuestContinue, guestMode, onBack, maxCvMb, coolingMonths }) {
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    name: candidate?.name || "",
    email: candidate?.email || "",
    phone: "",
    desiredRoles: "",
    skills: "",
    experience: "",
    locationCity: "",
    locationOther: "",
    keywords: "",
    qualification: "",
    currentCtc: "",
    currentEmployer: "",
    source: "",
    applicationDate: todayIso(),
    coolingPeriod: "",
    pref1City: "",
    pref1Other: "",
    pref2City: "",
    pref2Other: "",
    pref3City: "",
    pref3Other: "",
  });
  const [cityList, setCityList] = useState(() => [...INDIAN_CITIES_FALLBACK].sort((a, b) => a.localeCompare(b)));
  const [file, setFile] = useState(null), [error, setError] = useState(""), [processing, setProcessing] = useState(false), [ack, setAck] = useState(false), [done, setDone] = useState(false), [formErr, setFormErr] = useState(""), [submitting, setSubmitting] = useState(false);
  const ref = useRef();
  const mb = typeof maxCvMb === "number" ? maxCvMb : 5;
  useEffect(() => {
    fetch("/indian-cities.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((arr) => {
        if (Array.isArray(arr) && arr.length > 0)
          setCityList([...new Set(arr.map((x) => String(x).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (done) return;
    if (typeof IntersectionObserver === "undefined") {
      document.querySelectorAll(".talent-side-img").forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const imgs = document.querySelectorAll(".talent-side-img");
    if (!imgs.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    imgs.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [done]);
  const handleFile = async (f) => { if (!f) return; setError(""); setProcessing(true); try { setFile(await processResumeFile(f, mb)); } catch (e) { setError(e.message); setFile(null); } finally { setProcessing(false); } };
  const resolvedLocation = () => {
    const c = form.locationCity;
    if (!c) return "";
    if (c === "__OTHER__") return (form.locationOther || "").trim() || "Other";
    return c;
  };
  const submit = async () => {
    setFormErr("");
    if (!form.name.trim() || !form.email.trim() || !file || !ack) return;
    if (!form.source) { setFormErr("Please select how you heard about us (Source)."); return; }
    if (!form.locationCity) { setFormErr("Please select your current city (or Other)."); return; }
    if (form.locationCity === "__OTHER__" && !(form.locationOther || "").trim()) { setFormErr("Please type your city when you select Other."); return; }
    for (const [ci, oi] of [["pref1City", "pref1Other"], ["pref2City", "pref2Other"], ["pref3City", "pref3Other"]]) {
      if (form[ci] === "__OTHER__" && !(form[oi] || "").trim()) {
        setFormErr("Please type the city when you select Other for preferred cities.");
        return;
      }
    }
    const p1 = resolveTalentPoolCityPick(form.pref1City, form.pref1Other);
    const p2 = resolveTalentPoolCityPick(form.pref2City, form.pref2Other);
    const p3 = resolveTalentPoolCityPick(form.pref3City, form.pref3Other);
    const entry = {
      id: "TP-" + Date.now(), candidateId: candidate?.id || null,
      name: form.name.trim(), email: form.email.trim().toLowerCase(), phone: form.phone.trim(),
      desiredRoles: form.desiredRoles.split(",").map(s => s.trim()).filter(Boolean),
      skills: form.skills.split(",").map(s => s.trim()).filter(Boolean),
      experience: parseInt(form.experience, 10) || 0,
      location: resolvedLocation(),
      qualification: form.qualification.trim(),
      currentCtc: form.currentCtc.trim(),
      currentEmployer: form.currentEmployer.trim(),
      source: form.source,
      applicationDate: form.applicationDate || todayIso(),
      coolingPeriod: (form.coolingPeriod || "").trim(),
      preferredCity1: p1,
      preferredCity2: p2,
      preferredCity3: p3,
      keywords: form.keywords.trim(),
      cvText: file.cvText, cvFile: file, submittedAt: new Date().toISOString(), mappedToJobs: []
    };
    if (guestMode && typeof onGuestContinue === "function") {
      onGuestContinue(entry);
      return;
    }
    setSubmitting(true);
    try {
      const ok = await onSubmit(entry);
      if (ok !== false) setDone(true);
    } catch (e) {
      setFormErr(e?.message || "Could not submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };
  if (done) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 text-3xl">✓</div>
      <h1 className="text-3xl font-black text-slate-900 mb-2">Added to Talent Pool</h1>
      <p className="text-slate-500 mb-5 max-w-md">HR SPOCs will reach out when a matching role opens.</p>
      <button onClick={onBack} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold">Done</button>
    </div>
  );
  return (
    <div className="talent-watermark min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center gap-3"><button onClick={onBack} className="text-slate-400 hover:text-white text-sm">←</button><span className="font-bold">Join Talent Pool</span><Badge/></div>
      <div className="talent-3col">
        <aside className="talent-side talent-side--left" aria-hidden="true">
          <img src="/Vision.png" alt="" className="talent-side-img" loading="eager"/>
          <img src="/Values.png" alt="" className="talent-side-img" loading="lazy"/>
        </aside>
        <main className="talent-center">
          <h1 className="text-3xl font-black text-slate-900 mb-1">Join Our Talent Community</h1>
          <p className="text-slate-500 mb-5">Share your profile and we’ll reach out when the right opportunity comes up.</p>
        {formErr ? <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{formErr}</div> : null}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          {[["Full Name *", "name", "text"], ["Email *", "email", "email"], ["Phone", "phone", "tel"]].map(([l, k, t]) => <div key={k}><label className="block text-xs font-bold text-slate-500 uppercase mb-1">{l}</label><input type={t} value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400"/></div>)}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Current city *</label>
            <div className="flex flex-col sm:flex-row gap-2 items-stretch">
              <select value={form.locationCity} onChange={e => setForm(p => ({ ...p, locationCity: e.target.value, locationOther: e.target.value === "__OTHER__" ? p.locationOther : "" }))} className="flex-1 min-w-0 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white">
                <option value="">— Select city —</option>
                {cityList.map((city) => <option key={city} value={city}>{city}</option>)}
                <option value="__OTHER__">Other</option>
              </select>
              {form.locationCity === "__OTHER__" ? (
                <input type="text" value={form.locationOther} onChange={e => setForm(p => ({ ...p, locationOther: e.target.value }))} placeholder="Type city" className="flex-1 min-w-0 px-4 py-2.5 border border-indigo-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400" />
              ) : null}
            </div>
          </div>
          {[1, 2, 3].map((n) => {
            const ck = `pref${n}City`;
            const ok = `pref${n}Other`;
            return (
              <div key={n}>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Preferred city {n} <span className="text-slate-400 normal-case font-normal"></span></label>
                <div className="flex flex-col sm:flex-row gap-2 items-stretch">
                  <select value={form[ck]} onChange={e => setForm(p => ({ ...p, [ck]: e.target.value, [ok]: e.target.value === "__OTHER__" ? p[ok] : "" }))} className="flex-1 min-w-0 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white">
                    <option value="">— Select city —</option>
                    {cityList.map((city) => <option key={city} value={city}>{city}</option>)}
                    <option value="__OTHER__">Other</option>
                  </select>
                  {form[ck] === "__OTHER__" ? (
                    <input type="text" value={form[ok]} onChange={e => setForm(p => ({ ...p, [ok]: e.target.value }))} placeholder="Type city" className="flex-1 min-w-0 px-4 py-2.5 border border-indigo-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400" />
                  ) : null}
                </div>
              </div>
            );
          })}
          <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Qualification</label><input value={form.qualification} onChange={e => setForm(p => ({ ...p, qualification: e.target.value }))} placeholder="e.g. MBBS, MBA, B.Tech" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"/></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Current CTC</label><input value={form.currentCtc} onChange={e => setForm(p => ({ ...p, currentCtc: e.target.value }))} placeholder="e.g. 12 LPA" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"/></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Current employer</label><input value={form.currentEmployer} onChange={e => setForm(p => ({ ...p, currentEmployer: e.target.value }))} placeholder="Company name" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"/></div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Source *</label>
            <select value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-indigo-400">
              {TP_SOURCE_OPTIONS.map((o) => <option key={o.value || "blank"} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date of application</label><input type="date" value={form.applicationDate} onChange={e => setForm(p => ({ ...p, applicationDate: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"/></div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notice period</label>
              <select value={form.coolingPeriod} onChange={e => setForm(p => ({ ...p, coolingPeriod: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-indigo-400">
                <option value="">— Select —</option>
                {TALENT_POOL_NOTICE_PERIOD_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          </div>
          <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Years of Experience</label><input type="number" min="0" value={form.experience} onChange={e => setForm(p => ({ ...p, experience: e.target.value }))} placeholder="0" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"/></div>
          <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Desired Roles <span className="text-slate-400 normal-case font-normal">(comma-separated)</span></label><input value={form.desiredRoles} onChange={e => setForm(p => ({ ...p, desiredRoles: e.target.value }))} placeholder="e.g. Senior Embryologist" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"/></div>
          <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Skills <span className="text-slate-400 normal-case font-normal">(comma-separated)</span></label><input value={form.skills} onChange={e => setForm(p => ({ ...p, skills: e.target.value }))} placeholder="ICSI, Vitrification" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"/></div>
          <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notes / Keywords</label><textarea rows={3} value={form.keywords} onChange={e => setForm(p => ({ ...p, keywords: e.target.value }))} placeholder="Anything else…" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm resize-none"/></div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Upload Resume *</label>
            <div onClick={() => ref.current?.click()} className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer ${error ? "border-red-300 bg-red-50" : file ? "border-green-300 bg-green-50" : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50"}`}>
              {processing ? <><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2"/><p className="text-slate-500 text-sm">Processing…</p></> :
               file ? <><div className="text-2xl mb-1">{fileIcon(file.ext)}</div><p className="text-slate-700 text-sm font-semibold">{file.name}</p><p className="text-slate-500 text-xs">{file.ext.toUpperCase()} · {fmtSize(file.size)}</p></> :
               <><p className="text-slate-700 text-sm font-semibold">Click to upload</p><p className="text-slate-500 text-xs mt-1">JPG · JPEG · PDF · DOC · DOCX (max {mb} MB)</p></>}
            </div>
            <input ref={ref} type="file" accept=".jpg,.jpeg,.pdf,.doc,.docx" onChange={e => handleFile(e.target.files?.[0])} className="hidden"/>
            {error && <p className="text-red-600 text-xs mt-2">⚠ {error}</p>}
          </div>
          <label className={`flex gap-3 p-3 rounded-xl border cursor-pointer ${ack ? "border-indigo-300 bg-indigo-50" : "border-slate-200"}`}><input type="checkbox" checked={ack} onChange={() => setAck(!ack)} className="mt-0.5 w-4 h-4 accent-indigo-500 shrink-0"/><p className="text-xs text-slate-600">I consent to my profile being stored in the talent pool.</p></label>
          <button onClick={submit} disabled={submitting || !form.name.trim() || !form.email.trim() || !file || !ack} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 text-white font-bold rounded-xl">{submitting ? "Submitting…" : "Submit →"}</button>
        </div>
        </main>
        <aside className="talent-side talent-side--right" aria-hidden="true">
          <img src="/Mission.png" alt="" className="talent-side-img" loading="lazy"/>
        </aside>
      </div>
    </div>
  );
}

const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js";

function getPdfjsLib() {
  return typeof window !== "undefined" && window.pdfjsLib ? window.pdfjsLib : null;
}

function TalentPoolPdfPage({ pdf, pageNum }) {
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

function TalentPoolPdfViewer({ blobUrl, dataUrl }) {
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

function ResumePreviewModal({ onClose, dataUrl, downloadUrl, fileName, ext, cvText }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [remoteDataUrl, setRemoteDataUrl] = useState(null);
  useEffect(() => {
    let revoke = null;
    if (dataUrl) {
      const u = dataUrlToBlobUrl(dataUrl);
      setBlobUrl(u);
      setRemoteDataUrl(null);
      revoke = u;
      return () => { if (revoke) URL.revokeObjectURL(revoke); };
    }
    if (downloadUrl) {
      let cancelled = false;
      fetch(downloadUrl)
        .then((r) => r.blob())
        .then((blob) => {
          if (cancelled) return;
          const u = URL.createObjectURL(blob);
          setBlobUrl(u);
          revoke = u;
          const reader = new FileReader();
          reader.onload = () => {
            if (!cancelled) setRemoteDataUrl(reader.result);
          };
          reader.readAsDataURL(blob);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
        if (revoke) URL.revokeObjectURL(revoke);
      };
    }
    setBlobUrl(null);
    setRemoteDataUrl(null);
  }, [dataUrl, downloadUrl]);
  const ex = (ext || "").toLowerCase();
  const effectiveDataUrl = dataUrl || remoteDataUrl;
  const isPdf = ex === "pdf" || (effectiveDataUrl && effectiveDataUrl.indexOf("data:application/pdf") === 0);
  const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(ex);
  const src = blobUrl || effectiveDataUrl || downloadUrl;
  return (
    <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h2 className="font-bold text-slate-800 truncate pr-6">{fileName || "Resume"}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center">✕</button>
        </div>
        <div className="flex-1 overflow-auto bg-slate-100 p-3 min-h-[45vh]">
          {isPdf && src ? (
            <TalentPoolPdfViewer blobUrl={blobUrl} dataUrl={effectiveDataUrl} />
          ) : isImage && src ? (
            <div className="flex justify-center">
              <img src={src} alt="" className="max-w-full max-h-[82vh] object-contain rounded-lg shadow bg-white" />
            </div>
          ) : (
            <div className="p-4">
              <p className="text-sm text-slate-600 mb-3">In-app preview works best for PDF and images. For Word documents, use the extracted text below or Download.</p>
              {cvText ? (
                <pre className="whitespace-pre-wrap font-sans text-xs bg-white p-4 rounded-xl border border-slate-200 max-h-[72vh] overflow-auto text-slate-800">{cvText}</pre>
              ) : (
                <p className="text-sm text-slate-500">No preview available. Use Download.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TalentPoolBrowse({ talentPool, jobs, candidates, onMapToJob, onLogAudit, onBack, coolingMonths }) {
  const cm = typeof coolingMonths === "number" ? coolingMonths : 3;
  const [filters, setFilters] = useState({ role: "", skill: "", minExp: "", maxExp: "", location: "", source: "", keyword: "", fromDate: "", toDate: "" });
  const [selected, setSelected] = useState(null), [mapJobId, setMapJobId] = useState(""), [mapping, setMapping] = useState(false);
  const [resumePreview, setResumePreview] = useState(null);
  const filtered = talentPool.filter(t => {
    if (filters.role && !(t.desiredRoles || []).join(" ").toLowerCase().includes(filters.role.toLowerCase())) return false;
    if (filters.skill && !(t.skills || []).join(" ").toLowerCase().includes(filters.skill.toLowerCase())) return false;
    if (filters.minExp !== "" && (t.experience || 0) < parseInt(filters.minExp)) return false;
    if (filters.maxExp !== "" && (t.experience || 0) > parseInt(filters.maxExp)) return false;
    if (filters.location && !(t.location || "").toLowerCase().includes(filters.location.toLowerCase())) return false;
    if (filters.source && (t.source || "") !== filters.source) return false;
    if (filters.keyword) {
      const all = `${t.name} ${t.email} ${t.keywords} ${t.cvText} ${t.qualification || ""} ${t.currentCtc || ""} ${t.currentEmployer || ""} ${t.source || ""} ${t.coolingPeriod || ""} ${t.applicationDate || ""} ${(t.skills || []).join(" ")} ${(t.desiredRoles || []).join(" ")} ${t.preferredCity1 || ""} ${t.preferredCity2 || ""} ${t.preferredCity3 || ""}`.toLowerCase();
      if (!all.includes(filters.keyword.toLowerCase())) return false;
    }
    if (filters.fromDate && new Date(t.submittedAt) < new Date(filters.fromDate)) return false;
    if (filters.toDate && new Date(t.submittedAt) > new Date(filters.toDate + "T23:59:59")) return false;
    return true;
  });
  const hasFilters = Object.values(filters).some(v => v !== "");
  const view = (e) => { setSelected(e); onLogAudit("VIEW_TP_PROFILE", e.id, `Viewed ${e.name}`); };
  const download = (e) => { downloadCvFile(e.cvFile); onLogAudit("DOWNLOAD_TP_CV", e.id, `Downloaded ${e.name}'s CV`); };
  const viewResume = (e) => {
    if (!cvFileHref(e.cvFile)) return;
    setResumePreview({
      dataUrl: e.cvFile.dataUrl,
      downloadUrl: e.cvFile.downloadUrl,
      fileName: e.cvFile.name,
      ext: e.cvFile.ext,
      cvText: e.cvText || "",
    });
    onLogAudit("VIEW_TP_CV", e.id, `In-app preview ${e.name}'s CV`);
  };
  const handleMap = () => {
    if (!mapJobId || !selected) return;
    const job = jobs.find(j => j.id === mapJobId);
    const existing = candidates.find(c => c.email.toLowerCase() === selected.email.toLowerCase());
    if (existing) {
      const status = getCoolingStatus(existing.applicationHistory, mapJobId, cm);
      if (status.pendingInterview) { alert(`Cannot map: ${existing.name} already has an active application (interview not completed).`); return; }
      if (!status.canApply) { alert(`Cannot map: ${existing.name} is in cooling period (${status.daysRemaining}d remaining).`); return; }
    }
    onMapToJob(selected, mapJobId);
    onLogAudit("MAP_TO_JOB", selected.id, `Mapped ${selected.name} → ${job?.title}`);
    alert(`✓ ${selected.name} mapped to "${job?.title}".`);
    setMapping(false); setMapJobId(""); setSelected(null);
  };
  return (
    <>
      {resumePreview ? (
        <ResumePreviewModal
          dataUrl={resumePreview.dataUrl}
          downloadUrl={resumePreview.downloadUrl}
          fileName={resumePreview.fileName}
          ext={resumePreview.ext}
          cvText={resumePreview.cvText}
          onClose={() => setResumePreview(null)}
        />
      ) : null}
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center gap-3 flex-wrap"><button onClick={onBack} className="text-slate-400 hover:text-white text-sm">← Back</button><span className="font-bold">Talent Pool</span><span className="text-xs text-indigo-300 bg-indigo-900/50 px-2 py-0.5 rounded-full">{talentPool.length} profiles</span><span className="text-xs text-slate-400 ml-auto"></span></div>
      {selected && (
        <Modal title={selected.name} onClose={() => { setSelected(null); setMapping(false); setMapJobId(""); setResumePreview(null); }} wide>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {selected.phone && <div><p className="text-xs text-slate-400 font-bold">Phone</p><p>{selected.phone}</p></div>}
              <div><p className="text-xs text-slate-400 font-bold">Email</p><p>{selected.email}</p></div>
              {selected.location && <div><p className="text-xs text-slate-400 font-bold">Current city</p><p>{selected.location}</p></div>}
              {selected.preferredCity1 && <div><p className="text-xs text-slate-400 font-bold">Preferred city 1</p><p>{selected.preferredCity1}</p></div>}
              {selected.preferredCity2 && <div><p className="text-xs text-slate-400 font-bold">Preferred city 2</p><p>{selected.preferredCity2}</p></div>}
              {selected.preferredCity3 && <div><p className="text-xs text-slate-400 font-bold">Preferred city 3</p><p>{selected.preferredCity3}</p></div>}
              <div><p className="text-xs text-slate-400 font-bold">Experience</p><p>{selected.experience} yrs</p></div>
              <div><p className="text-xs text-slate-400 font-bold">Submitted</p><p>{fmtDate(selected.submittedAt)}</p></div>
              {selected.qualification && <div><p className="text-xs text-slate-400 font-bold">Qualification</p><p>{selected.qualification}</p></div>}
              {selected.currentCtc && <div><p className="text-xs text-slate-400 font-bold">Current CTC</p><p>{selected.currentCtc}</p></div>}
              {selected.currentEmployer && <div className="col-span-2"><p className="text-xs text-slate-400 font-bold">Current employer</p><p>{selected.currentEmployer}</p></div>}
              {selected.source && <div><p className="text-xs text-slate-400 font-bold">Source</p><p>{selected.source}</p></div>}
              {selected.applicationDate && <div><p className="text-xs text-slate-400 font-bold">Application date</p><p>{selected.applicationDate}</p></div>}
              {selected.coolingPeriod && <div className="col-span-2"><p className="text-xs text-slate-400 font-bold">Notice period</p><p>{selected.coolingPeriod}</p></div>}
            </div>
            {selected.desiredRoles?.length > 0 && <div><p className="text-xs text-slate-400 font-bold mb-2">Desired Roles</p><div className="flex gap-1 flex-wrap">{selected.desiredRoles.map(r => <span key={r} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg">{r}</span>)}</div></div>}
            {selected.skills?.length > 0 && <div><p className="text-xs text-slate-400 font-bold mb-2">Skills</p><div className="flex gap-1 flex-wrap">{selected.skills.map(s => <span key={s} className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-lg">{s}</span>)}</div></div>}
            {selected.keywords && <div><p className="text-xs text-slate-400 font-bold mb-1">Notes</p><p className="text-sm text-slate-700">{selected.keywords}</p></div>}
            <div>
              <p className="text-xs text-slate-400 font-bold mb-1">Resume</p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm min-w-0"><span className="text-2xl shrink-0">{fileIcon(selected.cvFile.ext)}</span><div className="min-w-0"><p className="font-bold text-slate-800 truncate max-w-xs">{selected.cvFile.name}</p><p className="text-xs text-slate-500">{selected.cvFile.ext.toUpperCase()} · {fmtSize(selected.cvFile.size)}</p></div></div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => viewResume(selected)} className="px-4 py-2 bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-50 text-xs font-bold rounded-lg">View</button>
                  <button type="button" onClick={() => download(selected)} className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg">⬇ Download</button>
                </div>
              </div>
            </div>
            <div className="border-t border-slate-100 pt-4">
              {!mapping ? <button onClick={() => setMapping(true)} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl">→ Map to Job</button> : (
                <div className="space-y-3">
                  <select value={mapJobId} onChange={e => setMapJobId(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"><option value="">— Choose role —</option>{jobs.map(j => <option key={j.id} value={j.id}>{j.title} · {j.location}</option>)}</select>
                  <div className="flex gap-2"><button onClick={() => { setMapping(false); setMapJobId(""); }} className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl">Cancel</button><button onClick={handleMap} disabled={!mapJobId} className="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-xl disabled:bg-slate-200">Confirm</button></div>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-black text-slate-900 mb-1">Talent Pool</h1>
        <p className="text-slate-500 mb-6">Search, view, download, and map talent pool CVs.</p>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
          <h2 className="text-xs font-black text-slate-400 uppercase mb-3">🔍 Filters</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[["Role", "role", "text", "Embryologist"], ["Skill", "skill", "text", "ICSI"], ["Location", "location", "text", "Mumbai"], ["Keyword", "keyword", "text", "Free text"], ["Min Exp", "minExp", "number", ""], ["Max Exp", "maxExp", "number", ""], ["From Date", "fromDate", "date", ""], ["To Date", "toDate", "date", ""]].map(([l, k, t, p]) => <div key={k}><label className="block text-xs text-slate-500 mb-1">{l}</label><input type={t} value={filters[k]} onChange={e => setFilters(prev => ({ ...prev, [k]: e.target.value }))} placeholder={p} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"/></div>)}
            <div><label className="block text-xs text-slate-500 mb-1">Source</label><select value={filters.source} onChange={e => setFilters(prev => ({ ...prev, source: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-indigo-400"><option value="">All</option>{TP_SOURCE_OPTIONS.filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          </div>
          {hasFilters && <button onClick={() => setFilters({ role: "", skill: "", minExp: "", maxExp: "", location: "", source: "", keyword: "", fromDate: "", toDate: "" })} className="mt-3 text-xs text-indigo-500 font-bold">Clear all ✕</button>}
        </div>
        <p className="text-sm font-bold text-slate-600 mb-3">{filtered.length} {filtered.length === 1 ? "profile" : "profiles"}</p>
        {filtered.length === 0 ? <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center"><p className="text-slate-400">{talentPool.length === 0 ? "Talent pool is empty." : "No profiles match."}</p></div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{filtered.map(t => (
            <div key={t.id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg hover:border-indigo-200 transition-all">
              <div className="flex items-start justify-between mb-3"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-lg">{t.name[0]}</div><div><p className="font-bold text-slate-900">{t.name}</p><p className="text-xs text-slate-400">{t.email}</p></div></div><span className="text-xs font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-lg">{fmtDate(t.submittedAt)}</span></div>
              <div className="flex gap-3 text-xs text-slate-600 mb-3 flex-wrap">{t.location && <p>📍 {t.location}</p>}{[t.preferredCity1, t.preferredCity2, t.preferredCity3].filter(Boolean).length > 0 ? <p className="text-violet-700 font-medium">Pref: {[t.preferredCity1, t.preferredCity2, t.preferredCity3].filter(Boolean).join(" · ")}</p> : null}{t.source ? <p className="text-indigo-700 font-semibold">{TP_SOURCE_OPTIONS.find(o => o.value === t.source)?.label || t.source}</p> : null}<p>💼 {t.experience} yrs</p><p>{fileIcon(t.cvFile.ext)} {t.cvFile.ext.toUpperCase()}</p></div>
              {t.desiredRoles?.length > 0 && <div className="flex gap-1 flex-wrap mb-2">{t.desiredRoles.slice(0, 3).map(r => <span key={r} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg">{r}</span>)}</div>}
              {t.skills?.length > 0 && <div className="flex gap-1 flex-wrap mb-3">{t.skills.slice(0, 4).map(s => <span key={s} className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg">{s}</span>)}</div>}
              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button onClick={() => view(t)} className="flex-1 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg">View</button>
                <button onClick={() => download(t)} className="px-3 py-2 border border-slate-200 text-slate-600 text-xs font-bold rounded-lg">⬇</button>
              </div>
            </div>
          ))}</div>
        )}
      </div>
    </div>
    </>
  );
}

const AUDIT_ACTION_META = {
  "interview.reattempt_approved":   { label: "Reattempt approved",    tone: "green" },
  "interview.reattempt_rejected":   { label: "Reattempt rejected",    tone: "red" },
  "interview.reattempt_requested":  { label: "Reattempt requested",   tone: "amber" },
  "interview.incomplete_technical": { label: "Interview ended early", tone: "orange" },
  VIEW_TP_PROFILE:                  { label: "Viewed talent profile", tone: "blue" },
  VIEW_TP_CV:                       { label: "Viewed CV",             tone: "blue" },
  DOWNLOAD_TP_CV:                   { label: "Downloaded CV",         tone: "purple" },
  MAP_TO_JOB:                       { label: "Mapped to job",         tone: "green" },
};

const AUDIT_TONE_CLASSES = {
  green:  "bg-green-50 text-green-700",
  red:    "bg-red-50 text-red-700",
  amber:  "bg-amber-50 text-amber-700",
  orange: "bg-orange-50 text-orange-700",
  blue:   "bg-blue-50 text-blue-700",
  purple: "bg-purple-50 text-purple-700",
  slate:  "bg-slate-100 text-slate-700",
};

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

function AuditLogView({ auditLog, candidates, hrUsers, onRefresh, onBack }) {
  const [filter, setFilter] = useState("");
  const candidatesMap = useMemo(
    () => Object.fromEntries((candidates || []).map((c) => [c.id, c.name])),
    [candidates],
  );
  const hrUsersMap = hrUsers || {};
  const rows = useMemo(
    () =>
      (auditLog || []).map((a) => ({
        entry: a,
        humanized: humanizeAuditEntry(a, hrUsersMap, candidatesMap),
        actorLabel: resolveActorLabel(a.actor, hrUsersMap, candidatesMap),
        dateLabel: formatAuditDate(a.timestamp),
        timeLabel: formatAuditTime(a.timestamp),
      })),
    [auditLog, hrUsersMap, candidatesMap],
  );
  const q = filter.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) =>
        `${r.humanized.label} ${r.actorLabel} ${r.entry.action} ${r.humanized.sentence} ${r.dateLabel} ${r.timeLabel}`
          .toLowerCase()
          .includes(q),
      )
    : rows;
  const sorted = [...filtered].sort((a, b) => new Date(b.entry.timestamp) - new Date(a.entry.timestamp));
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-white text-sm">← Back</button>
        <span className="font-bold">Audit Log</span>
        <span className="text-xs text-indigo-300 bg-indigo-900/50 px-2 py-0.5 rounded-full">{auditLog.length}</span>
        {onRefresh ? <button type="button" onClick={onRefresh} className="ml-auto text-xs text-slate-300 hover:text-white border border-slate-700 rounded-lg px-3 py-1">↻ Refresh names</button> : null}
      </div>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-black text-slate-900 mb-1">Access & Action Audit</h1>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by name, action, application, date…" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl mb-5 shadow-sm"/>
        {sorted.length === 0 ? <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center"><p className="text-slate-400">No entries.</p></div> : (
          <div className="space-y-2">{sorted.map(({ entry: a, humanized: h, actorLabel, dateLabel, timeLabel }) => (
            <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-xs font-black px-2 py-0.5 rounded ${AUDIT_TONE_CLASSES[h.tone] || AUDIT_TONE_CLASSES.slate}`}>{h.label}</span>
                  <span className="text-xs font-bold text-slate-600">{actorLabel}</span>
                  <span className="text-[10px] text-slate-400 font-mono bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5">{a.action}</span>
                </div>
                <p className="text-sm text-slate-700">{h.sentence}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-slate-500">{dateLabel}</p>
                <p className="text-xs text-slate-400">{timeLabel}</p>
              </div>
            </div>
          ))}</div>
        )}
      </div>
    </div>
  );
}

const CV_ANALYSER_MAX = 20;
const CV_ANALYSER_MB = 5;

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

function CVResultCard({ row, jobTitle, inviteUrl }) {
  const [open, setOpen] = useState(false);
  const [inviteModal, setInviteModal] = useState(false);
  if (row.loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 flex items-center justify-center gap-3">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin shrink-0" aria-hidden />
        <span className="text-slate-600 text-sm font-medium truncate">{row.filename}</span>
      </div>
    );
  }
  if (row.status === "error") {
    return (
      <div className="bg-white rounded-2xl border border-red-200 shadow-sm px-5 py-4 text-sm text-red-800">
        <span className="font-semibold">{row.filename}</span>
        <span className="text-red-700"> — {row.error || "Could not analyse this file."}</span>
      </div>
    );
  }
  const a = row.analysis || {};
  const initial = (a.candidateName && String(a.candidateName).trim()[0]) || "?";
  const canInvite = Boolean(inviteUrl && String(inviteUrl).trim());
  const candLabel = a.candidateName && String(a.candidateName).trim() ? String(a.candidateName).trim() : "Candidate";
  const jtLabel = jobTitle && String(jobTitle).trim() ? String(jobTitle).trim() : "the position";
  const { subject: inviteSubject, body: inviteBody } = buildCvAnalyserInviteEmail({
    candidateName: candLabel,
    jobTitle: jtLabel,
    interviewLink: inviteUrl || "",
  });
  const copyFullEmail = () => {
    const text = `Subject: ${inviteSubject}\n\n${inviteBody}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => window.alert("Copied full email to clipboard.")).catch(() => window.alert("Could not copy."));
    } else {
      window.prompt("Copy this email:", text);
    }
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-full bg-slate-800 text-white flex items-center justify-center text-lg font-black shrink-0">{initial}</div>
          <div className="min-w-0">
            <p className="font-bold text-slate-900 truncate">{a.candidateName || "—"}</p>
            <p className="text-sm text-slate-500 truncate">{a.email || "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {row.analysisMode === "pdf_vision" ? <span className="text-xs font-bold text-indigo-800 bg-indigo-100 px-2 py-1 rounded-full">Visual PDF</span> : null}
          {row.cached ? <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">Cached</span> : null}
          <span className="text-xs font-bold text-white bg-slate-700 px-3 py-1 rounded-full">{verdictLabel(a.verdict)}</span>
        </div>
      </div>
      <p className="text-sm text-slate-600 mb-3">
        {[a.currentRole, a.yearsExperience != null ? `${a.yearsExperience} yrs` : null, a.phone].filter(Boolean).join(" · ") || "—"}
      </p>
      {Number.isFinite(a.overallFitScore) ? (
        <div className="mb-4 rounded-2xl bg-gradient-to-br from-indigo-50 via-white to-teal-50 border border-indigo-100/80 p-4 shadow-sm">
          <div className="flex flex-wrap items-stretch gap-4">
            <div className="flex flex-col items-center justify-center min-w-[5.5rem] rounded-2xl bg-indigo-600 text-white px-4 py-3 shadow-md shadow-indigo-900/15">
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-200">Fit</span>
              <span className="text-4xl font-black leading-none">{Math.round(a.overallFitScore)}</span>
              <span className="text-[10px] font-bold text-indigo-200 mt-0.5">/ 100</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-slate-500 uppercase mb-1.5">Match to your JD</p>
              <p className="text-sm text-slate-800 leading-snug">{a.fitSummary || "—"}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {[
                  { k: "technicalScore", label: "Technical" },
                  { k: "experienceScore", label: "Experience" },
                  { k: "educationScore", label: "Education" },
                  { k: "cultureScore", label: "Culture" },
                ].map(({ k, label }) => (
                  <span key={k} className="inline-flex items-baseline gap-1 text-xs font-bold bg-white/90 border border-slate-200/80 text-slate-700 px-2.5 py-1 rounded-full shadow-sm">
                    <span className="text-slate-500 font-semibold">{label}</span>
                    <span className="text-indigo-700">{a[k] != null ? Number(a[k]).toFixed(1) : "—"}</span>
                    <span className="text-slate-400 font-medium">/5</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <p className="text-sm text-slate-800 leading-snug line-clamp-2 mb-4">{a.summary || ""}</p>
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="border-l-2 border-green-500 pl-3">
          <p className="text-xs font-black text-slate-500 uppercase mb-2">Strengths</p>
          <ul className="text-sm text-slate-700 space-y-1 list-disc list-inside">{(a.strengths || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
        <div className="border-l-2 border-amber-500 pl-3">
          <p className="text-xs font-black text-slate-500 uppercase mb-2">Gaps</p>
          <ul className="text-sm text-slate-700 space-y-1 list-disc list-inside">{(a.gaps || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {(a.skills || []).slice(0, 8).map((sk) => (
          <span key={sk} className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-1 rounded-full">{sk}</span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <button
          type="button"
          disabled={!canInvite}
          title={canInvite ? "Open email draft with interview link" : "Link a careers job in Job Master (Careers job — interview invite link) and save."}
          onClick={() => canInvite && setInviteModal(true)}
          className={`text-xs font-bold px-4 py-2 rounded-xl border transition-colors ${canInvite ? "border-teal-600 text-teal-800 bg-teal-50 hover:bg-teal-100" : "border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed"}`}
        >
          Sent invite
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
          {open ? "Hide details" : "Show details"}
        </button>
      </div>
      {open ? (
        <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-700 space-y-2">
          <div>
            <p className="text-xs font-black text-slate-400 uppercase mb-1">Education</p>
            <ul className="list-disc list-inside space-y-0.5">{(a.education || []).map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
          {(a.redFlags || []).length > 0 ? (
            <div>
              <p className="text-xs font-black text-slate-400 uppercase mb-1">Red flags</p>
              <ul className="list-disc list-inside text-amber-900 space-y-0.5">{a.redFlags.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {inviteModal ? (
        <Modal title="Interview invite email" onClose={() => setInviteModal(false)} wide>
          <p className="text-xs text-slate-500 mb-3">Copy into your email client. Interview link base: <span className="font-mono text-[11px]">{publicAppOrigin()}</span> (set <span className="font-mono text-[10px]">VITE_PUBLIC_APP_URL</span> in <span className="font-mono text-[10px]">frontend/.env</span> for production; otherwise uses this tab&apos;s origin).</p>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Subject</label>
          <input readOnly className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mb-3 bg-slate-50" value={inviteSubject} onFocus={(e) => e.target.select()} />
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Body</label>
          <textarea readOnly rows={20} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed mb-4" value={inviteBody} onFocus={(e) => e.target.select()} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copyFullEmail} className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold">Copy subject + body</button>
            <button type="button" onClick={() => setInviteModal(false)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold">Close</button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function CVAnalyserPage({ onBack, onSynced, jobs: boardJobs = [] }) {
  const inputRef = useRef(null);
  const [staged, setStaged] = useState([]);
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState("");
  const [cvJobs, setCvJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedCareersJobId, setSelectedCareersJobId] = useState(null);
  const [recruitmentJobs, setRecruitmentJobs] = useState([]);
  const [jobForm, setJobForm] = useState({
    title: "",
    companyName: "Indira IVF",
    designation: "",
    location: "Mumbai",
    description: "",
    recruitmentJobId: "",
  });
  const [saveJobBusy, setSaveJobBusy] = useState(false);

  const defaultJobForm = () => ({
    title: "",
    companyName: "Indira IVF",
    designation: "",
    location: "Mumbai",
    description: "",
    recruitmentJobId: "",
  });

  const loadJobs = async () => {
    setJobsLoading(true);
    try {
      const res = await fetch("/api/admin/cv-analyser/jobs", { headers: { ...authHeaders() } });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503 && String(data.error || "").toLowerCase().includes("migration")) {
        setBanner("Run database migration: migration_cv_analyser_job.sql, then refresh.");
        setCvJobs([]);
        return;
      }
      if (!res.ok) {
        setBanner(data.error || `Could not load saved jobs (${res.status}). The list was not cleared — try Refresh list.`);
        return;
      }
      const list = data.jobs || [];
      setCvJobs(list);
      setSelectedJobId((sid) => {
        if (sid == null) return null;
        return list.some((x) => Number(x.id) === Number(sid)) ? sid : null;
      });
      setSelectedCareersJobId((cid) => {
        if (cid == null) return null;
        return list.some((x) => String(x.recruitmentJobId) === String(cid)) ? cid : null;
      });
    } catch {
      setBanner("Could not reach server to load saved jobs.");
    } finally {
      setJobsLoading(false);
    }
  };

  const loadRecruitmentJobs = async () => {
    try {
      const res = await fetch("/api/admin/cv-analyser/recruitment-jobs", { headers: { ...authHeaders() } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setRecruitmentJobs(data.jobs || []);
      else setRecruitmentJobs([]);
    } catch {
      setRecruitmentJobs([]);
    }
  };

  useEffect(() => {
    loadJobs();
    loadRecruitmentJobs();
  }, []);

  const applyJobToForm = (j) => {
    setJobForm({
      title: j.title || "",
      companyName: j.companyName || "Indira IVF",
      designation: j.designation || "",
      location: j.location || "Mumbai",
      description: j.description || "",
      recruitmentJobId: j.recruitmentJobId != null && j.recruitmentJobId !== "" ? String(j.recruitmentJobId) : "",
    });
  };

  const onSelectJob = async (e) => {
    const jid = e.target.value;
    if (!jid) {
      setSelectedCareersJobId(null);
      setSelectedJobId(null);
      return;
    }
    const job = (boardJobs || []).find((x) => String(x.id) === String(jid));
    if (!job) return;
    const nextForm = {
      ...jobForm,
      title: job.title || "",
      designation: job.designation || "",
      description: job.description || "",
      recruitmentJobId: jid,
    };
    setJobForm(nextForm);
    setBanner("");
    const existingCv = cvJobs.find((c) => String(c.recruitmentJobId) === String(jid));
    setSaveJobBusy(true);
    try {
      const out = await persistJobPosting(nextForm, existingCv?.id ?? null);
      if (!out.ok) {
        setBanner(out.error || "Could not save posting for analysis.");
        return;
      }
      setSelectedCareersJobId(jid);
      await loadJobs();
      try {
        if (typeof onSynced === "function") await onSynced();
      } catch (_) {}
      if (out.data && out.data.id != null) setSelectedJobId(out.data.id);
      if (out.data) applyJobToForm(out.data);
    } catch {
      setBanner("Could not save posting.");
    } finally {
      setSaveJobBusy(false);
    }
  };

  const startNewJob = () => {
    setSelectedJobId(null);
    setSelectedCareersJobId(null);
    setJobForm(defaultJobForm());
  };

  const persistJobPosting = async (form, idForPatch) => {
    const title = String(form.title || "").trim();
    if (!title) return { ok: false, error: "Enter a job title before saving." };
    const body = JSON.stringify({
      title: String(form.title).trim(),
      companyName: String(form.companyName || "Indira IVF").trim() || "Indira IVF",
      designation: String(form.designation || "").trim(),
      location: String(form.location || "Mumbai").trim() || "Mumbai",
      description: String(form.description || "").trim(),
      recruitmentJobId:
        form.recruitmentJobId && String(form.recruitmentJobId).trim()
          ? String(form.recruitmentJobId).trim()
          : null,
    });
    const headers = { ...authHeaders(), "Content-Type": "application/json" };
    try {
      if (idForPatch != null) {
        const res = await fetch(`/api/admin/cv-analyser/jobs/${idForPatch}`, {
          method: "PATCH",
          headers,
          body,
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 404) {
          const res2 = await fetch("/api/admin/cv-analyser/jobs", {
            method: "POST",
            headers,
            body,
          });
          const data2 = await res2.json().catch(() => ({}));
          if (!res2.ok) {
            return { ok: false, error: data2.error || "Could not save job posting." };
          }
          return { ok: true, data: data2, recreated: true };
        }
        if (!res.ok) return { ok: false, error: data.error || "Could not save job posting." };
        return { ok: true, data };
      }
      const res = await fetch("/api/admin/cv-analyser/jobs", {
        method: "POST",
        headers,
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || "Could not save job posting." };
      return { ok: true, data };
    } catch {
      return { ok: false, error: "Could not save job posting." };
    }
  };

  const saveJob = async () => {
    const title = jobForm.title.trim();
    if (!title) {
      setBanner("Enter a job title before saving.");
      return;
    }
    setSaveJobBusy(true);
    setBanner("");
    try {
      const out = await persistJobPosting(jobForm, selectedJobId);
      if (!out.ok) {
        setBanner(out.error || "Could not save job posting.");
        return;
      }
      await loadJobs();
      if (out.data && out.data.id != null) setSelectedJobId(out.data.id);
      if (out.data) applyJobToForm(out.data);
      if (out.data && out.data.recruitmentJobId != null && String(out.data.recruitmentJobId).trim() !== "") {
        setSelectedCareersJobId(String(out.data.recruitmentJobId));
      }
    } catch {
      setBanner("Could not save job posting.");
    } finally {
      setSaveJobBusy(false);
    }
  };

  const validateAndAddFiles = (fileList) => {
    const arr = Array.from(fileList || []);
    if (arr.length === 0) return;
    setBanner("");
    const maxBytes = CV_ANALYSER_MB * 1024 * 1024;
    const next = [...staged];
    for (const f of arr) {
      if (next.length >= CV_ANALYSER_MAX) {
        setBanner(`Maximum ${CV_ANALYSER_MAX} files.`);
        break;
      }
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      if (ext !== "pdf" && ext !== "docx") {
        setBanner("Only PDF or DOCX files are allowed.");
        continue;
      }
      if (f.size > maxBytes) {
        setBanner(`Each file must be ≤ ${CV_ANALYSER_MB} MB.`);
        continue;
      }
      next.push({ id: "f-" + Math.random().toString(36).slice(2) + Date.now(), file: f });
    }
    setStaged(next);
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    validateAndAddFiles(e.dataTransfer.files);
  };

  const runAnalyse = async () => {
    if (staged.length === 0) return;
    if (selectedJobId == null) {
      setBanner("Select or save a job posting first. CVs are scored against that JD.");
      return;
    }
    setBanner("");
    setBusy(true);
    const placeholders = staged.map((s) => ({ loading: true, filename: s.file.name, fileId: null }));
    setResults(placeholders);
    const fd = new FormData();
    staged.forEach((s) => fd.append("files", s.file, s.file.name));
    fd.append("jobProfileId", String(selectedJobId));
    try {
      const res = await fetch("/api/admin/cv-analyser/batch", {
        method: "POST",
        headers: { ...authHeaders() },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503 && (data.code === "AI_UNAVAILABLE" || /unavailable/i.test(data.error || ""))) {
        setBanner("AI service unavailable. Check ANTHROPIC_API_KEY on the server.");
        setResults([]);
        return;
      }
      if (res.status === 429) {
        setBanner(data.error || "Too many requests. Try again in a minute.");
        setResults([]);
        return;
      }
      if (res.status === 404) {
        setBanner(data.error || "Job posting not found. Refresh the job list and try again.");
        setResults([]);
        return;
      }
      if (!res.ok) {
        setBanner(data.error || "Batch request failed.");
        setResults([]);
        return;
      }
      setResults(data.results || []);
      if ((data.meta && data.meta.succeeded > 0) && typeof onSynced === "function") {
        try { await onSynced(); } catch (_) { /* ignore */ }
      }
    } catch {
      setBanner("Could not reach server.");
      setResults([]);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    const ids = (results || []).filter((r) => r.status === "ok" && r.fileId).map((r) => r.fileId);
    if (ids.length === 0) return;
    try {
      const res = await fetch("/api/admin/cv-analyser/export?fileIds=" + encodeURIComponent(ids.join(",")), { headers: { ...authHeaders() } });
      if (!res.ok) {
        const t = await res.json().catch(() => ({}));
        alert(t.error || "Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cv-analyser-export.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed");
    }
  };

  const okCount = (results || []).filter((r) => r.status === "ok").length;
  const selectedCvJobRow = selectedJobId != null ? cvJobs.find((x) => x.id === selectedJobId) : null;
  const inviteJobTitle =
    (jobForm.title && jobForm.title.trim()) || selectedCvJobRow?.title || "";
  const inviteRecruitmentId =
    (jobForm.recruitmentJobId && String(jobForm.recruitmentJobId).trim()) ||
    (selectedCvJobRow?.recruitmentJobId != null && String(selectedCvJobRow.recruitmentJobId).trim()) ||
    "";
  const inviteApplyUrl =
    typeof window !== "undefined" && inviteRecruitmentId
      ? `${publicAppOrigin()}/jobs/${encodeURIComponent(inviteRecruitmentId)}/apply?invite=1`
      : "";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center gap-3 flex-wrap">
        <button type="button" onClick={onBack} className="text-slate-400 hover:text-white text-sm">← Back</button>
        <span className="font-bold">CV Analyser</span>
      </div>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-black text-slate-900 mb-1">CV Analyser</h1>
        <p className="text-slate-500 mb-6">Pick a role from Job Master (HR Job Postings), then upload CVs. Each CV is scored against the Description field as JD.</p>
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-black text-slate-900">Job Master</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={jobsLoading || saveJobBusy}
                onClick={async () => {
                  await loadJobs();
                  try {
                    if (typeof onSynced === "function") await onSynced();
                  } catch (_) {}
                }}
                className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Refresh list
              </button>
              <button type="button" disabled={saveJobBusy} onClick={startNewJob} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-800 hover:bg-slate-200">New job</button>
            </div>
          </div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Job posting (Job Master)</label>
          <select
            value={selectedCareersJobId != null ? String(selectedCareersJobId) : ""}
            onChange={onSelectJob}
            disabled={jobsLoading || saveJobBusy}
            className="w-full mb-4 px-3 py-2.5 rounded-xl border border-slate-200 text-slate-900 text-sm bg-white disabled:opacity-50"
          >
            <option value="">— Select a role —</option>
            {(boardJobs || []).map((j) => (
              <option key={j.id} value={String(j.id)}>{j.title}{j.location ? ` · ${j.location}` : ""}</option>
            ))}
          </select>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Job title</label>
              <input value={jobForm.title} onChange={(e) => setJobForm((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. Clinical Embryologist" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Company</label>
              <input value={jobForm.companyName} onChange={(e) => setJobForm((p) => ({ ...p, companyName: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Location</label>
              <input value={jobForm.location} onChange={(e) => setJobForm((p) => ({ ...p, location: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Designation</label>
              <input value={jobForm.designation} onChange={(e) => setJobForm((p) => ({ ...p, designation: e.target.value }))} placeholder="Official designation / grade" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Job description (JD)</label>
              <textarea value={jobForm.description} onChange={(e) => setJobForm((p) => ({ ...p, description: e.target.value }))} rows={5} placeholder="Responsibilities, must-have skills, clinic context…" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm resize-y min-h-[120px]" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Careers job — interview invite link</label>
              <p className="text-xs text-slate-500 mb-2">Maps this CV-analyser posting to a role on the careers board so <strong className="font-semibold text-slate-700">Sent invite</strong> can include <span className="font-mono text-[11px]">/jobs/&lt;id&gt;/apply?invite=1</span> for the AI interview.</p>
              <select
                value={jobForm.recruitmentJobId || ""}
                onChange={(e) => setJobForm((p) => ({ ...p, recruitmentJobId: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
              >
                <option value="">— Not linked —</option>
                {(recruitmentJobs || []).map((j) => (
                  <option key={j.id} value={j.id}>{j.title}{j.location ? ` · ${j.location}` : ""}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-100">
            <button type="button" disabled={saveJobBusy} onClick={saveJob} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold disabled:opacity-40">
              {saveJobBusy ? "Saving…" : selectedJobId != null ? "Save changes" : "Save job posting"}
            </button>
            <p className="text-xs text-slate-500">
              {selectedJobId != null ? (
                <>Profile #{selectedJobId} — JD from Job Master Description; edit fields and Save if needed before analysing CVs.</>
              ) : (
                <>Pick a Job Master role above (loads title, designation, JD from HR Job Postings). Then analyse CVs.</>
              )}
            </p>
          </div>
        </div>
        {banner ? <div className="mb-4 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">{banner}</div> : null}
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current && inputRef.current.click(); } }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={onDrop}
          onClick={() => !busy && inputRef.current && inputRef.current.click()}
          className={`border-2 border-dashed border-slate-300 rounded-2xl bg-white p-10 text-center cursor-pointer transition hover:border-indigo-400 hover:bg-slate-50/80 ${busy ? "opacity-60 pointer-events-none" : ""}`}
        >
          <input ref={inputRef} type="file" multiple accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => { validateAndAddFiles(e.target.files); e.target.value = ""; }} />
          <div className="flex justify-center mb-3 text-slate-400">
            <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
          </div>
          <p className="text-slate-800 font-semibold mb-1">Drag &amp; drop CVs here, or click to browse</p>
          <p className="text-sm text-slate-500">PDF or DOCX · Up to 20 files · Max {CV_ANALYSER_MB}MB each</p>
        </div>
        {staged.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {staged.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-2 text-sm bg-white border border-slate-200 rounded-full px-3 py-1.5 text-slate-700">
                <span className="truncate max-w-[200px]">{s.file.name}</span>
                <span className="text-slate-400">· {fmtSize(s.file.size)}</span>
                <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); setStaged((p) => p.filter((x) => x.id !== s.id)); }} className="text-slate-500 hover:text-red-600 font-bold" aria-label="Remove">✕</button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button type="button" disabled={busy} onClick={() => { setStaged([]); setBanner(""); }} className="text-sm font-bold text-slate-600 hover:text-slate-900">Clear All</button>
          <button type="button" disabled={busy || staged.length === 0 || selectedJobId == null || jobsLoading} onClick={runAnalyse} className="px-6 py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold rounded-xl text-sm transition-colors">
            {busy ? "Analysing…" : `Analyse ${staged.length} CV${staged.length === 1 ? "" : "s"} →`}
          </button>
        </div>
        {results.length > 0 ? (
          <div className="mt-10 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
              <p className="text-sm font-bold text-slate-800">{results.length} CV{results.length === 1 ? "" : "s"} analysed{okCount < results.length ? ` · ${okCount} succeeded` : ""}</p>
              <div className="flex gap-2">
                <button type="button" onClick={exportCsv} disabled={okCount === 0} className="px-4 py-2 text-sm font-bold border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40">Export CSV</button>
                <button type="button" onClick={() => { setResults([]); setBanner(""); }} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Clear Results</button>
              </div>
            </div>
            <div className="space-y-4">
              {results.map((row, i) => (
                <CVResultCard
                  key={row.fileId || row.filename + "-" + i}
                  row={row}
                  jobTitle={inviteJobTitle}
                  inviteUrl={inviteApplyUrl}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Screening({ candidates, jobs, onShortlist, onBack }) {
  const [phase, setPhase] = useState("chat"), [criteria, setCriteria] = useState(""), [scored, setScored] = useState([]), [sel, setSel] = useState(new Set()), [input, setInput] = useState(""), [msgs, setMsgs] = useState([]), [busy, setBusy] = useState(false), [hist, setHist] = useState([]);
  const consented = candidates.filter(c => c.consent);
  useEffect(() => { (async () => { setBusy(true); const r = await callClaude([{ role: "user", content: `${consented.length} candidates to screen.` }], "You are Swar HR. Be concise."); setMsgs([{ role: "ai", text: r }]); setHist([{ role: "user", content: "Hi." }, { role: "assistant", content: r }]); setBusy(false); })(); }, []);
  const send = async () => { if (!input.trim() || busy) return; const u = input.trim(); setInput(""); const h = [...hist, { role: "user", content: u }]; setMsgs(p => [...p, { role: "user", text: u }]); setBusy(true); const r = await callClaude(h, "Be concise."); setMsgs(p => [...p, { role: "ai", text: r }]); setHist([...h, { role: "assistant", content: r }]); setCriteria(p => p + " " + u); setBusy(false); };
  const analyze = async () => { setPhase("analyzing"); const results = []; for (const c of consented.filter(c => c.jobId && c.cv)) { const job = jobs.find(j => j.id === c.jobId) || {}; const r = await callClaude([{ role: "user", content: `Score CV for "${job.title}". Req: ${job.requirements}. Extra: ${criteria}. CV: ${c.cv}. JSON: {"overallScore":0-100,"summary":"...","recommendation":"shortlist|reject"}` }], "Return only JSON.", true); results.push({ ...c, sr: r || { overallScore: 50, summary: "—", recommendation: "shortlist" } }); } const s = results.sort((a, b) => (b.sr?.overallScore || 0) - (a.sr?.overallScore || 0)); setScored(s); setSel(new Set(s.filter(c => c.sr?.recommendation === "shortlist").map(c => c.id))); setPhase("results"); };
  if (phase === "analyzing") return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Spin label="Analysing…"/></div>;
  if (phase === "results") return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between"><span className="font-bold">Results</span><button onClick={() => onShortlist(candidates.map(c => sel.has(c.id) ? { ...c, status: "SHORTLISTED" } : c))} className="px-5 py-1.5 bg-indigo-600 rounded-lg text-sm font-bold">Confirm ({sel.size})</button></div>
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-3">{scored.map(c => { const on = sel.has(c.id); return <div key={c.id} onClick={() => setSel(p => { const n = new Set(p); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} className={`bg-white rounded-2xl border p-4 cursor-pointer ${on ? "border-indigo-300" : "border-slate-200 opacity-60"}`}><div className="flex items-center justify-between"><div><p className="font-bold">{c.name}</p><p className="text-xs text-slate-400">{c.email}</p></div><p className="text-2xl font-black text-indigo-600">{c.sr?.overallScore}</p></div><p className="text-sm text-slate-600 mt-2">{c.sr?.summary}</p></div>; })}</div>
    </div>
  );
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between"><div className="flex items-center gap-3"><button onClick={onBack} className="text-slate-400 hover:text-white">← Back</button><span className="font-bold">Screening</span></div><button onClick={analyze} disabled={consented.filter(c => c.cv && c.jobId).length === 0} className="px-4 py-1.5 bg-indigo-600 disabled:bg-slate-700 rounded-lg text-sm font-bold">Analyse →</button></div>
      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-6 flex flex-col">
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">{msgs.map((m, i) => <div key={i} className={`flex ${m.role === "ai" ? "justify-start" : "justify-end"}`}><div className={`max-w-xs px-4 py-3 rounded-2xl text-sm ${m.role === "ai" ? "bg-slate-100" : "bg-indigo-600 text-white"}`}>{m.text}</div></div>)}{busy && <p className="text-slate-500 text-sm animate-pulse">Typing…</p>}</div>
          <div className="border-t border-slate-100 p-4 flex gap-3"><input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Criteria…" className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"/><button onClick={send} disabled={!input.trim() || busy} className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl disabled:bg-slate-200 text-sm">Send</button></div>
        </div>
      </div>
    </div>
  );
}

function InterviewScheduleModal({ jobTitle, onConfirm, onCancel }) {
  const [local, setLocal] = useState("");
  useEffect(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setLocal(d.toISOString().slice(0, 16));
  }, []);
  return (
    <Modal title={jobTitle ? `Schedule · ${jobTitle}` : "Schedule interview"} onClose={onCancel}>
      <p className="text-xs text-slate-500 mb-3">Date and time use your device timezone. Start unlocks at this time; you have {INTERVIEW_START_GRACE_MINUTES} minutes after that to begin (HR can always start from the dashboard).</p>
      <input type="datetime-local" value={local} onChange={e => setLocal(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 mb-4 text-slate-800" />
      <button type="button" onClick={() => { if (!local) return; onConfirm(new Date(local).toISOString()); }} className="w-full py-3 bg-teal-700 hover:bg-teal-600 text-white font-bold rounded-xl">Confirm slot</button>
      <button type="button" onClick={onCancel} className="w-full mt-2 text-slate-500 text-sm py-2">Cancel</button>
    </Modal>
  );
}

function Intro({ candidate, job, onStart, onBack, onLogout, onSchedule, interviewScheduledAt, bypassSchedule, eligibilityBlock }) {
  const [lang, setLang] = useState("English");
  const [showSched, setShowSched] = useState(false);
  const [clockTick, setClockTick] = useState(0);
  useEffect(() => {
    if (bypassSchedule || !interviewScheduledAt) return undefined;
    const id = setInterval(() => setClockTick((x) => x + 1), 5000);
    return () => clearInterval(id);
  }, [bypassSchedule, interviewScheduledAt]);
  void clockTick;
  const slot = interviewStartSlotStatus(interviewScheduledAt, bypassSchedule);
  const blockSchedule = Boolean(slot.blocked);
  const blockInterview = Boolean(eligibilityBlock);
  const startDisabled = blockSchedule || blockInterview;
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
        <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto flex items-center justify-center mb-4 text-3xl">🎤</div>
        <h1 className="text-2xl font-black text-white mb-1">Voice Interview</h1>
        <p className="text-slate-400 text-sm mb-1">Hello, <span className="text-white font-bold">{candidate?.name}</span></p>
        <p className="text-indigo-300 font-semibold mb-4">{job?.title}</p>
        {interviewScheduledAt ? (
          <p className="text-xs text-teal-300 mb-3">📅 Scheduled: {fmtDateTime(interviewScheduledAt)}</p>
        ) : null}
        <div className="bg-indigo-900/40 border border-indigo-800 rounded-xl p-3 mb-5 text-left text-xs text-indigo-200"><p className="font-bold text-indigo-100 mb-1">🎙️ How it works</p><p>Press Start once on the next screen. Swar asks each question aloud; your reply is captured automatically after a short pause.</p></div>
        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Language</label>
        <select value={lang} onChange={e => setLang(e.target.value)} className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white mb-5">{["English", "Hindi", "Bengali", "Tamil", "Telugu", "Kannada", "Marathi", "Gujarati", "Malayalam"].map(l => <option key={l} value={l}>{l}</option>)}</select>
        {eligibilityBlock ? <p className="text-amber-200/90 text-xs mb-3 text-left bg-amber-950/40 border border-amber-800/50 rounded-lg p-3">{eligibilityBlock}</p> : null}
        {slot.hasSlot && slot.tooEarly ? <p className="text-amber-200/90 text-xs mb-3 text-left">Start unlocks at {fmtDateTime(interviewScheduledAt)} (your time).</p> : null}
        {slot.hasSlot && slot.tooLate ? <p className="text-amber-200/90 text-xs mb-3 text-left bg-amber-950/30 border border-amber-800/40 rounded-lg p-3">This interview slot closed at {fmtDateTime(slot.windowEndIso)}. Use <span className="font-bold">Maybe later</span> to pick a new time.</p> : null}
        <button type="button" disabled={startDisabled} onClick={() => onStart(lang)} className={`w-full py-3 font-bold rounded-xl mb-3 ${startDisabled ? "bg-slate-700 text-slate-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-500 text-white"}`}>🎤 Start →</button>
        <button type="button" onClick={() => setShowSched(true)} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl mb-3 border border-indigo-500/50">Maybe later</button>
        <button type="button" onClick={onLogout} className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold rounded-xl mb-2">Logout</button>
        <button type="button" onClick={onBack} className="text-slate-500 text-sm hover:text-slate-300">← Back</button>
        {showSched ? (
          <InterviewScheduleModal
            jobTitle={job?.title}
            onConfirm={(iso) => { onSchedule(iso); setShowSched(false); }}
            onCancel={() => setShowSched(false)}
          />
        ) : null}
      </div>
    </div>
  );
}

function Interview({ context, applicationId, onEnd, onAbandon }) {
  const RESOLVE_TIMEOUT_MS = 90000;
  const getScriptedList = (scr, ph) => {
    if (!scr) return [];
    if (ph === "opening") return scr.opening || [];
    if (ph === "hr") return scr.role && scr.role.length ? scr.role : (scr.questions || []);
    if (ph === "closing") return scr.closing || [];
    return [];
  };
  const isScriptedPhase = (ph) => ph === "opening" || ph === "hr" || ph === "closing";
  const initialPhaseFromScript = (d) => {
    if ((d.opening || []).length) return "opening";
    if ((d.role || []).length) return "hr";
    if ((d.closing || []).length) return "closing";
    return "ai";
  };
  const [phase, setPhase] = useState("load");
  const [script, setScript] = useState(null);
  const MAX_AI = Math.min(30, Math.max(1, Number(script?.aiFollowUpCount) || 12));
  const AI_DIFFICULTY = ["easy", "medium", "hard"].includes(script?.aiDifficulty) ? script.aiDifficulty : "medium";
  const [phaseIdx, setPhaseIdx] = useState(0);
  const hrPayloadRef = useRef([]);
  const [msgs, setMsgs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [aiQCount, setAiQCount] = useState(0);
  const [hist, setHist] = useState([]);
  const [ended, setEnded] = useState(false);
  const endedRef = useRef(false);
  useEffect(() => {
    endedRef.current = ended;
  }, [ended]);
  const abandonNotifiedRef = useRef(false);
  const sessionMountRef = useRef(Date.now());
  useEffect(() => {
    sessionMountRef.current = Date.now();
    abandonNotifiedRef.current = false;
    hrIntroDoneRef.current = false;
    aiBootRef.current = false;
    hrTranslateCacheRef.current = {};
    setPhaseIdx(0);
    setInterviewStarted(false);
  }, [applicationId]);
  const visHideTimerRef = useRef(null);
  const applicationIdRef = useRef(applicationId);
  useEffect(() => {
    applicationIdRef.current = applicationId;
  }, [applicationId]);
  const onAbandonRef = useRef(onAbandon);
  useEffect(() => {
    onAbandonRef.current = onAbandon;
  }, [onAbandon]);
  const [supported, setSupported] = useState(true);
  const [micError, setMicError] = useState("");
  const [showText, setShowText] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [voices, setVoices] = useState([]);
  const recRef = useRef(null);
  const txRef = useRef("");
  const spokenAnswerCommittedRef = useRef(false);
  const suppressSpeechFinalizeRef = useRef(false);
  const busyRef = useRef(false);
  const dispatchAnswerRef = useRef(async (_t) => {});
  const finalizeSpokenAnswerRef = useRef(() => {});
  const SPEECH_FINALIZE_MS = 220;
  const SILENCE_SUBMIT_MS = 3000;
  const aiBootRef = useRef(false);
  const hrIntroDoneRef = useRef(false);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const autoListenActiveRef = useRef(false);
  const hadSpeechRef = useRef(false);
  const silenceTimerRef = useRef(null);
  const listeningRef = useRef(false);
  /** True only when silence timer called rec.stop(); onend should finalize, not restart. */
  const intentionalStopRef = useRef(false);
  /** Prefix text before a mid-answer recognition restart (browser session limit). */
  const accumulatedAnswerRef = useRef("");
  const hrTranslateCacheRef = useRef({});
  const startAutoListenAfterQuestionRef = useRef(() => {});
  const langMap = { English: "en-IN", Hindi: "hi-IN", Bengali: "bn-IN", Tamil: "ta-IN", Telugu: "te-IN", Kannada: "kn-IN", Marathi: "mr-IN", Gujarati: "gu-IN", Malayalam: "ml-IN" };
  const langCode = langMap[context.language] || "en-IN";
  const buildSysAi = (scr) => {
    const topics = (scr?.doNotRepeatTopics || []).slice(0, 30).map((t, i) => (i + 1) + ". " + t).join("\n");
    const desc = scr?.jobDescription || context.jd?.description || "";
    const req = scr?.jobRequirements || context.jd?.requirements || "";
    const difficulty = ["easy", "medium", "hard"].includes(scr?.aiDifficulty) ? scr.aiDifficulty : AI_DIFFICULTY;
    const total = Math.min(30, Math.max(1, Number(scr?.aiFollowUpCount) || MAX_AI));
    const difficultyBlock = {
      easy: "Difficulty: EASY. Ask straightforward role basics — definitions, daily duties, fundamental tools, simple scenarios. Keep questions accessible to candidates with limited experience. Avoid multi-step problems and edge cases.",
      medium: "Difficulty: MEDIUM. Ask standard role competency questions — situational judgement, moderate-complexity scenarios, single-step problem solving, common pitfalls. Probe both knowledge and applied judgement.",
      hard: "Difficulty: HARD. Ask senior-level scenario-based questions — multi-step problems, edge cases, deep technical probing, behavioural STAR with complications. Press on trade-offs, decision-making under constraints, and ownership.",
    }[difficulty];
    return `You are Swar, a warm HR interviewer. Voice interview for "${context.jd.title}" with ${context.candidateName}. Speak in ${context.language}. <30 words per turn. NO markdown. Ask ONE role-specific question per turn about skills, experience, or scenarios for THIS job only.

${difficultyBlock}

You will ask ${total} role-specific follow-up questions in total. Cover DISTINCT facets each turn (e.g. technical depth, hands-on tools, scenario judgement, collaboration, problem-solving under constraints, role-specific edge cases, behaviour under pressure, communication with stakeholders, ownership and trade-offs). Do not cluster on one topic; rotate facets across turns and go progressively deeper.

Already asked (NEVER repeat or rephrase):
${topics || "(none)"}

Job description: ${desc}
Requirements: ${req}

Do NOT ask: introduce yourself, tell me about yourself, why this company, name confirmation, or any topic already covered above.
After ${total} follow-up questions, end with [INTERVIEW_COMPLETE].`;
  };
  const translateHrScriptLine = useCallback(
    async (raw) => {
      const t = (raw == null ? "" : String(raw)).trim();
      if (!t) return t;
      const target = (context.language || "English").trim();
      if (/^english$/i.test(target)) return t;
      if (typeof window !== "undefined" && !window.CLAUDE_API_URL) return t;
      const key = target + "\n" + t;
      const c = hrTranslateCacheRef.current;
      if (c[key]) return c[key];
      const system = `You translate job interview questions for text-to-speech. Output ONLY the translated question in ${target}. No title, no quotes, no explanation, no markdown. Preserve proper names, product names, and acronyms where natural in ${target}. If the text is already in ${target}, return it unchanged.`;
      try {
        const out = await callClaude([{ role: "user", content: "Translate this interview question:\n\n" + t }], system);
        const cleaned = (out || "").replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim() || t;
        c[key] = cleaned;
        return cleaned;
      } catch (e) {
        return t;
      }
    },
    [context.language],
  );
  const safeAbandon = async (detail) => {
    if (abandonNotifiedRef.current || !applicationId) return;
    const fn = onAbandonRef.current;
    if (typeof fn !== "function") return;
    abandonNotifiedRef.current = true;
    try {
      await fn(detail || "");
    } catch (_) {}
  };
  useEffect(() => {
    const h = () => {
      if (endedRef.current || !applicationId) return;
      void safeAbandon("page_leave");
    };
    window.addEventListener("pagehide", h);
    return () => window.removeEventListener("pagehide", h);
  }, [applicationId]);
  useEffect(() => {
    const h = () => {
      if (endedRef.current || !applicationId) return;
      void safeAbandon("network_offline");
    };
    window.addEventListener("offline", h);
    return () => window.removeEventListener("offline", h);
  }, [applicationId]);
  useEffect(() => {
    const clearT = () => {
      if (visHideTimerRef.current) {
        clearTimeout(visHideTimerRef.current);
        visHideTimerRef.current = null;
      }
    };
    const onVis = () => {
      clearT();
      if (endedRef.current || !applicationId) return;
      if (document.visibilityState === "hidden") {
        const aidSnapshot = applicationIdRef.current;
        visHideTimerRef.current = setTimeout(() => {
          visHideTimerRef.current = null;
          if (document.visibilityState !== "hidden") return;
          if (endedRef.current || !aidSnapshot) return;
          if (applicationIdRef.current !== aidSnapshot) return;
          void safeAbandon("visibility_hidden");
        }, 12000);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearT();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [applicationId]);
  useEffect(() => {
    return () => {
      if (!applicationId) return;
      if (Date.now() - sessionMountRef.current < 800) return;
      if (endedRef.current) return;
      void safeAbandon("component_unmount");
    };
  }, [applicationId]);
  useEffect(() => { const load = () => setVoices(window.speechSynthesis?.getVoices?.() || []); load(); if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = load; }, []);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setSupported(false); setShowText(true); return; }
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = langCode;
    rec.onresult = (e) => {
      let sessionT = "";
      for (let i = 0; i < e.results.length; i++) sessionT += e.results[i][0].transcript;
      const prefix = accumulatedAnswerRef.current ? accumulatedAnswerRef.current + " " : "";
      const merged = (prefix + sessionT).trim();
      setTranscript(merged);
      txRef.current = merged;
      if (merged) hadSpeechRef.current = true;
      if (autoListenActiveRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          if (!autoListenActiveRef.current || !listeningRef.current) return;
          if (!hadSpeechRef.current) return;
          intentionalStopRef.current = true;
          autoListenActiveRef.current = false;
          try { rec.stop(); } catch (_) {}
        }, SILENCE_SUBMIT_MS);
      }
    };
    rec.onend = () => {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
      if (suppressSpeechFinalizeRef.current) {
        setListening(false);
        autoListenActiveRef.current = false;
        intentionalStopRef.current = false;
        return;
      }
      if (autoListenActiveRef.current && !intentionalStopRef.current && !spokenAnswerCommittedRef.current) {
        const full = (txRef.current || "").trim();
        if (full) {
          accumulatedAnswerRef.current = full;
          hadSpeechRef.current = true;
        }
        try {
          rec.start();
          setListening(true);
          return;
        } catch (_) {
          setListening(false);
          autoListenActiveRef.current = false;
          intentionalStopRef.current = false;
          setTimeout(() => finalizeSpokenAnswerRef.current(), SPEECH_FINALIZE_MS);
          return;
        }
      }
      intentionalStopRef.current = false;
      setListening(false);
      autoListenActiveRef.current = false;
      setTimeout(() => finalizeSpokenAnswerRef.current(), SPEECH_FINALIZE_MS);
    };
    rec.onerror = (e) => {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
      setListening(false);
      autoListenActiveRef.current = false;
      intentionalStopRef.current = false;
      if (e.error === "not-allowed") setMicError("Mic denied.");
      else if (e.error === "no-speech") setMicError("No speech.");
      else if (e.error !== "aborted") setMicError("Speech error.");
    };
    recRef.current = rec;
    return () => {
      suppressSpeechFinalizeRef.current = true;
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
      try { rec.abort(); } catch {}
    };
  }, [langCode]);
  const speak = (text) => new Promise((resolve) => {
    if (!text || !window.speechSynthesis) { resolve(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = langCode;
    u.rate = 0.91;
    u.pitch = 1.02;
    const v = pickFemaleFirstSpeechVoice(langCode, voices);
    if (v) u.voice = v;
    u.onstart = () => setSpeaking(true);
    u.onend = () => { setSpeaking(false); resolve(); };
    u.onerror = () => { setSpeaking(false); resolve(); };
    window.speechSynthesis.speak(u);
  });
  useEffect(() => {
    if (!applicationId) {
      setPhase("load");
      setScript(null);
      return;
    }
    let cancelled = false;
    setPhase("load");
    fetch(`/api/voice-bot/interview-script/${applicationId}`, { headers: { ...authHeaders() } })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => {
        if (!cancelled) {
          setScript(d);
          setPhaseIdx(0);
          setPhase(initialPhaseFromScript(d));
          fetch("/api/voice-bot/interview-session-start", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ applicationId }),
          }).catch(() => {});
        }
      })
      .catch(() => { if (!cancelled) setPhase("err"); });
    return () => { cancelled = true; };
  }, [applicationId]);
  useEffect(() => {
    if (applicationId) return;
    const t = setTimeout(() => {
      setPhase((prev) => (prev === "load" ? "err" : prev));
    }, RESOLVE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [applicationId]);
  useEffect(() => {
    if (!isScriptedPhase(phase) || !interviewStarted || !script) return;
    if (phaseIdx !== 0) return;
    const qs = getScriptedList(script, phase);
    if (!qs.length) return;
    let cancelled = false;
    (async () => {
      await new Promise((r) => setTimeout(r, 400));
      if (cancelled) return;
      if (hrIntroDoneRef.current) return;
      hrIntroDoneRef.current = true;
      const q0 = qs[0];
      setBusy(true);
      let toSpeak = q0.question;
      try {
        toSpeak = await translateHrScriptLine(q0.question);
      } catch (_) {}
      if (cancelled) {
        setBusy(false);
        return;
      }
      setBusy(false);
      setMsgs((p) => [...p, { role: "ai", text: toSpeak, tag: phase }]);
      await speak(toSpeak);
      if (!cancelled) startAutoListenAfterQuestionRef.current();
    })();
    return () => { cancelled = true; if (window.speechSynthesis) window.speechSynthesis.cancel(); };
  }, [phase, script, interviewStarted, translateHrScriptLine, phaseIdx]);
  useEffect(() => {
    if (!script || phase === "load" || phase === "err" || phase === "ai") return;
    const qs = getScriptedList(script, phase);
    if (qs.length > 0) return;
    hrIntroDoneRef.current = false;
    if (phase === "opening") { setPhaseIdx(0); setPhase("hr"); }
    else if (phase === "hr") { setPhaseIdx(0); setPhase((script.closing || []).length ? "closing" : "ai"); }
    else if (phase === "closing") {
      setEnded(true);
      const transcriptOut = msgs.map((m) => ({ role: m.role, text: m.text }));
      setTimeout(() => onEnd(transcriptOut), 450);
    }
  }, [phase, script]);
  useEffect(() => {
    if (!isScriptedPhase(phase)) return;
    hrIntroDoneRef.current = false;
  }, [phase]);
  useEffect(() => {
    if (phase !== "ai") return;
    let cancelled = false;
    (async () => {
      await new Promise((r) => setTimeout(r, 300));
      if (cancelled) return;
      if (aiBootRef.current) return;
      aiBootRef.current = true;
      setBusy(true);
      const r0 = await callClaude([{ role: "user", content: "Start." }], buildSysAi(script));
      if (cancelled) return;
      const clean = r0.replace("[INTERVIEW_COMPLETE]", "").trim();
      setMsgs((p) => [...p, { role: "ai", text: clean, tag: "ai" }]);
      setHist([{ role: "user", content: "Start." }, { role: "assistant", content: r0 }]);
      setBusy(false);
      await speak(clean);
      if (!cancelled) startAutoListenAfterQuestionRef.current();
    })();
    return () => { cancelled = true; };
  }, [phase]);
  const startAutoListenAfterQuestion = () => {
    if (!recRef.current || endedRef.current) return;
    suppressSpeechFinalizeRef.current = false;
    spokenAnswerCommittedRef.current = false;
    hadSpeechRef.current = false;
    intentionalStopRef.current = false;
    accumulatedAnswerRef.current = "";
    autoListenActiveRef.current = true;
    clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
    setTranscript("");
    txRef.current = "";
    setMicError("");
    setListening(true);
    try {
      recRef.current.start();
    } catch (_) {
      setListening(false);
      autoListenActiveRef.current = false;
    }
  };
  startAutoListenAfterQuestionRef.current = startAutoListenAfterQuestion;
  const postScriptedAnswers = async (finalize) => {
    try {
      await fetch("/api/voice-bot/interview-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ applicationId, answers: hrPayloadRef.current, finalizeInterview: !!finalize }),
      });
    } catch (e) { console.error(e); }
  };
  const dispatchAnswer = async (text) => {
    const answer = (text || "").trim();
    if (!answer || busy || ended) return;
    accumulatedAnswerRef.current = "";
    setTranscript(""); txRef.current = ""; setTextInput(""); setMicError("");
    if (isScriptedPhase(phase) && script) {
      const qs = getScriptedList(script, phase);
      if (!qs.length) return;
      const cur = qs[phaseIdx];
      setMsgs((p) => [...p, { role: "user", text: answer, tag: phase }]);
      hrPayloadRef.current.push({
        questionId: cur.id > 0 ? cur.id : null,
        questionText: cur.question,
        answerText: answer,
        audioUrl: null,
        durationSeconds: null,
      });
      const nextIdx = phaseIdx + 1;
      if (nextIdx < qs.length) {
        setPhaseIdx(nextIdx);
        hrIntroDoneRef.current = false;
        setBusy(true);
        const nq = qs[nextIdx];
        let toSpeak = nq.question;
        try {
          toSpeak = await translateHrScriptLine(nq.question);
        } catch (_) {}
        setMsgs((p) => [...p, { role: "ai", text: toSpeak, tag: phase }]);
        setBusy(false);
        await speak(toSpeak);
        startAutoListenAfterQuestion();
      } else if (phase === "opening") {
        setPhaseIdx(0);
        hrIntroDoneRef.current = false;
        setPhase("hr");
      } else if (phase === "hr") {
        setBusy(true);
        await postScriptedAnswers(false);
        setBusy(false);
        aiBootRef.current = false;
        setPhase("ai");
      } else if (phase === "closing") {
        setBusy(true);
        await postScriptedAnswers(true);
        setBusy(false);
        let transcriptOut = null;
        setMsgs((p) => {
          const next = [...p];
          transcriptOut = next.map((m) => ({ role: m.role, text: m.text }));
          return next;
        });
        setEnded(true);
        setTimeout(() => onEnd(transcriptOut || msgs.map((m) => ({ role: m.role, text: m.text }))), 450);
      }
      return;
    }
    if (phase === "ai") {
      const prevAiQCount = aiQCount;
      const h = [...hist, { role: "user", content: answer }];
      setBusy(true);
      const r = await callClaude(h, buildSysAi(script));
      const clean = r.replace("[INTERVIEW_COMPLETE]", "").trim();
      setHist([...h, { role: "assistant", content: r }]);
      setAiQCount((c) => c + 1);
      const nextUserTurnCount = prevAiQCount + 1;
      setBusy(false);
      let transcriptOut = null;
      setMsgs((p) => {
        const next = [...p, { role: "user", text: answer, tag: "ai" }, { role: "ai", text: clean, tag: "ai" }];
        transcriptOut = next.map((m) => ({ role: m.role, text: m.text }));
        return next;
      });
      await speak(clean);
      if (nextUserTurnCount >= MAX_AI && transcriptOut) {
        const closingQs = getScriptedList(script, "closing");
        if (closingQs.length) {
          setPhase("closing");
          setPhaseIdx(0);
          hrIntroDoneRef.current = false;
        } else {
          await postScriptedAnswers(true);
          setEnded(true);
          setTimeout(() => onEnd(transcriptOut), 450);
        }
      } else {
        startAutoListenAfterQuestion();
      }
    }
  };
  dispatchAnswerRef.current = dispatchAnswer;
  const finalizeSpokenAnswer = () => {
    if (suppressSpeechFinalizeRef.current || spokenAnswerCommittedRef.current) return;
    if (busyRef.current || endedRef.current) return;
    const a = (txRef.current || "").trim();
    if (!a) {
      setMicError("No speech.");
      return;
    }
    spokenAnswerCommittedRef.current = true;
    void dispatchAnswerRef.current(a);
  };
  finalizeSpokenAnswerRef.current = finalizeSpokenAnswer;
  const sendAnswer = (text) => dispatchAnswer(text);
  const endInterview = async () => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    suppressSpeechFinalizeRef.current = true;
    autoListenActiveRef.current = false;
    intentionalStopRef.current = false;
    accumulatedAnswerRef.current = "";
    clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
    if (recRef.current) { try { recRef.current.abort(); } catch {} }
    if (!ended && applicationId && typeof onAbandon === "function") {
      await safeAbandon("candidate_clicked_end");
      return;
    }
    onEnd(msgs);
  };
  const lastQ = [...msgs].reverse().find((m) => m.role === "ai");
  const scriptedQs = isScriptedPhase(phase) ? getScriptedList(script, phase) : [];
  const scriptedTotal = scriptedQs.length;
  const phaseLabel = phase === "opening" ? `Introduction · ${Math.min(phaseIdx + 1, scriptedTotal)}/${scriptedTotal || "—"}` : phase === "hr" ? `Role-specific · ${Math.min(phaseIdx + 1, scriptedTotal)}/${scriptedTotal || "—"}` : phase === "closing" ? `Closing · ${Math.min(phaseIdx + 1, scriptedTotal)}/${scriptedTotal || "—"}` : phase === "ai" ? `Follow-up · ${aiQCount}/${MAX_AI}` : "";
  if (phase === "load") {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8">
        <div className="w-10 h-10 border-4 border-indigo-800 border-t-indigo-400 rounded-full animate-spin mb-4"/>
        <p className="text-slate-400 text-sm">{!applicationId ? "Resolving application…" : "Loading interview script…"}</p>
      </div>
    );
  }
  if (phase === "err") {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center">
        <p className="text-red-300 mb-4 text-sm">Could not start interview (missing application or script).</p>
        <button type="button" onClick={() => onEnd([])} className="px-5 py-2 bg-slate-700 text-white rounded-xl text-sm font-bold">Exit</button>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3"><div className={`w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center font-black text-white ${speaking ? "animate-pulse" : ""}`}>S</div><div><p className="font-bold text-white text-sm">Swar Voice Interview</p><p className="text-xs text-indigo-300">{context.language} · {phaseLabel}</p></div></div>
        <button type="button" onClick={endInterview} className="px-3 py-1.5 bg-red-900/40 text-red-300 rounded-lg text-xs font-bold border border-red-800/50">End</button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-3xl mx-auto w-full">
        <div className="mb-6 relative">
          <div className={`w-40 h-40 rounded-full flex items-center justify-center text-white text-5xl font-black transition-all duration-500 shadow-2xl ${listening ? "bg-gradient-to-br from-red-500 to-rose-600 scale-105" : "bg-gradient-to-br from-indigo-500 to-purple-600"} ${speaking ? "scale-110" : ""}`}>{speaking ? "🔊" : listening ? "🎤" : "S"}</div>
          {speaking && <div className="absolute inset-0 rounded-full border-4 border-indigo-400 animate-ping opacity-40"/>}
          {listening && <div className="absolute inset-0 rounded-full border-4 border-red-400 animate-ping opacity-50"/>}
        </div>
        <div className="text-center mb-6 min-h-[3rem]">
          {busy && <p className="text-indigo-300 text-sm animate-pulse">Swar is thinking…</p>}
          {speaking && !busy && <p className="text-indigo-300 text-sm">🔊 Swar is speaking</p>}
          {listening && <p className="text-red-300 text-sm animate-pulse">🎤 Listening…</p>}
          {!busy && !speaking && !listening && !ended && isScriptedPhase(phase) && getScriptedList(script, phase).length > 0 && !interviewStarted && (
            <p className="text-slate-400 text-sm max-w-md mx-auto">Press Start once — after each question, speak your answer; it sends after {SILENCE_SUBMIT_MS / 1000}s of silence.</p>
          )}
          {ended && <p className="text-green-300 text-sm">✓ Complete</p>}
          {micError && <p className="text-amber-400 text-xs mt-1">{micError}</p>}
        </div>
        {lastQ && <div className="max-w-xl w-full bg-slate-800 border border-slate-700 rounded-2xl p-5 mb-4 text-center"><p className="text-xs uppercase font-black text-indigo-400 mb-2">Question</p><p className="text-white text-base">{lastQ.text}</p></div>}
        {(transcript || listening) && <div className="max-w-xl w-full bg-red-900/20 border border-red-800/50 rounded-2xl p-4 mb-4"><p className="text-xs uppercase font-black text-red-300 mb-1">Your answer</p><p className="text-white">{transcript || <span className="text-slate-500 italic">Speak now…</span>}</p></div>}
        {!ended && supported && isScriptedPhase(phase) && getScriptedList(script, phase).length > 0 && !interviewStarted && (
          <div className="flex flex-col items-center gap-3 my-4">
            <button
              type="button"
              onClick={() => setInterviewStarted(true)}
              disabled={busy}
              className="px-10 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-black text-lg shadow-2xl"
            >
              Start interview
            </button>
          </div>
        )}
        {showText && !ended && (
          <div className="max-w-xl w-full mt-4 flex gap-2">
            <input value={textInput} onChange={(e) => setTextInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendAnswer(textInput)} placeholder="Type answer…" disabled={busy} className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"/>
            <button type="button" onClick={() => sendAnswer(textInput)} disabled={!textInput.trim() || busy} className="px-5 py-3 bg-indigo-600 text-white font-bold rounded-xl text-sm disabled:bg-slate-700">Send</button>
          </div>
        )}
        {supported && !showText && !ended && (!isScriptedPhase(phase) || interviewStarted) && (
          <button type="button" onClick={() => setShowText(true)} className="text-slate-500 text-xs mt-3 underline">Type instead</button>
        )}
        {!supported && <div className="bg-amber-900/30 border border-amber-700 rounded-xl p-4 text-center text-amber-200 text-sm max-w-md">⚠ Browser doesn't support voice. Use text.</div>}
      </div>
    </div>
  );
}

function Done({ onDash, isHR }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center">
      <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 text-3xl">✓</div>
      <h1 className="text-3xl font-black text-slate-900 mb-2">Interview Completed</h1>
      <p className="text-slate-500 mb-5 max-w-md">Transcript recorded.</p>
      <button onClick={onDash} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold">{isHR ? "HR Dashboard" : "Dashboard"}</button>
    </div>
  );
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

function Analysis({ context, transcript, savedAnalysis, roleTabs, selectedApplicationId, onSelectApplication, initialRemarks, onDecision, onBack, onLogout, hrDecisionAllowed = true }) {
  const [data, setData] = useState(null), [busy, setBusy] = useState(true), [err, setErr] = useState(null), [remarks, setRemarks] = useState(initialRemarks || "");
  const autoClaudeConsumedRef = useRef(false);
  const tabs = roleTabs || [];
  const showRoleTabs = tabs.length > 0 && typeof onSelectApplication === "function";

  useEffect(() => {
    setRemarks(initialRemarks || "");
  }, [initialRemarks, selectedApplicationId]);

  useEffect(() => {
    const noTx = !transcript || !transcript.length;
    if (noTx) {
      setBusy(false);
      setErr(null);
      setData({
        summary:
          "No AI interview transcript is stored for this role yet. Complete or schedule a voice interview to generate automated scores.",
        tech: null,
        comm: null,
        rec: "Pending review",
        strengths: [],
        areas: [],
        noTranscript: true,
        pendingManualGenerate: false,
      });
      return undefined;
    }

    if (savedAnalysisIsRenderable(savedAnalysis)) {
      setBusy(false);
      setErr(null);
      setData({ ...normalizeSavedAnalysis(savedAnalysis), pendingManualGenerate: false });
      return undefined;
    }

    if (!autoClaudeConsumedRef.current) {
      autoClaudeConsumedRef.current = true;
      let cancelled = false;
      setBusy(true);
      setErr(null);
      setData(null);
      (async () => {
        try {
          const r = await callClaude(analysisInterviewMessages(transcript, context.jd.title), "Return only JSON.", true);
          if (!cancelled) {
            if (r) setData({ ...r, noTranscript: false, pendingManualGenerate: false });
            else setErr("Could not parse.");
          }
        } catch (e) {
          if (!cancelled) setErr(e.message);
        } finally {
          if (!cancelled) setBusy(false);
        }
      })();
      return () => { cancelled = true; };
    }

    setBusy(false);
    setErr(null);
    setData({
      summary:
        "AI summary has not been generated for this role yet. Use “Generate AI summary” below (optional).",
      tech: null,
      comm: null,
      rec: "Pending review",
      strengths: [],
      areas: [],
      noTranscript: false,
      pendingManualGenerate: true,
    });
    return undefined;
  }, [JSON.stringify(transcript), context.jd.title, JSON.stringify(savedAnalysis), selectedApplicationId]);

  const handleManualGenerate = async () => {
    if (!transcript || !transcript.length) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await callClaude(analysisInterviewMessages(transcript, context.jd.title), "Return only JSON.", true);
      if (r) setData({ ...r, noTranscript: false, pendingManualGenerate: false });
      else setErr("Could not parse.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (busy) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Spin label="Generating analysis…"/></div>;
  if (!data) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-center p-8 bg-white rounded-2xl"><p className="text-red-500 mb-4 text-sm">{err}</p><button type="button" onClick={handleManualGenerate} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl mr-2">Retry</button><button onClick={onBack} className="px-5 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl">Back</button></div></div>;
  const recC = { "Strong Hire": "bg-green-500", "Hire": "bg-blue-500", "Weak Hire": "bg-amber-500", "No Hire": "bg-red-500", "Pending review": "bg-slate-500" };
  const decisionPayload = (() => {
    const { pendingManualGenerate: _p, ...rest } = data;
    return { ...rest, noTranscript: Boolean(data.noTranscript) };
  })();
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-indigo-900 text-white px-6 py-8"><div className="max-w-4xl mx-auto flex items-start justify-between flex-wrap gap-3"><div><h2 className="text-3xl font-black mb-1">{context.candidateName}</h2><p className="text-indigo-200 text-sm">{context.jd.title}</p></div><div className="flex items-center gap-3"><span className={`px-4 py-2 rounded-xl text-white font-black text-sm ${recC[data.rec] || "bg-blue-500"}`}>{data.rec}</span><button onClick={onLogout} className="text-indigo-300 text-sm">Logout</button></div></div></div>
      {showRoleTabs ? (
        <div className="max-w-4xl mx-auto px-6 pt-4 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.applicationId}
              type="button"
              onClick={() => onSelectApplication(t.applicationId)}
              className={`px-4 py-2 rounded-full text-sm font-bold border transition-colors ${selectedApplicationId === t.applicationId ? "bg-indigo-600 text-white border-indigo-600 shadow-md" : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {data.pendingManualGenerate ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-amber-950">No AI summary stored for this role yet. Generate one to populate scores and narrative (optional).</p>
            <button type="button" onClick={handleManualGenerate} disabled={busy} className="px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl whitespace-nowrap disabled:opacity-50 shrink-0">Generate AI summary</button>
          </div>
        ) : null}
        {err ? <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700">{err}</div> : null}
        <div className="bg-white rounded-2xl border border-slate-100 p-6"><h3 className="text-xs font-black text-slate-400 uppercase mb-3">Summary</h3><p className="text-slate-700">{data.summary}</p></div>
        {data.tech != null && data.comm != null ? (
          <div className="grid grid-cols-2 gap-4">{[["Technical", data.tech, "#6366f1"], ["Communication", data.comm, "#14b8a6"]].map(([l, v, col]) => <div key={l} className="bg-white rounded-2xl border border-slate-100 p-5"><p className="text-xs font-bold text-slate-400 mb-3">{l}</p><div className="flex items-center gap-3"><div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${v * 10}%`, backgroundColor: col }}/></div><span className="font-black text-slate-800 text-lg">{v}/10</span></div></div>)}</div>
        ) : null}
        {(data.strengths || []).length > 0 || (data.areas || []).length > 0 ? (
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-100 p-6"><h3 className="text-xs font-black text-green-600 uppercase mb-4">Strengths</h3><ul className="space-y-2">{(data.strengths || []).map((s, i) => <li key={i} className="flex gap-2 text-sm text-slate-700"><span className="text-green-500 font-bold">•</span>{s}</li>)}</ul></div>
            <div className="bg-white rounded-2xl border border-slate-100 p-6"><h3 className="text-xs font-black text-amber-600 uppercase mb-4">Improvements</h3><ul className="space-y-2">{(data.areas || []).map((a, i) => <li key={i} className="flex gap-2 text-sm text-slate-700"><span className="text-amber-500 font-bold">•</span>{a}</li>)}</ul></div>
          </div>
        ) : null}
        {!hrDecisionAllowed ? (
          <div className="bg-slate-100 border border-slate-200 rounded-2xl p-5 text-sm text-slate-700">
            <p className="font-bold text-slate-900 mb-1">HR decision locked</p>
            <p className="text-slate-600">Reject / Shortlist unlocks only after the candidate completes the voice interview for this role (interviewed).</p>
          </div>
        ) : (
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h3 className="text-xs font-black text-slate-400 uppercase mb-3">HR Decision</h3>
          <textarea rows={3} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Final remarks…" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none mb-4"/>
          <div className="flex gap-3"><button type="button" onClick={() => onDecision("REJECTED", remarks, decisionPayload)} className="flex-1 py-3 border-2 border-red-100 text-red-600 font-bold rounded-xl">Reject</button><button type="button" onClick={() => onDecision("SHORTLISTED", remarks, decisionPayload)} className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl">Shortlist ✓</button></div>
        </div>
        )}
        <button type="button" onClick={onBack} className="w-full py-3 border border-slate-200 text-slate-500 font-bold rounded-xl">← Back</button>
      </div>
    </div>
  );
}

function CandDash({ candidate, jobs, portalFocusJobId, onPortalFocusJob, onApply, onTalentPool, onInterview, onRights, onLogout, talentPoolSelected, onSync, scheduleFlash = null }) {
  const focusJobId = portalFocusJobId || candidate.jobId;
  const jobIdsOrdered = (() => {
    const out = [];
    const seen = new Set();
    for (const a of candidate.applicationHistory || []) {
      if (a.jobId && !seen.has(a.jobId)) {
        seen.add(a.jobId);
        out.push(a.jobId);
      }
    }
    if (candidate.jobId && !seen.has(candidate.jobId)) out.push(candidate.jobId);
    return out;
  })();
  const job = jobs.find((j) => j.id === focusJobId);
  const latestApp = job ? getLatestAppForJob(candidate.applicationHistory, focusJobId) : null;
  const iv = job ? interviewEligibleForJob(candidate, focusJobId) : { ok: false };
  const roleLab = focusJobId ? portalStatusLabel(candidate, focusJobId) : "—";
  const hrNote =
    latestApp?.hrRemarks != null && String(latestApp.hrRemarks).trim()
      ? String(latestApp.hrRemarks).trim()
      : "";
  const [rrCode, setRrCode] = useState("TECH_NETWORK");
  const [rrText, setRrText] = useState("");
  const [rrBusy, setRrBusy] = useState(false);
  const canRequestReattempt = latestApp ? applicationEligibleForTechnicalReattemptRequest(latestApp) : false;
  const submitReattempt = async () => {
    if (!latestApp?.applicationId) return;
    setRrBusy(true);
    try {
      const r = await fetch("/api/voice-bot/reattempt-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          applicationId: latestApp.applicationId,
          candidateReasonCode: rrCode,
          candidateReasonText: rrText.trim(),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        window.alert(j.error || "Could not submit request");
      } else {
        window.alert("Request submitted. HR will review and you will be notified here when approved.");
        setRrText("");
        if (typeof onSync === "function") await onSync();
      }
    } finally {
      setRrBusy(false);
    }
  };
  const canInterviewBtn =
    (roleLab === "SHORTLISTED" || roleLab === "APPLIED" || roleLab === "SCHEDULED") && iv.ok;
  const showInterviewBlock =
    (roleLab === "SHORTLISTED" || roleLab === "APPLIED" || roleLab === "SCHEDULED" || roleLab === "REATTMPT") && !iv.ok;
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3"><div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-black text-sm">S</div><span className="font-bold">Candidate Portal</span><Badge/></div>
        <div className="flex gap-2"><button type="button" onClick={onRights} className="px-3 py-1.5 border border-slate-600 text-slate-300 rounded-lg text-xs font-bold">🔒 Rights</button><button type="button" onClick={onLogout} className="text-slate-400 text-sm px-3">Logout</button></div>
      </div>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-5"><div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black">{candidate.name[0]}</div><div><h1 className="text-2xl font-black text-slate-900">{candidate.name}</h1><p className="text-slate-500 text-sm">{candidate.email}</p></div></div>
        {jobIdsOrdered.length > 0 ? (
          <div className="mb-4">
            <p className="text-xs font-black text-slate-400 uppercase mb-2">Your applications</p>
            <div className="flex flex-wrap gap-2">
              {jobIdsOrdered.map((jid) => {
                const j = jobs.find((x) => x.id === jid);
                const lab = portalStatusLabel(candidate, jid);
                const sel = jid === focusJobId;
                return (
                  <button
                    key={jid}
                    type="button"
                    onClick={() => typeof onPortalFocusJob === "function" && onPortalFocusJob(jid)}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-full border text-sm font-bold transition-all ${sel ? "bg-indigo-600 text-white border-indigo-600 shadow-md" : "bg-white text-slate-800 border-slate-200 hover:border-indigo-300"}`}
                  >
                    <span>{j?.title || jid}</span>
                    <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full ${SB[lab] || "bg-slate-100 text-slate-600"}`}>{lab}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {job ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-4">
            <p className="text-xs font-black text-slate-400 uppercase mb-3">Selected role</p>
            <div className="flex items-start justify-between mb-4 flex-wrap gap-2"><div><h2 className="text-xl font-bold text-slate-900">{job.title}</h2><p className="text-slate-500 text-sm">{job.designation} · {job.location}</p></div><span className={`text-xs font-black uppercase px-3 py-1.5 rounded-lg ${SB[roleLab] || "bg-slate-100"}`}>{roleLab}</span></div>
            {hrNote ? (
              <div className="bg-slate-50 rounded-xl p-4 mb-4"><p className="text-xs font-bold text-slate-400 mb-1">HR Remarks</p><p className="text-slate-700 text-sm italic">&quot;{hrNote}&quot;</p></div>
            ) : null}
            {getLatestAppForJob(candidate.applicationHistory, focusJobId)?.interviewScheduledAt ? (
              <p className={`text-xs font-bold text-teal-700 ${scheduleFlash && scheduleFlash.jobId === focusJobId && scheduleFlash.rescheduled ? "mb-1" : "mb-3"}`}>📅 Scheduled: {fmtDateTime(getLatestAppForJob(candidate.applicationHistory, focusJobId).interviewScheduledAt)}</p>
            ) : null}
            {scheduleFlash && scheduleFlash.jobId === focusJobId && scheduleFlash.rescheduled ? (
              <p className="text-xs font-semibold text-indigo-700 mb-3">* Rescheduled to {fmtDateTime(scheduleFlash.at)}</p>
            ) : null}
            {latestApp?.interviewCompletionStatus === "incomplete_technical" ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-xs text-amber-900">
                <p className="font-bold">Incomplete – technical / session issue</p>
                <p className="mt-1 text-amber-800">If the interview stopped due to network, mic, or device problems, you can request one reattempt after HR approves.</p>
              </div>
            ) : null}
            {latestApp?.reattemptRequestStatus === "pending" ? (
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 mb-3 text-xs text-slate-700 font-semibold">✓ Under Review — reattempt request pending HR approval for this role.</div>
            ) : null}
            {latestApp?.reattemptRequestStatus === "approved" && latestApp?.interviewCompletionStatus === "not_started" ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-3 text-xs text-green-800 font-semibold">HR approved a reattempt. You can start the interview again.</div>
            ) : null}
            {latestApp?.reattemptRequestStatus === "rejected" ? (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-3 text-xs text-red-800">Your last reattempt request was not approved for this role. You may submit a new request if your situation changed.</div>
            ) : null}
            {canRequestReattempt ? (
              <div className="bg-white border border-indigo-200 rounded-xl p-4 mb-3 space-y-2">
                <p className="text-xs font-black text-slate-500 uppercase">Request interview reattempt · this role</p>
                <select value={rrCode} onChange={(e) => setRrCode(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {CANDIDATE_REATTEMPT_REASONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <textarea value={rrText} onChange={(e) => setRrText(e.target.value)} rows={2} placeholder="Short details (optional)" className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
                <button type="button" disabled={rrBusy} onClick={submitReattempt} className="w-full py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg disabled:bg-slate-300">{rrBusy ? "Sending…" : "Submit request to HR"}</button>
              </div>
            ) : null}
            {canInterviewBtn ? (
              <button type="button" onClick={() => onInterview(candidate.id)} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl">🎤 Start Voice Interview →</button>
            ) : showInterviewBlock ? (
              <p className="text-xs text-slate-500 mb-2">{iv.reason}</p>
            ) : null}
            {roleLab === "INTERVIEWED" && <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-center mt-3"><p className="text-teal-700 font-bold text-sm">✓ Under Review</p></div>}
            {roleLab === "REJECTED" && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center mt-3"><p className="text-red-700 font-bold text-sm">Not Selected — this role</p></div>}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center mb-4"><p className="text-slate-400 mb-4">No active application.</p><button onClick={onApply} className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl">Browse Jobs</button></div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onApply} className="py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 text-sm">Browse Jobs</button>
          <button type="button" onClick={onTalentPool} className={`py-3 bg-gradient-to-r from-indigo-50 to-purple-50 border text-indigo-700 font-bold rounded-xl text-sm ${talentPoolSelected ? "ring-2 ring-indigo-400 border-indigo-300" : "border-indigo-200"}`}>🌟 Talent Pool</button>
        </div>
      </div>
    </div>
  );
}

function RightsPanel({ candidate, jobs, onUpdate, onErase, onBack, dpo }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center gap-3"><button onClick={onBack} className="text-slate-400 text-sm">← Back</button><span className="font-bold">My Data Rights</span><Badge/></div>
      <div className="max-w-xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-black text-slate-900 mb-4">Your Data Rights (DPDPA 2023)</h1>
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="font-bold text-sm">§11 Right to Access</p><p className="text-xs text-slate-500 mt-1">Status: {candidate.status} · Job: {jobs.find(j => j.id === candidate.jobId)?.title || "N/A"}</p></div>
          <button onClick={() => { onUpdate({ consent: false, status: "WITHDRAWN" }); }} className="w-full bg-white border border-slate-200 rounded-xl p-4 text-left"><p className="font-bold text-sm">§6 Withdraw Consent</p></button>
          <button onClick={() => { if (window.confirm("Erase all data?")) onErase(); }} className="w-full bg-white border border-red-100 rounded-xl p-4 text-left"><p className="font-bold text-sm text-red-600">§12 Right to Erasure</p></button>
        </div>
        <div className="mt-6 text-xs text-slate-500 text-center">Grievance Officer: <b>{(dpo || {}).name || "—"}</b><br/>{(dpo || {}).email || ""}</div>
      </div>
    </div>
  );
}

// ── MAIN APP ─────────────────────────────────────────────────────────────────
export function App() {
  const [step, setStep] = useState("LOADING");
  const [loc, setLoc] = useState(() => ({ path: window.location.pathname, search: window.location.search }));
  const [role, setRole] = useState(null), [hrId, setHrId] = useState(null);
  const [activeId, setActiveId] = useState(null), [selJob, setSelJob] = useState(null), [pending, setPending] = useState([]);
  const [analysisApplicationId, setAnalysisApplicationId] = useState(null);
  const [analysisSessionId, setAnalysisSessionId] = useState(0);
  const [portalFocusJobId, setPortalFocusJobId] = useState(null);
  const [jobs, setJobs] = useState([]), [candidates, setCandidates] = useState([]), [talentPool, setTalentPool] = useState([]), [auditLog, setAuditLog] = useState([]);
  const [hrUsers, setHrUsers] = useState({});
  const [reattemptPendingCount, setReattemptPendingCount] = useState(0);
  const [meta, setMeta] = useState(null);
  const [storageReady, setStorageReady] = useState(false);
  const [canPersist, setCanPersist] = useState(false);
  const [tpFromPortal, setTpFromPortal] = useState(false);
  const saveTimer = useRef(null);
  /** When true, candidate login/register success ignores `returnTo` and goes to `/` (job board). Set only from JobBoardAuth “Login”. Cleared after success or when Apply / Talent Pool sends user to login. */
  const candidateLoginPreferHomeRef = useRef(false);
  /** Guest talent-pool form data + CV; set on TP submit before register, cleared after HR-visible save or abandon. */
  const tpGuestEntryRef = useRef(null);
  /** Prefill CandReg when guest continues from talent pool (stable props for controlled fields). */
  const [tpGuestRegPrefill, setTpGuestRegPrefill] = useState(null);
  /** After scheduling from Intro, highlights job card / portal: `{ jobId, at, rescheduled }`. */
  const [scheduleBoardFlash, setScheduleBoardFlash] = useState(null);

  const navigate = useCallback((url) => {
    window.history.pushState({}, "", url);
    setLoc({ path: window.location.pathname, search: window.location.search });
  }, []);

  useEffect(() => {
    const onPop = () => setLoc({ path: window.location.pathname, search: window.location.search });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!scheduleBoardFlash) return undefined;
    const t = setTimeout(() => setScheduleBoardFlash(null), 180000);
    return () => clearTimeout(t);
  }, [scheduleBoardFlash]);

  const refreshReattemptCount = async () => {
    const tok = localStorage.getItem(LS_TOKEN);
    if (!tok || localStorage.getItem(LS_ROLE) !== "hr") return;
    try {
      const r = await fetch("/api/admin/reattempt-pending-count", { headers: { Authorization: `Bearer ${tok}` } });
      if (r.ok) {
        const j = await r.json();
        setReattemptPendingCount(j.count ?? 0);
      }
    } catch (_) {}
  };
  useEffect(() => {
    refreshReattemptCount();
    const id = setInterval(refreshReattemptCount, 60000);
    return () => clearInterval(id);
  }, [role, storageReady]);

  const refreshHrUsers = async () => {
    const tok = localStorage.getItem(LS_TOKEN);
    if (!tok || localStorage.getItem(LS_ROLE) !== "hr") return;
    try {
      const r = await fetch("/api/admin/hr-users", { headers: { Authorization: `Bearer ${tok}` } });
      if (!r.ok) return;
      const j = await r.json();
      const map = {};
      for (const u of j.users || []) {
        if (u && u.hrId) map[u.hrId] = u.displayName || "";
      }
      setHrUsers(map);
    } catch (_) {}
  };
  useEffect(() => {
    refreshHrUsers();
  }, [role, storageReady]);

  const syncStateFromServer = async () => {
    const r0 = localStorage.getItem(LS_ROLE);
    const jr = await fetch("/api/jobs", { headers: { ...authHeaders() } });
    const jd = jr.ok ? await jr.json() : { jobs: [], meta: null };
    const boardJobs = jd.jobs || [];
    if (r0 === "candidate") {
      const meRes = await fetch("/api/me", { headers: { ...authHeaders() } });
      if (!meRes.ok) throw new Error("state");
      const me = await meRes.json();
      setJobs(boardJobs);
      setCandidates([me]);
      setActiveId(me.id);
      setMeta(jd.meta || null);
      setCanPersist(true);
      refreshReattemptCount();
      return;
    }
    const sr = await fetch("/api/state", { headers: { ...authHeaders() } });
    if (!sr.ok) throw new Error("state");
    const st = await sr.json();
    const sm = Object.fromEntries(
      boardJobs.map((j) => [
        j.id,
        { userStatus: j.userStatus, coolingDaysLeft: j.coolingDaysLeft },
      ]),
    );
    const merged = (st.jobs || []).map((j) => ({
      ...j,
      ...(sm[j.id] || {}),
    }));
    setJobs(merged.length ? merged : boardJobs);
    setCandidates(st.candidates || []);
    setTalentPool(st.talentPool || []);
    setAuditLog(st.auditLog || []);
    setMeta(st.meta || jd.meta || null);
    setCanPersist(true);
    refreshReattemptCount();
  };

  useEffect(() => {
    (async () => {
      let loaded = false;
      let boardJobs = [];
      let boardMeta = null;
      try {
        const jRes = await fetch("/api/jobs", { headers: { ...authHeaders() } });
        if (jRes.ok) {
          const jd = await jRes.json();
          boardJobs = jd.jobs || [];
          boardMeta = jd.meta || null;
        }
        const tok = localStorage.getItem(LS_TOKEN);
        const r0 = localStorage.getItem(LS_ROLE);
        if (tok && r0 === "hr") {
          const sr = await fetch("/api/state", { headers: { ...authHeaders() } });
          if (sr.ok) {
            const st = await sr.json();
            const sm = Object.fromEntries(
              boardJobs.map((j) => [
                j.id,
                { userStatus: j.userStatus, coolingDaysLeft: j.coolingDaysLeft },
              ]),
            );
            const merged = (st.jobs || []).map((j) => ({
              ...j,
              ...(sm[j.id] || {}),
            }));
            setJobs(merged.length ? merged : boardJobs);
            setCandidates(st.candidates || []);
            setTalentPool(st.talentPool || []);
            setAuditLog(st.auditLog || []);
            setMeta(st.meta || boardMeta);
            loaded = true;
            setCanPersist(true);
            const hid = localStorage.getItem(LS_HR_ID);
            if (hid) setHrId(hid);
            setRole("hr");
          } else {
            setJobs(boardJobs);
            setMeta(boardMeta);
            loaded = true;
            setCanPersist(false);
          }
        } else if (tok && r0 === "candidate") {
          const meRes = await fetch("/api/me", { headers: { ...authHeaders() } });
          if (meRes.ok) {
            const me = await meRes.json();
            setJobs(boardJobs);
            setCandidates([me]);
            setMeta(boardMeta);
            loaded = true;
            setCanPersist(true);
            setActiveId(me.id);
            localStorage.setItem(LS_CANDIDATE_ID, me.id);
            setRole("candidate");
          } else {
            setJobs(boardJobs);
            setMeta(boardMeta);
            loaded = true;
            setCanPersist(false);
          }
        } else {
          setJobs(boardJobs);
          setMeta(boardMeta);
          loaded = true;
          setCanPersist(false);
        }
      } catch (e) {
        console.error(e);
        alert("Could not load data from the API. Start the backend (npm start), create the PostgreSQL database, set DATABASE_URL in backend/.env, and run database/schema.sql.");
      } finally {
        if (loaded) setStorageReady(true);
        const rt = parsePath(window.location.pathname, window.location.search);
        const tok = localStorage.getItem(LS_TOKEN);
        const r0 = localStorage.getItem(LS_ROLE);
        if (!loaded) {
          setStep("LOGIN");
        } else if (rt.name === "portal" && (r0 !== "candidate" || !tok)) {
          window.history.replaceState({}, "", "/login?returnTo=" + encodeURIComponent("/portal"));
          setLoc({ path: "/login", search: "?returnTo=" + encodeURIComponent("/portal") });
          setStep("LOGIN");
        } else if (rt.name === "apply" && (r0 !== "candidate" || !tok)) {
          const applyDest =
            "/jobs/" + rt.jobId + "/apply" + (rt.invite ? "?invite=1" : "");
          window.history.replaceState({}, "", "/login?returnTo=" + encodeURIComponent(applyDest));
          setLoc({ path: "/login", search: "?returnTo=" + encodeURIComponent(applyDest) });
          setStep("LOGIN");
        } else if (rt.name === "apply" && r0 === "candidate" && tok) {
          const pick = boardJobs.find((x) => x.id === rt.jobId);
          if (pick) setSelJob(pick);
          setStep("CVUP");
        } else if (rt.name === "login") setStep("LOGIN");
        else if (rt.name === "register") setStep("CONSENT");
        else if (rt.name === "portal" && r0 === "candidate" && tok) setStep("PORTAL");
        else if (rt.name === "hr" && r0 === "hr" && tok) setStep("HR");
        else if (rt.name === "cvAnalyser" && r0 === "hr" && tok) setStep("CV_ANALYSER");
        else if (rt.name === "cvAnalyser") {
          window.history.replaceState({}, "", "/login?returnTo=" + encodeURIComponent("/cv-analyser"));
          setLoc({ path: "/login", search: "?returnTo=" + encodeURIComponent("/cv-analyser") });
          setStep("LOGIN");
        } else setStep("HOME");
      }
    })();
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const rt = parsePath(loc.path, loc.search);
    if (rt.name !== "apply") return;
    if (localStorage.getItem(LS_ROLE) !== "candidate") return;
    const j = jobs.find((x) => x.id === rt.jobId);
    if (j) setSelJob(j);
  }, [loc.path, loc.search, storageReady, jobs]);

  useEffect(() => {
    if (!storageReady) return;
    void flushPendingAbandonQueue();
    const onOnline = () => void flushPendingAbandonQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    const rt = parsePath(loc.path, loc.search);
    if (step === "CV_ANALYSER") {
      if (rt.name === "cvAnalyser") return;
      if (rt.name === "hr" && localStorage.getItem(LS_ROLE) === "hr" && localStorage.getItem(LS_TOKEN)) {
        setStep("HR");
        return;
      }
      if (rt.name === "home") setStep("HOME");
      else if (rt.name === "login") setStep("LOGIN");
      return;
    }
    const flowBlock = new Set(["CVUP", "INTRO", "INTERVIEW", "DONE", "CAND_DETAIL", "JOBMASTER", "SCREEN", "TP_BROWSE", "AUDIT", "ANALYSIS", "TP_SUBMIT", "TP_DONE", "RIGHTS", "FORGOT", "LOADING", "CV_ANALYSER"]);
    if (flowBlock.has(step)) return;
    const top = new Set(["HOME", "LOGIN", "CONSENT", "REG", "PORTAL", "HR"]);
    if (!top.has(step)) return;
    if (rt.name === "home") setStep("HOME");
    else if (rt.name === "login") setStep("LOGIN");
    else if (rt.name === "register") {
      if (step !== "REG") setStep("CONSENT");
    }
    else if (rt.name === "portal") {
      if (localStorage.getItem(LS_ROLE) === "candidate" && localStorage.getItem(LS_TOKEN)) setStep("PORTAL");
    } else if (rt.name === "hr") {
      if (localStorage.getItem(LS_ROLE) === "hr") setStep("HR");
    } else if (rt.name === "cvAnalyser") {
      if (localStorage.getItem(LS_ROLE) === "hr" && localStorage.getItem(LS_TOKEN)) setStep("CV_ANALYSER");
    }
  }, [loc.path, loc.search, storageReady, step]);

  useEffect(() => {
    if (!storageReady || !canPersist) return;
    const r0 = localStorage.getItem(LS_ROLE);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (r0 === "hr") {
        fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ jobs, candidates, talentPool, auditLog }),
        }).then((r) => { if (!r.ok) r.text().then((t) => console.error("Save failed:", t)); }).catch((err) => console.error(err));
      } else if (r0 === "candidate") {
        const me = candidates.find((c) => c.id === activeId);
        if (!me) return;
        fetch("/api/me", {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ candidate: me }),
        }).then((r) => { if (!r.ok) r.text().then((t) => console.error("Save failed:", t)); }).catch((err) => console.error(err));
      }
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [jobs, candidates, talentPool, auditLog, storageReady, canPersist, activeId, role]);

  const active = candidates.find(c => c.id === activeId);
  const upd = u => setCandidates(p => p.map(c => c.id === activeId ? { ...c, ...u } : c));
  const ivJid = step === "INTERVIEW" && active ? (selJob?.id || active?.jobId) : null;
  const latestAppIV = ivJid ? getLatestAppForJob(active?.applicationHistory, ivJid) : null;
  const [resolvedApplicationId, setResolvedApplicationId] = useState(null);
  useEffect(() => {
    if (step !== "INTERVIEW" || !active || !ivJid) {
      setResolvedApplicationId(null);
      return;
    }
    if (latestAppIV?.applicationId != null) {
      setResolvedApplicationId(latestAppIV.applicationId);
      return;
    }
    let cancelled = false;
    fetch(`/api/me/application-for-job/${encodeURIComponent(ivJid)}`, { headers: { ...authHeaders() } })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => {
        if (!cancelled && d.applicationId != null) setResolvedApplicationId(d.applicationId);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [step, active, ivJid, latestAppIV?.applicationId]);
  const company = meta?.companyName || "Indira IVF";
  const jd = selJob ? { ...selJob, companyName: company } : { id: "default", title: "Open Role", description: "", companyName: company };
  const analysisRoleRows = active ? hrAnalysisRoleRows(active) : [];
  const analysisAppIds = analysisRoleRows.map((r) => r.applicationId).filter((id) => id != null);
  const resolvedAnalysisApplicationId =
    step === "ANALYSIS" && active
      ? analysisAppIds.length > 0
        ? analysisApplicationId != null && analysisAppIds.includes(analysisApplicationId)
          ? analysisApplicationId
          : analysisAppIds[0]
        : null
      : analysisApplicationId;
  const analysisDecisionRow =
    active && step === "ANALYSIS"
      ? analysisRoleRows.length > 0 && resolvedAnalysisApplicationId != null
        ? (active.applicationHistory || []).find((x) => x.applicationId === resolvedAnalysisApplicationId) || null
        : getLatestAppForJob(active.applicationHistory || [], active.jobId)
      : null;
  const hrDecisionAllowedAnalysis = applicationVoiceInterviewCompleted(analysisDecisionRow);
  const analysisLegacyOk = Boolean(
    active && analysisRoleRows.length === 0 && active.transcript && active.transcript.length > 0,
  );
  const analysisCanOpen = Boolean(active && (analysisRoleRows.length > 0 || analysisLegacyOk));
  const cmCooling = meta?.coolingMonths ?? 3;
  const maxCvMb = meta?.maxCvMb ?? 5;

  const logAudit = (action, target, details) => setAuditLog(p => [...p, { id: "AUD-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6), timestamp: new Date().toISOString(), actor: hrId || "HR", action, target, details }]);

  const handlePasswordReset = async (email, newPw) => {
    try {
      const res = await fetch("/api/auth/candidate/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, newPassword: newPw }),
      });
      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) { alert(errBody.error || "Reset failed"); return; }
    } catch (e) {
      alert("Could not reach server.");
    }
  };
  const logout = async () => {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_ROLE);
    localStorage.removeItem(LS_CANDIDATE_ID);
    localStorage.removeItem(LS_HR_ID);
    setRole(null);
    setHrId(null);
    setActiveId(null);
    setSelJob(null);
    setAnalysisApplicationId(null);
    setPortalFocusJobId(null);
    setCanPersist(false);
    setCandidates([]);
    setTalentPool([]);
    setAuditLog([]);
    navigate("/");
    setStep("HOME");
    try {
      const jRes = await fetch("/api/jobs");
      if (jRes.ok) {
        const jd = await jRes.json();
        setJobs(jd.jobs || []);
        if (jd.meta != null) setMeta(jd.meta);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleApplyToJob = (job) => {
    if (!active) return;
    const latest = getLatestAppForJob(active.applicationHistory, job.id);
    if (latest && !latest.interviewCompletedAt) {
      setSelJob(job);
      setStep("INTRO");
      return;
    }
    const status = getCoolingStatus(active.applicationHistory, job.id, cmCooling);
    if (!status.canApply && !status.pendingInterview) { alert(`⏳ Cooling period active. Re-apply in ${status.daysRemaining} days (on ${fmtDate(status.eligibleAt)}).`); return; }
    setSelJob(job); setStep("CVUP");
  };

  const handleJobBoardApply = (job) => {
    const tok = localStorage.getItem(LS_TOKEN);
    const r0 = localStorage.getItem(LS_ROLE);
    if (!tok || r0 !== "candidate") {
      candidateLoginPreferHomeRef.current = false;
      navigate("/login?returnTo=" + encodeURIComponent("/jobs/" + job.id + "/apply"));
      setStep("LOGIN");
      return;
    }
    if (!active) return;
    handleApplyToJob(job);
  };

  const handleCVUploaded = async (file) => {
    if (!file || !active || !selJob) return;
    const newApp = {
      jobId: selJob.id,
      appliedAt: new Date().toISOString(),
      interviewScheduledAt: undefined,
      interviewCompletedAt: undefined,
    };
    upd({ cv: file.cvText, cvFile: file, status: "APPLIED", jobId: selJob.id, applicationHistory: [...(active.applicationHistory || []), newApp] });
    setStep("INTRO");
    try {
      await new Promise((r) => setTimeout(r, 900));
      await syncStateFromServer();
    } catch (e) {}
  };
  const handleTalentPoolMap = (entry, jobId) => {
    const existing = candidates.find(c => c.email.toLowerCase() === entry.email.toLowerCase());
    const newApp = { jobId, appliedAt: new Date().toISOString(), interviewScheduledAt: undefined, interviewCompletedAt: undefined };
    if (existing) {
      setCandidates(p => p.map(c => c.id === existing.id ? { ...c, status: "APPLIED", jobId, applicationHistory: [...(c.applicationHistory || []), newApp], cv: entry.cvText, cvFile: entry.cvFile, fromTalentPool: true } : c));
    } else {
      const nc = { id: "C" + Date.now(), name: entry.name, email: entry.email, password: "talentpool" + Date.now(), cv: entry.cvText, cvFile: entry.cvFile, status: "APPLIED", jobId, applicationHistory: [newApp], consent: true, consentAt: entry.submittedAt, purposes: ["identity", "cv", "interview", "ai"], grievances: [], fromTalentPool: true };
      setCandidates(p => [...p, nc]);
    }
    setTalentPool(p => p.map(t => t.id === entry.id ? { ...t, mappedToJobs: [...(t.mappedToJobs || []), { jobId, mappedAt: new Date().toISOString(), mappedBy: hrId || "HR" }] } : t));
  };

  const authCandidate = role === "candidate" && !!localStorage.getItem(LS_TOKEN);
  const authStripReady = storageReady && (role !== "candidate" || !localStorage.getItem(LS_CANDIDATE_ID) || Boolean(active));
  const candidateFirstName = (active?.name && String(active.name).trim().split(/\s+/)[0]) || "";

  if (step === "LOADING") return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-14 h-14 bg-indigo-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-2xl"><span className="text-white text-2xl font-black">S</span></div>
        <div className="w-8 h-8 border-4 border-indigo-800 border-t-indigo-400 rounded-full animate-spin mx-auto mb-3"/>
        <p className="text-slate-500 text-sm">Loading…</p>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif" }}>
      {step === "LOGIN" && (
        <Login
          coolingMonths={meta?.coolingMonths}
          dpo={meta?.dpo}
          onCandSuccess={async ({ candidateId, token }) => {
            if (token) localStorage.setItem(LS_TOKEN, token);
            localStorage.setItem(LS_ROLE, "candidate");
            localStorage.setItem(LS_CANDIDATE_ID, candidateId);
            setRole("candidate");
            setActiveId(candidateId);
            try {
              await syncStateFromServer();
            } catch (e) {}
            const preferHome = candidateLoginPreferHomeRef.current;
            candidateLoginPreferHomeRef.current = false;
            const sp = new URLSearchParams(window.location.search);
            const dest = preferHome ? "/" : (sp.get("returnTo") || "/");
            const applyDest = matchJobsApplyDest(dest);
            if (applyDest) {
              const jr2 = await fetch("/api/jobs", { headers: { ...authHeaders() } });
              if (jr2.ok) {
                const jd2 = await jr2.json();
                const jj = (jd2.jobs || []).find((x) => x.id === applyDest.jobId);
                if (jj) setSelJob(jj);
              }
            }
            navigate(dest);
            if (dest === "/portal") setStep("PORTAL");
            else if (applyDest) setStep("CVUP");
            else setStep("HOME");
          }}
          onHrSuccess={async ({ hrId, token }) => {
            if (token) localStorage.setItem(LS_TOKEN, token);
            localStorage.setItem(LS_ROLE, "hr");
            localStorage.setItem(LS_HR_ID, hrId);
            setRole("hr");
            setHrId(hrId);
            try {
              await syncStateFromServer();
            } catch (e) {}
            const sp = new URLSearchParams(window.location.search);
            const dest = sp.get("returnTo") || "/hr";
            navigate(dest);
            if (dest === "/cv-analyser") setStep("CV_ANALYSER");
            else if (dest === "/" || dest === "") setStep("HOME");
            else setStep("HR");
          }}
          onRegister={() => {
            const sp = new URLSearchParams(window.location.search);
            const r = sp.get("returnTo");
            navigate("/register" + (r ? "?returnTo=" + encodeURIComponent(r) : ""));
            setStep("CONSENT");
          }}
          onForgot={() => setStep("FORGOT")}
        />
      )}
      {step === "FORGOT" && <ForgotPassword candidates={candidates} onReset={handlePasswordReset} onBack={() => { navigate("/login"); setStep("LOGIN"); }}/>}
      {step === "CONSENT" && (
        <ConsentScreen
          dataCategories={meta?.dataCategories}
          coolingMonths={meta?.coolingMonths}
          dpo={meta?.dpo}
          onAccept={p => { setPending(p); setStep("REG"); }}
          onDecline={() => {
            if (tpGuestEntryRef.current) {
              navigate("/");
              setStep("TP_SUBMIT");
              return;
            }
            const sp = new URLSearchParams(window.location.search);
            const r = sp.get("returnTo");
            navigate("/login" + (r ? "?returnTo=" + encodeURIComponent(r) : ""));
            setStep("LOGIN");
          }}
        />
      )}
      {step === "REG" && <CandReg
        key={tpGuestRegPrefill ? `tp-reg-${tpGuestRegPrefill.email}` : "reg"}
        initialName={tpGuestRegPrefill?.name || ""}
        initialEmail={tpGuestRegPrefill?.email || ""}
        onRegister={async f => {
        if (!f.name.trim()) return;
        try {
          const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: f.name, email: f.email, password: f.password, purposes: pending }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { alert(data.error || "Registration failed"); return; }
          if (data.token) localStorage.setItem(LS_TOKEN, data.token);
          localStorage.setItem(LS_ROLE, "candidate");
          if (data.candidateId) localStorage.setItem(LS_CANDIDATE_ID, data.candidateId);
          setRole("candidate");
          setActiveId(data.candidateId);
          try {
            await syncStateFromServer();
          } catch (e) {}
          const tpPending = tpGuestEntryRef.current;
          if (tpPending && data.candidateId) {
            tpGuestEntryRef.current = null;
            setTpGuestRegPrefill(null);
            candidateLoginPreferHomeRef.current = false;
            const finalized = { ...tpPending, candidateId: data.candidateId, id: tpPending.id || ("TP-" + Date.now()) };
            try {
              await fetch("/api/talent-pool", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: "Bearer " + data.token },
                body: JSON.stringify(finalized),
              });
            } catch (_) {}
            setTalentPool((p) => [...p, finalized]);
            navigate("/");
            setStep("TP_DONE");
            return;
          }
          const preferHome = candidateLoginPreferHomeRef.current;
          candidateLoginPreferHomeRef.current = false;
          const sp = new URLSearchParams(window.location.search);
          const dest = preferHome ? "/" : (sp.get("returnTo") || "/");
          const applyDest = matchJobsApplyDest(dest);
          if (applyDest) {
            const jr2 = await fetch("/api/jobs", { headers: { ...authHeaders() } });
            if (jr2.ok) {
              const jd2 = await jr2.json();
              const jj = (jd2.jobs || []).find((x) => x.id === applyDest.jobId);
              if (jj) setSelJob(jj);
            }
          }
          navigate(dest);
          if (dest === "/portal") setStep("PORTAL");
          else if (applyDest) setStep("CVUP");
          else setStep("HOME");
        } catch (e) {
          alert("Could not reach server.");
        }
      }} onBack={() => {
        if (tpGuestEntryRef.current) {
          navigate("/");
          setStep("TP_SUBMIT");
          return;
        }
        const sp = new URLSearchParams(window.location.search);
        const r = sp.get("returnTo");
        navigate("/login" + (r ? "?returnTo=" + encodeURIComponent(r) : ""));
        setStep("LOGIN");
      }}/>}
      {step === "HOME" && (
        <Jobs
          jobs={jobs}
          applicationHistory={active?.applicationHistory || []}
          scheduleFlash={scheduleBoardFlash}
          onApply={handleJobBoardApply}
          onReattemptPortal={(job) => {
            setPortalFocusJobId(job.id);
            navigate("/portal");
            setStep("PORTAL");
          }}
          onContinueInterview={(job) => {
            setSelJob(job);
            setStep("INTRO");
          }}
          onTalentPool={() => {
            setTpFromPortal(false);
            const tok = localStorage.getItem(LS_TOKEN);
            const r0 = localStorage.getItem(LS_ROLE);
            if (tok && r0 !== "candidate") {
              candidateLoginPreferHomeRef.current = false;
              navigate("/login?returnTo=" + encodeURIComponent("/"));
              setStep("LOGIN");
              return;
            }
            setStep("TP_SUBMIT");
          }}
          onBack={() => {}}
          coolingMonths={cmCooling}
          showBack={false}
          authStripReady={authStripReady}
          authCandidate={authCandidate}
          onTalentPoolPortal={() => { navigate("/portal"); setStep("PORTAL"); }}
          jobBoardAuth={
            <JobBoardAuth
              authStripReady={authStripReady}
              sessionRole={role}
              candidateFirstName={candidateFirstName}
              onLoginClick={() => {
                candidateLoginPreferHomeRef.current = true;
                navigate("/login");
                setStep("LOGIN");
              }}
              onLogoutClick={logout}
              onGoToAts={() => { navigate("/hr"); setStep("HR"); }}
            />
          }
        />
      )}
      {step === "HR" && (
        <HRBridge onLogout={logout}>
          <HRDash candidates={candidates} jobs={jobs} talentPool={talentPool} auditLog={auditLog} reattemptPendingCount={reattemptPendingCount} onView={id => { setActiveId(id); setStep("CAND_DETAIL"); }} onInterview={id => { setActiveId(id); const cand = candidates.find(c => c.id === id); const j = cand && jobs.find(x => x.id === cand.jobId); if (j) setSelJob(j); setStep("INTRO"); }} onAnalysis={id => { setActiveId(id); setAnalysisApplicationId(null); setAnalysisSessionId((x) => x + 1); setStep("ANALYSIS"); }} onCvAnalyser={() => { navigate("/cv-analyser"); setStep("CV_ANALYSER"); }} onJobs={() => setStep("JOBMASTER")} onScreen={() => setStep("SCREEN")} onTalentPool={() => setStep("TP_BROWSE")} onAuditLog={() => setStep("AUDIT")} onReattempts={() => setStep("REATTEMPT")} onLogout={logout}/>
        </HRBridge>
      )}
      {step === "CAND_DETAIL" && active && <CandidateDetail candidate={active} jobs={jobs} onUpdate={upd} onInterview={(jobId) => { const j = jobs.find(x => x.id === (jobId || active.jobId)); if (j) setSelJob(j); setStep("INTRO"); }} onAnalysis={(appId) => { setAnalysisApplicationId(appId ?? null); setAnalysisSessionId((x) => x + 1); setStep("ANALYSIS"); }} onBack={() => setStep("HR")}/>}
      {step === "JOBMASTER" && <JobMaster jobs={jobs} onSave={setJobs} onBack={() => setStep("HR")}/>}
      {step === "SCREEN" && <Screening candidates={candidates} jobs={jobs} onShortlist={u => { setCandidates(u); setStep("HR"); }} onBack={() => setStep("HR")}/>}
      {step === "TP_BROWSE" && <TalentPoolBrowse talentPool={talentPool} jobs={jobs} candidates={candidates} onMapToJob={handleTalentPoolMap} onLogAudit={logAudit} onBack={() => setStep("HR")} coolingMonths={cmCooling}/>}
      {step === "REATTEMPT" && (
        <HRBridge onLogout={logout}>
          <ReattemptQueue onBack={() => { setStep("HR"); refreshReattemptCount(); }} onResolved={async () => { await syncStateFromServer(); await refreshReattemptCount(); }} />
        </HRBridge>
      )}
      {step === "AUDIT" && <AuditLogView auditLog={auditLog} candidates={candidates} hrUsers={hrUsers} onRefresh={refreshHrUsers} onBack={() => setStep("HR")}/>}
      {step === "CV_ANALYSER" && (
        <HRBridge onLogout={logout}>
          <CVAnalyserPage jobs={jobs} onBack={() => { navigate("/hr"); setStep("HR"); }} onSynced={syncStateFromServer} />
        </HRBridge>
      )}
      {step === "ANALYSIS" && analysisCanOpen && active && (
        <Analysis
          key={`hr-analysis-${analysisSessionId}`}
          context={{
            jd: (() => {
              if (analysisRoleRows.length > 0 && resolvedAnalysisApplicationId != null) {
                const row = active.applicationHistory.find((x) => x.applicationId === resolvedAnalysisApplicationId);
                const jj = row && jobs.find((x) => x.id === row.jobId);
                return jj ? { ...jj, companyName: company } : { id: "default", title: "Open Role", description: "", companyName: company };
              }
              const lj = jobs.find((x) => x.id === active.jobId);
              return lj ? { ...lj, companyName: company } : { id: "default", title: "Open Role", description: "", companyName: company };
            })(),
            candidateName: active.name,
            language: active.lang || "English",
          }}
          transcript={
            analysisRoleRows.length > 0 && resolvedAnalysisApplicationId != null
              ? (transcriptLinesForApplication(active, resolvedAnalysisApplicationId) || [])
              : (active.transcript || [])
          }
          savedAnalysis={(() => {
            if (resolvedAnalysisApplicationId == null) return active.analysis;
            const row = (active.applicationHistory || []).find((x) => x.applicationId === resolvedAnalysisApplicationId);
            return row?.analysis != null ? row.analysis : active.analysis;
          })()}
          roleTabs={analysisRoleRows.map((row) => ({
            applicationId: row.applicationId,
            label: jobs.find((j) => j.id === row.jobId)?.title || row.jobId || "Role",
          }))}
          selectedApplicationId={resolvedAnalysisApplicationId}
          onSelectApplication={setAnalysisApplicationId}
          initialRemarks={(() => {
            if (resolvedAnalysisApplicationId == null) return active.remarks || "";
            const row = (active.applicationHistory || []).find((x) => x.applicationId === resolvedAnalysisApplicationId);
            return row?.hrRemarks != null ? String(row.hrRemarks) : "";
          })()}
          hrDecisionAllowed={hrDecisionAllowedAnalysis}
          onDecision={(s, r, a) => {
            const analysisToSave =
              a && typeof a === "object"
                ? {
                    summary: a.summary || "",
                    tech: a.tech != null ? a.tech : 0,
                    comm: a.comm != null ? a.comm : 0,
                    rec: a.rec || "",
                    strengths: a.strengths || [],
                    areas: a.areas || [],
                  }
                : a;
            if (resolvedAnalysisApplicationId != null && analysisRoleRows.length > 0) {
              upd({
                applicationHistory: patchApplicationById(active.applicationHistory, resolvedAnalysisApplicationId, {
                  hrRemarks: r,
                  hrDecisionStatus: s,
                  analysis: analysisToSave,
                }),
                status: s,
                analysis: analysisToSave,
              });
            } else {
              upd({ status: s, remarks: r, analysis: analysisToSave });
            }
            setStep("HR");
          }}
          onBack={() => setStep("HR")}
          onLogout={logout}
        />
      )}
      {step === "CVUP" && selJob && <CVUpload jobTitle={selJob.title} maxCvMb={maxCvMb} onComplete={handleCVUploaded} onBack={() => { navigate("/"); setStep("HOME"); setSelJob(null); }}/>}
      {step === "TP_SUBMIT" && <TalentPoolSubmit
        candidate={active}
        guestMode={!authCandidate}
        maxCvMb={maxCvMb}
        coolingMonths={cmCooling}
        onSubmit={async (entry) => {
          try {
            const res = await fetch("/api/talent-pool", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeaders() },
              body: JSON.stringify(entry),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              alert(data.error || "Could not submit to talent pool.");
              return false;
            }
            const saved = { ...entry, id: data.id || entry.id };
            if (localStorage.getItem(LS_ROLE) === "hr") {
              setTalentPool((p) => [...p, saved]);
            }
            return true;
          } catch (e) {
            alert("Could not reach server.");
            return false;
          }
        }}
        onGuestContinue={(entry) => {
          tpGuestEntryRef.current = entry;
          setTpGuestRegPrefill({ name: entry.name, email: entry.email });
          navigate("/register");
          setStep("CONSENT");
        }}
        onBack={() => {
          tpGuestEntryRef.current = null;
          setTpGuestRegPrefill(null);
          if (tpFromPortal) { navigate("/portal"); setStep("PORTAL"); }
          else { navigate("/"); setStep("HOME"); }
        }}
      />}
      {step === "TP_DONE" && (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 text-3xl">✓</div>
          <h1 className="text-3xl font-black text-slate-900 mb-2">Added to Talent Pool</h1>
          <p className="text-slate-500 mb-5 max-w-md">HR SPOCs will reach out when a matching role opens.</p>
          <button type="button" onClick={() => { navigate("/"); setStep("HOME"); }} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold">Done</button>
        </div>
      )}
      {step === "INTRO" && active && (
        <Intro
          candidate={active}
          job={selJob || jobs.find(j => j.id === active?.jobId)}
          bypassSchedule={role === "hr"}
          eligibilityBlock={role === "hr" ? null : (() => {
            const j = selJob || jobs.find((x) => x.id === active?.jobId);
            if (!j?.id) return null;
            const e = interviewEligibleForJob(active, j.id);
            return e.ok ? null : e.reason;
          })()}
          interviewScheduledAt={getLatestAppForJob(active.applicationHistory, selJob?.id || active?.jobId)?.interviewScheduledAt}
          onSchedule={(iso) => {
            const jid = selJob?.id || active?.jobId;
            if (!jid) return;
            const prev = getLatestAppForJob(active.applicationHistory, jid)?.interviewScheduledAt;
            upd({ applicationHistory: patchLatestApp(active.applicationHistory, jid, { interviewScheduledAt: iso }) });
            const wasReschedule = !!(prev && String(prev) !== String(iso));
            setScheduleBoardFlash({ jobId: jid, at: iso, rescheduled: wasReschedule });
            setTimeout(() => {
              syncStateFromServer().catch(() => {});
            }, 1000);
          }}
          onLogout={logout}
          onStart={(lang) => {
            const j = selJob || jobs.find((x) => x.id === active?.jobId);
            if (j?.id && role !== "hr") {
              const e = interviewEligibleForJob(active, j.id);
              if (!e.ok) {
                window.alert(e.reason || "Interview cannot start.");
                return;
              }
              const sched = getLatestAppForJob(active.applicationHistory, j.id)?.interviewScheduledAt;
              const slot = interviewStartSlotStatus(sched, false);
              if (slot.blocked) {
                window.alert(
                  slot.tooEarly
                    ? `Start unlocks at ${fmtDateTime(sched)}. You have ${INTERVIEW_START_GRACE_MINUTES} minutes after that to begin.`
                    : `This slot closed at ${fmtDateTime(slot.windowEndIso)}. Pick a new time with Maybe later.`,
                );
                return;
              }
            }
            upd({ lang });
            setStep("INTERVIEW");
          }}
          onBack={() => {
            if (role === "hr") setStep("HR");
            else {
              const rt = parsePath(window.location.pathname, window.location.search);
              if (rt.name === "apply") { navigate("/"); setStep("HOME"); }
              else { navigate("/portal"); setStep("PORTAL"); }
            }
          }}
        />
      )}
      {step === "INTERVIEW" && active && <Interview context={{ jd, candidateName: active.name, language: active.lang || "English" }} applicationId={resolvedApplicationId} onAbandon={async (detail) => {
        const aid = resolvedApplicationId;
        if (aid) await postInterviewAbandonWithFallback(aid, detail);
        try { await syncStateFromServer(); } catch (_) {}
        setStep(role === "hr" ? "HR" : "PORTAL");
      }} onEnd={t => {
        if (!t || !t.length) {
          syncStateFromServer().catch(() => {});
          setStep(role === "hr" ? "HR" : "PORTAL");
          return;
        }
        const jid = selJob?.id || active?.jobId;
        let nextHist = active.applicationHistory;
        if (jid) {
          nextHist = patchLatestApp(active.applicationHistory, jid, {
            interviewCompletedAt: new Date().toISOString(),
            transcript: t,
            interviewCompletionStatus: "completed",
            reattemptRequestStatus: "none",
          });
        }
        upd({ transcript: t, status: "INTERVIEWED", applicationHistory: nextHist });
        setStep("DONE");
      }}/>}
      {step === "DONE" && <Done isHR={role === "hr"} onDash={() => {
        if (role === "hr") setStep("HR");
        else {
          const rt = parsePath(window.location.pathname, window.location.search);
          if (rt.name === "apply") { navigate("/"); setStep("HOME"); }
          else { navigate("/portal"); setStep("PORTAL"); }
        }
      }}/>}
      {step === "PORTAL" && active && <CandDash candidate={active} jobs={jobs} portalFocusJobId={portalFocusJobId} onPortalFocusJob={setPortalFocusJobId} onApply={() => { navigate("/"); setStep("HOME"); }} onTalentPool={() => { setTpFromPortal(true); setStep("TP_SUBMIT"); }} onInterview={() => { const jid = portalFocusJobId || active.jobId; const j = jobs.find(x => x.id === jid); if (j) setSelJob(j); setStep("INTRO"); }} onRights={() => setStep("RIGHTS")} onLogout={logout} talentPoolSelected={true} onSync={syncStateFromServer} scheduleFlash={scheduleBoardFlash}/>}
      {step === "RIGHTS" && active && <RightsPanel candidate={active} jobs={jobs} dpo={meta?.dpo} onUpdate={upd} onErase={() => {
        setCandidates(p => p.filter(c => c.id !== activeId));
        setActiveId(null);
        localStorage.removeItem(LS_TOKEN);
        localStorage.removeItem(LS_ROLE);
        localStorage.removeItem(LS_CANDIDATE_ID);
        navigate("/login");
        setStep("LOGIN");
        setCanPersist(false);
      }} onBack={() => { navigate("/portal"); setStep("PORTAL"); }}/>}
    </div>
  );
}


export default App;
