/** Interview attempt lifecycle for voice-bot answer persistence. */

async function interviewAnswersRequireAttemptId(client) {
  try {
    const r = await client.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'interview_answers' AND column_name = 'attempt_id'`,
    );
    if (r.rows.length === 0) return false;
    return r.rows[0].is_nullable === "NO";
  } catch (_e) {
    return false;
  }
}

async function findOpenInterviewAttempt(client, applicationId) {
  const variants = [
    `SELECT id FROM interview_attempts
     WHERE application_id = $1 AND completed_at IS NULL
     ORDER BY id DESC LIMIT 1`,
    `SELECT id FROM interview_attempts
     WHERE application_id = $1 AND status = 'in_progress'
     ORDER BY id DESC LIMIT 1`,
  ];
  for (const sql of variants) {
    try {
      const r = await client.query(sql, [applicationId]);
      if (r.rows.length > 0) return Number(r.rows[0].id);
    } catch (e) {
      if (e.code === "42P01") return null;
      if (e.code === "42703") continue;
      throw e;
    }
  }
  return null;
}

async function insertInterviewAttempt(client, applicationId) {
  const inserts = [
    {
      // Production RDS schema requires attempt_number (NOT NULL).
      sql: `INSERT INTO interview_attempts (application_id, attempt_number, started_at, status)
            SELECT $1,
                   COALESCE(
                     (SELECT MAX(attempt_number) FROM interview_attempts WHERE application_id = $1),
                     0
                   ) + 1,
                   NOW(),
                   'in_progress'
            RETURNING id`,
      params: [applicationId],
    },
    {
      sql: `INSERT INTO interview_attempts (application_id, started_at, status)
            VALUES ($1, NOW(), 'in_progress') RETURNING id`,
      params: [applicationId],
    },
    {
      sql: `INSERT INTO interview_attempts (application_id, started_at)
            VALUES ($1, NOW()) RETURNING id`,
      params: [applicationId],
    },
    {
      sql: `INSERT INTO interview_attempts (application_id) VALUES ($1) RETURNING id`,
      params: [applicationId],
    },
  ];
  for (const { sql, params } of inserts) {
    try {
      const r = await client.query(sql, params);
      return Number(r.rows[0].id);
    } catch (e) {
      if (e.code === "42P01") return null;
      if (e.code === "42703") continue;
      throw e;
    }
  }
  return null;
}

/**
 * Reuse an in-progress attempt or create a new one. Returns null if attempts table missing.
 */
async function getOrCreateInterviewAttempt(client, applicationId) {
  const open = await findOpenInterviewAttempt(client, applicationId);
  if (open != null) return open;
  return insertInterviewAttempt(client, applicationId);
}

async function completeInterviewAttempt(client, attemptId) {
  if (attemptId == null) return;
  const updates = [
    `UPDATE interview_attempts SET completed_at = NOW(), status = 'completed' WHERE id = $1`,
    `UPDATE interview_attempts SET completed_at = NOW() WHERE id = $1`,
    `UPDATE interview_attempts SET status = 'completed' WHERE id = $1`,
  ];
  for (const sql of updates) {
    try {
      await client.query(sql, [attemptId]);
      return;
    } catch (e) {
      if (e.code === "42P01") return;
      if (e.code === "42703") continue;
      throw e;
    }
  }
}

async function upsertInterviewAnswer(
  client,
  { applicationId, attemptId, questionId, questionText, answerText, audioUrl, durationSeconds },
) {
  const appId = applicationId;
  const qid = questionId;
  const qtext = questionText;
  const atext = answerText;
  const audio = audioUrl;
  const dur = durationSeconds;

  if (attemptId != null) {
    try {
      await client.query(
        `INSERT INTO interview_answers
           (application_id, attempt_id, question_id, question_text, answer_text, audio_url, duration_seconds, answered_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, NOW())
         ON CONFLICT (application_id, question_text)
         DO UPDATE SET
           attempt_id = COALESCE(EXCLUDED.attempt_id, interview_answers.attempt_id),
           question_id = COALESCE(EXCLUDED.question_id, interview_answers.question_id),
           answer_text = EXCLUDED.answer_text,
           audio_url = COALESCE(EXCLUDED.audio_url, interview_answers.audio_url),
           duration_seconds = COALESCE(EXCLUDED.duration_seconds, interview_answers.duration_seconds),
           answered_at = NOW()`,
        [appId, attemptId, qid, qtext, atext, audio, dur],
      );
      return;
    } catch (e) {
      if (e.code !== "42703" && e.code !== "42P01") throw e;
    }
  }

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
    [appId, qid, qtext, atext, audio, dur],
  );
}

async function countInterviewAnswers(client, applicationId, attemptId) {
  if (attemptId != null) {
    try {
      const r = await client.query(
        `SELECT COUNT(*)::int AS n FROM interview_answers
         WHERE application_id = $1 AND attempt_id = $2`,
        [applicationId, attemptId],
      );
      return r.rows[0]?.n ?? 0;
    } catch (e) {
      if (e.code !== "42703") throw e;
    }
  }
  const r = await client.query(
    `SELECT COUNT(*)::int AS n FROM interview_answers WHERE application_id = $1`,
    [applicationId],
  );
  return r.rows[0]?.n ?? 0;
}

module.exports = {
  interviewAnswersRequireAttemptId,
  getOrCreateInterviewAttempt,
  completeInterviewAttempt,
  upsertInterviewAnswer,
  countInterviewAnswers,
};
