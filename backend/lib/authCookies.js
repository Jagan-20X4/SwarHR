const { jwtExpiresSec } = require("../jwt");

const AUTH_COOKIE_NAME = "swar_token";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function cookieSameSite() {
  const raw = process.env.AUTH_COOKIE_SAME_SITE;
  if (raw && String(raw).trim()) return String(raw).trim();
  if (isProduction() && process.env.AUTH_COOKIE_CROSS_SITE === "true") {
    return "None";
  }
  return "Lax";
}

function cookieSecure() {
  if (process.env.AUTH_COOKIE_SECURE === "false") return false;
  if (process.env.AUTH_COOKIE_SECURE === "true") return true;
  if (!isProduction()) return false;
  // Local API (http://localhost:3001) — Secure cookies are not sent on http://
  const port = String(process.env.PORT || "3001").trim();
  if (
    port === "3001" &&
    process.env.AUTH_COOKIE_SECURE !== "true"
  ) {
    return false;
  }
  return true;
}

function parseCookieHeader(header) {
  const out = {};
  if (!header || typeof header !== "string") return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  }
  return out;
}

function readAuthTokenFromRequest(req) {
  const cookies = parseCookieHeader(req.headers.cookie);
  const fromCookie = cookies[AUTH_COOKIE_NAME];
  if (fromCookie && String(fromCookie).trim()) return String(fromCookie).trim();

  const h = req.headers.authorization;
  if (h && h.startsWith("Bearer ")) return h.slice(7).trim();
  return null;
}

function setAuthCookie(res, token, typ) {
  const maxAge = jwtExpiresSec(typ);
  const sameSite = cookieSameSite();
  const parts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${maxAge}`,
    `SameSite=${sameSite}`,
  ];
  if (cookieSecure() || sameSite === "None") parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

function clearAuthCookie(res) {
  const sameSite = cookieSameSite();
  const parts = [
    `${AUTH_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "Max-Age=0",
    `SameSite=${sameSite}`,
  ];
  if (cookieSecure() || sameSite === "None") parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

module.exports = {
  AUTH_COOKIE_NAME,
  readAuthTokenFromRequest,
  setAuthCookie,
  clearAuthCookie,
  parseCookieHeader,
};
