-- Mandatory opening / role / mandatory closing interview question phases
-- Run on existing DBs after schema.sql

ALTER TABLE job_interview_questions
  ADD COLUMN IF NOT EXISTS question_phase TEXT NOT NULL DEFAULT 'role';

ALTER TABLE job_interview_questions
  DROP CONSTRAINT IF EXISTS job_interview_questions_question_phase_check;

ALTER TABLE job_interview_questions
  ADD CONSTRAINT job_interview_questions_question_phase_check
  CHECK (question_phase IN ('mandatory_open', 'role', 'mandatory_close'));

-- Existing rows → role-specific (HR script)
UPDATE job_interview_questions SET question_phase = 'role' WHERE question_phase IS NULL OR question_phase = '';

-- Append default mandatory open/close once per job that has no mandatory rows yet
INSERT INTO job_interview_questions (job_id, question, question_type, question_phase, display_order)
SELECT j.id,
  v.question,
  'open_ended',
  v.phase,
  v.ord
FROM job j
CROSS JOIN (
  VALUES
    (1, 'mandatory_open', 'Hello {{candidateName}}, welcome. Please introduce yourself and confirm your full name for our records.'),
    (2, 'mandatory_open', 'Tell me about yourself — your background, experience, and what brings you to this opportunity.'),
    (3, 'mandatory_open', 'What motivated you to apply for the {{jobTitle}} role at {{companyName}}?'),
    (4, 'mandatory_open', 'What are your key strengths that make you a good fit for this position?'),
    (9001, 'mandatory_close', 'Thank you for completing this interview. We have recorded your responses and our team will review them and get back to you soon. Have a great day.')
) AS v(ord, phase, question)
WHERE NOT EXISTS (
  SELECT 1 FROM job_interview_questions q
  WHERE q.job_id = j.id AND q.question_phase IN ('mandatory_open', 'mandatory_close')
);
