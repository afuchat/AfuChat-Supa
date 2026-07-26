-- story_likes table
-- Tracks per-user likes on stories with realtime support.

CREATE TABLE IF NOT EXISTS story_likes (
  story_id   uuid NOT NULL REFERENCES stories(id)   ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, user_id)
);

CREATE INDEX IF NOT EXISTS story_likes_story_id_idx ON story_likes(story_id);
CREATE INDEX IF NOT EXISTS story_likes_user_id_idx  ON story_likes(user_id);

ALTER TABLE story_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY story_likes_select ON story_likes FOR SELECT USING (true);
CREATE POLICY story_likes_insert ON story_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY story_likes_delete ON story_likes FOR DELETE USING (auth.uid() = user_id);

-- Full replica identity so DELETE events carry the old row (story_id)
-- needed by the client realtime handler to decrement like counts.
ALTER TABLE story_likes  REPLICA IDENTITY FULL;
ALTER TABLE story_views  REPLICA IDENTITY FULL;

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE story_likes;
