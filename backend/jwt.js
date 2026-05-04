const crypto = require("crypto");

const secret = () =>
  (process.env.JWT_SECRET && process.env.JWT_SECRET.trim()) ||
  "dev-only-set-JWT_SECRET-in-env";

function b64url(buf) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(payload, expiresInSec = 604800) {
  const exp = Math.floor(Date.now() / 1000) + expiresInSec;
  const body = b64url(
    Buffer.from(JSON.stringify({ ...payload, exp }), "utf8"),
  );
  const sig = crypto
    .createHmac("sha256", secret())
    .update(body)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto
    .createHmac("sha256", secret())
    .update(body)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return null;
  try {
    if (!crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  let payload;
  try {
    const json = Buffer.from(
      body.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

module.exports = { sign, verify };
