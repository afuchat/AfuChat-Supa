-- AfuChat no longer uses Firebase, FCM, Expo push delivery, or device push
-- registration. Keep in-app notification_events intact.
--
-- These objects were created by the former push-delivery pipeline. IF EXISTS
-- makes this safe against projects that already removed some of them.
DROP TABLE IF EXISTS public.push_delivery_attempts CASCADE;
DROP TABLE IF EXISTS public.push_delivery_logs CASCADE;
DROP TABLE IF EXISTS public.push_devices CASCADE;
DROP TABLE IF EXISTS public.push_tokens CASCADE;
DROP TABLE IF EXISTS public.push_preferences CASCADE;
DROP TABLE IF EXISTS public.device_push_tokens CASCADE;

DROP FUNCTION IF EXISTS public.send_push_notification CASCADE;
DROP FUNCTION IF EXISTS public.register_push_token CASCADE;
DROP FUNCTION IF EXISTS public.trigger_push_notification CASCADE;
DROP FUNCTION IF EXISTS public.notify_push CASCADE;