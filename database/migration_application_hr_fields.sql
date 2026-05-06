-- Per-application HR decision, remarks, and AI analysis (multi-role candidates).
ALTER TABLE application ADD COLUMN IF NOT EXISTS hr_remarks TEXT;
ALTER TABLE application ADD COLUMN IF NOT EXISTS hr_decision_status VARCHAR(32);
ALTER TABLE application ADD COLUMN IF NOT EXISTS ai_analysis_json JSONB;
