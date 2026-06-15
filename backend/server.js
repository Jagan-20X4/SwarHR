const path = require("path");
require("dotenv").config({
  path: path.join(__dirname, ".env"),
});

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { pool } = require("./db");
const {
  sign,
  assertJwtSecretForProduction,
  jwtSecretIsDefault,
} = require("./jwt");
const {
  loadAppState,
  loadAppStateForHr,
  saveAppState,
  saveOneCandidate,
  verifyCandidateLogin,
  verifyHrLogin,
  listJobsApi,
  getCandidateMe,
  registerCandidate,
  getApplicationIdForJob,
  applyToJob,
  deleteJob,
} = require("./stateRepo");
const { createCvAnalyserRouter } = require("./routes/cvAnalyser");
const {
  sendIntroInterviewEmail,
  sendScheduledInterviewEmail,
  sendInterviewCompletionEmail,
  processInterviewReminders,
  processInterviewMissedSlots,
} = require("./lib/interviewEmailService");
const {
  createVoiceBotRouter,
  createAdminInterviewRouter,
} = require("./routes/interviewVoice");
const { createCandidatesRouter } = require("./routes/candidates");
const { createTalentPoolRouter } = require("./routes/talentPool");
const { createAttachmentsRouter } = require("./routes/attachments");
const { rateLimit } = require("./lib/rateLimit");
const { isS3Configured } = require("./lib/s3Attachments");
const { sendApiError } = require("./lib/apiErrors");
const { setAuthCookie, clearAuthCookie } = require("./lib/authCookies");
const {
  proxyAnthropicMessages,
  proxyInterviewAnthropicMessages,
} = require("./lib/messagesProxy");
const {
  bearerPayload,
  bearerCandidateId,
  bearerHrId,
  requireCandidate,
  requireHr,
  requireAnyAuth,
} = require("./middleware/auth");
const { assertVoiceBotServiceTokenConfigured } = require("./middleware/serviceToken");

const PORT = Number(process.env.PORT) || 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const UPSTREAM = "https://api.anthropic.com/v1/messages";

const app = express();

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function envInt(name, def) {
  const v = process.env[name];
  if (v == null || String(v).trim() === "") return def;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

const JSON_BODY_LIMIT_MB = envInt("JSON_BODY_LIMIT_MB", 5);
const JSON_BODY_LIMIT_LARGE_MB = envInt("JSON_BODY_LIMIT_LARGE_MB", 50);

/** Paths that may carry CV/base64 in JSON (candidate save, HR shell, talent pool, voice). */
function needsLargeJsonBody(path) {
  return (
    path === "/api/me" ||
    path.startsWith("/api/me/") ||
    path === "/api/state" ||
    path === "/api/talent-pool" ||
    path.startsWith("/api/voice-bot")
  );
}

function corsAllowedOrigins() {
  const extra =
    process.env.CORS_ORIGINS && String(process.env.CORS_ORIGINS).trim();
  const fromEnv = extra
    ? extra
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  if (isProduction()) {
    return fromEnv;
  }

  const dev = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ];
  return [...new Set([...dev, ...fromEnv])];
}

const corsOrigins = corsAllowedOrigins();
if (isProduction() && corsOrigins.length === 0) {
  console.warn(
    "⚠ CORS_ORIGINS is empty in production — browser clients must set allowed origins in backend/.env",
  );
}

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

/* Structured request logging — quiet mode: only errors (5xx), client failures
 * (4xx), and slow requests (>2s) produce a log line. Successful fast requests
 * are silent to keep the console readable. /health and /ready are excluded. */
const pinoHttp = require("pino-http");
const SLOW_REQUEST_MS = envInt("SLOW_REQUEST_LOG_MS", 2000);
app.use(
  pinoHttp({
    autoLogging: {
      ignore: (req) => req.url === "/health" || req.url === "/ready",
    },
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      const startTime = res[pinoHttp.startTime];
      if (startTime && Date.now() - startTime > SLOW_REQUEST_MS) return "warn";
      return "silent";
    },
    customProps: (req) => {
      const p = bearerPayload(req);
      const role =
        p?.typ === "hr" ? "hr" : p?.typ === "cand" ? "candidate" : "anon";
      return { role };
    },
    serializers: {
      req(req) {
        return { method: req.method, url: req.url };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  }),
);

app.use((req, res, next) => {
  const mb = needsLargeJsonBody(req.path)
    ? JSON_BODY_LIMIT_LARGE_MB
    : JSON_BODY_LIMIT_MB;
  express.json({ limit: `${mb}mb` })(req, res, (err) => {
    if (err && err.type === "entity.too.large") {
      res.status(413).json({
        error: `Request body too large (max ${mb}MB for this route)`,
      });
      return;
    }
    next(err);
  });
});

function hasDbConfig() {
  const host = process.env.PG_HOST && process.env.PG_HOST.trim();
  const url = process.env.DATABASE_URL && process.env.DATABASE_URL.trim();
  return Boolean(host || url);
}

function dbReady(req, res, next) {
  if (!hasDbConfig()) {
    res.status(503).json({
      error:
        "Database not configured. Set DATABASE_URL or PG_HOST (and PG_USER, PG_PASSWORD, PG_DATABASE) in backend/.env",
    });
    return;
  }
  next();
}

function registrationEnabled() {
  const v = process.env.REGISTRATION_ENABLED;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return !isProduction();
}

/** Sets the HttpOnly session cookie; the raw JWT is never returned in the JSON
 *  body so scripts (and XSS) cannot read it. */
function sendAuthJson(res, { token, typ, body }) {
  setAuthCookie(res, token, typ);
  res.json(body);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "swarhr-api" });
});

app.get("/ready", async (_req, res) => {
  if (!hasDbConfig()) {
    res.status(503).json({ ok: false, error: "Database not configured" });
    return;
  }
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "connected", s3: isS3Configured() });
  } catch (e) {
    res.status(503).json({
      ok: false,
      error: "Database unreachable",
      detail: String(e.message || e),
    });
  }
});

app.get("/", (_req, res) => {
  res.type("text/plain").send(
    "SwarHR API — PostgreSQL + Anthropic proxy. See README.",
  );
});

app.get("/api/state", dbReady, requireHr, async (req, res) => {
  try {
    const hrOnly =
      req.query.hrOnly === "1" || req.query.hrOnly === "true";
    const state = hrOnly
      ? await loadAppStateForHr(pool)
      : await loadAppState(pool);
    res.json(state);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/state", dbReady, requireHr, async (req, res) => {
  try {
    const body = req.body || {};
    if (body.saveCandidates !== false) {
      res.status(400).json({
        error:
          "saveCandidates: false is required. Candidate data must use /api/candidates APIs.",
      });
      return;
    }
    if (Array.isArray(body.candidates) && body.candidates.length > 0) {
      res.status(400).json({
        error:
          "Do not send candidates in PUT /api/state. Use PATCH /api/candidates/:id.",
      });
      return;
    }
    await saveAppState(pool, body);
    invalidateJobsCache();
    const state = await loadAppStateForHr(pool);
    res.json(state);
  } catch (e) {
    console.error(e);
    sendApiError(res, e);
  }
});

app.put("/api/me", dbReady, requireCandidate, async (req, res) => {
  try {
    const body = req.body || {};
    const candidate =
      body.candidate && typeof body.candidate === "object"
        ? body.candidate
        : body;
    await saveOneCandidate(pool, req.candidateId, candidate);
    const updated = await getCandidateMe(pool, req.candidateId);
    res.json(updated);
  } catch (e) {
    console.error(e);
    sendApiError(res, e);
  }
});

app.post(
  "/api/me/apply",
  dbReady,
  requireCandidate,
  rateLimit({ windowMs: 60_000, max: 15, keySuffix: "apply" }),
  async (req, res) => {
    try {
      const body = req.body || {};
      const out = await applyToJob(pool, req.candidateId, {
        jobId: body.jobId,
        cv: body.cv,
        cvFile: body.cvFile,
      });
      res.status(201).json(out);
    } catch (e) {
      console.error(e);
      sendApiError(res, e);
    }
  },
);

/** Run an email task in the background and log its outcome (idempotency is
 *  enforced by sent-marker columns, so retriggers are safe). */
function runEmailTask(label, taskFn) {
  Promise.resolve()
    .then(taskFn)
    .then((out) => {
      if (out?.skipped) {
        console.log(`[mail] ${label}: skipped (${out.reason})`);
      }
    })
    .catch((err) => {
      console.error(`[mail] ${label} failed:`, err.message || err);
    });
}

app.post(
  "/api/me/interview-email/intro",
  dbReady,
  requireCandidate,
  rateLimit({ windowMs: 60_000, max: 10, keySuffix: "interview-email-intro" }),
  (req, res) => {
    const body = req.body || {};
    const jobId = body.jobId != null ? String(body.jobId).trim() : "";
    if (!jobId) {
      res.status(400).json({ error: "jobId required" });
      return;
    }
    const applicationId =
      body.applicationId != null ? Number(body.applicationId) : null;
    const candidateId = req.candidateId;
    runEmailTask(`intro candidate=${candidateId} job=${jobId}`, () =>
      sendIntroInterviewEmail(pool, candidateId, {
        jobId,
        applicationId: Number.isFinite(applicationId) ? applicationId : null,
      }),
    );
    res.status(202).json({ ok: true, queued: true });
  },
);

app.post(
  "/api/me/interview-email/scheduled",
  dbReady,
  requireCandidate,
  rateLimit({ windowMs: 60_000, max: 10, keySuffix: "interview-email-sched" }),
  (req, res) => {
    const body = req.body || {};
    const jobId = body.jobId != null ? String(body.jobId).trim() : "";
    const scheduledAt = body.scheduledAt != null ? String(body.scheduledAt) : "";
    if (!jobId || !scheduledAt) {
      res.status(400).json({ error: "jobId and scheduledAt required" });
      return;
    }
    const applicationId =
      body.applicationId != null ? Number(body.applicationId) : null;
    const candidateId = req.candidateId;
    runEmailTask(`scheduled candidate=${candidateId} job=${jobId}`, () =>
      sendScheduledInterviewEmail(pool, candidateId, {
        jobId,
        applicationId: Number.isFinite(applicationId) ? applicationId : null,
        scheduledAt,
      }),
    );
    res.status(202).json({ ok: true, queued: true });
  },
);

app.post(
  "/api/me/interview-email/completed",
  dbReady,
  requireCandidate,
  rateLimit({ windowMs: 60_000, max: 10, keySuffix: "interview-email-done" }),
  (req, res) => {
    const body = req.body || {};
    const jobId = body.jobId != null ? String(body.jobId).trim() : "";
    if (!jobId) {
      res.status(400).json({ error: "jobId required" });
      return;
    }
    const applicationId =
      body.applicationId != null ? Number(body.applicationId) : null;
    const candidateId = req.candidateId;
    runEmailTask(`completion candidate=${candidateId} job=${jobId}`, () =>
      sendInterviewCompletionEmail(pool, candidateId, {
        jobId,
        applicationId: Number.isFinite(applicationId) ? applicationId : null,
      }),
    );
    res.status(202).json({ ok: true, queued: true });
  },
);

app.use("/api/candidates", dbReady, createCandidatesRouter({ pool }));
app.use(
  "/api/attachments",
  dbReady,
  createAttachmentsRouter({ pool }),
);

app.use(
  "/api/talent-pool",
  dbReady,
  createTalentPoolRouter({ pool }),
);

app.use(
  "/api/admin/cv-analyser",
  dbReady,
  createCvAnalyserRouter({ pool }),
);

/* Anonymous job-board cache: the response for guests is identical for everyone,
 * so serve it from memory for a short TTL. Logged-in candidates get per-user
 * cooling/apply status and are never cached. Invalidated on any job mutation. */
const JOBS_CACHE_TTL_MS = envInt("JOBS_CACHE_TTL_MS", 30_000);
let anonJobsCache = { at: 0, payload: null };
function invalidateJobsCache() {
  anonJobsCache = { at: 0, payload: null };
}

const TTS_PROVIDER = process.env.USE_ELEVENLABS === "true" && process.env.ELEVENLABS_API_KEY
  ? "elevenlabs"
  : "browser";

app.get("/api/jobs", dbReady, async (req, res) => {
  try {
    const cand = bearerCandidateId(req);
    if (!cand) {
      const now = Date.now();
      if (anonJobsCache.payload && now - anonJobsCache.at < JOBS_CACHE_TTL_MS) {
        res.json(anonJobsCache.payload);
        return;
      }
      const { meta, jobs } = await listJobsApi(pool, null);
      const enrichedMeta = { ...(meta || {}), ttsProvider: TTS_PROVIDER };
      anonJobsCache = { at: now, payload: { meta: enrichedMeta, jobs } };
      res.json(anonJobsCache.payload);
      return;
    }
    const { meta, jobs } = await listJobsApi(pool, cand);
    res.json({ meta: { ...(meta || {}), ttsProvider: TTS_PROVIDER }, jobs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete("/api/jobs/:id", dbReady, requireHr, async (req, res) => {
  try {
    const out = await deleteJob(pool, req.params.id);
    if (!out.ok) {
      res.status(out.status || 400).json({ error: out.error });
      return;
    }
    invalidateJobsCache();
    res.json({ ok: true, id: req.params.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/admin/hr-users", dbReady, requireHr, async (_req, res) => {
  try {
    const r = await pool.query(
      "SELECT hr_id, display_name FROM hr_user ORDER BY hr_id",
    );
    res.json({
      users: r.rows.map((row) => ({
        hrId: row.hr_id,
        displayName: row.display_name || "",
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/me", dbReady, requireCandidate, async (req, res) => {
  try {
    const c = await getCandidateMe(pool, req.candidateId);
    if (!c) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(c);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get(
  "/api/me/application-for-job/:jobId",
  dbReady,
  requireCandidate,
  async (req, res) => {
    try {
      const applicationId = await getApplicationIdForJob(
        pool,
        req.candidateId,
        req.params.jobId,
      );
      res.json({ applicationId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  },
);

app.get("/api/auth/session", (req, res) => {
  const payload = bearerPayload(req);
  if (!payload || !payload.sub) {
    res.json({ authenticated: false });
    return;
  }
  if (payload.typ === "hr") {
    res.json({
      authenticated: true,
      role: "hr",
      hrId: payload.sub,
    });
    return;
  }
  if (payload.typ === "cand") {
    res.json({
      authenticated: true,
      role: "candidate",
      candidateId: payload.sub,
    });
    return;
  }
  res.json({ authenticated: false });
});

app.post("/api/auth/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.use("/api/voice-bot", dbReady, createVoiceBotRouter(pool));
app.use("/api/admin", dbReady, createAdminInterviewRouter(pool));

app.post(
  "/api/auth/login",
  dbReady,
  rateLimit({ windowMs: 60_000, max: 20, keySuffix: "login" }),
  async (req, res) => {
  const { role, email, password, hrId } = req.body || {};
  const r = role === "hr" ? "hr" : "candidate";
  if (r === "candidate") {
    if (!email || !password) {
      res.status(400).json({ error: "email and password required" });
      return;
    }
    const out = await verifyCandidateLogin(pool, email, password);
    if (!out.ok) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const token = sign({ typ: "cand", sub: out.candidateId });
    sendAuthJson(res, {
      token,
      typ: "cand",
      body: { candidateId: out.candidateId, role: "candidate" },
    });
    return;
  }
  const hid = hrId || email;
  if (!hid) {
    res.status(400).json({ error: "hrId required" });
    return;
  }
  const out = await verifyHrLogin(pool, hid, password || "");
  if (!out.ok) {
    res.status(401).json({ error: "Invalid HR ID or password" });
    return;
  }
  const token = sign({ typ: "hr", sub: out.hrId });
  sendAuthJson(res, {
    token,
    typ: "hr",
    body: { hrId: out.hrId, role: "hr" },
  });
  },
);

app.post(
  "/api/auth/register",
  dbReady,
  rateLimit({ windowMs: 60_000, max: 10, keySuffix: "register" }),
  async (req, res) => {
  if (!registrationEnabled()) {
    res.status(403).json({ error: "Registration is disabled" });
    return;
  }
  const { name, email, password, purposes } = req.body || {};
  if (!name || !email || !password) {
    res.status(400).json({ error: "name, email, and password required" });
    return;
  }
  const emailNorm = String(email).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    res.status(400).json({ error: "valid email required" });
    return;
  }
  if (String(password).length < 8) {
    res.status(400).json({ error: "password must be at least 8 characters" });
    return;
  }
  const out = await registerCandidate(pool, {
    name,
    email,
    password,
    purposes,
  });
  if (!out.ok) {
    res.status(409).json({ error: out.error || "Registration failed" });
    return;
  }
  const token = sign({ typ: "cand", sub: out.candidateId });
  sendAuthJson(res, {
    token,
    typ: "cand",
    body: { candidateId: out.candidateId, role: "candidate" },
  });
  },
);

app.post(
  "/api/auth/candidate/login",
  dbReady,
  rateLimit({ windowMs: 60_000, max: 20, keySuffix: "cand-login" }),
  async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: "email and password required" });
      return;
    }
    const out = await verifyCandidateLogin(pool, email, password);
    if (!out.ok) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const token = sign({ typ: "cand", sub: out.candidateId });
    sendAuthJson(res, {
      token,
      typ: "cand",
      body: { candidateId: out.candidateId, role: "candidate" },
    });
  },
);

app.post(
  "/api/auth/hr/login",
  dbReady,
  rateLimit({ windowMs: 60_000, max: 15, keySuffix: "hr-login" }),
  async (req, res) => {
    const { hrId, password } = req.body || {};
    if (!hrId) {
      res.status(400).json({ error: "hrId required" });
      return;
    }
    const out = await verifyHrLogin(pool, hrId, password || "");
    if (!out.ok) {
      res.status(401).json({ error: "Invalid HR ID or password" });
      return;
    }
    const token = sign({ typ: "hr", sub: out.hrId });
    sendAuthJson(res, {
      token,
      typ: "hr",
      body: { hrId: out.hrId, role: "hr" },
    });
  },
);

app.post(
  "/api/messages",
  requireHr,
  rateLimit({ windowMs: 60_000, max: 30, keySuffix: "messages" }),
  (req, res) =>
    proxyAnthropicMessages(req, res, {
      apiKey: ANTHROPIC_API_KEY,
      upstreamUrl: UPSTREAM,
      sendApiError,
    }),
);

app.post(
  "/api/interview/messages",
  dbReady,
  requireCandidate,
  rateLimit({ windowMs: 60_000, max: 20, keySuffix: "interview-messages" }),
  (req, res) =>
    proxyInterviewAnthropicMessages(req, res, {
      pool,
      apiKey: ANTHROPIC_API_KEY,
      upstreamUrl: UPSTREAM,
      sendApiError,
    }),
);

// ─── ElevenLabs TTS proxy ────────────────────────────────────────────────────
const USE_ELEVENLABS = process.env.USE_ELEVENLABS === "true";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "";
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL || "eleven_turbo_v2_5";

app.post(
  "/api/tts",
  dbReady,
  requireCandidate,
  rateLimit({ windowMs: 60_000, max: 80, keySuffix: "tts" }),
  async (req, res) => {
    if (!USE_ELEVENLABS || !ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
      res.status(503).json({ error: "TTS not configured" });
      return;
    }
    const { text, language } = req.body || {};
    if (!text || typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "text is required" });
      return;
    }
    try {
      const upstream = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`,
        {
          method: "POST",
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: text.trim(),
            model_id: ELEVENLABS_MODEL,
            language_code: language || "en",
            voice_settings: {
              stability: 0.45,
              similarity_boost: 0.80,
              style: 0.30,
              use_speaker_boost: true,
            },
          }),
        },
      );
      if (!upstream.ok) {
        const errText = await upstream.text().catch(() => "");
        console.error("[tts] ElevenLabs error:", upstream.status, errText);
        res.status(502).json({ error: "TTS upstream error", detail: upstream.status });
        return;
      }
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-store");
      // Stream MP3 bytes directly to the browser
      const reader = upstream.body.getReader();
      const pump = async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) { res.end(); return; }
          res.write(Buffer.from(value));
        }
      };
      await pump();
    } catch (e) {
      console.error("[tts] error:", e);
      if (!res.headersSent) res.status(500).json({ error: "TTS failed" });
    }
  },
);

assertJwtSecretForProduction();
assertVoiceBotServiceTokenConfigured();

const INTERVIEW_REMINDER_POLL_MS = Number(
  process.env.INTERVIEW_REMINDER_POLL_MS || 60_000,
);

function startInterviewReminderPoller() {
  const tick = () => {
    processInterviewReminders(pool).catch((err) => {
      console.error("[reminder] poll failed:", err.message || err);
    });
    processInterviewMissedSlots(pool).catch((err) => {
      console.error("[missed] poll failed:", err.message || err);
    });
  };
  setInterval(tick, INTERVIEW_REMINDER_POLL_MS);
  setTimeout(tick, 5_000);
}

app.listen(PORT, () => {
  console.log(`SwarHR backend http://localhost:${PORT}`);
  startInterviewReminderPoller();
  console.log(
    `Interview reminder emails: polling every ${INTERVIEW_REMINDER_POLL_MS / 1000}s (30 min before slot)`,
  );
  console.log(
    `Interview missed emails: polling every ${INTERVIEW_REMINDER_POLL_MS / 1000}s (after slot + grace)`,
  );
  console.log(`POST ${"/api/messages".padEnd(20)} → ${UPSTREAM} (HR auth)`);
  console.log(
    `POST ${"/api/interview/messages".padEnd(20)} → ${UPSTREAM} (candidate interview)`,
  );
  if (isProduction() && jwtSecretIsDefault()) {
    console.error(
      "⚠ CRITICAL: Set JWT_SECRET in backend/.env before production deploy.",
    );
  }
  if (isS3Configured()) {
    console.log("S3 attachments: enabled (bucket configured)");
  } else {
    console.warn(
      "⚠ S3 not configured — CVs fall back to PostgreSQL base64 storage.",
    );
  }
  if (!hasDbConfig()) {
    console.warn(
      "⚠ No database config (DATABASE_URL or PG_*) — REST APIs return 503 until set.",
    );
  } else if (process.env.PG_HOST) {
    console.log(
      `PostgreSQL: ${process.env.PG_USER}@${process.env.PG_HOST}:${process.env.PG_PORT || 5432}/${process.env.PG_DATABASE}`,
    );
  }
});
