-- Add reference_text column to entities for textbook content
-- And pretest_question/pretest_answer for persistence
ALTER TABLE entities ADD COLUMN IF NOT EXISTS reference_text TEXT;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS pretest_question JSONB;
