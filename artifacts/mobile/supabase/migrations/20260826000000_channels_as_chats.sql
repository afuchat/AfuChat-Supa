-- Make channels first-class chat conversations.
--
-- Channels historically lived in `channels` + `posts` and were rendered by a
-- separate broadcast screen. A channel now has a matching `chats` row using
-- the same UUID, so it can use the normal chat list, message pipeline, cache,
-- realtime subscription, and chat room UI.
--
-- Apply this migration manually in the Supabase Dashboard SQL Editor.

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS handle text;

-- Existing public channels need a stable public identity before the
-- requirement below is added. The suffix keeps generated names unique.
UPDATE public.channels
SET handle = left(
  trim(both '_' from regexp_replace(
    lower(coalesce(nullif(trim(name), ''), 'channel')),
    '[^a-z0-9_]+',
    '_',
    'g'
  )),
  20
) || '_' || left(id::text, 6)
WHERE is_public = true
  AND nullif(trim(handle), '') IS NULL;

UPDATE public.channels
SET handle = 'channel_' || left(id::text, 6)
WHERE is_public = true
  AND nullif(trim(handle), '') IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS channels_handle_lower_uidx
  ON public.channels (lower(trim(handle)))
  WHERE nullif(trim(handle), '') IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'channels'
      AND constraint_name = 'channels_public_handle_required'
  ) THEN
    ALTER TABLE public.channels
      ADD CONSTRAINT channels_public_handle_required
      CHECK (is_public = false OR nullif(trim(handle), '') IS NOT NULL);
  END IF;
END;
$$;

-- Use the channel UUID as the chat UUID. This makes old channel links
-- compatible with the new chat room without a second ID lookup.
INSERT INTO public.chats (
  id,
  name,
  description,
  avatar_url,
  is_group,
  is_channel,
  is_public,
  created_by,
  user_id
)
SELECT
  c.id,
  c.name,
  c.description,
  c.avatar_url,
  false,
  true,
  coalesce(c.is_public, true),
  c.owner_id,
  c.owner_id
FROM public.channels c
WHERE NOT EXISTS (
  SELECT 1 FROM public.chats existing WHERE existing.id = c.id
);

-- The owner is the channel's administrator and every existing subscriber is
-- a normal chat member. This is what makes channels appear in get_chat_list.
INSERT INTO public.chat_members (chat_id, user_id, is_admin)
SELECT c.id, c.owner_id, true
FROM public.channels c
WHERE c.owner_id IS NOT NULL
ON CONFLICT (chat_id, user_id) DO UPDATE SET is_admin = true;

INSERT INTO public.chat_members (chat_id, user_id, is_admin)
SELECT s.channel_id, s.user_id, false
FROM public.channel_subscriptions s
JOIN public.chats c ON c.id = s.channel_id AND c.is_channel = true
ON CONFLICT (chat_id, user_id) DO NOTHING;

-- Preserve existing text broadcasts in the normal message timeline. Media
-- posts remain available in the legacy posts table, while new broadcasts use
-- the full chat attachment pipeline.
INSERT INTO public.messages (chat_id, sender_id, encrypted_content, sent_at)
SELECT
  p.channel_id,
  p.author_id,
  coalesce(p.content, ''),
  p.created_at
FROM public.posts p
JOIN public.chats c ON c.id = p.channel_id AND c.is_channel = true
JOIN public.profiles author ON author.id = p.author_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.messages existing
  WHERE existing.chat_id = p.channel_id
    AND existing.sender_id = p.author_id
    AND existing.sent_at = p.created_at
    AND existing.encrypted_content = coalesce(p.content, '')
);

-- Keep the legacy subscription table in sync for discovery and keep the
-- canonical chat membership table in sync for the chat list and room.
CREATE OR REPLACE FUNCTION public.sync_channel_subscription_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.chat_members (chat_id, user_id, is_admin)
    SELECT NEW.channel_id, NEW.user_id, false
    WHERE EXISTS (
      SELECT 1 FROM public.chats
      WHERE id = NEW.channel_id AND is_channel = true
    )
    ON CONFLICT (chat_id, user_id) DO NOTHING;
    RETURN NEW;
  END IF;

  DELETE FROM public.chat_members
  WHERE chat_id = OLD.channel_id
    AND user_id = OLD.user_id
    AND coalesce(is_admin, false) = false;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS channel_subscription_chat_member_sync
  ON public.channel_subscriptions;

CREATE TRIGGER channel_subscription_chat_member_sync
AFTER INSERT OR DELETE ON public.channel_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.sync_channel_subscription_member();

-- The chat list is now a single query over chat membership. The old
-- channel_broadcast UNION created a different kind of list row and sent users
-- to a separate room UI.
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
    coalesce(c.is_group, false),
    coalesce(c.is_channel, false),
    coalesce(c.is_pinned, false),
    coalesce(c.is_archived, false),
    c.avatar_url::text,
    c.updated_at,
    other_member.id,
    other_member.display_name::text,
    other_member.avatar_url::text,
    coalesce(other_member.is_verified, false),
    coalesce(other_member.is_organization_verified, false),
    other_member.last_seen,
    coalesce(other_member.show_online_status, true),
    latest_message.encrypted_content::text,
    latest_message.sent_at,
    latest_message.attachment_type::text,
    coalesce(latest_message.sender_id = v_user_id, false),
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
      WHEN c.id = ANY(coalesce(p_unread_excluded_ids, '{}'::uuid[])) THEN 0
      ELSE (
        SELECT count(*)::bigint
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
   AND chat_mute.user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_chat_list(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_list(uuid[]) TO authenticated;

CREATE INDEX IF NOT EXISTS chat_members_user_chat_idx
  ON public.chat_members (user_id, chat_id);

CREATE INDEX IF NOT EXISTS messages_chat_sent_at_idx
  ON public.messages (chat_id, sent_at DESC, id DESC);