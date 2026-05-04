const Anthropic = require("@anthropic-ai/sdk");
const {
  SYSTEM_PROMPT,
  buildUserPrompt,
  buildVisionPdfUserPrompt,
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

module.exports = {
  analyzeCvWithClaude,
  analyzeCvWithClaudePdfBuffer,
  validateAnalysis,
  normalizeAnalysis,
  stripJsonFences,
};
