-- Fix: Add 'weak_items' to session_type CHECK constraint
-- The original constraint only included: short, weekend, topic_study, weekly_review, monthly_review
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_session_type_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_session_type_check
  CHECK (session_type IN ('short', 'weekend', 'topic_study', 'weekly_review', 'monthly_review', 'weak_items'));
