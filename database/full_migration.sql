-- ============================================================================
-- SwarHR — FULL CONSOLIDATED MIGRATION (PRODUCTION)
-- Run ONCE on a fresh empty database:
--   createdb -U postgres SwarHR    (or CREATE DATABASE "SwarHR";)
--   psql -U aideveloper -d SwarHR -h localhost -v ON_ERROR_STOP=1 -f full_migration.sql
-- Reproduces the current UAT schema (schema.sql + all incremental migrations),
-- with demo candidate/job seed data removed (reference config + HR logins only).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 1: BASE SCHEMA (schema.sql)
-- ─────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE organization_setting (
  singleton SMALLINT PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
  cooling_period_months SMALLINT NOT NULL DEFAULT 3,
  company_name VARCHAR(255) NOT NULL DEFAULT 'Indira IVF',
  max_cv_upload_mb SMALLINT NOT NULL DEFAULT 5
);

CREATE TABLE dpo_contact (
  singleton SMALLINT PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
  full_name VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(64)
);

CREATE TABLE data_processing_category (
  code VARCHAR(64) PRIMARY KEY,
  label VARCHAR(255) NOT NULL,
  items_summary TEXT,
  purpose TEXT,
  retention_note TEXT
);

CREATE TABLE hr_user (
  hr_id VARCHAR(64) PRIMARY KEY,
  password_hash VARCHAR(255),
  display_name VARCHAR(255)
);

CREATE TABLE job (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  designation VARCHAR(500),
  location VARCHAR(255),
  description TEXT,
  requirements TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE candidate (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL,
  job_id VARCHAR(64) REFERENCES job(id) ON DELETE SET NULL,
  cv_text TEXT,
  remarks TEXT,
  interview_language VARCHAR(64),
  consent BOOLEAN NOT NULL DEFAULT FALSE,
  consent_at TIMESTAMPTZ,
  from_talent_pool BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_candidate_email UNIQUE (email)
);

CREATE TABLE candidate_purpose (
  candidate_id VARCHAR(64) NOT NULL REFERENCES candidate(id) ON DELETE CASCADE,
  purpose_code VARCHAR(64) NOT NULL,
  PRIMARY KEY (candidate_id, purpose_code)
);

CREATE TABLE application (
  id BIGSERIAL PRIMARY KEY,
  candidate_id VARCHAR(64) NOT NULL REFERENCES candidate(id) ON DELETE CASCADE,
  job_id VARCHAR(64) REFERENCES job(id) ON DELETE SET NULL,
  applied_at TIMESTAMPTZ NOT NULL,
  interview_scheduled_at TIMESTAMPTZ,
  interview_completed_at TIMESTAMPTZ,
  interview_completion_status VARCHAR(32) NOT NULL DEFAULT 'not_started',
  reattempt_request_status VARCHAR(32) NOT NULL DEFAULT 'none',
  reattempt_candidate_reason_code VARCHAR(64),
  reattempt_candidate_reason_text TEXT,
  reattempt_hr_reason_code VARCHAR(64),
  reattempt_hr_notes TEXT,
  reattempt_requested_at TIMESTAMPTZ,
  reattempt_resolved_at TIMESTAMPTZ,
  reattempt_resolved_by_hr_id VARCHAR(64),
  hr_remarks TEXT,
  hr_decision_status VARCHAR(32),
  ai_analysis_json JSONB
);

CREATE TABLE grievance (
  id BIGSERIAL PRIMARY KEY,
  candidate_id VARCHAR(64) NOT NULL REFERENCES candidate(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE transcript_line (
  id BIGSERIAL PRIMARY KEY,
  candidate_id VARCHAR(64) NOT NULL REFERENCES candidate(id) ON DELETE CASCADE,
  application_id BIGINT REFERENCES application(id) ON DELETE CASCADE,
  line_index INT NOT NULL,
  role VARCHAR(16) NOT NULL,
  content TEXT NOT NULL
);

CREATE UNIQUE INDEX uq_transcript_app_line ON transcript_line (application_id, line_index) WHERE application_id IS NOT NULL;
CREATE UNIQUE INDEX uq_transcript_cand_line_legacy ON transcript_line (candidate_id, line_index) WHERE application_id IS NULL;

CREATE TABLE candidate_analysis (
  candidate_id VARCHAR(64) PRIMARY KEY REFERENCES candidate(id) ON DELETE CASCADE,
  summary TEXT,
  tech_score SMALLINT,
  comm_score SMALLINT,
  recommendation_label VARCHAR(64)
);

CREATE TABLE analysis_strength (
  id BIGSERIAL PRIMARY KEY,
  candidate_id VARCHAR(64) NOT NULL REFERENCES candidate(id) ON DELETE CASCADE,
  sort_order INT NOT NULL,
  phrase VARCHAR(500) NOT NULL
);

CREATE TABLE analysis_improvement_area (
  id BIGSERIAL PRIMARY KEY,
  candidate_id VARCHAR(64) NOT NULL REFERENCES candidate(id) ON DELETE CASCADE,
  sort_order INT NOT NULL,
  phrase VARCHAR(500) NOT NULL
);

CREATE TABLE cv_attachment (
  id BIGSERIAL PRIMARY KEY,
  candidate_id VARCHAR(64) NOT NULL REFERENCES candidate(id) ON DELETE CASCADE,
  file_name VARCHAR(512),
  mime_type VARCHAR(255),
  file_ext VARCHAR(32),
  size_bytes BIGINT,
  file_data_base64 TEXT,
  s3_key VARCHAR(512),
  CONSTRAINT uq_cv_candidate UNIQUE (candidate_id)
);

CREATE TABLE talent_pool_entry (
  id VARCHAR(64) PRIMARY KEY,
  linked_candidate_id VARCHAR(64) REFERENCES candidate(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(64),
  experience_years SMALLINT NOT NULL DEFAULT 0,
  location VARCHAR(255),
  keywords TEXT,
  cv_text TEXT,
  submitted_at TIMESTAMPTZ NOT NULL,
  consent_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  qualification VARCHAR(500),
  current_ctc VARCHAR(64),
  current_employer VARCHAR(255),
  source VARCHAR(128),
  application_date DATE,
  cooling_period VARCHAR(255),
  preferred_city_1 VARCHAR(255),
  preferred_city_2 VARCHAR(255),
  preferred_city_3 VARCHAR(255)
);

CREATE TABLE talent_pool_desired_role (
  talent_pool_id VARCHAR(64) NOT NULL REFERENCES talent_pool_entry(id) ON DELETE CASCADE,
  role_name VARCHAR(255) NOT NULL,
  PRIMARY KEY (talent_pool_id, role_name)
);

CREATE TABLE talent_pool_skill (
  talent_pool_id VARCHAR(64) NOT NULL REFERENCES talent_pool_entry(id) ON DELETE CASCADE,
  skill_name VARCHAR(255) NOT NULL,
  PRIMARY KEY (talent_pool_id, skill_name)
);

CREATE TABLE talent_pool_cv_file (
  talent_pool_id VARCHAR(64) PRIMARY KEY REFERENCES talent_pool_entry(id) ON DELETE CASCADE,
  file_name VARCHAR(512),
  mime_type VARCHAR(255),
  file_ext VARCHAR(32),
  size_bytes BIGINT,
  file_data_base64 TEXT,
  s3_key VARCHAR(512)
);

CREATE TABLE talent_pool_job_mapping (
  id BIGSERIAL PRIMARY KEY,
  talent_pool_id VARCHAR(64) NOT NULL REFERENCES talent_pool_entry(id) ON DELETE CASCADE,
  job_id VARCHAR(64) REFERENCES job(id) ON DELETE CASCADE,
  mapped_at TIMESTAMPTZ NOT NULL,
  mapped_by_hr_id VARCHAR(64)
);

CREATE TABLE audit_event (
  id VARCHAR(64) PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL,
  actor VARCHAR(255) NOT NULL,
  action VARCHAR(128) NOT NULL,
  target_ref VARCHAR(255),
  details TEXT
);

CREATE INDEX idx_candidate_email_lower ON candidate ((lower(email)));
CREATE INDEX idx_audit_occurred ON audit_event (occurred_at DESC);

-- ─── Seed data (PRODUCTION) — reference/config + HR logins only ───
-- NOTE: demo jobs (j1/j2/j3) and demo candidate (C1) intentionally omitted.
INSERT INTO organization_setting (singleton, cooling_period_months, company_name, max_cv_upload_mb)
VALUES (1, 3, 'Indira IVF', 5);

INSERT INTO dpo_contact (singleton, full_name, title, email, phone)
VALUES (1, 'Ms. Priya Sharma', 'Data Protection Officer', 'dpo@indirivf.example.com', '+91-11-4567-8900');

INSERT INTO data_processing_category (code, label, items_summary, purpose, retention_note) VALUES
  ('identity', 'Identity Data', 'Name, email, password (encrypted)', 'Account creation', 'Recruitment + 1 year'),
  ('cv', 'CV / Resume Data', 'Work history, skills, education', 'Candidate screening', 'Recruitment + 1 year'),
  ('interview', 'Interview Transcript', 'Voice transcribed, AI analysis', 'Candidate evaluation', 'Recruitment + 1 year'),
  ('ai', 'AI Processing', 'CV & transcript via Claude API', 'AI screening', 'Not retained by Anthropic');

-- HR logins. IMPORTANT: change these default passwords immediately in production.
INSERT INTO hr_user (hr_id, password_hash, display_name) VALUES
  ('HR-TM-001', crypt('hrpassword123', gen_salt('bf')), 'Talent Manager'),
  ('ADMIN', crypt('adminpass123', gen_salt('bf')), 'Administrator');

-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 2: APPLICATION COLUMN MIGRATIONS (idempotent; no-ops if already present)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE application
  ADD COLUMN IF NOT EXISTS interview_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interview_completed_at TIMESTAMPTZ;

ALTER TABLE application ADD COLUMN IF NOT EXISTS interview_completion_status VARCHAR(32) NOT NULL DEFAULT 'not_started';
ALTER TABLE application ADD COLUMN IF NOT EXISTS reattempt_request_status VARCHAR(32) NOT NULL DEFAULT 'none';
ALTER TABLE application ADD COLUMN IF NOT EXISTS reattempt_candidate_reason_code VARCHAR(64);
ALTER TABLE application ADD COLUMN IF NOT EXISTS reattempt_candidate_reason_text TEXT;
ALTER TABLE application ADD COLUMN IF NOT EXISTS reattempt_hr_reason_code VARCHAR(64);
ALTER TABLE application ADD COLUMN IF NOT EXISTS reattempt_hr_notes TEXT;
ALTER TABLE application ADD COLUMN IF NOT EXISTS reattempt_requested_at TIMESTAMPTZ;
ALTER TABLE application ADD COLUMN IF NOT EXISTS reattempt_resolved_at TIMESTAMPTZ;
ALTER TABLE application ADD COLUMN IF NOT EXISTS reattempt_resolved_by_hr_id VARCHAR(64);
COMMENT ON COLUMN application.interview_completion_status IS 'not_started | in_progress | completed | incomplete_technical';
COMMENT ON COLUMN application.reattempt_request_status IS 'none | pending | approved | rejected';
UPDATE application SET interview_completion_status = 'completed'
WHERE interview_completed_at IS NOT NULL AND interview_completion_status = 'not_started';

ALTER TABLE application ADD COLUMN IF NOT EXISTS hr_remarks TEXT;
ALTER TABLE application ADD COLUMN IF NOT EXISTS hr_decision_status VARCHAR(32);
ALTER TABLE application ADD COLUMN IF NOT EXISTS ai_analysis_json JSONB;

ALTER TABLE application
  ADD COLUMN IF NOT EXISTS hr_decision_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hr_decided_by_hr_id VARCHAR(64) REFERENCES hr_user(hr_id);
COMMENT ON COLUMN application.hr_decision_at IS 'Timestamp when HR set hr_decision_status to SHORTLISTED or REJECTED';
COMMENT ON COLUMN application.hr_decided_by_hr_id IS 'HR user who made the shortlist/reject decision';

-- Email-tracking columns
ALTER TABLE application
  ADD COLUMN IF NOT EXISTS intro_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS schedule_email_sent_for_at TIMESTAMPTZ;
ALTER TABLE application ADD COLUMN IF NOT EXISTS reminder_email_sent_for_at TIMESTAMPTZ;
ALTER TABLE application ADD COLUMN IF NOT EXISTS reattempt_approved_email_sent_for TIMESTAMPTZ;
ALTER TABLE application ADD COLUMN IF NOT EXISTS reattempt_rejected_email_sent_for TIMESTAMPTZ;
ALTER TABLE application ADD COLUMN IF NOT EXISTS completion_email_sent_at TIMESTAMPTZ;
ALTER TABLE application ADD COLUMN IF NOT EXISTS missed_email_sent_for_at TIMESTAMPTZ;
ALTER TABLE application ADD COLUMN IF NOT EXISTS decision_email_sent_for VARCHAR(32);

-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 3: TALENT POOL MIGRATIONS
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE talent_pool_entry
  ADD COLUMN IF NOT EXISTS qualification VARCHAR(500),
  ADD COLUMN IF NOT EXISTS current_ctc VARCHAR(64),
  ADD COLUMN IF NOT EXISTS current_employer VARCHAR(255),
  ADD COLUMN IF NOT EXISTS source VARCHAR(128),
  ADD COLUMN IF NOT EXISTS application_date DATE,
  ADD COLUMN IF NOT EXISTS cooling_period VARCHAR(255);

ALTER TABLE talent_pool_entry
  ADD COLUMN IF NOT EXISTS preferred_city_1 VARCHAR(255),
  ADD COLUMN IF NOT EXISTS preferred_city_2 VARCHAR(255),
  ADD COLUMN IF NOT EXISTS preferred_city_3 VARCHAR(255);

ALTER TABLE talent_pool_entry
  ADD COLUMN IF NOT EXISTS submitted_as_guest BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN talent_pool_entry.submitted_as_guest IS
  'True when submitted via guest Join Talent Pool flow (photo1) after first-time registration';
UPDATE talent_pool_entry e
SET submitted_as_guest = TRUE
FROM candidate c
WHERE e.linked_candidate_id = c.id
  AND e.submitted_as_guest = FALSE
  AND NOT EXISTS (SELECT 1 FROM application a WHERE a.candidate_id = c.id)
  AND c.created_at >= e.submitted_at - INTERVAL '15 minutes'
  AND c.created_at <= e.submitted_at + INTERVAL '15 minutes';

CREATE INDEX IF NOT EXISTS idx_talent_pool_submitted_id ON talent_pool_entry (submitted_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_talent_pool_email_lower ON talent_pool_entry (lower(email));
CREATE INDEX IF NOT EXISTS idx_talent_pool_source ON talent_pool_entry (source);
CREATE INDEX IF NOT EXISTS idx_talent_pool_desired_role_pool ON talent_pool_desired_role (talent_pool_id);
CREATE INDEX IF NOT EXISTS idx_talent_pool_skill_pool ON talent_pool_skill (talent_pool_id);
CREATE INDEX IF NOT EXISTS idx_audit_occurred_at ON audit_event (occurred_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 4: TRANSCRIPT + S3 ATTACHMENTS
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE transcript_line ADD COLUMN IF NOT EXISTS application_id BIGINT REFERENCES application(id) ON DELETE CASCADE;
ALTER TABLE transcript_line DROP CONSTRAINT IF EXISTS uq_transcript_candidate_line;
DROP INDEX IF EXISTS uq_transcript_app_line;
CREATE UNIQUE INDEX uq_transcript_app_line ON transcript_line (application_id, line_index) WHERE application_id IS NOT NULL;
DROP INDEX IF EXISTS uq_transcript_cand_line_legacy;
CREATE UNIQUE INDEX uq_transcript_cand_line_legacy ON transcript_line (candidate_id, line_index) WHERE application_id IS NULL;

ALTER TABLE cv_attachment ADD COLUMN IF NOT EXISTS s3_key VARCHAR(512);
ALTER TABLE talent_pool_cv_file ADD COLUMN IF NOT EXISTS s3_key VARCHAR(512);
CREATE INDEX IF NOT EXISTS idx_cv_attachment_s3_key ON cv_attachment (s3_key) WHERE s3_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_talent_pool_cv_s3_key ON talent_pool_cv_file (s3_key) WHERE s3_key IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 5: INTERVIEW QUESTIONS / ANSWERS / ATTEMPTS  (order-sensitive)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_interview_questions (
  id              SERIAL PRIMARY KEY,
  job_id          VARCHAR(64) NOT NULL REFERENCES job(id) ON DELETE CASCADE,
  question        TEXT NOT NULL CHECK (length(question) BETWEEN 10 AND 500),
  question_type   TEXT NOT NULL DEFAULT 'open_ended'
                  CHECK (question_type IN ('open_ended', 'yes_no', 'scale_1_5')),
  display_order   INT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, display_order)
);
CREATE INDEX IF NOT EXISTS idx_jiq_job ON job_interview_questions (job_id, display_order);

CREATE TABLE IF NOT EXISTS interview_answers (
  id                BIGSERIAL PRIMARY KEY,
  application_id    BIGINT NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  question_id       INT REFERENCES job_interview_questions(id) ON DELETE SET NULL,
  question_text     TEXT NOT NULL,
  answer_text       TEXT,
  audio_url         TEXT,
  duration_seconds  INT,
  asked_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at       TIMESTAMPTZ,
  UNIQUE (application_id, question_text)
);
CREATE INDEX IF NOT EXISTS idx_ia_application ON interview_answers (application_id, asked_at);

ALTER TABLE application ADD COLUMN IF NOT EXISTS recruitment_stage VARCHAR(32) NOT NULL DEFAULT 'applied';

CREATE TABLE IF NOT EXISTS application_stage_history (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  from_stage VARCHAR(32),
  to_stage VARCHAR(32) NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_ash_app ON application_stage_history (application_id, changed_at DESC);

-- question_phase (alters job_interview_questions created above)
ALTER TABLE job_interview_questions ADD COLUMN IF NOT EXISTS question_phase TEXT NOT NULL DEFAULT 'role';
ALTER TABLE job_interview_questions DROP CONSTRAINT IF EXISTS job_interview_questions_question_phase_check;
ALTER TABLE job_interview_questions
  ADD CONSTRAINT job_interview_questions_question_phase_check
  CHECK (question_phase IN ('mandatory_open', 'role', 'mandatory_close'));
UPDATE job_interview_questions SET question_phase = 'role' WHERE question_phase IS NULL OR question_phase = '';
INSERT INTO job_interview_questions (job_id, question, question_type, question_phase, display_order)
SELECT j.id, v.question, 'open_ended', v.phase, v.ord
FROM job j
CROSS JOIN (
  VALUES
    (1, 'mandatory_open', 'Hello {{candidateName}}, welcome. Please introduce yourself and confirm your full name for our records.'),
    (2, 'mandatory_open', 'Tell me about yourself — your background, experience, and what brings you to this opportunity.'),
    (3, 'mandatory_open', 'What motivated you to apply for the {{jobTitle}} role at {{companyName}}?'),
    (4, 'mandatory_open', 'What are your key strengths that make you a good fit for this position?'),
    (9001, 'mandatory_close', 'Thank you for completing this interview. We have recorded your responses and our team will review them and get back to you soon. Have a great day.')
) AS v(ord, phase, question)
WHERE NOT EXISTS (
  SELECT 1 FROM job_interview_questions q
  WHERE q.job_id = j.id AND q.question_phase IN ('mandatory_open', 'mandatory_close')
);

-- interview_attempts (references interview_answers created above)
CREATE TABLE IF NOT EXISTS interview_attempts (
  id              BIGSERIAL PRIMARY KEY,
  application_id  BIGINT NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  attempt_number  INT NOT NULL DEFAULT 1,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  status          VARCHAR(32) NOT NULL DEFAULT 'in_progress'
);
ALTER TABLE interview_attempts ADD COLUMN IF NOT EXISTS attempt_number INT NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_interview_attempts_app ON interview_attempts (application_id, started_at DESC);
ALTER TABLE interview_answers ADD COLUMN IF NOT EXISTS attempt_id BIGINT REFERENCES interview_attempts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_ia_attempt ON interview_answers (attempt_id, asked_at);

-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 6: CV ANALYSER  (cv_analysis_cache BEFORE cv_analyser_job)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cv_analysis_cache (
  id SERIAL PRIMARY KEY,
  file_id TEXT NOT NULL UNIQUE,
  text_hash TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_bytes BYTEA NOT NULL,
  analysis_json JSONB NOT NULL,
  analysed_by_hr_id VARCHAR(64) NOT NULL REFERENCES hr_user(hr_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cv_cache_actor ON cv_analysis_cache (analysed_by_hr_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cv_analyser_job (
  id SERIAL PRIMARY KEY,
  hr_id VARCHAR(64) NOT NULL REFERENCES hr_user(hr_id),
  title TEXT NOT NULL,
  company_name TEXT NOT NULL DEFAULT 'Indira IVF',
  designation TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT 'Mumbai',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cv_analyser_job_hr ON cv_analyser_job (hr_id, updated_at DESC);

ALTER TABLE cv_analysis_cache DROP CONSTRAINT IF EXISTS cv_analysis_cache_text_hash_key;
ALTER TABLE cv_analysis_cache ADD COLUMN IF NOT EXISTS job_context_hash TEXT NOT NULL DEFAULT '';
UPDATE cv_analysis_cache SET job_context_hash = '' WHERE job_context_hash IS NULL;
DROP INDEX IF EXISTS cv_analysis_cache_text_job_unique;
CREATE UNIQUE INDEX cv_analysis_cache_text_job_unique ON cv_analysis_cache (text_hash, job_context_hash);

ALTER TABLE cv_analyser_job ADD COLUMN IF NOT EXISTS recruitment_job_id VARCHAR(64) REFERENCES job(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cv_analyser_job_recruitment ON cv_analyser_job (recruitment_job_id);

-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 7: PERFORMANCE INDEXES
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_application_candidate_id ON application (candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_status ON candidate (status);
CREATE INDEX IF NOT EXISTS idx_candidate_created_id ON candidate (created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_transcript_line_candidate_id ON transcript_line (candidate_id);

-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 8: EMAIL DELIVERY LOG
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_log (
  id BIGSERIAL PRIMARY KEY,
  sent_to VARCHAR(255) NOT NULL,
  subject VARCHAR(500),
  status VARCHAR(16) NOT NULL,
  error TEXT,
  context VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON COLUMN email_log.status IS 'sent | failed | skipped';
CREATE INDEX IF NOT EXISTS idx_email_log_to ON email_log (lower(sent_to), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_created ON email_log (created_at DESC);

-- ============================================================================
-- END OF FULL MIGRATION
-- ============================================================================
