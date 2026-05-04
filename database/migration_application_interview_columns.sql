-- Run once on existing DBs that already have `application` without these columns.
ALTER TABLE application
  ADD COLUMN IF NOT EXISTS interview_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interview_completed_at TIMESTAMPTZ;
