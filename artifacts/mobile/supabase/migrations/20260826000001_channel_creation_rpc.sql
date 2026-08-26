-- Create a channel and its first-class chat identity atomically.
-- Apply after 20260826000000_channels_as_chats.sql.

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
    id,
    name,
    description,
    handle,
    avatar_url,
    owner_id,
    is_public,
    subscriber_count
  )
  VALUES (
    v_channel_id,
    v_name,
    nullif(trim(p_description), ''),
    v_handle,
    p_avatar_url,
    v_user_id,
    v_public,
    1
  );

  INSERT INTO public.chats (
    id,
    name,
    description,
    avatar_url,
    is_group,
    is_channel,
    is_private,
    who_can_send,
    created_by,
    user_id
  )
  VALUES (
    v_channel_id,
    v_name,
    nullif(trim(p_description), ''),
    p_avatar_url,
    false,
    true,
    NOT v_public,
    'admins',
    v_user_id,
    v_user_id
  );

  INSERT INTO public.chat_members (chat_id, user_id, is_admin)
  VALUES (v_channel_id, v_user_id, true);

  INSERT INTO public.channel_subscriptions (channel_id, user_id)
  VALUES (v_channel_id, v_user_id);

  RETURN v_channel_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'CHANNEL_HANDLE_TAKEN';
END;
$$;

REVOKE ALL ON FUNCTION public.create_channel_chat(text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_channel_chat(text, text, text, text, boolean) TO authenticated;