-- Track post-interview completion thank-you email (one per application).
ALTER TABLE application
  ADD COLUMN IF NOT EXISTS completion_email_sent_at TIMESTAMPTZ;
