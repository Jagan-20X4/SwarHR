const bcrypt = require("bcryptjs");
const { normalizeInterviewQuestionsForSave } = require("./lib/interviewScript");
const {
  CV_SELECT_WITH_S3,
  cvFileFromDbRow,
  resolveCvUpload,
  insertCvAttachmentRow,
  deleteAttachment,
  isFreshDataUrl,
} = require("./lib/cvStorage");
const { wrapS3Error } = require("./lib/apiErrors");
const {
  repairCompletedInterviewsForCandidate,
  repairCompletedInterviewsForCandidateIds,
} = require("./lib/interviewFinalize");
const {
  notifyPendingHrDecisionEmailsForCandidate,
} = require("./lib/interviewEmailService");
const {
  buildCandidateExportCsv,
  shouldIncludeGuestTalentPoolExport,
} = require("./lib/candidateExport");

function looksLikeBcrypt(s) {
  return typeof s === "string" && s.startsWith("$2") && s.length > 50;
}

function getLatestAppForJob(history, jobId) {
  const past = (history || []).filter((a) => a.jobId === jobId);
  if (past.length === 0) return null;
  return [...past].sort(
    (a, b) => new Date(b.appliedAt) - new Date(a.appliedAt),
  )[0];
}

function parseExplicitApplicationId(a) {
  const n = Number(a?.applicationId);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function applicationFieldValues(a) {
  const ic =
    a.interviewCompletionStatus != null
      ? String(a.interviewCompletionStatus)
      : "not_started";
  const rs =
    a.reattemptRequestStatus != null
      ? String(a.reattemptRequestStatus)
      : "none";
  const aiPayload =
    a.analysis && typeof a.analysis === "object"
      ? {
          summary: a.analysis.summary || "",
          tech: a.analysis.tech ?? 0,
          comm: a.analysis.comm ?? 0,
          rec: a.analysis.rec || "",
          strengths: a.analysis.strengths || [],
          areas: a.analysis.areas || [],
        }
      : null;
  return {
    ic,
    rs,
    aiPayload,
    appliedAt: new Date(a.appliedAt),
    interviewScheduledAt: a.interviewScheduledAt
      ? new Date(a.interviewScheduledAt)
      : null,
    interviewCompletedAt: a.interviewCompletedAt
      ? new Date(a.interviewCompletedAt)
      : null,
  };
}

async function bumpApplicationIdSequence(client) {
  try {
    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('application', 'id'),
        GREATEST(COALESCE((SELECT MAX(id) FROM application), 1), 1)
      )
    `);
  } catch (_e) {
    /* sequence may not exist in older schemas */
  }
}

async function insertApplicationRow(client, candidateId, a, explicitId, hrId) {
  const f = applicationFieldValues(a);
  const cols = explicitId != null ? "id, " : "";
  const idPlaceholder = explicitId != null ? "$1, " : "";
  const baseOffset = explicitId != null ? 1 : 0;
  const params = [
    ...(explicitId != null ? [explicitId] : []),
    candidateId,
    a.jobId,
    f.appliedAt,
    f.interviewScheduledAt,
    f.interviewCompletedAt,
    f.ic,
    f.rs,
    a.reattemptCandidateReasonCode || null,
    a.reattemptCandidateReasonText || null,
    a.reattemptHrReasonCode || null,
    a.reattemptHrNotes || null,
    a.reattemptRequestedAt ? new Date(a.reattemptRequestedAt) : null,
    a.reattemptResolvedAt ? new Date(a.reattemptResolvedAt) : null,
    a.reattemptResolvedByHrId || null,
    a.hrRemarks != null ? String(a.hrRemarks) : null,
    a.hrDecisionStatus || null,
    f.aiPayload,
  ];
  const ph = (n) => `$${n + baseOffset}`;
  try {
    const ins = await client.query(
      `INSERT INTO application (
         ${cols}candidate_id, job_id, applied_at, interview_scheduled_at, interview_completed_at,
         interview_completion_status, reattempt_request_status,
         reattempt_candidate_reason_code, reattempt_candidate_reason_text,
         reattempt_hr_reason_code, reattempt_hr_notes,
         reattempt_requested_at, reattempt_resolved_at, reattempt_resolved_by_hr_id,
         hr_remarks, hr_decision_status, ai_analysis_json
       ) VALUES (${idPlaceholder}${ph(1)},${ph(2)},${ph(3)},${ph(4)},${ph(5)},${ph(6)},${ph(7)},${ph(8)},${ph(9)},${ph(10)},${ph(11)},${ph(12)},${ph(13)},${ph(14)},${ph(15)},${ph(16)},${ph(17)}) RETURNING id`,
      params,
    );
    const newId = Number(ins.rows[0].id);
    await maybeRecordHrDecision(client, newId, candidateId, a, hrId);
    return newId;
  } catch (e) {
    if (e.code === "42703") {
      const slimParams = [
        ...(explicitId != null ? [explicitId] : []),
        candidateId,
        a.jobId,
        f.appliedAt,
        f.interviewScheduledAt,
        f.interviewCompletedAt,
        f.ic,
        f.rs,
        a.reattemptCandidateReasonCode || null,
        a.reattemptCandidateReasonText || null,
        a.reattemptHrReasonCode || null,
        a.reattemptHrNotes || null,
        a.reattemptRequestedAt ? new Date(a.reattemptRequestedAt) : null,
        a.reattemptResolvedAt ? new Date(a.reattemptResolvedAt) : null,
        a.reattemptResolvedByHrId || null,
      ];
      try {
        const ins = await client.query(
          `INSERT INTO application (
             ${cols}candidate_id, job_id, applied_at, interview_scheduled_at, interview_completed_at,
             interview_completion_status, reattempt_request_status,
             reattempt_candidate_reason_code, reattempt_candidate_reason_text,
             reattempt_hr_reason_code, reattempt_hr_notes,
             reattempt_requested_at, reattempt_resolved_at, reattempt_resolved_by_hr_id
           ) VALUES (${idPlaceholder}${ph(1)},${ph(2)},${ph(3)},${ph(4)},${ph(5)},${ph(6)},${ph(7)},${ph(8)},${ph(9)},${ph(10)},${ph(11)},${ph(12)},${ph(13)},${ph(14)}) RETURNING id`,
          slimParams,
        );
        const newId = Number(ins.rows[0].id);
        await maybeRecordHrDecision(client, newId, candidateId, a, hrId);
        return newId;
      } catch (e2) {
        if (e2.code === "42703") {
          const minParams = [
            ...(explicitId != null ? [explicitId] : []),
            candidateId,
            a.jobId,
            f.appliedAt,
            f.interviewScheduledAt,
            f.interviewCompletedAt,
          ];
          const ins = await client.query(
            `INSERT INTO application (${cols}candidate_id, job_id, applied_at, interview_scheduled_at, interview_completed_at)
             VALUES (${idPlaceholder}${ph(1)},${ph(2)},${ph(3)},${ph(4)},${ph(5)}) RETURNING id`,
            minParams,
          );
          const newId = Number(ins.rows[0].id);
          await maybeRecordHrDecision(client, newId, candidateId, a, hrId);
          return newId;
        }
        throw e2;
      }
    }
    throw e;
  }
}

async function maybeRecordHrDecision(client, applicationId, candidateId, a, hrId) {
  if (!hrId) return;
  const f = applicationFieldValues(a);
  const isDecision =
    a.hrDecisionStatus === "SHORTLISTED" || a.hrDecisionStatus === "REJECTED";
  const interviewDone =
    f.ic === "completed" || Boolean(f.interviewCompletedAt);
  if (!isDecision || !interviewDone) return;
  try {
    await client.query(
      `UPDATE application SET hr_decision_at = NOW(), hr_decided_by_hr_id = $3
       WHERE id = $1 AND candidate_id = $2`,
      [applicationId, candidateId, hrId],
    );
  } catch (e) {
    if (e.code !== "42703") throw e;
  }
}

async function updateApplicationRow(client, applicationId, candidateId, a, hrId) {
  const f = applicationFieldValues(a);
  try {
    await client.query(
      `UPDATE application SET
         job_id = $3, applied_at = $4, interview_scheduled_at = $5, interview_completed_at = $6,
         interview_completion_status = $7, reattempt_request_status = $8,
         reattempt_candidate_reason_code = $9, reattempt_candidate_reason_text = $10,
         reattempt_hr_reason_code = $11, reattempt_hr_notes = $12,
         reattempt_requested_at = $13, reattempt_resolved_at = $14, reattempt_resolved_by_hr_id = $15,
         hr_remarks = $16, hr_decision_status = $17, ai_analysis_json = $18
       WHERE id = $1 AND candidate_id = $2`,
      [
        applicationId,
        candidateId,
        a.jobId,
        f.appliedAt,
        f.interviewScheduledAt,
        f.interviewCompletedAt,
        f.ic,
        f.rs,
        a.reattemptCandidateReasonCode || null,
        a.reattemptCandidateReasonText || null,
        a.reattemptHrReasonCode || null,
        a.reattemptHrNotes || null,
        a.reattemptRequestedAt ? new Date(a.reattemptRequestedAt) : null,
        a.reattemptResolvedAt ? new Date(a.reattemptResolvedAt) : null,
        a.reattemptResolvedByHrId || null,
        a.hrRemarks != null ? String(a.hrRemarks) : null,
        a.hrDecisionStatus || null,
        f.aiPayload,
      ],
    );
  } catch (e) {
    if (e.code === "42703") {
      await client.query(
        `UPDATE application SET
           job_id = $3, applied_at = $4, interview_scheduled_at = $5, interview_completed_at = $6,
           interview_completion_status = $7, reattempt_request_status = $8,
           reattempt_candidate_reason_code = $9, reattempt_candidate_reason_text = $10,
           reattempt_hr_reason_code = $11, reattempt_hr_notes = $12,
           reattempt_requested_at = $13, reattempt_resolved_at = $14, reattempt_resolved_by_hr_id = $15
         WHERE id = $1 AND candidate_id = $2`,
        [
          applicationId,
          candidateId,
          a.jobId,
          f.appliedAt,
          f.interviewScheduledAt,
          f.interviewCompletedAt,
          f.ic,
          f.rs,
          a.reattemptCandidateReasonCode || null,
          a.reattemptCandidateReasonText || null,
          a.reattemptHrReasonCode || null,
          a.reattemptHrNotes || null,
          a.reattemptRequestedAt ? new Date(a.reattemptRequestedAt) : null,
          a.reattemptResolvedAt ? new Date(a.reattemptResolvedAt) : null,
          a.reattemptResolvedByHrId || null,
        ],
      );
    } else throw e;
  }
  await maybeRecordHrDecision(client, applicationId, candidateId, a, hrId);
  return applicationId;
}

async function upsertApplicationRow(client, candidateId, a, hrId) {
  const explicitId = parseExplicitApplicationId(a);
  if (explicitId != null) {
    const ex = await client.query(
      "SELECT id FROM application WHERE id = $1 AND candidate_id = $2",
      [explicitId, candidateId],
    );
    if (ex.rows.length > 0) {
      return updateApplicationRow(client, explicitId, candidateId, a, hrId);
    }
    return insertApplicationRow(client, candidateId, a, explicitId, hrId);
  }
  return insertApplicationRow(client, candidateId, a, null, hrId);
}

async function writeTranscriptLines(client, candidateId, applicationId, lines) {
  if (!lines || lines.length === 0) return;
  try {
    await client.query(
      "DELETE FROM transcript_line WHERE candidate_id = $1 AND application_id = $2",
      [candidateId, applicationId],
    );
  } catch (e) {
    if (e.code !== "42703") throw e;
  }
  let idx = 0;
  for (const line of lines) {
    const role = line.role === "ai" ? "ai" : "user";
    const text = line.text || "";
    try {
      await client.query(
        `INSERT INTO transcript_line (candidate_id, application_id, line_index, role, content)
         VALUES ($1,$2,$3,$4,$5)`,
        [candidateId, applicationId, idx, role, text],
      );
    } catch (e) {
      if (e.code === "42703") {
        await client.query(
          `INSERT INTO transcript_line (candidate_id, line_index, role, content)
           VALUES ($1,$2,$3,$4)`,
          [candidateId, idx, role, text],
        );
      } else throw e;
    }
    idx += 1;
  }
}

function mergeApplicationHistory(dbHist, hrHist) {
  const db = dbHist || [];
  const hr = hrHist || [];
  if (hr.length === 0 && db.length > 0) return db;
  if (db.length === 0) return hr;
  const byId = new Map();
  for (const a of db) {
    const id = parseExplicitApplicationId(a);
    if (id != null) byId.set(id, { ...a, applicationId: id });
  }
  for (const a of hr) {
    const id = parseExplicitApplicationId(a);
    if (id != null) {
      const prev = byId.get(id);
      byId.set(id, prev ? { ...prev, ...a, applicationId: id } : { ...a, applicationId: id });
    }
  }
  for (const a of db) {
    const id = parseExplicitApplicationId(a);
    if (id != null && !hr.some((h) => parseExplicitApplicationId(h) === id)) {
      if (!byId.has(id)) byId.set(id, { ...a, applicationId: id });
    }
  }
  for (const a of hr) {
    if (parseExplicitApplicationId(a) == null) {
      byId.set(`new-${a.jobId}-${a.appliedAt}`, a);
    }
  }
  return [...byId.values()].sort(
    (x, y) => new Date(x.appliedAt) - new Date(y.appliedAt),
  );
}

function mergeCandidatesForHrSave(dbCandidates, hrCandidates) {
  const dbById = new Map((dbCandidates || []).map((c) => [c.id, c]));
  const hrById = new Map((hrCandidates || []).map((c) => [c.id, c]));
  const allIds = new Set([...dbById.keys(), ...hrById.keys()]);
  const out = [];
  for (const id of allIds) {
    const db = dbById.get(id);
    const hr = hrById.get(id);
    if (!hr) {
      if (db) out.push(db);
      continue;
    }
    if (!db) {
      out.push(hr);
      continue;
    }
    const merged = { ...hr };
    merged.applicationHistory = mergeApplicationHistory(
      db.applicationHistory,
      hr.applicationHistory,
    );
    if (!hr.cvFile && db.cvFile) merged.cvFile = db.cvFile;
    if (!hr.cv && db.cv) merged.cv = db.cv;
    out.push(merged);
  }
  return out;
}

function parseApplicationAiAnalysis(jsonVal) {
  if (jsonVal == null) return undefined;
  const o =
    typeof jsonVal === "string"
      ? (() => {
          try {
            return JSON.parse(jsonVal);
          } catch {
            return null;
          }
        })()
      : jsonVal;
  if (!o || typeof o !== "object") return undefined;
  return {
    summary: o.summary || "",
    tech: o.tech ?? o.tech_score ?? 0,
    comm: o.comm ?? o.comm_score ?? 0,
    rec: o.rec || o.recommendation_label || "",
    strengths: Array.isArray(o.strengths) ? o.strengths : [],
    areas: Array.isArray(o.areas) ? o.areas : [],
  };
}

async function loadMeta(client) {
  const org = await client.query(
    "SELECT cooling_period_months, company_name, max_cv_upload_mb FROM organization_setting WHERE singleton = 1",
  );
  const dpo = await client.query(
    "SELECT full_name, title, email, phone FROM dpo_contact WHERE singleton = 1",
  );
  const cats = await client.query(
    "SELECT code, label, items_summary, purpose, retention_note FROM data_processing_category ORDER BY code",
  );
  const o = org.rows[0] || {};
  const d = dpo.rows[0] || {};
  return {
    coolingMonths: o.cooling_period_months ?? 3,
    maxCvMb: o.max_cv_upload_mb ?? 5,
    companyName: o.company_name || "Indira IVF",
    dpo: {
      name: d.full_name || "",
      title: d.title || "",
      email: d.email || "",
      phone: d.phone || "",
    },
    dataCategories: cats.rows.map((r) => ({
      id: r.code,
      label: r.label,
      items: r.items_summary,
      purpose: r.purpose,
      retention: r.retention_note,
    })),
  };
}

async function loadJobInterviewQuestions(client, jobIds) {
  if (!jobIds.length) return new Map();
  let r;
  try {
    r = await client.query(
      `SELECT id, job_id, question, question_type, question_phase, display_order
       FROM job_interview_questions WHERE job_id = ANY($1::varchar[])
       ORDER BY job_id, display_order`,
      [jobIds],
    );
  } catch (_e) {
    r = await client.query(
      `SELECT id, job_id, question, question_type, display_order
       FROM job_interview_questions WHERE job_id = ANY($1::varchar[])
       ORDER BY job_id, display_order`,
      [jobIds],
    );
  }
  const m = new Map();
  for (const row of r.rows) {
    const id = row.job_id;
    if (!m.has(id)) m.set(id, []);
    m.get(id).push({
      id: row.id,
      question: row.question,
      questionType: row.question_type,
      questionPhase: row.question_phase || "role",
      displayOrder: row.display_order,
    });
  }
  return m;
}

async function loadJobs(client) {
  const r = await client.query(
    "SELECT id, title, designation, location, description, requirements FROM job ORDER BY id",
  );
  const ids = r.rows.map((x) => x.id);
  let qMap = new Map();
  try {
    qMap = await loadJobInterviewQuestions(client, ids);
  } catch (_e) {
    /* migration not applied yet */
  }
  return r.rows.map((j) => ({
    id: j.id,
    title: j.title,
    designation: j.designation || "",
    location: j.location || "",
    description: j.description || "",
    requirements: j.requirements || "",
    interviewQuestions: qMap.get(j.id) || [],
  }));
}

async function loadCandidates(client) {
  const ids = await client.query(
    "SELECT id FROM candidate ORDER BY created_at, id",
  );
  const out = [];
  for (const { id } of ids.rows) {
    const c = await loadOneCandidate(client, id);
    if (c) out.push(c);
  }
  return out;
}

async function loadOneCandidate(client, id) {
  const base = await client.query(
    `SELECT id, name, email, password_hash, status, job_id, cv_text, remarks,
            interview_language, consent, consent_at, from_talent_pool
     FROM candidate WHERE id = $1`,
    [id],
  );
  if (base.rows.length === 0) return null;
  const b = base.rows[0];

  const purposes = await client.query(
    "SELECT purpose_code FROM candidate_purpose WHERE candidate_id = $1 ORDER BY purpose_code",
    [id],
  );
  let apps;
  try {
    apps = await client.query(
      `SELECT id, job_id, applied_at, interview_scheduled_at, interview_completed_at,
              interview_completion_status, reattempt_request_status,
              reattempt_candidate_reason_code, reattempt_candidate_reason_text,
              reattempt_hr_reason_code, reattempt_hr_notes,
              reattempt_requested_at, reattempt_resolved_at, reattempt_resolved_by_hr_id,
              hr_remarks, hr_decision_status, ai_analysis_json
       FROM application WHERE candidate_id = $1 ORDER BY applied_at`,
      [id],
    );
  } catch (e) {
    if (e.code === "42703") {
      try {
        apps = await client.query(
          `SELECT id, job_id, applied_at, interview_scheduled_at, interview_completed_at,
                  interview_completion_status, reattempt_request_status,
                  reattempt_candidate_reason_code, reattempt_candidate_reason_text,
                  reattempt_hr_reason_code, reattempt_hr_notes,
                  reattempt_requested_at, reattempt_resolved_at, reattempt_resolved_by_hr_id
           FROM application WHERE candidate_id = $1 ORDER BY applied_at`,
          [id],
        );
      } catch (e2) {
        if (e2.code === "42703") {
          apps = await client.query(
            "SELECT id, job_id, applied_at, interview_scheduled_at, interview_completed_at FROM application WHERE candidate_id = $1 ORDER BY applied_at",
            [id],
          );
        } else throw e2;
      }
    } else throw e;
  }
  const grievRows = await client.query(
    "SELECT body FROM grievance WHERE candidate_id = $1 ORDER BY created_at",
    [id],
  );
  let lines;
  try {
    lines = await client.query(
      `SELECT application_id, role, content, line_index
       FROM transcript_line WHERE candidate_id = $1
       ORDER BY application_id NULLS FIRST, line_index`,
      [id],
    );
  } catch (e) {
    if (e.code === "42703") {
      lines = await client.query(
        "SELECT role, content, line_index FROM transcript_line WHERE candidate_id = $1 ORDER BY line_index",
        [id],
      );
    } else throw e;
  }
  const analysis = await client.query(
    "SELECT summary, tech_score, comm_score, recommendation_label FROM candidate_analysis WHERE candidate_id = $1",
    [id],
  );
  const strengths = await client.query(
    "SELECT phrase FROM analysis_strength WHERE candidate_id = $1 ORDER BY sort_order, id",
    [id],
  );
  const areas = await client.query(
    "SELECT phrase FROM analysis_improvement_area WHERE candidate_id = $1 ORDER BY sort_order, id",
    [id],
  );
  let cv;
  try {
    cv = await client.query(
      `SELECT ${CV_SELECT_WITH_S3} FROM cv_attachment WHERE candidate_id = $1 LIMIT 1`,
      [id],
    );
  } catch (e) {
    if (e.code === "42703") {
      cv = await client.query(
        "SELECT file_name, mime_type, file_ext, size_bytes, file_data_base64 FROM cv_attachment WHERE candidate_id = $1 LIMIT 1",
        [id],
      );
    } else throw e;
  }

  let analysisObj = null;
  if (analysis.rows.length > 0) {
    const a = analysis.rows[0];
    analysisObj = {
      summary: a.summary || "",
      tech: a.tech_score ?? 0,
      comm: a.comm_score ?? 0,
      rec: a.recommendation_label || "",
      strengths: strengths.rows.map((r) => r.phrase),
      areas: areas.rows.map((r) => r.phrase),
    };
  }

  let cvFile = null;
  if (cv.rows.length > 0) {
    cvFile = await cvFileFromDbRow(cv.rows[0]);
    if (cvFile) cvFile.cvText = b.cv_text || "";
  }

  const hasAppIdCol =
    lines.rows.length > 0 && Object.prototype.hasOwnProperty.call(lines.rows[0], "application_id");
  const byApp = new Map();
  const legacyLines = [];
  for (const row of lines.rows) {
    const entry = {
      role: row.role === "assistant" || row.role === "ai" ? "ai" : "user",
      text: row.content,
    };
    if (!hasAppIdCol || row.application_id == null) {
      legacyLines.push(entry);
    } else {
      const aid = Number(row.application_id);
      if (!byApp.has(aid)) byApp.set(aid, []);
      byApp.get(aid).push(entry);
    }
  }

  const hasReattemptCols =
    apps.rows.length > 0 &&
    Object.prototype.hasOwnProperty.call(apps.rows[0], "interview_completion_status");
  const hasPerAppHrCols =
    apps.rows.length > 0 &&
    Object.prototype.hasOwnProperty.call(apps.rows[0], "hr_remarks");

  const applicationHistory = apps.rows.map((r) => {
    const aid = Number(r.id);
    const tx = byApp.get(aid);
    const base = {
      applicationId: aid,
      jobId: r.job_id,
      appliedAt: new Date(r.applied_at).toISOString(),
      interviewScheduledAt: r.interview_scheduled_at
        ? new Date(r.interview_scheduled_at).toISOString()
        : undefined,
      interviewCompletedAt: r.interview_completed_at
        ? new Date(r.interview_completed_at).toISOString()
        : undefined,
      transcript: tx && tx.length > 0 ? tx : undefined,
    };
    if (!hasReattemptCols) return base;
    const withReattempt = {
      ...base,
      interviewCompletionStatus: r.interview_completion_status || "not_started",
      reattemptRequestStatus: r.reattempt_request_status || "none",
      reattemptCandidateReasonCode: r.reattempt_candidate_reason_code || undefined,
      reattemptCandidateReasonText: r.reattempt_candidate_reason_text || undefined,
      reattemptHrReasonCode: r.reattempt_hr_reason_code || undefined,
      reattemptHrNotes: r.reattempt_hr_notes || undefined,
      reattemptRequestedAt: r.reattempt_requested_at
        ? new Date(r.reattempt_requested_at).toISOString()
        : undefined,
      reattemptResolvedAt: r.reattempt_resolved_at
        ? new Date(r.reattempt_resolved_at).toISOString()
        : undefined,
      reattemptResolvedByHrId: r.reattempt_resolved_by_hr_id || undefined,
    };
    if (!hasPerAppHrCols) return withReattempt;
    const appAi = parseApplicationAiAnalysis(r.ai_analysis_json);
    return {
      ...withReattempt,
      hrRemarks: r.hr_remarks != null ? String(r.hr_remarks) : "",
      hrDecisionStatus: r.hr_decision_status || undefined,
      analysis: appAi,
    };
  });

  const latestForJob = getLatestAppForJob(applicationHistory, b.job_id);
  let transcript;
  if (latestForJob?.transcript?.length) {
    transcript = latestForJob.transcript;
  } else if (legacyLines.length > 0) {
    transcript = legacyLines;
  } else {
    transcript = undefined;
  }

  return {
    id: b.id,
    name: b.name,
    email: b.email,
    password: "",
    status: b.status,
    jobId: b.job_id,
    cv: b.cv_text || "",
    remarks: b.remarks || "",
    lang: b.interview_language || undefined,
    consent: b.consent,
    consentAt: b.consent_at ? new Date(b.consent_at).toISOString() : null,
    fromTalentPool: b.from_talent_pool,
    purposes: purposes.rows.map((r) => r.purpose_code),
    applicationHistory,
    grievances: grievRows.rows.map((r) => r.body),
    transcript,
    analysis: analysisObj || undefined,
    cvFile: cvFile || undefined,
  };
}

async function loadTalentPool(client) {
  let entries;
  let hasPreferredCities = true;
  try {
    entries = await client.query(
      `SELECT id, linked_candidate_id, name, email, phone, experience_years, location, keywords, cv_text, submitted_at, consent_acknowledged,
              qualification, current_ctc, current_employer, source, application_date, cooling_period,
              preferred_city_1, preferred_city_2, preferred_city_3
       FROM talent_pool_entry ORDER BY submitted_at DESC`,
    );
  } catch (e) {
    if (e.code === "42703") {
      hasPreferredCities = false;
      try {
        entries = await client.query(
          `SELECT id, linked_candidate_id, name, email, phone, experience_years, location, keywords, cv_text, submitted_at, consent_acknowledged,
                  qualification, current_ctc, current_employer, source, application_date, cooling_period
           FROM talent_pool_entry ORDER BY submitted_at DESC`,
        );
      } catch (e2) {
        if (e2.code === "42703") {
          entries = await client.query(
            "SELECT id, linked_candidate_id, name, email, phone, experience_years, location, keywords, cv_text, submitted_at, consent_acknowledged FROM talent_pool_entry ORDER BY submitted_at DESC",
          );
        } else throw e2;
      }
    } else throw e;
  }
  const out = [];
  for (const e of entries.rows) {
    const roles = await client.query(
      "SELECT role_name FROM talent_pool_desired_role WHERE talent_pool_id = $1 ORDER BY role_name",
      [e.id],
    );
    const skills = await client.query(
      "SELECT skill_name FROM talent_pool_skill WHERE talent_pool_id = $1 ORDER BY skill_name",
      [e.id],
    );
    let cvf;
    try {
      cvf = await client.query(
        `SELECT ${CV_SELECT_WITH_S3} FROM talent_pool_cv_file WHERE talent_pool_id = $1`,
        [e.id],
      );
    } catch (err) {
      if (err.code === "42703") {
        cvf = await client.query(
          "SELECT file_name, mime_type, file_ext, size_bytes, file_data_base64 FROM talent_pool_cv_file WHERE talent_pool_id = $1",
          [e.id],
        );
      } else throw err;
    }
    const maps = await client.query(
      "SELECT job_id, mapped_at, mapped_by_hr_id FROM talent_pool_job_mapping WHERE talent_pool_id = $1 ORDER BY mapped_at",
      [e.id],
    );
    const cvRow = cvf.rows[0];
    const cvFile = cvRow ? await cvFileFromDbRow(cvRow) : null;
    out.push({
      id: e.id,
      candidateId: e.linked_candidate_id,
      name: e.name,
      email: e.email,
      phone: e.phone || "",
      desiredRoles: roles.rows.map((r) => r.role_name),
      skills: skills.rows.map((r) => r.skill_name),
      experience: e.experience_years ?? 0,
      location: e.location || "",
      keywords: e.keywords || "",
      qualification: e.qualification != null ? String(e.qualification) : "",
      currentCtc: e.current_ctc != null ? String(e.current_ctc) : "",
      currentEmployer: e.current_employer != null ? String(e.current_employer) : "",
      source: e.source != null ? String(e.source) : "",
      applicationDate:
        e.application_date != null
          ? new Date(e.application_date).toISOString().slice(0, 10)
          : "",
      coolingPeriod: e.cooling_period != null ? String(e.cooling_period) : "",
      preferredCity1:
        hasPreferredCities && e.preferred_city_1 != null
          ? String(e.preferred_city_1)
          : "",
      preferredCity2:
        hasPreferredCities && e.preferred_city_2 != null
          ? String(e.preferred_city_2)
          : "",
      preferredCity3:
        hasPreferredCities && e.preferred_city_3 != null
          ? String(e.preferred_city_3)
          : "",
      cvText: e.cv_text || "",
      submittedAt: new Date(e.submitted_at).toISOString(),
      cvFile,
      mappedToJobs: maps.rows.map((m) => ({
        jobId: m.job_id,
        mappedAt: new Date(m.mapped_at).toISOString(),
        mappedBy: m.mapped_by_hr_id || "",
      })),
    });
  }
  return out;
}

function encodeTalentPoolCursor(row) {
  const payload = JSON.stringify({
    t:
      row.submitted_at instanceof Date
        ? row.submitted_at.toISOString()
        : String(row.submitted_at),
    id: row.id,
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

function decodeTalentPoolCursor(cursor) {
  if (!cursor || typeof cursor !== "string") return null;
  try {
    const o = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (!o?.t || !o?.id) return null;
    return { submittedAt: o.t, id: String(o.id) };
  } catch {
    return null;
  }
}

function talentPoolRowToClient(e, roles, skills, cvRow, maps, hasPreferredCities) {
  const cvFile = cvRow
    ? {
        name: cvRow.file_name || "cv",
        ext: cvRow.file_ext || "pdf",
        mime: cvRow.mime_type || "application/pdf",
        size: cvRow.size_bytes ?? 0,
      }
    : null;
  return {
    id: e.id,
    candidateId: e.linked_candidate_id,
    name: e.name,
    email: e.email,
    phone: e.phone || "",
    desiredRoles: roles,
    skills,
    experience: e.experience_years ?? 0,
    location: e.location || "",
    keywords: e.keywords || "",
    qualification: e.qualification != null ? String(e.qualification) : "",
    currentCtc: e.current_ctc != null ? String(e.current_ctc) : "",
    currentEmployer: e.current_employer != null ? String(e.current_employer) : "",
    source: e.source != null ? String(e.source) : "",
    applicationDate:
      e.application_date != null
        ? new Date(e.application_date).toISOString().slice(0, 10)
        : "",
    coolingPeriod: e.cooling_period != null ? String(e.cooling_period) : "",
    preferredCity1:
      hasPreferredCities && e.preferred_city_1 != null
        ? String(e.preferred_city_1)
        : "",
    preferredCity2:
      hasPreferredCities && e.preferred_city_2 != null
        ? String(e.preferred_city_2)
        : "",
    preferredCity3:
      hasPreferredCities && e.preferred_city_3 != null
        ? String(e.preferred_city_3)
        : "",
    cvText: e.cv_text || "",
    submittedAt: new Date(e.submitted_at).toISOString(),
    cvFile,
    hasCv: Boolean(cvRow),
    mappedToJobs: maps,
  };
}

async function loadTalentPoolEntryRow(client, id) {
  let entries;
  let hasPreferredCities = true;
  try {
    entries = await client.query(
      `SELECT id, linked_candidate_id, name, email, phone, experience_years, location, keywords, cv_text, submitted_at, consent_acknowledged,
              qualification, current_ctc, current_employer, source, application_date, cooling_period,
              preferred_city_1, preferred_city_2, preferred_city_3
       FROM talent_pool_entry WHERE id = $1`,
      [id],
    );
  } catch (e) {
    if (e.code === "42703") {
      hasPreferredCities = false;
      entries = await client.query(
        `SELECT id, linked_candidate_id, name, email, phone, experience_years, location, keywords, cv_text, submitted_at, consent_acknowledged,
                qualification, current_ctc, current_employer, source, application_date, cooling_period
         FROM talent_pool_entry WHERE id = $1`,
        [id],
      );
    } else throw e;
  }
  const e = entries.rows[0];
  if (!e) return null;

  const roles = await client.query(
    "SELECT role_name FROM talent_pool_desired_role WHERE talent_pool_id = $1 ORDER BY role_name",
    [e.id],
  );
  const skills = await client.query(
    "SELECT skill_name FROM talent_pool_skill WHERE talent_pool_id = $1 ORDER BY skill_name",
    [e.id],
  );
  let cvf;
  try {
    cvf = await client.query(
      `SELECT ${CV_SELECT_WITH_S3} FROM talent_pool_cv_file WHERE talent_pool_id = $1`,
      [e.id],
    );
  } catch (err) {
    if (err.code === "42703") {
      cvf = await client.query(
        "SELECT file_name, mime_type, file_ext, size_bytes, file_data_base64 FROM talent_pool_cv_file WHERE talent_pool_id = $1",
        [e.id],
      );
    } else throw err;
  }
  const maps = await client.query(
    "SELECT job_id, mapped_at, mapped_by_hr_id FROM talent_pool_job_mapping WHERE talent_pool_id = $1 ORDER BY mapped_at",
    [e.id],
  );
  const cvRow = cvf.rows[0];
  const base = talentPoolRowToClient(
    e,
    roles.rows.map((r) => r.role_name),
    skills.rows.map((r) => r.skill_name),
    cvRow,
    maps.rows.map((m) => ({
      jobId: m.job_id,
      mappedAt: new Date(m.mapped_at).toISOString(),
      mappedBy: m.mapped_by_hr_id || "",
    })),
    hasPreferredCities,
  );
  if (cvRow) {
    base.cvFile = await cvFileFromDbRow(cvRow);
    if (base.cvFile) base.hasCv = true;
  }
  return base;
}

async function countTalentPool(pool) {
  const r = await pool.query("SELECT COUNT(*)::int AS total FROM talent_pool_entry");
  return r.rows[0]?.total ?? 0;
}

async function getTalentPoolById(pool, id) {
  const client = await pool.connect();
  try {
    return await loadTalentPoolEntryRow(client, id);
  } finally {
    client.release();
  }
}

function buildTalentPoolFilterWhere({
  role,
  skill,
  minExp,
  maxExp,
  location,
  source,
  keyword,
  fromDate,
  toDate,
} = {}) {
  const params = [];
  const where = [];

  if (keyword) {
    params.push(`%${keyword.toLowerCase()}%`);
    const p = `$${params.length}`;
    where.push(`(
      lower(e.name) LIKE ${p} OR lower(e.email) LIKE ${p}
      OR lower(COALESCE(e.keywords, '')) LIKE ${p}
      OR lower(COALESCE(e.cv_text, '')) LIKE ${p}
      OR lower(COALESCE(e.qualification, '')) LIKE ${p}
      OR lower(COALESCE(e.current_employer, '')) LIKE ${p}
      OR lower(COALESCE(e.location, '')) LIKE ${p}
      OR lower(COALESCE(e.source, '')) LIKE ${p}
      OR lower(COALESCE(e.preferred_city_1, '')) LIKE ${p}
      OR lower(COALESCE(e.preferred_city_2, '')) LIKE ${p}
      OR lower(COALESCE(e.preferred_city_3, '')) LIKE ${p}
    )`);
  }
  if (location) {
    params.push(`%${location.toLowerCase()}%`);
    where.push(`lower(COALESCE(e.location, '')) LIKE $${params.length}`);
  }
  if (source) {
    params.push(source);
    where.push(`e.source = $${params.length}`);
  }
  if (minExp != null && minExp !== "" && !Number.isNaN(Number(minExp))) {
    params.push(Number(minExp));
    where.push(`COALESCE(e.experience_years, 0) >= $${params.length}`);
  }
  if (maxExp != null && maxExp !== "" && !Number.isNaN(Number(maxExp))) {
    params.push(Number(maxExp));
    where.push(`COALESCE(e.experience_years, 0) <= $${params.length}`);
  }
  if (fromDate) {
    params.push(fromDate);
    where.push(`e.submitted_at >= $${params.length}::date`);
  }
  if (toDate) {
    params.push(toDate);
    where.push(`e.submitted_at < ($${params.length}::date + interval '1 day')`);
  }
  if (role) {
    params.push(`%${role.toLowerCase()}%`);
    where.push(`EXISTS (
      SELECT 1 FROM talent_pool_desired_role dr
      WHERE dr.talent_pool_id = e.id AND lower(dr.role_name) LIKE $${params.length}
    )`);
  }
  if (skill) {
    params.push(`%${skill.toLowerCase()}%`);
    where.push(`EXISTS (
      SELECT 1 FROM talent_pool_skill sk
      WHERE sk.talent_pool_id = e.id AND lower(sk.skill_name) LIKE $${params.length}
    )`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return { whereSql, params, where };
}

async function listTalentPoolPaginated(
  pool,
  {
    page,
    limit,
    cursor,
    role,
    skill,
    minExp,
    maxExp,
    location,
    source,
    keyword,
    fromDate,
    toDate,
  },
) {
  const { whereSql, params, where } = buildTalentPoolFilterWhere({
    role,
    skill,
    minExp,
    maxExp,
    location,
    source,
    keyword,
    fromDate,
    toDate,
  });

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total FROM talent_pool_entry e ${whereSql}`,
    params,
  );
  const total = countRes.rows[0]?.total ?? 0;

  const listWhere = [...where];
  const listParams = [...params];
  const decoded = decodeTalentPoolCursor(cursor);
  if (decoded) {
    listParams.push(decoded.submittedAt, decoded.id);
    listWhere.push(
      `(e.submitted_at, e.id) < ($${listParams.length - 1}::timestamptz, $${listParams.length})`,
    );
  }
  const listWhereSql = listWhere.length ? `WHERE ${listWhere.join(" AND ")}` : "";

  listParams.push(limit + 1);
  let listRes;
  try {
    listRes = await pool.query(
      `SELECT e.id, e.linked_candidate_id, e.name, e.email, e.phone, e.experience_years, e.location, e.keywords, e.cv_text,
              e.submitted_at, e.qualification, e.current_ctc, e.current_employer, e.source, e.application_date, e.cooling_period,
              e.preferred_city_1, e.preferred_city_2, e.preferred_city_3
       FROM talent_pool_entry e
       ${listWhereSql}
       ORDER BY e.submitted_at DESC, e.id DESC
       LIMIT $${listParams.length}`,
      listParams,
    );
  } catch (e) {
    if (e.code === "42703") {
      listRes = await pool.query(
        `SELECT e.id, e.linked_candidate_id, e.name, e.email, e.phone, e.experience_years, e.location, e.keywords, e.cv_text,
                e.submitted_at, e.qualification, e.current_ctc, e.current_employer, e.source, e.application_date, e.cooling_period
         FROM talent_pool_entry e
         ${listWhereSql}
         ORDER BY e.submitted_at DESC, e.id DESC
         LIMIT $${listParams.length}`,
        listParams,
      );
    } else throw e;
  }

  const rows = listRes.rows;
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && pageRows.length > 0
      ? encodeTalentPoolCursor(pageRows[pageRows.length - 1])
      : null;

  const ids = pageRows.map((r) => r.id);
  const rolesById = new Map();
  const skillsById = new Map();
  const cvById = new Map();
  const mapsById = new Map();

  if (ids.length > 0) {
    const [rolesRes, skillsRes, cvRes, mapsRes] = await Promise.all([
      pool.query(
        "SELECT talent_pool_id, role_name FROM talent_pool_desired_role WHERE talent_pool_id = ANY($1::text[]) ORDER BY role_name",
        [ids],
      ),
      pool.query(
        "SELECT talent_pool_id, skill_name FROM talent_pool_skill WHERE talent_pool_id = ANY($1::text[]) ORDER BY skill_name",
        [ids],
      ),
      pool.query(
        "SELECT talent_pool_id, file_name, file_ext, size_bytes, mime_type FROM talent_pool_cv_file WHERE talent_pool_id = ANY($1::text[])",
        [ids],
      ),
      pool.query(
        "SELECT talent_pool_id, job_id, mapped_at, mapped_by_hr_id FROM talent_pool_job_mapping WHERE talent_pool_id = ANY($1::text[]) ORDER BY mapped_at",
        [ids],
      ),
    ]);
    for (const r of rolesRes.rows) {
      if (!rolesById.has(r.talent_pool_id)) rolesById.set(r.talent_pool_id, []);
      rolesById.get(r.talent_pool_id).push(r.role_name);
    }
    for (const r of skillsRes.rows) {
      if (!skillsById.has(r.talent_pool_id)) skillsById.set(r.talent_pool_id, []);
      skillsById.get(r.talent_pool_id).push(r.skill_name);
    }
    for (const r of cvRes.rows) {
      cvById.set(r.talent_pool_id, r);
    }
    for (const r of mapsRes.rows) {
      if (!mapsById.has(r.talent_pool_id)) mapsById.set(r.talent_pool_id, []);
      mapsById.get(r.talent_pool_id).push({
        jobId: r.job_id,
        mappedAt: new Date(r.mapped_at).toISOString(),
        mappedBy: r.mapped_by_hr_id || "",
      });
    }
  }

  const hasPreferredCities = pageRows.length > 0 && "preferred_city_1" in pageRows[0];
  const items = pageRows.map((e) =>
    talentPoolRowToClient(
      e,
      rolesById.get(e.id) || [],
      skillsById.get(e.id) || [],
      cvById.get(e.id) || null,
      mapsById.get(e.id) || [],
      hasPreferredCities,
    ),
  );

  const pageNum = Math.max(1, parseInt(String(page || "1"), 10) || 1);

  return {
    page: pageNum,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    nextCursor,
    items,
  };
}

async function loadAudit(client) {
  const r = await client.query(
    "SELECT id, occurred_at, actor, action, target_ref, details FROM audit_event ORDER BY occurred_at DESC",
  );
  return r.rows.map((a) => ({
    id: a.id,
    timestamp: new Date(a.occurred_at).toISOString(),
    actor: a.actor,
    action: a.action,
    target: a.target_ref || "",
    details: a.details || "",
  }));
}

async function persistCandidateCv(client, candidateId, cvFile, existingS3Key) {
  if (!cvFile) return;
  const hasContent =
    cvFile.dataUrl || cvFile.s3Key || existingS3Key;
  if (!hasContent) return;
  let resolved;
  try {
    resolved = await resolveCvUpload(
      "candidates",
      candidateId,
      cvFile,
      existingS3Key,
    );
    if (resolved.oldKeyToDelete) {
      await deleteAttachment(resolved.oldKeyToDelete);
    }
  } catch (e) {
    throw wrapS3Error(e);
  }
  await insertCvAttachmentRow(
    client,
    "cv_attachment",
    "candidate_id",
    candidateId,
    cvFile,
    resolved,
  );
}

async function persistTalentPoolCv(client, talentPoolId, cvFile, existingS3Key) {
  if (!cvFile) return;
  const hasContent =
    cvFile.dataUrl || cvFile.s3Key || existingS3Key;
  if (!hasContent) return;
  let resolved;
  try {
    resolved = await resolveCvUpload(
      "talent-pool",
      talentPoolId,
      cvFile,
      existingS3Key,
    );
    if (resolved.oldKeyToDelete) {
      await deleteAttachment(resolved.oldKeyToDelete);
    }
  } catch (e) {
    throw wrapS3Error(e);
  }
  await insertCvAttachmentRow(
    client,
    "talent_pool_cv_file",
    "talent_pool_id",
    talentPoolId,
    cvFile,
    resolved,
  );
}

async function clearCandidateSubtree(client, candidateId) {
  await client.query(
    "DELETE FROM transcript_line WHERE candidate_id = $1",
    [candidateId],
  );
  try {
    await client.query(
      `DELETE FROM interview_answers
       WHERE application_id IN (SELECT id FROM application WHERE candidate_id = $1)`,
      [candidateId],
    );
  } catch (e) {
    if (e.code !== "42P01" && e.code !== "42703") throw e;
  }
  await client.query(
    "DELETE FROM application WHERE candidate_id = $1",
    [candidateId],
  );
  await client.query(
    "DELETE FROM candidate_purpose WHERE candidate_id = $1",
    [candidateId],
  );
  await client.query(
    "DELETE FROM grievance WHERE candidate_id = $1",
    [candidateId],
  );
  await client.query(
    "DELETE FROM analysis_strength WHERE candidate_id = $1",
    [candidateId],
  );
  await client.query(
    "DELETE FROM analysis_improvement_area WHERE candidate_id = $1",
    [candidateId],
  );
  await client.query(
    "DELETE FROM candidate_analysis WHERE candidate_id = $1",
    [candidateId],
  );
  await client.query(
    "DELETE FROM cv_attachment WHERE candidate_id = $1",
    [candidateId],
  );
  await client.query("DELETE FROM candidate WHERE id = $1", [candidateId]);
}

async function insertCandidateFull(client, c, passMap, { existingS3Key } = {}) {
  let hash = passMap.get(c.id);
  if (c.password && String(c.password).trim() !== "") {
    if (looksLikeBcrypt(c.password)) hash = c.password;
    else hash = await bcrypt.hash(String(c.password), 10);
  }
  if (!hash) {
    hash = await bcrypt.hash(`swar-temp-${c.id}-${Date.now()}`, 10);
  }

  await client.query(
    `INSERT INTO candidate (id, name, email, password_hash, status, job_id, cv_text, remarks,
      interview_language, consent, consent_at, from_talent_pool, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW())`,
    [
      c.id,
      c.name,
      c.email,
      hash,
      c.status,
      c.jobId || null,
      c.cv || "",
      c.remarks || "",
      c.lang || null,
      !!c.consent,
      c.consentAt ? new Date(c.consentAt) : null,
      !!c.fromTalentPool,
    ],
  );

  for (const p of c.purposes || []) {
    await client.query(
      "INSERT INTO candidate_purpose (candidate_id, purpose_code) VALUES ($1,$2)",
      [c.id, p],
    );
  }
  const insertedApps = [];
  for (const a of c.applicationHistory || []) {
    const dbId = await upsertApplicationRow(client, c.id, a);
    insertedApps.push({
      dbId,
      jobId: a.jobId,
      appliedAt: a.appliedAt,
      transcript: a.transcript,
    });
  }
  await bumpApplicationIdSequence(client);

  const anyPerAppTranscript = insertedApps.some(
    (x) => x.transcript && x.transcript.length > 0,
  );
  const legacyTarget =
    c.transcript &&
    c.transcript.length > 0 &&
    !anyPerAppTranscript &&
    c.jobId &&
    getLatestAppForJob(insertedApps, c.jobId);
  const legacyDbId = legacyTarget ? legacyTarget.dbId : null;

  for (const row of insertedApps) {
    const lines =
      row.transcript && row.transcript.length > 0
        ? row.transcript
        : legacyDbId != null && row.dbId === legacyDbId
          ? c.transcript
          : null;
    if (!lines || lines.length === 0) continue;
    let idx = 0;
    for (const line of lines) {
      const role = line.role === "ai" ? "ai" : "user";
      const text = line.text || "";
      try {
        await client.query(
          `INSERT INTO transcript_line (candidate_id, application_id, line_index, role, content)
           VALUES ($1,$2,$3,$4,$5)`,
          [c.id, row.dbId, idx, role, text],
        );
      } catch (e) {
        if (e.code === "42703") {
          await client.query(
            `INSERT INTO transcript_line (candidate_id, line_index, role, content)
             VALUES ($1,$2,$3,$4)`,
            [c.id, idx, role, text],
          );
        } else throw e;
      }
      idx += 1;
    }
  }
  for (const g of c.grievances || []) {
    const bodyText = typeof g === "string" ? g : g.body || "";
    if (bodyText)
      await client.query(
        "INSERT INTO grievance (candidate_id, body) VALUES ($1,$2)",
        [c.id, bodyText],
      );
  }
  if (c.analysis) {
    const a = c.analysis;
    await client.query(
      `INSERT INTO candidate_analysis (candidate_id, summary, tech_score, comm_score, recommendation_label)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        c.id,
        a.summary || "",
        a.tech ?? 0,
        a.comm ?? 0,
        a.rec || "",
      ],
    );
    let o = 0;
    for (const s of a.strengths || []) {
      await client.query(
        "INSERT INTO analysis_strength (candidate_id, sort_order, phrase) VALUES ($1,$2,$3)",
        [c.id, o++, String(s)],
      );
    }
    o = 0;
    for (const ar of a.areas || []) {
      await client.query(
        "INSERT INTO analysis_improvement_area (candidate_id, sort_order, phrase) VALUES ($1,$2,$3)",
        [c.id, o++, String(ar)],
      );
    }
  }
  await persistCandidateCv(client, c.id, c.cvFile, existingS3Key);
}

async function loadAppState(pool) {
  const client = await pool.connect();
  try {
    const meta = await loadMeta(client);
    const jobs = await loadJobs(client);
    const candidates = await loadCandidates(client);
    const talentPool = await loadTalentPool(client);
    const auditLog = await loadAudit(client);
    return { jobs, candidates, talentPool, auditLog, meta };
  } finally {
    client.release();
  }
}

/** HR bootstrap: jobs, audit, talent pool count — list via GET /api/talent-pool. */
async function loadAppStateForHr(pool) {
  const client = await pool.connect();
  try {
    const meta = await loadMeta(client);
    const jobs = await loadJobs(client);
    const auditLog = await loadAudit(client);
    const totalRes = await client.query(
      "SELECT COUNT(*)::int AS total FROM talent_pool_entry",
    );
    const talentPoolMeta = { total: totalRes.rows[0]?.total ?? 0 };
    return { jobs, candidates: [], talentPoolMeta, auditLog, meta };
  } finally {
    client.release();
  }
}

function isProductionEnv() {
  return process.env.NODE_ENV === "production";
}

function isPgDeadlock(err) {
  return Boolean(err && err.code === "40P01");
}

function saveRetryDelayMs(attempt) {
  const base = 50 * 2 ** (attempt - 1);
  return base + Math.floor(Math.random() * 40);
}

async function loadTalentCvKeys(client) {
  const talentCvKeys = new Map();
  try {
    const tpKeys = await client.query(
      "SELECT talent_pool_id, s3_key FROM talent_pool_cv_file WHERE s3_key IS NOT NULL",
    );
    for (const row of tpKeys.rows) {
      talentCvKeys.set(row.talent_pool_id, row.s3_key);
    }
  } catch (_e) {
    /* s3_key column may be missing until migration */
  }
  return talentCvKeys;
}

/** Candidate ids that exist in DB (batch). Stale talent-pool links are stored as NULL. */
async function loadExistingCandidateIds(client, ids) {
  const uniq = [
    ...new Set(
      (ids || [])
        .map((id) => (id != null ? String(id).trim() : ""))
        .filter(Boolean),
    ),
  ];
  if (uniq.length === 0) return new Set();
  const r = await client.query(
    "SELECT id FROM candidate WHERE id = ANY($1::text[])",
    [uniq],
  );
  return new Set(r.rows.map((row) => row.id));
}

function resolveLinkedCandidateId(candidateId, validIds) {
  const raw = candidateId != null ? String(candidateId).trim() : "";
  if (!raw) return null;
  return validIds.has(raw) ? raw : null;
}

async function writeJobsFromClient(client, jobs) {
  for (const j of jobs) {
    await client.query(
      `INSERT INTO job (id, title, designation, location, description, requirements)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         designation = EXCLUDED.designation,
         location = EXCLUDED.location,
         description = EXCLUDED.description,
         requirements = EXCLUDED.requirements`,
      [
        j.id,
        j.title,
        j.designation || "",
        j.location || "",
        j.description || "",
        j.requirements || "",
      ],
    );
    await client.query(
      "DELETE FROM job_interview_questions WHERE job_id = $1",
      [j.id],
    );
    const rows = normalizeInterviewQuestionsForSave(j.interviewQuestions || []);
    for (const q of rows) {
      try {
        await client.query(
          `INSERT INTO job_interview_questions (job_id, question, question_type, question_phase, display_order)
           VALUES ($1,$2,$3,$4,$5)`,
          [j.id, q.text, q.type, q.phase, q.ord],
        );
      } catch (e) {
        if (e.code === "42703") {
          await client.query(
            `INSERT INTO job_interview_questions (job_id, question, question_type, display_order)
             VALUES ($1,$2,$3,$4)`,
            [j.id, q.text, q.type, q.ord],
          );
        } else {
          throw e;
        }
      }
    }
  }
}

/** Remove jobs (and their interview questions) not present in the HR client payload. */
async function pruneJobsNotInClient(client, jobs) {
  const ids = jobs.map((j) => j.id).filter(Boolean);
  if (ids.length === 0) return;
  await client.query(
    "DELETE FROM job_interview_questions WHERE NOT (job_id = ANY($1::text[]))",
    [ids],
  );
  await client.query("DELETE FROM job WHERE NOT (id = ANY($1::text[]))", [ids]);
}

async function writeTalentPoolFromClient(client, talentPool, talentCvKeys) {
  const validCandidateIds = await loadExistingCandidateIds(
    client,
    talentPool.map((t) => t.candidateId),
  );

  for (const t of talentPool) {
    const linkedId = resolveLinkedCandidateId(t.candidateId, validCandidateIds);
    const appDate =
      t.applicationDate != null && String(t.applicationDate).trim() !== ""
        ? new Date(String(t.applicationDate).slice(0, 10) + "T12:00:00")
        : null;
    try {
      await client.query(
        `INSERT INTO talent_pool_entry (
           id, linked_candidate_id, name, email, phone, experience_years, location, keywords, cv_text, submitted_at, consent_acknowledged,
           qualification, current_ctc, current_employer, source, application_date, cooling_period,
           preferred_city_1, preferred_city_2, preferred_city_3
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          t.id,
          linkedId,
          t.name,
          t.email,
          t.phone || "",
          t.experience ?? 0,
          t.location || "",
          t.keywords || "",
          t.cvText || "",
          new Date(t.submittedAt),
          true,
          t.qualification != null ? String(t.qualification).slice(0, 500) : null,
          t.currentCtc != null ? String(t.currentCtc).slice(0, 64) : null,
          t.currentEmployer != null ? String(t.currentEmployer).slice(0, 255) : null,
          t.source != null ? String(t.source).slice(0, 128) : null,
          appDate,
          t.coolingPeriod != null ? String(t.coolingPeriod).slice(0, 255) : null,
          t.preferredCity1 != null ? String(t.preferredCity1).slice(0, 255) : null,
          t.preferredCity2 != null ? String(t.preferredCity2).slice(0, 255) : null,
          t.preferredCity3 != null ? String(t.preferredCity3).slice(0, 255) : null,
        ],
      );
    } catch (e) {
      if (e.code === "42703") {
        try {
          await client.query(
            `INSERT INTO talent_pool_entry (
               id, linked_candidate_id, name, email, phone, experience_years, location, keywords, cv_text, submitted_at, consent_acknowledged,
               qualification, current_ctc, current_employer, source, application_date, cooling_period
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
            [
              t.id,
              linkedId,
              t.name,
              t.email,
              t.phone || "",
              t.experience ?? 0,
              t.location || "",
              t.keywords || "",
              t.cvText || "",
              new Date(t.submittedAt),
              true,
              t.qualification != null ? String(t.qualification).slice(0, 500) : null,
              t.currentCtc != null ? String(t.currentCtc).slice(0, 64) : null,
              t.currentEmployer != null ? String(t.currentEmployer).slice(0, 255) : null,
              t.source != null ? String(t.source).slice(0, 128) : null,
              appDate,
              t.coolingPeriod != null ? String(t.coolingPeriod).slice(0, 255) : null,
            ],
          );
        } catch (e2) {
          if (e2.code === "42703") {
            await client.query(
              `INSERT INTO talent_pool_entry (id, linked_candidate_id, name, email, phone, experience_years, location, keywords, cv_text, submitted_at, consent_acknowledged)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
              [
                t.id,
                linkedId,
                t.name,
                t.email,
                t.phone || "",
                t.experience ?? 0,
                t.location || "",
                t.keywords || "",
                t.cvText || "",
                new Date(t.submittedAt),
                true,
              ],
            );
          } else throw e2;
        }
      } else throw e;
    }
    for (const dr of t.desiredRoles || []) {
      await client.query(
        "INSERT INTO talent_pool_desired_role (talent_pool_id, role_name) VALUES ($1,$2)",
        [t.id, dr],
      );
    }
    for (const sk of t.skills || []) {
      await client.query(
        "INSERT INTO talent_pool_skill (talent_pool_id, skill_name) VALUES ($1,$2)",
        [t.id, sk],
      );
    }
    if (t.cvFile) {
      await persistTalentPoolCv(
        client,
        t.id,
        t.cvFile,
        talentCvKeys.get(t.id) || null,
      );
    }
    for (const m of t.mappedToJobs || []) {
      await client.query(
        `INSERT INTO talent_pool_job_mapping (talent_pool_id, job_id, mapped_at, mapped_by_hr_id)
         VALUES ($1,$2,$3,$4)`,
        [t.id, m.jobId, new Date(m.mappedAt), m.mappedBy || null],
      );
    }
  }
}

async function writeAuditFromClient(client, auditLog) {
  for (const ev of auditLog) {
    await client.query(
      `INSERT INTO audit_event (id, occurred_at, actor, action, target_ref, details)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        ev.id,
        new Date(ev.timestamp),
        ev.actor,
        ev.action,
        ev.target || null,
        ev.details || "",
      ],
    );
  }
}

/** Persist jobs, audit, and optionally talent pool — never truncates candidate/application data. */
async function saveHrShellStateOnce(pool, body) {
  const jobs = body.jobs || [];
  const syncTalentPool = body.talentPool !== undefined;
  const talentPool = body.talentPool || [];
  const auditLog = body.auditLog || [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const talentCvKeys = syncTalentPool
      ? await loadTalentCvKeys(client)
      : null;

    /* Do NOT TRUNCATE job — CASCADE would wipe candidate/application/transcript tables. */
    await client.query("TRUNCATE TABLE audit_event RESTART IDENTITY");
    if (syncTalentPool) {
      await client.query(`
        TRUNCATE TABLE
          talent_pool_job_mapping,
          talent_pool_skill,
          talent_pool_desired_role,
          talent_pool_cv_file,
          talent_pool_entry
        RESTART IDENTITY CASCADE
      `);
    }

    await writeJobsFromClient(client, jobs);
    await pruneJobsNotInClient(client, jobs);
    if (syncTalentPool) {
      await writeTalentPoolFromClient(client, talentPool, talentCvKeys);
    }
    await writeAuditFromClient(client, auditLog);

    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_rb) {
      /* transaction may already be aborted */
    }
    throw e;
  } finally {
    client.release();
  }
}

async function saveAppStateOnce(pool, body) {
  if (body.saveCandidates !== false) {
    const err = new Error(
      "Full state replace is disabled. Send saveCandidates: false and use /api/candidates for candidate updates.",
    );
    err.status = 400;
    throw err;
  }
  if (Array.isArray(body.candidates) && body.candidates.length > 0) {
    const err = new Error(
      "Candidate data cannot be saved via PUT /api/state. Use PATCH /api/candidates/:id instead.",
    );
    err.status = 400;
    throw err;
  }
  return saveHrShellStateOnce(pool, body);
}

/** Full HR state replace; retries on PostgreSQL deadlock (40P01) when concurrent load/save overlap. */
async function saveAppState(pool, body) {
  const maxAttempts = 4;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await saveAppStateOnce(pool, body);
    } catch (e) {
      lastErr = e;
      if (!isPgDeadlock(e) || attempt >= maxAttempts) throw e;
      const delay = saveRetryDelayMs(attempt);
      console.warn(
        `[saveAppState] deadlock (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function verifyCandidateLogin(pool, email, password) {
  const r = await pool.query(
    "SELECT id, password_hash FROM candidate WHERE lower(email) = lower($1)",
    [email.trim()],
  );
  if (r.rows.length === 0) return { ok: false };
  const row = r.rows[0];
  const match = await bcrypt.compare(password, row.password_hash);
  if (!match) return { ok: false };
  return { ok: true, candidateId: row.id };
}

async function verifyHrLogin(pool, hrId, password) {
  const r = await pool.query(
    "SELECT hr_id, password_hash FROM hr_user WHERE hr_id = $1",
    [hrId.trim()],
  );
  if (r.rows.length === 0) return { ok: false };
  const row = r.rows[0];
  if (!row.password_hash || !password) return { ok: false };
  const match = await bcrypt.compare(password, row.password_hash);
  if (!match) return { ok: false };
  return { ok: true, hrId: row.hr_id };
}

/** HR-only: set a new login password for a candidate by id. */
async function hrResetCandidatePassword(pool, candidateId, newPassword) {
  const pw = String(newPassword || "");
  if (pw.length < 6) {
    const err = new Error("newPassword must be at least 6 characters");
    err.status = 400;
    throw err;
  }
  const hash = await bcrypt.hash(pw, 10);
  const r = await pool.query(
    "UPDATE candidate SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id",
    [hash, candidateId],
  );
  if (r.rowCount === 0) {
    const err = new Error("Candidate not found");
    err.status = 404;
    throw err;
  }
  return { ok: true, candidateId };
}

function coolingInfo(history, jobId, coolingMonths) {
  const cm = typeof coolingMonths === "number" ? coolingMonths : 3;
  const past = (history || []).filter((a) => a.jobId === jobId);
  if (past.length === 0) return { canApply: true, hasApplied: false };
  const last = [...past].sort(
    (a, b) => new Date(b.appliedAt) - new Date(a.appliedAt),
  )[0];
  // Cooling clock starts only after voice interview is completed (not at CV upload).
  if (!last.interviewCompletedAt) {
    return {
      canApply: false,
      hasApplied: true,
      pendingInterview: true,
      lastAppliedAt: last.appliedAt,
    };
  }
  const eligible = new Date(last.interviewCompletedAt);
  eligible.setMonth(eligible.getMonth() + cm);
  const now = new Date();
  if (now >= eligible) {
    return {
      canApply: true,
      hasApplied: true,
      lastAppliedAt: last.appliedAt,
      lastCompletedAt: last.interviewCompletedAt,
    };
  }
  const daysRemaining = Math.ceil((eligible - now) / 86400000);
  return {
    canApply: false,
    hasApplied: true,
    daysRemaining,
    eligibleAt: eligible.toISOString(),
    lastAppliedAt: last.appliedAt,
    lastCompletedAt: last.interviewCompletedAt,
  };
}

function userStatusForJob(history, jobId, coolingMonths) {
  const st = coolingInfo(history, jobId, coolingMonths);
  if (st.pendingInterview) {
    return { userStatus: "interview_pending" };
  }
  if (!st.canApply) {
    return {
      userStatus: "cooling",
      coolingDaysLeft: st.daysRemaining,
    };
  }
  if (st.hasApplied) {
    return { userStatus: "applied" };
  }
  return { userStatus: "open" };
}

async function listJobsApi(pool, candidateId) {
  const client = await pool.connect();
  try {
    const meta = await loadMeta(client);
    const jobs = await loadJobs(client);
    let history = [];
    if (candidateId) {
      const apps = await client.query(
        "SELECT job_id, applied_at, interview_scheduled_at, interview_completed_at FROM application WHERE candidate_id = $1 ORDER BY applied_at",
        [candidateId],
      );
      history = apps.rows.map((r) => ({
        jobId: r.job_id,
        appliedAt: new Date(r.applied_at).toISOString(),
        interviewScheduledAt: r.interview_scheduled_at
          ? new Date(r.interview_scheduled_at).toISOString()
          : undefined,
        interviewCompletedAt: r.interview_completed_at
          ? new Date(r.interview_completed_at).toISOString()
          : undefined,
      }));
    }
    const cm = meta.coolingMonths ?? 3;
    const out = jobs.map((j) => {
      if (!candidateId) {
        return { ...j };
      }
      const u = userStatusForJob(history, j.id, cm);
      const row = { ...j, userStatus: u.userStatus };
      if (u.userStatus === "cooling" && u.coolingDaysLeft != null) {
        row.coolingDaysLeft = u.coolingDaysLeft;
      }
      return row;
    });
    return { meta, jobs: out };
  } finally {
    client.release();
  }
}

async function getCandidateMe(pool, candidateId) {
  const client = await pool.connect();
  try {
    await repairCompletedInterviewsForCandidate(client, candidateId);
    return await loadOneCandidate(client, candidateId);
  } finally {
    client.release();
  }
}

async function registerCandidate(pool, { name, email, password, purposes }) {
  const id = `C${Date.now()}`;
  const hash = await bcrypt.hash(String(password), 10);
  const client = await pool.connect();
  try {
    const dup = await client.query(
      "SELECT 1 FROM candidate WHERE lower(email) = lower($1)",
      [String(email).trim()],
    );
    if (dup.rows.length > 0) {
      return { ok: false, error: "Account exists" };
    }
    const pList =
      Array.isArray(purposes) && purposes.length > 0
        ? purposes
        : ["identity", "cv", "interview", "ai"];
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO candidate (id, name, email, password_hash, status, job_id, cv_text, remarks,
        interview_language, consent, consent_at, from_talent_pool, updated_at)
       VALUES ($1,$2,$3,$4,'REGISTERED', NULL, '', '', NULL, TRUE, NOW(), FALSE, NOW())`,
      [id, String(name).trim(), String(email).trim().toLowerCase(), hash],
    );
    for (const p of pList) {
      await client.query(
        "INSERT INTO candidate_purpose (candidate_id, purpose_code) VALUES ($1,$2)",
        [id, p],
      );
    }
    await client.query("COMMIT");
    return { ok: true, candidateId: id };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function getApplicationIdForJob(pool, candidateId, jobId) {
  if (!candidateId || !jobId) return null;
  const r = await pool.query(
    `SELECT id FROM application
     WHERE candidate_id = $1 AND job_id = $2
     ORDER BY applied_at DESC LIMIT 1`,
    [candidateId, jobId],
  );
  return r.rows[0] ? Number(r.rows[0].id) : null;
}

async function deleteJob(pool, jobId) {
  const id = jobId == null ? "" : String(jobId).trim();
  if (!id) return { ok: false, error: "jobId required", status: 400 };
  const r = await pool.query(
    "DELETE FROM job WHERE id = $1 RETURNING id",
    [id],
  );
  if (r.rows.length === 0) {
    return { ok: false, error: "Not found", status: 404 };
  }
  return { ok: true };
}

async function insertTalentPoolEntry(client, t, existingS3Key) {
  const validCandidateIds = await loadExistingCandidateIds(client, [
    t.candidateId,
  ]);
  const linkedId = resolveLinkedCandidateId(t.candidateId, validCandidateIds);
  const appDate =
    t.applicationDate != null && String(t.applicationDate).trim() !== ""
      ? new Date(String(t.applicationDate).slice(0, 10) + "T12:00:00")
      : null;
  const entryId = t.id || `TP-${Date.now()}`;
  const submittedAsGuest = Boolean(t.submittedAsGuest);
  try {
    await client.query(
      `INSERT INTO talent_pool_entry (
         id, linked_candidate_id, name, email, phone, experience_years, location, keywords, cv_text, submitted_at, consent_acknowledged,
         qualification, current_ctc, current_employer, source, application_date, cooling_period,
         preferred_city_1, preferred_city_2, preferred_city_3, submitted_as_guest
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [
        entryId,
        linkedId,
        t.name,
        t.email,
        t.phone || "",
        t.experience ?? 0,
        t.location || "",
        t.keywords || "",
        t.cvText || "",
        new Date(t.submittedAt || Date.now()),
        true,
        t.qualification != null ? String(t.qualification).slice(0, 500) : null,
        t.currentCtc != null ? String(t.currentCtc).slice(0, 64) : null,
        t.currentEmployer != null ? String(t.currentEmployer).slice(0, 255) : null,
        t.source != null ? String(t.source).slice(0, 128) : null,
        appDate,
        t.coolingPeriod != null ? String(t.coolingPeriod).slice(0, 255) : null,
        t.preferredCity1 != null ? String(t.preferredCity1).slice(0, 255) : null,
        t.preferredCity2 != null ? String(t.preferredCity2).slice(0, 255) : null,
        t.preferredCity3 != null ? String(t.preferredCity3).slice(0, 255) : null,
        submittedAsGuest,
      ],
    );
  } catch (e) {
    if (e.code === "42703") {
      try {
        await client.query(
          `INSERT INTO talent_pool_entry (
             id, linked_candidate_id, name, email, phone, experience_years, location, keywords, cv_text, submitted_at, consent_acknowledged,
             qualification, current_ctc, current_employer, source, application_date, cooling_period
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            entryId,
            linkedId,
            t.name,
            t.email,
            t.phone || "",
            t.experience ?? 0,
            t.location || "",
            t.keywords || "",
            t.cvText || "",
            new Date(t.submittedAt || Date.now()),
            true,
            t.qualification != null ? String(t.qualification).slice(0, 500) : null,
            t.currentCtc != null ? String(t.currentCtc).slice(0, 64) : null,
            t.currentEmployer != null ? String(t.currentEmployer).slice(0, 255) : null,
            t.source != null ? String(t.source).slice(0, 128) : null,
            appDate,
            t.coolingPeriod != null ? String(t.coolingPeriod).slice(0, 255) : null,
          ],
        );
      } catch (e2) {
        if (e2.code === "42703") {
          await client.query(
            `INSERT INTO talent_pool_entry (id, linked_candidate_id, name, email, phone, experience_years, location, keywords, cv_text, submitted_at, consent_acknowledged)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              entryId,
              linkedId,
              t.name,
              t.email,
              t.phone || "",
              t.experience ?? 0,
              t.location || "",
              t.keywords || "",
              t.cvText || "",
              new Date(t.submittedAt || Date.now()),
              true,
            ],
          );
        } else throw e2;
      }
    } else throw e;
  }
  for (const dr of t.desiredRoles || []) {
    await client.query(
      "INSERT INTO talent_pool_desired_role (talent_pool_id, role_name) VALUES ($1,$2)",
      [entryId, dr],
    );
  }
  for (const sk of t.skills || []) {
    await client.query(
      "INSERT INTO talent_pool_skill (talent_pool_id, skill_name) VALUES ($1,$2)",
      [entryId, sk],
    );
  }
  if (t.cvFile) {
    await persistTalentPoolCv(client, entryId, t.cvFile, existingS3Key);
  }
  if (linkedId) {
    try {
      await client.query(
        "UPDATE candidate SET from_talent_pool = TRUE, updated_at = NOW() WHERE id = $1",
        [linkedId],
      );
    } catch (e) {
      if (e.code !== "42703") throw e;
    }
  }
  return entryId;
}

async function submitTalentPoolEntry(pool, entry, { candidateId } = {}) {
  if (!entry || !entry.name || !entry.email) {
    const err = new Error("name and email required");
    err.status = 400;
    throw err;
  }
  const payload = { ...entry };
  if (candidateId) {
    if (payload.candidateId && payload.candidateId !== candidateId) {
      const err = new Error("Forbidden");
      err.status = 403;
      throw err;
    }
    payload.candidateId = candidateId;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const id = await insertTalentPoolEntry(client, payload, null);
    await client.query("COMMIT");
    return { ok: true, id };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function fetchCandidateCvS3Key(pool, candidateId) {
  try {
    const cvr = await pool.query(
      "SELECT s3_key FROM cv_attachment WHERE candidate_id = $1",
      [candidateId],
    );
    return cvr.rows[0]?.s3_key || null;
  } catch (e) {
    if (e.code === "42703") return null;
    throw e;
  }
}

async function insertNewApplication(client, candidateId, jobId, appliedAt) {
  const at = appliedAt instanceof Date ? appliedAt : new Date(appliedAt);
  try {
    const ins = await client.query(
      `INSERT INTO application (
         candidate_id, job_id, applied_at, interview_completion_status, reattempt_request_status
       ) VALUES ($1,$2,$3,'not_started','none') RETURNING id`,
      [candidateId, jobId, at],
    );
    return Number(ins.rows[0].id);
  } catch (e) {
    if (e.code === "42703") {
      const ins = await client.query(
        "INSERT INTO application (candidate_id, job_id, applied_at) VALUES ($1,$2,$3) RETURNING id",
        [candidateId, jobId, at],
      );
      return Number(ins.rows[0].id);
    }
    throw e;
  }
}

async function applyToJob(pool, candidateId, { jobId, cv, cvFile }) {
  const jid = jobId == null ? "" : String(jobId).trim();
  if (!jid) {
    const err = new Error("jobId required");
    err.status = 400;
    throw err;
  }
  if (!cvFile || (!cvFile.dataUrl && !cvFile.s3Key)) {
    const err = new Error("cvFile with dataUrl required");
    err.status = 400;
    throw err;
  }

  const existingS3Key = await fetchCandidateCvS3Key(pool, candidateId);
  const client = await pool.connect();
  let applicationId;
  try {
    await client.query("BEGIN");

    const cand = await client.query(
      "SELECT id FROM candidate WHERE id = $1",
      [candidateId],
    );
    if (cand.rows.length === 0) {
      const err = new Error("Not found");
      err.status = 404;
      throw err;
    }

    const job = await client.query("SELECT id FROM job WHERE id = $1", [jid]);
    if (job.rows.length === 0) {
      const err = new Error("Job not found");
      err.status = 404;
      throw err;
    }

    const apps = await client.query(
      `SELECT id, job_id, applied_at, interview_scheduled_at, interview_completed_at
       FROM application WHERE candidate_id = $1 ORDER BY applied_at`,
      [candidateId],
    );
    const history = apps.rows.map((r) => ({
      jobId: r.job_id,
      appliedAt: new Date(r.applied_at).toISOString(),
      interviewScheduledAt: r.interview_scheduled_at
        ? new Date(r.interview_scheduled_at).toISOString()
        : undefined,
      interviewCompletedAt: r.interview_completed_at
        ? new Date(r.interview_completed_at).toISOString()
        : undefined,
      applicationId: Number(r.id),
    }));

    const meta = await loadMeta(client);
    const cooling = coolingInfo(history, jid, meta.coolingMonths ?? 3);

    const pendingForJob = history
      .filter((a) => a.jobId === jid && !a.interviewCompletedAt)
      .sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt))[0];

    if (pendingForJob) {
      applicationId = pendingForJob.applicationId;
    } else if (!cooling.canApply) {
      const err = new Error(
        cooling.pendingInterview
          ? "Interview pending for this role."
          : `Cooling period active. Re-apply in ${cooling.daysRemaining} days.`,
      );
      err.status = 409;
      err.code = cooling.pendingInterview ? "INTERVIEW_PENDING" : "COOLING_PERIOD";
      err.daysRemaining = cooling.daysRemaining;
      err.eligibleAt = cooling.eligibleAt;
      throw err;
    } else {
      applicationId = await insertNewApplication(
        client,
        candidateId,
        jid,
        new Date(),
      );
    }

    await client.query(
      `UPDATE candidate SET status = 'APPLIED', job_id = $2, cv_text = $3, updated_at = NOW()
       WHERE id = $1`,
      [candidateId, jid, cv != null ? String(cv) : ""],
    );

    await client.query(
      "DELETE FROM cv_attachment WHERE candidate_id = $1",
      [candidateId],
    );
    await persistCandidateCv(client, candidateId, cvFile, existingS3Key);

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  const candidate = await getCandidateMe(pool, candidateId);
  return { candidate, applicationId };
}

async function patchCandidateFromClient(client, c, passMap, { existingS3Key, hrId } = {}) {
  const prev = await client.query(
    "SELECT id, password_hash FROM candidate WHERE id = $1",
    [c.id],
  );
  if (prev.rows.length === 0) {
    const err = new Error("Not found");
    err.status = 404;
    throw err;
  }
  const hash = passMap.get(c.id) || prev.rows[0].password_hash;

  await client.query(
    `UPDATE candidate SET name = $2, email = $3, password_hash = $4, status = $5, job_id = $6,
       cv_text = $7, remarks = $8, interview_language = $9, consent = $10, consent_at = $11,
       from_talent_pool = $12, updated_at = NOW()
     WHERE id = $1`,
    [
      c.id,
      c.name,
      c.email,
      hash,
      c.status,
      c.jobId || null,
      c.cv || "",
      c.remarks || "",
      c.lang || null,
      !!c.consent,
      c.consentAt ? new Date(c.consentAt) : null,
      !!c.fromTalentPool,
    ],
  );

  await client.query("DELETE FROM candidate_purpose WHERE candidate_id = $1", [c.id]);
  for (const p of c.purposes || []) {
    await client.query(
      "INSERT INTO candidate_purpose (candidate_id, purpose_code) VALUES ($1,$2)",
      [c.id, p],
    );
  }

  const clientApps = c.applicationHistory || [];
  const dbAppCount = await client.query(
    "SELECT COUNT(*)::int AS n FROM application WHERE candidate_id = $1",
    [c.id],
  );
  const dbHasApps = (dbAppCount.rows[0]?.n ?? 0) > 0;

  const insertedApps = [];
  if (clientApps.length > 0 || !dbHasApps) {
    const keptIds = [];
    for (const a of clientApps) {
      const dbId = await upsertApplicationRow(client, c.id, a, hrId);
      keptIds.push(dbId);
      insertedApps.push({
        dbId,
        jobId: a.jobId,
        appliedAt: a.appliedAt,
        transcript: a.transcript,
      });
    }
    await bumpApplicationIdSequence(client);
    if (keptIds.length > 0) {
      await client.query(
        `DELETE FROM application WHERE candidate_id = $1 AND id <> ALL($2::bigint[])`,
        [c.id, keptIds],
      );
    }
  }

  const anyPerAppTranscript = insertedApps.some(
    (x) => x.transcript && x.transcript.length > 0,
  );
  const legacyTarget =
    c.transcript &&
    c.transcript.length > 0 &&
    !anyPerAppTranscript &&
    c.jobId &&
    getLatestAppForJob(insertedApps, c.jobId);
  const legacyDbId = legacyTarget ? legacyTarget.dbId : null;

  for (const row of insertedApps) {
    const lines =
      row.transcript && row.transcript.length > 0
        ? row.transcript
        : legacyDbId != null && row.dbId === legacyDbId
          ? c.transcript
          : null;
    if (lines && lines.length > 0) {
      await writeTranscriptLines(client, c.id, row.dbId, lines);
    }
  }

  await client.query("DELETE FROM grievance WHERE candidate_id = $1", [c.id]);
  for (const g of c.grievances || []) {
    const bodyText = typeof g === "string" ? g : g.body || "";
    if (bodyText) {
      await client.query(
        "INSERT INTO grievance (candidate_id, body) VALUES ($1,$2)",
        [c.id, bodyText],
      );
    }
  }

  await client.query(
    "DELETE FROM analysis_strength WHERE candidate_id = $1",
    [c.id],
  );
  await client.query(
    "DELETE FROM analysis_improvement_area WHERE candidate_id = $1",
    [c.id],
  );
  await client.query("DELETE FROM candidate_analysis WHERE candidate_id = $1", [c.id]);
  if (c.analysis) {
    const a = c.analysis;
    await client.query(
      `INSERT INTO candidate_analysis (candidate_id, summary, tech_score, comm_score, recommendation_label)
       VALUES ($1,$2,$3,$4,$5)`,
      [c.id, a.summary || "", a.tech ?? 0, a.comm ?? 0, a.rec || ""],
    );
    let o = 0;
    for (const s of a.strengths || []) {
      await client.query(
        "INSERT INTO analysis_strength (candidate_id, sort_order, phrase) VALUES ($1,$2,$3)",
        [c.id, o++, String(s)],
      );
    }
    o = 0;
    for (const ar of a.areas || []) {
      await client.query(
        "INSERT INTO analysis_improvement_area (candidate_id, sort_order, phrase) VALUES ($1,$2,$3)",
        [c.id, o++, String(ar)],
      );
    }
  }

  const cvHasFresh =
    c.cvFile &&
    (isFreshDataUrl(c.cvFile.dataUrl) ||
      (c.cvFile.s3Key && c.cvFile.s3Key !== existingS3Key));
  if (cvHasFresh) {
    await client.query("DELETE FROM cv_attachment WHERE candidate_id = $1", [c.id]);
    await persistCandidateCv(client, c.id, c.cvFile, existingS3Key);
  }
}

async function saveOneCandidate(pool, candidateId, candidateData, { hrId } = {}) {
  if (!candidateData || String(candidateData.id) !== String(candidateId)) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
  let existingS3Key = null;
  try {
    const cvr = await pool.query(
      "SELECT s3_key FROM cv_attachment WHERE candidate_id = $1",
      [candidateId],
    );
    existingS3Key = cvr.rows[0]?.s3_key || null;
  } catch (e) {
    if (e.code !== "42703") throw e;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const prev = await client.query(
      "SELECT id, password_hash FROM candidate WHERE id = $1",
      [candidateId],
    );
    if (prev.rows.length === 0) {
      const err = new Error("Not found");
      err.status = 404;
      throw err;
    }
    const passMap = new Map([
      [candidateId, prev.rows[0].password_hash],
    ]);
    await patchCandidateFromClient(client, candidateData, passMap, {
      existingS3Key,
      hrId,
    });
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

function mapListRowToSummary(r) {
  const appCount = Number(r.application_count || 0);
  const sched = r.interview_scheduled_at
    ? new Date(r.interview_scheduled_at).toISOString()
    : undefined;
  const hasTranscript = Boolean(r.has_transcript);
  const hasAnalysis = Boolean(r.has_analysis);
  const hasVoiceInterview = Boolean(r.has_voice_interview);
  const ic = r.interview_completion_status || null;
  const interviewDone =
    Boolean(r.interview_completed_at) ||
    hasTranscript ||
    ic === "completed" ||
    hasVoiceInterview;
  const status =
    interviewDone &&
    (r.status === "APPLIED" ||
      r.status === "SHORTLISTED" ||
      r.status === "REGISTERED" ||
      r.status === "SCHEDULED")
      ? "INTERVIEWED"
      : r.status;
  const fromPoolSource = Boolean(r.from_talent_pool || r.in_talent_pool);
  const hasActiveJob = Boolean(r.job_id);
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    status,
    jobId: r.job_id,
    consent: r.consent,
    fromTalentPool: fromPoolSource && !hasActiveJob,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
    interviewScheduledAt: sched,
    applicationCount: appCount,
    hasTranscript: hasTranscript || (interviewDone && hasVoiceInterview),
    hasAnalysis,
    interviewCompletedAt: r.interview_completed_at
      ? new Date(r.interview_completed_at).toISOString()
      : undefined,
    cv: r.cv_text != null ? String(r.cv_text) : undefined,
    applicationHistory:
      appCount > 0
        ? [
            {
              jobId: r.job_id,
              interviewScheduledAt: sched,
              interviewCompletedAt: r.interview_completed_at
                ? new Date(r.interview_completed_at).toISOString()
                : undefined,
              interviewCompletionStatus:
                ic === "completed" || interviewDone ? "completed" : "not_started",
            },
          ]
        : [],
    analysis: hasAnalysis ? { summary: "" } : undefined,
  };
}

async function listCandidateStats(pool) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS n FROM candidate GROUP BY status`,
  );
  const byStatus = {};
  let total = 0;
  for (const row of r.rows) {
    byStatus[row.status] = row.n;
    total += row.n;
  }
  let interviewedExtra = 0;
  try {
    const ic = await pool.query(
      `SELECT COUNT(DISTINCT c.id)::int AS n
       FROM candidate c
       INNER JOIN application a ON a.candidate_id = c.id
       WHERE a.interview_completion_status = 'completed'
         AND c.status IN ('APPLIED', 'SHORTLISTED', 'REGISTERED', 'SCHEDULED')`,
    );
    interviewedExtra = ic.rows[0]?.n ?? 0;
  } catch (e) {
    if (e.code !== "42703") throw e;
  }
  const interviewed =
    (byStatus.INTERVIEWED || 0) + interviewedExtra;
  const applied = Math.max(0, (byStatus.APPLIED || 0) - interviewedExtra);
  return {
    total,
    applied,
    shortlisted: byStatus.SHORTLISTED || 0,
    interviewed,
    rejected: byStatus.REJECTED || 0,
    registered: byStatus.REGISTERED || 0,
    byStatus,
  };
}

function encodeListCursor(row) {
  const payload = JSON.stringify({
    t:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    id: row.id,
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

function decodeListCursor(cursor) {
  if (!cursor || typeof cursor !== "string") return null;
  try {
    const o = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (!o?.t || !o?.id) return null;
    return { createdAt: o.t, id: String(o.id) };
  } catch {
    return null;
  }
}

async function listCandidatesPaginated(
  pool,
  { page, limit, cursor, status, search, consentOnly, includeCvText },
) {
  const params = [];
  const where = [];

  if (status) {
    params.push(status);
    where.push(`c.status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(
      `(lower(c.name) LIKE $${params.length} OR lower(c.email) LIKE $${params.length})`,
    );
  }
  if (consentOnly) {
    where.push("c.consent = true");
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const cvSelect = includeCvText ? ", c.cv_text" : "";

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total FROM candidate c ${whereSql}`,
    params,
  );
  const total = countRes.rows[0]?.total ?? 0;

  const listWhere = [...where];
  const listParams = [...params];
  const decoded = decodeListCursor(cursor);
  if (decoded) {
    listParams.push(decoded.createdAt, decoded.id);
    listWhere.push(
      `(c.created_at, c.id) < ($${listParams.length - 1}::timestamptz, $${listParams.length})`,
    );
  }
  const listWhereSql = listWhere.length ? `WHERE ${listWhere.join(" AND ")}` : "";

  listParams.push(limit + 1);
  const listRes = await pool.query(
    `SELECT c.id, c.name, c.email, c.status, c.job_id, c.consent, c.from_talent_pool,
            c.created_at, c.updated_at${cvSelect},
            EXISTS (
              SELECT 1 FROM talent_pool_entry tp
              WHERE tp.linked_candidate_id = c.id
                 OR lower(tp.email) = lower(c.email)
            ) AS in_talent_pool,
            la.interview_scheduled_at,
            la.interview_completed_at,
            la.interview_completion_status,
            (SELECT COUNT(*)::int FROM application a WHERE a.candidate_id = c.id) AS application_count,
            EXISTS (SELECT 1 FROM transcript_line tl WHERE tl.candidate_id = c.id) AS has_transcript,
            EXISTS (SELECT 1 FROM candidate_analysis ca WHERE ca.candidate_id = c.id) AS has_analysis,
            EXISTS (
              SELECT 1 FROM interview_answers ia
              INNER JOIN application ax ON ax.id = ia.application_id
              WHERE ax.candidate_id = c.id
            ) AS has_voice_interview
     FROM candidate c
     LEFT JOIN LATERAL (
       SELECT a.interview_scheduled_at, a.interview_completed_at,
              a.interview_completion_status
       FROM application a
       WHERE a.candidate_id = c.id
       ORDER BY a.applied_at DESC NULLS LAST, a.id DESC
       LIMIT 1
     ) la ON true
     ${listWhereSql}
     ORDER BY c.created_at DESC, c.id DESC
     LIMIT $${listParams.length}`,
    listParams,
  );

  const rows = listRes.rows;
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && pageRows.length > 0
      ? encodeListCursor(pageRows[pageRows.length - 1])
      : null;

  const pageNum = Math.max(1, parseInt(String(page || "1"), 10) || 1);

  return {
    page: pageNum,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    nextCursor,
    candidates: pageRows.map(mapListRowToSummary),
  };
}

async function findCandidateByEmail(pool, email) {
  const r = await pool.query(
    "SELECT id FROM candidate WHERE lower(email) = lower($1) LIMIT 1",
    [String(email || "").trim()],
  );
  if (r.rows.length === 0) return null;
  return r.rows[0].id;
}

async function patchCandidateForHr(pool, candidateId, candidateData, { hrId } = {}) {
  await saveOneCandidate(pool, candidateId, candidateData, { hrId });
  void notifyPendingHrDecisionEmailsForCandidate(pool, candidateId).catch((err) =>
    console.error("[hr-decision-email]", candidateId, err),
  );
  return getCandidateMe(pool, candidateId);
}

async function bulkUpdateCandidateStatus(pool, updates) {
  if (!Array.isArray(updates) || updates.length === 0) return { ok: true, updated: 0 };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let n = 0;
    for (const row of updates) {
      if (!row?.id || !row?.status) continue;
      const r = await client.query(
        `UPDATE candidate SET status = $1, updated_at = NOW() WHERE id = $2`,
        [String(row.status), row.id],
      );
      n += r.rowCount || 0;
    }
    await client.query("COMMIT");
    return { ok: true, updated: n };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function mapTalentPoolToJob(pool, { talentPoolId, jobId, hrId }) {
  const client = await pool.connect();
  try {
    const tp = await client.query(
      `SELECT id, name, email, cv_text, submitted_at FROM talent_pool_entry WHERE id = $1`,
      [talentPoolId],
    );
    if (tp.rows.length === 0) {
      const err = new Error("Talent pool entry not found");
      err.status = 404;
      throw err;
    }
    const entry = tp.rows[0];
    let cvFile = null;
    try {
      const cvf = await client.query(
        `SELECT ${CV_SELECT_WITH_S3} FROM talent_pool_cv_file WHERE talent_pool_id = $1`,
        [talentPoolId],
      );
      if (cvf.rows[0]) cvFile = await cvFileFromDbRow(cvf.rows[0]);
    } catch (_e) {
      /* optional */
    }

    await client.query("BEGIN");

    const existingId = (
      await client.query(
        "SELECT id FROM candidate WHERE lower(email) = lower($1) LIMIT 1",
        [String(entry.email || "").trim()],
      )
    ).rows[0]?.id;
    const created = !existingId;
    let candidateId = existingId;
    const appliedAt = new Date().toISOString();
    const newApp = {
      jobId,
      appliedAt,
      interviewCompletionStatus: "not_started",
      reattemptRequestStatus: "none",
    };

    if (candidateId) {
      const passRow = await client.query(
        "SELECT password_hash FROM candidate WHERE id = $1",
        [candidateId],
      );
      const passMap = new Map([[candidateId, passRow.rows[0]?.password_hash]]);
      const existing = await loadOneCandidate(client, candidateId);
      const merged = {
        ...existing,
        status: "APPLIED",
        jobId,
        cv: entry.cv_text || existing.cv || "",
        cvFile: cvFile || existing.cvFile,
        fromTalentPool: true,
        applicationHistory: [...(existing.applicationHistory || []), newApp],
      };
      const existingS3Key = await fetchCandidateCvS3Key(pool, candidateId);
      await patchCandidateFromClient(client, merged, passMap, { existingS3Key });
    } else {
      candidateId = `C${Date.now()}`;
      const nc = {
        id: candidateId,
        name: entry.name,
        email: entry.email,
        password: `talentpool${Date.now()}`,
        cv: entry.cv_text || "",
        cvFile,
        status: "APPLIED",
        jobId,
        applicationHistory: [newApp],
        consent: true,
        consentAt: entry.submitted_at
          ? new Date(entry.submitted_at).toISOString()
          : appliedAt,
        purposes: ["identity", "cv", "interview", "ai"],
        grievances: [],
        fromTalentPool: true,
      };
      const passMap = new Map();
      await insertCandidateFull(client, nc, passMap, { existingS3Key: null });
    }

    await client.query(
      `INSERT INTO talent_pool_job_mapping (talent_pool_id, job_id, mapped_at, mapped_by_hr_id)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT DO NOTHING`,
      [talentPoolId, jobId, new Date(), hrId || null],
    ).catch(async (e) => {
      if (e.code !== "42P10") {
        await client.query(
          `INSERT INTO talent_pool_job_mapping (talent_pool_id, job_id, mapped_at, mapped_by_hr_id)
           VALUES ($1,$2,$3,$4)`,
          [talentPoolId, jobId, new Date(), hrId || null],
        );
      }
    });

    await client.query("COMMIT");
    const candidate = await getCandidateMe(pool, candidateId);
    return { ok: true, candidateId, candidate, created };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_rb) {
      /* */
    }
    throw e;
  } finally {
    client.release();
  }
}

async function exportCandidatesReport(pool, { status, search, activeJobOnly } = {}) {
  const metaRow = await pool.query(
    "SELECT cooling_period_months FROM organization_setting WHERE singleton = 1",
  );
  const coolingMonths = metaRow.rows[0]?.cooling_period_months ?? 3;

  const params = [];
  const where = [];
  if (status) {
    params.push(status);
    where.push(`c.status = $${params.length}`);
  }
  if (search) {
    params.push(`%${String(search).toLowerCase()}%`);
    where.push(
      `(lower(c.name) LIKE $${params.length} OR lower(c.email) LIKE $${params.length})`,
    );
  }
  if (activeJobOnly) {
    where.push("a.job_id IS NOT NULL");
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const exportSql = `
    SELECT
      c.name AS candidate_name,
      c.email AS candidate_email,
      c.status AS candidate_status,
      c.from_talent_pool,
      a.id AS application_id,
      a.job_id,
      a.applied_at,
      a.interview_scheduled_at,
      a.interview_completed_at,
      a.interview_completion_status,
      a.reattempt_request_status,
      a.hr_decision_status,
      a.hr_decision_at,
      a.ai_analysis_json,
      j.title AS job_title,
      tp.phone AS tp_phone,
      tp.qualification AS tp_qualification,
      tp.location AS tp_location,
      tp.preferred_city_1 AS tp_preferred_city_1,
      tp.preferred_city_2 AS tp_preferred_city_2,
      tp.preferred_city_3 AS tp_preferred_city_3,
      tp.experience_years AS tp_experience_years,
      tp.current_ctc AS tp_current_ctc,
      tp.current_employer AS tp_current_employer,
      tp.source AS tp_source,
      hu.display_name AS hr_spoc_name,
      COALESCE(ia_cnt.n, 0)::int AS attempt_count,
      COALESCE(ia_dur.total_seconds, 0)::int AS total_duration_seconds,
      EXISTS (
        SELECT 1 FROM transcript_line tl
        WHERE tl.candidate_id = c.id
          AND (tl.application_id = a.id OR tl.application_id IS NULL)
      ) AS has_transcript,
      EXISTS (
        SELECT 1 FROM interview_answers ans WHERE ans.application_id = a.id
      ) AS has_voice_interview,
      ca.tech_score,
      ca.comm_score,
      ca.recommendation_label
    FROM candidate c
    INNER JOIN application a ON a.candidate_id = c.id
    LEFT JOIN job j ON j.id = a.job_id
    LEFT JOIN LATERAL (
      SELECT phone, qualification, location, experience_years, current_ctc, current_employer, source,
             preferred_city_1, preferred_city_2, preferred_city_3
      FROM talent_pool_entry
      WHERE linked_candidate_id = c.id
      ORDER BY submitted_at DESC NULLS LAST
      LIMIT 1
    ) tp ON true
    LEFT JOIN hr_user hu ON hu.hr_id = a.hr_decided_by_hr_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS n FROM interview_attempts ia WHERE ia.application_id = a.id
    ) ia_cnt ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(duration_seconds), 0)::bigint AS total_seconds
      FROM interview_answers ans WHERE ans.application_id = a.id
    ) ia_dur ON true
    LEFT JOIN candidate_analysis ca ON ca.candidate_id = c.id
    ${whereSql}
    ORDER BY c.created_at DESC, a.applied_at DESC`;

  let rows;
  try {
    const r = await pool.query(exportSql, params);
    rows = r.rows;
  } catch (e) {
    if (e.code !== "42703" && e.code !== "42P01") throw e;
    const fallbackSql = `
      SELECT
        c.name AS candidate_name,
        c.email AS candidate_email,
        c.status AS candidate_status,
        c.from_talent_pool,
        a.id AS application_id,
        a.job_id,
        a.applied_at,
        a.interview_scheduled_at,
        a.interview_completed_at,
        a.interview_completion_status,
        a.reattempt_request_status,
        a.hr_decision_status,
        NULL::timestamptz AS hr_decision_at,
        a.ai_analysis_json,
        j.title AS job_title,
        tp.phone AS tp_phone,
        tp.qualification AS tp_qualification,
        tp.location AS tp_location,
        tp.preferred_city_1 AS tp_preferred_city_1,
        tp.preferred_city_2 AS tp_preferred_city_2,
        tp.preferred_city_3 AS tp_preferred_city_3,
        tp.experience_years AS tp_experience_years,
        tp.current_ctc AS tp_current_ctc,
        tp.current_employer AS tp_current_employer,
        tp.source AS tp_source,
        NULL::varchar AS hr_spoc_name,
        0::int AS attempt_count,
        0::int AS total_duration_seconds,
        EXISTS (
          SELECT 1 FROM transcript_line tl WHERE tl.candidate_id = c.id
        ) AS has_transcript,
        false AS has_voice_interview,
        ca.tech_score,
        ca.comm_score,
        ca.recommendation_label
      FROM candidate c
      INNER JOIN application a ON a.candidate_id = c.id
      LEFT JOIN job j ON j.id = a.job_id
      LEFT JOIN LATERAL (
        SELECT phone, qualification, location, experience_years, current_ctc, current_employer, source,
               preferred_city_1, preferred_city_2, preferred_city_3
        FROM talent_pool_entry
        WHERE linked_candidate_id = c.id
        ORDER BY submitted_at DESC NULLS LAST
        LIMIT 1
      ) tp ON true
      LEFT JOIN candidate_analysis ca ON ca.candidate_id = c.id
      ${whereSql}
      ORDER BY c.created_at DESC, a.applied_at DESC`;
    const r = await pool.query(fallbackSql, params);
    rows = r.rows;
  }

  let guestRows = [];
  if (!activeJobOnly && shouldIncludeGuestTalentPoolExport(status)) {
    const tpParams = [];
    const tpWhere = ["e.submitted_as_guest = TRUE"];
    tpWhere.push(`NOT EXISTS (
      SELECT 1 FROM application a
      INNER JOIN candidate c ON c.id = a.candidate_id
      WHERE lower(c.email) = lower(e.email)
         OR (e.linked_candidate_id IS NOT NULL AND c.id = e.linked_candidate_id)
    )`);
    if (search) {
      tpParams.push(`%${String(search).toLowerCase()}%`);
      tpWhere.push(
        `(lower(e.name) LIKE $${tpParams.length} OR lower(e.email) LIKE $${tpParams.length})`,
      );
    }
    const tpWhereSql = `WHERE ${tpWhere.join(" AND ")}`;
    const guestSql = `
      SELECT
        e.name AS candidate_name,
        e.email AS candidate_email,
        e.phone AS tp_phone,
        e.qualification AS tp_qualification,
        e.location AS tp_location,
        e.preferred_city_1 AS tp_preferred_city_1,
        e.preferred_city_2 AS tp_preferred_city_2,
        e.preferred_city_3 AS tp_preferred_city_3,
        e.experience_years AS tp_experience_years,
        e.current_ctc AS tp_current_ctc,
        e.current_employer AS tp_current_employer,
        e.source AS tp_source,
        e.cooling_period AS tp_cooling_period,
        COALESCE(e.application_date, e.submitted_at) AS applied_at,
        (
          SELECT string_agg(dr.role_name, ', ' ORDER BY dr.role_name)
          FROM talent_pool_desired_role dr
          WHERE dr.talent_pool_id = e.id
        ) AS job_title
      FROM talent_pool_entry e
      ${tpWhereSql}
      ORDER BY e.submitted_at DESC, e.id DESC`;
    try {
      const tpRes = await pool.query(guestSql, tpParams);
      guestRows = tpRes.rows;
    } catch (e) {
      if (e.code !== "42703") throw e;
      guestRows = [];
    }
  }

  const exportedEmails = new Set(
    rows.map((r) => String(r.candidate_email || "").trim().toLowerCase()).filter(Boolean),
  );
  guestRows = guestRows.filter(
    (r) => !exportedEmails.has(String(r.candidate_email || "").trim().toLowerCase()),
  );

  return buildCandidateExportCsv({
    applicationRows: rows,
    guestRows,
    coolingMonths,
  });
}

async function exportTalentPoolReport(
  pool,
  { role, skill, minExp, maxExp, location, source, keyword, fromDate, toDate },
) {
  const { whereSql, params } = buildTalentPoolFilterWhere({
    role,
    skill,
    minExp,
    maxExp,
    location,
    source,
    keyword,
    fromDate,
    toDate,
  });
  const sql = `
    SELECT
      e.name AS candidate_name,
      e.email AS candidate_email,
      e.phone AS tp_phone,
      e.qualification AS tp_qualification,
      e.location AS tp_location,
      e.preferred_city_1 AS tp_preferred_city_1,
      e.preferred_city_2 AS tp_preferred_city_2,
      e.preferred_city_3 AS tp_preferred_city_3,
      e.experience_years AS tp_experience_years,
      e.current_ctc AS tp_current_ctc,
      e.current_employer AS tp_current_employer,
      e.source AS tp_source,
      e.cooling_period AS tp_cooling_period,
      COALESCE(e.application_date, e.submitted_at) AS applied_at,
      (
        SELECT string_agg(dr.role_name, ', ' ORDER BY dr.role_name)
        FROM talent_pool_desired_role dr
        WHERE dr.talent_pool_id = e.id
      ) AS job_title
    FROM talent_pool_entry e
    ${whereSql}
    ORDER BY e.submitted_at DESC, e.id DESC`;
  const r = await pool.query(sql, params);
  return buildCandidateExportCsv({
    applicationRows: [],
    guestRows: r.rows,
    coolingMonths: 3,
  });
}

module.exports = {
  loadAppState,
  loadAppStateForHr,
  saveAppState,
  saveOneCandidate,
  patchCandidateForHr,
  submitTalentPoolEntry,
  countTalentPool,
  getTalentPoolById,
  listTalentPoolPaginated,
  exportTalentPoolReport,
  listCandidatesPaginated,
  listCandidateStats,
  exportCandidatesReport,
  findCandidateByEmail,
  bulkUpdateCandidateStatus,
  mapTalentPoolToJob,
  verifyCandidateLogin,
  verifyHrLogin,
  hrResetCandidatePassword,
  listJobsApi,
  getCandidateMe,
  registerCandidate,
  getApplicationIdForJob,
  applyToJob,
  deleteJob,
};
