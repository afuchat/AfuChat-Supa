-- Push-only delivery registry.
-- This stores device delivery tokens, not notification history or in-app rows.

CREATE TABLE IF NOT EXISTS public.push_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_devices_user_enabled
  ON public.push_devices (user_id, enabled);

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_devices_select_own" ON public.push_devices;
CREATE POLICY "push_devices_select_own"
  ON public.push_devices FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_devices_insert_own" ON public.push_devices;
CREATE POLICY "push_devices_insert_own"
  ON public.push_devices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_devices_update_own" ON public.push_devices;
CREATE POLICY "push_devices_update_own"
  ON public.push_devices FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_devices_delete_own" ON public.push_devices;
CREATE POLICY "push_devices_delete_own"
  ON public.push_devices FOR DELETE
  USING (auth.uid() = user_id);