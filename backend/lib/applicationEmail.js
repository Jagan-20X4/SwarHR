function publicAppBase() {
  const raw = process.env.PUBLIC_APP_URL || "https://career.indiraivf.in";
  return String(raw).trim().replace(/\/+$/, "");
}

function buildJobInviteLink(jobId) {
  if (!jobId) return `${publicAppBase()}/login?returnTo=${encodeURIComponent("/portal")}`;
  return `${publicAppBase()}/jobs/${encodeURIComponent(String(jobId))}/apply?invite=1`;
}

function buildInterviewInviteLink(jobId) {
  if (!jobId) return `${publicAppBase()}/login?returnTo=${encodeURIComponent("/portal")}`;
  return `${publicAppBase()}/interview-invite?jobId=${encodeURIComponent(String(jobId))}`;
}

function buildTalentPoolLink() {
  return `${publicAppBase()}/login?returnTo=${encodeURIComponent("/portal")}`;
}

function formatScheduledAt(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return String(iso);
  }
}

function buildInterviewApplyEmail({
  candidateName,
  jobTitle,
  interviewLink,
  scheduledAt,
}) {
  const cn = (candidateName && String(candidateName).trim()) || "Candidate";
  const jt = (jobTitle && String(jobTitle).trim()) || "the position";
  const link = (interviewLink && String(interviewLink).trim()) || "";
  const subject = "Thank You for Applying – Next Step: AI Interview";

  const scheduleBlock = scheduledAt
    ? `
Your AI interview is scheduled for: ${formatScheduledAt(scheduledAt)}

Please log in at least 5 minutes before your scheduled time using the link below.
Your interview window will open at the scheduled time.
`
    : "";

  const body = `Dear ${cn},

Thank you for applying for the ${jt} position at Indira IVF Hospital Ltd.

As the first step in our hiring process, you are required to complete an AI‑based interview.
${scheduleBlock}
AI Interview Link: ${link}

Important guidelines for your AI interview

To ensure your responses are captured accurately by the AI system, please make sure to:

· Sit in a well-lit area with a plain white or light-coloured background

· Ensure stable internet connectivity throughout the interview

· Choose a quiet location with minimal background noise

· Use a device with a properly functioning camera and microphone

· Speak clearly and at a natural pace, and answer each question in full before moving ahead

· Avoid interruptions, as the AI interview works best when completed in one continuous session

Following these guidelines will help the system accurately evaluate your responses.

Thank you for your interest in joining Indira IVF Hospital Ltd. We wish you the very best in the process.

Warm regards,
Talent Acquisition Team`;

  return { subject, body };
}

function buildInterviewReminderEmail({ candidateName, jobTitle, scheduledAt }) {
  const cn = (candidateName && String(candidateName).trim()) || "Candidate";
  const jt = (jobTitle && String(jobTitle).trim()) || "the position";
  const when = formatScheduledAt(scheduledAt);
  const subject = `Reminder: Your AI Interview for ${jt}`;
  const body = `Dear ${cn},

Reminder: Your AI interview for ${jt} is scheduled on ${when}. Please ensure good internet, a quiet space, and a light-colored background.

Warm regards,
Talent Acquisition Team`;
  return { subject, body };
}

function buildInterviewCompletionEmail({ candidateName, jobTitle }) {
  const cn = (candidateName && String(candidateName).trim()) || "Candidate";
  const jt = (jobTitle && String(jobTitle).trim()) || "the position";
  const subject = "Thank You for Completing Your Interview";
  const body = `Dear ${cn},

Thank you for taking the time to complete the AI-based interview for the ${jt} position at Indira IVF Hospital Ltd.

We appreciate your participation and effort. Your responses have been successfully recorded and will now be reviewed as part of our selection process.

Our team will evaluate your interview along with your profile, and you will be informed about the next steps once the review is complete.

Thank you for your interest in Indira IVF Hospital Ltd. We appreciate your time and wish you all the best.

Warm regards,
Talent Acquisition Team`;
  return { subject, body };
}

function buildInterviewMissedEmail({ candidateName, jobTitle }) {
  const cn = (candidateName && String(candidateName).trim()) || "Candidate";
  const jt = (jobTitle && String(jobTitle).trim()) || "the position";
  const subject = "Update on Your AI Interview – Action Needed";
  const body = `Dear ${cn},

We noticed that the AI interview for the ${jt} position was not completed within the scheduled timeframe.

Please contact us at career@indiraivf.in.

If we do not hear from you, your application will be considered closed for this role.

Thank you for your interest in Indira IVF Hospital Ltd.

Warm regards,
Talent Acquisition Team`;
  return { subject, body };
}

function buildHrShortlistEmail({ candidateName, jobTitle }) {
  const cn = (candidateName && String(candidateName).trim()) || "Candidate";
  const jt = (jobTitle && String(jobTitle).trim()) || "the position";
  const subject = "You're Shortlisted – Next Steps";
  const body = `Dear ${cn},

Thank you for completing the AI interview for the ${jt} position at Indira IVF Hospital Ltd.

We are pleased to inform you that you have been shortlisted for the next stage of the selection process. Our team will reach out shortly with details on the next steps and timelines.

We appreciate your time and interest.

Warm regards,
Talent Acquisition Team`;
  return { subject, body };
}

function buildHrRejectEmail({ candidateName, jobTitle }) {
  const cn = (candidateName && String(candidateName).trim()) || "Candidate";
  const jt = (jobTitle && String(jobTitle).trim()) || "the position";
  const subject = `Update on Your Application for ${jt}`;
  const body = `Dear ${cn},

Thank you for your interest in the ${jt} position at Indira IVF Hospital Ltd. and for taking the time to participate in our selection process.

After careful review, we regret to inform you that your profile has not been shortlisted at this stage. We truly appreciate your effort and encourage you to apply for future opportunities that match your skills.

We wish you success in your career journey.

Warm regards,
Talent Acquisition Team`;
  return { subject, body };
}

function buildReattemptApprovedEmail({ candidateName, jobTitle, interviewLink }) {
  const cn = (candidateName && String(candidateName).trim()) || "Candidate";
  const jt = (jobTitle && String(jobTitle).trim()) || "the position";
  const link = (interviewLink && String(interviewLink).trim()) || "";
  const subject = `AI Interview Reattempt Enabled – ${jt}`;
  const body = `Dear ${cn},

Thank you for your interest in the ${jt} position at Indira IVF Hospital Ltd.

We understand that your earlier AI interview attempt could not be completed successfully. Based on this, a one-time reattempt has been enabled for you.

Reattempt Details

· Interview Type: AI-Based Interview

· Reattempt Link: ${link}

· Completion Deadline: 72 Hours

Please ensure before you begin:

· A quiet environment with minimal background noise

· Stable internet connectivity

· A well-lit space with a plain white or light-coloured background

· A device with a working camera and microphone

Kindly note that the interview should be completed in one continuous session, and this will be your final attempt for this role.

We wish you the best and look forward to your participation.

Warm regards,
Talent Acquisition Team`;
  return { subject, body };
}

function buildReattemptRejectedEmail({ candidateName, jobTitle }) {
  const cn = (candidateName && String(candidateName).trim()) || "Candidate";
  const jt = (jobTitle && String(jobTitle).trim()) || "the position";
  const subject = `Update on Your Reattempt Request – ${jt}`;
  const body = `Dear ${cn},

Thank you for your interest in the ${jt} position at Indira IVF Hospital Ltd. and for submitting a request to retake the AI interview.

After review, we regret to inform you that your reattempt request has not been approved at this time.

We appreciate your time and interest in Indira IVF Hospital Ltd.

Warm regards,
Talent Acquisition Team`;
  return { subject, body };
}

function normalizeTalentPoolRoles(desiredRoles) {
  if (Array.isArray(desiredRoles)) {
    return desiredRoles.map((r) => String(r).trim()).filter(Boolean);
  }
  if (typeof desiredRoles === "string" && desiredRoles.trim()) {
    return desiredRoles
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
  }
  return [];
}

function buildTalentPoolJoinEmail({ candidateName, desiredRoles }) {
  const cn = (candidateName && String(candidateName).trim()) || "Candidate";
  const roles = normalizeTalentPoolRoles(desiredRoles);
  const rolesLine = roles.length > 0 ? roles.join(", ") : "your selected role(s)";
  const subject =
    roles.length > 0
      ? `Thank You for Joining Our Talent Community – ${rolesLine}`
      : "Thank You for Joining Our Talent Community";

  const rolesBlock =
    roles.length > 0
      ? roles.map((r) => `· ${r}`).join("\n")
      : "· (Not specified)";

  const rolePhrase =
    roles.length === 1 ? "this role" : "the role(s) you have indicated";

  const body = `Dear ${cn},

Thank you for submitting your profile to the Indira IVF Hospital Ltd. Talent Community.

We have received your interest in the following role(s):

${rolesBlock}

Your profile has been added to our talent pool. If a suitable vacancy opens for ${rolePhrase}, our Talent Acquisition team will contact you with the next steps.

In the meantime, no further action is required from your side.

We appreciate your interest in Indira IVF Hospital Ltd. and wish you the very best.

Warm regards,
Talent Acquisition Team
Indira IVF Hospital Ltd.`;
  return { subject, body };
}

function buildCvAnalyserInviteEmail({ candidateName, jobTitle, interviewLink }) {
  const cn = (candidateName && String(candidateName).trim()) || "Candidate";
  const jt = (jobTitle && String(jobTitle).trim()) || "the position";
  const link = (interviewLink && String(interviewLink).trim()) || "";
  const subject = "Next Step: AI Interview";
  const body = `Dear ${cn},

Thank you for your interest in the ${jt} position at Indira IVF Hospital Ltd. We have received your CV.

As the first step in our hiring process, you are required to complete an AI-based interview. Please use the details below to access and complete your interview within 72 hours.

AI Interview Link: ${link}

Important guidelines for your AI interview

To ensure your responses are captured accurately by the AI system, please make sure to:

· Sit in a well-lit area with a plain white or light-coloured background

· Ensure stable internet connectivity throughout the interview

· Choose a quiet location with minimal background noise

· Use a device with a properly functioning camera and microphone

· Speak clearly and at a natural pace, and answer each question in full before moving ahead

· Avoid interruptions, as the AI interview works best when completed in one continuous session

Following these guidelines will help the system accurately evaluate your responses.

Thank you for your interest in joining Indira IVF Hospital Ltd. We wish you the very best in the process.

Warm regards,
Talent Acquisition Team`;
  return { subject, body };
}

module.exports = {
  publicAppBase,
  buildJobInviteLink,
  buildInterviewInviteLink,
  buildTalentPoolLink,
  formatScheduledAt,
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
};
