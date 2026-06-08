const ALLOWED_MODELS = new Set([
  "claude-sonnet-4-20250514",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "claude-3-haiku-20240307",
]);

const MAX_TOKENS_CAP = 8192;

function sanitizeAnthropicBody(body) {
  const raw = body && typeof body === "object" ? body : {};
  const model = String(raw.model || "").trim();
  if (!model || !ALLOWED_MODELS.has(model)) {
    const err = new Error(
      `model not allowed. Allowed: ${[...ALLOWED_MODELS].join(", ")}`,
    );
    err.status = 400;
    throw err;
  }
  let maxTokens = parseInt(String(raw.max_tokens ?? 1024), 10);
  if (!Number.isFinite(maxTokens) || maxTokens < 1) maxTokens = 1024;
  maxTokens = Math.min(maxTokens, MAX_TOKENS_CAP);

  return {
    ...raw,
    model,
    max_tokens: maxTokens,
  };
}

const INTERVIEW_MAX_TOKENS_CAP = 1500;

/** Stricter cap for candidate voice-interview follow-ups. */
function sanitizeInterviewAnthropicBody(body) {
  const safe = sanitizeAnthropicBody(body);
  let maxTokens = parseInt(String(safe.max_tokens ?? 1024), 10);
  if (!Number.isFinite(maxTokens) || maxTokens < 1) maxTokens = 1024;
  safe.max_tokens = Math.min(maxTokens, INTERVIEW_MAX_TOKENS_CAP);
  return safe;
}

async function proxyAnthropicMessages(req, res, { apiKey, upstreamUrl, sendApiError }) {
  if (!apiKey || !String(apiKey).trim()) {
    res.status(500).json({
      error: "Missing ANTHROPIC_API_KEY. Add backend/.env (see README).",
    });
    return;
  }

  let safeBody;
  try {
    safeBody = sanitizeAnthropicBody(req.body);
  } catch (e) {
    sendApiError(res, e);
    return;
  }

  const anthropicVersion =
    req.headers["anthropic-version"] || "2023-06-01";

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": anthropicVersion,
      },
      body: JSON.stringify(safeBody),
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
}

async function proxyInterviewAnthropicMessages(
  req,
  res,
  { pool, apiKey, upstreamUrl, sendApiError },
) {
  const raw = req.body && typeof req.body === "object" ? req.body : {};
  const applicationId = parseInt(raw.applicationId, 10);
  if (!Number.isFinite(applicationId)) {
    res.status(400).json({ error: "applicationId required" });
    return;
  }

  const allowed = await candidateMayUseInterviewMessages(
    pool,
    req.candidateId,
    applicationId,
  );
  if (!allowed) {
    res.status(403).json({
      error: "No active interview session for this application",
    });
    return;
  }

  const { applicationId: _drop, ...anthropicBody } = raw;
  let safeBody;
  try {
    safeBody = sanitizeInterviewAnthropicBody(anthropicBody);
  } catch (e) {
    sendApiError(res, e);
    return;
  }

  if (!apiKey || !String(apiKey).trim()) {
    res.status(500).json({
      error: "Missing ANTHROPIC_API_KEY. Add backend/.env (see README).",
    });
    return;
  }

  const anthropicVersion =
    req.headers["anthropic-version"] || "2023-06-01";

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": anthropicVersion,
      },
      body: JSON.stringify(safeBody),
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
}

async function candidateMayUseInterviewMessages(pool, candidateId, applicationId) {
  if (!candidateId || !Number.isFinite(applicationId)) return false;
  try {
    const r = await pool.query(
      `SELECT 1 FROM application
       WHERE id = $1 AND candidate_id = $2
         AND (
           interview_completion_status IN ('not_started', 'in_progress')
           OR (
             interview_completion_status IN ('incomplete_technical', 'completed')
             AND reattempt_request_status = 'approved'
           )
         )`,
      [applicationId, candidateId],
    );
    return r.rows.length > 0;
  } catch (e) {
    if (e && e.code === "42703") {
      const r2 = await pool.query(
        `SELECT 1 FROM application WHERE id = $1 AND candidate_id = $2`,
        [applicationId, candidateId],
      );
      return r2.rows.length > 0;
    }
    throw e;
  }
}

module.exports = {
  sanitizeAnthropicBody,
  sanitizeInterviewAnthropicBody,
  proxyAnthropicMessages,
  proxyInterviewAnthropicMessages,
  candidateMayUseInterviewMessages,
  ALLOWED_MODELS,
  INTERVIEW_MAX_TOKENS_CAP,
};
