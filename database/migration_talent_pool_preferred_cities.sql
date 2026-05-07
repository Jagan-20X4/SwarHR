-- Preferred work cities for talent pool (optional, three slots).
-- Run on existing SwarHR DB; safe to re-run.

ALTER TABLE talent_pool_entry
  ADD COLUMN IF NOT EXISTS preferred_city_1 VARCHAR(255),
  ADD COLUMN IF NOT EXISTS preferred_city_2 VARCHAR(255),
  ADD COLUMN IF NOT EXISTS preferred_city_3 VARCHAR(255);
