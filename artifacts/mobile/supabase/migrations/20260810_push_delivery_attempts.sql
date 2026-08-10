-- Push delivery observability and stale-token cleanup support.
CREATE TABLE IF NOT EXISTS public.push_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_table TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_id TEXT,
  notification_type TEXT,
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_delivery_attempts_created_at_idx
  ON public.push_delivery_attempts (created_at DESC);
CREATE INDEX IF NOT EXISTS push_delivery_attempts_recipient_idx
  ON public.push_delivery_attempts (recipient_user_id, created_at DESC);

ALTER TABLE public.push_delivery_attempts ENABLE ROW LEVEL SECURITY;