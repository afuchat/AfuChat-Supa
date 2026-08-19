-- Prevent orphan direct chats from surfacing as "Unknown" and make direct-chat
-- creation safe when two requests arrive at the same time.

CREATE OR REPLACE FUNCTION public.get_or_create_direct_chat(other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_id uuid;
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL OR other_user_id IS NULL OR other_user_id = v_me THEN
    RAISE EXCEPTION 'Invalid direct chat participants';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      LEAST(v_me::text, other_user_id::text) || ':' ||
      GREATEST(v_me::text, other_user_id::text),
      0
    )
  );

  SELECT c.id
  INTO v_chat_id
  FROM public.chats c
  JOIN public.chat_members mine
    ON mine.chat_id = c.id
   AND mine.user_id = v_me
  JOIN public.chat_members other
    ON other.chat_id = c.id
   AND other.user_id = other_user_id
  WHERE COALESCE(c.is_group, false) = false
    AND COALESCE(c.is_channel, false) = false
  ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC NULLS LAST, c.id
  LIMIT 1;

  IF v_chat_id IS NULL THEN
    INSERT INTO public.chats (is_group, is_channel, created_by)
    VALUES (false, false, v_me)
    RETURNING id INTO v_chat_id;

    INSERT INTO public.chat_members (chat_id, user_id)
    VALUES (v_chat_id, v_me), (v_chat_id, other_user_id);
  END IF;

  RETURN v_chat_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_chat_list(
  p_unread_excluded_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS TABLE (
  chat_id text,
  kind text,
  channel_id uuid,
  chat_name text,
  is_group boolean,
  is_channel boolean,
  is_pinned boolean,
  is_archived boolean,
  avatar_url text,
  chat_updated_at timestamptz,
  other_id uuid,
  other_display_name text,
  other_avatar text,
  is_verified boolean,
  is_organization_verified boolean,
  other_last_seen timestamptz,
  other_show_online boolean,
  last_message text,
  last_message_at timestamptz,
  last_message_attachment_type text,
  last_message_is_mine boolean,
  last_message_status text,
  unread_count bigint,
  is_muted boolean,
  muted_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH member_chats AS (
    SELECT c.*
    FROM public.chats c
    WHERE EXISTS (
      SELECT 1
      FROM public.chat_members membership
      WHERE membership.chat_id = c.id
        AND membership.user_id = v_user_id
    )
  )
  SELECT
    c.id::text,
    NULL::text,
    NULL::uuid,
    c.name::text,
    COALESCE(c.is_group, false),
    COALESCE(c.is_channel, false),
    COALESCE(c.is_pinned, false),
    COALESCE(c.is_archived, false),
    c.avatar_url::text,
    c.updated_at,
    other_member.id,
    other_member.display_name::text,
    other_member.avatar_url::text,
    COALESCE(other_member.is_verified, false),
    COALESCE(other_member.is_organization_verified, false),
    other_member.last_seen,
    COALESCE(other_member.show_online_status, true),
    latest_message.encrypted_content::text,
    latest_message.sent_at,
    latest_message.attachment_type::text,
    COALESCE(latest_message.sender_id = v_user_id, false),
    CASE
      WHEN latest_message.sender_id IS NULL OR latest_message.sender_id <> v_user_id THEN 'sent'
      WHEN EXISTS (
        SELECT 1
        FROM public.message_status status
        WHERE status.message_id = latest_message.id
          AND status.user_id <> v_user_id
          AND status.read_at IS NOT NULL
      ) THEN 'read'
      WHEN EXISTS (
        SELECT 1
        FROM public.message_status status
        WHERE status.message_id = latest_message.id
          AND status.user_id <> v_user_id
          AND status.delivered_at IS NOT NULL
      ) THEN 'delivered'
      ELSE 'sent'
    END::text,
    CASE
      WHEN c.id = ANY(COALESCE(p_unread_excluded_ids, '{}'::uuid[])) THEN 0
      ELSE (
        SELECT COUNT(*)::bigint
        FROM public.messages unread_message
        WHERE unread_message.chat_id = c.id
          AND unread_message.sender_id <> v_user_id
          AND NOT EXISTS (
            SELECT 1
            FROM public.message_status unread_status
            WHERE unread_status.message_id = unread_message.id
              AND unread_status.user_id = v_user_id
              AND unread_status.read_at IS NOT NULL
          )
      )
    END,
    (chat_mute.chat_id IS NOT NULL),
    chat_mute.muted_until
  FROM member_chats c
  LEFT JOIN LATERAL (
    SELECT
      p.id,
      p.display_name,
      p.avatar_url,
      p.is_verified,
      p.is_organization_verified,
      p.last_seen,
      p.show_online_status
    FROM public.chat_members membership
    JOIN public.profiles p ON p.id = membership.user_id
    WHERE membership.chat_id = c.id
      AND membership.user_id <> v_user_id
    ORDER BY membership.user_id
    LIMIT 1
  ) other_member ON true
  LEFT JOIN LATERAL (
    SELECT
      m.id,
      m.encrypted_content,
      m.sent_at,
      m.attachment_type,
      m.sender_id
    FROM public.messages m
    WHERE m.chat_id = c.id
    ORDER BY m.sent_at DESC, m.id DESC
    LIMIT 1
  ) latest_message ON true
  LEFT JOIN public.chat_mutes chat_mute
    ON chat_mute.chat_id = c.id
   AND chat_mute.user_id = v_user_id
  WHERE (COALESCE(c.is_group, false) OR COALESCE(c.is_channel, false) OR other_member.id IS NOT NULL)

  UNION ALL

  SELECT
    ('channel_broadcast:' || subscribed_channel.id::text),
    'channel_broadcast'::text,
    subscribed_channel.id,
    subscribed_channel.name::text,
    false,
    true,
    false,
    false,
    subscribed_channel.avatar_url::text,
    channel_post.created_at,
    NULL::uuid,
    subscribed_channel.name::text,
    NULL::text,
    COALESCE(subscribed_channel.is_verified, false),
    false,
    NULL::timestamptz,
    false,
    channel_post.content::text,
    channel_post.created_at,
    NULL::text,
    false,
    'sent'::text,
    0::bigint,
    false,
    NULL::timestamptz
  FROM public.channel_subscriptions subscription
  JOIN public.channels subscribed_channel
    ON subscribed_channel.id = subscription.channel_id
  LEFT JOIN LATERAL (
    SELECT p.content, p.created_at
    FROM public.posts p
    WHERE p.channel_id = subscribed_channel.id
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT 1
  ) channel_post ON true
  WHERE subscription.user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_direct_chat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_chat(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_chat_list(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_list(uuid[]) TO authenticated;