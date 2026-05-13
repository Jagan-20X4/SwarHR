-- Link CV Analyser Job Master profiles to a careers-board job (for interview invite URLs).

ALTER TABLE cv_analyser_job
  ADD COLUMN IF NOT EXISTS recruitment_job_id VARCHAR(64) REFERENCES job(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cv_analyser_job_recruitment ON cv_analyser_job (recruitment_job_id);
