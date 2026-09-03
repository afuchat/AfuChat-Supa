-- Keep channel ownership and membership private.
--
-- Public channel metadata remains readable, but creator identity and the
-- subscriber/admin roster are only available to channel owners/admins.
-- Apply this migration in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.is_channel_owner_or_admin(
  p_chat_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chats c
    WHERE c.id = p_chat_id
      AND c.is_channel = true
      AND (
        c.created_by = p_user_id
        OR EXISTS (
          SELECT 1
          FROM public.chat_members cm
          WHERE cm.chat_id = c.id
            AND cm.user_id = p_user_id
            AND cm.is_admin = true
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_channel_access_context(p_channel_id uuid)
RETURNS TABLE (
  is_owner boolean,
  is_admin boolean,
  can_view_members boolean,
  owner_id uuid,
  subscriber_count integer,
  admin_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.created_by = auth.uid(),
    EXISTS (
      SELECT 1
      FROM public.chat_members cm
      WHERE cm.chat_id = c.id
        AND cm.user_id = auth.uid()
        AND cm.is_admin = true
    ),
    public.is_channel_owner_or_admin(c.id, auth.uid()),
    CASE WHEN c.created_by = auth.uid() THEN c.created_by ELSE NULL END,
    (
      SELECT count(*)::integer
      FROM public.channel_subscriptions cs
      WHERE cs.channel_id = c.id
    ),
    (
      SELECT count(*)::integer
      FROM public.chat_members cm
      WHERE cm.chat_id = c.id
        AND cm.is_admin = true
    )
  FROM public.chats c
  WHERE c.id = p_channel_id
    AND c.is_channel = true
    AND auth.uid() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.count_my_channels()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM public.channels
  WHERE owner_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_channels()
RETURNS TABLE (
  id uuid,
  name text,
  avatar_url text,
  is_verified boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.avatar_url, coalesce(c.is_verified, false)
  FROM public.channels c
  WHERE c.owner_id = auth.uid()
  ORDER BY c.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.count_my_groups()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM public.chats
  WHERE created_by = auth.uid()
    AND is_group = true
    AND coalesce(is_channel, false) = false;
$$;

REVOKE ALL ON FUNCTION public.is_channel_owner_or_admin(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_channel_access_context(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_my_channels() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_channels() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_my_groups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_channel_owner_or_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_channel_access_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_my_channels() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_channels() TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_my_groups() TO authenticated;

-- Column-level privileges are granted explicitly because a table-level SELECT
-- grant would otherwise still permit a caller to request these identifiers.
DO $$
DECLARE
  channel_columns text;
  chat_columns text;
BEGIN
  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO channel_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'channels'
    AND column_name <> 'owner_id';

  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO chat_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'chats'
    AND column_name <> 'created_by';

  REVOKE SELECT ON public.channels FROM PUBLIC, anon, authenticated;
  REVOKE SELECT ON public.chats FROM PUBLIC, anon, authenticated;
  EXECUTE format('GRANT SELECT (%s) ON public.channels TO authenticated', channel_columns);
  EXECUTE format('GRANT SELECT (%s) ON public.chats TO authenticated', chat_columns);
END;
$$;

-- Replace permissive legacy member policies so a subscriber cannot enumerate
-- channel subscribers or administrators. Groups retain their old behavior.
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chat_members'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.chat_members', p.policyname);
  END LOOP;

  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'channel_subscriptions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.channel_subscriptions', p.policyname);
  END LOOP;
END;
$$;

ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_members_select_privacy"
  ON public.chat_members FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.chats c
        WHERE c.id = chat_members.chat_id AND c.is_channel = true
      )
      OR chat_members.user_id = auth.uid()
      OR public.is_channel_owner_or_admin(chat_members.chat_id, auth.uid())
    )
  );

CREATE POLICY "chat_members_insert_self_or_manager"
  ON public.chat_members FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR public.is_channel_owner_or_admin(chat_id, auth.uid())
  );

CREATE POLICY "chat_members_update_manager"
  ON public.chat_members FOR UPDATE
  USING (public.is_channel_owner_or_admin(chat_id, auth.uid()))
  WITH CHECK (public.is_channel_owner_or_admin(chat_id, auth.uid()));

CREATE POLICY "chat_members_delete_self_or_manager"
  ON public.chat_members FOR DELETE
  USING (
    auth.uid() = user_id
    OR public.is_channel_owner_or_admin(chat_id, auth.uid())
  );

ALTER TABLE public.channel_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "channel_subscriptions_select_privacy"
  ON public.channel_subscriptions FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_channel_owner_or_admin(channel_id, auth.uid())
  );

CREATE POLICY "channel_subscriptions_insert_self_or_manager"
  ON public.channel_subscriptions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR public.is_channel_owner_or_admin(channel_id, auth.uid())
  );

CREATE POLICY "channel_subscriptions_update_self_or_manager"
  ON public.channel_subscriptions FOR UPDATE
  USING (
    auth.uid() = user_id
    OR public.is_channel_owner_or_admin(channel_id, auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.is_channel_owner_or_admin(channel_id, auth.uid())
  );

CREATE POLICY "channel_subscriptions_delete_self_or_manager"
  ON public.channel_subscriptions FOR DELETE
  USING (
    auth.uid() = user_id
    OR public.is_channel_owner_or_admin(channel_id, auth.uid())
  );

-- get_chat_list is SECURITY DEFINER, so redact channel ownership and the
-- "other member" fields before they reach a subscriber.
CREATE OR REPLACE FUNCTION public.get_chat_list(
  p_unread_excluded_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS TABLE (
  chat_id text,
  kind text,
  channel_id uuid,
  chat_name text,
  created_by uuid,
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
    CASE
      WHEN c.is_channel AND c.created_by = v_user_id THEN c.created_by
      WHEN c.is_channel THEN NULL
      ELSE c.created_by
    END,
    coalesce(c.is_group, false),
    coalesce(c.is_channel, false),
    coalesce(c.is_pinned, false),
    coalesce(c.is_archived, false),
    c.avatar_url::text,
    c.updated_at,
    CASE WHEN c.is_channel THEN NULL ELSE other_member.id END,
    CASE WHEN c.is_channel THEN NULL ELSE other_member.display_name::text END,
    CASE WHEN c.is_channel THEN NULL ELSE other_member.avatar_url::text END,
    CASE WHEN c.is_channel THEN false ELSE coalesce(other_member.is_verified, false) END,
    CASE WHEN c.is_channel THEN false ELSE coalesce(other_member.is_organization_verified, false) END,
    CASE WHEN c.is_channel THEN NULL ELSE other_member.last_seen END,
    CASE WHEN c.is_channel THEN false ELSE coalesce(other_member.show_online, true) END,
    latest_message.encrypted_content::text,
    latest_message.sent_at,
    latest_message.attachment_type::text,
    coalesce(latest_message.sender_id = v_user_id, false),
    CASE
      WHEN latest_message.sender_id IS NULL OR latest_message.sender_id <> v_user_id THEN 'sent'
      WHEN EXISTS (
        SELECT 1 FROM public.message_status latest_status
        WHERE latest_status.message_id = latest_message.id
          AND latest_status.user_id <> v_user_id
          AND latest_status.read_at IS NOT NULL
      ) THEN 'read'
      WHEN EXISTS (
        SELECT 1 FROM public.message_status latest_status
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
            SELECT 1 FROM public.message_status unread_status
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
      p.show_online_status AS show_online
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