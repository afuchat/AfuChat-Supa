-- Push notification resilience:
-- keep native FCM/APNs and Expo push tokens separately.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_expo_push_token
  ON public.profiles (expo_push_token)
  WHERE expo_push_token IS NOT NULL;

-- The push trigger reads this preference for comment/reply notifications.
-- Keep it idempotent so this repair is safe on projects where it already exists.
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS push_comments BOOLEAN NOT NULL DEFAULT true;