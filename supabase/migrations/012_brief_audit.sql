-- Brief audit report storage.
-- Stores the most recent audit output (one JSONB blob per user) so the
-- /stats/audit page can render the report without re-running Claude each time.
-- Structure:
--   {
--     "generated_at": "2026-04-21T08:00:00Z",
--     "items": [
--       { "entity_id": "...", "status": "ok" | "needs_fix",
--         "gaps": ["...", "..."],
--         "suggested_grouping": "..." | null,
--         "ignored": false }
--     ]
--   }

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS last_audit JSONB;
