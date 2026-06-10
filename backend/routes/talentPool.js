const express = require("express");
const { sendApiError } = require("../lib/apiErrors");
const { requireHr, bearerCandidateId } = require("../middleware/auth");
const { rateLimit } = require("../lib/rateLimit");
const { sendTalentPoolAckEmail } = require("../lib/interviewEmailService");
const {
  countTalentPool,
  getTalentPoolById,
  listTalentPoolPaginated,
  exportTalentPoolReport,
  submitTalentPoolEntry,
} = require("../stateRepo");

function parseTalentPoolListQuery(req) {
  return {
    role: req.query.role != null ? String(req.query.role).trim() : "",
    skill: req.query.skill != null ? String(req.query.skill).trim() : "",
    minExp: req.query.minExp,
    maxExp: req.query.maxExp,
    location:
      req.query.location != null ? String(req.query.location).trim() : "",
    source: req.query.source != null ? String(req.query.source).trim() : "",
    keyword:
      req.query.keyword != null ? String(req.query.keyword).trim() : "",
    fromDate:
      req.query.fromDate != null ? String(req.query.fromDate).trim() : "",
    toDate: req.query.toDate != null ? String(req.query.toDate).trim() : "",
  };
}

function createTalentPoolRouter({ pool }) {
  const router = express.Router();

  router.get("/stats", requireHr, async (_req, res) => {
    try {
      const total = await countTalentPool(pool);
      res.json({ total });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.get("/", requireHr, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(String(req.query.limit || "50"), 10) || 50),
      );
      const cursor =
        req.query.cursor != null ? String(req.query.cursor).trim() : "";

      const out = await listTalentPoolPaginated(pool, {
        page,
        limit,
        cursor: cursor || undefined,
        ...parseTalentPoolListQuery(req),
      });
      res.json(out);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.get("/export", requireHr, async (req, res) => {
    try {
      const csv = await exportTalentPoolReport(pool, parseTalentPoolListQuery(req));
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="talent-pool-report-${stamp}.csv"`,
      );
      res.send(csv);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.post(
    "/",
    rateLimit({ windowMs: 60_000, max: 10, keySuffix: "talent-pool" }),
    async (req, res) => {
      try {
        const cand = bearerCandidateId(req);
        const out = await submitTalentPoolEntry(pool, req.body || {}, {
          candidateId: cand || undefined,
        });
        sendTalentPoolAckEmail(req.body || {}).catch((err) => {
          console.error("[mail] talent pool ack failed:", err.message || err);
        });
        res.status(201).json(out);
      } catch (e) {
        console.error(e);
        sendApiError(res, e);
      }
    },
  );

  router.get("/:id", requireHr, async (req, res) => {
    try {
      const entry = await getTalentPoolById(pool, req.params.id);
      if (!entry) {
        res.status(404).json({ error: "Talent pool entry not found" });
        return;
      }
      res.json(entry);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  return router;
}

module.exports = { createTalentPoolRouter };
