const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const { requireHr: requireHR } = require("../middleware/auth");
const {
  sniffMime,
  extFromName,
  allowedPair,
  extractText,
  sha256Text,
} = require("../lib/extractText");
const {
  analyzeCvWithClaudeForJob,
  analyzeCvWithClaudePdfBufferForJob,
  generateJobDraftClaude,
} = require("../lib/anthropicClient");
const { sendCvAnalyserInviteEmail } = require("../lib/interviewEmailService");

const rateBuckets = new Map();

function envInt(name, def) {
  const v = process.env[name];
  if (v == null || String(v).trim() === "") return def;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

function createCvAnalyserRouter({ pool }) {
  const router = express.Router();
  const maxFiles = envInt("CV_ANALYSER_MAX_FILES", 20);
  const maxMb = envInt("CV_ANALYSER_MAX_FILE_MB", 5);
  const maxBytes = maxMb * 1024 * 1024;
  const ratePerMin = envInt("CV_ANALYSER_RATE_LIMIT", 5);
  const pdfVisionThreshold = envInt(
    "CV_ANALYSER_PDF_VISION_TEXT_THRESHOLD",
    500,
  );

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: maxFiles },
  });

  function rateLimitBatch(req, res, next) {
    const hrId = req.hrId;
    const now = Date.now();
    const windowMs = 60_000;
    let arr = rateBuckets.get(hrId) || [];
    arr = arr.filter((t) => now - t < windowMs);
    if (arr.length >= ratePerMin) {
      res.status(429).json({ error: "Too many CV analyser requests. Try again in a minute." });
      return;
    }
    arr.push(now);
    rateBuckets.set(hrId, arr);
    next();
  }

  function handleMulterError(err, res) {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: `Each file must be ≤ ${maxMb}MB` });
        return true;
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_PART_COUNT") {
        res.status(400).json({ error: `Max ${maxFiles} files` });
        return true;
      }
      res.status(400).json({ error: err.message || "Upload rejected" });
      return true;
    }
    return false;
  }

  function fallbackCvPlainText(filename, mime, byteLength, detail) {
    const safeDetail = String(detail || "unknown").slice(0, 400);
    return `[EXTRACTION_STATUS=no_plain_text]
Filename: ${filename}
MIME: ${mime}
File size (bytes): ${byteLength}
Detail: ${safeDetail}

No machine-readable CV body was extracted (common for infographic or image-heavy PDFs). You must still output ONLY valid JSON matching the exact schema. In summary (2 sentences max), state clearly that no resume text could be extracted from the file. Do not invent employers, degrees, dates, or job titles. candidateName: use "Unknown" unless the filename alone plausibly encodes a person's name. email, phone, currentRole, yearsExperience: null unless clearly parseable from the filename. strengths: exactly 3 strings, each stating a specific limitation due to missing text (no fabricated strengths). gaps: exactly 3 strings, honest data gaps. skills: at most 8 items; use only tokens clearly suggested by the filename, otherwise an empty array. education: empty array if unknown. redFlags: include that no CV text could be extracted. verdict: use "fresher" if there is no evidence to classify higher.`;
  }

  async function resolveRecruitmentJobId(raw) {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const id = s.slice(0, 64);
    const r = await pool.query(`SELECT id FROM job WHERE id = $1`, [id]);
    return r.rows.length ? r.rows[0].id : null;
  }

  /** If recruitment_job_id column is missing (42703), list without it. */
  async function listCvAnalyserJobsForHr(hrId) {
    const withRec = `SELECT id, title, company_name AS "companyName", designation, location, description,
                recruitment_job_id AS "recruitmentJobId",
                EXTRACT(EPOCH FROM created_at)*1000 AS "createdAt",
                EXTRACT(EPOCH FROM updated_at)*1000 AS "updatedAt"
         FROM cv_analyser_job WHERE hr_id = $1 ORDER BY updated_at DESC`;
    const noRec = `SELECT id, title, company_name AS "companyName", designation, location, description,
                EXTRACT(EPOCH FROM created_at)*1000 AS "createdAt",
                EXTRACT(EPOCH FROM updated_at)*1000 AS "updatedAt"
         FROM cv_analyser_job WHERE hr_id = $1 ORDER BY updated_at DESC`;
    try {
      const r = await pool.query(withRec, [hrId]);
      return r.rows;
    } catch (e) {
      if (e && e.code === "42703") {
        const r = await pool.query(noRec, [hrId]);
        return r.rows.map((row) => ({ ...row, recruitmentJobId: null }));
      }
      throw e;
    }
  }

  function jobContextHashFromRow(row) {
    if (!row) return "";
    const canonical = JSON.stringify({
      t: row.title,
      c: row.company_name,
      d: row.designation,
      l: row.location,
      desc: row.description,
    });
    return crypto.createHash("sha256").update(canonical).digest("hex");
  }

  async function insertAudit(client, hrId, fileId, filename, candidateEmail) {
    const id = `ae-cv-${crypto.randomUUID()}`;
    const details = JSON.stringify({
      filename,
      candidateEmail: candidateEmail || null,
    });
    await client.query(
      `INSERT INTO audit_event (id, occurred_at, actor, action, target_ref, details)
       VALUES ($1, NOW(), $2, $3, $4, $5)`,
      [id, hrId, "cv.analyse", fileId, details],
    );
  }

  async function processOneFile(file, hrId, jobRow) {
    const filename = file.originalname || "cv";
    const fileId = crypto.randomUUID();
    const buf = file.buffer;
    if (!buf || !buf.length) {
      return {
        fileId,
        filename,
        status: "error",
        error: "Empty file",
        analysis: null,
        cached: false,
      };
    }
    const mime = sniffMime(buf);
    const ext = extFromName(filename);
    if (!mime || !allowedPair(mime, ext)) {
      return {
        fileId,
        filename,
        status: "error",
        error: "Invalid file type. Only PDF or DOCX allowed.",
        analysis: null,
        cached: false,
      };
    }
    let textHash;
    let usePdfVision = false;
    let t = "";

    if (mime === "application/pdf") {
      let extracted = "";
      let extractOk = true;
      try {
        extracted = String(await extractText(buf, mime) || "").trim();
      } catch {
        extractOk = false;
      }
      if (!extractOk || extracted.length < pdfVisionThreshold) {
        usePdfVision = true;
        textHash =
          "vision:v1:" +
          crypto.createHash("sha256").update(buf).digest("hex");
      } else {
        t = extracted;
        if (t.length > 50000) {
          return {
            fileId,
            filename,
            status: "error",
            error: "Extracted text exceeds 50,000 characters.",
            analysis: null,
            cached: false,
          };
        }
        textHash = sha256Text(t);
      }
    } else {
      let text;
      try {
        text = await extractText(buf, mime);
      } catch (e) {
        text = fallbackCvPlainText(
          filename,
          mime,
          buf.length,
          `extract_threw:${String(e && e.message ? e.message : e)}`,
        );
      }
      t = String(text || "").trim();
      if (t.length === 0) {
        t = fallbackCvPlainText(filename, mime, buf.length, "trimmed_empty");
      }
      if (t.length > 50000) {
        return {
          fileId,
          filename,
          status: "error",
          error: "Extracted text exceeds 50,000 characters.",
          analysis: null,
          cached: false,
        };
      }
      textHash = sha256Text(t);
    }

    const jch = jobContextHashFromRow(jobRow);
    const cached = await pool.query(
      `SELECT file_id, text_hash, analysis_json FROM cv_analysis_cache
       WHERE text_hash = $1 AND job_context_hash = $2 AND created_at > NOW() - INTERVAL '30 days'
       LIMIT 1`,
      [textHash, jch],
    );
    if (cached.rows.length > 0) {
      const row = cached.rows[0];
      const analysisMode =
        row.text_hash && String(row.text_hash).startsWith("vision:v1:")
          ? "pdf_vision"
          : "text";
      return {
        fileId: row.file_id,
        filename,
        status: "ok",
        error: null,
        analysis: row.analysis_json,
        cached: true,
        analysisMode,
      };
    }

    let analysis;
    try {
      if (usePdfVision) {
        analysis = await analyzeCvWithClaudePdfBufferForJob(buf, filename, jobRow);
      } else {
        analysis = await analyzeCvWithClaudeForJob(t, jobRow);
      }
    } catch (e) {
      if (e && e.code === "AI_UNAVAILABLE") {
        throw e;
      }
      if (e && e.code === "MALFORMED_JSON") {
        return {
          fileId,
          filename,
          status: "error",
          error: "AI returned malformed response",
          analysis: null,
          cached: false,
        };
      }
      if (e && e.code === "INVALID_SCHEMA") {
        return {
          fileId,
          filename,
          status: "error",
          error: "AI response failed validation",
          analysis: null,
          cached: false,
        };
      }
      return {
        fileId,
        filename,
        status: "error",
        error: "AI analysis failed",
        analysis: null,
        cached: false,
      };
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO cv_analysis_cache
         (file_id, text_hash, original_filename, mime_type, file_bytes, analysis_json, analysed_by_hr_id, job_context_hash)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
        [
          fileId,
          textHash,
          filename,
          mime,
          buf,
          JSON.stringify(analysis),
          hrId,
          jch,
        ],
      );
      await insertAudit(client, hrId, fileId, filename, analysis.email);
      await client.query("COMMIT");
    } catch (insErr) {
      await client.query("ROLLBACK").catch(() => {});
      if (insErr && insErr.code === "23505") {
        const again = await pool.query(
          `SELECT file_id, analysis_json FROM cv_analysis_cache WHERE text_hash = $1 AND job_context_hash = $2 LIMIT 1`,
          [textHash, jch],
        );
        if (again.rows.length > 0) {
          const row = again.rows[0];
          return {
            fileId: row.file_id,
            filename,
            status: "ok",
            error: null,
            analysis: row.analysis_json,
            cached: true,
          };
        }
      }
      throw insErr;
    } finally {
      client.release();
    }

    return {
      fileId,
      filename,
      status: "ok",
      error: null,
      analysis,
      cached: false,
      analysisMode: usePdfVision ? "pdf_vision" : "text",
    };
  }

  router.get("/recruitment-jobs", requireHR, async (_req, res) => {
    try {
      const r = await pool.query(
        `SELECT id, title, designation, location FROM job ORDER BY title ASC`,
      );
      res.json({ jobs: r.rows });
    } catch (e) {
      console.error(e);
      if (e && e.code === "42P01") {
        return res.status(503).json({ error: "job table missing" });
      }
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.get("/jobs", requireHR, async (req, res) => {
    try {
      const rows = await listCvAnalyserJobsForHr(req.hrId);
      res.json({ jobs: rows });
    } catch (e) {
      console.error(e);
      if (e && e.code === "42P01") {
        return res.status(503).json({ error: "CV analyser job migration not applied" });
      }
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.post("/jobs/generate-draft", requireHR, async (req, res) => {
    if (!process.env.ANTHROPIC_API_KEY || !process.env.ANTHROPIC_API_KEY.trim()) {
      return res.status(503).json({ error: "AI service unavailable", code: "AI_UNAVAILABLE" });
    }
    const roleTitle = req.body && req.body.roleTitle != null ? String(req.body.roleTitle).trim() : "";
    if (!roleTitle) {
      return res.status(400).json({ error: "roleTitle required" });
    }
    try {
      const draft = await generateJobDraftClaude(roleTitle);
      res.json({
        title: draft.title || roleTitle,
        designation: draft.designation || "",
        description: draft.description || "",
      });
    } catch (e) {
      if (e && e.code === "AI_UNAVAILABLE") {
        return res.status(503).json({ error: "AI service unavailable", code: "AI_UNAVAILABLE" });
      }
      console.error(e);
      res.status(500).json({ error: "Draft generation failed" });
    }
  });

  router.post("/jobs", requireHR, async (req, res) => {
    const b = req.body || {};
    const title = String(b.title || "").trim();
    if (!title) return res.status(400).json({ error: "title required" });
    const companyName = String(b.companyName || "Indira IVF").trim() || "Indira IVF";
    const designation = String(b.designation || "").trim();
    const location = String(b.location || "Mumbai").trim() || "Mumbai";
    const description = String(b.description || "").trim();
    let recruitmentJobId = null;
    if (Object.prototype.hasOwnProperty.call(b, "recruitmentJobId")) {
      recruitmentJobId = await resolveRecruitmentJobId(b.recruitmentJobId);
      if (b.recruitmentJobId != null && String(b.recruitmentJobId).trim() !== "" && !recruitmentJobId) {
        return res.status(400).json({ error: "recruitmentJobId must be a valid careers job id" });
      }
    }
    try {
      let ins;
      try {
        ins = await pool.query(
          `INSERT INTO cv_analyser_job (hr_id, title, company_name, designation, location, description, recruitment_job_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id, title, company_name AS "companyName", designation, location, description,
                     recruitment_job_id AS "recruitmentJobId",
                     EXTRACT(EPOCH FROM created_at)*1000 AS "createdAt",
                     EXTRACT(EPOCH FROM updated_at)*1000 AS "updatedAt"`,
          [req.hrId, title, companyName, designation, location, description, recruitmentJobId],
        );
      } catch (e2) {
        if (e2 && e2.code === "42703") {
          ins = await pool.query(
            `INSERT INTO cv_analyser_job (hr_id, title, company_name, designation, location, description)
             VALUES ($1,$2,$3,$4,$5,$6)
             RETURNING id, title, company_name AS "companyName", designation, location, description,
                       EXTRACT(EPOCH FROM created_at)*1000 AS "createdAt",
                       EXTRACT(EPOCH FROM updated_at)*1000 AS "updatedAt"`,
            [req.hrId, title, companyName, designation, location, description],
          );
          ins.rows[0].recruitmentJobId = null;
        } else {
          throw e2;
        }
      }
      res.status(201).json(ins.rows[0]);
    } catch (e) {
      console.error(e);
      if (e && e.code === "42P01") {
        return res.status(503).json({ error: "CV analyser job migration not applied" });
      }
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.patch("/jobs/:id", requireHR, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
    const b = req.body || {};
    try {
      const cur = await pool.query(
        `SELECT id FROM cv_analyser_job WHERE id = $1 AND hr_id = $2`,
        [id, req.hrId],
      );
      if (cur.rows.length === 0) return res.status(404).json({ error: "Not found" });
      const title = b.title != null ? String(b.title).trim() : null;
      const companyName = b.companyName != null ? String(b.companyName).trim() : null;
      const designation = b.designation != null ? String(b.designation).trim() : null;
      const location = b.location != null ? String(b.location).trim() : null;
      const description = b.description != null ? String(b.description).trim() : null;
      const hasRec = Object.prototype.hasOwnProperty.call(b, "recruitmentJobId");
      let recruitmentJobIdVal = null;
      if (hasRec) {
        recruitmentJobIdVal = await resolveRecruitmentJobId(b.recruitmentJobId);
        if (b.recruitmentJobId != null && String(b.recruitmentJobId).trim() !== "" && !recruitmentJobIdVal) {
          return res.status(400).json({ error: "recruitmentJobId must be a valid careers job id" });
        }
      }
      let upd;
      try {
        upd = await pool.query(
          `UPDATE cv_analyser_job SET
             title = COALESCE($1, title),
             company_name = COALESCE($2, company_name),
             designation = COALESCE($3, designation),
             location = COALESCE($4, location),
             description = COALESCE($5, description),
             recruitment_job_id = CASE WHEN $8::boolean THEN $9 ELSE recruitment_job_id END,
             updated_at = NOW()
           WHERE id = $6 AND hr_id = $7
           RETURNING id, title, company_name AS "companyName", designation, location, description,
                     recruitment_job_id AS "recruitmentJobId",
                     EXTRACT(EPOCH FROM created_at)*1000 AS "createdAt",
                     EXTRACT(EPOCH FROM updated_at)*1000 AS "updatedAt"`,
          [
            title,
            companyName,
            designation,
            location,
            description,
            id,
            req.hrId,
            hasRec,
            recruitmentJobIdVal,
          ],
        );
      } catch (e2) {
        if (e2 && e2.code === "42703") {
          upd = await pool.query(
            `UPDATE cv_analyser_job SET
               title = COALESCE($1, title),
               company_name = COALESCE($2, company_name),
               designation = COALESCE($3, designation),
               location = COALESCE($4, location),
               description = COALESCE($5, description),
               updated_at = NOW()
             WHERE id = $6 AND hr_id = $7
             RETURNING id, title, company_name AS "companyName", designation, location, description,
                       EXTRACT(EPOCH FROM created_at)*1000 AS "createdAt",
                       EXTRACT(EPOCH FROM updated_at)*1000 AS "updatedAt"`,
            [title, companyName, designation, location, description, id, req.hrId],
          );
          upd.rows[0].recruitmentJobId = null;
        } else {
          throw e2;
        }
      }
      res.json(upd.rows[0]);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.delete("/jobs/:id", requireHR, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
    try {
      const del = await pool.query(
        `DELETE FROM cv_analyser_job WHERE id = $1 AND hr_id = $2 RETURNING id`,
        [id, req.hrId],
      );
      if (del.rows.length === 0) return res.status(404).json({ error: "Not found" });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.post(
    "/batch",
    requireHR,
    rateLimitBatch,
    (req, res, next) => {
      upload.array("files", maxFiles)(req, res, (err) => {
        if (err) {
          if (handleMulterError(err, res)) return;
          return next(err);
        }
        next();
      });
    },
    async (req, res) => {
      if (!process.env.ANTHROPIC_API_KEY || !process.env.ANTHROPIC_API_KEY.trim()) {
        return res.status(503).json({
          error: "AI service unavailable",
          code: "AI_UNAVAILABLE",
        });
      }
      const files = req.files || [];
      if (files.length === 0) {
        return res.status(400).json({ error: "At least 1 file required" });
      }
      if (files.length > maxFiles) {
        return res.status(400).json({ error: `Max ${maxFiles} files` });
      }
      const jobProfileId = req.body && req.body.jobProfileId != null
        ? parseInt(String(req.body.jobProfileId), 10)
        : NaN;
      if (!Number.isFinite(jobProfileId)) {
        return res.status(400).json({ error: "jobProfileId required (select a saved job posting)" });
      }
      const hrId = req.hrId;
      let jobRes;
      try {
        jobRes = await pool.query(
          `SELECT id, title, company_name, designation, location, description FROM cv_analyser_job
           WHERE id = $1 AND hr_id = $2`,
          [jobProfileId, hrId],
        );
      } catch (e) {
        if (e && e.code === "42P01") {
          return res.status(503).json({ error: "CV analyser job migration not applied" });
        }
        throw e;
      }
      if (jobRes.rows.length === 0) {
        return res.status(404).json({ error: "Job profile not found" });
      }
      const jobRow = jobRes.rows[0];
      const settled = await Promise.allSettled(
        files.map((f) => processOneFile(f, hrId, jobRow)),
      );
      let aiUnavailable = false;
      const results = settled.map((s, i) => {
        if (s.status === "fulfilled") return s.value;
        const err = s.reason;
        if (err && err.code === "AI_UNAVAILABLE") aiUnavailable = true;
        return {
          fileId: crypto.randomUUID(),
          filename: (files[i] && files[i].originalname) || "unknown",
          status: "error",
          error: String(err && err.message ? err.message : err),
          analysis: null,
          cached: false,
        };
      });
      if (aiUnavailable) {
        return res.status(503).json({
          error: "AI service unavailable",
          code: "AI_UNAVAILABLE",
        });
      }
      const succeeded = results.filter((r) => r.status === "ok").length;
      const failed = results.length - succeeded;
      res.json({
        results,
        meta: { total: results.length, succeeded, failed },
      });
    },
  );

  router.get("/export", requireHR, async (req, res) => {
    const raw = req.query.fileIds;
    if (!raw || typeof raw !== "string") {
      return res.status(400).json({ error: "fileIds query required" });
    }
    const ids = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      return res.status(400).json({ error: "fileIds query required" });
    }
    const r = await pool.query(
      `SELECT original_filename, analysis_json FROM cv_analysis_cache
       WHERE file_id = ANY($1::text[]) AND analysed_by_hr_id = $2`,
      [ids, req.hrId],
    );
    const esc = (v) => {
      const s = v == null ? "" : String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const header = [
      "filename",
      "candidate_name",
      "email",
      "phone",
      "current_role",
      "years_experience",
      "verdict",
      "summary",
      "overall_fit_score",
      "technical_score",
      "experience_score",
      "education_score",
      "culture_score",
      "fit_summary",
      "strengths",
      "gaps",
      "skills",
      "education",
    ];
    const lines = [header.join(",")];
    for (const row of r.rows) {
      const a = row.analysis_json || {};
      lines.push(
        [
          esc(row.original_filename),
          esc(a.candidateName),
          esc(a.email),
          esc(a.phone),
          esc(a.currentRole),
          esc(a.yearsExperience),
          esc(a.verdict),
          esc(a.summary),
          esc(a.overallFitScore),
          esc(a.technicalScore),
          esc(a.experienceScore),
          esc(a.educationScore),
          esc(a.cultureScore),
          esc(a.fitSummary),
          esc(Array.isArray(a.strengths) ? a.strengths.join("; ") : ""),
          esc(Array.isArray(a.gaps) ? a.gaps.join("; ") : ""),
          esc(Array.isArray(a.skills) ? a.skills.join("; ") : ""),
          esc(Array.isArray(a.education) ? a.education.join("; ") : ""),
        ].join(","),
      );
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="cv-analyser-export.csv"',
    );
    res.send(lines.join("\r\n"));
  });

  router.post("/send-invite", requireHR, async (req, res) => {
    const candidateName = String(req.body?.candidateName || "").trim();
    const email = String(req.body?.email || "").trim();
    const jobTitle = String(req.body?.jobTitle || "").trim();
    const recruitmentJobId = String(req.body?.recruitmentJobId || "").trim();
    if (!email) {
      res.status(400).json({ error: "Email is required to send invite" });
      return;
    }
    if (!recruitmentJobId) {
      res.status(400).json({
        error: "Link a careers job in Job Master before sending invite",
      });
      return;
    }
    try {
      const out = await sendCvAnalyserInviteEmail({
        candidateName,
        email,
        jobTitle,
        recruitmentJobId,
      });
      if (out.skipped) {
        const msg =
          out.reason === "disabled"
            ? "Email is not configured on the server"
            : out.reason === "no_email"
              ? "Email is required to send invite"
              : "Could not send invite email";
        res.status(400).json({ error: msg });
        return;
      }
      res.json({ ok: true, email });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  return router;
}

module.exports = { createCvAnalyserRouter };
