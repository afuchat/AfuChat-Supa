"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Heart, MessageSquare, Share2, Eye, Repeat2,
  Search, Sparkles, Star, BadgeCheck, TrendingUp,
  ImageIcon, Smile, BarChart2, MapPin, Calendar,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "../../../lib/supabase/client";
import { useAuthOptional } from "../../../contexts/AuthContext";
import { useAuthModalOptional } from "../../../contexts/AuthModalContext";

/* ─── types ──────────────────────────────────────────────────────────────── */

type Post = {
  id: string;
  author_id: string;
  content: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  like_count: number | null;
  view_count: number | null;
  comment_count: number | null;
  profiles: {
    id: string | null;
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
    is_verified: boolean | null;
    current_grade: string | null;
  } | null;
};

type Creator = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  xp: number | null;
  is_verified: boolean | null;
  current_grade: string | null;
};

/* ─── helpers ────────────────────────────────────────────────────────────── */

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

const GRADE_COLORS: Record<string, { bg: string; text: string }> = {
  Newcomer:        { bg: "#f3f4f6", text: "#6b7280" },
  Bronze:          { bg: "#fef3c7", text: "#b45309" },
  Silver:          { bg: "#f1f5f9", text: "#475569" },
  Gold:            { bg: "#fefce8", text: "#a16207" },
  Platinum:        { bg: "#e0f2fe", text: "#0369a1" },
  Diamond:         { bg: "#f5f3ff", text: "#7c3aed" },
  "Elite Creator": { bg: "#fff1f2", text: "#be123c" },
  Legend:          { bg: "#fdf4ff", text: "#86198f" },
};

/* ─── Avatar ──────────────────────────────────────────────────────────────── */

function Avatar({
  url, name, size = 40, className = "",
}: {
  url?: string | null; name?: string | null; size?: number; className?: string;
}) {
  return (
    <div
      className={`flex flex-none items-center justify-center overflow-hidden rounded-full bg-[#e8e2d6] font-bold text-[#5a5040] ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36) }}
    >
      {url
        ? <img src={url} alt="" className="h-full w-full object-cover" />
        : (name ?? "?")[0].toUpperCase()}
    </div>
  );
}

/* ─── Composer ────────────────────────────────────────────────────────────── */

function Composer({ user, profile, onOpenAuth }: {
  user: boolean;
  profile: { display_name?: string | null; avatar_url?: string | null } | null;
  onOpenAuth: () => void;
}) {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  function handleFocus() {
    if (!user) { onOpenAuth(); taRef.current?.blur(); }
  }

  return (
    <div className="border-b border-[#e6e0d4] px-4 py-3">
      <div className="flex gap-3">
        <Avatar url={profile?.avatar_url} name={profile?.display_name ?? "A"} size={42} />
        <div className="min-w-0 flex-1">
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={handleFocus}
            placeholder="What's happening?"
            rows={2}
            className="w-full resize-none bg-transparent text-[15px] text-[#000] placeholder:text-[#8c7f6a] outline-none leading-snug"
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-0.5 text-[#1f95ff]">
              {[ImageIcon, Smile, BarChart2, MapPin, Calendar].map((Icon, i) => (
                <button
                  key={i}
                  onClick={!user ? onOpenAuth : undefined}
                  className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-[#1f95ff]/10"
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>
            <button
              onClick={!user ? onOpenAuth : undefined}
              disabled={user && !text.trim()}
              className="rounded-full bg-[#1f95ff] px-4 py-1.5 text-sm font-bold text-white transition hover:bg-[#1a7fd4] disabled:opacity-40"
            >
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── PostCard ────────────────────────────────────────────────────────────── */

function PostCard({
  post, isLoggedIn, onLike, onReply, onShare,
}: {
  post: Post; isLoggedIn: boolean;
  onLike: (id: string) => void;
  onReply: (id: string) => void;
  onShare: (id: string) => void;
}) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.like_count ?? 0);
  const [reposted, setReposted] = useState(false);

  const grade = post.profiles?.current_grade;
  const gradeStyle = grade ? GRADE_COLORS[grade] : null;

  function handleLike() {
    if (!isLoggedIn) { onLike(post.id); return; }
    setLiked((v) => !v);
    setLikeCount((n) => liked ? n - 1 : n + 1);
  }

  function handleRepost() {
    if (!isLoggedIn) { onLike(post.id); return; }
    setReposted((v) => !v);
  }

  const comments = post.comment_count ?? 0;
  const views = post.view_count ?? 0;

  return (
    <article className="flex gap-3 border-b border-[#e6e0d4] px-4 py-3.5 transition hover:bg-[#f0ebe2]/40 cursor-pointer">
      {/* Avatar */}
      <Link href={`/u/${post.profiles?.handle}`} className="flex-none" onClick={(e) => e.stopPropagation()}>
        <Avatar url={post.profiles?.avatar_url} name={post.profiles?.display_name} size={42} />
      </Link>

      <div className="min-w-0 flex-1">
        {/* Name row */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0">
          <Link
            href={`/u/${post.profiles?.handle}`}
            className="text-[14px] font-bold text-[#000] hover:underline truncate"
            onClick={(e) => e.stopPropagation()}
          >
            {post.profiles?.display_name ?? "Unknown"}
          </Link>
          {post.profiles?.is_verified && (
            <BadgeCheck size={15} className="flex-none text-[#1f95ff]" strokeWidth={2.5} />
          )}
          {gradeStyle && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-semibold"
              style={{ background: gradeStyle.bg, color: gradeStyle.text }}
            >
              <Star size={8} />
              {grade}
            </span>
          )}
          <span className="text-[13px] text-[#8c7f6a] truncate">
            @{post.profiles?.handle ?? "unknown"}
          </span>
          <span className="text-[13px] text-[#8c7f6a]">·</span>
          <span className="text-[13px] text-[#8c7f6a] flex-none">{timeAgo(post.created_at)}</span>
        </div>

        {/* Content */}
        {post.content && (
          <p className="mt-1 text-[14px] leading-[1.45] text-[#000] whitespace-pre-wrap break-words">
            {post.content}
          </p>
        )}

        {/* Image */}
        {post.image_url && (
          <div className="mt-2.5 overflow-hidden rounded-2xl border border-[#e6e0d4]">
            <img src={post.image_url} alt="" className="max-h-[400px] w-full object-cover" />
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex items-center justify-between max-w-[420px]">
          {/* Reply */}
          <button
            onClick={() => onReply(post.id)}
            className="group flex items-center gap-1.5 text-[#8c7f6a] transition hover:text-[#1f95ff]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full transition group-hover:bg-[#1f95ff]/10">
              <MessageSquare size={16} />
            </span>
            {comments > 0 && <span className="text-[13px] tabular-nums">{fmt(comments)}</span>}
          </button>

          {/* Repost */}
          <button
            onClick={handleRepost}
            className={`group flex items-center gap-1.5 transition ${reposted ? "text-green-500" : "text-[#8c7f6a] hover:text-green-500"}`}
          >
            <span className={`flex h-8 w-8 items-center justify-center rounded-full transition ${reposted ? "bg-green-50" : "group-hover:bg-green-50"}`}>
              <Repeat2 size={16} />
            </span>
          </button>

          {/* Like */}
          <button
            onClick={handleLike}
            className={`group flex items-center gap-1.5 transition ${liked ? "text-rose-500" : "text-[#8c7f6a] hover:text-rose-500"}`}
          >
            <span className={`flex h-8 w-8 items-center justify-center rounded-full transition ${liked ? "bg-rose-50" : "group-hover:bg-rose-50"}`}>
              <Heart size={16} className={liked ? "fill-current" : ""} />
            </span>
            {likeCount > 0 && <span className="text-[13px] tabular-nums">{fmt(likeCount)}</span>}
          </button>

          {/* Views */}
          {views > 0 && (
            <div className="flex items-center gap-1.5 text-[#8c7f6a]">
              <span className="flex h-8 w-8 items-center justify-center rounded-full">
                <Eye size={16} />
              </span>
              <span className="text-[13px] tabular-nums">{fmt(views)}</span>
            </div>
          )}

          {/* Share */}
          <button
            onClick={() => onShare(post.id)}
            className="group flex h-8 w-8 items-center justify-center rounded-full text-[#8c7f6a] transition hover:bg-[#1f95ff]/10 hover:text-[#1f95ff]"
          >
            <Share2 size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}

/* ─── Right sidebar ───────────────────────────────────────────────────────── */

function RightSidebar({
  user, onSignIn, onSignUp,
}: {
  user: boolean; onSignIn: () => void; onSignUp: () => void;
}) {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [stats, setStats] = useState({ totalPosts: 0, todayPosts: 0 });

  useEffect(() => {
    const supabase = createClient();
    // Top creators
    supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url, xp, is_verified, current_grade")
      .order("xp", { ascending: false })
      .limit(5)
      .then(({ data }) => { if (data) setCreators(data); });

    // Post stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("visibility", "public")
      .then(({ count }) => {
        if (count != null) setStats((s) => ({ ...s, totalPosts: count }));
      });
    supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("visibility", "public")
      .gte("created_at", todayStart.toISOString())
      .then(({ count }) => {
        if (count != null) setStats((s) => ({ ...s, todayPosts: count }));
      });
  }, []);

  return (
    <div className="hidden w-[340px] flex-none xl:block">
      <div className="sticky top-0 space-y-4 pt-1">
        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8c7f6a]" />
          <input
            readOnly
            onClick={() => {}}
            placeholder="Search AfuChat"
            className="w-full rounded-full border border-[#e6e0d4] bg-[#ede8dc] py-2.5 pl-10 pr-4 text-sm text-[#000] placeholder:text-[#8c7f6a] outline-none transition focus:border-[#1f95ff] focus:bg-white focus:ring-2 focus:ring-[#1f95ff]/15 cursor-text"
          />
        </div>

        {/* Join / Premium CTA */}
        {!user ? (
          <div className="rounded-2xl border border-[#ddd7c9] bg-[#ede8dc] p-5">
            <div className="mb-1 flex items-center gap-1.5">
              <Sparkles size={14} className="text-[#1f95ff]" />
              <p className="text-[15px] font-bold text-[#000]">New to AfuChat?</p>
            </div>
            <p className="mb-4 text-[13px] text-[#8c7f6a]">
              Sign up to follow creators, send messages, earn XP, and unlock rewards.
            </p>
            <div className="space-y-2">
              <button
                onClick={onSignUp}
                className="w-full rounded-full bg-[#1f95ff] py-2.5 text-[13px] font-bold text-white transition hover:bg-[#1a7fd4]"
              >
                Create account
              </button>
              <button
                onClick={onSignIn}
                className="w-full rounded-full border border-[#1f95ff] py-2.5 text-[13px] font-semibold text-[#1f95ff] transition hover:bg-[#1f95ff]/5"
              >
                Sign in
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#ddd7c9] bg-gradient-to-br from-[#1f95ff]/10 to-[#ede8dc] p-5">
            <p className="text-[13px] font-bold text-[#000]">Upgrade to Platinum</p>
            <p className="mt-0.5 mb-3 text-[12px] text-[#8c7f6a]">
              Boost your reach, unlock AI features, and earn 2× XP.
            </p>
            <button className="w-full rounded-full bg-[#1f95ff] py-2 text-[13px] font-bold text-white transition hover:bg-[#1a7fd4]">
              Upgrade
            </button>
          </div>
        )}

        {/* Trending stats */}
        <div className="rounded-2xl border border-[#ddd7c9] bg-[#ede8dc] p-5">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp size={14} className="text-[#1f95ff]" />
            <p className="text-[13px] font-bold text-[#000]">Community</p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[#8c7f6a]">Total public posts</span>
              <span className="text-[13px] font-bold text-[#000]">{fmt(stats.totalPosts)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[#8c7f6a]">Posted today</span>
              <span className="text-[13px] font-bold text-[#1f95ff]">{fmt(stats.todayPosts)}</span>
            </div>
          </div>
        </div>

        {/* Who to follow */}
        {creators.length > 0 && (
          <div className="rounded-2xl border border-[#ddd7c9] bg-[#ede8dc] p-5">
            <p className="mb-3 text-[15px] font-bold text-[#000]">Who to follow</p>
            <div className="space-y-1">
              {creators.map((c) => {
                const gradeStyle = c.current_grade ? GRADE_COLORS[c.current_grade] : null;
                return (
                  <Link
                    key={c.id}
                    href={`/u/${c.handle}`}
                    className="flex items-center gap-3 rounded-xl p-2.5 transition hover:bg-[#e8e2d6]"
                  >
                    <Avatar url={c.avatar_url} name={c.display_name} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 leading-tight">
                        <span className="truncate text-[13px] font-bold text-[#000]">{c.display_name}</span>
                        {c.is_verified && <BadgeCheck size={13} className="flex-none text-[#1f95ff]" strokeWidth={2.5} />}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[12px] text-[#8c7f6a]">@{c.handle}</span>
                        {gradeStyle && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-semibold"
                            style={{ background: gradeStyle.bg, color: gradeStyle.text }}
                          >
                            <Star size={8} />{c.current_grade}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#8c7f6a]">{(c.xp ?? 0).toLocaleString()} XP</p>
                    </div>
                    <button
                      onClick={(e) => { e.preventDefault(); }}
                      className="flex-none rounded-full border border-[#000] px-3.5 py-1.5 text-[12px] font-bold text-[#000] transition hover:bg-[#000] hover:text-white"
                    >
                      Follow
                    </button>
                  </Link>
                );
              })}
            </div>
            <Link
              href="/explore"
              className="mt-2 block pt-2 text-[13px] font-medium text-[#1f95ff] hover:underline"
            >
              Show more
            </Link>
          </div>
        )}

        <p className="px-1 text-[11px] text-[#b0a898] leading-relaxed">
          © 2026 AfuChat Technologies Ltd · <a href="#" className="hover:underline">Terms</a> · <a href="#" className="hover:underline">Privacy</a>
        </p>
      </div>
    </div>
  );
}

/* ─── Skeleton ────────────────────────────────────────────────────────────── */

function Skeleton() {
  return (
    <div className="divide-y divide-[#e6e0d4]">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-3 px-4 py-3.5">
          <div className="h-10 w-10 flex-none animate-pulse rounded-full bg-[#e8e2d6]" />
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <div className="h-3.5 w-24 animate-pulse rounded bg-[#e8e2d6]" />
              <div className="h-3.5 w-16 animate-pulse rounded bg-[#e8e2d6]" />
            </div>
            <div className="h-3.5 w-full animate-pulse rounded bg-[#e8e2d6]" />
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-[#e8e2d6]" />
            <div className="mt-3 flex gap-8">
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-3 w-8 animate-pulse rounded bg-[#e8e2d6]" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────────── */

type Tab = "foryou" | "following";

export default function FeedPage() {
  const [posts, setPosts]   = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState<Tab>("foryou");

  const auth      = useAuthOptional();
  const authModal = useAuthModalOptional();
  const user      = auth?.user ?? null;
  const profile   = auth?.profile ?? null;

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("posts")
        .select(
          `id, author_id, content, image_url, created_at,
           like_count, view_count,
           profiles!posts_author_id_fkey(id, display_name, handle, avatar_url, is_verified, current_grade)`,
        )
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(60);
      if (!mounted) return;
      if (!error && data) setPosts(data as unknown as Post[]);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const handleLike  = useCallback(() => { authModal?.openAuth("signin", "like"); }, [authModal]);
  const handleReply = useCallback(() => { authModal?.openAuth("signin", "reply"); }, [authModal]);
  const handleShare = useCallback(() => { authModal?.openAuth("signin", "share"); }, [authModal]);
  const openSignIn  = useCallback(() => authModal?.openAuth("signin", "default"), [authModal]);
  const openSignUp  = useCallback(() => authModal?.openAuth("signup", "default"), [authModal]);

  return (
    <div className="h-full overflow-y-auto bg-[#f5f0e8]">
      <div className="mx-auto flex max-w-[1080px] gap-7 px-4 py-0">

        {/* ── Center column ─────────────────────────────────────────── */}
        <div className="min-w-0 flex-1 border-x border-[#e6e0d4]">

          {/* Tab bar */}
          <div className="sticky top-0 z-10 flex border-b border-[#e6e0d4] bg-[#f5f0e8]/90 backdrop-blur-sm">
            {(["foryou", "following"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="relative flex-1 py-4 text-[14px] font-semibold text-[#8c7f6a] transition hover:bg-[#ede8dc]/60"
              >
                <span className={tab === t ? "text-[#000]" : ""}>
                  {t === "foryou" ? "For you" : "Following"}
                </span>
                {tab === t && (
                  <span className="absolute bottom-0 left-1/2 h-[3px] w-14 -translate-x-1/2 rounded-full bg-[#1f95ff]" />
                )}
              </button>
            ))}
          </div>

          {/* Composer */}
          <Composer
            user={!!user}
            profile={profile}
            onOpenAuth={openSignUp}
          />

          {/* Feed */}
          {loading && <Skeleton />}

          {!loading && posts.length === 0 && (
            <div className="px-6 py-16 text-center">
              <p className="text-[14px] text-[#8c7f6a]">No public posts yet. Be the first!</p>
            </div>
          )}

          {!loading && tab === "following" && !user && (
            <div className="px-6 py-16 text-center">
              <p className="text-[15px] font-bold text-[#000] mb-2">Follow people to see their posts here</p>
              <p className="text-[13px] text-[#8c7f6a] mb-6">Sign in to follow creators and see a personalised feed.</p>
              <button
                onClick={openSignIn}
                className="rounded-full bg-[#1f95ff] px-6 py-2.5 text-[14px] font-bold text-white hover:bg-[#1a7fd4] transition"
              >
                Sign in
              </button>
            </div>
          )}

          {!loading && (tab === "foryou" || (tab === "following" && user)) && (
            <div>
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
              {posts.length > 0 && (
                <p className="py-8 text-center text-[12px] text-[#b0a898]">
                  You&apos;re all caught up · {posts.length} posts loaded
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Right sidebar ──────────────────────────────────────────── */}
        <RightSidebar
          user={!!user}
          onSignIn={openSignIn}
          onSignUp={openSignUp}
        />
      </div>
    </div>
  );
}
