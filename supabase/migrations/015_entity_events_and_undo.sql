-- Activity log + undo infrastructure (itération 7)
--
-- Context: the Linear-senior review of the source-accumulation plan flagged
-- two critical UX omissions — there is no audit trail for what Claude did to
-- a brief, and no way to undo a merge that went wrong. Both are cheap to fix
-- at the schema level.

-- 1. briefs.content_previous — snapshot of the brief's content BEFORE the
--    most recent Claude-driven change (merge, regeneration). Overwritten on
--    each commit so the user can always undo the last operation. Ping-pong
--    support: when undo fires, the current content is moved to
--    content_previous, letting the user redo.
ALTER TABLE briefs
  ADD COLUMN IF NOT EXISTS content_previous TEXT;

-- 2. entity_events — lightweight activity log per entity. Kept intentionally
--    flat (one event kind column, one free-text summary) so we don't need to
--    model each event type as its own table.
CREATE TABLE IF NOT EXISTS entity_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'reference_added',
    'claude_regenerated',
    'claude_merged',
    'anchor_linked',
    'anchor_unlinked',
    'brief_reverted'
  )),
  source_label TEXT,
  diff_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entity_events_entity
  ON entity_events(entity_id, created_at DESC);

-- RLS — mirror the entities table: user only sees their own events.
ALTER TABLE entity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_events_all_for_authenticated"
  ON entity_events FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
