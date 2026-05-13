-- Phase 1.5 — AI brief per image
-- Each entity image gets a Claude-generated brief (Dx, top 3 DDx, semiologic
-- findings, pitfalls) computed once at upload time so quiz reveals are O(1).

ALTER TABLE entity_images
  ADD COLUMN IF NOT EXISTS ai_brief              JSONB,
  ADD COLUMN IF NOT EXISTS ai_brief_status       TEXT        NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ai_brief_error        TEXT,
  ADD COLUMN IF NOT EXISTS ai_brief_generated_at TIMESTAMPTZ;

-- Status values: 'pending' | 'analyzing' | 'done' | 'error'.
-- Constraint kept loose (no CHECK) so we can add states later without a
-- migration churn.
