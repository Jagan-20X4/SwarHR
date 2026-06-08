const { verify } = require("../jwt");
const { readAuthTokenFromRequest } = require("../lib/authCookies");

function bearerPayload(req) {
  const raw = readAuthTokenFromRequest(req);
  if (!raw) return null;
  return verify(raw);
}

function bearerCandidateId(req) {
  const payload = bearerPayload(req);
  if (!payload || payload.typ !== "cand" || !payload.sub) return null;
  return payload.sub;
}

function bearerHrId(req) {
  const payload = bearerPayload(req);
  if (!payload || payload.typ !== "hr" || !payload.sub) return null;
  return payload.sub;
}

function requireCandidate(req, res, next) {
  const id = bearerCandidateId(req);
  if (!id) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.candidateId = id;
  next();
}

function requireHr(req, res, next) {
  const id = bearerHrId(req);
  if (!id) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.hrId = id;
  next();
}

function requireAnyAuth(req, res, next) {
  const cand = bearerCandidateId(req);
  if (cand) {
    req.candidateId = cand;
    next();
    return;
  }
  const hr = bearerHrId(req);
  if (hr) {
    req.hrId = hr;
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
}

module.exports = {
  bearerPayload,
  bearerCandidateId,
  bearerHrId,
  requireCandidate,
  requireHr,
  requireAnyAuth,
};
