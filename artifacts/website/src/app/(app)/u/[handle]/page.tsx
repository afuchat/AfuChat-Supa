"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";
import { CheckCircle, Heart, MessageSquare, Zap, Calendar, MapPin, Star, ArrowLeft } from "lucide-react";
import { createClient } from "../../../../lib/supabase/client";

type ProfileData = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean | null;
  is_organization_verified: boolean | null;
  xp: number | null;
  acoin: number | null;
  current_grade: string | null;
  country: string | null;
  created_at: string | null;
};

type Post = {
  id: string;
  content: string | null;
  image_url: string | null;
  created_at: string;
  like_count: number | null;
  view_count: number | null;
};

type Stats = {
  followers: number;
  following: number;
  posts: number;
};

const GRADE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Newcomer: { bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-200" },
  Bronze: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  Silver: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" },
  Gold: { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-200" },
  Platinum: { bg: "bg-sky-100", text: "text-sky-700", border: "border-sky-200" },
  Diamond: { bg: "bg-violet-100", text: "text-violet-700", border: "border-violet-200" },
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

export default function UserProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState<Stats>({ followers: 0, following: 0, posts: 0 });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!handle) return;
    const supabase = createClient();
    let mounted = true;

    async function load() {
      const { data: profileData, error } = await supabase
        .from("profiles")
        .select(
          "id, handle, display_name, avatar_url, bio, is_verified, is_organization_verified, xp, acoin, current_grade, country, created_at",
        )
        .eq("handle", handle.toLowerCase())
        .single();

      if (!mounted) return;

      if (error || !profileData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setProfile(profileData as ProfileData);

      const [postsRes, followersRes, followingRes, postsCountRes] = await Promise.all([
        supabase
          .from("posts")
          .select("id, content, image_url, created_at, like_count, view_count")
          .eq("author_id", profileData.id)
          .eq("visibility", "public")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("following_id", profileData.id),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("follower_id", profileData.id),
        supabase
          .from("posts")
          .select("*", { count: "exact", head: true })
          .eq("author_id", profileData.id)
          .eq("visibility", "public"),
      ]);

      if (!mounted) return;
      if (!postsRes.error && postsRes.data) setPosts(postsRes.data as Post[]);
      setStats({
        followers: followersRes.count ?? 0,
        following: followingRes.count ?? 0,
        posts: postsCountRes.count ?? 0,
      });
      setLoading(false);
    }

    load();
    return () => { mounted = false; };
  }, [handle]);

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="h-32 animate-pulse rounded-2xl bg-[#e8e2d6] mb-4" />
          <div className="h-20 animate-pulse rounded-2xl bg-[#e8e2d6] mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-[#e8e2d6]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-xl font-bold text-[#000]">User not found</p>
        <p className="text-sm text-[#5a5040]">@{handle} does not exist on AfuChat.</p>
        <Link href="/explore" className="rounded-xl bg-[#1f95ff] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1a7fd4]">
          Explore users
        </Link>
      </div>
    );
  }

  const grade = profile.current_grade ?? "Newcomer";
  const gradeStyle = GRADE_COLORS[grade] ?? GRADE_COLORS.Newcomer;
  const joinDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/explore" className="mb-4 flex items-center gap-1.5 text-sm text-[#5a5040] hover:text-[#000] transition">
          <ArrowLeft size={15} />
          Back to Explore
        </Link>

        <div className="mb-4 h-36 overflow-hidden rounded-2xl bg-gradient-to-br from-[#1f95ff]/20 via-[#ddd7c9] to-[#e8e2d6]" />

        <div className="-mt-14 mb-4 flex items-end justify-between px-2">
          <div
            className="flex items-center justify-center overflow-hidden rounded-2xl border-4 border-[#f5f0e8] bg-[#e8e2d6] text-2xl font-bold text-[#5a5040] shadow-md"
            style={{ width: 80, height: 80 }}
          >
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              (profile.display_name ?? "?").slice(0, 1).toUpperCase()
            )}
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${gradeStyle.bg} ${gradeStyle.text} ${gradeStyle.border}`}
            >
              <Star size={11} />
              {grade}
            </span>
          </div>
        </div>

        <div className="mb-4 px-2">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#000]">{profile.display_name ?? handle}</h1>
            {(profile.is_verified || profile.is_organization_verified) && (
              <CheckCircle size={18} className="flex-none text-[#1f95ff]" />
            )}
          </div>
          <p className="text-sm text-[#8c7f6a]">@{profile.handle}</p>

          {profile.bio && (
            <p className="mt-2.5 text-sm leading-relaxed text-[#000]">{profile.bio}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[#5a5040]">
            {profile.country && (
              <span className="flex items-center gap-1">
                <MapPin size={12} />
                {profile.country}
              </span>
            )}
            {joinDate && (
              <span className="flex items-center gap-1">
                <Calendar size={12} />
                Joined {joinDate}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Zap size={12} className="text-[#1f95ff]" />
              <strong className="text-[#000]">{(profile.xp ?? 0).toLocaleString()}</strong> XP
            </span>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-3 divide-x divide-[#ddd7c9] overflow-hidden rounded-2xl border border-[#ddd7c9] bg-[#ede8dc]">
          {[
            { label: "Posts", value: stats.posts },
            { label: "Followers", value: stats.followers },
            { label: "Following", value: stats.following },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col items-center py-4">
              <span className="text-xl font-bold text-[#000]">{value.toLocaleString()}</span>
              <span className="text-xs text-[#8c7f6a]">{label}</span>
            </div>
          ))}
        </div>

        <div className="mb-4">
          <h2 className="text-sm font-bold text-[#000]">
            Posts {stats.posts > 0 && <span className="text-[#8c7f6a] font-normal">({stats.posts})</span>}
          </h2>
        </div>

        {posts.length === 0 && (
          <div className="rounded-2xl border border-[#ddd7c9] bg-[#ede8dc] p-10 text-center">
            <p className="text-sm text-[#5a5040]">No public posts yet.</p>
          </div>
        )}

        <div className="space-y-4">
          {posts.map((post) => (
            <article key={post.id} className="rounded-2xl border border-[#ddd7c9] bg-[#ede8dc] p-4">
              {post.content && (
                <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-[#000]">
                  {post.content}
                </p>
              )}
              {post.image_url && (
                <div className="mb-3 overflow-hidden rounded-xl border border-[#ddd7c9]">
                  <img src={post.image_url} alt="" className="max-h-96 w-full object-cover" />
                </div>
              )}
              <div className="flex items-center gap-4 text-xs text-[#8c7f6a]">
                <span className="flex items-center gap-1">
                  <Heart size={12} />
                  {(post.like_count ?? 0).toLocaleString()}
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquare size={12} />
                  Reply
                </span>
                <span className="ml-auto">{timeAgo(post.created_at)}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
