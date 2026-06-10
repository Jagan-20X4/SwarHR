const express = require("express");
const { sendApiError } = require("../lib/apiErrors");
const { requireHr } = require("../middleware/auth");
const {
  listCandidatesPaginated,
  listCandidateStats,
  exportCandidatesReport,
  getCandidateMe,
  patchCandidateForHr,
  bulkUpdateCandidateStatus,
  findCandidateByEmail,
  mapTalentPoolToJob,
  hrResetCandidatePassword,
} = require("../stateRepo");

function createCandidatesRouter({ pool }) {
  const router = express.Router();

  router.get("/stats", requireHr, async (_req, res) => {
    try {
      const stats = await listCandidateStats(pool);
      res.json(stats);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.get("/by-email", requireHr, async (req, res) => {
    try {
      const email = String(req.query.email || "").trim();
      if (!email) {
        res.status(400).json({ error: "email query required" });
        return;
      }
      const id = await findCandidateByEmail(pool, email);
      if (!id) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json({ id });
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
      const status =
        req.query.status != null ? String(req.query.status).trim() : "";
      const search =
        req.query.search != null ? String(req.query.search).trim() : "";
      const consentOnly =
        req.query.consentOnly === "1" || req.query.consentOnly === "true";
      const includeCvText =
        req.query.includeCvText === "1" ||
        req.query.includeCvText === "true";

      const out = await listCandidatesPaginated(pool, {
        page,
        limit,
        cursor: cursor || undefined,
        status: status || undefined,
        search: search || undefined,
        consentOnly,
        includeCvText,
      });
      res.json(out);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.get("/export", requireHr, async (req, res) => {
    try {
      const status =
        req.query.status != null ? String(req.query.status).trim() : "";
      const search =
        req.query.search != null ? String(req.query.search).trim() : "";
      const csv = await exportCandidatesReport(pool, {
        status: status || undefined,
        search: search || undefined,
      });
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="candidate-report-${stamp}.csv"`,
      );
      res.send(csv);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.get("/:id", requireHr, async (req, res) => {
    try {
      const candidate = await getCandidateMe(pool, req.params.id);
      if (!candidate) {
        res.status(404).json({ error: "Candidate not found" });
        return;
      }
      res.json(candidate);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.patch("/:id", requireHr, async (req, res) => {
    try {
      const body = req.body?.candidate ?? req.body ?? {};
      const updated = await patchCandidateForHr(pool, req.params.id, body, {
        hrId: req.hrId,
      });
      res.json(updated);
    } catch (e) {
      console.error(e);
      sendApiError(res, e);
    }
  });

  router.post("/:id/reset-password", requireHr, async (req, res) => {
    try {
      const { newPassword } = req.body || {};
      const out = await hrResetCandidatePassword(
        pool,
        req.params.id,
        newPassword,
      );
      res.json(out);
    } catch (e) {
      console.error(e);
      sendApiError(res, e);
    }
  });

  router.post("/bulk-status", requireHr, async (req, res) => {
    try {
      const updates = req.body?.updates ?? req.body ?? [];
      const out = await bulkUpdateCandidateStatus(pool, updates);
      res.json(out);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.post("/map-talent-pool", requireHr, async (req, res) => {
    try {
      const { talentPoolId, jobId } = req.body || {};
      if (!talentPoolId || !jobId) {
        res.status(400).json({ error: "talentPoolId and jobId required" });
        return;
      }
      const out = await mapTalentPoolToJob(pool, {
        talentPoolId,
        jobId,
        hrId: req.hrId,
      });
      res.json(out);
    } catch (e) {
      console.error(e);
      const status = e.status || 500;
      res.status(status).json({ error: String(e.message || e) });
    }
  });

  return router;
}

module.exports = { createCandidatesRouter };
