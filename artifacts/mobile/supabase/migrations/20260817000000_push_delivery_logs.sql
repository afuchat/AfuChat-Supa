-- Durable push delivery diagnostics.
-- This intentionally stores provider/error metadata, never push tokens or message bodies.

CREATE TABLE IF NOT EXISTS public.push_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('registration', 'delivery')),
  status TEXT NOT NULL CHECK (status IN ('registered', 'sent', 'failed', 'skipped')),
  stage TEXT NOT NULL,
  sender_id TEXT,
  recipient_user_id TEXT,
  device_id UUID REFERENCES public.push_devices(id) ON DELETE SET NULL,
  message_id TEXT,
  chat_id TEXT,
  platform TEXT CHECK (platform IN ('android', 'ios') OR platform IS NULL),
  provider_http_status INTEGER,
  provider_status TEXT,
  provider_ticket_id TEXT,
  error_code TEXT,
  error_message TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_delivery_logs_created_at
  ON public.push_delivery_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_push_delivery_logs_recipient_created
  ON public.push_delivery_logs (recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_push_delivery_logs_status_created
  ON public.push_delivery_logs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_push_delivery_logs_request_id
  ON public.push_delivery_logs (request_id);

ALTER TABLE public.push_delivery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_delivery_logs_select_related" ON public.push_delivery_logs;
CREATE POLICY "push_delivery_logs_select_related"
  ON public.push_delivery_logs FOR SELECT
  USING (
    auth.uid()::text = recipient_user_id
    OR auth.uid()::text = sender_id
  );