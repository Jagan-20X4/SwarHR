-- Interview reattempt workflow: incomplete technical, candidate request, HR approval (with reason).
-- Run after schema.sql / existing migrations.

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

UPDATE application
SET interview_completion_status = 'completed'
WHERE interview_completed_at IS NOT NULL
  AND interview_completion_status = 'not_started';
