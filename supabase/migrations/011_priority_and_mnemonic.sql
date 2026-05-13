-- Priority tagging + mnemonic metadata for entities
-- Adds a unified "priority" flag covering both mnemonics (MMT) and vital/"can't-miss"
-- clinical entities (aortic dissection, PE, pneumothorax, AVC hémorragique, etc.).
-- Vital items get compressed SRS intervals and surface in the daily drill widget.

ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal', 'vital')),
  ADD COLUMN IF NOT EXISTS priority_source TEXT
    CHECK (priority_source IS NULL OR priority_source IN ('auto', 'manual')),
  ADD COLUMN IF NOT EXISTS has_mnemonic BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mnemonic_name TEXT;

-- Partial index for the daily drill query
CREATE INDEX IF NOT EXISTS idx_entities_priority_due
  ON entities(user_id, priority, next_test_date)
  WHERE priority = 'vital';
