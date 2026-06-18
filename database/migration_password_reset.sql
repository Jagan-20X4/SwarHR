-- Candidate self-service password reset codes (OTP).
-- One row per reset request; the 6-digit code is stored only as a bcrypt hash.
-- Run: psql -U aideveloper -d SwarHR -h localhost -v ON_ERROR_STOP=1 -f migration_password_reset.sql

CREATE TABLE IF NOT EXISTS password_reset_code (
  id BIGSERIAL PRIMARY KEY,
  candidate_id VARCHAR(64) NOT NULL REFERENCES candidate(id) ON DELETE CASCADE,
  code_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_candidate
  ON password_reset_code (candidate_id, created_at DESC);
