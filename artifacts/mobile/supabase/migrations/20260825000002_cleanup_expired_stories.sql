-- Remove expired stories and their uploaded media automatically.
-- Stories are intentionally retained for only 24 hours by the client, but
-- client-side filtering must not be the sole data-retention control.

CREATE OR REPLACE FUNCTION public.cleanup_expired_stories()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  deleted_count integer;
BEGIN
  WITH expired AS MATERIALIZED (
    SELECT
      id,
      substring(media_url FROM '/stories/(.*)$') AS object_name
    FROM public.stories
    WHERE expires_at IS NOT NULL
      AND expires_at <= now()
  ),
  deleted_stories AS (
    DELETE FROM public.stories AS s
    USING expired AS e
    WHERE s.id = e.id
    RETURNING s.id
  ),
  deleted_objects AS (
    DELETE FROM storage.objects AS o
    USING expired AS e
    WHERE o.bucket_id = 'stories'
      AND e.object_name IS NOT NULL
      AND o.name = e.object_name
    RETURNING o.id
  )
  SELECT count(*) INTO deleted_count FROM deleted_stories;

  RETURN COALESCE(deleted_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_stories() FROM PUBLIC;

-- Run frequently enough that an expired story does not remain available for
-- more than a short cleanup window after its 24-hour lifetime.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $cleanup_job$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid
    INTO existing_job_id
    FROM cron.job
   WHERE jobname = 'cleanup-expired-stories';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'cleanup-expired-stories',
    '*/15 * * * *',
    'SELECT public.cleanup_expired_stories();'
  );
END;
$cleanup_job$;