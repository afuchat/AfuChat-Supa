-- video_watch_history — cross-device watch log
-- Apply this via the Supabase SQL editor (Dashboard → SQL Editor → New query).

CREATE TABLE IF NOT EXISTS video_watch_history (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id     uuid        NOT NULL,   -- soft-ref to posts; no FK so deleting a post keeps history
  watched_at  timestamptz NOT NULL DEFAULT now(),
  progress    float       NOT NULL DEFAULT 0,       -- 0–1 fraction watched
  watch_count integer     NOT NULL DEFAULT 1,
  title       text,
  thumbnail   text,
  video_url   text,
  CONSTRAINT video_watch_history_user_post UNIQUE (user_id, post_id)
);

-- Index: fast descending fetch per user
CREATE INDEX IF NOT EXISTS idx_vwh_user_watched
  ON video_watch_history (user_id, watched_at DESC);

-- RLS: users can only see and modify their own history
ALTER TABLE video_watch_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own watch history" ON video_watch_history;
CREATE POLICY "Users manage own watch history"
  ON video_watch_history FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── upsert_watch_history ──────────────────────────────────────────────────────
-- Atomically insert-or-update a watch event, incrementing watch_count on repeat
-- views. Called by the mobile client via supabase.rpc("upsert_watch_history").
-- Runs as SECURITY DEFINER so it can bypass RLS after verifying the caller.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_watch_history(
  p_user_id   uuid,
  p_post_id   uuid,
  p_watched_at timestamptz,
  p_progress  float,
  p_title     text,
  p_thumbnail text,
  p_video_url text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Guard: only allow callers to write their own rows
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  INSERT INTO video_watch_history
    (user_id, post_id, watched_at, progress, watch_count, title, thumbnail, video_url)
  VALUES
    (p_user_id, p_post_id, p_watched_at, p_progress, 1, p_title, p_thumbnail, p_video_url)
  ON CONFLICT (user_id, post_id) DO UPDATE SET
    watched_at  = EXCLUDED.watched_at,
    progress    = EXCLUDED.progress,
    watch_count = video_watch_history.watch_count + 1,
    title       = COALESCE(EXCLUDED.title,     video_watch_history.title),
    thumbnail   = COALESCE(EXCLUDED.thumbnail, video_watch_history.thumbnail),
    video_url   = COALESCE(EXCLUDED.video_url, video_watch_history.video_url);
END;
$$;
