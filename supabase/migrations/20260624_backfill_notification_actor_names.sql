-- ─────────────────────────────────────────────────────────────────────────────
-- AfuChat – Backfill actor_name / actor_handle / actor_avatar on notifications
-- Fixes "Someone" appearing instead of real usernames in the Notifications chat.
-- Run in: Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. ── Backfill all existing rows that have actor_id but no actor_name ────────
UPDATE notifications n
SET
  actor_name   = COALESCE(p.display_name, p.handle),
  actor_handle = p.handle,
  actor_avatar = p.avatar_url
FROM profiles p
WHERE n.actor_id = p.id
  AND n.actor_id IS NOT NULL
  AND (n.actor_name IS NULL OR n.actor_name = '');

-- 2. ── Fix handle_new_follower: populate actor fields on insert ───────────────
CREATE OR REPLACE FUNCTION public.handle_new_follower()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_name   text;
  v_actor_handle text;
  v_actor_avatar text;
BEGIN
  SELECT
    COALESCE(display_name, handle),
    handle,
    avatar_url
  INTO v_actor_name, v_actor_handle, v_actor_avatar
  FROM profiles
  WHERE id = NEW.follower_id;

  INSERT INTO public.notifications (user_id, actor_id, type, actor_name, actor_handle, actor_avatar)
  VALUES (
    NEW.following_id,
    NEW.follower_id,
    'new_follower',
    v_actor_name,
    v_actor_handle,
    v_actor_avatar
  );
  RETURN NEW;
END;
$$;

-- 3. ── Fix handle_new_acknowledgment (likes): populate actor fields ───────────
CREATE OR REPLACE FUNCTION public.handle_new_acknowledgment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  post_author_id uuid;
  v_actor_name   text;
  v_actor_handle text;
  v_actor_avatar text;
BEGIN
  SELECT p.author_id INTO post_author_id
  FROM public.posts p
  WHERE p.id = NEW.post_id;

  IF NEW.user_id <> post_author_id THEN
    SELECT
      COALESCE(display_name, handle),
      handle,
      avatar_url
    INTO v_actor_name, v_actor_handle, v_actor_avatar
    FROM profiles
    WHERE id = NEW.user_id;

    INSERT INTO public.notifications (user_id, actor_id, type, post_id, actor_name, actor_handle, actor_avatar)
    VALUES (
      post_author_id,
      NEW.user_id,
      'new_like',
      NEW.post_id,
      v_actor_name,
      v_actor_handle,
      v_actor_avatar
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 4. ── Fix handle_new_reply: populate actor fields ────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  post_author_id uuid;
  v_actor_name   text;
  v_actor_handle text;
  v_actor_avatar text;
BEGIN
  SELECT p.author_id INTO post_author_id
  FROM public.posts p
  WHERE p.id = NEW.post_id;

  IF NEW.author_id <> post_author_id THEN
    SELECT
      COALESCE(display_name, handle),
      handle,
      avatar_url
    INTO v_actor_name, v_actor_handle, v_actor_avatar
    FROM profiles
    WHERE id = NEW.author_id;

    INSERT INTO public.notifications (user_id, actor_id, type, post_id, actor_name, actor_handle, actor_avatar)
    VALUES (
      post_author_id,
      NEW.author_id,
      'new_reply',
      NEW.post_id,
      v_actor_name,
      v_actor_handle,
      v_actor_avatar
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 5. ── Helper: resolve actor name/handle/avatar in one reusable query ─────────
-- Used by RPC functions (send_tip, send_gift_combo, purchase_marketplace_gift)
-- to ensure they also populate actor fields going forward.
-- (Those functions have been updated in the same migration run.)
