-- Phase 1 — Image library extensions
-- Adds rich metadata (display_name, tags, sequence, source URL, dimensions,
-- file size) and a single-cover-per-entity constraint to entity_images.

ALTER TABLE entity_images
  ADD COLUMN IF NOT EXISTS display_name     TEXT,
  ADD COLUMN IF NOT EXISTS tags             TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sequence         TEXT,
  ADD COLUMN IF NOT EXISTS source_url       TEXT,
  ADD COLUMN IF NOT EXISTS width            INT,
  ADD COLUMN IF NOT EXISTS height           INT,
  ADD COLUMN IF NOT EXISTS file_size_bytes  INT,
  ADD COLUMN IF NOT EXISTS is_cover         BOOLEAN NOT NULL DEFAULT FALSE;

-- GIN index for fast tag filtering (used by future quiz mode).
CREATE INDEX IF NOT EXISTS idx_entity_images_tags
  ON entity_images USING gin(tags);

-- Partial unique index: at most one cover per entity.
-- Toggling cover requires unsetting the previous cover BEFORE setting the new
-- one (see setCoverImage in src/lib/supabase/queries.ts).
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_images_cover_per_entity
  ON entity_images(entity_id) WHERE is_cover = TRUE;
