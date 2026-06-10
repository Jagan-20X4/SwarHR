-- Track reattempt approval/rejection emails (one send per reattempt_resolved_at).
ALTER TABLE application
  ADD COLUMN IF NOT EXISTS reattempt_approved_email_sent_for TIMESTAMPTZ;

ALTER TABLE application
  ADD COLUMN IF NOT EXISTS reattempt_rejected_email_sent_for TIMESTAMPTZ;
