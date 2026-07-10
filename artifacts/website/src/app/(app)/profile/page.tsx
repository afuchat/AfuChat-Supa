"use client";

import { CheckCircle, Zap, Coins, Star, Calendar } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import ClientAuthGuard from "../../../components/ClientAuthGuard";

const GRADE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Newcomer: { bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-200" },
  Bronze: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  Silver: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" },
  Gold: { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-200" },
  Platinum: { bg: "bg-sky-100", text: "text-sky-700", border: "border-sky-200" },
  Diamond: { bg: "bg-violet-100", text: "text-violet-700", border: "border-violet-200" },
};

export default function ProfilePage() {
  const { profile, user } = useAuth();

  const grade = profile?.current_grade ?? "Newcomer";
  const gradeStyle = GRADE_COLORS[grade] ?? GRADE_COLORS.Newcomer;
  const joinDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <ClientAuthGuard>
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-4 py-8">
        <h1 className="mb-6 text-xl font-bold text-[#000]">My Profile</h1>

        <div className="mb-4 h-32 overflow-hidden rounded-2xl bg-gradient-to-br from-[#1f95ff]/20 via-[#ddd7c9] to-[#e8e2d6]" />

        <div className="-mt-12 mb-5 flex items-end justify-between px-2">
          <div
            className="flex items-center justify-center overflow-hidden rounded-2xl border-4 border-[#f5f0e8] bg-[#e8e2d6] text-2xl font-bold text-[#5a5040] shadow"
            style={{ width: 72, height: 72 }}
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              (profile?.display_name ?? "?").slice(0, 1).toUpperCase()
            )}
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${gradeStyle.bg} ${gradeStyle.text} ${gradeStyle.border}`}
          >
            <Star size={11} />
            {grade}
          </span>
        </div>

        <div className="mb-5 px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-[#000]">
              {profile?.display_name ?? "Loading…"}
            </h2>
            {profile?.is_verified && (
              <CheckCircle size={17} className="flex-none text-[#1f95ff]" />
            )}
          </div>
          <p className="text-sm text-[#8c7f6a]">@{profile?.handle ?? ""}</p>
          {profile?.bio && (
            <p className="mt-2 text-sm text-[#5a5040] leading-relaxed">{profile.bio}</p>
          )}
          {joinDate && (
            <p className="mt-2 flex items-center gap-1 text-xs text-[#8c7f6a]">
              <Calendar size={11} />
              Joined {joinDate}
            </p>
          )}
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3">
          <div className="flex items-center gap-3 rounded-2xl border border-[#ddd7c9] bg-[#ede8dc] p-4">
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[#1f95ff]/10">
              <Zap size={18} className="text-[#1f95ff]" />
            </div>
            <div>
              <p className="text-xl font-bold text-[#000]">
                {(profile?.xp ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-[#5a5040]">Nexa (XP)</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-[#ddd7c9] bg-[#ede8dc] p-4">
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[#d4a853]/10">
              <Coins size={18} className="text-[#d4a853]" />
            </div>
            <div>
              <p className="text-xl font-bold text-[#000]">
                {(profile?.acoin ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-[#5a5040]">ACoin</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#ddd7c9] bg-[#ede8dc] p-5">
          <h3 className="mb-4 text-sm font-bold text-[#000]">Account Details</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-[#8c7f6a]">Email</dt>
              <dd className="font-medium text-[#000]">{user?.email}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-[#ddd7c9] pt-3">
              <dt className="text-[#8c7f6a]">Handle</dt>
              <dd className="font-medium text-[#000]">@{profile?.handle ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-[#ddd7c9] pt-3">
              <dt className="text-[#8c7f6a]">Verified</dt>
              <dd className="font-medium text-[#000]">{profile?.is_verified ? "✓ Verified" : "Not verified"}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-4 rounded-2xl border border-[#ddd7c9] bg-[#ede8dc] p-4 text-center">
          <p className="text-xs text-[#5a5040]">
            For the full profile experience including editing bio, avatar, wallet, stories, and settings — use the{" "}
            <strong>AfuChat mobile app</strong>.
          </p>
        </div>
      </div>
    </div>
    </ClientAuthGuard>
  );
}
