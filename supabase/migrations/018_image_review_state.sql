-- Phase 2 — Image quiz SRS
-- One row per (image, user) tracking the SM-2 state for image-based quizzes,
-- separate from entity-level SRS so picture review and oral DDx can evolve at
-- different paces.

CREATE TABLE IF NOT EXISTS image_review_state (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  image_id           UUID        NOT NULL REFERENCES entity_images(id) ON DELETE CASCADE,
  user_id            UUID        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  correct_streak     INT         NOT NULL DEFAULT 0,
  difficulty_level   INT         NOT NULL DEFAULT 2,
  cycle_count        INT         NOT NULL DEFAULT 0,
  status             TEXT        NOT NULL DEFAULT 'new',  -- new|active|solid|archived
  next_review_date   DATE,
  last_reviewed      TIMESTAMPTZ,
  total_reviews      INT         NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(image_id, user_id)
);

-- Hot path: "what's due today for this user".
CREATE INDEX IF NOT EXISTS idx_image_review_state_user_due
  ON image_review_state(user_id, next_review_date)
  WHERE status <> 'archived';

CREATE INDEX IF NOT EXISTS idx_image_review_state_user_status
  ON image_review_state(user_id, status);

ALTER TABLE image_review_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "image_review_state_select_own"
  ON image_review_state FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "image_review_state_insert_own"
  ON image_review_state FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "image_review_state_update_own"
  ON image_review_state FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "image_review_state_delete_own"
  ON image_review_state FOR DELETE
  USING (user_id = auth.uid());
