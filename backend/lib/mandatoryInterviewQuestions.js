/**
 * Default mandatory opening/closing questions for voice interviews.
 * Placeholders: {{candidateName}}, {{jobTitle}}, {{companyName}}
 */

const DEFAULT_OPENING = [
  "Hello {{candidateName}}, welcome. Please introduce yourself and confirm your full name for our records.",
  "Tell me about yourself — your background, experience, and what brings you to this opportunity.",
  "What motivated you to apply for the {{jobTitle}} role at {{companyName}}?",
  "What are your key strengths that make you a good fit for this position?",
];

const DEFAULT_CLOSING = [
  "Thank you for completing this interview. We have recorded your responses and our team will review them and get back to you soon. Have a great day.",
];

const PHASE_ORDER = { mandatory_open: 0, role: 1, mandatory_close: 2 };

function substitutePlaceholders(text, vars) {
  if (!text) return text;
  let out = String(text);
  const map = {
    candidateName: vars.candidateName || "there",
    jobTitle: vars.jobTitle || "this role",
    companyName: vars.companyName || "Indira IVF",
  };
  for (const [key, val] of Object.entries(map)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "gi"), val);
  }
  return out;
}

function defaultOpeningRows() {
  return DEFAULT_OPENING.map((question, i) => ({
    question,
    questionType: "open_ended",
    questionPhase: "mandatory_open",
    displayOrder: i + 1,
  }));
}

function defaultClosingRows() {
  return DEFAULT_CLOSING.map((question, i) => ({
    question,
    questionType: "open_ended",
    questionPhase: "mandatory_close",
    displayOrder: 9000 + i,
  }));
}

function sortQuestionsByPhase(rows) {
  return [...rows].sort((a, b) => {
    const pa = PHASE_ORDER[a.questionPhase || a.question_phase || "role"] ?? 1;
    const pb = PHASE_ORDER[b.questionPhase || b.question_phase || "role"] ?? 1;
    if (pa !== pb) return pa - pb;
    return (a.displayOrder || a.display_order || 0) - (b.displayOrder || b.display_order || 0);
  });
}

function buildDoNotRepeatTopics(opening, role, closing) {
  const all = [...(opening || []), ...(role || []), ...(closing || [])];
  return all.map((q) => String(q.question || "").trim()).filter((t) => t.length >= 10);
}

module.exports = {
  DEFAULT_OPENING,
  DEFAULT_CLOSING,
  PHASE_ORDER,
  substitutePlaceholders,
  defaultOpeningRows,
  defaultClosingRows,
  sortQuestionsByPhase,
  buildDoNotRepeatTopics,
};
