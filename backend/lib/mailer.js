const nodemailer = require("nodemailer");

function isMailEnabled() {
  if (process.env.MAIL_ENABLED === "false") return false;
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS,
  );
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
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

async function sendMail({ to, subject, text, html }) {
  if (!to || !String(to).trim()) {
    return { skipped: true, reason: "no_recipient" };
  }
  if (!isMailEnabled()) {
    console.warn("[mail] SMTP not configured; skipped send to", to);
    return { skipped: true, reason: "disabled" };
  }
  const transporter = createTransporter();
  await transporter.sendMail({
    from: mailFromAddress(),
    to: String(to).trim(),
    subject: subject || "(no subject)",
    text: text || "",
    html: html || (text || "").replace(/\n/g, "<br>\n"),
  });
  return { ok: true };
}

module.exports = {
  isMailEnabled,
  createTransporter,
  sendMail,
  mailFromAddress,
};
