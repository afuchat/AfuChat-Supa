-- ============================================================
-- AfuChat: Realtime Publication + Calls Table + RPC Fixes
-- ============================================================
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste and run
--
-- WHAT THIS FIXES:
--   1. Messages not appearing in real-time
--      (messages table was never added to supabase_realtime publication)
--   2. message_reactions + message_status not updating in real-time
--   3. calls table missing entirely (call push notifications broken)
--   4. ensure_notification_preferences RPC missing
--      (register-push-token edge function was failing silently)
--   5. push_replies column missing from notification_preferences
--      (edge function selects this column but it didn't exist)
-- ============================================================

-- ── 1. Enable real-time for messages ─────────────────────────────────────────
-- REPLICA IDENTITY FULL lets Supabase stream the full row to subscribers;
-- without it, filters on postgres_changes payloads return empty new/old records.

ALTER TABLE public.messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END$$;

-- ── 2. Enable real-time for message_reactions ─────────────────────────────────

ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;
END$$;

-- ── 3. Enable real-time for message_status ────────────────────────────────────

ALTER TABLE public.message_status REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_status'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_status;
  END IF;
END$$;

-- ── 4. Create calls table ─────────────────────────────────────────────────────
-- Used by callEngine.ts + push-notification-trigger edge function.
-- Column name is callee_id (not receiver_id) — matches what callEngine.ts inserts.

CREATE TABLE IF NOT EXISTS public.calls (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id          TEXT        NOT NULL,
  caller_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  callee_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  call_type        TEXT        NOT NULL DEFAULT 'voice'
                               CHECK (call_type IN ('voice', 'video')),
  status           TEXT        NOT NULL DEFAULT 'ringing'
                               CHECK (status IN ('ringing', 'initiated', 'active',
                                                 'ended', 'missed', 'declined',
                                                 'busy', 'failed')),
  chat_id          UUID        REFERENCES public.chats(id) ON DELETE SET NULL,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at      TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,
  duration_seconds INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- Participants can view their own calls
DROP POLICY IF EXISTS "calls_select" ON public.calls;
CREATE POLICY "calls_select"
  ON public.calls FOR SELECT
  USING (auth.uid() = caller_id OR auth.uid() = callee_id);

-- Only the caller can create a call record
DROP POLICY IF EXISTS "calls_insert" ON public.calls;
CREATE POLICY "calls_insert"
  ON public.calls FOR INSERT
  WITH CHECK (auth.uid() = caller_id);

-- Both participants can update call status (accept, decline, end)
DROP POLICY IF EXISTS "calls_update" ON public.calls;
CREATE POLICY "calls_update"
  ON public.calls FOR UPDATE
  USING (auth.uid() = caller_id OR auth.uid() = callee_id);

-- Add columns that may be missing if the table already existed without them
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS answered_at      TIMESTAMPTZ;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS ended_at         TIMESTAMPTZ;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS chat_id          UUID REFERENCES public.chats(id) ON DELETE SET NULL;

-- Index for quick lookup by participant
CREATE INDEX IF NOT EXISTS idx_calls_caller_id  ON public.calls (caller_id);
CREATE INDEX IF NOT EXISTS idx_calls_callee_id  ON public.calls (callee_id);
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON public.calls (created_at DESC);

-- Enable real-time for calls (needed by CallContext to watch status changes)
ALTER TABLE public.calls REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
  END IF;
END$$;

-- Recreate push trigger on calls (was failing before because table didn't exist)
DROP TRIGGER IF EXISTS push_on_call_insert ON public.calls;
CREATE TRIGGER push_on_call_insert
  AFTER INSERT ON public.calls
  FOR EACH ROW
  EXECUTE FUNCTION _private.push_on_call_insert();

-- ── 5. ensure_notification_preferences RPC ───────────────────────────────────
-- Called by the register-push-token edge function after storing a push token.
-- Creates a default notification_preferences row if one doesn't already exist.

CREATE OR REPLACE FUNCTION public.ensure_notification_preferences(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_notification_preferences(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_notification_preferences(UUID) TO postgres;
GRANT EXECUTE ON FUNCTION public.ensure_notification_preferences(UUID) TO authenticated;

-- ── 6. Add push_replies column to notification_preferences ───────────────────
-- The push-notification-trigger edge function checks push_replies for
-- comment/reply notifications; the column was missing.

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS push_replies BOOLEAN NOT NULL DEFAULT true;

-- ── 7. Verify publication tables ─────────────────────────────────────────────
-- Run this after to confirm all tables are now in the publication:

SELECT pubname, schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
