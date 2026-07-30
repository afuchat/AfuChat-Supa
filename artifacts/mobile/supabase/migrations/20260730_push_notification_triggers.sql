-- ============================================================
-- Push Notification DB Triggers (pg_net)
-- ============================================================
-- This migration creates PostgreSQL triggers that call the
-- push-notification-trigger edge function on INSERT into
-- messages, calls, and notifications.
--
-- Prerequisites before running this:
--   1. Enable pg_net extension:
--      Database → Extensions → search "pg_net" → Enable
--   2. Deploy the edge function (from Replit terminal or locally):
--      SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy push-notification-trigger --project-ref rhnsjqqtdzlkvqazfcbg --use-api
--   3. Set Firebase secrets in Supabase (Project Settings → Edge Functions → Secrets):
--      FIREBASE_PROJECT_ID           = your Firebase project ID
--      FIREBASE_SERVICE_ACCOUNT_KEY  = full service-account JSON string
--
-- How to run this migration:
--   Supabase Dashboard → SQL Editor → paste and run.
-- ============================================================

-- Enable pg_net (idempotent; fails silently if already enabled).
-- pg_net always creates its functions in the "net" schema regardless of this clause.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Private schema for internal trigger functions
CREATE SCHEMA IF NOT EXISTS _private;

-- ── Helper: POST to the push-notification-trigger edge function ───────────────
-- Uses the public anon key as the bearer token. The edge function authenticates
-- itself internally using SUPABASE_SERVICE_ROLE_KEY (set as a Supabase secret).
CREATE OR REPLACE FUNCTION _private.call_push_trigger(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://rhnsjqqtdzlkvqazfcbg.supabase.co/functions/v1/push-notification-trigger',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobnNqcXF0ZHpsa3ZxYXpmY2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NzA4NjksImV4cCI6MjA3NzI0Njg2OX0.j8zuszO1K6Apjn-jRiVUyZeqe3Re424xyOho9qDl_oY'
    ),
    body    := payload
  );
EXCEPTION WHEN OTHERS THEN
  -- Silently skip if pg_net is unavailable; never fail the INSERT.
  NULL;
END;
$$;

-- ── Trigger: messages ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _private.push_on_message_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
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
  FOR EACH ROW EXECUTE FUNCTION _private.push_on_message_insert();

-- ── Trigger: calls ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _private.push_on_call_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
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
  FOR EACH ROW EXECUTE FUNCTION _private.push_on_call_insert();

-- ── Trigger: notifications ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _private.push_on_notification_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
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
  FOR EACH ROW EXECUTE FUNCTION _private.push_on_notification_insert();
