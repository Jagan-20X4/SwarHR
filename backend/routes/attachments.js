const express = require("express");
const { getAttachmentBuffer, isS3Configured } = require("../lib/s3Attachments");
const { bearerCandidateId, bearerHrId } = require("../middleware/auth");

async function candidateMayAccessKey(client, candidateId, key) {
  const r = await client.query(
    `SELECT 1 AS ok FROM cv_attachment WHERE candidate_id = $1 AND s3_key = $2
     UNION ALL
     SELECT 1 FROM talent_pool_cv_file t
     JOIN talent_pool_entry e ON e.id = t.talent_pool_id
     WHERE e.linked_candidate_id = $1 AND t.s3_key = $2
     LIMIT 1`,
    [candidateId, key],
  );
  return r.rows.length > 0;
}

async function hrMayAccessKey(client, key) {
  const r = await client.query(
    `SELECT 1 AS ok FROM cv_attachment WHERE s3_key = $1
     UNION ALL
     SELECT 1 FROM talent_pool_cv_file WHERE s3_key = $1
     LIMIT 1`,
    [key],
  );
  return r.rows.length > 0;
}

function createAttachmentsRouter({ pool }) {
  const router = express.Router();

  /** Authenticated download proxy for private S3 CVs (fallback when presigned URL unavailable). */
  router.get("/download", async (req, res) => {
    const key = req.query.key != null ? String(req.query.key).trim() : "";
    if (!key) {
      res.status(400).json({ error: "key query parameter required" });
      return;
    }
    if (!isS3Configured()) {
      res.status(503).json({ error: "S3 not configured" });
      return;
    }

    const hrId = bearerHrId(req);
    const candidateId = bearerCandidateId(req);
    if (!hrId && !candidateId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const client = await pool.connect();
    try {
      let allowed = false;
      if (hrId) {
        allowed = await hrMayAccessKey(client, key);
      } else {
        allowed = await candidateMayAccessKey(client, candidateId, key);
      }
      if (!allowed) {
        res.status(403).json({ error: "Access denied for this attachment" });
        return;
      }

      const buf = await getAttachmentBuffer(key);
      if (!buf || buf.length === 0) {
        res.status(404).json({ error: "Attachment not found" });
        return;
      }

      const name = key.split("/").pop() || "file";
      const lower = name.toLowerCase();
      let contentType = "application/octet-stream";
      if (lower.endsWith(".pdf")) contentType = "application/pdf";
      else if (lower.endsWith(".png")) contentType = "image/png";
      else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
        contentType = "image/jpeg";
      }

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(name)}"`);
      res.send(buf);
    } catch (e) {
      console.error("attachment download", e);
      res.status(500).json({ error: String(e.message || e) });
    } finally {
      client.release();
    }
  });

  return router;
}

module.exports = { createAttachmentsRouter };
