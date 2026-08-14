-- ============================================================
-- AfuChat: Realtime Publication + Calls Table + RPC Fixes
-- ============================================================
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste the ENTIRE file → Run
-- ============================================================

-- ── 1. Real-time for messages ────────────────────────────────
ALTER TABLE public.messages REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END$$;

-- ── 2. Real-time for message_reactions ───────────────────────
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'message_reactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;
END$$;

-- ── 3. Real-time for message_status ──────────────────────────
ALTER TABLE public.message_status REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'message_status') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_status;
  END IF;
END$$;

-- ── 4. calls table ────────────────────────────────────────────
-- Create if it doesn't exist yet
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
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add any columns that were missing from a pre-existing table
-- (no NOT NULL here so they work safely on tables that already have rows)
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS chat_id          UUID        REFERENCES public.chats(id) ON DELETE SET NULL;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS answered_at      TIMESTAMPTZ;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS ended_at         TIMESTAMPTZ;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ DEFAULT now();

-- RLS
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "calls_select" ON public.calls;
CREATE POLICY "calls_select" ON public.calls FOR SELECT USING (auth.uid() = caller_id OR auth.uid() = callee_id);
DROP POLICY IF EXISTS "calls_insert" ON public.calls;
CREATE POLICY "calls_insert" ON public.calls FOR INSERT WITH CHECK (auth.uid() = caller_id);
DROP POLICY IF EXISTS "calls_update" ON public.calls;
CREATE POLICY "calls_update" ON public.calls FOR UPDATE USING (auth.uid() = caller_id OR auth.uid() = callee_id);

-- Indexes — safe to run even if columns were just added above
CREATE INDEX IF NOT EXISTS idx_calls_caller_id  ON public.calls (caller_id);
CREATE INDEX IF NOT EXISTS idx_calls_callee_id  ON public.calls (callee_id);
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON public.calls (created_at DESC);

-- Real-time for calls
ALTER TABLE public.calls REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'calls') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
  END IF;
END$$;

-- ── 5. Verify ─────────────────────────────────────────────────
SELECT pubname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
