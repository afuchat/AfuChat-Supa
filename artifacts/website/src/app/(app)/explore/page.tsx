"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle, Zap, Search, Users, TrendingUp, Star } from "lucide-react";
import { createClient } from "../../../lib/supabase/client";

type ExploreUser = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean | null;
  is_organization_verified: boolean | null;
  xp: number | null;
  current_grade: string | null;
  country: string | null;
};

type PlatformStats = {
  totalUsers: number;
  recentPosts: number;
};

const GRADE_COLORS: Record<string, { bg: string; text: string }> = {
  Newcomer: { bg: "bg-gray-100", text: "text-gray-500" },
  Bronze: { bg: "bg-amber-100", text: "text-amber-700" },
  Silver: { bg: "bg-slate-100", text: "text-slate-600" },
  Gold: { bg: "bg-yellow-100", text: "text-yellow-700" },
  Platinum: { bg: "bg-sky-100", text: "text-sky-700" },
  Diamond: { bg: "bg-violet-100", text: "text-violet-700" },
};

function GradeBadge({ grade }: { grade?: string | null }) {
  if (!grade) return null;
  const c = GRADE_COLORS[grade] ?? GRADE_COLORS.Newcomer;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.bg} ${c.text}`}>
      <Star size={9} />
      {grade}
    </span>
  );
}

function UserCard({ user }: { user: ExploreUser }) {
  return (
    <Link
      href={`/u/${user.handle}`}
      className="group flex flex-col rounded-2xl border border-[#ddd7c9] bg-[#ede8dc] p-5 transition hover:shadow-md hover:border-[#1f95ff]/30"
    >
      <div className="mb-3 flex items-start justify-between">
        <div
          className="flex items-center justify-center overflow-hidden rounded-full bg-[#e8e2d6] text-base font-bold text-[#5a5040]"
          style={{ width: 52, height: 52 }}
        >
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            (user.display_name ?? "?").slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <GradeBadge grade={user.current_grade} />
          {user.country && (
            <span className="text-[10px] text-[#8c7f6a]">{user.country}</span>
          )}
        </div>
      </div>

      <div className="mb-2">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-bold text-[#000] group-hover:text-[#1f95ff] transition">
            {user.display_name ?? "Unknown"}
          </p>
          {(user.is_verified || user.is_organization_verified) && (
            <CheckCircle size={13} className="flex-none text-[#1f95ff]" />
          )}
        </div>
        <p className="text-xs text-[#8c7f6a]">@{user.handle ?? "unknown"}</p>
      </div>

      {user.bio && (
        <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-[#5a5040]">{user.bio}</p>
      )}

      <div className="mt-auto flex items-center gap-1 text-xs text-[#5a5040]">
        <Zap size={11} className="text-[#1f95ff]" />
        <span className="font-semibold text-[#000]">{(user.xp ?? 0).toLocaleString()}</span>
        <span>XP</span>
      </div>
    </Link>
  );
}

export default function ExplorePage() {
  const [users, setUsers] = useState<ExploreUser[]>([]);
  const [filtered, setFiltered] = useState<ExploreUser[]>([]);
  const [stats, setStats] = useState<PlatformStats>({ totalUsers: 0, recentPosts: 0 });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    async function load() {
      const [usersRes, usersCountRes, postsCountRes] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id, handle, display_name, avatar_url, bio, is_verified, is_organization_verified, xp, current_grade, country",
          )
          .order("xp", { ascending: false })
          .limit(50),
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase
          .from("posts")
          .select("*", { count: "exact", head: true })
          .eq("visibility", "public"),
      ]);

      if (!mounted) return;
      if (!usersRes.error && usersRes.data) {
        setUsers(usersRes.data as ExploreUser[]);
        setFiltered(usersRes.data as ExploreUser[]);
      }
      setStats({
        totalUsers: usersCountRes.count ?? 0,
        recentPosts: postsCountRes.count ?? 0,
      });
      setLoading(false);
    }

    load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setFiltered(users);
      return;
    }
    const q = query.toLowerCase();
    setFiltered(
      users.filter(
        (u) =>
          (u.display_name ?? "").toLowerCase().includes(q) ||
          (u.handle ?? "").toLowerCase().includes(q) ||
          (u.bio ?? "").toLowerCase().includes(q),
      ),
    );
  }, [query, users]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-8">
          <h1 className="mb-1 text-2xl font-bold text-[#000]">Explore AfuChat</h1>
          <p className="text-sm text-[#5a5040]">Discover creators, connect with people, and grow your network.</p>
        </div>


        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-[#ddd7c9] bg-[#ede8dc] px-4 py-3">
          <Search size={17} className="flex-none text-[#8c7f6a]" />
          <input
            type="text"
            placeholder="Search people by name, handle, or bio…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-[#000] outline-none placeholder:text-[#8c7f6a]"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-xs text-[#8c7f6a] hover:text-[#000]"
            >
              Clear
            </button>
          )}
        </div>

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#000]">
            {query ? `Results for "${query}"` : "Top Members by XP"}
          </h2>
          <span className="text-xs text-[#8c7f6a]">{filtered.length} people</span>
        </div>

        {loading && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl bg-[#e8e2d6]" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="rounded-2xl border border-[#ddd7c9] bg-[#ede8dc] p-10 text-center">
            <p className="text-sm text-[#5a5040]">
              {query ? "No users match your search." : "No users yet."}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {filtered.map((user) => (
            <UserCard key={user.id} user={user} />
          ))}
        </div>
      </div>
    </div>
  );
}
