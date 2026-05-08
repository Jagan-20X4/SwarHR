-- CV Analyser: saved job profiles (JD) per HR user + cache scoped by job context.

CREATE TABLE IF NOT EXISTS cv_analyser_job (
  id SERIAL PRIMARY KEY,
  hr_id VARCHAR(64) NOT NULL REFERENCES hr_user(hr_id),
  title TEXT NOT NULL,
  company_name TEXT NOT NULL DEFAULT 'Indira IVF',
  designation TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT 'Mumbai',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cv_analyser_job_hr ON cv_analyser_job (hr_id, updated_at DESC);

ALTER TABLE cv_analysis_cache DROP CONSTRAINT IF EXISTS cv_analysis_cache_text_hash_key;

ALTER TABLE cv_analysis_cache ADD COLUMN IF NOT EXISTS job_context_hash TEXT NOT NULL DEFAULT '';

UPDATE cv_analysis_cache SET job_context_hash = '' WHERE job_context_hash IS NULL;

DROP INDEX IF EXISTS cv_analysis_cache_text_job_unique;

CREATE UNIQUE INDEX cv_analysis_cache_text_job_unique
  ON cv_analysis_cache (text_hash, job_context_hash);
