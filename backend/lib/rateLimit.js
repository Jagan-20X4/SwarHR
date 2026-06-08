/** In-memory sliding-window rate limiter (single process). Use Redis for multi-instance production. */

const buckets = new Map();
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

function pruneStaleBuckets() {
  const now = Date.now();
  const maxWindow = 120_000;
  for (const [key, arr] of buckets.entries()) {
    const kept = (arr || []).filter((t) => now - t < maxWindow);
    if (kept.length === 0) buckets.delete(key);
    else buckets.set(key, kept);
  }
}

const _cleanupTimer = setInterval(pruneStaleBuckets, CLEANUP_INTERVAL_MS);
if (_cleanupTimer.unref) _cleanupTimer.unref();

function clientKey(req, suffix = "") {
  const fwd = req.headers["x-forwarded-for"];
  const ip =
    (typeof fwd === "string" && fwd.split(",")[0].trim()) ||
    req.socket?.remoteAddress ||
    "unknown";
  const auth =
    req.candidateId || req.hrId || req.headers.authorization?.slice(0, 32) || "";
  return `${ip}:${auth}:${suffix}`;
}

function rateLimit({ windowMs = 60_000, max = 60, keySuffix = "" }) {
  return (req, res, next) => {
    const key = clientKey(req, keySuffix);
    const now = Date.now();
    let arr = buckets.get(key) || [];
    arr = arr.filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      res.status(429).json({
        error: "Too many requests. Please try again later.",
      });
      return;
    }
    arr.push(now);
    buckets.set(key, arr);
    next();
  };
}

module.exports = { rateLimit, clientKey, pruneStaleBuckets };
