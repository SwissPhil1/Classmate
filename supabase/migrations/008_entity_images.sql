-- Entity images table: multiple images per entity for visual learning
-- Supports Aunt Minnie cases, Radiopaedia references, and exam paper images

CREATE TABLE entity_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  storage_path TEXT NOT NULL,
  caption TEXT,
  modality TEXT CHECK (modality IS NULL OR modality IN ('CT', 'IRM', 'RX', 'US', 'autre')),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entity_images_entity ON entity_images(entity_id);
CREATE INDEX idx_entity_images_user ON entity_images(user_id);

-- RLS policies
ALTER TABLE entity_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own images"
  ON entity_images FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own images"
  ON entity_images FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own images"
  ON entity_images FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own images"
  ON entity_images FOR DELETE
  USING (user_id = auth.uid());
