"use client";

import { useEffect, useState, useCallback } from "react";
import { Heart, MessageSquare, Share2, Eye, Sparkles, ArrowRight } from "lucide-react";
import Link from "next/link";
import { createClient } from "../../../lib/supabase/client";
import { useAuthOptional } from "../../../contexts/AuthContext";
import { useAuthModalOptional } from "../../../contexts/AuthModalContext";

type Post = {
  id: string;
  author_id: string;
  content: string | null;
  image_url: string | null;
  created_at: string;
  like_count: number | null;
  view_count: number | null;
  profiles: {
    id: string | null;
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
    is_verified: boolean | null;
    current_grade: string | null;
  } | null;
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

const GRADE_COLORS: Record<string, string> = {
  Newcomer:      "bg-gray-100 text-gray-500",
  Bronze:        "bg-amber-100 text-amber-700",
  Silver:        "bg-slate-100 text-slate-600",
  Gold:          "bg-yellow-100 text-yellow-700",
  Platinum:      "bg-sky-100 text-sky-700",
  Diamond:       "bg-violet-100 text-violet-700",
  "Elite Creator": "bg-rose-100 text-rose-700",
  Legend:        "bg-purple-100 text-purple-700",
};

// ─── Join banner (shown only to logged-out visitors) ──────────────────────────
function JoinBanner({ onSignIn, onSignUp }: { onSignIn: () => void; onSignUp: () => void }) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl border border-[#1f95ff]/20 bg-gradient-to-br from-[#1f95ff]/8 via-[#f5f0e8] to-[#ede8dc] p-6">
      <div className="relative z-10 flex items-center justify-between gap-6">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[#1f95ff]">
            <Sparkles size={12} />
            Welcome to AfuChat
          </div>
          <h2 className="text-[15px] font-bold text-[#000]">
            Like, comment, follow creators &amp; earn rewards
          </h2>
          <p className="mt-0.5 text-xs text-[#8c7f6a]">
            Join free — it takes under 30 seconds.
          </p>
        </div>
        <div className="flex flex-none items-center gap-2">
          <button
            onClick={onSignUp}
            className="flex items-center gap-1.5 rounded-xl bg-[#1f95ff] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#1a7fd4]"
          >
            Join free <ArrowRight size={12} />
          </button>
          <button
            onClick={onSignIn}
            className="rounded-xl border border-[#ddd7c9] bg-white/80 px-4 py-2.5 text-xs font-semibold text-[#5a5040] transition hover:bg-white"
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Right sidebar: top creators + join CTA ───────────────────────────────────
function RightSidebar({
  user, onSignIn, onSignUp,
}: {
  user: boolean; onSignIn: () => void; onSignUp: () => void;
}) {
  const [creators, setCreators] = useState<{ id: string; handle: string | null; display_name: string | null; avatar_url: string | null; xp: number | null; is_verified: boolean | null }[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url, xp, is_verified")
      .order("xp", { ascending: false })
      .limit(7)
      .then(({ data }) => { if (data) setCreators(data); });
  }, []);

  return (
    <div className="hidden w-72 flex-none space-y-4 xl:block">
      {/* Join CTA for guests */}
      {!user && (
        <div className="rounded-2xl border border-[#ddd7c9] bg-[#ede8dc] p-5">
          <p className="mb-1 text-sm font-bold text-[#000]">Join AfuChat</p>
          <p className="mb-4 text-xs text-[#8c7f6a]">
            Sign in to like posts, follow creators, send messages, and earn rewards.
          </p>
          <div className="space-y-2">
            <button
              onClick={onSignUp}
              className="w-full rounded-xl bg-[#1f95ff] py-2.5 text-xs font-bold text-white transition hover:bg-[#1a7fd4]"
            >
              Create account
            </button>
            <button
              onClick={onSignIn}
              className="w-full rounded-xl border border-[#ddd7c9] bg-white py-2.5 text-xs font-semibold text-[#5a5040] transition hover:bg-[#f5f0e8]"
            >
              Sign in
            </button>
          </div>
        </div>
      )}

      {/* Top Creators */}
      {creators.length > 0 && (
        <div className="rounded-2xl border border-[#ddd7c9] bg-[#ede8dc] p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold text-[#000]">Top Creators</p>
            <Link href="/explore" className="text-[10px] font-semibold text-[#1f95ff] hover:underline">
              See all
            </Link>
          </div>
          <div className="space-y-3">
            {creators.map((c) => (
              <Link
                key={c.id}
                href={`/u/${c.handle}`}
                className="flex items-center gap-2.5 rounded-lg p-1.5 transition hover:bg-[#e8e2d6]"
              >
                <div className="flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-full bg-[#e8e2d6] text-xs font-bold text-[#5a5040]">
                  {c.avatar_url
                    ? <img src={c.avatar_url} alt="" className="h-full w-full object-cover" />
                    : (c.display_name ?? "?")[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <p className="truncate text-xs font-semibold text-[#000]">{c.display_name}</p>
                    {c.is_verified && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1f95ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                    )}
                  </div>
                  <p className="text-[10px] text-[#8c7f6a]">{(c.xp ?? 0).toLocaleString()} XP</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Post card ────────────────────────────────────────────────────────────────
function PostCard({
  post, isLoggedIn,
  onLike, onReply, onShare,
}: {
  post: Post; isLoggedIn: boolean;
  onLike: (postId: string) => void;
  onReply: (postId: string) => void;
  onShare: (postId: string) => void;
}) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.like_count ?? 0);

  const grade = post.profiles?.current_grade;
  const gradeClass = grade ? (GRADE_COLORS[grade] ?? "bg-gray-100 text-gray-500") : null;

  function handleLike() {
    if (!isLoggedIn) { onLike(post.id); return; }
    setLiked((v) => !v);
    setLikeCount((n) => liked ? n - 1 : n + 1);
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-[#ddd7c9] bg-[#ede8dc] transition hover:border-[#c8c0b4]">
      {/* Author row */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <Link href={`/u/${post.profiles?.handle}`} className="flex-none">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[#e8e2d6] text-sm font-bold text-[#5a5040] transition hover:ring-2 hover:ring-[#1f95ff]/30">
            {post.profiles?.avatar_url
              ? <img src={post.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
              : (post.profiles?.display_name ?? "?")[0].toUpperCase()}
          </div>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link
              href={`/u/${post.profiles?.handle}`}
              className="text-sm font-bold text-[#000] hover:text-[#1f95ff] transition"
            >
              {post.profiles?.display_name ?? "Unknown"}
            </Link>
            {post.profiles?.is_verified && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1f95ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            )}
            {gradeClass && (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${gradeClass}`}>
                {grade}
              </span>
            )}
          </div>
          <p className="text-xs text-[#8c7f6a]">
            @{post.profiles?.handle ?? "unknown"} · {timeAgo(post.created_at)}
          </p>
        </div>
      </div>

      {/* Content */}
      {post.content && (
        <p className="px-4 pb-3 text-sm leading-relaxed text-[#000] whitespace-pre-wrap">
          {post.content}
        </p>
      )}
      {post.image_url && (
        <div className="mx-4 mb-3 overflow-hidden rounded-xl border border-[#ddd7c9]">
          <img src={post.image_url} alt="" className="max-h-[480px] w-full object-cover" />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 border-t border-[#ddd7c9]/60 px-3 py-2">
        {/* Like */}
        <button
          onClick={handleLike}
          className={`group flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition ${
            liked
              ? "text-rose-500 bg-rose-50"
              : "text-[#8c7f6a] hover:bg-[#e8e2d6] hover:text-rose-500"
          }`}
        >
          <Heart size={14} className={liked ? "fill-current" : "group-hover:scale-110 transition-transform"} />
          <span>{likeCount > 0 ? likeCount.toLocaleString() : "Like"}</span>
        </button>

        {/* Reply */}
        <button
          onClick={() => onReply(post.id)}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-[#8c7f6a] transition hover:bg-[#e8e2d6] hover:text-[#1f95ff]"
        >
          <MessageSquare size={14} />
          <span>Reply</span>
        </button>

        {/* Share */}
        <button
          onClick={() => onShare(post.id)}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-[#8c7f6a] transition hover:bg-[#e8e2d6] hover:text-[#000]"
        >
          <Share2 size={14} />
          <span>Share</span>
        </button>

        {/* View count */}
        {(post.view_count ?? 0) > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-[#b0a898]">
            <Eye size={11} />
            {(post.view_count ?? 0).toLocaleString()}
          </span>
        )}
      </div>
    </article>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function FeedPage() {
  const [posts, setPosts]     = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const auth      = useAuthOptional();
  const authModal = useAuthModalOptional();
  const user      = auth?.user ?? null;

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("posts")
        .select(
          `id, author_id, content, image_url, created_at, like_count, view_count,
           profiles!posts_author_id_fkey(id, display_name, handle, avatar_url, is_verified, current_grade)`,
        )
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(40);
      if (!mounted) return;
      if (!error && data) setPosts(data as unknown as Post[]);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const handleLike  = useCallback((id: string) => {
    void id;
    authModal?.openAuth("signin", "like");
  }, [authModal]);

  const handleReply = useCallback((id: string) => {
    void id;
    authModal?.openAuth("signin", "reply");
  }, [authModal]);

  const handleShare = useCallback((_id: string) => {
    authModal?.openAuth("signin", "share");
  }, [authModal]);

  const openSignIn  = useCallback(() => authModal?.openAuth("signin", "default"), [authModal]);
  const openSignUp  = useCallback(() => authModal?.openAuth("signup", "default"), [authModal]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl gap-8 px-6 py-8">
        {/* Main feed column */}
        <div className="min-w-0 flex-1">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-[#000]">Feed</h1>
              <p className="text-xs text-[#8c7f6a]">Public posts from the AfuChat community</p>
            </div>
          </div>

          {/* Guest join banner */}
          {!user && !loading && (
            <JoinBanner onSignIn={openSignIn} onSignUp={openSignUp} />
          )}

          {loading && (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-44 animate-pulse rounded-2xl bg-[#e8e2d6]" />
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
              <PostCard
                key={post.id}
                post={post}
                isLoggedIn={!!user}
                onLike={handleLike}
                onReply={handleReply}
                onShare={handleShare}
              />
            ))}
          </div>
        </div>

        {/* Right sidebar */}
        <RightSidebar
          user={!!user}
          onSignIn={openSignIn}
          onSignUp={openSignUp}
        />
      </div>
    </div>
  );
}
