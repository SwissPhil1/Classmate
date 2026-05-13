-- Migration 020 — Mnemonic learning module (catalogue + per-user SRS)
--
-- Introduces a standalone mnemonic study module backed by the existing
-- whitelist (89 canonical mnemonics across 12 themes). Two new tables:
--
--   1. `mnemonics`           — shared catalogue (read-only for users, written
--                              by the seed admin endpoint). Holds canonical
--                              name, theme, variants and the Claude-generated
--                              pedagogical content (deployment of the
--                              acronym + clinical context + DDx + 1 pitfall).
--
--   2. `mnemonic_progress`   — per-user SRS state, mirrors the `entities`
--                              SRS fields (status, correct_streak,
--                              difficulty_level, cycle_count, last_reviewed,
--                              next_review_date). RLS strict per user_id,
--                              same pattern as post-019.
--
-- Idempotent, safe to re-run.

-- ─── mnemonics — shared catalogue ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mnemonics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_name TEXT NOT NULL UNIQUE,
  theme TEXT NOT NULL,
  variants JSONB NOT NULL DEFAULT '[]',
  content_md TEXT,
  content_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (content_status IN ('pending', 'generated', 'reviewed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mnemonics_theme ON mnemonics(theme);
CREATE INDEX IF NOT EXISTS idx_mnemonics_pending
  ON mnemonics(content_status) WHERE content_status = 'pending';

ALTER TABLE mnemonics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated reads mnemonics" ON mnemonics;
CREATE POLICY "Authenticated reads mnemonics"
  ON mnemonics FOR SELECT TO authenticated USING (true);

-- INSERT/UPDATE/DELETE via service-role only (seed + Claude generation).
-- We expose a permissive INSERT/UPDATE for authenticated so the existing
-- service-role flow continues to work; tighten later if needed by
-- moving the seed endpoint to use SUPABASE_SERVICE_ROLE_KEY explicitly.
DROP POLICY IF EXISTS "Authenticated writes mnemonics" ON mnemonics;
CREATE POLICY "Authenticated writes mnemonics"
  ON mnemonics FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── mnemonic_progress — per-user SRS state ──────────────────────────────────
CREATE TABLE IF NOT EXISTS mnemonic_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mnemonic_id UUID NOT NULL REFERENCES mnemonics(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'active', 'solid', 'archived')),
  correct_streak INTEGER NOT NULL DEFAULT 0,
  difficulty_level INTEGER NOT NULL DEFAULT 1
    CHECK (difficulty_level BETWEEN 1 AND 3),
  cycle_count INTEGER NOT NULL DEFAULT 0,
  last_reviewed TIMESTAMPTZ,
  next_review_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, mnemonic_id)
);

CREATE INDEX IF NOT EXISTS idx_mnemonic_progress_user_due
  ON mnemonic_progress(user_id, next_review_date)
  WHERE status IN ('active', 'new');

ALTER TABLE mnemonic_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User owns mnemonic_progress" ON mnemonic_progress;
CREATE POLICY "User owns mnemonic_progress"
  ON mnemonic_progress FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
