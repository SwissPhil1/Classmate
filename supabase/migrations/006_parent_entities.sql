-- Add parent_id for entity hierarchy (one level deep)
ALTER TABLE entities ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES entities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_entities_parent_id ON entities(parent_id);
