-- Flag guest talent pool submissions (Join Talent Pool without prior account).
-- Run on existing SwarHR DB; safe to re-run.

ALTER TABLE talent_pool_entry
  ADD COLUMN IF NOT EXISTS submitted_as_guest BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN talent_pool_entry.submitted_as_guest IS
  'True when submitted via guest Join Talent Pool flow (photo1) after first-time registration';

-- Backfill likely guest entries: no job application, account created at submission time.
UPDATE talent_pool_entry e
SET submitted_as_guest = TRUE
FROM candidate c
WHERE e.linked_candidate_id = c.id
  AND e.submitted_as_guest = FALSE
  AND NOT EXISTS (
    SELECT 1 FROM application a WHERE a.candidate_id = c.id
  )
  AND c.created_at >= e.submitted_at - INTERVAL '15 minutes'
  AND c.created_at <= e.submitted_at + INTERVAL '15 minutes';
