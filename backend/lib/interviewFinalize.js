/**
 * Single place to mark a voice/chat interview complete in Postgres:
 * application timestamps + candidate status + optional transcript from voice Q&A.
 */

const CANDIDATE_STATUSES_PROMOTABLE = new Set([
  "REGISTERED",
  "APPLIED",
  "SCHEDULED",
  "SHORTLISTED",
]);

async function syncVoiceAnswersToTranscript(client, candidateId, applicationId) {
  let existing = 0;
  try {
    const ex = await client.query(
      `SELECT COUNT(*)::int AS n FROM transcript_line
       WHERE candidate_id = $1 AND application_id = $2`,
      [candidateId, applicationId],
    );
    existing = ex.rows[0]?.n ?? 0;
  } catch (e) {
    if (e.code === "42703") {
      const ex = await client.query(
        `SELECT COUNT(*)::int AS n FROM transcript_line WHERE candidate_id = $1`,
        [candidateId],
      );
      existing = ex.rows[0]?.n ?? 0;
    } else if (e.code === "42P01") {
      return;
    } else {
      throw e;
    }
  }
  if (existing > 0) return;

  let rows;
  try {
    rows = await client.query(
      `SELECT question_text, answer_text
       FROM interview_answers
       WHERE application_id = $1
       ORDER BY asked_at NULLS LAST, id`,
      [applicationId],
    );
  } catch (e) {
    if (e.code === "42P01") return;
    throw e;
  }
  if (!rows.rows.length) return;

  let phaseRows;
  try {
    phaseRows = await client.query(
      `SELECT ia.question_text, jiq.question_phase
       FROM interview_answers ia
       LEFT JOIN job_interview_questions jiq ON jiq.id = ia.question_id
       WHERE ia.application_id = $1
       ORDER BY ia.asked_at NULLS LAST, ia.id`,
      [applicationId],
    );
  } catch (_) {
    phaseRows = { rows: [] };
  }
  const phaseByQuestion = new Map(
    phaseRows.rows.map((r) => [
      String(r.question_text || "").trim().toLowerCase(),
      r.question_phase || "role",
    ]),
  );

  const lines = [];
  for (const row of rows.rows) {
    const q = String(row.question_text || "").trim();
    const a = String(row.answer_text || "").trim();
    const ph = phaseByQuestion.get(q.toLowerCase()) || "role";
    if (q) lines.push({ role: "ai", text: q, phase: ph });
    if (a) lines.push({ role: "user", text: a, phase: ph });
  }
  if (!lines.length) return;

  try {
    await client.query(
      "DELETE FROM transcript_line WHERE candidate_id = $1 AND application_id = $2",
      [candidateId, applicationId],
    );
  } catch (e) {
    if (e.code !== "42703") throw e;
  }

  let idx = 0;
  for (const line of lines) {
    const role = line.role === "ai" ? "ai" : "user";
    const text = line.text || "";
    try {
      await client.query(
        `INSERT INTO transcript_line (candidate_id, application_id, line_index, role, content)
         VALUES ($1,$2,$3,$4,$5)`,
        [candidateId, applicationId, idx, role, text],
      );
    } catch (e) {
      if (e.code === "42703") {
        await client.query(
          `INSERT INTO transcript_line (candidate_id, line_index, role, content)
           VALUES ($1,$2,$3,$4)`,
          [candidateId, idx, role, text],
        );
      } else throw e;
    }
    idx += 1;
  }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {{ applicationId: number, candidateId: string, clearReattempt?: boolean }} opts
 */
async function markApplicationInterviewComplete(client, opts) {
  const applicationId = Number(opts.applicationId);
  const candidateId = String(opts.candidateId || "");
  if (!Number.isFinite(applicationId) || !candidateId) return;

  const clearReattempt = opts.clearReattempt !== false;

  try {
    if (clearReattempt) {
      await client.query(
        `UPDATE application SET
           interview_completion_status = 'completed',
           interview_completed_at = COALESCE(interview_completed_at, NOW()),
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
    } else {
      await client.query(
        `UPDATE application SET
           interview_completion_status = 'completed',
           interview_completed_at = COALESCE(interview_completed_at, NOW())
         WHERE id = $1`,
        [applicationId],
      );
    }
  } catch (e) {
    if (e.code === "42703") {
      await client.query(
        `UPDATE application SET
           interview_completed_at = COALESCE(interview_completed_at, NOW())
         WHERE id = $1`,
        [applicationId],
      );
    } else {
      throw e;
    }
  }

  const cand = await client.query("SELECT status FROM candidate WHERE id = $1", [
    candidateId,
  ]);
  if (cand.rows.length > 0) {
    const st = cand.rows[0].status;
    if (CANDIDATE_STATUSES_PROMOTABLE.has(st)) {
      await client.query(
        `UPDATE candidate SET status = 'INTERVIEWED', updated_at = NOW() WHERE id = $1`,
        [candidateId],
      );
    }
  }

  await syncVoiceAnswersToTranscript(client, candidateId, applicationId);
}

/** Backfill rows that were finalized before this helper existed. */
async function repairCompletedInterviewsForCandidate(client, candidateId) {
  let apps;
  try {
    apps = await client.query(
      `SELECT id FROM application
       WHERE candidate_id = $1 AND interview_completion_status = 'completed'`,
      [candidateId],
    );
  } catch (e) {
    if (e.code === "42703") return;
    throw e;
  }
  for (const row of apps.rows) {
    await markApplicationInterviewComplete(client, {
      applicationId: row.id,
      candidateId,
      clearReattempt: false,
    });
  }
}

async function repairCompletedInterviewsForCandidateIds(pool, candidateIds) {
  if (!candidateIds?.length) return;
  const client = await pool.connect();
  try {
    for (const id of candidateIds) {
      await repairCompletedInterviewsForCandidate(client, id);
    }
  } finally {
    client.release();
  }
}

module.exports = {
  markApplicationInterviewComplete,
  syncVoiceAnswersToTranscript,
  repairCompletedInterviewsForCandidate,
  repairCompletedInterviewsForCandidateIds,
};
