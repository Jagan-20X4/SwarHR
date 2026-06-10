-- Track 30-minute-before interview reminder emails (Maybe later scheduling).
ALTER TABLE application
  ADD COLUMN IF NOT EXISTS reminder_email_sent_for_at TIMESTAMPTZ;
