-- Track automated interview acknowledgement emails (intro + scheduled slot).
ALTER TABLE application
  ADD COLUMN IF NOT EXISTS intro_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS schedule_email_sent_for_at TIMESTAMPTZ;
