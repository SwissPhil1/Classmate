-- Chapter-level reference manual + per-entity section anchor
--
-- Context: the current model forces a 1:1 entity→brief relationship. Good for
-- isolated top-3 DDx cases but it breaks down when preparing a chapter-level
-- textbook review (e.g. the urogenital system) where side-by-side comparison
-- tables, classifications, and oral meta-rules live above any single entity.
--
-- We add a `manual_content` column on `chapters` so the user can paste a full
-- chapter reference (like a radiology textbook chapter or a Claude-desktop
-- batched write-up) and keep it as the single source of truth for the whole
-- chapter. Entities can then link to a specific `## Heading` inside that
-- manual via `manual_section_anchor`, which becomes the reference_text
-- substrate for brief generation.

ALTER TABLE chapters
  ADD COLUMN IF NOT EXISTS manual_content TEXT;

ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS manual_section_anchor TEXT;

-- Index for entity lookups by section anchor within a chapter (used when
-- rendering the chapter read view with entity pins next to each section).
CREATE INDEX IF NOT EXISTS idx_entities_manual_section
  ON entities(chapter_id, manual_section_anchor)
  WHERE manual_section_anchor IS NOT NULL;
