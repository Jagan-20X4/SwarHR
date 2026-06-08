const crypto = require("crypto");

const DEFAULT_SECRET = "dev-only-set-JWT_SECRET-in-env";

function isProductionEnv() {
  return process.env.NODE_ENV === "production";
}

function jwtSecret() {
  return (process.env.JWT_SECRET && process.env.JWT_SECRET.trim()) || DEFAULT_SECRET;
}

function jwtSecretIsDefault() {
  const s = jwtSecret();
  return !s || s === DEFAULT_SECRET;
}

/** Fail fast in production when JWT_SECRET is unset or still the dev default. */
function assertJwtSecretForProduction() {
  if (!isProductionEnv()) return;
  if (jwtSecretIsDefault()) {
    console.error(
      "FATAL: Set a strong JWT_SECRET in backend/.env before running in production (NODE_ENV=production).",
    );
    process.exit(1);
  }
}

function b64url(buf) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const DEFAULT_TTL_SEC = 86400;

function envJwtTtl(name, fallback = DEFAULT_TTL_SEC) {
  const v = process.env[name];
  if (v == null || String(v).trim() === "") return fallback;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** JWT lifetime by role — default 24h for HR and candidate. */
function jwtExpiresSec(typ) {
  if (typ === "hr") return envJwtTtl("JWT_EXPIRES_HR_SEC", DEFAULT_TTL_SEC);
  if (typ === "cand") return envJwtTtl("JWT_EXPIRES_CAND_SEC", DEFAULT_TTL_SEC);
  return DEFAULT_TTL_SEC;
}

function sign(payload, expiresInSec) {
  const ttl =
    expiresInSec != null && expiresInSec > 0
      ? expiresInSec
      : jwtExpiresSec(payload.typ);
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const body = b64url(
    Buffer.from(JSON.stringify({ ...payload, exp }), "utf8"),
  );
  const sig = crypto
    .createHmac("sha256", jwtSecret())
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
    .createHmac("sha256", jwtSecret())
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

module.exports = {
  sign,
  verify,
  assertJwtSecretForProduction,
  jwtSecretIsDefault,
  jwtExpiresSec,
  DEFAULT_TTL_SEC,
};
