-- Migration 021 — Multi-curriculum support
--
-- Introduces a `curricula` table so the same app can host two specialties
-- in parallel: radiology FMH2 (existing user) and nuclear medicine FMH
-- (new user). The shared curated entities — topics, chapters, mnemonics —
-- become curriculum-scoped. Each user is bound to one curriculum via
-- `user_settings.curriculum_id`. Per-user data (entities, briefs, sessions,
-- test results, images, mnemonic_progress) stays user-scoped as before.
--
-- Idempotent.

-- ─── curricula — catalogue de cursus ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curricula (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  expert_role TEXT NOT NULL,
  exam_name TEXT NOT NULL,
  student_level TEXT NOT NULL,
  exam_date_written DATE,
  exam_date_oral_start DATE,
  exam_date_oral_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE curricula ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated reads curricula" ON curricula;
CREATE POLICY "Authenticated reads curricula"
  ON curricula FOR SELECT TO authenticated USING (true);

INSERT INTO curricula (id, display_name, expert_role, exam_name, student_level,
                       exam_date_written, exam_date_oral_start, exam_date_oral_end)
VALUES
  ('radiology-fmh2-ch',
   'Radiologie FMH2',
   'radiologue expert',
   'FMH2 de radiologie suisse',
   'résident en radiologie',
   '2026-08-26', '2026-08-27', '2026-08-28'),
  ('nuclear-medicine-fmh-ch',
   'Médecine nucléaire FMH',
   'médecin nucléaire expert',
   'FMH de médecine nucléaire suisse',
   'résident en médecine nucléaire',
   '2026-09-02', '2026-09-03', '2026-09-04')
ON CONFLICT (id) DO NOTHING;

-- ─── topics, chapters, mnemonics : curriculum-scoped ────────────────────────
ALTER TABLE topics    ADD COLUMN IF NOT EXISTS curriculum_id TEXT REFERENCES curricula(id);
ALTER TABLE chapters  ADD COLUMN IF NOT EXISTS curriculum_id TEXT REFERENCES curricula(id);
ALTER TABLE mnemonics ADD COLUMN IF NOT EXISTS curriculum_id TEXT REFERENCES curricula(id);

UPDATE topics    SET curriculum_id = 'radiology-fmh2-ch' WHERE curriculum_id IS NULL;
UPDATE chapters  SET curriculum_id = 'radiology-fmh2-ch' WHERE curriculum_id IS NULL;
UPDATE mnemonics SET curriculum_id = 'radiology-fmh2-ch' WHERE curriculum_id IS NULL;

ALTER TABLE topics    ALTER COLUMN curriculum_id SET NOT NULL;
ALTER TABLE chapters  ALTER COLUMN curriculum_id SET NOT NULL;
ALTER TABLE mnemonics ALTER COLUMN curriculum_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topics_curriculum    ON topics(curriculum_id);
CREATE INDEX IF NOT EXISTS idx_chapters_curriculum  ON chapters(curriculum_id);
CREATE INDEX IF NOT EXISTS idx_mnemonics_curriculum ON mnemonics(curriculum_id);

-- ─── user_settings : curriculum bind ────────────────────────────────────────
-- DEFAULT 'radiology-fmh2-ch' covers the existing user automatically. New
-- users get the same default until the onboarding picker overrides it.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS curriculum_id TEXT NOT NULL DEFAULT 'radiology-fmh2-ch'
  REFERENCES curricula(id);

CREATE INDEX IF NOT EXISTS idx_user_settings_curriculum
  ON user_settings(curriculum_id);
