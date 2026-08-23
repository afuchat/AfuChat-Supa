-- Notify an account when a different device is registered.
-- The first device is silent; later device registrations create a persistent
-- security notice in the user's verified @notifications chat.

CREATE OR REPLACE FUNCTION public.notify_new_device_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous_device_count integer;
  v_device_label text;
BEGIN
  SELECT count(*)::integer
  INTO v_previous_device_count
  FROM public.user_device_sessions
  WHERE user_id = NEW.user_id
    AND id <> NEW.id;

  -- Do not create a security notice for the first device on an account.
  IF v_previous_device_count = 0 THEN
    RETURN NEW;
  END IF;

  v_device_label := COALESCE(
    NULLIF(NEW.device_name, ''),
    NULLIF(NEW.device_model, ''),
    NULLIF(NEW.device_os, ''),
    'A new device'
  );

  PERFORM public.create_in_app_notification(
    NEW.user_id,
    'security',
    'New device signed in',
    format('%s was added to your account. If you do not recognize it, review your signed-in devices.', v_device_label),
    'Review devices',
    '/device-security',
    NULL,
    jsonb_build_object(
      'device_session_id', NEW.id,
      'device_name', v_device_label,
      'device_os', NEW.device_os,
      'device_model', NEW.device_model,
      'created_at', NEW.created_at
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Device registration must never prevent a successful login.
    RAISE WARNING 'Could not create new-device notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_device_sessions_new_device_notification
  ON public.user_device_sessions;

CREATE TRIGGER user_device_sessions_new_device_notification
AFTER INSERT ON public.user_device_sessions
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_device_session();