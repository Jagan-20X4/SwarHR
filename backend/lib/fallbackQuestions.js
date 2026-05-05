/**
 * Default voice-interview script when a job has no HR-configured questions.
 * Env VOICE_BOT_FALLBACK_QUESTIONS may override (JSON array of strings, max 5 used).
 */
function parseEnvFallback() {
  const raw = process.env.VOICE_BOT_FALLBACK_QUESTIONS;
  if (!raw || !String(raw).trim()) return null;
  try {
    const arr = JSON.parse(String(raw));
    if (!Array.isArray(arr)) return null;
    const qs = arr.filter((x) => typeof x === "string" && x.trim().length >= 10);
    return qs.length ? qs.slice(0, 20) : null;
  } catch {
    return null;
  }
}

const HARDCODED = [
  "Tell me about yourself and what drew you to healthcare delivery.",
  "Why are you interested in this role specifically?",
  "Describe your biggest professional achievement so far.",
  "Why Indira IVF — what do you know about our mission and culture?",
  "Do you have any questions for us about the role or next steps?",
];

function getFallbackQuestionTexts() {
  const env = parseEnvFallback();
  if (env && env.length) return env;
  return [...HARDCODED];
}

module.exports = { getFallbackQuestionTexts, HARDCODED };
