-- Talent pool + audit list performance (Phase 0)
-- Run: psql -U postgres -d swarhr -f database/migration_talent_pool_indexes.sql

CREATE INDEX IF NOT EXISTS idx_talent_pool_submitted_id
  ON talent_pool_entry (submitted_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_talent_pool_email_lower
  ON talent_pool_entry (lower(email));

CREATE INDEX IF NOT EXISTS idx_talent_pool_source
  ON talent_pool_entry (source);

CREATE INDEX IF NOT EXISTS idx_talent_pool_desired_role_pool
  ON talent_pool_desired_role (talent_pool_id);

CREATE INDEX IF NOT EXISTS idx_talent_pool_skill_pool
  ON talent_pool_skill (talent_pool_id);

CREATE INDEX IF NOT EXISTS idx_audit_occurred_at
  ON audit_event (occurred_at DESC);
