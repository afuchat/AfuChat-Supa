"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Newspaper,
  Compass,
  MessageCircle,
  User,
  LogOut,
  Star,
  Lock,
} from "lucide-react";
import { useAuthOptional } from "../contexts/AuthContext";
import { useAuthModalOptional } from "../contexts/AuthModalContext";
import type { AuthReason } from "../contexts/AuthModalContext";
import Logo from "./Logo";

const NAV_MAIN = [
  { href: "/feed",    label: "Feed",    icon: Newspaper,      requiresAuth: false },
  { href: "/explore", label: "Explore", icon: Compass,         requiresAuth: false },
];

const NAV_WORKSPACE = [
  { href: "/chats",   label: "Chats",   icon: MessageCircle,  requiresAuth: true,  reason: "chat" as AuthReason },
];

const NAV_ACCOUNT = [
  { href: "/profile", label: "Profile", icon: User,            requiresAuth: true,  reason: "profile" as AuthReason },
];

function Avatar({ url, name, size = 8 }: { url?: string | null; name?: string | null; size?: number }) {
  const cls = `flex flex-none items-center justify-center overflow-hidden rounded-full bg-[#e8e2d6] font-semibold text-[#5a5040]`;
  const style = { width: `${size * 4}px`, height: `${size * 4}px`, fontSize: size < 10 ? "12px" : "15px" };
  return (
    <div className={cls} style={style}>
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        (name ?? "?").slice(0, 1).toUpperCase()
      )}
    </div>
  );
}

function GradeBadge({ grade }: { grade?: string | null }) {
  if (!grade) return null;
  const colors: Record<string, string> = {
    Newcomer: "bg-gray-100 text-gray-500",
    Bronze:   "bg-amber-100 text-amber-700",
    Silver:   "bg-slate-100 text-slate-600",
    Gold:     "bg-yellow-100 text-yellow-700",
    Platinum: "bg-sky-100 text-sky-700",
    Diamond:  "bg-violet-100 text-violet-700",
    Legend:   "bg-purple-100 text-purple-700",
  };
  const cls = colors[grade] ?? "bg-gray-100 text-gray-500";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      <Star size={9} />
      {grade}
    </span>
  );
}

export default function Sidebar() {
  const auth      = useAuthOptional();
  const authModal = useAuthModalOptional();
  const pathname  = usePathname();

  const user    = auth?.user    ?? null;
  const profile = auth?.profile ?? null;

  function NavLink({
    href, label, icon: Icon, requiresAuth, reason,
  }: {
    href: string; label: string; icon: React.ElementType;
    requiresAuth?: boolean; reason?: AuthReason;
  }) {
    const isActive = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
    const isLocked = requiresAuth && !user;

    function handleLockedClick(e: React.MouseEvent) {
      if (isLocked) {
        e.preventDefault();
        authModal?.openAuth("signin", reason ?? "default");
      }
    }

    return (
      <Link
        href={href}
        onClick={handleLockedClick}
        className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
          isActive
            ? "bg-[#1f95ff]/10 text-[#1f95ff]"
            : "text-[#5a5040] hover:bg-[#e8e2d6] hover:text-[#000]"
        }`}
      >
        <Icon
          size={18}
          className={`flex-none ${isActive ? "text-[#1f95ff]" : "text-[#8c7f6a] group-hover:text-[#5a5040]"}`}
        />
        <span className="flex-1">{label}</span>
        {isLocked && (
          <Lock size={11} className="flex-none text-[#b0a898]" />
        )}
      </Link>
    );
  }

  return (
    <aside className="flex w-64 flex-none flex-col border-r border-[#ddd7c9] bg-[#ede8dc]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Logo size={30} />
        <span className="text-[16px] font-bold tracking-tight">
          Afu<span className="text-[#1f95ff]">Chat</span>
        </span>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <nav className="space-y-0.5">
          {NAV_MAIN.map(({ href, label, icon }) => (
            <NavLink key={href} href={href} label={label} icon={icon} />
          ))}
        </nav>

        <div className="my-3 px-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#8c7f6a]">
            Workspace
          </p>
          <nav className="space-y-0.5">
            {NAV_WORKSPACE.map(({ href, label, icon, requiresAuth, reason }) => (
              <NavLink key={href} href={href} label={label} icon={icon} requiresAuth={requiresAuth} reason={reason} />
            ))}
          </nav>
        </div>

        {user && (
          <div className="my-3 px-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#8c7f6a]">
              Account
            </p>
            <nav className="space-y-0.5">
              {NAV_ACCOUNT.map(({ href, label, icon, requiresAuth, reason }) => (
                <NavLink key={href} href={href} label={label} icon={icon} requiresAuth={requiresAuth} reason={reason} />
              ))}
            </nav>
          </div>
        )}
      </div>

      {/* Bottom user card / CTA */}
      <div className="border-t border-[#ddd7c9] p-3">
        {user && profile ? (
          <div className="rounded-xl bg-[#e8e2d6]/60 p-3">
            <div className="mb-2.5 flex items-center gap-2.5">
              <Avatar url={profile.avatar_url} name={profile.display_name} size={9} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-semibold text-[#000]">
                    {profile.display_name ?? "User"}
                  </p>
                  {profile.is_verified && (
                    <span className="flex-none text-[#1f95ff]" title="Verified">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-[#8c7f6a]">@{profile.handle ?? ""}</p>
              </div>
            </div>
            <GradeBadge grade={(profile as Record<string, unknown>).current_grade as string | null} />
            <div className="mt-2.5 flex items-center justify-between text-xs text-[#8c7f6a]">
              <span>{(profile.xp ?? 0).toLocaleString()} XP</span>
              <button
                onClick={auth?.signOut}
                className="flex items-center gap-1 rounded-lg p-1 hover:bg-[#ddd7c9] hover:text-[#000] transition"
                title="Sign out"
              >
                <LogOut size={13} />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        ) : (
          /* Logged-out CTA — opens sheet, never navigates away */
          <div className="space-y-2">
            <button
              onClick={() => authModal?.openAuth("signin", "default")}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1f95ff] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1a7fd4]"
            >
              Sign in
            </button>
            <button
              onClick={() => authModal?.openAuth("signup", "default")}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#ddd7c9] bg-transparent px-4 py-2.5 text-sm font-semibold text-[#5a5040] transition hover:bg-[#e8e2d6]"
            >
              Create account
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
