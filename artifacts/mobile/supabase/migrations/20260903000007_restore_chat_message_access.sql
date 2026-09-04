-- Restore authenticated chat access after the channel privacy column grants.
--
-- The channel privacy migration intentionally withholds chats.created_by from
-- authenticated table reads. Older chats/messages policies still referenced
-- that column as the invoker, which makes PostgREST message reads fail with
-- "permission denied for table chats". Keep creator data private and evaluate
-- ownership/membership inside security-definer helpers instead.
--
-- Apply this migration manually in the Supabase Dashboard SQL Editor.

CREATE OR REPLACE FUNCTION public.is_chat_participant(
  p_chat_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.chat_members cm
        WHERE cm.chat_id = p_chat_id
          AND cm.user_id = p_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.chats c
        WHERE c.id = p_chat_id
          AND (c.created_by = p_user_id OR c.user_id = p_user_id)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.is_chat_owner(
  p_chat_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.chats c
      WHERE c.id = p_chat_id
        AND (c.created_by = p_user_id OR c.user_id = p_user_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.can_send_chat_message(
  p_chat_id uuid,
  p_sender_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_members cm
    JOIN public.chats c ON c.id = cm.chat_id
    WHERE cm.chat_id = p_chat_id
      AND cm.user_id = p_sender_id
      AND (
        (
          NOT COALESCE(c.is_group, false)
          AND NOT COALESCE(c.is_channel, false)
        )
        OR (
          COALESCE(c.is_channel, false)
          AND COALESCE(cm.is_admin, false)
        )
        OR (
          COALESCE(c.is_group, false)
          AND (
            c.who_can_send = 'everyone'
            OR COALESCE(cm.is_admin, false)
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_chat_participant(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_chat_owner(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_send_chat_message(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_chat_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_chat_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_send_chat_message(uuid, uuid) TO authenticated;

-- Replace the old chats policies that read chats.created_by as the caller.
DROP POLICY IF EXISTS "Anyone can view public groups and channels" ON public.chats;
DROP POLICY IF EXISTS "Members can view chats" ON public.chats;
DROP POLICY IF EXISTS "Members can view their chats" ON public.chats;
DROP POLICY IF EXISTS "Users can view own chats" ON public.chats;
CREATE POLICY "chats_select_public_or_member"
  ON public.chats
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(is_group, false)
    OR COALESCE(is_channel, false)
    OR public.is_chat_participant(id, auth.uid())
  );

-- Keep owner-only chat management without exposing created_by to invoker
-- policy evaluation. The existing insert policies remain permissive and are
-- normalized below.
DROP POLICY IF EXISTS "Users can manage own chats" ON public.chats;
CREATE POLICY "chats_manage_owner"
  ON public.chats
  FOR ALL
  TO authenticated
  USING (public.is_chat_owner(id, auth.uid()))
  WITH CHECK (public.is_chat_owner(id, auth.uid()));

DROP POLICY IF EXISTS "Allow users to create 1-on-1 chats" ON public.chats;
DROP POLICY IF EXISTS "Authenticated users can create chats" ON public.chats;
DROP POLICY IF EXISTS "Users can create own chats" ON public.chats;
DROP POLICY IF EXISTS "allow_authenticated_insert_if_creator" ON public.chats;
CREATE POLICY "chats_insert_creator"
  ON public.chats
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- All message authorization now uses the security-definer helpers. This
-- prevents the hidden chats.created_by column from being pulled into
-- invoker-level RLS evaluation and fixes both reads and inserts.
DROP POLICY IF EXISTS "View messages in member chats" ON public.messages;
DROP POLICY IF EXISTS "Users can manage own messages" ON public.messages;
DROP POLICY IF EXISTS "Members can send messages based on group settings" ON public.messages;
DROP POLICY IF EXISTS "Send own messages" ON public.messages;

CREATE POLICY "messages_select_member"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (public.is_chat_participant(chat_id, auth.uid()));

CREATE POLICY "messages_insert_member_sender"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.can_send_chat_message(chat_id, auth.uid())
  );
