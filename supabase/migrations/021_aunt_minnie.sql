-- Migration 021 — Aunt Minnie flag on entities
--
-- An Aunt Minnie is a single-image / single-diagnosis pattern that should be
-- recognised at first glance ("popcorn calcification → hamartome", "agneau →
-- méningiome", etc.). They are studied like mnemonics: drilled frequently,
-- on-demand, image-first.
--
-- One boolean column on entities, one partial index for fast drill queries.
-- Idempotent.

ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS is_aunt_minnie BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS entities_aunt_minnie_idx
  ON entities (user_id)
  WHERE is_aunt_minnie = true;
