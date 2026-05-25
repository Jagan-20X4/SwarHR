const { getFallbackQuestionTexts } = require("./fallbackQuestions");
const {
  substitutePlaceholders,
  defaultOpeningRows,
  defaultClosingRows,
  sortQuestionsByPhase,
  buildDoNotRepeatTopics,
} = require("./mandatoryInterviewQuestions");

function mapRow(q, vars) {
  const phase = q.question_phase || q.questionPhase || "role";
  const raw = q.question;
  return {
    id: q.id,
    order: q.display_order,
    question: substitutePlaceholders(raw, vars),
    questionRaw: raw,
    type: q.question_type || q.questionType || "open_ended",
    phase,
  };
}

function buildInterviewScriptFromRows(rows, vars) {
  let items = rows.map((q) => mapRow(q, vars));
  if (items.length === 0) {
    const texts = getFallbackQuestionTexts();
    items = texts.map((text, i) => ({
      id: -(i + 1),
      order: i + 1,
      question: substitutePlaceholders(text, vars),
      questionRaw: text,
      type: "open_ended",
      phase: "role",
    }));
    return {
      opening: [],
      role: items,
      closing: [],
      questions: items,
      fallbackUsed: true,
      doNotRepeatTopics: items.map((x) => x.question),
    };
  }

  const opening = items.filter((x) => x.phase === "mandatory_open");
  const role = items.filter((x) => x.phase === "role");
  const closing = items.filter((x) => x.phase === "mandatory_close");
  const questions = [...opening, ...role, ...closing];

  return {
    opening,
    role,
    closing,
    questions,
    fallbackUsed: false,
    doNotRepeatTopics: buildDoNotRepeatTopics(opening, role, closing),
  };
}

function normalizeInterviewQuestionsForSave(interviewQuestions) {
  const list = Array.isArray(interviewQuestions) ? interviewQuestions : [];
  const opening = [];
  const role = [];
  const closing = [];
  for (const q of list) {
    const text = String(q.question || "").trim();
    if (text.length < 10 || text.length > 500) continue;
    const phase = ["mandatory_open", "role", "mandatory_close"].includes(
      q.questionPhase,
    )
      ? q.questionPhase
      : "role";
    const row = {
      text,
      type: ["open_ended", "yes_no", "scale_1_5"].includes(q.questionType)
        ? q.questionType
        : "open_ended",
      phase,
    };
    if (phase === "mandatory_open") opening.push(row);
    else if (phase === "mandatory_close") closing.push(row);
    else role.push(row);
  }
  let ord = 1;
  const out = [];
  for (const q of opening) out.push({ ...q, ord: ord++ });
  for (const q of role) out.push({ ...q, ord: ord++ });
  for (const q of closing) out.push({ ...q, ord: ord++ });
  return out;
}

module.exports = {
  buildInterviewScriptFromRows,
  normalizeInterviewQuestionsForSave,
  defaultOpeningRows,
  defaultClosingRows,
  sortQuestionsByPhase,
};
