require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { sendMail, isMailEnabled } = require("../lib/mailer");

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error("Usage: node scripts/test-smtp.js your@email.com");
    process.exit(1);
  }
  if (!isMailEnabled()) {
    console.error("SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in backend/.env");
    process.exit(1);
  }
  await sendMail({
    to,
    subject: "SwarHR SMTP test",
    text: "If you receive this message, Gmail SMTP is configured correctly.",
  });
  console.log("Test email sent to", to);
}

main().catch((e) => {
  console.error("FAILED:", e.message || e);
  process.exit(1);
});
