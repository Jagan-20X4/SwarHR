const REATTEMPT_COMPLETION_HOURS = Number(
  process.env.REATTEMPT_COMPLETION_HOURS || 72,
);

const REATTEMPT_DEADLINE_EXPIRED_MESSAGE =
  "Your reattempt window has closed (72 hours). Please contact career@indiraivf.in if you need assistance.";

function isApprovedReattemptWindow(row) {
  if (!row?.reattempt_resolved_at || !row?.reattempt_hr_reason_code) return false;
  const ic = row.interview_completion_status || "not_started";
  if (ic !== "not_started" || row.interview_completed_at) return false;
  return true;
}

function reattemptDeadlineExpired(row, nowMs = Date.now()) {
  if (!isApprovedReattemptWindow(row)) return false;
  const resolvedMs = new Date(row.reattempt_resolved_at).getTime();
  if (Number.isNaN(resolvedMs)) return false;
  const deadlineMs = resolvedMs + REATTEMPT_COMPLETION_HOURS * 60 * 60 * 1000;
  return nowMs >= deadlineMs;
}

module.exports = {
  REATTEMPT_COMPLETION_HOURS,
  REATTEMPT_DEADLINE_EXPIRED_MESSAGE,
  isApprovedReattemptWindow,
  reattemptDeadlineExpired,
};
