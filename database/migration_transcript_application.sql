-- Link interview chat lines to a specific application (per-role transcripts).
-- Legacy rows keep application_id NULL until re-saved.

ALTER TABLE transcript_line ADD COLUMN IF NOT EXISTS application_id BIGINT REFERENCES application(id) ON DELETE CASCADE;

ALTER TABLE transcript_line DROP CONSTRAINT IF EXISTS uq_transcript_candidate_line;

DROP INDEX IF EXISTS uq_transcript_app_line;
CREATE UNIQUE INDEX uq_transcript_app_line ON transcript_line (application_id, line_index) WHERE application_id IS NOT NULL;

DROP INDEX IF EXISTS uq_transcript_cand_line_legacy;
CREATE UNIQUE INDEX uq_transcript_cand_line_legacy ON transcript_line (candidate_id, line_index) WHERE application_id IS NULL;
