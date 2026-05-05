-- Job-specific interview questions + per-application answers (voice bot + ATS)
-- Run after schema.sql on existing DBs.

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

ALTER TABLE application
  ADD COLUMN IF NOT EXISTS recruitment_stage VARCHAR(32) NOT NULL DEFAULT 'applied';

CREATE TABLE IF NOT EXISTS application_stage_history (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  from_stage VARCHAR(32),
  to_stage VARCHAR(32) NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_ash_app ON application_stage_history (application_id, changed_at DESC);
