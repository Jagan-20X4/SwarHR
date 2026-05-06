const express = require("express");
const crypto = require("crypto");
const { voiceBotAuth, voiceBotTokenRoles } = require("../middleware/serviceToken");
const { verify } = require("../jwt");
const { getFallbackQuestionTexts } = require("../lib/fallbackQuestions");

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
                j.title AS job_title, j.description AS job_description
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

      let jiq;
      try {
        jiq = await client.query(
          `SELECT id, question, question_type AS "questionType", display_order
           FROM job_interview_questions WHERE job_id = $1 ORDER BY display_order`,
          [row.job_id],
        );
      } catch (e) {
        jiq = { rows: [] };
      }

      let fallbackUsed = false;
      let questions = jiq.rows.map((q) => ({
        id: q.id,
        order: q.display_order,
        question: q.question,
        type: q.questionType || "open_ended",
      }));

      if (questions.length === 0) {
        fallbackUsed = true;
        const texts = getFallbackQuestionTexts();
        questions = texts.map((text, i) => ({
          id: -(i + 1),
          order: i + 1,
          question: text,
          type: "open_ended",
        }));
      }

      res.json({
        applicationId: Number(row.id),
        candidateName: row.candidate_name,
        jobTitle: row.job_title || "",
        jobDescription: row.job_description || "",
        questions,
        fallbackUsed,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    } finally {
      client.release();
    }
  });

  r.post("/interview-answers", auth, async (req, res) => {
    const { applicationId, answers } = req.body || {};
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

        await client.query(
          `INSERT INTO interview_answers
            (application_id, question_id, question_text, answer_text, audio_url, duration_seconds, answered_at)
           VALUES ($1,$2,$3,$4,$5,$6, NOW())
           ON CONFLICT (application_id, question_text)
           DO UPDATE SET
             question_id = COALESCE(EXCLUDED.question_id, interview_answers.question_id),
             answer_text = EXCLUDED.answer_text,
             audio_url = COALESCE(EXCLUDED.audio_url, interview_answers.audio_url),
             duration_seconds = COALESCE(EXCLUDED.duration_seconds, interview_answers.duration_seconds),
             answered_at = NOW()`,
          [appId, qid, qtext, atext, audioUrl, dur],
        );
      }

      const needRes = await client.query(
        `SELECT COUNT(*)::int AS n FROM job_interview_questions WHERE job_id = $1`,
        [appRow.job_id],
      );
      let expected = needRes.rows[0]?.n ?? 0;
      if (expected === 0) expected = getFallbackQuestionTexts().length;

      const cntRes = await client.query(
        `SELECT COUNT(*)::int AS n FROM interview_answers WHERE application_id = $1`,
        [appId],
      );
      const answered = cntRes.rows[0]?.n ?? 0;

      if (answered >= expected) {
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
        try {
          await client.query(
            `UPDATE application SET
               interview_completion_status = 'completed',
               reattempt_request_status = 'none',
               reattempt_candidate_reason_code = NULL,
               reattempt_candidate_reason_text = NULL,
               reattempt_hr_reason_code = NULL,
               reattempt_hr_notes = NULL,
               reattempt_requested_at = NULL,
               reattempt_resolved_at = NULL,
               reattempt_resolved_by_hr_id = NULL
             WHERE id = $1`,
            [appId],
          );
        } catch (_) {
          /* reattempt migration optional */
        }
      }

      await client.query("COMMIT");
      res.json({ ok: true, answered, expected, screeningUpdated: answered >= expected });
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
      const appRes = await client.query(
        "SELECT id, candidate_id, interview_completion_status, reattempt_request_status FROM application WHERE id = $1",
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
      res.json({ ok: true, applicationId });
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

  /** Same as interview-session-abandon but accepts JWT in JSON body for navigator.sendBeacon (no custom headers). */
  r.post("/interview-session-abandon-beacon", async (req, res) => {
    const body = req.body || {};
    const applicationId = parseInt(body.applicationId, 10);
    const clientDetail = body.clientDetail
      ? String(body.clientDetail).slice(0, 2000)
      : "";
    const token = body.token ? String(body.token).trim() : "";
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
        const rows = await client.query(
          `SELECT ia.id, ia.question_id, ia.question_text, ia.answer_text, ia.audio_url,
                  ia.duration_seconds, ia.asked_at, ia.answered_at,
                  jiq.question_type
           FROM interview_answers ia
           LEFT JOIN job_interview_questions jiq ON jiq.id = ia.question_id
           WHERE ia.application_id = $1
           ORDER BY ia.asked_at, ia.id`,
          [applicationId],
        );
        res.json({
          applicationId,
          answers: rows.rows.map((x, i) => ({
            index: i + 1,
            questionId: x.question_id,
            questionText: x.question_text,
            questionType: x.question_type || "open_ended",
            answerText: x.answer_text,
            audioUrl: x.audio_url,
            durationSeconds: x.duration_seconds,
            askedAt: x.asked_at,
            answeredAt: x.answered_at,
          })),
        }        );
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
