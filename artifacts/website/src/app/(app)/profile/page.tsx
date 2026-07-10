"use client";

import { useAuth } from "../../../contexts/AuthContext";

export default function ProfilePage() {
  const { profile, user } = useAuth();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-4 py-10">
        <h1 className="mb-6 text-xl font-semibold text-text">Profile</h1>

        <div className="rounded-xl border border-border/60 bg-bg-secondary p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-4">
            <div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-full bg-bg-tertiary text-lg font-semibold text-text-secondary">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                (profile?.display_name ?? "?").slice(0, 1).toUpperCase()
              )}
            </div>
            <div>
              <p className="text-lg font-semibold text-text">{profile?.display_name}</p>
              <p className="text-sm text-text-secondary">@{profile?.handle}</p>
            </div>
          </div>

          {profile?.bio && <p className="mb-4 text-sm text-text">{profile.bio}</p>}

          <dl className="grid grid-cols-2 gap-4 border-t border-border/60 pt-4 text-sm">
            <div>
              <dt className="text-text-secondary">Email</dt>
              <dd className="text-text">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-text-secondary">XP</dt>
              <dd className="text-text">{profile?.xp ?? 0}</dd>
            </div>
            <div>
              <dt className="text-text-secondary">ACoin</dt>
              <dd className="text-text">{profile?.acoin ?? 0}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
