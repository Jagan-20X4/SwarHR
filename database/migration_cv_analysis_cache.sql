-- CV Analyser: cache by text hash (30-day reuse in application code).
-- Original CV bytes stored in PostgreSQL (BYTEA), not disk/S3.

CREATE TABLE cv_analysis_cache (
  id SERIAL PRIMARY KEY,
  file_id TEXT NOT NULL UNIQUE,
  text_hash TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_bytes BYTEA NOT NULL,
  analysis_json JSONB NOT NULL,
  analysed_by_hr_id VARCHAR(64) NOT NULL REFERENCES hr_user(hr_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cv_cache_actor ON cv_analysis_cache (analysed_by_hr_id, created_at DESC);
