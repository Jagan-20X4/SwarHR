-- Interview attempts: group voice-bot answers per interview session (reattempt-safe).
-- Run on existing DBs after migration_job_interview_questions.sql.

CREATE TABLE IF NOT EXISTS interview_attempts (
  id              BIGSERIAL PRIMARY KEY,
  application_id  BIGINT NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  attempt_number  INT NOT NULL DEFAULT 1,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  status          VARCHAR(32) NOT NULL DEFAULT 'in_progress'
);

-- Align existing DBs that created the table without attempt_number
ALTER TABLE interview_attempts
  ADD COLUMN IF NOT EXISTS attempt_number INT NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_interview_attempts_app
  ON interview_attempts (application_id, started_at DESC);

ALTER TABLE interview_answers
  ADD COLUMN IF NOT EXISTS attempt_id BIGINT REFERENCES interview_attempts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ia_attempt
  ON interview_answers (attempt_id, asked_at);
