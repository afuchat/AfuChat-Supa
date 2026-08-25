import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function storagePath(mediaUrl: string): string | null {
  const marker = "/stories/";
  const index = mediaUrl.indexOf(marker);
  return index === -1 ? null : decodeURIComponent(mediaUrl.slice(index + marker.length));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({});

  try {
    const { data: stories, error: readError } = await admin
      .from("stories")
      .select("id, media_url")
      .not("expires_at", "is", null)
      .lte("expires_at", new Date().toISOString());

    if (readError) throw readError;
    if (!stories?.length) return json({ success: true, deleted: 0, storage_deleted: 0 });

    const paths = stories
      .map((story) => storagePath(story.media_url))
      .filter((path): path is string => Boolean(path));

    let storageDeleted = 0;
    for (let index = 0; index < paths.length; index += 100) {
      const batch = paths.slice(index, index + 100);
      const { error } = await admin.storage.from("stories").remove(batch);
      if (error) console.error("[cleanup-expired-stories] storage cleanup failed", error);
      else storageDeleted += batch.length;
    }

    const ids = stories.map((story) => story.id);
    const { error: deleteError } = await admin.from("stories").delete().in("id", ids);
    if (deleteError) throw deleteError;

    return json({
      success: true,
      deleted: ids.length,
      storage_deleted: storageDeleted,
      message: "Expired stories permanently deleted",
    });
  } catch (error) {
    console.error("[cleanup-expired-stories]", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Cleanup failed" }, 500);
  }
});