-- Record social interactions in the persistent in-app notification feed.
-- This migration deliberately does not call the push delivery path.

CREATE OR REPLACE FUNCTION public.notification_actor_name(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(display_name, ''), NULLIF(handle, ''), 'Someone')
  FROM public.profiles
  WHERE id = p_user_id
$$;

CREATE OR REPLACE FUNCTION public.notify_message_reaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient uuid;
  v_name text;
BEGIN
  SELECT sender_id INTO v_recipient
  FROM public.messages
  WHERE id = NEW.message_id;

  IF v_recipient IS NULL OR v_recipient = NEW.user_id THEN
    RETURN NEW;
  END IF;

  v_name := public.notification_actor_name(NEW.user_id);
  PERFORM public.create_in_app_notification(
    v_recipient,
    'reaction',
    v_name || ' reacted to your message',
    'Open the conversation to see the reaction.',
    'Open chat',
    '/chat/[id]',
    NEW.message_id::text,
    jsonb_build_object(
      'message_id', NEW.message_id,
      'reaction', NEW.reaction,
      'actor_id', NEW.user_id
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_post_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_owner uuid;
  v_parent_author uuid;
  v_name text;
BEGIN
  SELECT author_id INTO v_post_owner
  FROM public.posts
  WHERE id = NEW.post_id;

  SELECT author_id INTO v_parent_author
  FROM public.post_replies
  WHERE id = NEW.parent_reply_id;

  v_name := public.notification_actor_name(NEW.author_id);

  IF v_post_owner IS NOT NULL AND v_post_owner <> NEW.author_id THEN
    PERFORM public.create_in_app_notification(
      v_post_owner,
      'reply',
      v_name || ' replied to your post',
      LEFT(COALESCE(NEW.content, 'See their reply on your post.'), 180),
      'View post',
      '/(tabs)/discover',
      NEW.post_id::text,
      jsonb_build_object('post_id', NEW.post_id, 'reply_id', NEW.id, 'actor_id', NEW.author_id)
    );
  END IF;

  IF v_parent_author IS NOT NULL
     AND v_parent_author <> NEW.author_id
     AND v_parent_author IS DISTINCT FROM v_post_owner THEN
    PERFORM public.create_in_app_notification(
      v_parent_author,
      'reply',
      v_name || ' replied to your comment',
      LEFT(COALESCE(NEW.content, 'See their reply.'), 180),
      'View post',
      '/(tabs)/discover',
      NEW.post_id::text,
      jsonb_build_object('post_id', NEW.post_id, 'reply_id', NEW.id, 'actor_id', NEW.author_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_post_reply_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient uuid;
  v_post_id uuid;
  v_name text;
BEGIN
  SELECT r.author_id, r.post_id INTO v_recipient, v_post_id
  FROM public.post_replies r
  WHERE r.id = NEW.reply_id;

  IF v_recipient IS NULL OR v_recipient = NEW.user_id THEN
    RETURN NEW;
  END IF;

  v_name := public.notification_actor_name(NEW.user_id);
  PERFORM public.create_in_app_notification(
    v_recipient,
    'reaction',
    v_name || ' liked your reply',
    'Someone liked your conversation on AfuChat.',
    'View post',
    '/(tabs)/discover',
    v_post_id::text,
    jsonb_build_object('post_id', v_post_id, 'reply_id', NEW.reply_id, 'actor_id', NEW.user_id)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_story_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient uuid;
  v_name text;
BEGIN
  SELECT user_id INTO v_recipient
  FROM public.stories
  WHERE id = NEW.story_id;

  IF v_recipient IS NULL OR v_recipient = NEW.user_id THEN
    RETURN NEW;
  END IF;

  v_name := public.notification_actor_name(NEW.user_id);
  PERFORM public.create_in_app_notification(
    v_recipient,
    'like',
    v_name || ' liked your story',
    'See who reacted to your story.',
    'View story',
    '/(tabs)/discover',
    NEW.story_id::text,
    jsonb_build_object('story_id', NEW.story_id, 'actor_id', NEW.user_id)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_music_short_interaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient uuid;
  v_short_id uuid;
  v_name text;
  v_kind text;
  v_title text;
  v_body text;
BEGIN
  v_short_id := NEW.short_id;
  SELECT user_id INTO v_recipient
  FROM public.music_shorts
  WHERE id = v_short_id;

  IF v_recipient IS NULL OR v_recipient = NEW.user_id THEN
    RETURN NEW;
  END IF;

  v_name := public.notification_actor_name(NEW.user_id);
  IF TG_TABLE_NAME = 'music_short_likes' THEN
    v_kind := 'like';
    v_title := v_name || ' liked your music short';
    v_body := 'See who reacted to your music short.';
  ELSE
    v_kind := 'comment';
    v_title := v_name || ' commented on your music short';
    v_body := LEFT(COALESCE(NEW.content, 'See their comment.'), 180);
  END IF;

  PERFORM public.create_in_app_notification(
    v_recipient,
    v_kind,
    v_title,
    v_body,
    'View short',
    '/(tabs)/shorts',
    v_short_id::text,
    jsonb_build_object('short_id', v_short_id, 'actor_id', NEW.user_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS message_reactions_create_notification ON public.message_reactions;
CREATE TRIGGER message_reactions_create_notification
AFTER INSERT ON public.message_reactions
FOR EACH ROW EXECUTE FUNCTION public.notify_message_reaction();

DROP TRIGGER IF EXISTS post_replies_create_notification ON public.post_replies;
CREATE TRIGGER post_replies_create_notification
AFTER INSERT ON public.post_replies
FOR EACH ROW EXECUTE FUNCTION public.notify_post_reply();

DROP TRIGGER IF EXISTS post_reply_likes_create_notification ON public.post_reply_likes;
CREATE TRIGGER post_reply_likes_create_notification
AFTER INSERT ON public.post_reply_likes
FOR EACH ROW EXECUTE FUNCTION public.notify_post_reply_like();

DROP TRIGGER IF EXISTS story_likes_create_notification ON public.story_likes;
CREATE TRIGGER story_likes_create_notification
AFTER INSERT ON public.story_likes
FOR EACH ROW EXECUTE FUNCTION public.notify_story_like();

DROP TRIGGER IF EXISTS music_short_likes_create_notification ON public.music_short_likes;
CREATE TRIGGER music_short_likes_create_notification
AFTER INSERT ON public.music_short_likes
FOR EACH ROW EXECUTE FUNCTION public.notify_music_short_interaction();

DROP TRIGGER IF EXISTS music_short_comments_create_notification ON public.music_short_comments;
CREATE TRIGGER music_short_comments_create_notification
AFTER INSERT ON public.music_short_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_music_short_interaction();