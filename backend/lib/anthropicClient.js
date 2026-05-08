const Anthropic = require("@anthropic-ai/sdk");
const {
  SYSTEM_PROMPT,
  FIT_SYSTEM_PROMPT,
  buildUserPrompt,
  buildVisionPdfUserPrompt,
  buildUserPromptWithJob,
  buildVisionPdfUserPromptWithJob,
  buildGenerateJdUserPrompt,
} = require("./cvAnalyserPrompt");

function stripJsonFences(raw) {
  let s = String(raw || "").trim();
  s = s.replace(/^\s*```(?:json)?\s*/i, "");
  s = s.replace(/\s*```\s*$/i, "");
  return s.trim();
}

function validateAnalysis(a) {
  if (!a || typeof a !== "object") return false;
  const verdicts = new Set(["senior", "mid", "junior", "fresher"]);
  if (typeof a.candidateName !== "string" || !a.candidateName.trim()) return false;
  if (a.email != null && typeof a.email !== "string") return false;
  if (a.phone != null && typeof a.phone !== "string") return false;
  if (a.currentRole != null && typeof a.currentRole !== "string") return false;
  if (a.yearsExperience != null && a.yearsExperience !== "") {
    const n =
      typeof a.yearsExperience === "number"
        ? a.yearsExperience
        : Number(a.yearsExperience);
    if (!Number.isFinite(n)) return false;
  }
  if (!verdicts.has(a.verdict)) return false;
  if (typeof a.summary !== "string") return false;
  if (
    !Array.isArray(a.strengths) ||
    a.strengths.length !== 3 ||
    !a.strengths.every((x) => typeof x === "string")
  ) {
    return false;
  }
  if (
    !Array.isArray(a.gaps) ||
    a.gaps.length !== 3 ||
    !a.gaps.every((x) => typeof x === "string")
  ) {
    return false;
  }
  if (!Array.isArray(a.skills) || a.skills.length > 8) return false;
  if (!a.skills.every((x) => typeof x === "string")) return false;
  if (!Array.isArray(a.education) || !a.education.every((x) => typeof x === "string")) {
    return false;
  }
  if (!Array.isArray(a.redFlags) || !a.redFlags.every((x) => typeof x === "string")) {
    return false;
  }
  return true;
}

function clampScore05(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(5, Math.max(0, n));
}

function validateFitAnalysis(a) {
  if (!validateAnalysis(a)) return false;
  if (typeof a.fitSummary !== "string" || !String(a.fitSummary).trim()) return false;
  const fit = Number(a.overallFitScore);
  if (!Number.isFinite(fit) || fit < 0 || fit > 100) return false;
  for (const k of [
    "technicalScore",
    "experienceScore",
    "educationScore",
    "cultureScore",
  ]) {
    const n = Number(a[k]);
    if (!Number.isFinite(n) || n < 0 || n > 5) return false;
  }
  return true;
}

function normalizeFitAnalysis(raw) {
  const base = normalizeAnalysis(raw);
  return {
    ...base,
    fitSummary: String(raw.fitSummary || "").trim(),
    overallFitScore: Math.min(
      100,
      Math.max(0, Number(raw.overallFitScore)),
    ),
    technicalScore: clampScore05(raw.technicalScore),
    experienceScore: clampScore05(raw.experienceScore),
    educationScore: clampScore05(raw.educationScore),
    cultureScore: clampScore05(raw.cultureScore),
  };
}

function normalizeAnalysis(raw) {
  const years =
    raw.yearsExperience == null || raw.yearsExperience === ""
      ? null
      : typeof raw.yearsExperience === "number"
        ? raw.yearsExperience
        : Number(raw.yearsExperience);
  return {
    candidateName: String(raw.candidateName).trim(),
    email: raw.email == null || raw.email === "" ? null : String(raw.email),
    phone: raw.phone == null || raw.phone === "" ? null : String(raw.phone),
    currentRole:
      raw.currentRole == null || raw.currentRole === ""
        ? null
        : String(raw.currentRole),
    yearsExperience: Number.isFinite(years) ? years : null,
    verdict: raw.verdict,
    summary: String(raw.summary),
    strengths: raw.strengths.map(String),
    gaps: raw.gaps.map(String),
    skills: raw.skills.map(String).slice(0, 8),
    education: raw.education.map(String),
    redFlags: raw.redFlags.map(String),
  };
}

async function analyzeCvWithClaudePdfBuffer(buf, filename) {
  const apiKey = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim();
  if (!apiKey) {
    const err = new Error("AI_UNAVAILABLE");
    err.code = "AI_UNAVAILABLE";
    throw err;
  }
  const client = new Anthropic({ apiKey });
  const data = buf.toString("base64");
  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data,
            },
          },
          {
            type: "text",
            text: buildVisionPdfUserPrompt(filename || "resume.pdf"),
          },
        ],
      },
    ],
  });
  const block = (msg.content || []).find((b) => b.type === "text");
  const rawText = block && block.text ? block.text : "";
  let parsed;
  try {
    parsed = JSON.parse(stripJsonFences(rawText));
  } catch {
    const err = new Error("MALFORMED_JSON");
    err.code = "MALFORMED_JSON";
    throw err;
  }
  if (!validateAnalysis(parsed)) {
    const err = new Error("INVALID_SCHEMA");
    err.code = "INVALID_SCHEMA";
    throw err;
  }
  return normalizeAnalysis(parsed);
}

async function analyzeCvWithClaudePdfBufferForJob(buf, filename, job) {
  const apiKey = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim();
  if (!apiKey) {
    const err = new Error("AI_UNAVAILABLE");
    err.code = "AI_UNAVAILABLE";
    throw err;
  }
  const client = new Anthropic({ apiKey });
  const data = buf.toString("base64");
  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    temperature: 0.2,
    system: FIT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data,
            },
          },
          {
            type: "text",
            text: buildVisionPdfUserPromptWithJob(filename || "resume.pdf", job),
          },
        ],
      },
    ],
  });
  const block = (msg.content || []).find((b) => b.type === "text");
  const rawText = block && block.text ? block.text : "";
  let parsed;
  try {
    parsed = JSON.parse(stripJsonFences(rawText));
  } catch {
    const err = new Error("MALFORMED_JSON");
    err.code = "MALFORMED_JSON";
    throw err;
  }
  if (!validateFitAnalysis(parsed)) {
    const err = new Error("INVALID_SCHEMA");
    err.code = "INVALID_SCHEMA";
    throw err;
  }
  return normalizeFitAnalysis(parsed);
}

async function analyzeCvWithClaudeForJob(extractedText, job) {
  const apiKey = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim();
  if (!apiKey) {
    const err = new Error("AI_UNAVAILABLE");
    err.code = "AI_UNAVAILABLE";
    throw err;
  }
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    temperature: 0.2,
    system: FIT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserPromptWithJob(extractedText, job),
      },
    ],
  });
  const block = (msg.content || []).find((b) => b.type === "text");
  const rawText = block && block.text ? block.text : "";
  let parsed;
  try {
    parsed = JSON.parse(stripJsonFences(rawText));
  } catch {
    const err = new Error("MALFORMED_JSON");
    err.code = "MALFORMED_JSON";
    throw err;
  }
  if (!validateFitAnalysis(parsed)) {
    const err = new Error("INVALID_SCHEMA");
    err.code = "INVALID_SCHEMA";
    throw err;
  }
  return normalizeFitAnalysis(parsed);
}

async function analyzeCvWithClaude(extractedText) {
  const apiKey = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim();
  if (!apiKey) {
    const err = new Error("AI_UNAVAILABLE");
    err.code = "AI_UNAVAILABLE";
    throw err;
  }
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserPrompt(extractedText),
      },
    ],
  });
  const block = (msg.content || []).find((b) => b.type === "text");
  const rawText = block && block.text ? block.text : "";
  let parsed;
  try {
    parsed = JSON.parse(stripJsonFences(rawText));
  } catch {
    const err = new Error("MALFORMED_JSON");
    err.code = "MALFORMED_JSON";
    throw err;
  }
  if (!validateAnalysis(parsed)) {
    const err = new Error("INVALID_SCHEMA");
    err.code = "INVALID_SCHEMA";
    throw err;
  }
  return normalizeAnalysis(parsed);
}

async function generateJobDraftClaude(roleTitle) {
  const apiKey = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim();
  if (!apiKey) {
    const err = new Error("AI_UNAVAILABLE");
    err.code = "AI_UNAVAILABLE";
    throw err;
  }
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1200,
    temperature: 0.35,
    system:
      "You draft professional job postings for Indira IVF. Output ONLY valid JSON per user instructions. No markdown fences.",
    messages: [
      {
        role: "user",
        content: buildGenerateJdUserPrompt(roleTitle),
      },
    ],
  });
  const block = (msg.content || []).find((b) => b.type === "text");
  const rawText = block && block.text ? block.text : "";
  let parsed;
  try {
    parsed = JSON.parse(stripJsonFences(rawText));
  } catch {
    const err = new Error("MALFORMED_JSON");
    err.code = "MALFORMED_JSON";
    throw err;
  }
  if (
    !parsed ||
    typeof parsed.title !== "string" ||
    typeof parsed.designation !== "string" ||
    typeof parsed.description !== "string"
  ) {
    const err = new Error("INVALID_SCHEMA");
    err.code = "INVALID_SCHEMA";
    throw err;
  }
  return {
    title: String(parsed.title).trim().slice(0, 500),
    designation: String(parsed.designation).trim().slice(0, 500),
    description: String(parsed.description).trim().slice(0, 16000),
  };
}

module.exports = {
  analyzeCvWithClaude,
  analyzeCvWithClaudePdfBuffer,
  analyzeCvWithClaudeForJob,
  analyzeCvWithClaudePdfBufferForJob,
  generateJobDraftClaude,
  validateAnalysis,
  validateFitAnalysis,
  normalizeAnalysis,
  normalizeFitAnalysis,
  stripJsonFences,
};
