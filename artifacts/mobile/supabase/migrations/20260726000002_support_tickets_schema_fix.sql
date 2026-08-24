-- Migration: fix support_tickets schema so the client query works correctly.
--
-- Problems solved:
--   1. support_tickets was missing the has_ai_draft column which the app
--      selects. The missing column caused every SELECT to fail (column does
--      not exist), so users saw an empty ticket list.
--   2. support_tickets.updated_at was not automatically bumped when a new
--      support_messages row was inserted, so the inbox list never re-sorted.
--
-- Applied to production: 2026-07-26 via Supabase Management API.

-- 1. Add has_ai_draft column (idempotent)
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS has_ai_draft boolean DEFAULT false;

-- 2. Ensure updated_at defaults to now() so it is always set on insert
ALTER TABLE support_tickets
  ALTER COLUMN updated_at SET DEFAULT now();

-- 3. Trigger: bump updated_at on the parent ticket whenever a new message is
--    inserted. This keeps the "My Tickets" list sorted by most recent activity.
CREATE OR REPLACE FUNCTION update_ticket_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE support_tickets
     SET updated_at = now()
   WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_message_bump_ticket ON support_messages;
CREATE TRIGGER trg_support_message_bump_ticket
  AFTER INSERT ON support_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_updated_at();