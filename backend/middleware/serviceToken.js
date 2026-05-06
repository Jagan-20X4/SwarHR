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

function voiceBotServiceToken() {
  return (
    (process.env.VOICE_BOT_SERVICE_TOKEN &&
      String(process.env.VOICE_BOT_SERVICE_TOKEN).trim()) ||
    ""
  );
}

/** Resolve Bearer or raw JWT string: service token → { voiceBotService }, candidate JWT → { candidateId }, else null. */
function voiceBotTokenRoles(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const svc = voiceBotServiceToken();
  if (svc && timingSafeEqualStr(trimmed, svc)) {
    return { voiceBotService: true };
  }
  const payload = verify(trimmed);
  if (payload && payload.typ === "cand" && payload.sub) {
    return { candidateId: payload.sub };
  }
  return null;
}

/** Resolve voice-bot auth: service token OR candidate JWT. Sets req.voiceBotService or req.candidateId */
function voiceBotAuth() {
  return (req, res, next) => {
    const h = req.headers.authorization;
    const raw =
      h && h.startsWith("Bearer ") ? h.slice(7).trim() : "";
    if (!raw) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const roles = voiceBotTokenRoles(raw);
    if (roles?.voiceBotService) {
      req.voiceBotService = true;
      next();
      return;
    }
    if (roles?.candidateId) {
      req.candidateId = roles.candidateId;
      next();
      return;
    }
    res.status(401).json({ error: "Unauthorized" });
  };
}

module.exports = { voiceBotAuth, timingSafeEqualStr, voiceBotTokenRoles };
