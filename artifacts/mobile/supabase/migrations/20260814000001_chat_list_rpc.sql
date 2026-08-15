-- Chat list performance RPC
--
-- Apply this migration manually in the Supabase Dashboard SQL Editor.
-- Replit cannot reach the Supabase Postgres port directly.
--
-- The function intentionally returns both normal chats and subscribed channel
-- broadcasts in one request. It is SECURITY DEFINER, but every branch is
-- restricted to auth.uid() ownership/membership before reading chat data.

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
      FROM public.chat_members my_membership
      WHERE my_membership.chat_id = c.id
        AND my_membership.user_id = v_user_id
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
        FROM public.message_status latest_status
        WHERE latest_status.message_id = latest_message.id
          AND latest_status.user_id <> v_user_id
          AND latest_status.read_at IS NOT NULL
      ) THEN 'read'
      WHEN EXISTS (
        SELECT 1
        FROM public.message_status latest_status
        WHERE latest_status.message_id = latest_message.id
          AND latest_status.user_id <> v_user_id
          AND latest_status.delivered_at IS NOT NULL
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
    FROM public.chat_members other_membership
    JOIN public.profiles p ON p.id = other_membership.user_id
    WHERE other_membership.chat_id = c.id
      AND other_membership.user_id <> v_user_id
    ORDER BY other_membership.user_id
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

REVOKE ALL ON FUNCTION public.get_chat_list(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_list(uuid[]) TO authenticated;

-- @afuchat follows normal user-controlled pin behavior; remove the old
-- default pin once when this migration is applied.
UPDATE public.chats
SET is_pinned = false
WHERE lower(trim(both '@' from COALESCE(name, ''))) = 'afuchat'
  AND is_pinned = true;

CREATE INDEX IF NOT EXISTS chat_members_user_chat_idx
  ON public.chat_members (user_id, chat_id);

CREATE INDEX IF NOT EXISTS messages_chat_sent_at_idx
  ON public.messages (chat_id, sent_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS message_status_message_user_idx
  ON public.message_status (message_id, user_id);

CREATE INDEX IF NOT EXISTS chat_mutes_user_chat_idx
  ON public.chat_mutes (user_id, chat_id);

CREATE INDEX IF NOT EXISTS channel_subscriptions_user_channel_idx
  ON public.channel_subscriptions (user_id, channel_id);

CREATE INDEX IF NOT EXISTS posts_channel_created_at_idx
  ON public.posts (channel_id, created_at DESC, id DESC);