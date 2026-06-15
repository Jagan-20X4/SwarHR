const nodemailer = require("nodemailer");
const { pool } = require("../db");

/** Best-effort delivery record; never blocks or fails the email itself. */
async function recordEmailLog({ to, subject, status, error, context }) {
  try {
    await pool.query(
      `INSERT INTO email_log (sent_to, subject, status, error, context)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        String(to || "").slice(0, 255),
        String(subject || "").slice(0, 500),
        status,
        error ? String(error).slice(0, 2000) : null,
        context ? String(context).slice(0, 64) : null,
      ],
    );
  } catch (err) {
    // 42P01 = table missing (migration not yet run) — don't spam the log for it
    if (err.code !== "42P01") {
      console.warn("[mail] email_log write failed:", err.message || err);
    }
  }
}

function isMailEnabled() {
  if (process.env.MAIL_ENABLED === "false") return false;
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS,
  );
}

function createTransporter() {
  // Pooled: reuses a few persistent SMTP connections instead of a full
  // connect + TLS + login handshake per email (Office 365 throttles logins).
  return nodemailer.createTransport({
    pool: true,
    maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS || 3),
    maxMessages: Number(process.env.SMTP_MAX_MESSAGES || 100),
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

let _sharedTransporter = null;
function getTransporter() {
  if (!_sharedTransporter) {
    _sharedTransporter = createTransporter();
  }
  return _sharedTransporter;
}

function mailFromAddress() {
  const email =
    process.env.SMTP_FROM ||
    process.env.MAIL_FROM ||
    process.env.SMTP_USER ||
    "";
  const name = process.env.MAIL_FROM_NAME || "Indira IVF Talent Acquisition";
  return `"${name}" <${email}>`;
}

async function sendMail({ to, subject, text, html, context }) {
  if (!to || !String(to).trim()) {
    return { skipped: true, reason: "no_recipient" };
  }
  if (!isMailEnabled()) {
    console.warn("[mail] SMTP not configured; skipped send to", to);
    void recordEmailLog({
      to,
      subject,
      status: "skipped",
      error: "smtp_disabled",
      context,
    });
    return { skipped: true, reason: "disabled" };
  }
  const recipient = String(to).trim();
  try {
    await getTransporter().sendMail({
      from: mailFromAddress(),
      to: recipient,
      subject: subject || "(no subject)",
      text: text || "",
      html: html || (text || "").replace(/\n/g, "<br>\n"),
    });
  } catch (err) {
    console.error(
      `[mail] send failed to=${recipient} subject="${subject || ""}":`,
      err.message || err,
    );
    void recordEmailLog({
      to: recipient,
      subject,
      status: "failed",
      error: err.message || String(err),
      context,
    });
    throw err;
  }
  console.log(`[mail] sent to=${recipient} subject="${subject || ""}"`);
  void recordEmailLog({ to: recipient, subject, status: "sent", context });
  return { ok: true };
}

module.exports = {
  isMailEnabled,
  createTransporter,
  sendMail,
  mailFromAddress,
};
