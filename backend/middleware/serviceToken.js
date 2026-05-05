const crypto = require("crypto");
const { verify } = require("../jwt");

function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/** Resolve voice-bot auth: service token OR candidate JWT. Sets req.voiceBotService or req.candidateId */
function voiceBotAuth() {
  const serviceToken = () =>
    (process.env.VOICE_BOT_SERVICE_TOKEN &&
      String(process.env.VOICE_BOT_SERVICE_TOKEN).trim()) ||
    "";

  return (req, res, next) => {
    const h = req.headers.authorization;
    const raw =
      h && h.startsWith("Bearer ") ? h.slice(7).trim() : "";
    if (!raw) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const svc = serviceToken();
    if (svc && timingSafeEqualStr(raw, svc)) {
      req.voiceBotService = true;
      next();
      return;
    }
    const payload = verify(raw);
    if (payload && payload.typ === "cand" && payload.sub) {
      req.candidateId = payload.sub;
      next();
      return;
    }
    res.status(401).json({ error: "Unauthorized" });
  };
}

module.exports = { voiceBotAuth, timingSafeEqualStr };
