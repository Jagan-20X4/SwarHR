const bcrypt = require("bcryptjs");

function looksLikeBcrypt(s) {
  return typeof s === "string" && s.startsWith("$2") && s.length > 50;
}

function dataUrlFromRow(row) {
  if (!row || !row.file_data_base64) return null;
  const mime = row.mime_type || "application/octet-stream";
  return `data:${mime};base64,${row.file_data_base64}`;
}

function stripBase64Prefix(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const i = dataUrl.indexOf("base64,");
  if (i === -1) return dataUrl;
  return dataUrl.slice(i + 7);
}

async function loadMeta(client) {
  const [org, dpo, cats] = await Promise.all([
    client.query(
      "SELECT cooling_period_months, company_name, max_cv_upload_mb FROM organization_setting WHERE singleton = 1",
    ),
    client.query(
      "SELECT full_name, title, email, phone FROM dpo_contact WHERE singleton = 1",
    ),
    client.query(
      "SELECT code, label, items_summary, purpose, retention_note FROM data_processing_category ORDER BY code",
    ),
  ]);
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

async function loadJobs(client) {
  const r = await client.query(
    "SELECT id, title, designation, location, description, requirements FROM job ORDER BY id",
  );
  return r.rows.map((j) => ({
    id: j.id,
    title: j.title,
    designation: j.designation || "",
    location: j.location || "",
    description: j.description || "",
    requirements: j.requirements || "",
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

  const [purposes, apps, grievRows, lines, analysis, strengths, areas, cv] =
    await Promise.all([
      client.query(
        "SELECT purpose_code FROM candidate_purpose WHERE candidate_id = $1 ORDER BY purpose_code",
        [id],
      ),
      client.query(
        "SELECT job_id, applied_at, interview_scheduled_at, interview_completed_at FROM application WHERE candidate_id = $1 ORDER BY applied_at",
        [id],
      ),
      client.query(
        "SELECT body FROM grievance WHERE candidate_id = $1 ORDER BY created_at",
        [id],
      ),
      client.query(
        "SELECT role, content FROM transcript_line WHERE candidate_id = $1 ORDER BY line_index",
        [id],
      ),
      client.query(
        "SELECT summary, tech_score, comm_score, recommendation_label FROM candidate_analysis WHERE candidate_id = $1",
        [id],
      ),
      client.query(
        "SELECT phrase FROM analysis_strength WHERE candidate_id = $1 ORDER BY sort_order, id",
        [id],
      ),
      client.query(
        "SELECT phrase FROM analysis_improvement_area WHERE candidate_id = $1 ORDER BY sort_order, id",
        [id],
      ),
      client.query(
        "SELECT file_name, mime_type, file_ext, size_bytes, file_data_base64 FROM cv_attachment WHERE candidate_id = $1 LIMIT 1",
        [id],
      ),
    ]);

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
    const f = cv.rows[0];
    cvFile = {
      name: f.file_name || "resume",
      mime: f.mime_type || "",
      ext: (f.file_ext || "").toLowerCase(),
      size: Number(f.size_bytes || 0),
      dataUrl: dataUrlFromRow(f),
      cvText: b.cv_text || "",
    };
  }

  const transcript =
    lines.rows.length > 0
      ? lines.rows.map((row) => ({
          role: row.role === "assistant" || row.role === "ai" ? "ai" : "user",
          text: row.content,
        }))
      : undefined;

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
    applicationHistory: apps.rows.map((r) => ({
      jobId: r.job_id,
      appliedAt: new Date(r.applied_at).toISOString(),
      interviewScheduledAt: r.interview_scheduled_at
        ? new Date(r.interview_scheduled_at).toISOString()
        : undefined,
      interviewCompletedAt: r.interview_completed_at
        ? new Date(r.interview_completed_at).toISOString()
        : undefined,
    })),
    grievances: grievRows.rows.map((r) => r.body),
    transcript,
    analysis: analysisObj || undefined,
    cvFile: cvFile || undefined,
  };
}

async function loadTalentPool(client) {
  const entries = await client.query(
    "SELECT id, linked_candidate_id, name, email, phone, experience_years, location, keywords, cv_text, submitted_at, consent_acknowledged FROM talent_pool_entry ORDER BY submitted_at DESC",
  );
  const out = [];
  for (const e of entries.rows) {
    const [roles, skills, cvf, maps] = await Promise.all([
      client.query(
        "SELECT role_name FROM talent_pool_desired_role WHERE talent_pool_id = $1 ORDER BY role_name",
        [e.id],
      ),
      client.query(
        "SELECT skill_name FROM talent_pool_skill WHERE talent_pool_id = $1 ORDER BY skill_name",
        [e.id],
      ),
      client.query(
        "SELECT file_name, mime_type, file_ext, size_bytes, file_data_base64 FROM talent_pool_cv_file WHERE talent_pool_id = $1",
        [e.id],
      ),
      client.query(
        "SELECT job_id, mapped_at, mapped_by_hr_id FROM talent_pool_job_mapping WHERE talent_pool_id = $1 ORDER BY mapped_at",
        [e.id],
      ),
    ]);
    const cvRow = cvf.rows[0];
    const cvFile = cvRow
      ? {
          name: cvRow.file_name || "resume",
          mime: cvRow.mime_type || "",
          ext: (cvRow.file_ext || "").toLowerCase(),
          size: Number(cvRow.size_bytes || 0),
          dataUrl: dataUrlFromRow(cvRow),
        }
      : null;
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

async function loadAppState(pool) {
  const client = await pool.connect();
  try {
    const meta = await loadMeta(client);
    const [jobs, candidates, talentPool, auditLog] = await Promise.all([
      loadJobs(client),
      loadCandidates(client),
      loadTalentPool(client),
      loadAudit(client),
    ]);
    return { jobs, candidates, talentPool, auditLog, meta };
  } finally {
    client.release();
  }
}

async function saveAppState(pool, body) {
  const jobs = body.jobs || [];
  const candidates = body.candidates || [];
  const talentPool = body.talentPool || [];
  const auditLog = body.auditLog || [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const prev = await client.query(
      "SELECT id, password_hash FROM candidate",
    );
    const passMap = new Map(
      prev.rows.map((r) => [r.id, r.password_hash]),
    );

    await client.query(`
      TRUNCATE TABLE
        audit_event,
        talent_pool_job_mapping,
        talent_pool_skill,
        talent_pool_desired_role,
        talent_pool_cv_file,
        talent_pool_entry,
        transcript_line,
        application,
        candidate_purpose,
        grievance,
        candidate_analysis,
        analysis_strength,
        analysis_improvement_area,
        cv_attachment,
        candidate,
        job
      RESTART IDENTITY CASCADE
    `);

    for (const j of jobs) {
      await client.query(
        `INSERT INTO job (id, title, designation, location, description, requirements)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          j.id,
          j.title,
          j.designation || "",
          j.location || "",
          j.description || "",
          j.requirements || "",
        ],
      );
    }

    for (const c of candidates) {
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
      for (const a of c.applicationHistory || []) {
        await client.query(
          `INSERT INTO application (candidate_id, job_id, applied_at, interview_scheduled_at, interview_completed_at)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            c.id,
            a.jobId,
            new Date(a.appliedAt),
            a.interviewScheduledAt ? new Date(a.interviewScheduledAt) : null,
            a.interviewCompletedAt ? new Date(a.interviewCompletedAt) : null,
          ],
        );
      }
      for (const g of c.grievances || []) {
        const bodyText = typeof g === "string" ? g : g.body || "";
        if (bodyText)
          await client.query(
            "INSERT INTO grievance (candidate_id, body) VALUES ($1,$2)",
            [c.id, bodyText],
          );
      }
      if (c.transcript && c.transcript.length > 0) {
        let idx = 0;
        for (const line of c.transcript) {
          const role =
            line.role === "ai" ? "ai" : "user";
          await client.query(
            `INSERT INTO transcript_line (candidate_id, line_index, role, content)
             VALUES ($1,$2,$3,$4)`,
            [c.id, idx++, role, line.text || ""],
          );
        }
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
      if (c.cvFile && c.cvFile.dataUrl) {
        await client.query(
          `INSERT INTO cv_attachment (candidate_id, file_name, mime_type, file_ext, size_bytes, file_data_base64)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            c.id,
            c.cvFile.name || "file",
            c.cvFile.mime || "",
            (c.cvFile.ext || "").replace(/^\./, ""),
            c.cvFile.size || 0,
            stripBase64Prefix(c.cvFile.dataUrl),
          ],
        );
      }
    }

    for (const t of talentPool) {
      await client.query(
        `INSERT INTO talent_pool_entry (id, linked_candidate_id, name, email, phone, experience_years, location, keywords, cv_text, submitted_at, consent_acknowledged)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          t.id,
          t.candidateId || null,
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
      if (t.cvFile && t.cvFile.dataUrl) {
        await client.query(
          `INSERT INTO talent_pool_cv_file (talent_pool_id, file_name, mime_type, file_ext, size_bytes, file_data_base64)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            t.id,
            t.cvFile.name || "file",
            t.cvFile.mime || "",
            (t.cvFile.ext || "").replace(/^\./, ""),
            t.cvFile.size || 0,
            stripBase64Prefix(t.cvFile.dataUrl),
          ],
        );
      }
      for (const m of t.mappedToJobs || []) {
        await client.query(
          `INSERT INTO talent_pool_job_mapping (talent_pool_id, job_id, mapped_at, mapped_by_hr_id)
           VALUES ($1,$2,$3,$4)`,
          [
            t.id,
            m.jobId,
            new Date(m.mappedAt),
            m.mappedBy || null,
          ],
        );
      }
    }

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

    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
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
  if (!row.password_hash) return { ok: true, hrId: row.hr_id };
  if (!password) return { ok: false };
  const match = await bcrypt.compare(password, row.password_hash);
  if (!match) return { ok: false };
  return { ok: true, hrId: row.hr_id };
}

async function updateCandidatePassword(pool, email, newPassword) {
  const hash = await bcrypt.hash(newPassword, 10);
  const r = await pool.query(
    "UPDATE candidate SET password_hash = $1, updated_at = NOW() WHERE lower(email) = lower($2) RETURNING id",
    [hash, email.trim()],
  );
  return r.rowCount > 0;
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

module.exports = {
  loadAppState,
  saveAppState,
  verifyCandidateLogin,
  verifyHrLogin,
  updateCandidatePassword,
  listJobsApi,
  getCandidateMe,
  registerCandidate,
};
