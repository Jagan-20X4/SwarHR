const { sendMail, isMailEnabled } = require("./mailer");
const {
  buildJobInviteLink,
  buildInterviewInviteLink,
  buildInterviewApplyEmail,
  buildInterviewReminderEmail,
  buildInterviewCompletionEmail,
  buildInterviewMissedEmail,
  buildHrShortlistEmail,
  buildHrRejectEmail,
  buildReattemptApprovedEmail,
  buildReattemptRejectedEmail,
  buildTalentPoolJoinEmail,
  buildCvAnalyserInviteEmail,
} = require("./applicationEmail");

function reattemptEmailAlreadySent(sentFor, resolvedAt) {
  if (!sentFor || !resolvedAt) return false;
  return (
    new Date(sentFor).getTime() === new Date(resolvedAt).getTime()
  );
}

const INTERVIEW_START_GRACE_MINUTES = Number(
  process.env.INTERVIEW_START_GRACE_MINUTES || 15,
);

async function loadApplicationContext(pool, candidateId, jobId, applicationId) {
  let appRes;
  try {
    appRes = await pool.query(
      `SELECT a.id, a.intro_email_sent_at, a.schedule_email_sent_for_at
       FROM application a
       WHERE a.candidate_id = $1 AND a.job_id = $2 AND a.id = $3`,
      [candidateId, jobId, applicationId],
    );
  } catch (e) {
    if (e.code !== "42703") throw e;
    appRes = await pool.query(
      `SELECT a.id FROM application a
       WHERE a.candidate_id = $1 AND a.job_id = $2 AND a.id = $3`,
      [candidateId, jobId, applicationId],
    );
    if (appRes.rows[0]) {
      appRes.rows[0].intro_email_sent_at = null;
      appRes.rows[0].schedule_email_sent_for_at = null;
    }
  }
  if (appRes.rows.length === 0) return null;

  const candRes = await pool.query(
    "SELECT name, email FROM candidate WHERE id = $1",
    [candidateId],
  );
  if (candRes.rows.length === 0) return null;

  const jobRes = await pool.query("SELECT title FROM job WHERE id = $1", [jobId]);
  const jobTitle = jobRes.rows[0]?.title || "the position";

  return {
    application: appRes.rows[0],
    candidateName: candRes.rows[0].name || "",
    candidateEmail: candRes.rows[0].email || "",
    jobTitle,
    interviewLink: buildInterviewInviteLink(jobId),
  };
}

async function loadApplicationContextFallback(pool, candidateId, jobId) {
  let appRes;
  try {
    appRes = await pool.query(
      `SELECT a.id, a.intro_email_sent_at, a.schedule_email_sent_for_at
       FROM application a
       WHERE a.candidate_id = $1 AND a.job_id = $2
       ORDER BY a.applied_at DESC NULLS LAST
       LIMIT 1`,
      [candidateId, jobId],
    );
  } catch (e) {
    if (e.code !== "42703") throw e;
    appRes = await pool.query(
      `SELECT a.id FROM application a
       WHERE a.candidate_id = $1 AND a.job_id = $2
       ORDER BY a.applied_at DESC NULLS LAST
       LIMIT 1`,
      [candidateId, jobId],
    );
    if (appRes.rows[0]) {
      appRes.rows[0].intro_email_sent_at = null;
      appRes.rows[0].schedule_email_sent_for_at = null;
    }
  }
  if (appRes.rows.length === 0) return null;
  const applicationId = Number(appRes.rows[0].id);
  return loadApplicationContext(pool, candidateId, jobId, applicationId);
}

async function sendIntroInterviewEmail(pool, candidateId, { jobId, applicationId }) {
  if (!candidateId || !jobId) {
    return { skipped: true, reason: "missing_params" };
  }

  let ctx = null;
  if (applicationId != null) {
    ctx = await loadApplicationContext(pool, candidateId, jobId, applicationId);
  } else {
    ctx = await loadApplicationContextFallback(pool, candidateId, jobId);
  }
  if (!ctx?.candidateEmail) {
    return { skipped: true, reason: "not_found" };
  }
  if (ctx.application.intro_email_sent_at) {
    return { skipped: true, reason: "already_sent" };
  }

  const { subject, body } = buildInterviewApplyEmail({
    candidateName: ctx.candidateName,
    jobTitle: ctx.jobTitle,
    interviewLink: ctx.interviewLink,
  });

  const result = await sendMail({
    to: ctx.candidateEmail,
    subject,
    text: body,
    context: "interview_intro",
  });
  if (result.skipped) return result;

  try {
    await pool.query(
      "UPDATE application SET intro_email_sent_at = NOW() WHERE id = $1",
      [ctx.application.id],
    );
  } catch (e) {
    if (e.code !== "42703") throw e;
  }

  return { ok: true, applicationId: ctx.application.id };
}

async function sendScheduledInterviewEmail(
  pool,
  candidateId,
  { jobId, applicationId, scheduledAt },
) {
  if (!candidateId || !jobId || !scheduledAt) {
    return { skipped: true, reason: "missing_params" };
  }

  let ctx = null;
  if (applicationId != null) {
    ctx = await loadApplicationContext(pool, candidateId, jobId, applicationId);
  } else {
    ctx = await loadApplicationContextFallback(pool, candidateId, jobId);
  }
  if (!ctx?.candidateEmail) {
    return { skipped: true, reason: "not_found" };
  }

  const schedKey = new Date(scheduledAt).toISOString();
  const prev = ctx.application.schedule_email_sent_for_at
    ? new Date(ctx.application.schedule_email_sent_for_at).toISOString()
    : null;
  if (prev === schedKey) {
    return { skipped: true, reason: "already_sent_for_slot" };
  }

  const { subject, body } = buildInterviewApplyEmail({
    candidateName: ctx.candidateName,
    jobTitle: ctx.jobTitle,
    interviewLink: ctx.interviewLink,
    scheduledAt,
  });

  const result = await sendMail({
    to: ctx.candidateEmail,
    subject,
    text: body,
    context: "interview_scheduled",
  });
  if (result.skipped) return result;

  try {
    await pool.query(
      "UPDATE application SET schedule_email_sent_for_at = $2::timestamptz WHERE id = $1",
      [ctx.application.id, scheduledAt],
    );
  } catch (e) {
    if (e.code !== "42703") throw e;
  }

  return { ok: true, applicationId: ctx.application.id };
}

async function sendTalentPoolAckEmail(entry) {
  const email = entry?.email && String(entry.email).trim();
  if (!email) return { skipped: true, reason: "no_email" };

  const { subject, body } = buildTalentPoolJoinEmail({
    candidateName: entry.name || "Candidate",
    desiredRoles: entry.desiredRoles,
  });

  return sendMail({ to: email, subject, text: body, context: "talent_pool_ack" });
}

async function sendInterviewReminderEmail(pool, applicationId) {
  if (!applicationId) {
    return { skipped: true, reason: "missing_params" };
  }

  let appRes;
  try {
    appRes = await pool.query(
      `SELECT a.id, a.candidate_id, a.job_id, a.interview_scheduled_at,
              a.interview_completed_at, a.reminder_email_sent_for_at
       FROM application a
       WHERE a.id = $1`,
      [applicationId],
    );
  } catch (e) {
    if (e.code === "42703") return { skipped: true, reason: "migration_pending" };
    throw e;
  }
  const app = appRes.rows[0];
  if (!app?.interview_scheduled_at) {
    return { skipped: true, reason: "not_scheduled" };
  }
  if (app.interview_completed_at) {
    return { skipped: true, reason: "interview_completed" };
  }

  const schedKey = new Date(app.interview_scheduled_at).toISOString();
  const prev = app.reminder_email_sent_for_at
    ? new Date(app.reminder_email_sent_for_at).toISOString()
    : null;
  if (prev === schedKey) {
    return { skipped: true, reason: "already_sent_for_slot" };
  }

  const now = Date.now();
  const schedMs = new Date(app.interview_scheduled_at).getTime();
  const windowStartMs = schedMs - 30 * 60 * 1000;
  if (now < windowStartMs || now >= schedMs) {
    return { skipped: true, reason: "outside_reminder_window" };
  }

  const ctx = await loadApplicationContext(
    pool,
    app.candidate_id,
    app.job_id,
    app.id,
  );
  if (!ctx?.candidateEmail) {
    return { skipped: true, reason: "not_found" };
  }

  const { subject, body } = buildInterviewReminderEmail({
    candidateName: ctx.candidateName,
    jobTitle: ctx.jobTitle,
    scheduledAt: app.interview_scheduled_at,
  });

  const result = await sendMail({
    to: ctx.candidateEmail,
    subject,
    text: body,
    context: "interview_reminder",
  });
  if (result.skipped) return result;

  try {
    await pool.query(
      "UPDATE application SET reminder_email_sent_for_at = $2::timestamptz WHERE id = $1",
      [app.id, app.interview_scheduled_at],
    );
  } catch (e) {
    if (e.code === "42703") return { skipped: true, reason: "migration_pending" };
    throw e;
  }

  return { ok: true, applicationId: app.id };
}

/** Release a claimed reminder slot so the next poll retries it. */
async function releaseReminderClaim(pool, applicationId, scheduledAt) {
  try {
    await pool.query(
      `UPDATE application SET reminder_email_sent_for_at = NULL
       WHERE id = $1 AND reminder_email_sent_for_at = $2::timestamptz`,
      [applicationId, scheduledAt],
    );
  } catch (err) {
    console.error("[reminder] claim release failed:", err.message || err);
  }
}

/** Claims due rows atomically (FOR UPDATE SKIP LOCKED) before sending, so
 *  multiple server instances can poll concurrently without duplicate emails.
 *  Failed sends release the claim and retry on the next poll. */
async function processInterviewReminders(pool) {
  if (!isMailEnabled()) {
    return { skipped: true, reason: "disabled" };
  }

  let claimed;
  try {
    claimed = await pool.query(
      `UPDATE application a
       SET reminder_email_sent_for_at = a.interview_scheduled_at
       WHERE a.id IN (
         SELECT id FROM application
         WHERE interview_scheduled_at IS NOT NULL
           AND interview_completed_at IS NULL
           AND NOW() >= interview_scheduled_at - INTERVAL '30 minutes'
           AND NOW() < interview_scheduled_at
           AND (
             reminder_email_sent_for_at IS NULL
             OR reminder_email_sent_for_at <> interview_scheduled_at
           )
         FOR UPDATE SKIP LOCKED
         LIMIT 50
       )
       RETURNING a.id, a.candidate_id, a.job_id, a.interview_scheduled_at`,
    );
  } catch (e) {
    if (e.code === "42703") return { skipped: true, reason: "migration_pending" };
    throw e;
  }

  let sent = 0;
  for (const app of claimed.rows) {
    try {
      const ctx = await loadApplicationContext(
        pool,
        app.candidate_id,
        app.job_id,
        app.id,
      );
      if (!ctx?.candidateEmail) continue;

      const { subject, body } = buildInterviewReminderEmail({
        candidateName: ctx.candidateName,
        jobTitle: ctx.jobTitle,
        scheduledAt: app.interview_scheduled_at,
      });
      const result = await sendMail({
        to: ctx.candidateEmail,
        subject,
        text: body,
        context: "interview_reminder",
      });
      if (result.skipped) {
        await releaseReminderClaim(pool, app.id, app.interview_scheduled_at);
        continue;
      }
      sent += 1;
    } catch (err) {
      console.error(
        `[reminder] send failed app=${app.id}:`,
        err.message || err,
      );
      await releaseReminderClaim(pool, app.id, app.interview_scheduled_at);
    }
  }
  return { ok: true, due: claimed.rows.length, sent };
}

async function sendInterviewCompletionEmail(
  pool,
  candidateId,
  { jobId, applicationId },
) {
  if (!candidateId || !jobId) {
    return { skipped: true, reason: "missing_params" };
  }

  let ctx = null;
  if (applicationId != null) {
    ctx = await loadApplicationContext(pool, candidateId, jobId, applicationId);
  } else {
    ctx = await loadApplicationContextFallback(pool, candidateId, jobId);
  }
  if (!ctx?.candidateEmail) {
    return { skipped: true, reason: "not_found" };
  }

  let statusRes;
  try {
    statusRes = await pool.query(
      `SELECT interview_completed_at, interview_completion_status, completion_email_sent_at
       FROM application WHERE id = $1 AND candidate_id = $2`,
      [ctx.application.id, candidateId],
    );
  } catch (e) {
    if (e.code === "42703") {
      statusRes = await pool.query(
        `SELECT interview_completed_at FROM application WHERE id = $1 AND candidate_id = $2`,
        [ctx.application.id, candidateId],
      );
      if (statusRes.rows[0]) {
        statusRes.rows[0].interview_completion_status = statusRes.rows[0]
          .interview_completed_at
          ? "completed"
          : "not_started";
        statusRes.rows[0].completion_email_sent_at = null;
      }
    } else {
      throw e;
    }
  }
  const st = statusRes.rows[0];
  if (!st) {
    return { skipped: true, reason: "not_found" };
  }
  const interviewDone =
    Boolean(st.interview_completed_at) ||
    st.interview_completion_status === "completed";
  if (!interviewDone) {
    return { skipped: true, reason: "not_completed" };
  }
  if (st.completion_email_sent_at) {
    return { skipped: true, reason: "already_sent" };
  }

  const { subject, body } = buildInterviewCompletionEmail({
    candidateName: ctx.candidateName,
    jobTitle: ctx.jobTitle,
  });

  const result = await sendMail({
    to: ctx.candidateEmail,
    subject,
    text: body,
    context: "interview_completed",
  });
  if (result.skipped) return result;

  try {
    await pool.query(
      "UPDATE application SET completion_email_sent_at = NOW() WHERE id = $1",
      [ctx.application.id],
    );
  } catch (e) {
    if (e.code === "42703") return { skipped: true, reason: "migration_pending" };
    throw e;
  }

  return { ok: true, applicationId: ctx.application.id };
}

async function sendInterviewMissedEmail(pool, applicationId) {
  if (!applicationId) {
    return { skipped: true, reason: "missing_params" };
  }

  let appRes;
  try {
    appRes = await pool.query(
      `SELECT a.id, a.candidate_id, a.job_id, a.interview_scheduled_at,
              a.interview_completed_at, a.missed_email_sent_for_at
       FROM application a
       WHERE a.id = $1`,
      [applicationId],
    );
  } catch (e) {
    if (e.code === "42703") return { skipped: true, reason: "migration_pending" };
    throw e;
  }
  const app = appRes.rows[0];
  if (!app?.interview_scheduled_at) {
    return { skipped: true, reason: "not_scheduled" };
  }
  if (app.interview_completed_at) {
    return { skipped: true, reason: "interview_completed" };
  }

  const schedKey = new Date(app.interview_scheduled_at).toISOString();
  const prev = app.missed_email_sent_for_at
    ? new Date(app.missed_email_sent_for_at).toISOString()
    : null;
  if (prev === schedKey) {
    return { skipped: true, reason: "already_sent_for_slot" };
  }

  const schedMs = new Date(app.interview_scheduled_at).getTime();
  const windowEndMs = schedMs + INTERVIEW_START_GRACE_MINUTES * 60 * 1000;
  if (Date.now() < windowEndMs) {
    return { skipped: true, reason: "window_still_open" };
  }

  const ctx = await loadApplicationContext(
    pool,
    app.candidate_id,
    app.job_id,
    app.id,
  );
  if (!ctx?.candidateEmail) {
    return { skipped: true, reason: "not_found" };
  }

  const { subject, body } = buildInterviewMissedEmail({
    candidateName: ctx.candidateName,
    jobTitle: ctx.jobTitle,
  });

  const result = await sendMail({
    to: ctx.candidateEmail,
    subject,
    text: body,
    context: "interview_missed",
  });
  if (result.skipped) return result;

  try {
    await pool.query(
      "UPDATE application SET missed_email_sent_for_at = $2::timestamptz WHERE id = $1",
      [app.id, app.interview_scheduled_at],
    );
  } catch (e) {
    if (e.code === "42703") return { skipped: true, reason: "migration_pending" };
    throw e;
  }

  return { ok: true, applicationId: app.id };
}

/** Release a claimed missed-slot so the next poll retries it. */
async function releaseMissedClaim(pool, applicationId, scheduledAt) {
  try {
    await pool.query(
      `UPDATE application SET missed_email_sent_for_at = NULL
       WHERE id = $1 AND missed_email_sent_for_at = $2::timestamptz`,
      [applicationId, scheduledAt],
    );
  } catch (err) {
    console.error("[missed] claim release failed:", err.message || err);
  }
}

/** Claims overdue rows atomically (FOR UPDATE SKIP LOCKED) before sending —
 *  safe to run on multiple server instances without duplicate emails. */
async function processInterviewMissedSlots(pool) {
  if (!isMailEnabled()) {
    return { skipped: true, reason: "disabled" };
  }

  let claimed;
  try {
    claimed = await pool.query(
      `UPDATE application a
       SET missed_email_sent_for_at = a.interview_scheduled_at
       WHERE a.id IN (
         SELECT id FROM application
         WHERE interview_scheduled_at IS NOT NULL
           AND interview_completed_at IS NULL
           AND NOW() >= interview_scheduled_at + ($1 * INTERVAL '1 minute')
           AND (
             missed_email_sent_for_at IS NULL
             OR missed_email_sent_for_at <> interview_scheduled_at
           )
         FOR UPDATE SKIP LOCKED
         LIMIT 50
       )
       RETURNING a.id, a.candidate_id, a.job_id, a.interview_scheduled_at`,
      [INTERVIEW_START_GRACE_MINUTES],
    );
  } catch (e) {
    if (e.code === "42703") return { skipped: true, reason: "migration_pending" };
    throw e;
  }

  let sent = 0;
  for (const app of claimed.rows) {
    try {
      const ctx = await loadApplicationContext(
        pool,
        app.candidate_id,
        app.job_id,
        app.id,
      );
      if (!ctx?.candidateEmail) continue;

      const { subject, body } = buildInterviewMissedEmail({
        candidateName: ctx.candidateName,
        jobTitle: ctx.jobTitle,
      });
      const result = await sendMail({
        to: ctx.candidateEmail,
        subject,
        text: body,
        context: "interview_missed",
      });
      if (result.skipped) {
        await releaseMissedClaim(pool, app.id, app.interview_scheduled_at);
        continue;
      }
      sent += 1;
    } catch (err) {
      console.error(`[missed] send failed app=${app.id}:`, err.message || err);
      await releaseMissedClaim(pool, app.id, app.interview_scheduled_at);
    }
  }
  return { ok: true, due: claimed.rows.length, sent };
}

async function sendHrDecisionEmail(pool, applicationId) {
  if (!applicationId) {
    return { skipped: true, reason: "missing_params" };
  }

  let appRes;
  try {
    appRes = await pool.query(
      `SELECT a.id, a.candidate_id, a.job_id, a.hr_decision_status,
              a.interview_completed_at, a.interview_completion_status,
              a.decision_email_sent_for
       FROM application a
       WHERE a.id = $1`,
      [applicationId],
    );
  } catch (e) {
    if (e.code === "42703") return { skipped: true, reason: "migration_pending" };
    throw e;
  }

  const app = appRes.rows[0];
  if (!app) {
    return { skipped: true, reason: "not_found" };
  }

  const decision = app.hr_decision_status;
  if (decision !== "SHORTLISTED" && decision !== "REJECTED") {
    return { skipped: true, reason: "not_a_decision" };
  }

  const interviewDone =
    Boolean(app.interview_completed_at) ||
    app.interview_completion_status === "completed";
  if (!interviewDone) {
    return { skipped: true, reason: "interview_not_completed" };
  }

  if (app.decision_email_sent_for === decision) {
    return { skipped: true, reason: "already_sent_for_decision" };
  }

  const ctx = await loadApplicationContext(
    pool,
    app.candidate_id,
    app.job_id,
    app.id,
  );
  if (!ctx?.candidateEmail) {
    return { skipped: true, reason: "not_found" };
  }

  const { subject, body } =
    decision === "SHORTLISTED"
      ? buildHrShortlistEmail({
          candidateName: ctx.candidateName,
          jobTitle: ctx.jobTitle,
        })
      : buildHrRejectEmail({
          candidateName: ctx.candidateName,
          jobTitle: ctx.jobTitle,
        });

  const result = await sendMail({
    to: ctx.candidateEmail,
    subject,
    text: body,
    context: "hr_decision",
  });
  if (result.skipped) return result;

  try {
    await pool.query(
      "UPDATE application SET decision_email_sent_for = $2 WHERE id = $1",
      [app.id, decision],
    );
  } catch (e) {
    if (e.code === "42703") return { skipped: true, reason: "migration_pending" };
    throw e;
  }

  return { ok: true, applicationId: app.id, decision };
}

async function sendReattemptApprovedEmail(pool, applicationId) {
  if (!applicationId) {
    return { skipped: true, reason: "missing_params" };
  }

  let appRes;
  try {
    appRes = await pool.query(
      `SELECT a.id, a.candidate_id, a.job_id, a.interview_completion_status,
              a.reattempt_request_status, a.reattempt_resolved_at,
              a.reattempt_hr_reason_code, a.reattempt_approved_email_sent_for
       FROM application a
       WHERE a.id = $1`,
      [applicationId],
    );
  } catch (e) {
    if (e.code === "42703") return { skipped: true, reason: "migration_pending" };
    throw e;
  }

  const app = appRes.rows[0];
  if (!app) {
    return { skipped: true, reason: "not_found" };
  }
  if (!app.reattempt_resolved_at || !app.reattempt_hr_reason_code) {
    return { skipped: true, reason: "not_resolved" };
  }
  if (app.interview_completion_status !== "not_started") {
    return { skipped: true, reason: "not_approved_reset" };
  }
  if (app.reattempt_request_status !== "none") {
    return { skipped: true, reason: "not_approved_reset" };
  }
  if (reattemptEmailAlreadySent(app.reattempt_approved_email_sent_for, app.reattempt_resolved_at)) {
    return { skipped: true, reason: "already_sent" };
  }

  const ctx = await loadApplicationContext(
    pool,
    app.candidate_id,
    app.job_id,
    app.id,
  );
  if (!ctx?.candidateEmail) {
    return { skipped: true, reason: "not_found" };
  }

  const { subject, body } = buildReattemptApprovedEmail({
    candidateName: ctx.candidateName,
    jobTitle: ctx.jobTitle,
    interviewLink: ctx.interviewLink,
  });

  const result = await sendMail({
    to: ctx.candidateEmail,
    subject,
    text: body,
    context: "reattempt_approved",
  });
  if (result.skipped) return result;

  try {
    await pool.query(
      `UPDATE application
       SET reattempt_approved_email_sent_for = reattempt_resolved_at
       WHERE id = $1`,
      [app.id],
    );
  } catch (e) {
    if (e.code === "42703") return { skipped: true, reason: "migration_pending" };
    throw e;
  }

  return { ok: true, applicationId: app.id, type: "reattempt_approved" };
}

async function sendReattemptRejectedEmail(pool, applicationId) {
  if (!applicationId) {
    return { skipped: true, reason: "missing_params" };
  }

  let appRes;
  try {
    appRes = await pool.query(
      `SELECT a.id, a.candidate_id, a.job_id, a.reattempt_request_status,
              a.reattempt_resolved_at, a.reattempt_hr_reason_code,
              a.reattempt_rejected_email_sent_for
       FROM application a
       WHERE a.id = $1`,
      [applicationId],
    );
  } catch (e) {
    if (e.code === "42703") return { skipped: true, reason: "migration_pending" };
    throw e;
  }

  const app = appRes.rows[0];
  if (!app) {
    return { skipped: true, reason: "not_found" };
  }
  if (app.reattempt_request_status !== "rejected") {
    return { skipped: true, reason: "not_rejected" };
  }
  if (!app.reattempt_resolved_at || !app.reattempt_hr_reason_code) {
    return { skipped: true, reason: "not_resolved" };
  }
  if (reattemptEmailAlreadySent(app.reattempt_rejected_email_sent_for, app.reattempt_resolved_at)) {
    return { skipped: true, reason: "already_sent" };
  }

  const ctx = await loadApplicationContext(
    pool,
    app.candidate_id,
    app.job_id,
    app.id,
  );
  if (!ctx?.candidateEmail) {
    return { skipped: true, reason: "not_found" };
  }

  const { subject, body } = buildReattemptRejectedEmail({
    candidateName: ctx.candidateName,
    jobTitle: ctx.jobTitle,
  });

  const result = await sendMail({
    to: ctx.candidateEmail,
    subject,
    text: body,
    context: "reattempt_rejected",
  });
  if (result.skipped) return result;

  try {
    await pool.query(
      `UPDATE application
       SET reattempt_rejected_email_sent_for = reattempt_resolved_at
       WHERE id = $1`,
      [app.id],
    );
  } catch (e) {
    if (e.code === "42703") return { skipped: true, reason: "migration_pending" };
    throw e;
  }

  return { ok: true, applicationId: app.id, type: "reattempt_rejected" };
}

async function notifyPendingHrDecisionEmailsForCandidate(pool, candidateId) {
  if (!candidateId) return { ok: true, sent: 0 };

  let rows;
  try {
    rows = await pool.query(
      `SELECT a.id
       FROM application a
       WHERE a.candidate_id = $1
         AND a.hr_decision_status IN ('SHORTLISTED', 'REJECTED')
         AND (
           a.interview_completed_at IS NOT NULL
           OR a.interview_completion_status = 'completed'
         )
         AND (
           a.decision_email_sent_for IS NULL
           OR a.decision_email_sent_for <> a.hr_decision_status
         )`,
      [candidateId],
    );
  } catch (e) {
    if (e.code === "42703") return { skipped: true, reason: "migration_pending" };
    throw e;
  }

  let sent = 0;
  for (const row of rows.rows) {
    const out = await sendHrDecisionEmail(pool, row.id);
    if (out.ok) sent += 1;
  }
  return { ok: true, due: rows.rows.length, sent };
}

async function sendCvAnalyserInviteEmail({
  candidateName,
  email,
  jobTitle,
  recruitmentJobId,
}) {
  const to = email && String(email).trim();
  if (!to) return { skipped: true, reason: "no_email" };
  if (!recruitmentJobId || !String(recruitmentJobId).trim()) {
    return { skipped: true, reason: "missing_job" };
  }

  const interviewLink = buildJobInviteLink(recruitmentJobId);
  const { subject, body } = buildCvAnalyserInviteEmail({
    candidateName: candidateName || "Candidate",
    jobTitle: jobTitle || "the position",
    interviewLink,
  });

  const result = await sendMail({
    to,
    subject,
    text: body,
    context: "cv_analyser_invite",
  });
  if (result.skipped) return result;
  return { ok: true, email: to };
}

module.exports = {
  sendIntroInterviewEmail,
  sendScheduledInterviewEmail,
  sendTalentPoolAckEmail,
  sendInterviewReminderEmail,
  processInterviewReminders,
  sendInterviewCompletionEmail,
  sendInterviewMissedEmail,
  processInterviewMissedSlots,
  sendHrDecisionEmail,
  notifyPendingHrDecisionEmailsForCandidate,
  sendReattemptApprovedEmail,
  sendReattemptRejectedEmail,
  sendCvAnalyserInviteEmail,
};
