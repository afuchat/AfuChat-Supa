"use client";

import { useEffect, useState } from "react";
import { Heart, MessageSquare } from "lucide-react";
import { createClient } from "../../../lib/supabase/client";

type Post = {
  id: string;
  author_id: string;
  content: string | null;
  image_url: string | null;
  created_at: string;
  like_count: number | null;
  profiles: {
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
    is_verified: boolean | null;
  } | null;
};

export default function FeedPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("posts")
        .select(
          `id, author_id, content, image_url, created_at, like_count,
           profiles!posts_author_id_fkey(display_name, handle, avatar_url, is_verified)`,
        )
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(30);
      if (!mounted) return;
      if (!error && data) setPosts(data as unknown as Post[]);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl py-8">
        <h1 className="mb-6 px-4 text-xl font-semibold text-[#14161a]">Feed</h1>

        {loading && <p className="px-4 text-sm text-[#6b7280]">Loading posts…</p>}
        {!loading && posts.length === 0 && (
          <p className="px-4 text-sm text-[#6b7280]">No public posts yet.</p>
        )}

        <div className="space-y-3 px-4">
          {posts.map((post) => (
            <article key={post.id} className="rounded-xl border border-black/5 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2.5">
                <div className="flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-full bg-black/5 text-xs font-semibold text-[#4b5563]">
                  {post.profiles?.avatar_url ? (
                    <img src={post.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (post.profiles?.display_name ?? "?").slice(0, 1).toUpperCase()
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-[#14161a]">
                    {post.profiles?.display_name ?? "Unknown"}
                  </p>
                  <p className="text-xs text-[#6b7280]">
                    @{post.profiles?.handle ?? "unknown"} · {new Date(post.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {post.content && (
                <p className="mb-3 whitespace-pre-wrap text-sm text-[#14161a]">{post.content}</p>
              )}
              {post.image_url && (
                <img src={post.image_url} alt="" className="mb-3 max-h-96 w-full rounded-lg object-cover" />
              )}

              <div className="flex items-center gap-5 text-xs text-[#6b7280]">
                <span className="flex items-center gap-1.5">
                  <Heart size={14} /> {post.like_count ?? 0}
                </span>
                <span className="flex items-center gap-1.5">
                  <MessageSquare size={14} /> Reply
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
