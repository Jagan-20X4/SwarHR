// @ts-nocheck
import React, { useMemo } from "react";
import { fmtDateTime } from "@/legacy/helpersModule";

const PHASE_ORDER = ["mandatory_open", "role", "ai_followup", "mandatory_close", "other"];

const PHASE_LABELS = {
  mandatory_open: "Mandatory opening",
  role: "Role-specific (HR script)",
  ai_followup: "Swar follow-up (AI)",
  mandatory_close: "Mandatory closing",
  other: "Other",
};

function normalizePhase(raw) {
  const p = String(raw || "").trim().toLowerCase();
  if (p === "mandatory_open" || p === "opening") return "mandatory_open";
  if (p === "mandatory_close" || p === "closing") return "mandatory_close";
  if (p === "ai_followup" || p === "ai") return "ai_followup";
  if (p === "role" || p === "hr") return "role";
  return "other";
}

function inferPhaseFromAnswer(a, index, total) {
  if (a.questionPhase) return normalizePhase(a.questionPhase);
  const q = String(a.questionText || "").toLowerCase();
  if (/thank\s*you|thankyou|choosing us|have a great day/.test(q)) return "mandatory_close";
  if (index >= total - 1 && /thank/.test(q)) return "mandatory_close";
  if (
    a.questionId == null &&
    index > 0 &&
    index < total - 1 &&
    !/welcome|introduce yourself|motivated you to apply|key strengths/.test(q)
  ) {
    return "ai_followup";
  }
  if (
    /welcome|introduce yourself|motivated you to apply|key strengths|tell me about yourself/.test(
      q,
    )
  ) {
    return "mandatory_open";
  }
  if (index === 0) return "mandatory_open";
  if (index < Math.min(4, Math.ceil(total * 0.45))) return "mandatory_open";
  return "role";
}

export function groupInterviewAnswersByPhase(answers) {
  const groups = new Map();
  const list = answers || [];
  list.forEach((a, i) => {
    const phase = inferPhaseFromAnswer(a, i, list.length);
    if (!groups.has(phase)) groups.set(phase, []);
    groups.get(phase).push({ ...a, _phase: phase });
  });
  return PHASE_ORDER.filter((p) => groups.has(p)).map((phase) => ({
    phase,
    label: PHASE_LABELS[phase] || phase,
    items: groups.get(phase),
  }));
}

/** Chat lines not already covered by stored Q&A (e.g. AI follow-up spoken text). */
export function extractAiFollowUpFromChat(chatLines, answers) {
  if (!chatLines?.length) return [];
  const usedQuestions = new Set(
    (answers || []).map((a) => String(a.questionText || "").trim().toLowerCase()),
  );
  const extras = [];
  for (let i = 0; i < chatLines.length; i++) {
    const line = chatLines[i];
    if (line.role !== "ai" && line.role !== "assistant") continue;
    const q = String(line.text || "").trim();
    if (!q || usedQuestions.has(q.toLowerCase())) continue;
    const next = chatLines[i + 1];
    const ans =
      next && (next.role === "user" || next.role === "candidate")
        ? String(next.text || "").trim()
        : "";
    extras.push({ questionText: q, answerText: ans, index: extras.length + 1 });
    usedQuestions.add(q.toLowerCase());
    if (next && (next.role === "user" || next.role === "candidate")) i += 1;
  }
  return extras;
}

function Bubble({ role, text, sub }) {
  const isAi = role === "ai";
  return (
    <div className={`flex ${isAi ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[92%] sm:max-w-md p-3 rounded-2xl text-sm ${
          isAi ? "bg-slate-100 text-slate-800" : "bg-indigo-600 text-white"
        }`}
      >
        <p className="text-xs uppercase font-black mb-1 opacity-50">
          {isAi ? "Swar" : "Candidate"}
          {sub ? ` · ${sub}` : ""}
        </p>
        <p className="whitespace-pre-wrap break-words">{text || "—"}</p>
      </div>
    </div>
  );
}

export function InterviewTranscriptPanel({
  jobTitle,
  lang,
  loading,
  answers,
  chatLines,
  showHeader = true,
  collapsed,
  onToggleCollapsed,
}) {
  const aiExtras = useMemo(
    () => extractAiFollowUpFromChat(chatLines, answers),
    [chatLines, answers],
  );

  const sections = useMemo(() => {
    const base = groupInterviewAnswersByPhase(answers);
    if (aiExtras.length > 0) {
      const existing = base.find((s) => s.phase === "ai_followup");
      if (existing) {
        existing.items = [
          ...existing.items,
          ...aiExtras.map((x, i) => ({
            ...x,
            index: existing.items.length + i + 1,
            _phase: "ai_followup",
          })),
        ];
      } else {
        base.push({
          phase: "ai_followup",
          label: PHASE_LABELS.ai_followup,
          items: aiExtras.map((x, i) => ({
            ...x,
            index: i + 1,
            _phase: "ai_followup",
          })),
        });
        base.sort(
          (a, b) => PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase),
        );
      }
    }
    return base;
  }, [answers, aiExtras]);

  const totalQuestions = (answers || []).length + aiExtras.length;
  const msgCount = chatLines?.length || totalQuestions * 2;

  if (loading) {
    return <p className="text-sm text-slate-500">Loading full interview transcript…</p>;
  }

  if (!sections.length && !(chatLines && chatLines.length > 0)) {
    return (
      <p className="text-sm text-slate-500">No interview transcript stored for this application yet.</p>
    );
  }

  const body = (
    <div className="mt-4 space-y-6 max-h-[min(75vh,800px)] overflow-y-auto pr-1">
      {sections.map((section) => (
        <div key={section.phase} className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200">
            <p className="text-xs font-black text-slate-700 uppercase tracking-wide">
              {section.label}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {section.items.length} question{section.items.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="p-4 space-y-4 bg-white">
            {section.items.map((a, idx) => (
              <div
                key={`${section.phase}-${a.index ?? idx}-${String(a.questionText || "").slice(0, 24)}`}
                className="space-y-2"
              >
                <Bubble role="ai" text={a.questionText} sub={`Q${a.index ?? idx + 1}`} />
                <Bubble role="user" text={a.answerText} />
                {a.askedAt ? (
                  <p className="text-[10px] text-slate-400 text-center">
                    {fmtDateTime(a.askedAt)}
                    {a.durationSeconds ? ` · ${a.durationSeconds}s` : ""}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
      {sections.length === 0 && chatLines?.length > 0 ? (
        <div className="space-y-3">
          {chatLines.map((e, i) => (
            <Bubble
              key={i}
              role={e.role === "ai" || e.role === "assistant" ? "ai" : "user"}
              text={e.text}
            />
          ))}
        </div>
      ) : null}
    </div>
  );

  if (!showHeader) return body;

  return (
    <div>
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="w-full flex items-center justify-between text-left gap-2"
      >
        <div>
          <h2 className="text-xs font-black text-slate-400 uppercase">
            Interview transcript · {jobTitle || "—"}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {totalQuestions} questions · {msgCount} messages · {lang || "English"} — scroll for all
            sections
          </p>
        </div>
        <span className="text-indigo-500 text-xs font-bold shrink-0">
          {collapsed ? "▼" : "▲"}
        </span>
      </button>
      {!collapsed ? body : null}
    </div>
  );
}
