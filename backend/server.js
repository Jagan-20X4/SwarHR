const path = require("path");
require("dotenv").config({
  path: path.join(__dirname, ".env"),
});

const express = require("express");
const cors = require("cors");
const { pool } = require("./db");
const { sign, verify } = require("./jwt");
const {
  loadAppState,
  saveAppState,
  verifyCandidateLogin,
  verifyHrLogin,
  updateCandidatePassword,
  listJobsApi,
  getCandidateMe,
  registerCandidate,
  getApplicationIdForJob,
  deleteJob,
} = require("./stateRepo");
const { createCvAnalyserRouter } = require("./routes/cvAnalyser");
const {
  createVoiceBotRouter,
  createAdminInterviewRouter,
} = require("./routes/interviewVoice");

const PORT = Number(process.env.PORT) || 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const UPSTREAM = "https://api.anthropic.com/v1/messages";

const app = express();

function corsAllowedOrigins() {
  const base = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ];
  const extra = process.env.CORS_ORIGINS && String(process.env.CORS_ORIGINS).trim();
  if (!extra) return base;
  const more = extra
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...base, ...more];
}

app.use(
  cors({
    origin: corsAllowedOrigins(),
    credentials: true,
  }),
);
app.use(express.json({ limit: "50mb" }));

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

function bearerCandidateId(req) {
  const h = req.headers.authorization;
  const raw =
    h && h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!raw) return null;
  const payload = verify(raw);
  if (!payload || payload.typ !== "cand" || !payload.sub) return null;
  return payload.sub;
}

function requireCandidate(req, res, next) {
  const id = bearerCandidateId(req);
  if (!id) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.candidateId = id;
  next();
}

function bearerHrId(req) {
  const h = req.headers.authorization;
  const raw =
    h && h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!raw) return null;
  const payload = verify(raw);
  if (!payload || payload.typ !== "hr" || !payload.sub) return null;
  return payload.sub;
}

function requireHr(req, res, next) {
  const id = bearerHrId(req);
  if (!id) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.hrId = id;
  next();
}

app.get("/", (_req, res) => {
  res.type("text/plain").send(
    "SwarHR API — PostgreSQL + Anthropic proxy. See README.",
  );
});

app.get("/api/state", dbReady, async (_req, res) => {
  try {
    const state = await loadAppState(pool);
    res.json(state);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put("/api/state", dbReady, async (req, res) => {
  try {
    await saveAppState(pool, req.body || {});
    const state = await loadAppState(pool);
    res.json(state);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

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

app.use("/api/voice-bot", dbReady, createVoiceBotRouter(pool));
app.use("/api/admin", dbReady, createAdminInterviewRouter(pool));

app.post("/api/auth/login", dbReady, async (req, res) => {
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
    res.json({ token, candidateId: out.candidateId });
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
  res.json({ token, hrId: out.hrId });
});

app.post("/api/auth/register", dbReady, async (req, res) => {
  const { name, email, password, purposes } = req.body || {};
  if (!name || !email || !password) {
    res.status(400).json({ error: "name, email, and password required" });
    return;
  }
  if (String(password).length < 6) {
    res.status(400).json({ error: "password must be at least 6 characters" });
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
  res.json({ token, candidateId: out.candidateId });
});

app.post("/api/auth/candidate/login", dbReady, async (req, res) => {
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
  res.json({ candidateId: out.candidateId, token });
});

app.post("/api/auth/hr/login", dbReady, async (req, res) => {
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
  res.json({ hrId: out.hrId, token });
});

app.post("/api/auth/candidate/reset-password", dbReady, async (req, res) => {
  const { email, newPassword } = req.body || {};
  if (!email || !newPassword || String(newPassword).length < 6) {
    res.status(400).json({ error: "email and newPassword (min 6 chars) required" });
    return;
  }
  const ok = await updateCandidatePassword(pool, email, newPassword);
  if (!ok) {
    res.status(404).json({ error: "No account found" });
    return;
  }
  res.json({ ok: true });
});

app.post("/api/messages", async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    res.status(500).json({
      error:
        "Missing ANTHROPIC_API_KEY. Add backend/.env (see README).",
    });
    return;
  }

  const anthropicVersion =
    req.headers["anthropic-version"] || "2023-06-01";

  try {
    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": anthropicVersion,
      },
      body: JSON.stringify(req.body ?? {}),
    });

    const contentType =
      upstream.headers.get("content-type") || "application/json";
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status).set("Content-Type", contentType).send(buf);
  } catch (err) {
    console.error(err);
    res.status(502).json({
      error: "Proxy request failed",
      detail: String(err && err.message ? err.message : err),
    });
  }
});

app.listen(PORT, () => {
  console.log(`SwarHR backend http://localhost:${PORT}`);
  console.log(`POST ${"/api/messages".padEnd(20)} → ${UPSTREAM}`);
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
