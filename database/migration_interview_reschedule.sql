-- Interview reschedule workflow: candidate requests a new slot after missing one,
-- HR reviews/accepts (and sets a new time) or rejects. Double-ended: HR can also
-- initiate a reschedule directly. Run after migration_interview_reattempt.sql.

ALTER TABLE application ADD COLUMN IF NOT EXISTS reschedule_request_status VARCHAR(32) NOT NULL DEFAULT 'none';
ALTER TABLE application ADD COLUMN IF NOT EXISTS reschedule_candidate_reason_code VARCHAR(64);
ALTER TABLE application ADD COLUMN IF NOT EXISTS reschedule_candidate_reason_text TEXT;
ALTER TABLE application ADD COLUMN IF NOT EXISTS reschedule_hr_notes TEXT;
ALTER TABLE application ADD COLUMN IF NOT EXISTS reschedule_requested_at TIMESTAMPTZ;
ALTER TABLE application ADD COLUMN IF NOT EXISTS reschedule_resolved_at TIMESTAMPTZ;
ALTER TABLE application ADD COLUMN IF NOT EXISTS reschedule_resolved_by_hr_id VARCHAR(64);

-- Idempotency stamps so reschedule notification emails are not sent twice.
ALTER TABLE application ADD COLUMN IF NOT EXISTS reschedule_approved_email_sent_for TIMESTAMPTZ;
ALTER TABLE application ADD COLUMN IF NOT EXISTS reschedule_rejected_email_sent_for TIMESTAMPTZ;
ALTER TABLE application ADD COLUMN IF NOT EXISTS reschedule_by_hr_email_sent_for TIMESTAMPTZ;

COMMENT ON COLUMN application.reschedule_request_status IS 'none | pending | approved | rejected';
