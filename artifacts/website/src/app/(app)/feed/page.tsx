"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, MessageSquare, Share2, CheckCircle, TrendingUp, Users, Zap } from "lucide-react";
import { createClient } from "../../../lib/supabase/client";
import { useAuthOptional } from "../../../contexts/AuthContext";

type Post = {
  id: string;
  author_id: string;
  content: string | null;
  image_url: string | null;
  video_url: string | null;
  post_type: string | null;
  created_at: string;
  like_count: number | null;
  view_count: number | null;
  profiles: {
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
    is_verified: boolean | null;
    current_grade: string | null;
  } | null;
};

type TrendingUser = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
  current_grade: string | null;
  xp: number | null;
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Avatar({ url, name, size = 10 }: { url?: string | null; name?: string | null; size?: number }) {
  return (
    <div
      className="flex flex-none items-center justify-center overflow-hidden rounded-full bg-[#e8e2d6] font-semibold text-[#5a5040]"
      style={{ width: size * 4, height: size * 4, fontSize: size < 10 ? 12 : 14 }}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        (name ?? "?").slice(0, 1).toUpperCase()
      )}
    </div>
  );
}

function VerifiedBadge() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#1f95ff" className="flex-none">
      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function PostCard({ post }: { post: Post }) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.like_count ?? 0);
  const auth = useAuthOptional();
  const supabase = createClient();

  async function handleLike() {
    if (!auth?.user) {
      window.location.href = "/login?next=/feed";
      return;
    }
    if (liked) return;
    setLiked(true);
    setLikeCount((c) => c + 1);
    await supabase.from("acknowledgments").insert({ post_id: post.id, user_id: auth.user.id });
  }

  return (
    <article className="rounded-2xl border border-[#ddd7c9] bg-[#ede8dc] transition hover:shadow-md">
      <div className="p-4">
        <div className="mb-3 flex items-start gap-3">
          <Link href={`/u/${post.profiles?.handle}`}>
            <Avatar url={post.profiles?.avatar_url} name={post.profiles?.display_name} size={10} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <Link
                href={`/u/${post.profiles?.handle}`}
                className="text-sm font-semibold text-[#000] hover:text-[#1f95ff] transition"
              >
                {post.profiles?.display_name ?? "Unknown"}
              </Link>
              {post.profiles?.is_verified && <VerifiedBadge />}
              <span className="text-xs text-[#8c7f6a]">
                @{post.profiles?.handle ?? "unknown"}
              </span>
              <span className="text-xs text-[#8c7f6a]">·</span>
              <span className="text-xs text-[#8c7f6a]">{timeAgo(post.created_at)}</span>
            </div>
            {post.profiles?.current_grade && (
              <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-[#e8e2d6] px-2 py-0.5 text-[10px] font-medium text-[#5a5040]">
                <Zap size={9} />
                {post.profiles.current_grade}
              </span>
            )}
          </div>
        </div>

        {post.content && (
          <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-[#000]">
            {post.content}
          </p>
        )}

        {post.image_url && (
          <div className="mb-3 overflow-hidden rounded-xl border border-[#ddd7c9]">
            <img
              src={post.image_url}
              alt=""
              className="max-h-[480px] w-full object-cover"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 border-t border-[#ddd7c9] px-4 py-2.5">
        <button
          onClick={handleLike}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            liked
              ? "bg-red-50 text-red-500"
              : "text-[#5a5040] hover:bg-[#e8e2d6] hover:text-red-400"
          }`}
        >
          <Heart size={14} className={liked ? "fill-current" : ""} />
          {likeCount > 0 && <span>{likeCount.toLocaleString()}</span>}
          <span>Like</span>
        </button>
        <button className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[#5a5040] transition hover:bg-[#e8e2d6]">
          <MessageSquare size={14} />
          <span>Reply</span>
        </button>
        <button className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[#5a5040] transition hover:bg-[#e8e2d6]">
          <Share2 size={14} />
          <span>Share</span>
        </button>
        {(post.view_count ?? 0) > 0 && (
          <span className="ml-auto flex items-center gap-1 text-xs text-[#8c7f6a]">
            <TrendingUp size={12} />
            {(post.view_count ?? 0).toLocaleString()} views
          </span>
        )}
      </div>
    </article>
  );
}

function RightPanel({ trendingUsers }: { trendingUsers: TrendingUser[] }) {
  const auth = useAuthOptional();
  const user = auth?.user ?? null;

  return (
    <aside className="w-72 flex-none border-l border-[#ddd7c9] bg-[#f5f0e8]">
      <div className="sticky top-0 overflow-y-auto" style={{ maxHeight: "100vh" }}>
        {!user && (
          <div className="m-4 rounded-2xl border border-[#ddd7c9] bg-[#ede8dc] p-5">
            <h3 className="mb-1.5 text-sm font-bold text-[#000]">Join AfuChat</h3>
            <p className="mb-4 text-xs text-[#5a5040] leading-relaxed">
              Sign in to like posts, follow creators, send messages, and earn rewards.
            </p>
            <Link
              href="/login"
              className="mb-2 flex w-full items-center justify-center rounded-xl bg-[#1f95ff] py-2.5 text-sm font-semibold text-white transition hover:bg-[#1a7fd4]"
            >
              Sign in
            </Link>
            <Link
              href="/login?mode=signup"
              className="flex w-full items-center justify-center rounded-xl border border-[#ddd7c9] py-2.5 text-sm font-semibold text-[#5a5040] transition hover:bg-[#e8e2d6]"
            >
              Create account
            </Link>
          </div>
        )}

        {trendingUsers.length > 0 && (
          <div className="m-4 rounded-2xl border border-[#ddd7c9] bg-[#ede8dc] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#000]">Top Creators</h3>
              <Link href="/explore" className="text-xs text-[#1f95ff] hover:underline">
                See all
              </Link>
            </div>
            <div className="space-y-3">
              {trendingUsers.map((u) => (
                <Link key={u.id} href={`/u/${u.handle}`} className="flex items-center gap-2.5 group">
                  <div
                    className="flex flex-none items-center justify-center overflow-hidden rounded-full bg-[#e8e2d6] text-xs font-semibold text-[#5a5040]"
                    style={{ width: 36, height: 36 }}
                  >
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (u.display_name ?? "?").slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <p className="truncate text-xs font-semibold text-[#000] group-hover:text-[#1f95ff] transition">
                        {u.display_name}
                      </p>
                      {u.is_verified && <CheckCircle size={11} className="flex-none text-[#1f95ff]" />}
                    </div>
                    <p className="truncate text-[11px] text-[#8c7f6a]">@{u.handle}</p>
                  </div>
                  <span className="flex-none text-[11px] font-medium text-[#5a5040]">
                    {(u.xp ?? 0).toLocaleString()} XP
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="m-4 rounded-2xl border border-[#ddd7c9] bg-[#ede8dc] p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#000]">
            <Users size={15} />
            AfuChat Desktop
          </h3>
          <p className="text-xs text-[#5a5040] leading-relaxed">
            The full AfuChat experience — messaging, posts, stories, wallet, and AI — right in your browser.
          </p>
          <div className="mt-3 border-t border-[#ddd7c9] pt-3 text-xs text-[#8c7f6a]">
            Download the mobile app for the complete experience including video calls and stories.
          </div>
        </div>
      </div>
    </aside>
  );
}

export default function FeedPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [trendingUsers, setTrendingUsers] = useState<TrendingUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    async function load() {
      const [postsRes, usersRes] = await Promise.all([
        supabase
          .from("posts")
          .select(
            `id, author_id, content, image_url, video_url, post_type, created_at, like_count, view_count,
             profiles!posts_author_id_fkey(display_name, handle, avatar_url, is_verified, current_grade)`,
          )
          .eq("visibility", "public")
          .order("created_at", { ascending: false })
          .limit(40),
        supabase
          .from("profiles")
          .select("id, handle, display_name, avatar_url, is_verified, current_grade, xp")
          .order("xp", { ascending: false })
          .limit(8),
      ]);

      if (!mounted) return;
      if (!postsRes.error && postsRes.data) setPosts(postsRes.data as unknown as Post[]);
      if (!usersRes.error && usersRes.data) setTrendingUsers(usersRes.data as TrendingUser[]);
      setLoading(false);
    }

    load();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-4 py-6">
          <div className="mb-5 flex items-center justify-between">
            <h1 className="text-xl font-bold text-[#000]">Feed</h1>
            <span className="text-xs text-[#8c7f6a]">Public posts</span>
          </div>

          {loading && (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-40 animate-pulse rounded-2xl bg-[#e8e2d6]" />
              ))}
            </div>
          )}

          {!loading && posts.length === 0 && (
            <div className="rounded-2xl border border-[#ddd7c9] bg-[#ede8dc] p-10 text-center">
              <p className="text-sm text-[#5a5040]">No public posts yet.</p>
            </div>
          )}

          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </div>
      </div>

      <RightPanel trendingUsers={trendingUsers} />
    </div>
  );
}
