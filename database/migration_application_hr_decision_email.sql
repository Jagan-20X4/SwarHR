-- Track HR shortlist/reject decision emails (one per decision status per application).
ALTER TABLE application
  ADD COLUMN IF NOT EXISTS decision_email_sent_for VARCHAR(32);
