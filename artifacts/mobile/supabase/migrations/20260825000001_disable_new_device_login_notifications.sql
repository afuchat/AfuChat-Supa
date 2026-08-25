-- New-device security notices are no longer part of the AfuChat experience.
-- Remove the database trigger as well as the function so older clients cannot
-- recreate the warning by registering a device session.

DROP TRIGGER IF EXISTS user_device_sessions_new_device_notification
  ON public.user_device_sessions;

DROP FUNCTION IF EXISTS public.notify_new_device_session();