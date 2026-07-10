"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Newspaper, User, LogOut } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import Logo from "./Logo";

const NAV_ITEMS = [
  { href: "/chats", label: "Chats", icon: MessageCircle },
  { href: "/feed", label: "Feed", icon: Newspaper },
  { href: "/profile", label: "Profile", icon: User },
];

export default function Sidebar() {
  const { profile, signOut } = useAuth();
  const pathname = usePathname();

  return (
    <aside className="flex w-60 flex-none flex-col border-r border-border/60 bg-bg-secondary">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Logo size={28} />
        <span className="text-[15px] font-semibold">
          Afu<span className="text-brand">Chat</span>
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isActive ? "bg-brand/10 text-brand" : "text-text-secondary hover:bg-bg-tertiary"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border/60 p-3">
        <div className="flex items-center gap-2 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-full bg-bg-tertiary text-xs font-semibold text-text-secondary">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              (profile?.display_name ?? "?").slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text">
              {profile?.display_name ?? "Loading…"}
            </p>
            <p className="truncate text-xs text-text-secondary">
              {profile?.handle ? `@${profile.handle}` : ""}
            </p>
          </div>
          <button
            onClick={signOut}
            title="Sign out"
            className="rounded-lg p-1.5 text-text-secondary hover:bg-bg-tertiary hover:text-text"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
