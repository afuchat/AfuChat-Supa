-- Device-level notification preferences are copied from the client so the
-- server can filter background pushes before Android or iOS displays them.
ALTER TABLE public.push_devices
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_push_devices_notification_preferences
  ON public.push_devices USING GIN (notification_preferences);