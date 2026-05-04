-- SwarHR PostgreSQL schema (relational — no JSONB)
-- Run: psql -U postgres -d swarhr -f schema.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Reference / singleton config ─────────────────────────────────
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

-- ── Jobs ────────────────────────────────────────────────────────
CREATE TABLE job (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  designation VARCHAR(500),
  location VARCHAR(255),
  description TEXT,
  requirements TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Candidates ─────────────────────────────────────────────────
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
  interview_completed_at TIMESTAMPTZ
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
  line_index INT NOT NULL,
  role VARCHAR(16) NOT NULL,
  content TEXT NOT NULL,
  CONSTRAINT uq_transcript_candidate_line UNIQUE (candidate_id, line_index)
);

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
  CONSTRAINT uq_cv_candidate UNIQUE (candidate_id)
);

-- ── Talent pool ─────────────────────────────────────────────────
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
  consent_acknowledged BOOLEAN NOT NULL DEFAULT FALSE
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
  file_data_base64 TEXT
);

CREATE TABLE talent_pool_job_mapping (
  id BIGSERIAL PRIMARY KEY,
  talent_pool_id VARCHAR(64) NOT NULL REFERENCES talent_pool_entry(id) ON DELETE CASCADE,
  job_id VARCHAR(64) REFERENCES job(id) ON DELETE CASCADE,
  mapped_at TIMESTAMPTZ NOT NULL,
  mapped_by_hr_id VARCHAR(64)
);

-- ── Audit ─────────────────────────────────────────────────────
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

-- ═══ Seed data ═══════════════════════════════════════════════════

INSERT INTO organization_setting (singleton, cooling_period_months, company_name, max_cv_upload_mb)
VALUES (1, 3, 'Indira IVF', 5);

INSERT INTO dpo_contact (singleton, full_name, title, email, phone)
VALUES (1, 'Ms. Priya Sharma', 'Data Protection Officer', 'dpo@indirivf.example.com', '+91-11-4567-8900');

INSERT INTO data_processing_category (code, label, items_summary, purpose, retention_note) VALUES
  ('identity', 'Identity Data', 'Name, email, password (encrypted)', 'Account creation', 'Recruitment + 1 year'),
  ('cv', 'CV / Resume Data', 'Work history, skills, education', 'Candidate screening', 'Recruitment + 1 year'),
  ('interview', 'Interview Transcript', 'Voice transcribed, AI analysis', 'Candidate evaluation', 'Recruitment + 1 year'),
  ('ai', 'AI Processing', 'CV & transcript via Claude API', 'AI screening', 'Not retained by Anthropic');

-- HR: password = hrpassword123
INSERT INTO hr_user (hr_id, password_hash, display_name) VALUES
  ('HR-TM-001', crypt('hrpassword123', gen_salt('bf')), 'Talent Manager'),
  ('ADMIN', crypt('adminpass123', gen_salt('bf')), 'Administrator');

INSERT INTO job (id, title, designation, location, description, requirements) VALUES
  ('j1', 'Senior Embryologist', 'Senior Embryologist', 'Mumbai', 'Performing advanced IVF, ICSI, embryo culture, and cryopreservation. 5+ years lab experience.', 'M.Sc. Life Sciences, 5+ years embryology, ICSI proficiency.'),
  ('j2', 'Fertility Consultant', 'Consultant – Reproductive Medicine', 'Delhi', 'Patient consultations, treatment planning, ovarian stimulation protocols.', 'MD/DNB OBG, fellowship in Reproductive Medicine, 3+ years.'),
  ('j3', 'Patient Coordinator', 'Patient Coordinator', 'Bangalore', 'Primary point of contact for IVF patients; scheduling and support.', 'Any graduate, excellent communication, 1-2 years coordination.');

-- Demo candidate: john@example.com / password123
INSERT INTO candidate (id, name, email, password_hash, status, job_id, cv_text, remarks, consent, consent_at, from_talent_pool)
VALUES (
  'C1',
  'John Doe',
  'john@example.com',
  crypt('password123', gen_salt('bf')),
  'SHORTLISTED',
  'j1',
  '10 years React/Node.js, B.Tech IIT Bombay, TCS & Infosys.',
  'Strong technical profile.',
  TRUE,
  NOW() - INTERVAL '7 days',
  FALSE
);

INSERT INTO candidate_purpose (candidate_id, purpose_code)
SELECT 'C1', UNNEST(ARRAY['identity','cv','interview','ai']::varchar[]);

INSERT INTO application (candidate_id, job_id, applied_at, interview_scheduled_at, interview_completed_at)
VALUES ('C1', 'j1', NOW() - INTERVAL '7 days', NULL, NULL);
