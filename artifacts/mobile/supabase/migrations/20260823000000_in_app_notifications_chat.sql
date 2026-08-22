-- Persistent in-app notifications delivered by the verified @notifications
-- account. The account handle is intentionally resolved at runtime so its
-- profile UUID can change without a client release.

CREATE TABLE IF NOT EXISTS public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  cta_label text,
  cta_route text,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS notification_events_recipient_created_idx
  ON public.notification_events (recipient_id, created_at DESC);

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_events_select_own ON public.notification_events;
CREATE POLICY notification_events_select_own
  ON public.notification_events FOR SELECT
  USING (auth.uid() = recipient_id);

DROP POLICY IF EXISTS notification_events_update_own ON public.notification_events;
CREATE POLICY notification_events_update_own
  ON public.notification_events FOR UPDATE
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

CREATE OR REPLACE FUNCTION public.create_in_app_notification(
  p_recipient_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_cta_label text DEFAULT NULL,
  p_cta_route text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id uuid;
  v_chat_id uuid;
  v_message_id uuid;
  v_event_id uuid;
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL OR p_recipient_id IS NULL THEN
    RAISE EXCEPTION 'Notification recipient is required';
  END IF;

  SELECT id INTO v_sender_id
  FROM public.profiles
  WHERE lower(handle) = 'notifications'
  LIMIT 1;

  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'The @notifications account does not exist';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(LEAST(p_recipient_id::text, v_sender_id::text) || ':' ||
      GREATEST(p_recipient_id::text, v_sender_id::text), 0)
  );

  SELECT c.id INTO v_chat_id
  FROM public.chats c
  JOIN public.chat_members recipient ON recipient.chat_id = c.id
    AND recipient.user_id = p_recipient_id
  JOIN public.chat_members sender ON sender.chat_id = c.id
    AND sender.user_id = v_sender_id
  WHERE COALESCE(c.is_group, false) = false
    AND COALESCE(c.is_channel, false) = false
  ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_chat_id IS NULL THEN
    INSERT INTO public.chats (is_group, is_channel, created_by)
    VALUES (false, false, v_sender_id)
    RETURNING id INTO v_chat_id;

    INSERT INTO public.chat_members (chat_id, user_id)
    VALUES (v_chat_id, p_recipient_id), (v_chat_id, v_sender_id);
  END IF;

  INSERT INTO public.messages (chat_id, sender_id, encrypted_content)
  VALUES (v_chat_id, v_sender_id, p_title || E'\n' || p_body)
  RETURNING id INTO v_message_id;

  INSERT INTO public.notification_events (
    recipient_id, actor_id, kind, title, body, cta_label, cta_route,
    entity_id, metadata, message_id
  )
  VALUES (
    p_recipient_id, NULL, p_kind, p_title, p_body, p_cta_label, p_cta_route,
    p_entity_id, COALESCE(p_metadata, '{}'::jsonb), v_message_id
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_in_app_notification(uuid, text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_in_app_notification(uuid, text, text, text, text, text, text, jsonb) TO authenticated;