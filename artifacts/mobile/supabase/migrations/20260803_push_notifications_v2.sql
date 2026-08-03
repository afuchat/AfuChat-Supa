-- ============================================================
-- Push Notifications v2 — Clean DB Triggers
-- ============================================================
--
-- Wipes and rebuilds all push notification DB triggers.
--
-- PREREQUISITES (one-time setup in Supabase Dashboard):
--   1. Enable pg_net:
--      Database → Extensions → search "pg_net" → Enable
--
--   2. Deploy push-notification-trigger edge function:
--      From Replit terminal:
--      SUPABASE_ACCESS_TOKEN=<token> pnpm --package=supabase dlx supabase \
--        functions deploy push-notification-trigger \
--        --project-ref rhnsjqqtdzlkvqazfcbg --use-api
--
--   3. Set Firebase secrets in Supabase Dashboard:
--      Project Settings → Edge Functions → Secrets:
--        FIREBASE_PROJECT_ID           = <your Firebase project ID>
--        FIREBASE_SERVICE_ACCOUNT_KEY  = <full service-account JSON>
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run
--
-- WHAT THIS DOES:
--   - Drops all previous push notification triggers/functions
--   - Creates _private schema + pg_net HTTP helper
--   - Creates triggers on: messages, calls, notifications
--   - Each trigger calls push-notification-trigger via pg_net HTTP POST
--
-- ANON KEY (safe to expose — scoped to public anon role, no write access)
-- The edge function authenticates itself internally via SUPABASE_SERVICE_ROLE_KEY.
-- ============================================================

-- Enable pg_net extension (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Private schema for internal trigger functions
CREATE SCHEMA IF NOT EXISTS _private;

-- ── Drop old triggers (idempotent cleanup) ────────────────────────────────────

DROP TRIGGER IF EXISTS push_on_message_insert    ON public.messages;
DROP TRIGGER IF EXISTS push_on_call_insert       ON public.calls;
DROP TRIGGER IF EXISTS push_on_notification_insert ON public.notifications;

DROP FUNCTION IF EXISTS _private.push_on_message_insert()     CASCADE;
DROP FUNCTION IF EXISTS _private.push_on_call_insert()        CASCADE;
DROP FUNCTION IF EXISTS _private.push_on_notification_insert() CASCADE;
DROP FUNCTION IF EXISTS _private.call_push_trigger(jsonb)     CASCADE;

-- ── Drop old send-push webhook tables if any ─────────────────────────────────

-- (No-op if they don't exist; supabase_functions.hooks is read-only via dashboard)

-- ── Ensure notification_preferences table exists ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id                UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled           BOOLEAN     NOT NULL DEFAULT true,
  push_messages          BOOLEAN     NOT NULL DEFAULT true,
  push_likes             BOOLEAN     NOT NULL DEFAULT true,
  push_follows           BOOLEAN     NOT NULL DEFAULT true,
  push_mentions          BOOLEAN     NOT NULL DEFAULT true,
  push_comments          BOOLEAN     NOT NULL DEFAULT true,
  push_gifts             BOOLEAN     NOT NULL DEFAULT true,
  quiet_hours_enabled    BOOLEAN     NOT NULL DEFAULT false,
  quiet_hours_start      TEXT        NOT NULL DEFAULT '22:00',
  quiet_hours_end        TEXT        NOT NULL DEFAULT '08:00',
  quiet_hours_timezone   TEXT        NOT NULL DEFAULT 'UTC',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own prefs" ON public.notification_preferences;
CREATE POLICY "Users manage own prefs"
  ON public.notification_preferences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Ensure profiles has fcm_token column ─────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS fcm_token              TEXT,
  ADD COLUMN IF NOT EXISTS push_token_platform    TEXT,
  ADD COLUMN IF NOT EXISTS push_token_updated_at  TIMESTAMPTZ;

-- ── Core HTTP POST helper ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _private.call_push_trigger(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://rhnsjqqtdzlkvqazfcbg.supabase.co/functions/v1/push-notification-trigger',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobnNqcXF0ZHpsa3ZxYXpmY2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NzA4NjksImV4cCI6MjA3NzI0Njg2OX0.j8zuszO1K6Apjn-jRiVUyZeqe3Re424xyOho9qDl_oY'
    ),
    body    := payload,
    timeout_milliseconds := 5000
  );
EXCEPTION WHEN OTHERS THEN
  -- Never fail the original INSERT because of a push notification error
  NULL;
END;
$$;

-- ── Trigger: messages ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _private.push_on_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- messages table uses encrypted_content (no message_type column).
  -- Skip if there is no content to notify about.
  IF NEW.encrypted_content IS NULL AND NEW.attachment_url IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM _private.call_push_trigger(
    jsonb_build_object(
      'type',       'INSERT',
      'table',      'messages',
      'schema',     'public',
      'record',     to_jsonb(NEW),
      'old_record', NULL
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_on_message_insert ON public.messages;
CREATE TRIGGER push_on_message_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION _private.push_on_message_insert();

-- ── Trigger: calls ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _private.push_on_call_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Only fire on new incoming calls (not status updates from other triggers)
  IF NEW.status NOT IN ('ringing', 'initiated') THEN
    RETURN NEW;
  END IF;

  PERFORM _private.call_push_trigger(
    jsonb_build_object(
      'type',       'INSERT',
      'table',      'calls',
      'schema',     'public',
      'record',     to_jsonb(NEW),
      'old_record', NULL
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_on_call_insert ON public.calls;
CREATE TRIGGER push_on_call_insert
  AFTER INSERT ON public.calls
  FOR EACH ROW
  EXECUTE FUNCTION _private.push_on_call_insert();

-- ── Trigger: notifications ────────────────────────────────────────────────────
-- Covers: likes, follows, comments, mentions, payments, order updates

CREATE OR REPLACE FUNCTION _private.push_on_notification_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM _private.call_push_trigger(
    jsonb_build_object(
      'type',       'INSERT',
      'table',      'notifications',
      'schema',     'public',
      'record',     to_jsonb(NEW),
      'old_record', NULL
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_on_notification_insert ON public.notifications;
CREATE TRIGGER push_on_notification_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION _private.push_on_notification_insert();

-- ── Grant execute permissions ─────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION _private.call_push_trigger(jsonb)          TO postgres;
GRANT EXECUTE ON FUNCTION _private.push_on_message_insert()           TO postgres;
GRANT EXECUTE ON FUNCTION _private.push_on_call_insert()              TO postgres;
GRANT EXECUTE ON FUNCTION _private.push_on_notification_insert()      TO postgres;

-- ── Verify triggers created ───────────────────────────────────────────────────

SELECT
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE 'push_%'
ORDER BY event_object_table;
