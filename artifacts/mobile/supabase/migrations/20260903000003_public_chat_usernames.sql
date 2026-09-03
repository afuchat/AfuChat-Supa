-- Reserve public channel and group usernames across the whole platform.
--
-- A reservation is intentionally never deleted. This prevents a public
-- channel/group username from being recycled after its owner removes it.

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS handle text;

CREATE UNIQUE INDEX IF NOT EXISTS chats_handle_lower_uidx
  ON public.chats (lower(trim(handle)))
  WHERE nullif(trim(handle), '') IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.public_chat_usernames (
  username text PRIMARY KEY,
  chat_id uuid NOT NULL,
  created_by uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('channel', 'group')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.public_chat_usernames ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_chat_usernames FROM PUBLIC, anon, authenticated;

-- Preserve every existing public channel username before new reservations are
-- enforced. The channel table remains the source of display metadata.
INSERT INTO public.public_chat_usernames (username, chat_id, created_by, kind)
SELECT lower(trim(c.handle)), c.id, c.owner_id, 'channel'
FROM public.channels c
WHERE coalesce(c.is_public, false)
  AND nullif(trim(c.handle), '') IS NOT NULL
  AND c.owner_id IS NOT NULL
ON CONFLICT (username) DO NOTHING;

UPDATE public.chats chat
SET handle = channel.handle
FROM public.channels channel
WHERE chat.id = channel.id
  AND nullif(trim(channel.handle), '') IS NOT NULL
  AND nullif(trim(chat.handle), '') IS NULL;

CREATE OR REPLACE FUNCTION public.check_public_chat_username(p_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text := lower(trim(coalesce(p_username, '')));
BEGIN
  IF v_username !~ '^[a-z0-9_]{3,30}$' THEN
    RETURN jsonb_build_object('status', 'invalid_format');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(trim(coalesce(handle, ''))) = v_username
  ) OR EXISTS (
    SELECT 1 FROM public.owned_usernames
    WHERE lower(trim(coalesce(handle, ''))) = v_username
  ) OR EXISTS (
    SELECT 1 FROM public.public_chat_usernames
    WHERE username = v_username
  ) OR EXISTS (
    SELECT 1 FROM public.username_listings
    WHERE lower(trim(coalesce(username, ''))) = v_username
  ) THEN
    RETURN jsonb_build_object('status', 'taken');
  END IF;

  RETURN jsonb_build_object('status', 'available');
END;
$$;

REVOKE ALL ON FUNCTION public.check_public_chat_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_public_chat_username(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reserve_public_chat_username(
  p_username text,
  p_chat_id uuid,
  p_created_by uuid,
  p_kind text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text := lower(trim(coalesce(p_username, '')));
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_created_by THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF v_username !~ '^[a-z0-9_]{3,30}$' THEN
    RAISE EXCEPTION 'PUBLIC_CHAT_USERNAME_INVALID';
  END IF;

  -- Serialize all attempts for the same username so the cross-table checks
  -- and immutable reservation are atomic under concurrent creates.
  PERFORM pg_advisory_xact_lock(hashtext(v_username));

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(trim(coalesce(handle, ''))) = v_username
  ) OR EXISTS (
    SELECT 1 FROM public.owned_usernames
    WHERE lower(trim(coalesce(handle, ''))) = v_username
  ) OR EXISTS (
    SELECT 1 FROM public.public_chat_usernames
    WHERE username = v_username
  ) OR EXISTS (
    SELECT 1 FROM public.username_listings
    WHERE lower(trim(coalesce(username, ''))) = v_username
  ) THEN
    RAISE EXCEPTION 'PUBLIC_CHAT_USERNAME_TAKEN';
  END IF;

  INSERT INTO public.public_chat_usernames (username, chat_id, created_by, kind)
  VALUES (v_username, p_chat_id, p_created_by, p_kind);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_public_chat_username(text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_channel_chat(
  p_name text,
  p_description text DEFAULT NULL,
  p_handle text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_is_public boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_channel_id uuid := gen_random_uuid();
  v_name text := trim(coalesce(p_name, ''));
  v_handle text := nullif(
    regexp_replace(lower(trim(coalesce(p_handle, ''))), '[^a-z0-9_]', '', 'g'),
    ''
  );
  v_public boolean := coalesce(p_is_public, true);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'CHANNEL_NAME_REQUIRED';
  END IF;

  IF v_public AND v_handle IS NULL THEN
    RAISE EXCEPTION 'PUBLIC_CHANNEL_HANDLE_REQUIRED';
  END IF;

  IF v_handle IS NOT NULL AND char_length(v_handle) < 3 THEN
    RAISE EXCEPTION 'CHANNEL_HANDLE_TOO_SHORT';
  END IF;

  INSERT INTO public.channels (
    id, name, description, handle, avatar_url, owner_id, is_public, subscriber_count
  )
  VALUES (
    v_channel_id, v_name, nullif(trim(p_description), ''), v_handle,
    p_avatar_url, v_user_id, v_public, 1
  );

  INSERT INTO public.chats (
    id, name, description, handle, avatar_url, is_group, is_channel,
    is_private, who_can_send, created_by, user_id
  )
  VALUES (
    v_channel_id, v_name, nullif(trim(p_description), ''), v_handle,
    p_avatar_url, false, true, NOT v_public, 'admins', v_user_id, v_user_id
  );

  INSERT INTO public.chat_members (chat_id, user_id, is_admin)
  VALUES (v_channel_id, v_user_id, true);

  INSERT INTO public.channel_subscriptions (channel_id, user_id)
  VALUES (v_channel_id, v_user_id);

  IF v_handle IS NOT NULL THEN
    PERFORM public.reserve_public_chat_username(v_handle, v_channel_id, v_user_id, 'channel');
  END IF;

  RETURN v_channel_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'PUBLIC_CHAT_USERNAME_TAKEN';
END;
$$;

REVOKE ALL ON FUNCTION public.create_channel_chat(text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_channel_chat(text, text, text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_group_chat(
  p_name text,
  p_handle text,
  p_member_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_chat_id uuid := gen_random_uuid();
  v_name text := trim(coalesce(p_name, ''));
  v_handle text := lower(trim(coalesce(p_handle, '')));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'GROUP_NAME_REQUIRED';
  END IF;
  IF v_handle !~ '^[a-z0-9_]{3,30}$' THEN
    RAISE EXCEPTION 'PUBLIC_GROUP_USERNAME_INVALID';
  END IF;

  INSERT INTO public.chats (
    id, name, handle, is_group, is_channel, is_private, created_by, user_id
  )
  VALUES (
    v_chat_id, v_name, v_handle, true, false, false, v_user_id, v_user_id
  );

  INSERT INTO public.chat_members (chat_id, user_id, is_admin)
  SELECT v_chat_id, member_id, member_id = v_user_id
  FROM unnest(array_append(coalesce(p_member_ids, '{}'::uuid[]), v_user_id)) AS member_id
  JOIN public.follows f
    ON f.follower_id = v_user_id
   AND f.following_id = member_id
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  INSERT INTO public.chat_members (chat_id, user_id, is_admin)
  VALUES (v_chat_id, v_user_id, true)
  ON CONFLICT (chat_id, user_id) DO UPDATE SET is_admin = true;

  PERFORM public.reserve_public_chat_username(v_handle, v_chat_id, v_user_id, 'group');
  RETURN v_chat_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'PUBLIC_CHAT_USERNAME_TAKEN';
END;
$$;

REVOKE ALL ON FUNCTION public.create_group_chat(text, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_group_chat(text, text, uuid[]) TO authenticated;