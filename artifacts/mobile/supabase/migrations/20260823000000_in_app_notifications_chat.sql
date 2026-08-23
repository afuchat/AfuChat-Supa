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
BEGIN
  IF p_recipient_id IS NULL THEN
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

-- Notifications are emitted by trusted database triggers and server-side jobs.
-- Do not expose this write primitive to clients: otherwise any signed-in user
-- could manufacture notifications for another account.
REVOKE ALL ON FUNCTION public.create_in_app_notification(uuid, text, text, text, text, text, text, jsonb) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.create_in_app_notification(uuid, text, text, text, text, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_new_follower()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF NEW.follower_id IS NULL OR NEW.following_id IS NULL OR NEW.follower_id = NEW.following_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(display_name, ''), NULLIF(handle, ''), 'Someone')
  INTO v_name
  FROM public.profiles
  WHERE id = NEW.follower_id;

  PERFORM public.create_in_app_notification(
    NEW.following_id,
    'follow',
    COALESCE(v_name, 'Someone') || ' followed you',
    'See their profile and connect with them on AfuChat.',
    'View profile',
    '/contact/[id]',
    NEW.follower_id::text,
    jsonb_build_object('follower_id', NEW.follower_id, 'follow_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS follows_create_notification ON public.follows;
CREATE TRIGGER follows_create_notification
AFTER INSERT ON public.follows
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_follower();

-- Keep the notification inbox live while the user is in the normal
-- @notifications chat. Realtime is not enabled for new tables by default.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notification_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_events;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.notify_post_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_id uuid;
  v_name text;
BEGIN
  SELECT author_id INTO v_author_id FROM public.posts WHERE id = NEW.post_id;
  IF v_author_id IS NULL OR v_author_id = NEW.user_id THEN RETURN NEW; END IF;

  SELECT COALESCE(NULLIF(display_name, ''), NULLIF(handle, ''), 'Someone')
  INTO v_name FROM public.profiles WHERE id = NEW.user_id;

  PERFORM public.create_in_app_notification(
    v_author_id,
    'like',
    COALESCE(v_name, 'Someone') || ' liked your post',
    'Your post is getting attention.',
    'View post',
    '/post/[id]',
    NEW.post_id::text,
    jsonb_build_object('liker_id', NEW.user_id, 'post_id', NEW.post_id, 'like_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS post_acknowledgments_create_notification ON public.post_acknowledgments;
CREATE TRIGGER post_acknowledgments_create_notification
AFTER INSERT ON public.post_acknowledgments
FOR EACH ROW
EXECUTE FUNCTION public.notify_post_like();

CREATE OR REPLACE FUNCTION public.notify_post_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_id uuid;
  v_name text;
  v_preview text;
BEGIN
  SELECT author_id INTO v_author_id FROM public.posts WHERE id = NEW.post_id;
  IF v_author_id IS NULL OR v_author_id = NEW.author_id THEN RETURN NEW; END IF;

  SELECT COALESCE(NULLIF(display_name, ''), NULLIF(handle, ''), 'Someone')
  INTO v_name FROM public.profiles WHERE id = NEW.author_id;
  v_preview := left(regexp_replace(COALESCE(NEW.content, ''), '\s+', ' ', 'g'), 140);

  PERFORM public.create_in_app_notification(
    v_author_id,
    'reply',
    COALESCE(v_name, 'Someone') || ' replied to your post',
    CASE WHEN v_preview = '' THEN 'Open the conversation to see the reply.' ELSE '"' || v_preview || '"' END,
    'View post',
    '/post/[id]',
    NEW.post_id::text,
    jsonb_build_object('replier_id', NEW.author_id, 'post_id', NEW.post_id, 'reply_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS post_replies_create_notification ON public.post_replies;
CREATE TRIGGER post_replies_create_notification
AFTER INSERT ON public.post_replies
FOR EACH ROW
EXECUTE FUNCTION public.notify_post_reply();

-- The trigger was added after existing follow activity. Backfill only rows
-- whose follow_id has not already produced an event, so this is idempotent.
DO $$
DECLARE
  f record;
  v_name text;
BEGIN
  FOR f IN
    SELECT fo.*
    FROM public.follows fo
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notification_events ne
      WHERE ne.kind = 'follow'
        AND ne.metadata->>'follow_id' = fo.id::text
    )
  LOOP
    SELECT COALESCE(NULLIF(display_name, ''), NULLIF(handle, ''), 'Someone')
    INTO v_name FROM public.profiles WHERE id = f.follower_id;

    PERFORM public.create_in_app_notification(
      f.following_id,
      'follow',
      COALESCE(v_name, 'Someone') || ' followed you',
      'See their profile and connect with them on AfuChat.',
      'View profile',
      '/contact/[id]',
      f.follower_id::text,
      jsonb_build_object('follower_id', f.follower_id, 'follow_id', f.id)
    );
  END LOOP;
END
$$;