-- Track missed-interview email after scheduled slot + grace window closes.
ALTER TABLE application
  ADD COLUMN IF NOT EXISTS missed_email_sent_for_at TIMESTAMPTZ;
