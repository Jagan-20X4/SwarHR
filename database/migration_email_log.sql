-- Email delivery log: one row per send attempt (sent / failed / skipped).
-- Lets HR answer "did candidate X receive their email?" with a single query.
-- Run: psql -U aideveloper -d SwarHR -h localhost -v ON_ERROR_STOP=1 -f migration_email_log.sql

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
COMMENT ON COLUMN email_log.context IS 'interview_intro | interview_scheduled | interview_reminder | interview_completed | interview_missed | hr_decision | reattempt_approved | reattempt_rejected | talent_pool_ack | cv_analyser_invite';

CREATE INDEX IF NOT EXISTS idx_email_log_to ON email_log (lower(sent_to), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_created ON email_log (created_at DESC);
