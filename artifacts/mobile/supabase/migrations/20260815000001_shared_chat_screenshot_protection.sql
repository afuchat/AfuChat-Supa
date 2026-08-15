-- Shared chat screenshot protection.
--
-- Apply this migration manually in the Supabase Dashboard SQL Editor.
-- Replit cannot reach the Supabase Postgres port directly.

ALTER TABLE public.chat_preferences
  ADD COLUMN IF NOT EXISTS screenshot_protection boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.chat_has_screenshot_protection(p_chat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_members member_row
    JOIN public.chat_preferences preference
      ON preference.user_id = member_row.user_id
    WHERE member_row.chat_id = p_chat_id
      AND preference.screenshot_protection IS TRUE
      AND EXISTS (
        SELECT 1
        FROM public.chat_members viewer
        WHERE viewer.chat_id = p_chat_id
          AND viewer.user_id = auth.uid()
      )
  );
$$;

REVOKE ALL ON FUNCTION public.chat_has_screenshot_protection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_has_screenshot_protection(uuid) TO authenticated;