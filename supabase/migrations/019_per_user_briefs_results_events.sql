-- Migration 019 — per-user isolation of briefs, test_results, entity_events
--
-- Audit (2026-04-25) revealed three tables with PERMISSIVE `true` RLS policies
-- and either no user_id column or unused user_id. Any authenticated user could
-- SELECT/UPDATE/DELETE briefs, test_results, and entity_events from any other
-- user. This blocks safe multi-user access (e.g. a second account on the same
-- deployment).
--
-- This migration:
--   1. Adds user_id to briefs and test_results (entity_events already has it).
--   2. Backfills user_id from entities.user_id via the existing entity_id FK.
--   3. Enforces NOT NULL once backfill is complete.
--   4. Replaces the permissive RLS policies with strict auth.uid() = user_id.
--
-- Idempotent: every step uses IF NOT EXISTS / IF EXISTS guards. Safe to re-run.

-- ─── briefs ──────────────────────────────────────────────────────────────────
ALTER TABLE briefs
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE briefs
SET user_id = e.user_id
FROM entities e
WHERE briefs.entity_id = e.id
  AND briefs.user_id IS NULL;

-- Drop any orphan brief whose entity has been deleted but the brief survived
-- (no FK cascade was enforced at insert time for these). Without this, the
-- NOT NULL below would fail.
DELETE FROM briefs WHERE user_id IS NULL;

ALTER TABLE briefs ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_briefs_user_id ON briefs(user_id);

DROP POLICY IF EXISTS "Authenticated can manage briefs" ON briefs;
DROP POLICY IF EXISTS "User owns brief" ON briefs;

CREATE POLICY "User owns brief"
  ON briefs FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── test_results ────────────────────────────────────────────────────────────
ALTER TABLE test_results
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE test_results
SET user_id = e.user_id
FROM entities e
WHERE test_results.entity_id = e.id
  AND test_results.user_id IS NULL;

DELETE FROM test_results WHERE user_id IS NULL;

ALTER TABLE test_results ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_test_results_user_id ON test_results(user_id);

DROP POLICY IF EXISTS "Authenticated can manage results" ON test_results;
DROP POLICY IF EXISTS "User owns test_result" ON test_results;

CREATE POLICY "User owns test_result"
  ON test_results FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── entity_events ───────────────────────────────────────────────────────────
-- Already has user_id NOT NULL (migration 015). Just tighten the RLS.

DROP POLICY IF EXISTS "entity_events_all_for_authenticated" ON entity_events;
DROP POLICY IF EXISTS "User owns entity_event" ON entity_events;

CREATE POLICY "User owns entity_event"
  ON entity_events FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
