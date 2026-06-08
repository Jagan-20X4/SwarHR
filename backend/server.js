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
  submitTalentPoolEntry,
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
  createVoiceBotRouter,
  createAdminInterviewRouter,
} = require("./routes/interviewVoice");
const { createCandidatesRouter } = require("./routes/candidates");
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

function sendAuthJson(res, { token, typ, body }) {
  setAuthCookie(res, token, typ);
  res.json({ ...body, token });
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

app.use("/api/candidates", dbReady, createCandidatesRouter({ pool }));
app.use(
  "/api/attachments",
  dbReady,
  createAttachmentsRouter({ pool }),
);

app.post(
  "/api/talent-pool",
  dbReady,
  rateLimit({ windowMs: 60_000, max: 10, keySuffix: "talent-pool" }),
  async (req, res) => {
    try {
      const cand = bearerCandidateId(req);
      const out = await submitTalentPoolEntry(pool, req.body || {}, {
        candidateId: cand || undefined,
      });
      res.status(201).json(out);
    } catch (e) {
      console.error(e);
      sendApiError(res, e);
    }
  },
);

app.use(
  "/api/admin/cv-analyser",
  dbReady,
  createCvAnalyserRouter({ pool }),
);

app.get("/api/jobs", dbReady, async (req, res) => {
  try {
    const cand = bearerCandidateId(req);
    const { meta, jobs } = await listJobsApi(pool, cand);
    res.json({ meta, jobs });
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

assertJwtSecretForProduction();
assertVoiceBotServiceTokenConfigured();

app.listen(PORT, () => {
  console.log(`SwarHR backend http://localhost:${PORT}`);
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
