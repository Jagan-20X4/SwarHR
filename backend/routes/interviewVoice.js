const express = require("express");
const crypto = require("crypto");
const { voiceBotAuth } = require("../middleware/serviceToken");
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

  return r;
}

module.exports = {
  createVoiceBotRouter,
  createAdminInterviewRouter,
  requireHr,
};
