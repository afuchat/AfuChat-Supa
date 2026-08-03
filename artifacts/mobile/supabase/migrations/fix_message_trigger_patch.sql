-- PATCH: Fix push_on_message_insert trigger
-- The original migration referenced NEW.message_type which does not exist
-- in the messages table (AfuChat uses encrypted_content instead).
-- Run this in: Supabase Dashboard → SQL Editor

CREATE OR REPLACE FUNCTION _private.push_on_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- messages table uses encrypted_content (no message_type column).
  -- Skip if there is no content to notify about.
  IF NEW.encrypted_content IS NULL AND NEW.attachment_url IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM _private.call_push_trigger(
    jsonb_build_object(
      'type',       'INSERT',
      'table',      'messages',
      'schema',     'public',
      'record',     to_jsonb(NEW),
      'old_record', NULL
    )
  );
  RETURN NEW;
END;
$$;
