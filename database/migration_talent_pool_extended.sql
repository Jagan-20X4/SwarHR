-- Extended talent pool fields (qualification, CTC, employer, source, dates).
-- Run on existing SwarHR DB; safe to re-run.

ALTER TABLE talent_pool_entry
  ADD COLUMN IF NOT EXISTS qualification VARCHAR(500),
  ADD COLUMN IF NOT EXISTS current_ctc VARCHAR(64),
  ADD COLUMN IF NOT EXISTS current_employer VARCHAR(255),
  ADD COLUMN IF NOT EXISTS source VARCHAR(128),
  ADD COLUMN IF NOT EXISTS application_date DATE,
  ADD COLUMN IF NOT EXISTS cooling_period VARCHAR(255);
