const express = require("express");
const crypto = require("crypto");
const { voiceBotAuth, voiceBotTokenRoles } = require("../middleware/serviceToken");
const { requireHr } = require("../middleware/auth");
const { readAuthTokenFromRequest } = require("../lib/authCookies");
const { getFallbackQuestionTexts } = require("../lib/fallbackQuestions");
const { buildInterviewScriptFromRows } = require("../lib/interviewScript");
const {
  getOrCreateInterviewAttempt,
  completeInterviewAttempt,
  upsertInterviewAnswer,
  countInterviewAnswers,
  interviewAnswersRequireAttemptId,
} = require("../lib/interviewAttempts");
const { markApplicationInterviewComplete } = require("../lib/interviewFinalize");
const {
  sendInterviewCompletionEmail,
  sendReattemptApprovedEmail,
  sendReattemptRejectedEmail,
} = require("../lib/interviewEmailService");
const {
  reattemptDeadlineExpired,
  REATTEMPT_DEADLINE_EXPIRED_MESSAGE,
} = require("../lib/reattemptDeadline");

function auditId() {
  return `AUD-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

const HR_REATTEMPT_REASON_CODES = new Set([
  "CANDIDATE_CONSTRAINTS",
  "QUALITY_IMPACTED",
  "BUSINESS_EXCEPTION",
  "BORDERLINE_HIGH_POTENTIAL",
]);

/** Shared abandon logic for interview-session-abandon and abandon-beacon (token in JSON body). */
async function interviewSessionAbandonCore(
  pool,
  applicationId,
  clientDetail,
  { voiceBotService, candidateId },
) {
  const client = await pool.connect();
  try {
    const appRes = await client.query(
      "SELECT id, candidate_id FROM application WHERE id = $1",
      [applicationId],
    );
    if (appRes.rows.length === 0) {
      return { status: 404, body: { error: "Application not found" } };
    }
    const row = appRes.rows[0];
    if (!voiceBotService && row.candidate_id !== candidateId) {
      return { status: 403, body: { error: "Forbidden" } };
    }
    try {
      await client.query(
        `UPDATE application SET
             interview_completion_status = 'incomplete_technical',
             reattempt_request_status = 'none',
             reattempt_candidate_reason_code = NULL,
             reattempt_candidate_reason_text = NULL,
             reattempt_hr_reason_code = NULL,
             reattempt_hr_notes = NULL,
             reattempt_requested_at = NULL,
             reattempt_resolved_at = NULL,
             reattempt_resolved_by_hr_id = NULL
           WHERE id = $1`,
        [applicationId],
      );
    } catch (e) {
      if (e.code === "42703") {
        return {
          status: 503,
          body: { error: "Reattempt migration not applied" },
        };
      }
      throw e;
    }
    await client.query(
      `INSERT INTO audit_event (id, occurred_at, actor, action, target_ref, details)
         VALUES ($1, NOW(), $2, $3, $4, $5)`,
      [
        auditId(),
        row.candidate_id,
        "interview.incomplete_technical",
        `application:${applicationId}`,
        JSON.stringify({
          applicationId,
          label: "Incomplete – Technical Failure",
          clientDetail,
        }),
      ],
    );
    return { status: 200, body: { ok: true, applicationId } };
  } finally {
    client.release();
  }
}

const INTERVIEW_DIFFICULTIES = new Set(["easy", "medium", "hard"]);
function readInterviewDifficulty() {
  const raw = String(process.env.INTERVIEW_DIFFICULTY || "").trim().toLowerCase();
  return INTERVIEW_DIFFICULTIES.has(raw) ? raw : "medium";
}
function readAiFollowUpCount() {
  const n = parseInt(process.env.INTERVIEW_AI_FOLLOWUP_COUNT, 10);
  if (!Number.isFinite(n)) return 12;
  return Math.min(30, Math.max(1, n));
}

function createVoiceBotRouter(pool) {
  const r = express.Router();
  const auth = voiceBotAuth();

  r.get("/interview-script/:applicationId", auth, async (req, res) => {
    const applicationId = parseInt(req.params.applicationId, 10);
    if (!Number.isFinite(applicationId)) {
      res.status(400).json({ error: "Invalid application id" });
      return;
    }
    const client = await pool.connect();
    try {
      const appRes = await client.query(
        `SELECT a.id, a.job_id, a.candidate_id,
                c.name AS candidate_name,
                j.title AS job_title, j.description AS job_description,
                j.requirements AS job_requirements
         FROM application a
         JOIN candidate c ON c.id = a.candidate_id
         LEFT JOIN job j ON j.id = a.job_id
         WHERE a.id = $1`,
        [applicationId],
      );
      if (appRes.rows.length === 0) {
        res.status(404).json({ error: "Application not found" });
        return;
      }
      const row = appRes.rows[0];
      if (!req.voiceBotService && row.candidate_id !== req.candidateId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      let companyName = "Indira IVF";
      try {
        const org = await client.query(
          "SELECT company_name FROM organization_setting WHERE singleton = 1",
        );
        if (org.rows[0]?.company_name) {
          companyName = org.rows[0].company_name;
        }
      } catch (_) {}

      const vars = {
        candidateName: row.candidate_name || "",
        jobTitle: row.job_title || "",
        companyName,
      };

      let jiq;
      try {
        jiq = await client.query(
          `SELECT id, question, question_type, question_phase, display_order
           FROM job_interview_questions WHERE job_id = $1 ORDER BY display_order`,
          [row.job_id],
        );
      } catch (e) {
        try {
          jiq = await client.query(
            `SELECT id, question, question_type, display_order
             FROM job_interview_questions WHERE job_id = $1 ORDER BY display_order`,
            [row.job_id],
          );
          jiq.rows = jiq.rows.map((q) => ({ ...q, question_phase: "role" }));
        } catch (_e2) {
          jiq = { rows: [] };
        }
      }

      const built = buildInterviewScriptFromRows(jiq.rows, vars);

      res.json({
        applicationId: Number(row.id),
        candidateName: row.candidate_name,
        jobTitle: row.job_title || "",
        jobDescription: row.job_description || "",
        jobRequirements: row.job_requirements || "",
        companyName,
        opening: built.opening,
        role: built.role,
        closing: built.closing,
        questions: built.questions,
        doNotRepeatTopics: built.doNotRepeatTopics,
        fallbackUsed: built.fallbackUsed,
        aiDifficulty: readInterviewDifficulty(),
        aiFollowUpCount: readAiFollowUpCount(),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    } finally {
      client.release();
    }
  });

  r.post("/interview-answers", auth, async (req, res) => {
    const { applicationId, answers, finalizeInterview, attemptId: attemptIdRaw } =
      req.body || {};
    const appId = parseInt(applicationId, 10);
    if (!Number.isFinite(appId) || !Array.isArray(answers)) {
      res.status(400).json({ error: "applicationId and answers[] required" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const appRes = await client.query(
        "SELECT a.id, a.job_id, a.candidate_id FROM application a WHERE a.id = $1",
        [appId],
      );
      if (appRes.rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Application not found" });
        return;
      }
      const appRow = appRes.rows[0];
      if (!req.voiceBotService && appRow.candidate_id !== req.candidateId) {
        await client.query("ROLLBACK");
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      let attemptId = parseInt(attemptIdRaw, 10);
      if (Number.isFinite(attemptId)) {
        try {
          const chk = await client.query(
            "SELECT id FROM interview_attempts WHERE id = $1 AND application_id = $2",
            [attemptId, appId],
          );
          if (chk.rows.length === 0) attemptId = NaN;
        } catch (e) {
          if (e.code === "42P01") attemptId = NaN;
          else if (e.code !== "42703") throw e;
        }
      }
      if (!Number.isFinite(attemptId)) {
        attemptId = await getOrCreateInterviewAttempt(client, appId);
      }
      const requireAttempt = await interviewAnswersRequireAttemptId(client);
      if (requireAttempt && attemptId == null) {
        await client.query("ROLLBACK");
        res.status(503).json({
          error:
            "Interview attempts are required but interview_attempts table is missing or misconfigured. Run database/migration_interview_attempts.sql",
        });
        return;
      }

      let totalDuration = 0;
      for (const a of answers) {
        const qtext = String(a.questionText || "").trim();
        if (!qtext) continue;
        const qid =
          a.questionId != null && Number(a.questionId) > 0
            ? parseInt(a.questionId, 10)
            : null;
        const atext = a.answerText != null ? String(a.answerText) : null;
        const audioUrl = a.audioUrl != null ? String(a.audioUrl) : null;
        const dur =
          a.durationSeconds != null ? parseInt(a.durationSeconds, 10) : null;
        if (dur && Number.isFinite(dur) && dur > 0) totalDuration += dur;

        await upsertInterviewAnswer(client, {
          applicationId: appId,
          attemptId,
          questionId: qid,
          questionText: qtext,
          answerText: atext,
          audioUrl,
          durationSeconds: dur,
        });
      }

      const needRes = await client.query(
        `SELECT COUNT(*)::int AS n FROM job_interview_questions WHERE job_id = $1`,
        [appRow.job_id],
      );
      let expected = needRes.rows[0]?.n ?? 0;
      if (expected === 0) expected = getFallbackQuestionTexts().length;

      const answered = await countInterviewAnswers(client, appId, attemptId);

      const shouldFinalize =
        finalizeInterview === true && answered >= expected;

      let interviewFinalized = false;
      if (shouldFinalize) {
        try {
          const up = await client.query(
            `UPDATE application
             SET recruitment_stage = 'screening'
             WHERE id = $1 AND recruitment_stage = 'applied'
             RETURNING id`,
            [appId],
          );
          if (up.rowCount > 0) {
            try {
              await client.query(
                `INSERT INTO application_stage_history (application_id, from_stage, to_stage, reason)
                 VALUES ($1, 'applied', 'screening', 'voice_bot.interview_complete')`,
                [appId],
              );
            } catch (_) {}
            await client.query(
              `INSERT INTO audit_event (id, occurred_at, actor, action, target_ref, details)
               VALUES ($1, NOW(), $2, $3, $4, $5)`,
              [
                auditId(),
                req.voiceBotService ? "voice_bot" : appRow.candidate_id,
                "voice_bot.interview_complete",
                `application:${appId}`,
                JSON.stringify({
                  applicationId: appId,
                  questionCount: expected,
                  totalDurationSeconds: totalDuration,
                }),
              ],
            );
          }
        } catch (_) {
          /* recruitment_stage column / migration optional */
        }
        await markApplicationInterviewComplete(client, {
          applicationId: appId,
          candidateId: appRow.candidate_id,
          clearReattempt: true,
        });
        await completeInterviewAttempt(client, attemptId);
        interviewFinalized = true;
      }

      await client.query("COMMIT");
      if (interviewFinalized && appRow.job_id) {
        void sendInterviewCompletionEmail(pool, appRow.candidate_id, {
          jobId: appRow.job_id,
          applicationId: appId,
        }).catch((err) => {
          console.error("Completion interview email failed:", err.message || err);
        });
      }
      res.json({
        ok: true,
        answered,
        expected,
        attemptId: attemptId ?? undefined,
        screeningUpdated: answered >= expected,
      });
    } catch (e) {
      await client.query("ROLLBACK");
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    } finally {
      client.release();
    }
  });

  r.post("/interview-session-start", auth, async (req, res) => {
    const applicationId = parseInt(req.body?.applicationId, 10);
    if (!Number.isFinite(applicationId)) {
      res.status(400).json({ error: "applicationId required" });
      return;
    }
    const client = await pool.connect();
    try {
      let row;
      try {
        const appRes = await client.query(
          `SELECT id, candidate_id, interview_completion_status, reattempt_request_status,
                  interview_completed_at, reattempt_resolved_at, reattempt_hr_reason_code
           FROM application WHERE id = $1`,
          [applicationId],
        );
        if (appRes.rows.length === 0) {
          res.status(404).json({ error: "Application not found" });
          return;
        }
        row = appRes.rows[0];
      } catch (e) {
        if (e.code !== "42703") throw e;
        const appRes = await client.query(
          "SELECT id, candidate_id, interview_completion_status, reattempt_request_status FROM application WHERE id = $1",
          [applicationId],
        );
        if (appRes.rows.length === 0) {
          res.status(404).json({ error: "Application not found" });
          return;
        }
        row = appRes.rows[0];
      }
      if (!req.voiceBotService && row.candidate_id !== req.candidateId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (reattemptDeadlineExpired(row)) {
        res.status(403).json({ error: REATTEMPT_DEADLINE_EXPIRED_MESSAGE });
        return;
      }
      try {
        await client.query(
          `UPDATE application SET interview_completion_status = 'in_progress'
           WHERE id = $1
             AND (
               interview_completion_status IN ('not_started', 'in_progress')
               OR (interview_completion_status = 'incomplete_technical' AND reattempt_request_status = 'approved')
               OR (interview_completion_status = 'completed' AND reattempt_request_status = 'approved')
             )`,
          [applicationId],
        );
      } catch (_) {
        /* optional columns */
      }
      const attemptId = await getOrCreateInterviewAttempt(client, applicationId);
      res.json({
        ok: true,
        applicationId,
        attemptId: attemptId ?? undefined,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    } finally {
      client.release();
    }
  });

  r.post("/interview-session-abandon", auth, async (req, res) => {
    const applicationId = parseInt(req.body?.applicationId, 10);
    const clientDetail = req.body?.clientDetail
      ? String(req.body.clientDetail).slice(0, 2000)
      : "";
    if (!Number.isFinite(applicationId)) {
      res.status(400).json({ error: "applicationId required" });
      return;
    }
    try {
      const out = await interviewSessionAbandonCore(
        pool,
        applicationId,
        clientDetail,
        {
          voiceBotService: !!req.voiceBotService,
          candidateId: req.candidateId,
        },
      );
      res.status(out.status).json(out.body);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  /** Same as interview-session-abandon for navigator.sendBeacon (no custom headers).
   *  Auth: session cookie (sent automatically by beacons) or legacy JWT in JSON body. */
  r.post("/interview-session-abandon-beacon", async (req, res) => {
    const body = req.body || {};
    const applicationId = parseInt(body.applicationId, 10);
    const clientDetail = body.clientDetail
      ? String(body.clientDetail).slice(0, 2000)
      : "";
    const token =
      (body.token ? String(body.token).trim() : "") ||
      readAuthTokenFromRequest(req) ||
      "";
    if (!Number.isFinite(applicationId)) {
      res.status(400).json({ error: "applicationId required" });
      return;
    }
    if (!token) {
      res.status(401).json({ error: "token required" });
      return;
    }
    const roles = voiceBotTokenRoles(token);
    if (!roles) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const out = await interviewSessionAbandonCore(
        pool,
        applicationId,
        clientDetail,
        {
          voiceBotService: !!roles.voiceBotService,
          candidateId: roles.candidateId,
        },
      );
      res.status(out.status).json(out.body);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  r.post("/reattempt-request", auth, async (req, res) => {
    const applicationId = parseInt(req.body?.applicationId, 10);
    const candidateReasonCode = req.body?.candidateReasonCode
      ? String(req.body.candidateReasonCode).slice(0, 64)
      : "";
    const candidateReasonText = req.body?.candidateReasonText
      ? String(req.body.candidateReasonText).slice(0, 4000)
      : "";
    if (!Number.isFinite(applicationId) || !candidateReasonCode) {
      res
        .status(400)
        .json({ error: "applicationId and candidateReasonCode required" });
      return;
    }
    const client = await pool.connect();
    try {
      const appRes = await client.query(
        `SELECT id, candidate_id, interview_completion_status, reattempt_request_status
         FROM application WHERE id = $1`,
        [applicationId],
      );
      if (appRes.rows.length === 0) {
        res.status(404).json({ error: "Application not found" });
        return;
      }
      const row = appRes.rows[0];
      if (!req.voiceBotService && row.candidate_id !== req.candidateId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const ic = row.interview_completion_status || "not_started";
      const rs = row.reattempt_request_status || "none";
      if (rs === "pending") {
        res.status(409).json({ error: "Request already pending" });
        return;
      }
      if (rs === "approved") {
        res.status(409).json({ error: "Use approved slot to interview first" });
        return;
      }
      const canRequest =
        ic === "incomplete_technical" || ic === "completed";
      if (!canRequest) {
        res.status(400).json({
          error:
            "Reattempt request is only available after an interrupted interview or a completed interview (for reassessment)",
        });
        return;
      }
      await client.query(
        `UPDATE application SET
           reattempt_request_status = 'pending',
           reattempt_candidate_reason_code = $2,
           reattempt_candidate_reason_text = $3,
           reattempt_requested_at = NOW(),
           reattempt_hr_reason_code = NULL,
           reattempt_hr_notes = NULL,
           reattempt_resolved_at = NULL,
           reattempt_resolved_by_hr_id = NULL
         WHERE id = $1 AND reattempt_request_status IN ('none', 'rejected')`,
        [applicationId, candidateReasonCode, candidateReasonText || null],
      );
      await client.query(
        `INSERT INTO audit_event (id, occurred_at, actor, action, target_ref, details)
         VALUES ($1, NOW(), $2, $3, $4, $5)`,
        [
          auditId(),
          row.candidate_id,
          "interview.reattempt_requested",
          `application:${applicationId}`,
          JSON.stringify({
            applicationId,
            candidateReasonCode,
            hasText: Boolean(candidateReasonText),
          }),
        ],
      );
      res.json({ ok: true, applicationId });
    } catch (e) {
      if (e.code === "42703") {
        res.status(503).json({ error: "Reattempt migration not applied" });
        return;
      }
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    } finally {
      client.release();
    }
  });

  return r;
}

function createAdminInterviewRouter(pool) {
  const r = express.Router();

  r.get(
    "/applications/:applicationId/interview-answers",
    requireHr,
    async (req, res) => {
      const applicationId = parseInt(req.params.applicationId, 10);
      if (!Number.isFinite(applicationId)) {
        res.status(400).json({ error: "Invalid application id" });
        return;
      }
      const client = await pool.connect();
      try {
        let rows;
        try {
          rows = await client.query(
            `SELECT ia.id, ia.question_id, ia.question_text, ia.answer_text, ia.audio_url,
                    ia.duration_seconds, ia.asked_at, ia.answered_at,
                    jiq.question_type, jiq.question_phase
             FROM interview_answers ia
             LEFT JOIN job_interview_questions jiq ON jiq.id = ia.question_id
             WHERE ia.application_id = $1
             ORDER BY ia.asked_at NULLS LAST, ia.id`,
            [applicationId],
          );
        } catch (e) {
          if (e.code === "42703") {
            rows = await client.query(
              `SELECT ia.id, ia.question_id, ia.question_text, ia.answer_text, ia.audio_url,
                      ia.duration_seconds, ia.asked_at, ia.answered_at,
                      jiq.question_type
               FROM interview_answers ia
               LEFT JOIN job_interview_questions jiq ON jiq.id = ia.question_id
               WHERE ia.application_id = $1
               ORDER BY ia.asked_at NULLS LAST, ia.id`,
              [applicationId],
            );
          } else throw e;
        }
        res.json({
          applicationId,
          answers: rows.rows.map((x, i) => ({
            index: i + 1,
            questionId: x.question_id,
            questionText: x.question_text,
            questionType: x.question_type || "open_ended",
            questionPhase: x.question_phase || null,
            answerText: x.answer_text,
            audioUrl: x.audio_url,
            durationSeconds: x.duration_seconds,
            askedAt: x.asked_at,
            answeredAt: x.answered_at,
          })),
        });
      } catch (e) {
        if (e.code === "42P01") {
          res.json({ applicationId, answers: [] });
          return;
        }
        console.error(e);
        res.status(500).json({ error: String(e.message || e) });
      } finally {
        client.release();
      }
    },
  );

  r.get("/reattempt-pending-count", requireHr, async (_req, res) => {
    const client = await pool.connect();
    try {
      const r0 = await client.query(
        `SELECT COUNT(*)::int AS n FROM application WHERE reattempt_request_status = 'pending'`,
      );
      res.json({ count: r0.rows[0]?.n ?? 0 });
    } catch (e) {
      if (e.code === "42703") {
        res.json({ count: 0 });
        return;
      }
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    } finally {
      client.release();
    }
  });

  r.get("/reattempt-pending", requireHr, async (_req, res) => {
    const client = await pool.connect();
    try {
      const rows = await client.query(
        `SELECT a.id AS "applicationId", a.candidate_id AS "candidateId", a.job_id AS "jobId",
                a.reattempt_requested_at AS "requestedAt",
                a.reattempt_candidate_reason_code AS "candidateReasonCode",
                a.reattempt_candidate_reason_text AS "candidateReasonText",
                c.name AS "candidateName", c.email AS "candidateEmail",
                j.title AS "jobTitle"
         FROM application a
         JOIN candidate c ON c.id = a.candidate_id
         LEFT JOIN job j ON j.id = a.job_id
         WHERE a.reattempt_request_status = 'pending'
         ORDER BY a.reattempt_requested_at DESC NULLS LAST, a.id DESC`,
      );
      res.json({ items: rows.rows });
    } catch (e) {
      if (e.code === "42703") {
        res.json({ items: [] });
        return;
      }
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    } finally {
      client.release();
    }
  });

  r.post(
    "/applications/:applicationId/reattempt-resolve",
    requireHr,
    async (req, res) => {
      const applicationId = parseInt(req.params.applicationId, 10);
      const decision = String(req.body?.decision || "").toLowerCase();
      const hrReasonCode = String(req.body?.hrReasonCode || "").trim();
      const hrNotes = req.body?.hrNotes
        ? String(req.body.hrNotes).slice(0, 4000)
        : "";
      if (!Number.isFinite(applicationId) || !["approve", "reject"].includes(decision)) {
        res.status(400).json({ error: "decision must be approve or reject" });
        return;
      }
      if (!HR_REATTEMPT_REASON_CODES.has(hrReasonCode)) {
        res.status(400).json({ error: "Invalid or missing hrReasonCode" });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const appRes = await client.query(
          `SELECT id, candidate_id, reattempt_request_status FROM application WHERE id = $1`,
          [applicationId],
        );
        if (appRes.rows.length === 0) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "Application not found" });
          return;
        }
        const appRow = appRes.rows[0];
        if (appRow.reattempt_request_status !== "pending") {
          await client.query("ROLLBACK");
          res.status(409).json({ error: "No pending reattempt for this application" });
          return;
        }
        if (decision === "approve") {
          await client.query(
            `DELETE FROM interview_answers WHERE application_id = $1`,
            [applicationId],
          );
          try {
            await client.query(
              `DELETE FROM transcript_line WHERE application_id = $1`,
              [applicationId],
            );
          } catch (_) {
            /* transcript application_id optional */
          }
          await client.query(
            `UPDATE application SET
               interview_completion_status = 'not_started',
               reattempt_request_status = 'none',
               reattempt_candidate_reason_code = NULL,
               reattempt_candidate_reason_text = NULL,
               reattempt_requested_at = NULL,
               reattempt_hr_reason_code = $2,
               reattempt_hr_notes = $3,
               reattempt_resolved_at = NOW(),
               reattempt_resolved_by_hr_id = $4,
               interview_completed_at = NULL
             WHERE id = $1`,
            [applicationId, hrReasonCode, hrNotes || null, req.hrId],
          );
        } else {
          await client.query(
            `UPDATE application SET
               reattempt_request_status = 'rejected',
               reattempt_hr_reason_code = $2,
               reattempt_hr_notes = $3,
               reattempt_resolved_at = NOW(),
               reattempt_resolved_by_hr_id = $4
             WHERE id = $1`,
            [applicationId, hrReasonCode, hrNotes || null, req.hrId],
          );
        }
        await client.query(
          `INSERT INTO audit_event (id, occurred_at, actor, action, target_ref, details)
           VALUES ($1, NOW(), $2, $3, $4, $5)`,
          [
            auditId(),
            req.hrId,
            decision === "approve"
              ? "interview.reattempt_approved"
              : "interview.reattempt_rejected",
            `application:${applicationId}`,
            JSON.stringify({
              applicationId,
              candidateId: appRow.candidate_id,
              hrReasonCode,
              hasNotes: Boolean(hrNotes),
            }),
          ],
        );
        await client.query("COMMIT");
        if (decision === "approve") {
          void sendReattemptApprovedEmail(pool, applicationId).catch((err) =>
            console.error("[reattempt-email]", applicationId, "approve", err),
          );
        } else {
          void sendReattemptRejectedEmail(pool, applicationId).catch((err) =>
            console.error("[reattempt-email]", applicationId, "reject", err),
          );
        }
        res.json({ ok: true, applicationId, decision });
      } catch (e) {
        await client.query("ROLLBACK");
        if (e.code === "42703") {
          res.status(503).json({ error: "Reattempt migration not applied" });
          return;
        }
        console.error(e);
        res.status(500).json({ error: String(e.message || e) });
      } finally {
        client.release();
      }
    },
  );

  return r;
}

module.exports = {
  createVoiceBotRouter,
  createAdminInterviewRouter,
  requireHr,
};
