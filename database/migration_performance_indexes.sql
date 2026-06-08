-- Performance indexes for HR candidate list and related lookups
-- Run: psql -U postgres -d swarhr -f database/migration_performance_indexes.sql

CREATE INDEX IF NOT EXISTS idx_application_candidate_id
  ON application (candidate_id);

CREATE INDEX IF NOT EXISTS idx_candidate_status
  ON candidate (status);

CREATE INDEX IF NOT EXISTS idx_candidate_created_id
  ON candidate (created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_transcript_line_candidate_id
  ON transcript_line (candidate_id);
