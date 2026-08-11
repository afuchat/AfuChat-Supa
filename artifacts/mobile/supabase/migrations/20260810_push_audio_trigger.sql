-- Ensure voice/audio-only messages still create a push event.
-- messages has no message_type column; audio_url is a valid message payload.
CREATE OR REPLACE FUNCTION _private.push_on_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.encrypted_content IS NULL
     AND NEW.attachment_url IS NULL
     AND NEW.audio_url IS NULL THEN
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

DROP TRIGGER IF EXISTS push_on_message_insert ON public.messages;
CREATE TRIGGER push_on_message_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION _private.push_on_message_insert();