-- Store CV/resume files in S3; DB keeps metadata + s3_key only.
-- Run: psql -U postgres -d swarhr -f database/migration_s3_attachments.sql

ALTER TABLE cv_attachment
  ADD COLUMN IF NOT EXISTS s3_key VARCHAR(512);

ALTER TABLE talent_pool_cv_file
  ADD COLUMN IF NOT EXISTS s3_key VARCHAR(512);

CREATE INDEX IF NOT EXISTS idx_cv_attachment_s3_key ON cv_attachment (s3_key) WHERE s3_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_talent_pool_cv_s3_key ON talent_pool_cv_file (s3_key) WHERE s3_key IS NOT NULL;
