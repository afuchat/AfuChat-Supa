-- Push notification resilience:
-- keep native FCM/APNs and Expo push tokens separately.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_expo_push_token
  ON public.profiles (expo_push_token)
  WHERE expo_push_token IS NOT NULL;