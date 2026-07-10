"use client";

import { useAuth } from "../../../contexts/AuthContext";

export default function ProfilePage() {
  const { profile, user } = useAuth();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-4 py-10">
        <h1 className="mb-6 text-xl font-semibold text-[#14161a]">Profile</h1>

        <div className="rounded-xl border border-black/5 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-4">
            <div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-full bg-black/5 text-lg font-semibold text-[#4b5563]">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                (profile?.display_name ?? "?").slice(0, 1).toUpperCase()
              )}
            </div>
            <div>
              <p className="text-lg font-semibold text-[#14161a]">{profile?.display_name}</p>
              <p className="text-sm text-[#6b7280]">@{profile?.handle}</p>
            </div>
          </div>

          {profile?.bio && <p className="mb-4 text-sm text-[#14161a]">{profile.bio}</p>}

          <dl className="grid grid-cols-2 gap-4 border-t border-black/5 pt-4 text-sm">
            <div>
              <dt className="text-[#6b7280]">Email</dt>
              <dd className="text-[#14161a]">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-[#6b7280]">XP</dt>
              <dd className="text-[#14161a]">{profile?.xp ?? 0}</dd>
            </div>
            <div>
              <dt className="text-[#6b7280]">ACoin</dt>
              <dd className="text-[#14161a]">{profile?.acoin ?? 0}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
