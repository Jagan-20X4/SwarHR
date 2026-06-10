-- Track when and by whom HR shortlisted/rejected after interview (candidate export report).
-- Run on existing SwarHR DB; safe to re-run.

ALTER TABLE application
  ADD COLUMN IF NOT EXISTS hr_decision_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hr_decided_by_hr_id VARCHAR(64) REFERENCES hr_user(hr_id);

COMMENT ON COLUMN application.hr_decision_at IS 'Timestamp when HR set hr_decision_status to SHORTLISTED or REJECTED';
COMMENT ON COLUMN application.hr_decided_by_hr_id IS 'HR user who made the shortlist/reject decision';
